import type { Attempt } from '../../shared/contracts';
export interface HistoryState {
    entries: Attempt[];
    filter: string;
    syncError: string;
}
export const initialHistoryState: HistoryState = { entries: [], filter: 'all', syncError: '' };
export type HistoryAction =
    | { type: 'received'; entries: Attempt[] }
    | { type: 'cleared' }
    | { type: 'filterSelected'; filter: string }
    | { type: 'syncFailed'; error: string };
export function historyReducer(state: HistoryState, action: HistoryAction): HistoryState {
    switch (action.type) {
        case 'received':
            return { ...state, entries: action.entries, syncError: '' };
        case 'cleared':
            return { ...state, entries: [], syncError: '' };
        case 'filterSelected':
            return { ...state, filter: action.filter };
        case 'syncFailed':
            return { ...state, syncError: action.error };
    }
}
