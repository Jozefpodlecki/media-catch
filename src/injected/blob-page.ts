export function scanPageBlobs() {
    const found = new Map<string, { url: string; filename: string; source: string }>();
    const add = (url: unknown, filename = '', source = 'page') => {
        if (typeof url === 'string' && url.startsWith('blob:')) {
            const prior = found.get(url);
            if (!prior || (!prior.filename && filename)) {
                found.set(url, { url, filename, source });
            }
        }
    };
    add(location.href);
    const visit = (root: Document | ShadowRoot) => {
        for (const element of root.querySelectorAll<HTMLElement & { currentSrc?: string }>('*')) {
            for (const attr of ['href', 'src', 'data', 'poster']) {
                add(
                    element.getAttribute(attr),
                    element.getAttribute('download') || '',
                    element.localName,
                );
            }
            add(element.currentSrc, '', element.localName);
            if (element.shadowRoot) visit(element.shadowRoot);
        }
    };
    visit(document);
    for (const entry of performance.getEntriesByType('resource')) {
        add(entry.name, '', 'resource history');
    }
    return { title: document.title, page: location.href, blobs: [...found.values()] };
}

export async function readPageBlob(url: string, limit: number) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    try {
        if (!url.startsWith('blob:')) throw new Error('Only blob: URLs are accepted.');
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error(`Blob read failed (${response.status}).`);
        const declaredSize = Number(response.headers.get('content-length'));
        if (declaredSize > limit) throw new Error('This blob exceeds the 64 MiB limit.');
        const reader = response.body!.getReader();
        const chunks: Uint8Array<ArrayBuffer>[] = [];
        let size = 0;
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > limit) {
                await reader.cancel();
                throw new Error('This blob exceeds the 64 MiB limit.');
            }
            chunks.push(value);
        }
        const blob = new Blob(chunks, {
            type: response.headers.get('content-type') || 'application/octet-stream',
        });
        const dataUrl = await new Promise<string>((resolve, reject) => {
            const fileReader = new FileReader();
            fileReader.onload = () => resolve(fileReader.result as string);
            fileReader.onerror = () => reject(new Error('Could not read the blob bytes.'));
            fileReader.readAsDataURL(blob);
        });
        return { ok: true, dataUrl, size, type: blob.type };
    } catch (error) {
        const name =
            error && typeof error === 'object' && 'name' in error ? String(error.name) : '';
        const message =
            error && typeof error === 'object' && 'message' in error
                ? String(error.message)
                : String(error);
        if (name === 'AbortError') return { ok: false, error: 'Reading the blob timed out.' };
        if (['NetworkError', 'TypeError'].includes(name)) {
            const media = [...document.querySelectorAll<HTMLMediaElement>('video, audio')].some(
                (element) => element.currentSrc === url || element.getAttribute('src') === url,
            );
            return {
                ok: false,
                error: media
                    ? 'This media blob could not be read as a file. It may be a streaming MediaSource URL, which this extension cannot save. It could also have expired; rescan while the source page is open.'
                    : 'This blob could not be read. It may have expired, been revoked, or belong to another source frame. Rescan the page and select its owning frame.',
            };
        }
        return { ok: false, error: message };
    } finally {
        clearTimeout(timer);
    }
}
