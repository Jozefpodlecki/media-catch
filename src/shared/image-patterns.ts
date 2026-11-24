import { imageUrl, type ImageCandidate } from './images';

export interface ImageUrlPattern {
    template: string;
    prefix: string;
    count: number;
    imageIds: string[];
    example: string;
}

export function extractImagePatterns(images: ImageCandidate[]): ImageUrlPattern[] {
    const groups = new Map<
        string,
        { pattern: ImageUrlPattern; urls: Set<string>; ids: Set<string> }
    >();
    for (const image of images) {
        for (const value of new Set([image.src, image.currentSrc, image.href])) {
            if (!value) continue;
            let url: URL;
            try {
                url = new URL(imageUrl(value));
            } catch {
                continue;
            }
            const segments = url.pathname.split('/');
            const masked = segments.map((segment, index) => {
                if (!segment) return '';
                if (/^\d+$/.test(segment)) return '{number}';
                if (/^[a-f\d-]{16,}$/i.test(segment) && /\d/.test(segment)) return '{id}';
                if (index === segments.length - 1 && /\.[a-z\d]{1,8}$/i.test(segment))
                    return '{file}' + segment.slice(segment.lastIndexOf('.')).toLowerCase();
                return segment;
            });
            const keys = [...new Set(url.searchParams.keys())].sort();
            const query = keys.length
                ? '?' + keys.map((key) => `${encodeURIComponent(key)}={value}`).join('&')
                : '';
            const template = url.origin + masked.join('/') + query;
            let group = groups.get(template);
            if (!group) {
                const dynamic = masked.findIndex((segment) => segment.includes('{'));
                const prefix = dynamic > 1 ? masked.slice(0, dynamic).join('/') + '/' : '';
                group = {
                    pattern: { template, prefix, count: 0, imageIds: [], example: value },
                    urls: new Set(),
                    ids: new Set(),
                };
                groups.set(template, group);
            }
            group.urls.add(url.href);
            group.ids.add(image.id);
        }
    }
    return [...groups.values()]
        .map(({ pattern, urls, ids }) => ({ ...pattern, count: urls.size, imageIds: [...ids] }))
        .sort(
            (first, second) =>
                second.count - first.count || first.template.localeCompare(second.template),
        );
}
