import { useCallback, useEffect, useMemo, useReducer, type ReactNode } from 'react';
import { command } from '../../api';
import { requiredContext } from '../../context';
import { useSource } from '../../app/SourceProvider';
import { useTaskActions } from '../../app/TaskProvider';
import { usePolling, useRequestScope } from '../../services/hooks';
import { initialRulesState, rulesReducer, type RulesState } from '../../state/rules';
import {
    parseRulesDocument,
    rulesStorageKey,
    validateRule,
    type SiteRule,
} from '../../../shared/rules';
import { errorMessage } from '../../../shared/errors';

interface RulesActions {
    changeDraft(patch: Partial<SiteRule>): void;
    editRule(id: string): void;
    newRule(): void;
    saveRule(): Promise<void>;
    deleteRule(id: string): Promise<void>;
    toggleRule(id: string): Promise<void>;
    arm(preview: boolean): Promise<void>;
    disarm(): Promise<void>;
    retry(): Promise<void>;
}
const [StateProvider, useRulesState] = requiredContext<RulesState>('Rules state');
const [ActionsProvider, useRulesActions] = requiredContext<RulesActions>('Rules actions');
export { useRulesState, useRulesActions };
export function RulesProvider({ children }: { children: ReactNode }) {
    const { siteKey, tab } = useSource();
    const tabId = tab?.id;
    const [state, dispatch] = useReducer(rulesReducer, initialRulesState);
    const requests = useRequestScope();
    const { run } = useTaskActions();
    const failed = useCallback(
        (error: unknown) => dispatch({ type: 'failed', error: errorMessage(error) }),
        [],
    );
    const refresh = useCallback(async () => {
        await requests.read(
            'config',
            () => command('rules-get'),
            ({ document }) => dispatch({ type: 'received', document }),
        );
        if (tabId !== undefined)
            await requests.read(
                'runtime',
                () => command('rules-state', { tabId }),
                ({ runtime }) => dispatch({ type: 'runtime', runtime }),
            );
    }, [requests, tabId]);
    usePolling(refresh, true, failed);
    useEffect(() => {
        const changed = (changes: Record<string, browser.storage.StorageChange>, area: string) => {
            if (area !== 'local' || !changes[rulesStorageKey]) return;
            if (changes[rulesStorageKey].newValue === undefined) requests.invalidate('config');
            try {
                dispatch({
                    type: 'received',
                    document: parseRulesDocument(changes[rulesStorageKey].newValue),
                    reset: changes[rulesStorageKey].newValue === undefined,
                });
            } catch (error) {
                failed(error);
            }
        };
        browser.storage.onChanged.addListener(changed);
        return () => browser.storage.onChanged.removeListener(changed);
    }, [requests, failed]);
    const actions = useMemo<RulesActions>(() => {
        const save = (rule: SiteRule) =>
            run(async () => {
                if (!siteKey) throw new Error('Open Rules from a source webpage first.');
                const clean = validateRule(rule);
                await requests.mutate(
                    'config',
                    () => command('rules-save', { origin: siteKey, rule: clean }),
                    ({ document }) => dispatch({ type: 'saved', document, rule: clean }),
                );
                return 'Rule saved. Arm this tab to apply the saved rules.';
            });
        return {
            changeDraft: (patch) => dispatch({ type: 'draft', patch }),
            newRule: () => dispatch({ type: 'new' }),
            editRule(id) {
                const rule =
                    siteKey && state.document.sites[siteKey]?.find((item) => item.id === id);
                if (rule) dispatch({ type: 'edit', rule });
            },
            saveRule: () => save({ ...state.draft, id: state.draft.id || crypto.randomUUID() }),
            toggleRule(id) {
                const rule =
                    siteKey && state.document.sites[siteKey]?.find((item) => item.id === id);
                return rule ? save({ ...rule, enabled: !rule.enabled }) : Promise.resolve();
            },
            deleteRule: (id) =>
                run(async () => {
                    if (!siteKey) return;
                    await requests.mutate(
                        'config',
                        () => command('rules-remove', { origin: siteKey, id }),
                        ({ document }) => dispatch({ type: 'saved', document }),
                    );
                }),
            arm: (preview) =>
                run(async () => {
                    if (tabId === undefined) throw new Error('Open a source webpage first.');
                    const granted = await browser.permissions.request({
                        origins: ['http://*/*', 'https://*/*'],
                    });
                    if (!granted) throw new Error('Website access was not granted.');
                    await requests.mutate(
                        'runtime',
                        () => command('rules-arm', { tabId, preview }),
                        ({ runtime }) => dispatch({ type: 'runtime', runtime }),
                    );
                }),
            disarm: () =>
                run(async () => {
                    if (tabId === undefined) return;
                    await requests.mutate(
                        'runtime',
                        () => command('rules-disarm', { tabId }),
                        ({ runtime }) => dispatch({ type: 'runtime', runtime }),
                    );
                }),
            retry: () => run(refresh),
        };
    }, [siteKey, tabId, state.document, state.draft, requests, run, refresh]);
    return (
        <StateProvider value={state}>
            <ActionsProvider value={actions}>{children}</ActionsProvider>
        </StateProvider>
    );
}
