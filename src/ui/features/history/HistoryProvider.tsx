import { useCallback, useEffect, useMemo, useReducer, type ReactNode } from 'react';
import { errorMessage } from '../../../shared/errors';
import { command } from '../../api';
import { requiredContext } from '../../context';
import { historyReducer, initialHistoryState, type HistoryState } from '../../state/history';
import { useSource } from '../../app/SourceProvider';
import { useTaskActions } from '../../app/TaskProvider';
import { useApplicationState } from '../../app/ApplicationProvider';
import { usePolling, useRequestScope } from '../../services/hooks';

interface HistoryActions {
    selectFilter(value: string): void;
    clear(): Promise<void>;
    open(): Promise<void>;
    reveal(id: number): Promise<void>;
}
const [StateProvider, useHistoryState] = requiredContext<HistoryState>('History state');
const [ActionsProvider, useHistoryActions] = requiredContext<HistoryActions>('History actions');
export { useHistoryState, useHistoryActions };

export function HistoryProvider({ children }: { children: ReactNode }) {
    const [state, dispatch] = useReducer(historyReducer, initialHistoryState);
    const { loading } = useSource();
    const { view } = useApplicationState();
    const { run } = useTaskActions();
    const requests = useRequestScope();
    const refresh = useCallback(
        () =>
            requests.read(
                'history',
                () => command('history-get'),
                (result) => dispatch({ type: 'received', entries: result.entries }),
            ),
        [requests],
    );
    const syncFailed = useCallback(
        (error: unknown) => dispatch({ type: 'syncFailed', error: errorMessage(error) }),
        [],
    );
    usePolling(refresh, !loading, syncFailed);
    useEffect(() => {
        if (view === 'history' && !loading) void refresh().catch(syncFailed);
    }, [view, loading, refresh, syncFailed]);
    const actions = useMemo<HistoryActions>(
        () => ({
            selectFilter: (filter) => dispatch({ type: 'filterSelected', filter }),
            clear: () =>
                run(async () => {
                    await requests.mutate(
                        'history',
                        () => command('history-clear'),
                        () => dispatch({ type: 'cleared' }),
                    );
                }),
            open: () =>
                run(async () => {
                    await browser.tabs.create({ url: browser.runtime.getURL('history.html') });
                }),
            reveal: (id) =>
                run(async () => {
                    await browser.downloads.show(id);
                }),
        }),
        [requests, run],
    );
    return (
        <StateProvider value={state}>
            <ActionsProvider value={actions}>{children}</ActionsProvider>
        </StateProvider>
    );
}
