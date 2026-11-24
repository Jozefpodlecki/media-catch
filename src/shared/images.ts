export const imageLimit = 500;
export type ImageKind = 'image' | 'srcset' | 'lazy' | 'background' | 'link';

export interface ImageCandidate {
    id: string;
    frameId: number;
    src: string;
    currentSrc: string;
    href: string;
    alt: string;
    kind?: ImageKind;
}

export interface ImageBatch {
    running: boolean;
    total: number;
    started: number;
    failed: number;
    stopped: boolean;
    error: string;
}

export function imageUrl(value: string): string {
    if (value.length > 16384) throw new Error('Image URL is too long.');
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
        throw new Error('Use an HTTP(S) image URL without embedded credentials.');
    return url.href;
}

export function transformImageUrl(url: string, find: string, replacement: string): string {
    return imageUrl(find ? url.replaceAll(find, () => replacement) : url);
}
