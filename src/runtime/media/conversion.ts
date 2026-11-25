import type { Attempt } from '../../shared/contracts';
import { redactRuleUrl } from '../../shared/rules';
import type { ConversionCommand } from '../../shared/messages';
import { blobLimit } from '../../shared/limits';
import { safeFilename } from '../../shared/filename';
import { beginAttempt, failAttempt } from '../history';
import { readPageBlob } from '../../injected/blob-page';
import { decodeBlobData, saveBlob } from '../downloads';
import { permittedRead } from './read';
import * as HlsConverter from '../../hls/converter';
let conversion:
    { tabId: number; running: boolean; controller: AbortController; entry: Attempt } | undefined;

export function startConversion(message: ConversionCommand, kind: 'hls' | 'blob', rule?: string) {
    if (conversion?.running)
        throw new Error('A conversion is already running. Wait or cancel it first.');
    if (kind === 'hls') HlsConverter.mediaUrl(message.url);
    else if (!message.url?.startsWith('blob:'))
        throw new Error(
            'Select a file Blob URL first. MediaSource streams need their HLS playlist.',
        );
    const entry = beginAttempt(
        kind === 'hls' ? 'hls' : 'convert',
        message.tabId,
        message.frameId || 0,
        message.url,
        message.filename || 'media.mp4',
    );
    if (rule) {
        entry.rule = rule.slice(0, 80);
        entry.url = redactRuleUrl(message.url);
    }
    const job = { tabId: message.tabId, running: true, controller: new AbortController(), entry };
    conversion = job;
    void (async () => {
        const timeout = setTimeout(() => job.controller.abort(), 300000);
        const progress = (text: string) => {
            if (job.controller.signal.aborted || !job.running) return;
            entry.message = text;
            entry.state = text.startsWith('Fetching') ? 'fetching' : 'converting';
        };
        try {
            const tab = await browser.tabs.get(message.tabId);
            entry.sourcePage = rule ? redactRuleUrl(tab.url || '') : tab.url?.slice(0, 2000) || '';
            let files: { name: string; data: Uint8Array }[];
            let video: string;
            let audio: string | undefined;
            if (kind === 'hls') {
                progress('Fetching playlist…');
                const budget = { used: 0 };
                const result = await HlsConverter.collectHls(
                    message.url,
                    ('variant' in message ? message.variant : 0) ?? 0,
                    (url, range) => permittedRead(url, job.controller.signal, budget, range),
                    progress,
                );
                files = result.files;
                video = result.video;
                audio = result.audio;
            } else {
                entry.state = 'reading';
                entry.message = 'Reading file blob…';
                const results = await browser.scripting.executeScript({
                    target: { tabId: message.tabId, frameIds: [message.frameId || 0] },
                    world: 'MAIN',
                    func: readPageBlob,
                    args: [message.url, blobLimit],
                });
                const result = await results[0]?.result;
                if (!result?.ok)
                    throw new Error(
                        result?.error ||
                            'The Blob is unreadable. Use the HLS playlist for MediaSource video.',
                    );
                const blob = await decodeBlobData(result.dataUrl);
                files = [{ name: 'input.bin', data: new Uint8Array(await blob.arrayBuffer()) }];
                video = 'input.bin';
            }
            job.controller.signal.throwIfAborted();
            const output = await HlsConverter.remux(
                files,
                video,
                audio,
                job.controller.signal,
                progress,
            );
            job.controller.signal.throwIfAborted();
            await saveBlob(
                output,
                tab,
                safeFilename(message.filename || 'media.mp4', 'video/mp4').replace(
                    /(?:\.[^.]+)?$/,
                    '.mp4',
                ),
                false,
                entry,
            );
        } catch (error) {
            if (job.controller.signal.aborted) {
                entry.state = 'canceled';
                entry.message = 'Conversion canceled or timed out.';
            } else failAttempt(entry, error);
        } finally {
            clearTimeout(timeout);
            job.running = false;
        }
    })();
}

export function cancelConversion() {
    conversion?.controller.abort();
}
export function conversionState() {
    return conversion
        ? {
              tabId: conversion.tabId,
              running: conversion.running,
              state: conversion.entry.state,
              message: conversion.entry.message,
          }
        : null;
}
export async function probePlaylist(url: string) {
    const bytes = await permittedRead(url, AbortSignal.timeout(30000), { used: 0 });
    const parsed = HlsConverter.parsePlaylist(new TextDecoder().decode(bytes.data), bytes.url);
    return { ok: true, variants: parsed.variants, live: parsed.live };
}
