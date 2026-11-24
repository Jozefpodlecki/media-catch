export interface Variant {
    url: string;
    label: string;
    bandwidth: number;
    audioGroup?: string;
}
export interface Rendition {
    url: string;
    group: string;
    default: boolean;
}
export interface ParsedPlaylist {
    text: string;
    variants: Variant[];
    audio: Rendition[];
    live: boolean;
}
export function attributes(line: string): Record<string, string> {
    const result: Record<string, string> = {};
    for (const match of line.matchAll(/([A-Z0-9-]+)=("[^"]*"|[^,]*)/g))
        result[match[1]] = match[2].replace(/^"|"$/g, '');
    return result;
}
export function mediaUrl(input: string, base?: string): string {
    const url = new URL(input, base);
    if (
        !['http:', 'https:'].includes(url.protocol) ||
        input.length > 16384 ||
        url.username ||
        url.password
    )
        throw new Error('Only HTTP/HTTPS media URLs without embedded credentials are supported.');
    return url.href;
}
export function parsePlaylist(text: string, url: string): ParsedPlaylist {
    if (!text.trimStart().startsWith('#EXTM3U'))
        throw new Error('The response is not an HLS playlist.');
    if (text.length > 512 * 1024) throw new Error('Playlist exceeds the 512 KiB limit.');
    const lines = text.trim().split(/\r?\n/);
    const variants: Variant[] = [];
    const audio: Rendition[] = [];
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (/^#EXT-X-(?:SESSION-)?KEY:/.test(line) && attributes(line).METHOD !== 'NONE')
            throw new Error('Encrypted/DRM HLS is not supported.');
        if (line.startsWith('#EXT-X-STREAM-INF:')) {
            const attrs = attributes(line);
            const next = lines
                .slice(i + 1)
                .find((value) => value.trim() && !value.trim().startsWith('#'));
            if (!next) throw new Error('Master playlist has a missing variant URL.');
            const bandwidth = Number(attrs.BANDWIDTH) || 0;
            variants.push({
                url: mediaUrl(next.trim(), url),
                bandwidth,
                audioGroup: attrs.AUDIO,
                label: `${attrs.RESOLUTION || 'Video'} · ${(bandwidth / 1000000).toFixed(1)} Mbps`,
            });
        }
        if (line.startsWith('#EXT-X-MEDIA:')) {
            const attrs = attributes(line);
            if (attrs.TYPE === 'AUDIO' && attrs.URI)
                audio.push({
                    url: mediaUrl(attrs.URI, url),
                    group: attrs['GROUP-ID'],
                    default: attrs.DEFAULT === 'YES',
                });
        }
    }
    variants.sort((a, b) => b.bandwidth - a.bandwidth);
    return {
        text,
        variants,
        audio,
        live: !variants.length && !lines.some((line) => line.trim() === '#EXT-X-ENDLIST'),
    };
}
export interface Asset {
    name: string;
    data: Uint8Array;
}
export interface FetchedBytes {
    data: Uint8Array;
    url?: string;
}
export async function collectHls(
    url: string,
    variantIndex: number,
    read: (url: string, range?: string) => Promise<Uint8Array | FetchedBytes>,
    progress: (message: string) => void,
): Promise<{ files: Asset[]; video: string; audio?: string }> {
    const decoder = new TextDecoder();
    const files: Asset[] = [];
    let segments = 0;
    const load = async (
        source: string,
        depth: number,
        selected = 0,
    ): Promise<{ video: string; audio?: string }> => {
        if (depth > 4) throw new Error('Playlist nesting exceeds the limit.');
        const response = await read(mediaUrl(source));
        const loaded = response instanceof Uint8Array ? { data: response, url: source } : response;
        source = mediaUrl(loaded.url || source);
        const parsed = parsePlaylist(decoder.decode(loaded.data), source);
        if (parsed.variants.length) {
            const variant = parsed.variants[selected];
            if (!variant) throw new Error('Selected quality is no longer available.');
            const video = await load(variant.url, depth + 1);
            const candidates = parsed.audio.filter((item) => item.group === variant.audioGroup);
            const rendition = candidates.find((item) => item.default) || candidates[0];
            if (rendition) video.audio = (await load(rendition.url, depth + 1)).video;
            return video;
        }
        if (parsed.live)
            throw new Error(
                'Live/open-ended playlists are not supported. Choose a finished VOD playlist.',
            );
        const output: string[] = [];
        const offsets = new Map<string, number>();
        let range: string | undefined;
        const asset = async (remote: string, rangeValue?: string) => {
            if (++segments > 500) throw new Error('HLS exceeds the 500-asset limit.');
            const absolute = mediaUrl(remote, source);
            let header: string | undefined;
            if (rangeValue) {
                const match = /^(\d+)(?:@(\d+))?$/.exec(rangeValue);
                if (!match) throw new Error('Invalid HLS byte range.');
                const length = Number(match[1]);
                const start = match[2] === undefined ? offsets.get(absolute) : Number(match[2]);
                if (
                    start === undefined ||
                    !Number.isSafeInteger(length) ||
                    length <= 0 ||
                    !Number.isSafeInteger(start)
                )
                    throw new Error('Invalid or missing byte-range offset.');
                header = `bytes=${start}-${start + length - 1}`;
                offsets.set(absolute, start + length);
            }
            const ext = /\.(ts|m4s|mp4|aac|m4a)(?:$|\?)/i.exec(absolute)?.[1] || 'bin';
            const name = `asset-${segments}.${ext}`;
            progress(`Fetching media asset ${segments}…`);
            const response = await read(absolute, header);
            files.push({ name, data: response instanceof Uint8Array ? response : response.data });
            return name;
        };
        for (const raw of parsed.text.trim().split(/\r?\n/)) {
            const line = raw.trim();
            if (line.startsWith('#EXT-X-BYTERANGE:')) {
                range = line.slice(17);
                continue;
            }
            if (line.startsWith('#EXT-X-MAP:')) {
                const attrs = attributes(line);
                if (!attrs.URI) throw new Error('HLS initialization segment URL is missing.');
                output.push(`#EXT-X-MAP:URI="${await asset(attrs.URI, attrs.BYTERANGE)}"`);
            } else if (line && !line.startsWith('#')) {
                output.push(await asset(line, range));
                range = undefined;
            } else output.push(line);
        }
        const name = `playlist-${files.length}.m3u8`;
        files.push({ name, data: new TextEncoder().encode(output.join('\n') + '\n') });
        return { video: name };
    };
    return { files, ...(await load(mediaUrl(url), 0, variantIndex)) };
}
