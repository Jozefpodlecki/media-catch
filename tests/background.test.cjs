const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

function setup() {
    const state = { downloads: [], revoked: [], failFetch: false, oversized: false };
    class TestFileReader {
        readAsDataURL(blob) {
            blob.arrayBuffer().then((bytes) => {
                this.result = `data:${blob.type};base64,${Buffer.from(bytes).toString('base64')}`;
                this.onload();
            });
        }
    }
    const browser = {
        webRequest: {
            onBeforeRequest: { addListener() {} },
            onCompleted: { addListener() {} },
            onErrorOccurred: { addListener() {} },
        },
        runtime: {
            id: 'test',
            getURL(path) {
                return 'moz-extension://test/' + path;
            },
            onMessage: {
                addListener(fn) {
                    state.message = fn;
                },
            },
        },
        tabs: {
            async get(id) {
                return { id, incognito: true, url: 'https://example.com/source' };
            },
            onRemoved: {
                addListener(fn) {
                    const previous = state.tabRemoved;
                    state.tabRemoved = (...args) => {
                        previous?.(...args);
                        fn(...args);
                    };
                },
            },
            onUpdated: {
                addListener(fn) {
                    const previous = state.tabUpdated;
                    state.tabUpdated = (...args) => {
                        previous?.(...args);
                        fn(...args);
                    };
                },
            },
        },
        scripting: {
            async executeScript(options) {
                state.lastTarget = options.target;
                state.lastWorld = options.world;
                if (
                    options.func.name === 'configureBlobBridge' ||
                    options.func.name === 'configureBlobHook'
                ) {
                    state.watchConfig = options.args[0];
                    return [{ frameId: 0, result: { enabled: options.args[0].enabled } }];
                }
                if (options.func.name === 'readPageBlob') {
                    state.onRead?.();
                    await state.pauseRead;
                }
                if (state.injectedResult) return [{ frameId: 0, result: state.injectedResult }];
                return [{ frameId: 0, result: await options.func(...(options.args || [])) }];
            },
        },
        downloads: {
            onChanged: {
                addListener(fn) {
                    state.changed = fn;
                },
            },
            async download(options) {
                if (state.downloadError) throw new Error(state.downloadError);
                state.downloads.push(options);
                return 7;
            },
            async search() {
                if (state.searchError) throw new Error('Status unavailable');
                return [{ state: state.downloadState || 'in_progress' }];
            },
        },
    };
    const context = vm.createContext({
        browser,
        Blob,
        FileReader: TestFileReader,
        AbortController,
        setTimeout,
        clearTimeout,
        crypto: require('node:crypto').webcrypto,
        URL: {
            createObjectURL() {
                return 'blob:extension/test';
            },
            revokeObjectURL(url) {
                state.revoked.push(url);
            },
        },
        location: { href: 'https://example.com/' },
        document: {
            title: 'Test',
            querySelectorAll(selector) {
                if (selector === 'video, audio')
                    return state.media ? [{ currentSrc: state.request.url }] : [];
                return [
                    {
                        localName: 'a',
                        getAttribute(name) {
                            return (
                                { href: 'blob:https://example.com/file', download: 'sample.txt' }[
                                    name
                                ] || null
                            );
                        },
                    },
                ];
            },
        },
        performance: {
            getEntriesByType() {
                return [{ name: 'blob:https://example.com/file' }];
            },
        },
        async fetch(url) {
            if (url.startsWith('data:')) return fetch(url);
            if (state.failFetch) throw new TypeError('Failed to fetch');
            return {
                ok: true,
                headers: {
                    get(name) {
                        return name === 'content-type'
                            ? 'text/plain'
                            : state.oversized
                              ? '999999999'
                              : '5';
                    },
                },
                body: new ReadableStream({
                    start(controller) {
                        controller.enqueue(new TextEncoder().encode('hello'));
                        controller.close();
                    },
                }),
            };
        },
    });
    vm.runInContext(
        fs.readFileSync(require.resolve('../extension/background.js'), 'utf8'),
        context,
    );
    state.send = (message) => state.message(message, { id: 'test' });
    state.request = {
        action: 'download',
        tabId: 2,
        frameId: 0,
        url: 'blob:https://example.com/file',
        filename: '../hello.txt',
    };
    return state;
}

test('scan deduplicates DOM and resource URLs and retains the filename', async () => {
    const state = setup();
    const result = await state.send({ action: 'scan', tabId: 2 });
    assert.equal(result.ok, true);
    assert.equal(result.frames[0].blobs.length, 1);
    assert.equal(result.frames[0].blobs[0].filename, 'sample.txt');
});

test('runtime validates command payloads before accessing a tab or reading bytes', async () => {
    const state = setup();
    for (const payload of [null, [], { action: 'toString' }, { action: 'not-a-command' }]) {
        assert.equal(state.send(payload), undefined);
    }
    for (const payload of [
        { action: 'scan', tabId: -1 },
        { action: 'scan', tabId: '2' },
        { ...state.request, frameId: -1 },
        { ...state.request, filename: {} },
        { action: 'network-start', tabId: 2, pattern: [] },
        { action: 'hls-start', tabId: 2, url: 'https://example.com/a.m3u8', variant: -1 },
    ]) {
        const result = await state.send(payload);
        assert.equal(result.ok, false);
        assert.match(result.error, /Invalid extension command/);
    }
    assert.equal(state.downloads.length, 0);
    assert.equal(state.lastTarget, undefined);
});

test('download reads page bytes, preserves private mode, sanitizes filename, and releases URL on completion', async () => {
    const state = setup();
    const result = await state.send(state.request);
    assert.equal(result.ok, true);
    assert.equal(result.size, 5);
    assert.equal(state.lastTarget.frameIds[0], 0);
    assert.equal(state.lastWorld, 'MAIN');
    assert.equal(state.downloads[0].incognito, true);
    assert.equal(state.downloads[0].saveAs, true);
    assert.equal(state.downloads[0].filename, 'hello.txt');
    assert.equal(state.revoked.length, 0);
    state.changed({ id: 7, state: { current: 'complete' } });
    assert.deepEqual(state.revoked, ['blob:extension/test']);
});

test('download handles completion before the download promise resolves', async () => {
    const state = setup();
    state.downloadState = 'complete';
    assert.equal((await state.send(state.request)).ok, true);
    assert.deepEqual(state.revoked, ['blob:extension/test']);
});

test('invalid URLs, revoked blobs, and oversized blobs never start downloads', async () => {
    const state = setup();
    assert.equal((await state.send({ ...state.request, url: 'https://example.com/' })).ok, false);
    state.failFetch = true;
    const revoked = await state.send(state.request);
    assert.match(revoked.error, /revoked/);
    state.failFetch = false;
    state.oversized = true;
    assert.match((await state.send(state.request)).error, /64 MiB/);
    assert.equal(state.downloads.length, 0);
});

test('rejects messages sent by content scripts', () => {
    const state = setup();
    assert.equal(state.message(state.request, { id: 'test', tab: { id: 2 } }), undefined);
});

test('failed media reads explain stream limitations without claiming a confirmed cause', async () => {
    const state = setup();
    state.failFetch = true;
    state.media = true;
    const result = await state.send(state.request);
    assert.equal(result.ok, false);
    assert.match(result.error, /may be a streaming MediaSource/);
    assert.equal(state.downloads.length, 0);
});

test('untrusted page results cannot trigger a background network request', async () => {
    const state = setup();
    for (const dataUrl of ['https://example.com/private', 'data:text/plain,hello']) {
        state.injectedResult = { ok: true, dataUrl };
        const result = await state.send(state.request);
        assert.equal(result.ok, false);
        assert.match(result.error, /invalid or oversized/);
    }
    assert.equal(state.downloads.length, 0);
});

test('download size and type come from validated bytes rather than page metadata', async () => {
    const state = setup();
    state.injectedResult = {
        ok: true,
        dataUrl: 'data:text/plain;base64,aGVsbG8=',
        size: 999999999,
        type: 'video/mp4',
    };
    const result = await state.send({ ...state.request, filename: '' });
    assert.equal(result.ok, true);
    assert.equal(result.size, 5);
    assert.equal(state.downloads[0].filename, 'blob-download.txt');
});

test('automatic downloads require explicit tab, frame, and session authorization', async () => {
    const state = setup();
    const sender = { id: 'test', tab: { id: 2 }, frameId: 0 };
    const capture = {
        action: 'auto-blob',
        token: 'unknown',
        dataUrl: 'data:text/plain;base64,aGVsbG8=',
    };
    assert.equal((await state.message(capture, sender)).ok, false);
    assert.equal((await state.send({ action: 'watch-start', tabId: 2, minimumMiB: 10 })).ok, true);
    const token = state.watchConfig.token;
    assert.equal((await state.message({ ...capture, token }, { ...sender, frameId: 9 })).ok, false);
    assert.equal((await state.message(capture, sender)).ok, false);
    assert.equal(state.downloads.length, 0);
});

test('automatic downloads recheck decoded size, use Downloads without Save As, and stop on navigation', async () => {
    const state = setup();
    await state.send({ action: 'watch-start', tabId: 2, minimumMiB: 1 });
    const token = state.watchConfig.token;
    const sender = { id: 'test', tab: { id: 2 }, frameId: 0 };
    const capture = {
        action: 'auto-blob',
        token,
        dataUrl:
            'data:application/octet-stream;base64,' + Buffer.alloc(1024 * 1024).toString('base64'),
    };
    assert.equal(
        (await state.message(capture, sender)).ok,
        false,
        'Exactly the threshold is excluded',
    );
    capture.dataUrl =
        'data:application/octet-stream;base64,' + Buffer.alloc(1024 * 1024 + 1).toString('base64');
    assert.equal((await state.message(capture, sender)).ok, true);
    assert.equal(state.downloads[0].saveAs, false);
    assert.equal(state.downloads[0].incognito, true);
    assert.equal(state.downloads[0].conflictAction, 'uniquify');
    assert.equal((await state.send({ action: 'watch-status', tabId: 2 })).count, 1);
    state.tabUpdated(2, { status: 'loading' });
    assert.equal((await state.message(capture, sender)).ok, false);
    assert.equal((await state.send({ action: 'watch-status', tabId: 2 })).enabled, false);
});

test('watcher rejects invalid criteria and untrusted network URLs; stop revokes authorization', async () => {
    const state = setup();
    for (const minimumMiB of [0, 64, NaN, '10']) {
        assert.equal((await state.send({ action: 'watch-start', tabId: 2, minimumMiB })).ok, false);
    }
    await state.send({ action: 'watch-start', tabId: 2, minimumMiB: 10 });
    const capture = {
        action: 'auto-blob',
        token: state.watchConfig.token,
        dataUrl: 'https://example.com/private',
    };
    const sender = { id: 'test', tab: { id: 2 }, frameId: 0 };
    assert.match((await state.message(capture, sender)).error, /invalid/);
    await state.send({ action: 'watch-stop', tabId: 2 });
    assert.equal((await state.message(capture, sender)).ok, false);
    assert.equal(state.downloads.length, 0);
});

test('background limits automatic capture attempts across the tab', async () => {
    const state = setup();
    await state.send({ action: 'watch-start', tabId: 2, minimumMiB: 10 });
    const capture = {
        action: 'auto-blob',
        token: state.watchConfig.token,
        dataUrl: 'https://example.com/private',
    };
    const sender = { id: 'test', tab: { id: 2 }, frameId: 0 };
    for (let n = 0; n < 10; n++) await state.message(capture, sender);
    assert.match((await state.message(capture, sender)).error, /limit reached/);
    assert.equal((await state.send({ action: 'watch-status', tabId: 2 })).attempts, 10);
    assert.equal(state.downloads.length, 0);
});

test('history records read failures and follows downloads through completion and renamed files', async () => {
    const state = setup();
    state.failFetch = true;
    await state.send(state.request);
    state.failFetch = false;
    await state.send(state.request);
    let { entries } = await state.send({ action: 'history-get' });
    assert.equal(entries.length, 2);
    assert.equal(entries[0].state, 'in_progress');
    assert.equal(entries[0].sourcePage, 'https://example.com/source');
    assert.equal(entries[0].url, state.request.url);
    assert.equal(entries[0].size, 5);
    assert.equal(entries[1].state, 'failed');
    assert.match(entries[1].message, /revoked/);
    state.changed({
        id: 7,
        filename: { current: 'C:\\Downloads\\chosen.txt' },
        state: { current: 'complete' },
    });
    entries = (await state.send({ action: 'history-get' })).entries;
    assert.equal(entries[0].state, 'complete');
    assert.equal(entries[0].filename, 'chosen.txt');
    assert.equal(JSON.stringify(entries).includes('data:'), false);
});

test('history handles cancellation when error and state events arrive separately', async () => {
    const state = setup();
    await state.send(state.request);
    state.changed({ id: 7, error: { current: 'USER_CANCELED' } });
    state.changed({ id: 7, state: { current: 'interrupted' } });
    const [entry] = (await state.send({ action: 'history-get' })).entries;
    assert.equal(entry.state, 'canceled');
    assert.equal(entry.message, 'USER_CANCELED');
});

test('history reconciles early completion and does not report a started download as failed when lookup fails', async () => {
    const state = setup();
    state.downloadState = 'complete';
    await state.send(state.request);
    assert.equal((await state.send({ action: 'history-get' })).entries[0].state, 'complete');
    state.searchError = true;
    assert.equal((await state.send(state.request)).ok, true);
    assert.equal((await state.send({ action: 'history-get' })).entries[0].state, 'in_progress');
});

test('history includes automatic capture errors and rejects page requests to read it', async () => {
    const state = setup();
    await state.send({ action: 'watch-start', tabId: 2, minimumMiB: 10 });
    const sender = { id: 'test', tab: { id: 2 }, frameId: 0, url: 'https://example.com/source' };
    await state.message(
        {
            action: 'auto-blob',
            token: state.watchConfig.token,
            url: state.request.url,
            captureError: 'Capture timed out.',
        },
        sender,
    );
    const [entry] = (await state.send({ action: 'history-get' })).entries;
    assert.equal(entry.mode, 'automatic');
    assert.equal(entry.state, 'failed');
    assert.equal(entry.message, 'Capture timed out.');
    assert.equal(entry.url, state.request.url);
    assert.equal(state.message({ action: 'history-get' }, sender), undefined);
    assert.equal(state.message({ action: 'history-clear' }, sender), undefined);
    const historyPage = { id: 'test', tab: { id: 9 }, url: 'moz-extension://test/history.html' };
    assert.equal((await state.message({ action: 'history-get' }, historyPage)).entries.length, 1);
    assert.equal((await state.message({ action: 'history-clear' }, historyPage)).ok, true);
    assert.equal((await state.message({ action: 'history-get' }, historyPage)).entries.length, 0);
});

test('history is bounded to 100 entries and can be cleared without later download events restoring it', async () => {
    const state = setup();
    state.failFetch = true;
    for (let n = 0; n < 105; n++) await state.send(state.request);
    let { entries } = await state.send({ action: 'history-get' });
    assert.equal(entries.length, 100);
    assert.equal(entries[0].id, 105);
    assert.equal(entries[99].id, 6);
    state.failFetch = false;
    await state.send(state.request);
    await state.send({ action: 'history-clear' });
    state.changed({ id: 7, state: { current: 'complete' } });
    assert.equal((await state.send({ action: 'history-get' })).entries.length, 0);
    assert.deepEqual(state.revoked, ['blob:extension/test']);
});

test('clearing history during a blob read does not resurrect the in-flight attempt', async () => {
    const state = setup();
    let releaseRead;
    state.pauseRead = new Promise((resolve) => {
        releaseRead = resolve;
    });
    let onRead;
    const started = new Promise((resolve) => {
        onRead = resolve;
    });
    state.onRead = onRead;
    const attempt = state.send(state.request);
    await started;
    await state.send({ action: 'history-clear' });
    releaseRead();
    assert.equal((await attempt).ok, true);
    state.changed({ id: 7, state: { current: 'complete' } });
    assert.equal((await state.send({ action: 'history-get' })).entries.length, 0);
});
