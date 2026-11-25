import { siteKeyForUrl } from '../../shared/settings';

export interface SourceTab {
    id: number;
    url: string;
    title: string;
}

export interface SourceState {
    tab: SourceTab | null;
    revision: number;
    loading: boolean;
    error: string;
    unavailable: string;
}

export type SourceAction =
    | { type: 'resolved'; tab: SourceTab; navigated: boolean }
    | { type: 'failed'; error: string }
    | { type: 'dismissed' };

export function sourceReducer(state: SourceState, action: SourceAction): SourceState {
    switch (action.type) {
        case 'resolved': {
            if (!siteKeyForUrl(action.tab.url)) {
                const unavailable =
                    'Open an HTTP(S) website to capture media. Browser and extension pages cannot be scanned.';
                return {
                    tab: null,
                    revision:
                        state.revision +
                        Number(
                            action.navigated ||
                                state.tab !== null ||
                                state.unavailable !== unavailable,
                        ),
                    loading: false,
                    error: '',
                    unavailable,
                };
            }
            return {
                tab: action.tab,
                revision:
                    state.revision +
                    Number(
                        action.navigated ||
                            state.tab?.id !== action.tab.id ||
                            state.tab?.url !== action.tab.url,
                    ),
                loading: false,
                error: '',
                unavailable: '',
            };
        }
        case 'failed':
            return {
                tab: null,
                revision: state.revision + Number(state.tab !== null),
                loading: false,
                error: action.error,
                unavailable: '',
            };
        case 'dismissed':
            return { ...state, error: '' };
    }
}
