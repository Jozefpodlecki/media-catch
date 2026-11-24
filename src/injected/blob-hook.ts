import type { HookConfig } from '../shared/contracts';
export function configureBlobHook(config: HookConfig) {
    const key = '__blobDownloaderHook';
    globalThis[key]?.stop();
    if (!config.enabled) return { enabled: false };
    const token = config.token;
    const nativeCreateObjectURL = URL.createObjectURL;
    const minimumBytes = config.minimumBytes;
    const maximumBytes = config.maximumBytes;
    const captureQueue: { blob: Blob; url: string }[] = [];
    const seenBlobs = new WeakSet();
    const counters = {
        calls: 0,
        blobs: 0,
        streams: 0,
        otherObjects: 0,
        belowThreshold: 0,
        overLimit: 0,
        duplicates: 0,
        busy: 0,
        limitReached: 0,
        queued: 0,
        captured: 0,
        readFailures: 0,
        nativeErrors: 0,
        acknowledged: 0,
        rejected: 0,
        bridgeTimeouts: 0,
    };
    let lastSize: number | null = null;
    const nativeBlobSizeGetter = Object.getOwnPropertyDescriptor(Blob.prototype, 'size')!.get!;
    let active = true;
    let processing = false;
    let attempts = 0;
    let sequence = 0;
    let reader: FileReader | undefined;
    let cancelAcknowledgement: (() => void) | undefined;
    const acknowledgements = new Map<number, (result: boolean | string) => void>();
    const onResult = (event: MessageEvent) => {
        const data = event.data;
        if (
            event.source === window &&
            data?.channel === 'blob-downloader-result' &&
            data.token === token
        ) {
            acknowledgements.get(data.sequence)?.(data.ok === true);
        }
    };
    window.addEventListener('message', onResult);

    function readCapturedBlob(blob: Blob): Promise<string> {
        return new Promise((resolve, reject) => {
            reader = new FileReader();
            const timeout = setTimeout(() => reader?.abort(), 30000);
            reader.onload = () => {
                clearTimeout(timeout);
                resolve(reader!.result as string);
            };
            reader.onerror = reader.onabort = () => {
                clearTimeout(timeout);
                reject(new Error('Blob capture failed'));
            };
            reader.readAsDataURL(blob);
        });
    }
    function sendCapturedBlob(dataUrl: string, url: string): Promise<void> {
        const id = ++sequence;
        return new Promise((resolve) => {
            const timeout = setTimeout(() => finish('timeout'), 30000);
            function finish(result: boolean | string) {
                clearTimeout(timeout);
                if (typeof result === 'boolean') {
                    counters.acknowledged++;
                    if (!result) counters.rejected++;
                } else if (result === 'timeout') counters.bridgeTimeouts++;
                acknowledgements.delete(id);
                cancelAcknowledgement = undefined;
                resolve();
            }
            acknowledgements.set(id, finish);
            cancelAcknowledgement = () => finish('stopped');
            window.postMessage(
                { channel: 'blob-downloader-capture', token, sequence: id, dataUrl, url },
                '*',
            );
        });
    }
    function reportCaptureFailure(url: string) {
        counters.readFailures++;
        if (!active) return;
        window.postMessage(
            {
                channel: 'blob-downloader-capture',
                token,
                sequence: ++sequence,
                url,
                captureError:
                    'Could not read the captured Blob bytes. The read failed or timed out.',
            },
            '*',
        );
    }
    async function captureBlob(blob: Blob, url: string) {
        try {
            const dataUrl = await readCapturedBlob(blob);
            reader = undefined;
            if (!active) return;
            counters.captured++;
            await sendCapturedBlob(dataUrl, url);
        } catch {
            reportCaptureFailure(url);
        }
    }
    async function processCaptureQueue() {
        if (processing || !active) return;
        processing = true;
        try {
            while (active && captureQueue.length) {
                const { blob, url } = captureQueue.shift()!;
                await captureBlob(blob, url);
            }
        } finally {
            reader = undefined;
            processing = false;
        }
    }
    function wrapper(this: typeof URL, ...args: Parameters<typeof URL.createObjectURL>) {
        counters.calls++;
        let url: string;
        try {
            url = Reflect.apply(nativeCreateObjectURL, this, args);
        } catch (error) {
            counters.nativeErrors++;
            throw error;
        }
        try {
            const blob = args[0];
            let size: number;
            try {
                size = Reflect.apply(nativeBlobSizeGetter, blob, []);
            } catch {
                if (typeof MediaSource !== 'undefined' && blob instanceof MediaSource)
                    counters.streams++;
                else counters.otherObjects++;
                return url;
            }
            counters.blobs++;
            lastSize = size;
            if (size <= minimumBytes) counters.belowThreshold++;
            else if (size > maximumBytes) counters.overLimit++;
            else if (seenBlobs.has(blob)) counters.duplicates++;
            else if (attempts >= 10) counters.limitReached++;
            else if (captureQueue.length + Number(processing) >= 2) counters.busy++;
            else if (active) {
                seenBlobs.add(blob);
                attempts++;
                counters.queued++;
                captureQueue.push({ blob: blob as Blob, url });
                void processCaptureQueue();
            }
        } catch {}
        return url;
    }
    const stop = () => {
        active = false;
        captureQueue.length = 0;
        reader?.abort();
        cancelAcknowledgement?.();
        window.removeEventListener('message', onResult);
        window.removeEventListener('pagehide', stop);
        if (URL.createObjectURL === wrapper) URL.createObjectURL = nativeCreateObjectURL;
        delete globalThis[key];
    };
    URL.createObjectURL = wrapper;
    if (URL.createObjectURL !== wrapper) {
        window.removeEventListener('message', onResult);
        throw new Error("This page's createObjectURL function could not be replaced.");
    }
    window.addEventListener('pagehide', stop, { once: true });
    globalThis[key] = {
        stop,
        diagnostics: () => ({
            attached: active && URL.createObjectURL === wrapper,
            counters: { ...counters },
            lastSize,
        }),
    };
    return { enabled: true, diagnostics: globalThis[key].diagnostics() };
}
