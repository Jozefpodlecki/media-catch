import type { Attempt } from '../shared/contracts';
import { safeFilename } from '../shared/filename';
const attemptHistory: Attempt[] = [];
const downloadAttempts = new Map<number, Attempt>();
let nextAttemptId = 1;

export function beginAttempt(
    mode: string,
    tabId: number,
    frameId: number,
    url = '',
    filename = '',
): Attempt {
    const entry: Attempt = {
        id: nextAttemptId++,
        mode,
        tabId,
        frameId,
        startedAt: new Date().toISOString(),
        state: mode === 'automatic' ? 'queued' : 'reading',
        url: typeof url === 'string' && /^(blob:|https?:)/.test(url) ? url.slice(0, 2000) : '',
        sourcePage: '',
        filename: filename ? safeFilename(filename, '') : '',
        size: null,
        message: '',
    };
    attemptHistory.push(entry);
    if (attemptHistory.length > 100) {
        const removed = attemptHistory.shift()!;
        if (
            removed.downloadId !== undefined &&
            downloadAttempts.get(removed.downloadId) === removed
        ) {
            downloadAttempts.delete(removed.downloadId);
        }
    }
    return entry;
}

export function failAttempt(entry: Attempt, error: unknown) {
    entry.state = 'failed';
    entry.message = String(
        (error instanceof Error ? error.message : error) || error || 'Unknown failure',
    ).slice(0, 1000);
}

export function updateDownloadAttempt(
    entry: Attempt | undefined,
    state?: string,
    error?: string,
    filename?: string,
) {
    if (!entry) return;
    if (typeof error === 'string') entry.browserError = error.slice(0, 1000);
    const reason = entry.browserError;
    if (typeof filename === 'string') entry.filename = safeFilename(filename, '');
    if (state === 'complete') {
        entry.state = 'complete';
        entry.message = 'File saved.';
    }
    if (state === 'interrupted') {
        entry.state = reason === 'USER_CANCELED' ? 'canceled' : 'interrupted';
        entry.message = reason || 'The browser interrupted this download.';
    } else if (typeof error === 'string' && ['interrupted', 'canceled'].includes(entry.state)) {
        entry.state = error === 'USER_CANCELED' ? 'canceled' : 'interrupted';
        entry.message = error.slice(0, 1000);
    }
}

export function clearAttemptHistory() {
    attemptHistory.length = 0;
    downloadAttempts.clear();
    return { ok: true };
}

function hasAttempt(entry: Attempt) {
    return attemptHistory.includes(entry);
}
export function trackDownloadAttempt(downloadId: number, entry: Attempt) {
    if (hasAttempt(entry)) downloadAttempts.set(downloadId, entry);
}
export function getDownloadAttempt(downloadId: number) {
    return downloadAttempts.get(downloadId);
}
export function getAttemptHistory() {
    return attemptHistory
        .slice()
        .reverse()
        .map((entry) => ({ ...entry }));
}
