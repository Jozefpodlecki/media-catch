import type { MediaCommand } from './shared/messages';
import { mediaForTab, clearMedia } from './runtime/media/catalog';
import {
    monitoringState,
    startNetworkWatch,
    stopNetworkWatch,
    toggleElementWatch,
} from './runtime/media/monitoring';
import {
    conversionState,
    startConversion,
    cancelConversion,
    probePlaylist,
} from './runtime/media/conversion';
export function getMediaState(tabId: number) {
    return {
        ok: true,
        ...monitoringState(tabId),
        records: mediaForTab(tabId),
        job: conversionState(),
    };
}
export async function handleMediaCommand(message: MediaCommand) {
    switch (message.action) {
        case 'network-start':
            await startNetworkWatch(message.tabId, message.pattern);
            break;
        case 'network-stop':
            stopNetworkWatch(message.tabId);
            break;
        case 'elements-start':
            await toggleElementWatch(message.tabId, true);
            break;
        case 'elements-stop':
            await toggleElementWatch(message.tabId, false);
            break;
        case 'media-clear':
            clearMedia(message.tabId);
            break;
        case 'conversion-cancel':
            cancelConversion();
            break;
        case 'hls-start':
            startConversion(message, 'hls');
            break;
        case 'blob-remux':
            startConversion(message, 'blob');
            break;
        case 'hls-probe':
            return probePlaylist(message.url);
    }
    return getMediaState('tabId' in message ? (message.tabId ?? -1) : -1);
}
