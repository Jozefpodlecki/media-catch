import {
    matchRule,
    ruleAction,
    ruleTarget,
    rulesStorageKey,
    parseRulesDocument,
    redactRuleUrl,
    type RuleEvent,
    type RuleLog,
    type RulesRuntimeState,
    type SiteRule,
} from '../../shared/rules';
import { siteKeyForUrl } from '../../shared/settings';
import { errorMessage } from '../../shared/errors';
import { subscribeRuleEvents } from './events';
import { createRulesRepository } from './storage';
import { toggleElementWatch } from '../media/monitoring';
import { startConversion } from '../media/conversion';
import { downloadBlob, saveRemoteFile } from '../downloads';
import { beginAttempt, failAttempt } from '../history';

interface Session {
    origin: string;
    preview: boolean;
    rules: SiteRule[];
    seen: Set<string>;
    actions: number;
    pending: number;
    chain: Promise<void>;
}
const sessions = new Map<number, Session>();
const arming = new Map<number, { origin?: string }>();
const logs: { tabId: number; entry: RuleLog }[] = [];
let nextLogId = 1;
let repository: ReturnType<typeof createRulesRepository> | undefined;
export const ruleRepository = () => (repository ??= createRulesRepository(browser.storage.local));

function log(
    tabId: number,
    rule: SiteRule,
    event: RuleEvent,
    state: RuleLog['state'],
    message: string,
) {
    const display = redactRuleUrl(event.url);
    logs.unshift({
        tabId,
        entry: {
            id: nextLogId++,
            rule: rule.name,
            state,
            url: display.slice(0, 2000),
            message: message.slice(0, 500),
            time: new Date().toISOString(),
        },
    });
    if (logs.length > 100) logs.pop();
}
export function rulesState(tabId: number): { ok: true; runtime: RulesRuntimeState } {
    const session = sessions.get(tabId);
    return {
        ok: true,
        runtime: {
            armed: Boolean(session),
            preview: session?.preview ?? true,
            origin: session?.origin || '',
            actions: session?.actions || 0,
            pending: session?.pending || 0,
            log: logs.filter((item) => item.tabId === tabId).map((item) => ({ ...item.entry })),
        },
    };
}
export function disarmRules(tabId: number) {
    arming.delete(tabId);
    sessions.delete(tabId);
    void toggleElementWatch(tabId, false, 'rules').catch(() => {});
    return rulesState(tabId);
}
export function disarmOriginRules(origin: string) {
    for (const [tabId, session] of sessions) if (session.origin === origin) disarmRules(tabId);
    for (const [tabId, marker] of arming) if (marker.origin === origin) disarmRules(tabId);
}
export async function armRules(tabId: number, preview: boolean) {
    disarmRules(tabId);
    const marker: { origin?: string } = {};
    arming.set(tabId, marker);
    try {
        const tab = await browser.tabs.get(tabId);
        const origin = siteKeyForUrl(tab.url || '');
        if (!origin) throw new Error('Open rules from an HTTP(S) source webpage.');
        marker.origin = origin;
        const document = await ruleRepository().get();
        const rules = (document.sites[origin] || []).filter((rule) => rule.enabled);
        if (!rules.length)
            throw new Error('Save at least one enabled rule for this website first.');
        if (!(await browser.permissions.contains({ origins: ['http://*/*', 'https://*/*'] })))
            throw new Error('Grant website access before arming rules.');
        const current = await browser.tabs.get(tabId);
        if (arming.get(tabId) !== marker || current.url !== tab.url)
            throw new Error('Source changed while arming rules. Arm the current page again.');
        const session: Session = {
            origin,
            preview,
            rules,
            seen: new Set(),
            actions: 0,
            pending: 0,
            chain: Promise.resolve(),
        };
        sessions.set(tabId, session);
        if (rules.some((rule) => rule.trigger === 'dom'))
            await toggleElementWatch(tabId, true, 'rules');
        if (sessions.get(tabId) !== session) throw new Error('Rules were stopped while arming.');
        return rulesState(tabId);
    } catch (error) {
        if (arming.get(tabId) === marker) disarmRules(tabId);
        throw error;
    }
}
async function execute(session: Session, rule: SiteRule, event: RuleEvent) {
    const tab = await browser.tabs.get(event.tabId);
    if (sessions.get(event.tabId) !== session || siteKeyForUrl(tab.url || '') !== session.origin)
        return;
    if (!(await browser.permissions.contains({ origins: ['http://*/*', 'https://*/*'] }))) {
        disarmRules(event.tabId);
        return;
    }
    if (sessions.get(event.tabId) !== session) return;
    const action = ruleAction(rule, event);
    if (action === 'record') {
        log(event.tabId, rule, event, 'recorded', 'Matched media recorded.');
        return;
    }
    if (session.preview) {
        log(
            event.tabId,
            rule,
            event,
            'preview',
            `Would ${action === 'hls' ? 'convert HLS to MP4' : 'download this URL'}.`,
        );
        return;
    }
    if (action === 'hls') {
        startConversion(
            {
                action: 'hls-start',
                tabId: event.tabId,
                frameId: event.frameId,
                url: event.url,
                filename: 'rule-media.mp4',
            },
            'hls',
            rule.name,
        );
    } else if (event.url.startsWith('blob:')) {
        await downloadBlob(
            { action: 'download', tabId: event.tabId, frameId: event.frameId, url: event.url },
            rule.name,
        );
    } else {
        const url = new URL(event.url);
        let filename = url.pathname.split('/').pop() || 'rule-media';
        try {
            filename = decodeURIComponent(filename);
        } catch {}
        const entry = beginAttempt('rule', event.tabId, event.frameId, event.url, filename);
        entry.rule = rule.name;
        entry.url = redactRuleUrl(event.url);
        entry.sourcePage = redactRuleUrl(tab.url || '');
        try {
            await saveRemoteFile(event.url, tab, filename, entry);
        } catch (error) {
            failAttempt(entry, error);
            throw error;
        }
    }
    if (sessions.get(event.tabId) === session)
        log(event.tabId, rule, event, 'started', 'Action started; History tracks its completion.');
}
export function receiveRuleEvent(input: RuleEvent) {
    const session = sessions.get(input.tabId);
    if (!session || !Number.isSafeInteger(input.frameId) || input.frameId < 0) return;
    let url: string;
    try {
        url = ruleTarget(input.url);
    } catch {
        return;
    }
    const event = { ...input, url };
    for (const rule of session.rules) {
        if (!matchRule(rule, event)) continue;
        const key = `${rule.id}:${url}`;
        if (session.seen.has(key)) continue;
        if (session.seen.size >= 100) return;
        session.seen.add(key);
        if (session.actions >= 10 || session.pending >= 2) {
            log(
                event.tabId,
                rule,
                event,
                'skipped',
                'Session limit reached (10 matches, two queued actions). Disarm and rearm to reset.',
            );
            continue;
        }
        session.actions++;
        session.pending++;
        session.chain = session.chain.then(async () => {
            if (sessions.get(event.tabId) !== session) return;
            try {
                await execute(session, rule, event);
            } catch (error) {
                if (sessions.get(event.tabId) === session)
                    log(event.tabId, rule, event, 'failed', errorMessage(error));
            } finally {
                session.pending--;
            }
        });
    }
}
export function registerRulesRuntime() {
    subscribeRuleEvents(receiveRuleEvent);
    browser.tabs.onRemoved.addListener((tabId) => {
        disarmRules(tabId);
        for (let index = logs.length - 1; index >= 0; index--)
            if (logs[index].tabId === tabId) logs.splice(index, 1);
    });
    browser.tabs.onUpdated.addListener((tabId, change) => {
        if (change.status === 'loading' || change.url) disarmRules(tabId);
    });
    browser.permissions?.onRemoved?.addListener(() => {
        for (const tabId of sessions.keys()) disarmRules(tabId);
    });
    browser.storage?.onChanged?.addListener((changes, area) => {
        if (area !== 'local' || !changes[rulesStorageKey]) return;
        for (const [tabId, session] of sessions) {
            try {
                const next =
                    parseRulesDocument(changes[rulesStorageKey].newValue).sites[session.origin] ||
                    [];
                if (
                    JSON.stringify(next.filter((rule) => rule.enabled)) !==
                    JSON.stringify(session.rules)
                )
                    disarmRules(tabId);
            } catch {
                disarmRules(tabId);
            }
        }
    });
}
