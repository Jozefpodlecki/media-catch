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

registerImageEvents();
registerDownloadEvents();
registerBlobWatchEvents();
registerMediaEvents();

async function handleCommand(message: ExtensionCommand) {
    switch (message.action) {
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
