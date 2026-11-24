import type { Watch, HookConfig } from './shared/contracts';
import type { CommandOf, AutomaticCapture } from './shared/messages';
import { blobLimit } from './shared/limits';
import { errorMessage } from './shared/errors';
import { configureBlobBridge } from './injected/blob-bridge';
import { configureBlobHook } from './injected/blob-hook';
import { inspectBlobHook, testBlobHook } from './injected/blob-diagnostics';
import { beginAttempt, failAttempt } from './runtime/history';
import { decodeBlobData, saveBlob } from './runtime/downloads';
const blobWatches = new Map<number, Watch>();
export function registerBlobWatchEvents() {
    browser.tabs.onRemoved.addListener((tabId) => blobWatches.delete(tabId));
    browser.tabs.onUpdated.addListener((tabId, change) => {
        if (change.status === 'loading') blobWatches.delete(tabId);
    });
}
function watchStatus(tabId: number) {
    const watch = blobWatches.get(tabId);
    return {
        ok: true,
        enabled: Boolean(watch),
        minimumMiB: watch?.minimumMiB ?? 10,
        count: watch?.count ?? 0,
        attempts: watch?.attempts ?? 0,
        lastResult: watch?.lastResult ?? '',
        diagnostics: watch?.diagnostics ?? [],
        diagnosticError: watch?.diagnosticError ?? '',
    };
}

export async function inspectBlobWatch(tabId: number) {
    const watch = blobWatches.get(tabId);
    if (!watch) return watchStatus(tabId);
    try {
        const results = await browser.scripting.executeScript({
            target: { tabId, frameIds: [...watch.frames] },
            world: 'MAIN',
            func: inspectBlobHook,
        });
        if (blobWatches.get(tabId) !== watch) return watchStatus(tabId);
        const keys = [
            'calls',
            'blobs',
            'streams',
            'otherObjects',
            'belowThreshold',
            'overLimit',
            'duplicates',
            'busy',
            'limitReached',
            'queued',
            'captured',
            'readFailures',
            'nativeErrors',
            'acknowledged',
            'rejected',
            'bridgeTimeouts',
        ];
        watch.diagnostics = [...watch.frames].map((frameId) => {
            const result = results.find((item) => item.frameId === frameId)?.result;
            const values = result?.counters || {};
            const counters = Object.fromEntries(
                keys.map((key) => [
                    key,
                    Number.isSafeInteger(values[key]) && values[key] >= 0 ? values[key] : 0,
                ]),
            );
            return {
                frameId,
                attached: result?.attached === true,
                counters,
                lastSize:
                    typeof result?.lastSize === 'number' &&
                    Number.isSafeInteger(result.lastSize) &&
                    result.lastSize >= 0
                        ? result.lastSize
                        : null,
            };
        });
        watch.diagnosticError = '';
    } catch {
        watch.diagnosticError =
            'Could not inspect the page hook. The page may have changed or access may have expired.';
    }
    return watchStatus(tabId);
}

export async function testWatchedHooks(tabId: number) {
    const watch = blobWatches.get(tabId);
    if (!watch) throw new Error('Start watching this tab first.');
    const results = await browser.scripting.executeScript({
        target: { tabId, frameIds: [...watch.frames] },
        world: 'MAIN',
        func: testBlobHook,
    });
    const passed = results.filter((item) => item.result?.ok === true).length;
    return {
        ...(await inspectBlobWatch(tabId)),
        hookTest: `${passed} of ${watch.frames.size} frame hook(s) passed. The test creates a tiny blob without downloading it.`,
    };
}

export async function stopBlobWatch(tabId: number) {
    const watch = blobWatches.get(tabId);
    blobWatches.delete(tabId);
    if (watch) {
        const target = { tabId, frameIds: [...watch.frames] };
        await Promise.allSettled([
            browser.scripting.executeScript({
                target,
                world: 'MAIN',
                func: configureBlobHook,
                args: [{ enabled: false }],
            }),
            browser.scripting.executeScript({
                target,
                func: configureBlobBridge,
                args: [{ enabled: false }],
            }),
        ]);
    }
    return watchStatus(tabId);
}

export async function startBlobWatch(message: CommandOf<'watch-start'>) {
    if (
        !Number.isFinite(message.minimumMiB) ||
        message.minimumMiB < 1 ||
        message.minimumMiB >= 64
    ) {
        throw new Error('Choose a threshold of at least 1 MiB and below 64 MiB.');
    }
    await stopBlobWatch(message.tabId);
    const watch: Watch = {
        token: crypto.randomUUID(),
        minimumMiB: message.minimumMiB,
        frames: new Set<number>(),
        count: 0,
        attempts: 0,
        pending: 0,
        chain: Promise.resolve(),
        lastResult: '',
    };
    blobWatches.set(message.tabId, watch);
    const config: HookConfig = {
        enabled: true,
        token: watch.token,
        minimumBytes: message.minimumMiB * 1024 * 1024,
        maximumBytes: blobLimit,
        maxEncodedLength: Math.ceil(blobLimit / 3) * 4 + 4096,
    };
    try {
        const bridges = await browser.scripting.executeScript({
            target: { tabId: message.tabId, allFrames: true },
            func: configureBlobBridge,
            args: [config],
        });
        watch.frames = new Set(
            bridges.filter((item) => item.result?.enabled).map((item) => item.frameId),
        );
        if (!watch.frames.size) throw new Error('This page cannot be watched.');
        const hooks = await browser.scripting.executeScript({
            target: { tabId: message.tabId, frameIds: [...watch.frames] },
            world: 'MAIN',
            func: configureBlobHook,
            args: [config],
        });
        const installed = new Set(
            hooks.filter((item) => item.result?.enabled).map((item) => item.frameId),
        );
        if (!installed.size) throw new Error('Could not hook createObjectURL on this page.');
        watch.frames = new Set([...watch.frames].filter((id) => installed.has(id)));
        if (blobWatches.get(message.tabId) !== watch)
            throw new Error('The page changed while enabling the watcher. Try again.');
        return await inspectBlobWatch(message.tabId);
    } catch (error) {
        await stopBlobWatch(message.tabId);
        throw error;
    }
}

export function receiveAutoBlob(
    message: AutomaticCapture,
    sender: browser.runtime.MessageSender & {
        tab: browser.tabs.Tab & { id: number };
        frameId: number;
    },
) {
    const watch = blobWatches.get(sender.tab.id);
    if (
        !watch ||
        message.token !== watch.token ||
        !watch.frames.has(sender.frameId) ||
        watch.attempts >= 10 ||
        watch.pending >= 2
    ) {
        return Promise.resolve({
            ok: false,
            error: 'No matching watcher, or capture limit reached.',
        });
    }
    watch.attempts++;
    watch.pending++;
    const entry = beginAttempt('automatic', sender.tab.id, sender.frameId, message.url);
    entry.sourcePage = typeof sender.url === 'string' ? sender.url.slice(0, 2000) : '';
    const task = watch.chain.then(async () => {
        try {
            if (blobWatches.get(sender.tab.id) !== watch) throw new Error('Watching stopped.');
            if (typeof message.captureError === 'string')
                throw new Error(message.captureError.slice(0, 1000));
            entry.state = 'reading';
            const blob = await decodeBlobData(message.dataUrl);
            entry.size = blob.size;
            if (blob.size <= watch.minimumMiB * 1024 * 1024) {
                entry.state = 'skipped';
                entry.message = 'Blob does not exceed the size threshold.';
                return { ok: false, error: entry.message };
            }
            const tab = await browser.tabs.get(sender.tab.id);
            if (blobWatches.get(sender.tab.id) !== watch) throw new Error('Watching stopped.');
            const result = await saveBlob(blob, tab, '', false, entry);
            watch.count++;
            watch.lastResult = `Started download ${(blob.size / 1024 / 1024).toFixed(1)} MiB. Check Downloads for completion.`;
            return result;
        } catch (error) {
            failAttempt(entry, error);
            watch.lastResult = errorMessage(error);
            return { ok: false, error: watch.lastResult };
        } finally {
            watch.pending--;
        }
    });
    watch.chain = task;
    return task;
}
