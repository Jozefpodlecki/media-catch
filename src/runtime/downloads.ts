import type { Attempt } from '../shared/contracts';
import { redactRuleUrl } from '../shared/rules';
import type { CommandOf } from '../shared/messages';
import { safeFilename } from '../shared/filename';
import { blobLimit } from '../shared/limits';
import { scanPageBlobs, readPageBlob } from '../injected/blob-page';
import {
    beginAttempt,
    failAttempt,
    updateDownloadAttempt,
    getDownloadAttempt,
    trackDownloadAttempt,
} from './history';
const liveDownloads = new Map<number, string>();
const pendingTabs = new Set<number>();
export function registerDownloadEvents() {
    browser.downloads.onChanged.addListener((delta) => {
        updateDownloadAttempt(
            getDownloadAttempt(delta.id),
            delta.state?.current,
            delta.error?.current,
            delta.filename?.current,
        );
        if (['complete', 'interrupted'].includes(delta.state?.current || '')) {
            const url = liveDownloads.get(delta.id);
            if (url) URL.revokeObjectURL(url);
            liveDownloads.delete(delta.id);
        }
    });
}
export async function scanTab(tabId: number) {
    const results = await browser.scripting.executeScript({
        target: { tabId, allFrames: true },
        func: scanPageBlobs,
    });
    const frames = results
        .filter((item) => item.result)
        .map((item) => ({ frameId: item.frameId, ...item.result }));
    if (!frames.length)
        throw new Error('This page cannot be read. Open a normal website and try again.');
    return { ok: true, frames };
}

export async function downloadBlob(message: CommandOf<'download'>, rule?: string) {
    if (pendingTabs.has(message.tabId))
        throw new Error('A download attempt is already running for this tab.');
    if (typeof message.url !== 'string' || !message.url.startsWith('blob:')) {
        throw new Error('Enter a URL beginning with blob:.');
    }
    pendingTabs.add(message.tabId);
    const entry = beginAttempt(
        rule ? 'rule' : 'manual',
        message.tabId,
        message.frameId,
        message.url,
        message.filename,
    );
    if (rule) {
        entry.rule = rule.slice(0, 80);
        entry.url = redactRuleUrl(message.url);
    }
    try {
        const tab = await browser.tabs.get(message.tabId);
        entry.sourcePage = rule
            ? redactRuleUrl(tab.url || '')
            : typeof tab.url === 'string'
              ? tab.url.slice(0, 2000)
              : '';
        const results = await browser.scripting.executeScript({
            target: { tabId: message.tabId, frameIds: [message.frameId] },
            world: 'MAIN',
            func: readPageBlob,
            args: [message.url, blobLimit],
        });
        const result = await results[0]?.result;
        if (!result?.ok) {
            throw new Error(
                typeof result?.error === 'string'
                    ? result.error.slice(0, 1000)
                    : 'The frame is no longer available. Rescan the page.',
            );
        }
        const blob = await decodeBlobData(result.dataUrl);
        return await saveBlob(blob, tab, message.filename, !rule, entry);
    } catch (error) {
        failAttempt(entry, error);
        throw error;
    } finally {
        pendingTabs.delete(message.tabId);
    }
}

export async function decodeBlobData(dataUrl: unknown) {
    if (
        typeof dataUrl !== 'string' ||
        dataUrl.length > Math.ceil(blobLimit / 3) * 4 + 4096 ||
        !/^data:[^,]{0,4096};base64,[A-Za-z0-9+/]*={0,2}$/.test(dataUrl)
    ) {
        throw new Error('The page returned invalid or oversized blob data.');
    }
    const blob = await (await fetch(dataUrl)).blob();
    if (blob.size > blobLimit) throw new Error('This blob exceeds the 64 MiB limit.');
    return blob;
}

export async function saveBlob(
    blob: Blob,
    tab: browser.tabs.Tab,
    filename: string | undefined,
    saveAs: boolean,
    entry: Attempt,
) {
    entry.size = blob.size;
    entry.filename = safeFilename(filename, blob.type);
    entry.state = 'starting';
    const localUrl = URL.createObjectURL(blob);
    const result = await startDownload(localUrl, tab, entry.filename, saveAs, entry, localUrl);
    return { ...result, size: blob.size };
}

export function saveRemoteFile(
    url: string,
    tab: browser.tabs.Tab,
    filename: string,
    entry: Attempt,
) {
    return startDownload(url, tab, filename, false, entry);
}

async function startDownload(
    url: string,
    tab: browser.tabs.Tab,
    filename: string,
    saveAs: boolean,
    entry: Attempt,
    localUrl?: string,
) {
    entry.filename = safeFilename(filename, '');
    entry.state = 'starting';
    let id;
    try {
        id = await browser.downloads.download({
            url,
            filename: safeFilename(filename, ''),
            saveAs,
            incognito: Boolean(tab.incognito),
            conflictAction: 'uniquify',
        });
        if (localUrl) liveDownloads.set(id, localUrl);
        entry.downloadId = id;
        entry.state = 'in_progress';
        entry.message = 'Started; waiting for the browser to finish saving.';
        trackDownloadAttempt(id, entry);
        try {
            const [download] = await browser.downloads.search({ id });
            updateDownloadAttempt(entry, download?.state, download?.error, download?.filename);
            if (localUrl && download && download.state !== 'in_progress') {
                liveDownloads.delete(id);
                URL.revokeObjectURL(localUrl);
            }
        } catch {}
    } catch (error) {
        if (id === undefined && localUrl) URL.revokeObjectURL(localUrl);
        throw error;
    }
    return { ok: true, id };
}
