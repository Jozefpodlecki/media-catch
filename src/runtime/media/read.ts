import { blobLimit } from '../../shared/limits';
import { mediaUrl } from '../../hls/playlist';
export async function permittedRead(
    url: string,
    signal: AbortSignal,
    budget: { used: number },
    range?: string,
): Promise<{ data: Uint8Array; url: string }> {
    const parsed = new URL(mediaUrl(url));
    if (
        !(await browser.permissions.contains({
            origins: [`${parsed.protocol}//${parsed.hostname}/*`],
        }))
    )
        throw new Error(
            `Media access has not been granted for ${parsed.origin}. Enable media access first.`,
        );
    const timeout = AbortSignal.timeout(30000);
    const response = await fetch(url, {
        credentials: 'include',
        signal: AbortSignal.any([signal, timeout]),
        headers: range ? { Range: range } : {},
    });
    if (!response.ok)
        throw new Error(`Media request failed: HTTP ${response.status} (${parsed.host}).`);
    if (range && response.status !== 206)
        throw new Error('The media server did not honor an HLS byte-range request.');
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    let length = 0;
    const reader = response.body!.getReader();
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            length += value.length;
            budget.used += value.length;
            if (budget.used > blobLimit)
                throw new Error(
                    'Total media input exceeds the 64 MiB limit. Choose a smaller rendition.',
                );
            chunks.push(value);
        }
    } catch (error) {
        await reader.cancel();
        throw error;
    }
    if (range) {
        const match = /bytes=(\d+)-(\d+)/.exec(range)!;
        if (length !== Number(match[2]) - Number(match[1]) + 1)
            throw new Error('The server returned an incomplete HLS byte range.');
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
    }
    return { data: bytes, url: response.url };
}
