import { registerRulesRuntime } from './runtime/rules/engine';
import { handleRulesCommand } from './runtime/rules/commands';
import { siteKeyForUrl } from './shared/settings';
import { parseExtensionCommand, parsePageCommand, type ExtensionCommand } from './shared/messages';
import { errorMessage } from './shared/errors';
import { scanTab, downloadBlob, registerDownloadEvents } from './runtime/downloads';
import { getAttemptHistory, clearAttemptHistory } from './runtime/history';
import {
    registerBlobWatchEvents,
    receiveAutoBlob,
    startBlobWatch,
    stopBlobWatch,
    inspectBlobWatch,
    testWatchedHooks,
} from './auto-watch';
import { handleMediaCommand } from './media-runtime';
import { registerMediaEvents, receiveMediaObservation } from './runtime/media/monitoring';
import { handleSettingsCommand } from './runtime/settings/commands';

import {
    scanImages,
    startImageBatch,
    stopImageBatch,
    imageBatchState,
    registerImageEvents,
} from './runtime/images';

registerRulesRuntime();
registerImageEvents();
registerDownloadEvents();
registerBlobWatchEvents();
registerMediaEvents();

async function handleCommand(message: ExtensionCommand) {
    const requiresSource = [
        'scan',
        'download',
        'images-scan',
        'images-download',
        'watch-start',
        'watch-test',
        'network-start',
        'elements-start',
        'hls-start',
        'blob-remux',
    ];
    if (
        'tabId' in message &&
        message.tabId !== undefined &&
        requiresSource.includes(message.action)
    ) {
        const tab = await browser.tabs.get(message.tabId);
        if (!siteKeyForUrl(tab.url || ''))
            throw new Error(
                'Open an HTTP(S) website before capturing media. Browser and extension pages cannot be scanned.',
            );
    }
    switch (message.action) {
        case 'rules-get':
        case 'rules-save':
        case 'rules-remove':
        case 'rules-arm':
        case 'rules-disarm':
        case 'rules-state':
            return handleRulesCommand(message);
        case 'images-scan':
            return scanImages(message.tabId);
        case 'images-state':
            return imageBatchState(message.tabId);
        case 'images-stop':
            return stopImageBatch(message.tabId);
        case 'images-download':
            return startImageBatch(message);
        case 'settings-get':
        case 'settings-update':
        case 'settings-reset':
        case 'settings-defaults':
        case 'settings-clear':
            return handleSettingsCommand(message);
        case 'scan':
            return scanTab(message.tabId);
        case 'download':
            return downloadBlob(message);
        case 'watch-start':
            return startBlobWatch(message);
        case 'watch-stop':
            return stopBlobWatch(message.tabId);
        case 'watch-status':
            return inspectBlobWatch(message.tabId);
        case 'watch-test':
            return testWatchedHooks(message.tabId);
        case 'history-get':
            return { ok: true, entries: getAttemptHistory() };
        case 'history-clear':
            return clearAttemptHistory();
        default:
            return handleMediaCommand(message);
    }
}
browser.runtime.onMessage.addListener((payload: unknown, sender) => {
    if (sender.id !== browser.runtime.id) return undefined;
    const extensionPage =
        typeof sender.url === 'string' && sender.url.startsWith(browser.runtime.getURL(''));
    if (sender.tab && !extensionPage) {
        if (sender.tab.id === undefined || sender.frameId === undefined) return undefined;
        const message = parsePageCommand(payload);
        if (message?.action === 'media-observed') return receiveMediaObservation(message, sender);
        if (message?.action === 'auto-blob')
            return receiveAutoBlob(message, {
                ...sender,
                tab: { ...sender.tab, id: sender.tab.id },
                frameId: sender.frameId,
            });
        return undefined;
    }
    try {
        const message = parseExtensionCommand(payload);
        if (!message) return undefined;
        return handleCommand(message).catch((error: unknown) => ({
            ok: false,
            error: errorMessage(error),
        }));
    } catch (error) {
        return Promise.resolve({ ok: false, error: errorMessage(error) });
    }
});
