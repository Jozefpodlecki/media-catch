import { useEffect, useMemo, useReducer, useRef, type ReactNode } from 'react';
import { requiredContext } from '../context';
import { initialTaskState, taskReducer, type TaskState } from '../state/tasks';
import { errorMessage } from '../../shared/errors';

interface TaskActions {
    run(task: () => Promise<string | void>): Promise<void>;
    dismissError(): void;
    dismissNotice(): void;
}
const [StateProvider, useTaskState] = requiredContext<TaskState>('Task state');
const [ActionsProvider, useTaskActions] = requiredContext<TaskActions>('Task actions');
export { useTaskState, useTaskActions };

export function TaskProvider({ children }: { children: ReactNode }) {
    const [state, dispatch] = useReducer(taskReducer, initialTaskState);
    const sequence = useRef(0);
    const active = useRef(true);
    useEffect(() => {
        active.current = true;
        return () => {
            active.current = false;
        };
    }, []);
    const actions = useMemo<TaskActions>(
        () => ({
            async run(task) {
                const id = ++sequence.current;
                dispatch({ type: 'started', id });
                try {
                    const notice = await task();
                    if (active.current) dispatch({ type: 'finished', id, notice: notice || '' });
                } catch (error) {
                    if (active.current)
                        dispatch({ type: 'finished', id, error: errorMessage(error) });
                }
            },
            dismissError: () => dispatch({ type: 'errorDismissed' }),
            dismissNotice: () => dispatch({ type: 'noticeDismissed' }),
        }),
        [],
    );
    return (
        <StateProvider value={state}>
            <ActionsProvider value={actions}>{children}</ActionsProvider>
        </StateProvider>
    );
}

export function useBusy() {
    return useTaskState().pending.length > 0;
}
