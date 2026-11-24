import type { MediaState } from '../api';
import type { Variant } from '../../hls/playlist';

export interface MediaForm {
    playlist: string;
    filename: string;
    variants: Variant[];
    variant: number;
    revision: number;
}
export interface MediaFeatureState {
    snapshot: MediaState;
    form: MediaForm;
    syncError: string;
}
export const initialMediaState: MediaFeatureState = {
    snapshot: {
        network: false,
        pattern: '.m3u8',
        elements: false,
        observations: [],
        records: [],
        job: null,
    },
    form: { playlist: '', filename: 'media', variants: [], variant: 0, revision: 0 },
    syncError: '',
};
export type MediaAction =
    | { type: 'snapshotReceived'; snapshot: MediaState }
    | { type: 'playlistEdited'; url: string }
    | { type: 'filenameEdited'; filename: string }
    | { type: 'variantSelected'; variant: number }
    | { type: 'playlistInspected'; url: string; revision: number; variants: Variant[] }
    | { type: 'syncFailed'; error: string };

export function mediaReducer(state: MediaFeatureState, action: MediaAction): MediaFeatureState {
    switch (action.type) {
        case 'snapshotReceived':
            return { ...state, snapshot: action.snapshot, syncError: '' };
        case 'playlistEdited':
            return {
                ...state,
                form: {
                    ...state.form,
                    playlist: action.url,
                    variants: [],
                    variant: 0,
                    revision: state.form.revision + 1,
                },
            };
        case 'filenameEdited':
            return { ...state, form: { ...state.form, filename: action.filename } };
        case 'variantSelected':
            return action.variant >= 0 && action.variant < state.form.variants.length
                ? { ...state, form: { ...state.form, variant: action.variant } }
                : state;
        case 'playlistInspected':
            return action.url === state.form.playlist && action.revision === state.form.revision
                ? { ...state, form: { ...state.form, variants: action.variants, variant: 0 } }
                : state;
        case 'syncFailed':
            return { ...state, syncError: action.error };
    }
}
