import type { BlobFrame, WatchState } from '../api';

export interface BlobSelection {
    url: string;
    frameId: number;
    filename: string;
}
export interface BlobState {
    frames: BlobFrame[];
    selection: BlobSelection;
    watch: WatchState;
    probe: string;
    syncError: string;
    editRevision: number;
    scanRevision: number;
}
export const initialBlobState: BlobState = {
    frames: [],
    selection: { url: '', frameId: 0, filename: '' },
    watch: {
        enabled: false,
        minimumMiB: 10,
        count: 0,
        attempts: 0,
        lastResult: '',
        diagnostics: [],
        diagnosticError: '',
    },
    probe: '',
    syncError: '',
    editRevision: 0,
    scanRevision: 0,
};
export type BlobAction =
    | { type: 'scanStarted' }
    | { type: 'scanReceived'; frames: BlobFrame[] }
    | { type: 'blobSelected'; selection: BlobSelection }
    | { type: 'urlEdited'; url: string }
    | { type: 'filenameEdited'; filename: string }
    | { type: 'frameSelected'; frameId: number }
    | { type: 'watchReceived'; watch: WatchState }
    | { type: 'syncFailed'; error: string };

export function blobReducer(state: BlobState, action: BlobAction): BlobState {
    switch (action.type) {
        case 'scanStarted':
            return { ...state, scanRevision: state.editRevision };
        case 'scanReceived': {
            const frame = action.frames.find((item) => item.blobs.length);
            const blob = frame?.blobs[0];
            const selection =
                frame && blob
                    ? { url: blob.url, frameId: frame.frameId, filename: blob.filename }
                    : { ...initialBlobState.selection };
            return {
                ...state,
                frames: action.frames,
                selection: state.scanRevision === state.editRevision ? selection : state.selection,
            };
        }
        case 'blobSelected':
            return { ...state, selection: action.selection, editRevision: state.editRevision + 1 };
        case 'urlEdited':
            return {
                ...state,
                selection: { ...state.selection, url: action.url },
                editRevision: state.editRevision + 1,
            };
        case 'filenameEdited':
            return {
                ...state,
                selection: { ...state.selection, filename: action.filename },
                editRevision: state.editRevision + 1,
            };
        case 'frameSelected':
            return {
                ...state,
                selection: { ...state.selection, frameId: action.frameId },
                editRevision: state.editRevision + 1,
            };
        case 'watchReceived':
            return {
                ...state,
                watch: action.watch,
                probe: action.watch.hookTest ?? state.probe,
                syncError: '',
            };
        case 'syncFailed':
            return { ...state, syncError: action.error };
    }
}
