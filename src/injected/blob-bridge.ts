import type { HookConfig } from '../shared/contracts';
export function configureBlobBridge(config: HookConfig) {
    const key = '__blobDownloaderBridge';
    globalThis[key]?.stop();
    if (!config.enabled) return { enabled: false };
    const onMessage = (event: MessageEvent) => {
        const data = event.data;
        if (
            event.source !== window ||
            data?.channel !== 'blob-downloader-capture' ||
            data.token !== config.token
        )
            return;
        if (!Number.isSafeInteger(data.sequence)) return;
        const captureError =
            typeof data.captureError === 'string' ? data.captureError.slice(0, 1000) : undefined;
        if (
            !captureError &&
            (typeof data.dataUrl !== 'string' || data.dataUrl.length > config.maxEncodedLength)
        )
            return;
        const url =
            typeof data.url === 'string' && data.url.startsWith('blob:')
                ? data.url.slice(0, 2000)
                : '';
        browser.runtime
            .sendMessage({
                action: 'auto-blob',
                token: config.token,
                dataUrl: captureError ? undefined : data.dataUrl,
                captureError,
                url,
            })
            .then((result) =>
                window.postMessage(
                    {
                        channel: 'blob-downloader-result',
                        token: config.token,
                        sequence: data.sequence,
                        ok: result?.ok,
                    },
                    '*',
                ),
            )
            .catch(() =>
                window.postMessage(
                    {
                        channel: 'blob-downloader-result',
                        token: config.token,
                        sequence: data.sequence,
                        ok: false,
                    },
                    '*',
                ),
            );
    };
    const stop = () => {
        window.removeEventListener('message', onMessage);
        window.removeEventListener('pagehide', stop);
        delete globalThis[key];
    };
    window.addEventListener('message', onMessage);
    window.addEventListener('pagehide', stop, { once: true });
    globalThis[key] = { stop };
    return { enabled: true };
}
