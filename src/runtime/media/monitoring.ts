import { publishRuleEvent } from '../rules/events';
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

const ruleElementWatches = new Map<
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
            if (
                details.tabId >= 0 &&
                details.frameId >= 0 &&
                details.statusCode >= 200 &&
                details.statusCode < 400 &&
                typeof details.url === 'string'
            ) {
                const mediaType = details.responseHeaders
                    ?.find((header) => header.name.toLowerCase() === 'content-type')
                    ?.value?.slice(0, 100);
                publishRuleEvent({
                    tabId: details.tabId,
                    frameId: details.frameId,
                    trigger: 'network',
                    url: details.url,
                    mediaType,
                    reason: 'request-completed',
                });
            }
        },
        { urls: ['http://*/*', 'https://*/*'] },
        ['responseHeaders'],
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
        ruleElementWatches.delete(tabId);
    });
    browser.tabs.onUpdated.addListener((tabId, change) => {
        if (change.status === 'loading') {
            elementWatches.delete(tabId);
            ruleElementWatches.delete(tabId);
        }
    });
}
export async function toggleElementWatch(
    tabId: number,
    enabled: boolean,
    scope: 'manual' | 'rules' = 'manual',
) {
    const watches = scope === 'rules' ? ruleElementWatches : elementWatches;
    const previous = watches.get(tabId);
    watches.delete(tabId);
    if (!enabled) {
        if (previous)
            await browser.scripting
                .executeScript({
                    target: { tabId, allFrames: true },
                    func: configureMediaObserver,
                    args: [{ enabled: false, token: previous.token, scope }],
                })
                .catch(() => {});
        return;
    }
    const token = crypto.randomUUID();
    const watch = { token, frames: new Set<number>(), observations: [] as MediaObservation[] };
    watches.set(tabId, watch);
    try {
        const available = await browser.scripting.executeScript({
            target: { tabId, allFrames: true },
            func: () => true,
        });
        if (watches.get(tabId) !== watch) return;
        watch.frames = new Set(available.map((item) => item.frameId));
        if (!watch.frames.size) throw new Error('No accessible page frames to observe.');
        const results = await browser.scripting.executeScript({
            target: { tabId, frameIds: [...watch.frames] },
            func: configureMediaObserver,
            args: [{ enabled: true, token, scope }],
        });
        if (watches.get(tabId) !== watch) {
            await browser.scripting
                .executeScript({
                    target: { tabId, allFrames: true },
                    func: configureMediaObserver,
                    args: [{ enabled: false, token, scope }],
                })
                .catch(() => {});
            return;
        }
        watch.frames = new Set(
            results.filter((item) => item.result?.enabled).map((item) => item.frameId),
        );
        if (!watch.frames.size) throw new Error('No accessible page frames to observe.');
    } catch (error) {
        if (watches.get(tabId) === watch) watches.delete(tabId);
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
    const watch = [elementWatches.get(sender.tab.id), ruleElementWatches.get(sender.tab.id)].find(
        (candidate) => candidate?.token === message.token,
    );
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
        for (const url of new Set([
            clean.reason === 'attribute:src' ? clean.url : clean.currentSrc || clean.url,
        ])) {
            if (
                url &&
                watch === ruleElementWatches.get(sender.tab.id) &&
                clean.reason !== 'existing'
            )
                publishRuleEvent({
                    tabId: sender.tab.id,
                    frameId: sender.frameId,
                    trigger: 'dom',
                    url,
                    mediaType: clean.type,
                    reason: clean.reason,
                });
        }
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
