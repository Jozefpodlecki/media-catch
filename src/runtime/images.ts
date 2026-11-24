import { scanPageImages } from '../injected/images';
import { imageLimit, imageUrl, type ImageCandidate, type ImageBatch } from '../shared/images';
import type { CommandOf } from '../shared/messages';
import { safeFilename } from '../shared/filename';
import { errorMessage } from '../shared/errors';
import { beginAttempt, failAttempt } from './history';
import { saveRemoteFile } from './downloads';

const batches = new Map<number, ImageBatch>();

export function registerImageEvents() {
    browser.tabs.onRemoved.addListener((tabId) => {
        const batch = batches.get(tabId);
        if (batch?.running) batch.stopped = true;
        batches.delete(tabId);
    });
}

export async function scanImages(tabId: number) {
    const results = await browser.scripting.executeScript({
        target: { tabId, allFrames: true },
        func: scanPageImages,
    });
    const images: ImageCandidate[] = [];
    let truncated = false;
    for (const frame of results) {
        if (!frame.result) continue;
        truncated ||= frame.result.truncated;
        for (const item of frame.result.images) {
            if (images.length >= imageLimit) {
                truncated = true;
                break;
            }
            const clean = (value: string) => {
                try {
                    return imageUrl(value);
                } catch {
                    return '';
                }
            };
            const src = clean(item.src);
            const currentSrc = clean(item.currentSrc);
            const href = clean(item.href);
            if (!src && !currentSrc && !href) continue;
            images.push({
                id: `${frame.frameId}:${images.length}`,
                frameId: frame.frameId,
                src,
                currentSrc,
                href,
                alt: typeof item.alt === 'string' ? item.alt.slice(0, 300) : '',
                kind: ['srcset', 'lazy', 'background', 'link'].includes(item.kind)
                    ? item.kind
                    : 'image',
            });
        }
    }
    if (!results.some((frame) => frame.result))
        throw new Error('This page cannot be read. Open a source webpage first.');
    return { ok: true, images, truncated };
}

export function imageBatchState(tabId: number) {
    const batch = batches.get(tabId);
    return { ok: true, batch: batch ? { ...batch } : null };
}

export function stopImageBatch(tabId: number) {
    const batch = batches.get(tabId);
    if (batch?.running) batch.stopped = true;
    return imageBatchState(tabId);
}

export async function startImageBatch(message: CommandOf<'images-download'>) {
    if (batches.get(message.tabId)?.running)
        throw new Error('Image downloads are already being queued for this tab.');
    const items = message.items.map((item) => ({ ...item, url: imageUrl(item.url) }));
    const unique = items.filter(
        (item, index) => items.findIndex((other) => other.url === item.url) === index,
    );
    const tab = await browser.tabs.get(message.tabId);
    if (batches.get(message.tabId)?.running)
        throw new Error('Image downloads are already being queued for this tab.');
    const batch: ImageBatch = {
        running: true,
        total: unique.length,
        started: 0,
        failed: 0,
        stopped: false,
        error: '',
    };
    batches.set(message.tabId, batch);
    void (async () => {
        try {
            for (const item of unique) {
                if (batch.stopped) break;
                const url = new URL(item.url);
                let filename = url.pathname.split('/').pop() || 'image';
                try {
                    filename = decodeURIComponent(filename);
                } catch {}
                const entry = beginAttempt(
                    'image',
                    message.tabId,
                    item.frameId,
                    item.url,
                    safeFilename(filename, ''),
                );
                entry.sourcePage = tab.url?.slice(0, 2000) || '';
                try {
                    await saveRemoteFile(item.url, tab, filename, entry);
                    batch.started++;
                } catch (error) {
                    failAttempt(entry, error);
                    batch.failed++;
                    batch.error = errorMessage(error).slice(0, 1000);
                }
            }
        } finally {
            batch.running = false;
        }
    })();
    return imageBatchState(message.tabId);
}
