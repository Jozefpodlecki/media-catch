import type { View } from '../state/application';
export type PageMode = 'popup' | 'dashboard' | 'history';
export interface PageDescriptor {
    mode: PageMode;
    sourceTabId: number | null;
}
export function describePage(mode: string | undefined, search: string): PageDescriptor {
    const pageMode: PageMode = mode === 'dashboard' || mode === 'history' ? mode : 'popup';
    const source = new URLSearchParams(search).get('source');
    const value = source && /^\d+$/.test(source) ? Number(source) : NaN;
    return {
        mode: pageMode,
        sourceTabId:
            pageMode === 'dashboard' && Number.isSafeInteger(value) && value > 0 ? value : null,
    };
}
export function initialViewForPage(page: PageDescriptor, hash: string): View {
    if (page.mode === 'history') return 'history';
    if (['#blobs', '#images', '#media', '#history', '#settings'].includes(hash))
        return hash.slice(1) as View;
    return page.mode === 'dashboard' && page.sourceTabId === null ? 'settings' : 'blobs';
}
