import { createRulesRepository } from '../src/runtime/rules/storage';
import { createSettingsRepository } from '../src/runtime/settings/repository';
const previewCommands: string[] = [];
const previewState = document.documentElement.dataset.previewState;
type StorageListener = (
    changes: Record<string, { oldValue?: unknown; newValue?: unknown }>,
    area: string,
) => void;
const storageListeners = new Set<StorageListener>();
const storageChannel = new BroadcastChannel('blob-preview-storage');
storageChannel.onmessage = (event) => {
    for (const listener of storageListeners) listener(event.data, 'local');
};
window.addEventListener('pagehide', () => storageChannel.close());
const localStorageMock = {
    async get(key: string) {
        const value = localStorage.getItem('blob-preview:' + key);
        return value === null ? {} : { [key]: JSON.parse(value) };
    },
    async set(values: Record<string, unknown>) {
        const changes: Record<string, { oldValue?: unknown; newValue?: unknown }> = {};
        for (const [key, value] of Object.entries(values)) {
            const old = await this.get(key);
            localStorage.setItem('blob-preview:' + key, JSON.stringify(value));
            changes[key] = { oldValue: old[key], newValue: value };
        }
        for (const listener of storageListeners) listener(changes, 'local');
        storageChannel.postMessage(changes);
    },
};
const preferences = createSettingsRepository(localStorageMock);
const siteRules = createRulesRepository(localStorageMock);
const previewSession = window.parent as Window & {
    mediaCatchRuleSession?: import('../src/shared/rules').RulesRuntimeState;
};
const ruleRuntime = (previewSession.mediaCatchRuleSession ??= {
    armed: false,
    preview: true,
    origin: '',
    actions: 0,
    pending: 0,
    log: [],
});
const previewTab = { id: 2, url: 'https://example.com/video', title: 'Example video' };
type PreviewTabListener = (
    id: number,
    change: { status: string; url: string },
    tab: typeof previewTab,
) => void;
const tabListeners = new Set<PreviewTabListener>();
const longName =
    'A very long media filename with spaces and a descriptive episode title '.repeat(3) + '.mp4';
const longUrl = 'blob:https://example.com/' + '0123456789abcdef'.repeat(15);
let watching = previewState === 'watching';
let network = false;
let observing = false;
let threshold = 10;
let cleared = false;
let imageBatch: {
    running: boolean;
    total: number;
    started: number;
    failed: number;
    stopped: boolean;
    error: string;
} | null = null;
const previewImages = [
    {
        id: '0:0',
        frameId: 0,
        src: 'https://cdn.example/images/thumb/first.jpg?secure=thumb-token',
        currentSrc: new URL('/images/thumb/first.jpg?secure=thumb-token', location.href).href,
        href: 'https://cdn.example/images/full/first.jpg?secure=full-token',
        alt: 'Linked full-size image',
    },
    {
        id: '0:1',
        frameId: 0,
        src: 'https://cdn.example/images/thumb/second.jpg',
        currentSrc: new URL('/images/thumb/missing.jpg', location.href).href,
        href: '',
        alt: 'Image without a link',
    },
    {
        id: '0:2',
        frameId: 0,
        src: 'https://cdn.example/images/thumb/first.jpg?secure=thumb-token',
        currentSrc: new URL('/images/thumb/first.jpg?secure=thumb-token', location.href).href,
        href: 'https://cdn.example/images/full/first.jpg?secure=full-token',
        alt: 'Duplicate image',
    },
];
const sampleHistory = [
    {
        id: 3,
        mode: 'hls',
        tabId: 2,
        frameId: 0,
        startedAt: '2026-11-23T10:20:00Z',
        state: 'complete',
        filename: 'video.mp4',
        size: 11534336,
        message: 'File saved.',
        sourcePage: 'https://example.com/video',
        url: 'https://cdn.example.com/master.m3u8',
        downloadId: 12,
    },
    {
        id: 2,
        mode: 'manual',
        tabId: 2,
        frameId: 0,
        startedAt: '2026-11-23T10:19:00Z',
        state: 'failed',
        filename: '',
        size: null,
        message: 'This media blob could not be read. It may be a MediaSource stream.',
        sourcePage: 'https://example.com/video',
        url: 'blob:https://example.com/file',
    },
    {
        id: 1,
        mode: 'automatic',
        tabId: 2,
        frameId: 0,
        startedAt: '2026-11-23T10:18:00Z',
        state: 'interrupted',
        filename: 'blob-download.bin',
        size: 11534336,
        message: 'FILE_ACCESS_DENIED',
        sourcePage: 'https://example.com/video',
        url: '',
    },
];
(globalThis as unknown as { browser: unknown }).browser = {
    tabs: {
        async query() {
            if (document.body.dataset.page === 'dashboard')
                return [{ id: 99, url: location.href, title: 'Dashboard' }];
            return [{ ...previewTab }];
        },
        async get(id: number) {
            if (id !== previewTab.id) throw new Error('Source tab is closed.');
            return { ...previewTab };
        },
        onUpdated: {
            addListener(listener: PreviewTabListener) {
                tabListeners.add(listener);
            },
            removeListener(listener: PreviewTabListener) {
                tabListeners.delete(listener);
            },
        },
        previewNavigate(url: string) {
            ruleRuntime.armed = false;
            previewTab.url = url;
            watching = false;
            observing = false;
            for (const listener of tabListeners)
                listener(previewTab.id, { status: 'loading', url }, { ...previewTab });
        },
        async create({ url }: { url: string }) {
            window.open(url, '_blank');
        },
    },
    permissions: {
        async request() {
            return true;
        },
    },
    downloads: {
        async show() {},
    },
    storage: {
        local: localStorageMock,
        onChanged: {
            addListener(listener: StorageListener) {
                storageListeners.add(listener);
            },
            removeListener(listener: StorageListener) {
                storageListeners.delete(listener);
            },
        },
    },
    runtime: {
        previewCommands,
        getURL(path: string) {
            const page = path.startsWith('index.html')
                ? path.replace('index.html', 'preview-index.html')
                : 'preview-history.html';
            return new URL('/' + page, location.origin).href;
        },
        async sendMessage(message: Record<string, unknown>) {
            previewCommands.push(String(message.action));
            if (previewCommands.length > 1000) previewCommands.shift();
            switch (message.action) {
                case 'rules-get':
                    return { ok: true, document: await siteRules.get() };
                case 'rules-save': {
                    const document = await siteRules.save(
                        message.origin as string,
                        message.rule as import('../src/shared/rules').SiteRule,
                    );
                    Object.assign(ruleRuntime, { armed: false });
                    return { ok: true, document };
                }
                case 'rules-remove':
                    Object.assign(ruleRuntime, { armed: false });
                    return {
                        ok: true,
                        document: await siteRules.remove(
                            message.origin as string,
                            message.id as string,
                        ),
                    };
                case 'rules-state':
                    return { ok: true, runtime: ruleRuntime };
                case 'rules-arm':
                    Object.assign(ruleRuntime, {
                        armed: true,
                        preview: Boolean(message.preview),
                        origin: new URL(previewTab.url).origin,
                    });
                    return { ok: true, runtime: ruleRuntime };
                case 'rules-disarm':
                    Object.assign(ruleRuntime, { armed: false });
                    return { ok: true, runtime: ruleRuntime };
                case 'images-scan':
                    return { ok: true, images: previewImages, truncated: false };
                case 'images-state':
                    return { ok: true, batch: imageBatch };
                case 'images-stop':
                    if (imageBatch) {
                        imageBatch.running = false;
                        imageBatch.stopped = true;
                    }
                    return { ok: true, batch: imageBatch };
                case 'images-download': {
                    const urls = [
                        ...new Set((message.items as { url: string }[]).map((item) => item.url)),
                    ];
                    imageBatch = {
                        running: false,
                        total: urls.length,
                        started: urls.length,
                        failed: 0,
                        stopped: false,
                        error: '',
                    };
                    return { ok: true, batch: imageBatch };
                }
                case 'settings-get':
                    return { ok: true, settings: await preferences.get() };
                case 'settings-update':
                    return {
                        ok: true,
                        settings: await preferences.update({
                            type: 'siteUpdated',
                            siteKey: String(message.siteKey),
                            patch: message.patch as Record<string, never>,
                        }),
                    };
                case 'settings-reset':
                    return {
                        ok: true,
                        settings: await preferences.update({
                            type: 'siteReset',
                            siteKey: String(message.siteKey),
                        }),
                    };
                case 'settings-defaults':
                    return {
                        ok: true,
                        settings: await preferences.update({
                            type: 'defaultsUpdated',
                            patch: message.patch as Record<string, never>,
                        }),
                    };
                case 'settings-clear':
                    return {
                        ok: true,
                        settings: await preferences.update({ type: 'sitesCleared' }),
                    };
                case 'scan':
                    if (previewState === 'error')
                        return { ok: false, error: 'Open a source webpage before scanning.' };
                    if (previewState === 'loading')
                        await new Promise((resolve) => setTimeout(resolve, 2000));
                    return {
                        ok: true,
                        frames: [
                            {
                                frameId: 0,
                                page: 'https://example.com/video',
                                blobs:
                                    previewState === 'empty'
                                        ? []
                                        : [
                                              {
                                                  url:
                                                      previewState === 'long'
                                                          ? longUrl
                                                          : 'blob:https://example.com/file',
                                                  filename: previewState === 'long' ? longName : '',
                                                  source: 'video',
                                              },
                                          ],
                            },
                        ],
                    };
                case 'history-get':
                    return {
                        ok: true,
                        entries:
                            cleared || previewState === 'empty'
                                ? []
                                : previewState === 'long'
                                  ? sampleHistory.map((item) => ({
                                        ...item,
                                        filename: longName,
                                        url: longUrl,
                                    }))
                                  : sampleHistory,
                    };
                case 'history-clear':
                    cleared = true;
                    return { ok: true };
                case 'watch-start':
                    watching = true;
                    threshold = Number(message.minimumMiB);
                    break;
                case 'watch-stop':
                    watching = false;
                    break;
                case 'network-start':
                    network = true;
                    break;
                case 'network-stop':
                    network = false;
                    break;
                case 'elements-start':
                    observing = true;
                    break;
                case 'elements-stop':
                    observing = false;
                    break;
                case 'hls-probe':
                    return {
                        ok: true,
                        live: false,
                        variants: [
                            {
                                url: 'https://cdn.example.com/1080.m3u8',
                                label: '1920x1080 · 4.8 Mbps',
                                bandwidth: 4800000,
                            },
                            {
                                url: 'https://cdn.example.com/720.m3u8',
                                label: '1280x720 · 2.4 Mbps',
                                bandwidth: 2400000,
                            },
                            {
                                url: 'https://cdn.example.com/480.m3u8',
                                label: '854x480 · 1.2 Mbps',
                                bandwidth: 1200000,
                            },
                        ],
                    };
                case 'download':
                    return { ok: true, size: 11534336 };
            }
            if (String(message.action).startsWith('watch-'))
                return {
                    ok: true,
                    enabled: watching,
                    minimumMiB: threshold,
                    count: 0,
                    attempts: 0,
                    lastResult: '',
                    diagnosticError: '',
                    hookTest: '1 of 1 frame hooks passed. No download created.',
                    diagnostics: watching
                        ? [
                              {
                                  frameId: 0,
                                  attached: true,
                                  lastSize: 100,
                                  counters: {
                                      calls: 4,
                                      blobs: 3,
                                      streams: 1,
                                      queued: 0,
                                      captured: 0,
                                      belowThreshold: 3,
                                      overLimit: 0,
                                      duplicates: 0,
                                      busy: 0,
                                      acknowledged: 0,
                                      rejected: 0,
                                      bridgeTimeouts: 0,
                                  },
                              },
                          ]
                        : [],
                };
            return {
                ok: true,
                network,
                pattern: '.m3u8',
                elements: observing,
                observations: observing
                    ? [
                          {
                              tag: 'source',
                              url: 'https://cdn.example.com/master.m3u8',
                              currentSrc: '',
                              reason: 'attribute:src',
                              type: 'application/vnd.apple.mpegurl',
                              time: new Date().toISOString(),
                          },
                      ]
                    : [],
                records:
                    previewState === 'empty'
                        ? []
                        : [
                              {
                                  id: 1,
                                  tabId: 2,
                                  frameId: 0,
                                  url: 'https://cdn.example.com/master.m3u8',
                                  source: 'network',
                                  time: new Date().toISOString(),
                                  status: 'HTTP 200',
                                  kind: 'HLS',
                              },
                          ],
                job: null,
            };
        },
    },
};
