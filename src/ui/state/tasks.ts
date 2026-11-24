export interface TaskState {
    pending: number[];
    latest: number;
    notice: string;
    error: string;
}
export const initialTaskState: TaskState = { pending: [], latest: 0, notice: '', error: '' };
export type TaskAction =
    | { type: 'started'; id: number }
    | { type: 'finished'; id: number; notice?: string; error?: string }
    | { type: 'noticeDismissed' }
    | { type: 'errorDismissed' };

export function taskReducer(state: TaskState, action: TaskAction): TaskState {
    switch (action.type) {
        case 'started':
            return {
                pending: [...state.pending, action.id],
                latest: action.id,
                notice: '',
                error: '',
            };
        case 'finished':
            return {
                ...state,
                pending: state.pending.filter((id) => id !== action.id),
                ...(action.id === state.latest
                    ? { notice: action.notice || '', error: action.error || '' }
                    : {}),
            };
        case 'noticeDismissed':
            return { ...state, notice: '' };
        case 'errorDismissed':
            return { ...state, error: '' };
    }
}
