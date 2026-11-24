import {
    applySettingsChange,
    createSettingsDocument,
    type SettingsChange,
    type SettingsDocument,
} from '../../shared/settings';
import { errorMessage } from '../../shared/errors';

export interface PreferencesState {
    saved: SettingsDocument;
    config: SettingsDocument;
    pending: { id: number; change: SettingsChange }[];
    loaded: boolean;
    error: string;
}
export function createPreferencesState(): PreferencesState {
    return {
        saved: createSettingsDocument(),
        config: createSettingsDocument(),
        pending: [],
        loaded: false,
        error: '',
    };
}
export type PreferencesAction =
    | { type: 'received'; settings: SettingsDocument; reset?: boolean }
    | { type: 'queued'; id: number; change: SettingsChange }
    | { type: 'saved'; id: number; settings: SettingsDocument }
    | { type: 'failed'; id: number; error: string }
    | { type: 'loadFailed'; error: string };

function rebasePreferences(
    saved: SettingsDocument,
    pending: PreferencesState['pending'],
): SettingsDocument {
    return pending.reduce((config, { change }) => {
        try {
            return applySettingsChange(config, change);
        } catch {
            return config;
        }
    }, saved);
}

export function preferencesReducer(
    state: PreferencesState,
    action: PreferencesAction,
): PreferencesState {
    switch (action.type) {
        case 'received': {
            const saved =
                action.reset || action.settings.revision >= state.saved.revision
                    ? action.settings
                    : state.saved;
            return {
                ...state,
                saved,
                config: rebasePreferences(saved, state.pending),
                loaded: true,
                error: '',
            };
        }
        case 'queued': {
            try {
                return {
                    ...state,
                    config: applySettingsChange(state.config, action.change),
                    pending: [...state.pending, { id: action.id, change: action.change }],
                    error: '',
                };
            } catch (error) {
                return { ...state, error: errorMessage(error) };
            }
        }
        case 'saved': {
            const saved =
                action.settings.revision >= state.saved.revision ? action.settings : state.saved;
            const pending = state.pending.filter(({ id }) => id !== action.id);
            return { ...state, pending, saved, config: rebasePreferences(saved, pending) };
        }
        case 'failed': {
            const pending = state.pending.filter(({ id }) => id !== action.id);
            return {
                ...state,
                pending,
                config: rebasePreferences(state.saved, pending),
                error: action.error,
            };
        }
        case 'loadFailed':
            return { ...state, loaded: false, error: action.error };
    }
}
