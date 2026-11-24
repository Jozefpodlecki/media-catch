import { normalizeObservation } from './observation';
import type { MediaObservation } from '../../shared/contracts';
import type { ObservedMedia } from '../../shared/messages';
import { configureMediaObserver } from '../../injected/media-observer';
import { recordMedia, updateMediaRequest } from './catalog';
const networkWatches = new Map<number, string>();
const elementWatches = new Map<
    number,
    { token: string; frames: Set<number>; observations: MediaObservation[] }
>();

export function registerMediaEvents() {
    browser.webRequest.onBeforeRequest.addListener(
        (details) => {
            const pattern = networkWatches.get(details.tabId);
            if (pattern && details.url.toLowerCase().includes(pattern))
                recordMedia(
                    details.tabId,
                    details.frameId,
                    details.url,
                    'network',
                    'Requested',
                    details.requestId,
                );
        },
        { urls: ['http://*/*', 'https://*/*'] },
    );
    browser.webRequest.onCompleted.addListener(
        (details) => {
            updateMediaRequest(details.requestId, `HTTP ${details.statusCode}`);
        },
        { urls: ['http://*/*', 'https://*/*'] },
    );
    browser.webRequest.onErrorOccurred.addListener(
        (details) => {
            updateMediaRequest(details.requestId, details.error);
        },
        { urls: ['http://*/*', 'https://*/*'] },
    );
    browser.tabs.onRemoved.addListener((tabId) => {
        networkWatches.delete(tabId);
        elementWatches.delete(tabId);
    });
    browser.tabs.onUpdated.addListener((tabId, change) => {
        if (change.status === 'loading') elementWatches.delete(tabId);
    });
}
export async function toggleElementWatch(tabId: number, enabled: boolean) {
    const previous = elementWatches.get(tabId);
    elementWatches.delete(tabId);
    if (!enabled) {
        if (previous)
            await browser.scripting
                .executeScript({
                    target: { tabId, allFrames: true },
                    func: configureMediaObserver,
                    args: [{ enabled: false }],
                })
                .catch(() => {});
        return;
    }
    const token = crypto.randomUUID();
    const watch = { token, frames: new Set<number>(), observations: [] as MediaObservation[] };
    elementWatches.set(tabId, watch);
    try {
        const available = await browser.scripting.executeScript({
            target: { tabId, allFrames: true },
            func: () => true,
        });
        watch.frames = new Set(available.map((item) => item.frameId));
        if (!watch.frames.size) throw new Error('No accessible page frames to observe.');
        const results = await browser.scripting.executeScript({
            target: { tabId, frameIds: [...watch.frames] },
            func: configureMediaObserver,
            args: [{ enabled: true, token }],
        });
        watch.frames = new Set(
            results.filter((item) => item.result?.enabled).map((item) => item.frameId),
        );
        if (!watch.frames.size) throw new Error('No accessible page frames to observe.');
    } catch (error) {
        elementWatches.delete(tabId);
        throw error;
    }
}

export function monitoringState(tabId: number) {
    return {
        network: networkWatches.has(tabId),
        pattern: networkWatches.get(tabId) || '.m3u8',
        elements: elementWatches.has(tabId),
        observations: elementWatches.get(tabId)?.observations || [],
    };
}
export async function startNetworkWatch(tabId: number, input = '.m3u8') {
    if (!(await browser.permissions.contains({ origins: ['http://*/*', 'https://*/*'] })))
        throw new Error('Enable media access before monitoring network requests.');
    const pattern = input.replaceAll('*', '').trim().toLowerCase();
    if (!pattern || pattern.length > 80)
        throw new Error('Use a URL substring between 1 and 80 characters.');
    networkWatches.set(tabId, pattern);
}
export function stopNetworkWatch(tabId: number) {
    networkWatches.delete(tabId);
}
export function receiveMediaObservation(
    message: ObservedMedia,
    sender: browser.runtime.MessageSender,
) {
    if (sender.tab?.id === undefined || sender.frameId === undefined) return undefined;
    const watch = elementWatches.get(sender.tab.id);
    if (
        !watch ||
        watch.token !== message.token ||
        !watch.frames.has(sender.frameId!) ||
        !Array.isArray(message.observations)
    )
        return undefined;
    for (const observation of message.observations.slice(0, 50)) {
        if (watch.observations.length >= 100) break;
        const clean = normalizeObservation(observation, sender.frameId);
        if (!clean) continue;
        watch.observations.unshift(clean);
        for (const url of new Set([clean.url, clean.currentSrc]))
            if (url)
                recordMedia(
                    sender.tab.id!,
                    sender.frameId!,
                    url,
                    clean.tag as 'video' | 'source',
                    clean.reason,
                );
    }
    return Promise.resolve({ ok: true });
}
