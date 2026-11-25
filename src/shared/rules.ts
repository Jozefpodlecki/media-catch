import { validateSiteKey } from './settings';

export const rulesStorageKey = 'siteRules.v1';
export const maximumSiteRules = 10;
export interface SiteRule {
    id: string;
    name: string;
    enabled: boolean;
    trigger: 'network' | 'dom';
    match: 'contains' | 'wildcard';
    pattern: string;
    action: 'record' | 'download' | 'hls' | 'auto';
}
export interface RulesDocument {
    version: 1;
    revision: number;
    sites: Record<string, SiteRule[]>;
}
export interface RuleEvent {
    tabId: number;
    frameId: number;
    trigger: SiteRule['trigger'];
    url: string;
    mediaType?: string;
    reason: string;
}
export interface RuleLog {
    id: number;
    rule: string;
    state: 'preview' | 'started' | 'recorded' | 'skipped' | 'failed';
    url: string;
    message: string;
    time: string;
}
export interface RulesRuntimeState {
    armed: boolean;
    preview: boolean;
    origin: string;
    actions: number;
    pending: number;
    log: RuleLog[];
}
const record = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === 'object' && !Array.isArray(value);
export function validateRule(value: unknown): SiteRule {
    if (
        !record(value) ||
        Object.keys(value).some(
            (key) =>
                !['id', 'name', 'enabled', 'trigger', 'match', 'pattern', 'action'].includes(key),
        )
    )
        throw new Error('Unsupported rule fields.');
    if (
        typeof value.id !== 'string' ||
        !/^[a-zA-Z0-9_-]{1,64}$/.test(value.id) ||
        typeof value.name !== 'string' ||
        !value.name.trim() ||
        value.name.length > 80 ||
        typeof value.enabled !== 'boolean' ||
        typeof value.trigger !== 'string' ||
        !['network', 'dom'].includes(value.trigger) ||
        typeof value.match !== 'string' ||
        !['contains', 'wildcard'].includes(value.match) ||
        typeof value.action !== 'string' ||
        !['record', 'download', 'hls', 'auto'].includes(value.action)
    )
        throw new Error('Invalid rule name, trigger, matcher or action.');
    if (
        typeof value.pattern !== 'string' ||
        value.pattern.length > 256 ||
        !value.pattern.replaceAll('*', '').trim() ||
        /[?#@\x00-\x1f]/.test(value.pattern)
    )
        throw new Error(
            'Match URL hosts and paths with 1–256 characters; queries, fragments and credentials are excluded.',
        );
    return {
        id: value.id,
        name: value.name.trim(),
        enabled: value.enabled,
        trigger: value.trigger as SiteRule['trigger'],
        match: value.match as SiteRule['match'],
        pattern: value.pattern.trim(),
        action: value.action as SiteRule['action'],
    };
}
export function parseRulesDocument(value: unknown): RulesDocument {
    if (value === undefined) return { version: 1, revision: 0, sites: {} };
    if (
        !record(value) ||
        value.version !== 1 ||
        !Number.isSafeInteger(value.revision) ||
        Number(value.revision) < 0 ||
        !record(value.sites) ||
        Object.keys(value.sites).length > 200
    )
        throw new Error('Saved rules are invalid or unsupported; they have not been overwritten.');
    const sites: RulesDocument['sites'] = {};
    for (const [origin, values] of Object.entries(value.sites)) {
        validateSiteKey(origin);
        if (!Array.isArray(values) || values.length > maximumSiteRules)
            throw new Error('Up to 10 rules can be saved per website.');
        const rules = values.map(validateRule);
        if (new Set(rules.map((rule) => rule.id)).size !== rules.length)
            throw new Error('Duplicate rule IDs.');
        sites[origin] = rules;
    }
    return { version: 1, revision: Number(value.revision), sites };
}
export function ruleTarget(value: string): string {
    if (value.length > 16384) throw new Error('Media URL is too long.');
    const url = new URL(value);
    if (!['http:', 'https:', 'blob:'].includes(url.protocol) || url.username || url.password)
        throw new Error('Rules support HTTP(S) media and readable file blobs.');
    return url.href;
}
export function redactRuleUrl(value: string): string {
    try {
        const url = new URL(value);
        if (url.protocol === 'blob:') return url.href.split(/[?#]/)[0].slice(0, 2000);
        return ['http:', 'https:'].includes(url.protocol)
            ? (url.origin + url.pathname).slice(0, 2000)
            : '';
    } catch {
        return '';
    }
}
export function matchRule(rule: SiteRule, event: RuleEvent): boolean {
    if (!rule.enabled || rule.trigger !== event.trigger) return false;
    let value: string;
    try {
        const url = new URL(ruleTarget(event.url));
        value = (
            url.protocol === 'blob:' ? url.href.split(/[?#]/)[0] : url.origin + url.pathname
        ).toLowerCase();
    } catch {
        return false;
    }
    const pattern = rule.pattern.toLowerCase();
    if (rule.match === 'contains') return value.includes(pattern);
    const parts = pattern.split('*');
    if (parts.length === 1) return value === pattern;
    let offset = 0;
    for (let index = 0; index < parts.length; index++) {
        const part = parts[index];
        if (!part) continue;
        if (index === parts.length - 1 && !pattern.endsWith('*')) {
            if (!value.endsWith(part) || value.length - part.length < offset) return false;
            offset = value.length;
            continue;
        }
        const found = value.indexOf(part, offset);
        if (found < 0 || (index === 0 && found !== 0)) return false;
        offset = found + part.length;
    }
    return pattern.endsWith('*') || offset === value.length;
}
export function ruleAction(rule: SiteRule, event: RuleEvent): 'record' | 'download' | 'hls' {
    if (rule.action !== 'auto') return rule.action;
    const url = new URL(event.url);
    if (url.protocol === 'blob:') return 'download';
    return /\.m3u8$/i.test(url.pathname) || /mpegurl/i.test(event.mediaType || '')
        ? 'hls'
        : 'download';
}
