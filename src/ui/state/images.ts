import { imageUrl, type ImageCandidate, type ImageBatch } from '../../shared/images';

export interface ImagesState {
    images: ImageCandidate[];
    selected: string[];
    overrides: Record<string, string>;
    source: 'link' | 'src';
    find: string;
    replacement: string;
    scanned: boolean;
    truncated: boolean;
    batch: ImageBatch | null;
    error: string;
    page: number;
}
export const initialImagesState: ImagesState = {
    images: [],
    selected: [],
    overrides: {},
    source: 'link',
    find: '',
    replacement: '',
    scanned: false,
    truncated: false,
    batch: null,
    error: '',
    page: 0,
};
export type ImagesAction =
    | { type: 'scanned'; images: ImageCandidate[]; truncated: boolean }
    | { type: 'toggle'; id: string }
    | { type: 'selectAll'; selected: boolean }
    | { type: 'source'; source: ImagesState['source'] }
    | { type: 'find'; value: string }
    | { type: 'replacement'; value: string }
    | { type: 'override'; id: string; value: string }
    | { type: 'batch'; batch: ImageBatch | null }
    | { type: 'failed'; error: string }
    | { type: 'page'; page: number }
    | { type: 'patternSelected'; ids: string[] }
    | { type: 'prefixChosen'; prefix: string };

export function imageDraftUrl(state: ImagesState, image: ImageCandidate): string {
    const override = state.overrides[image.id];
    if (override !== undefined) return override;
    const base = state.source === 'link' && image.href ? image.href : image.currentSrc || image.src;
    return state.find ? base.replaceAll(state.find, () => state.replacement) : base;
}

export function imageTarget(state: ImagesState, image: ImageCandidate): string {
    return imageUrl(imageDraftUrl(state, image));
}

export function imagesReducer(state: ImagesState, action: ImagesAction): ImagesState {
    switch (action.type) {
        case 'scanned':
            return {
                ...state,
                images: action.images,
                selected: action.images.map((image) => image.id),
                overrides: {},
                scanned: true,
                truncated: action.truncated,
                page: 0,
                error: '',
            };
        case 'toggle':
            return {
                ...state,
                selected: state.selected.includes(action.id)
                    ? state.selected.filter((id) => id !== action.id)
                    : [...state.selected, action.id],
            };
        case 'selectAll':
            return {
                ...state,
                selected: action.selected ? state.images.map((image) => image.id) : [],
            };
        case 'source':
            return { ...state, source: action.source, overrides: {} };
        case 'find':
            return { ...state, find: action.value, overrides: {} };
        case 'replacement':
            return { ...state, replacement: action.value, overrides: {} };
        case 'override':
            return { ...state, overrides: { ...state.overrides, [action.id]: action.value } };
        case 'batch':
            return { ...state, batch: action.batch, error: '' };
        case 'failed':
            return { ...state, error: action.error };
        case 'patternSelected':
            return { ...state, selected: action.ids, page: 0 };
        case 'prefixChosen':
            return { ...state, find: action.prefix, replacement: action.prefix, overrides: {} };
        case 'page':
            return {
                ...state,
                page: Math.max(0, Math.min(Math.ceil(state.images.length / 25) - 1, action.page)),
            };
    }
}
