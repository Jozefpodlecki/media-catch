export interface DetectedMedia {
    id: number;
    tabId: number;
    frameId: number;
    url: string;
    source: 'network' | 'video' | 'source';
    time: string;
    status: string;
    requestId?: string;
    kind: string;
}
const detectedMedia: DetectedMedia[] = [];
let nextMediaId = 1;
export function recordMedia(
    tabId: number,
    frameId: number,
    url: string,
    source: DetectedMedia['source'],
    status: string,
    requestId?: string,
) {
    if (!/^(https?:|blob:)/.test(url) || url.length > 16384) return;
    const prior = detectedMedia.find(
        (item) => item.tabId === tabId && item.url === url && item.source === source,
    );
    if (prior) {
        prior.status = status;
        prior.time = new Date().toISOString();
        if (requestId) prior.requestId = requestId;
        return;
    }
    detectedMedia.unshift({
        id: nextMediaId++,
        tabId,
        frameId,
        url,
        source,
        status,
        requestId,
        time: new Date().toISOString(),
        kind: url.toLowerCase().includes('.m3u8')
            ? 'HLS'
            : url.startsWith('blob:')
              ? 'Blob / stream'
              : 'Media',
    });
    if (detectedMedia.length > 100) detectedMedia.pop();
}

export function mediaForTab(tabId: number) {
    return detectedMedia.filter((item) => item.tabId === tabId);
}
export function updateMediaRequest(requestId: string, status: string) {
    const item = detectedMedia.find((item) => item.requestId === requestId);
    if (item) item.status = status;
}
export function clearMedia(tabId: number) {
    for (let index = detectedMedia.length - 1; index >= 0; index--)
        if (detectedMedia[index].tabId === tabId) detectedMedia.splice(index, 1);
}
