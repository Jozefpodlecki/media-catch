import { useEffect, useMemo, useReducer, type ReactNode } from 'react';
import { requiredContext } from '../context';
import { errorMessage } from '../../shared/errors';
import { siteKeyForUrl } from '../../shared/settings';
import type { PageDescriptor } from './page';
import { sourceReducer, type SourceState, type SourceTab } from '../state/source';

interface SourceContext extends SourceState {
    workspaceKey: string;
    siteKey: string | null;
    dismissError(): void;
}
const [Provider, useSource] = requiredContext<SourceContext>('Source');
export { useSource };

export function SourceProvider({ page, children }: { page: PageDescriptor; children: ReactNode }) {
    const { mode, sourceTabId } = page;
    const resolveSource = mode === 'popup' || (mode === 'dashboard' && sourceTabId !== null);
    const [state, dispatch] = useReducer(sourceReducer, {
        tab: null,
        revision: 0,
        loading: resolveSource,
        error: '',
        unavailable: '',
    });
    useEffect(() => {
        if (!resolveSource) return;
        let active = true;
        let request = 0;
        let current: SourceTab | null = null;
        const resolve = async () => {
            const id = ++request;
            try {
                const tab =
                    mode === 'dashboard' && sourceTabId !== null
                        ? await browser.tabs.get(sourceTabId)
                        : (await browser.tabs.query({ active: true, currentWindow: true }))[0];
                if (!active || request !== id) return;
                if (tab?.id === undefined) throw new Error('Open a source webpage first.');
                current = { id: tab.id, url: tab.url || '', title: tab.title || '' };
                dispatch({ type: 'resolved', tab: current, navigated: false });
            } catch (error) {
                if (active && request === id)
                    dispatch({ type: 'failed', error: errorMessage(error) });
            }
        };
        const updated = (
            tabId: number,
            change: browser.tabs._OnUpdatedChangeInfo,
            tab: browser.tabs.Tab,
        ) => {
            if (
                !active ||
                tabId !== current?.id ||
                (!change.url && change.status !== 'loading' && !change.title)
            )
                return;
            request++;
            current = { id: tabId, url: tab.url || current.url, title: tab.title || current.title };
            dispatch({ type: 'resolved', tab: current, navigated: change.status === 'loading' });
        };
        const activated = () => {
            void resolve();
        };
        const removed = (tabId: number) => {
            if (tabId !== current?.id) return;
            request++;
            current = null;
            dispatch({
                type: 'failed',
                error: 'The source tab was closed. Open the extension from a webpage again.',
            });
        };
        browser.tabs.onUpdated?.addListener(updated);
        if (mode === 'popup') browser.tabs.onActivated?.addListener(activated);
        browser.tabs.onRemoved?.addListener(removed);
        void resolve();
        return () => {
            active = false;
            browser.tabs.onUpdated?.removeListener(updated);
            if (mode === 'popup') browser.tabs.onActivated?.removeListener(activated);
            browser.tabs.onRemoved?.removeListener(removed);
        };
    }, [mode, sourceTabId, resolveSource]);
    const value = useMemo(
        () => ({
            ...state,
            workspaceKey: `${mode}:${state.tab?.id ?? 'none'}:${state.revision}`,
            siteKey: siteKeyForUrl(state.tab?.url || ''),
            dismissError: () => dispatch({ type: 'dismissed' }),
        }),
        [state, mode],
    );
    return <Provider value={value}>{children}</Provider>;
}
