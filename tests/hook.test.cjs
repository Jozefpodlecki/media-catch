const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const { setTimeout: delay } = require('node:timers/promises');

function setup(t) {
    const messages = [];
    const listeners = new Map();
    const liveUrls = new Set();
    let sequence = 0;
    class MediaSource {}
    const original = function (object) {
        if (!(object instanceof Blob) && !(object instanceof MediaSource))
            throw new TypeError('Invalid object');
        const url = `blob:https://example.com/${++sequence}`;
        liveUrls.add(url);
        return url;
    };
    const urlApi = {
        createObjectURL: original,
        revokeObjectURL(url) {
            liveUrls.delete(url);
        },
    };
    const window = {
        addEventListener(type, callback) {
            if (!listeners.has(type)) listeners.set(type, new Set());
            listeners.get(type).add(callback);
        },
        removeEventListener(type, callback) {
            listeners.get(type)?.delete(callback);
        },
        emit(type, event) {
            for (const listener of listeners.get(type) || []) listener(event);
        },
        postMessage(data) {
            queueMicrotask(() => window.emit('message', { data, source: window }));
        },
    };
    class FileReader {
        readAsDataURL(blob) {
            blob.arrayBuffer().then((bytes) => {
                if (this.aborted) return;
                this.result = `data:${blob.type || 'application/octet-stream'};base64,${Buffer.from(bytes).toString('base64')}`;
                this.onload();
            });
        }
        abort() {
            this.aborted = true;
            this.onabort?.();
        }
    }
    const config = {
        enabled: true,
        token: 'session',
        minimumBytes: 10,
        maximumBytes: 64,
        maxEncodedLength: 4096,
    };
    const context = vm.createContext({
        window,
        Blob,
        MediaSource,
        URL: urlApi,
        FileReader,
        setTimeout,
        clearTimeout,
        browser: {
            runtime: {
                async sendMessage(message) {
                    messages.push(message);
                    return { ok: true };
                },
            },
        },
        config,
    });
    vm.runInContext(fs.readFileSync(require.resolve('../.build/injected.js'), 'utf8'), context);
    const inject = (name, argument) => {
        const source = vm.runInContext(`Injected.${name}.toString()`, context);
        return vm.runInContext(`(${source})(${argument})`, context);
    };
    inject('configureBlobBridge', 'config');
    inject('configureBlobHook', 'config');
    const stop = () => {
        inject('configureBlobHook', '{enabled:false}');
        inject('configureBlobBridge', '{enabled:false}');
    };
    t.after(stop);
    return {
        urlApi,
        messages,
        original,
        stop,
        MediaSource,
        liveUrls,
        hide: () => window.emit('pagehide', {}),
        inspect: () => inject('inspectBlobHook', ''),
        probe: () => inject('testBlobHook', ''),
    };
}

async function waitFor(check) {
    for (let attempt = 0; attempt < 100; attempt++) {
        if (check()) return;
        await delay(5);
    }
    assert.fail('Capture did not complete');
}

test('hook preserves URL behavior, filters size and streams, deduplicates, and survives immediate revocation', async (t) => {
    const state = setup(t);
    for (const size of [0, 9, 10, 65])
        state.urlApi.createObjectURL(new Blob([new Uint8Array(size)]));
    state.urlApi.createObjectURL(new state.MediaSource());
    assert.throws(() => state.urlApi.createObjectURL(null), TypeError);
    const match = new Blob(['hello world'], { type: 'text/plain' });
    const url = state.urlApi.createObjectURL(match);
    state.urlApi.revokeObjectURL(url);
    state.urlApi.createObjectURL(match);
    await waitFor(() => state.messages.length === 1);
    assert.equal(state.liveUrls.has(url), false);
    assert.equal(state.messages[0].dataUrl, 'data:text/plain;base64,aGVsbG8gd29ybGQ=');
    await delay(10);
    assert.equal(state.messages.length, 1);
    state.stop();
    assert.equal(state.urlApi.createObjectURL, state.original);
    state.urlApi.createObjectURL(new Blob(['another blob']));
    await delay(10);
    assert.equal(state.messages.length, 1);
});

test('hook bounds a burst of new blobs to two pending captures', async (t) => {
    const state = setup(t);
    for (let n = 0; n < 20; n++) state.urlApi.createObjectURL(new Blob(['hello world']));
    await waitFor(() => state.messages.length === 2);
    await delay(10);
    assert.equal(state.messages.length, 2);
});

test('hook caps a session at ten captures and does not overwrite a later page wrapper on stop', async (t) => {
    const state = setup(t);
    for (let n = 0; n < 10; n++) {
        state.urlApi.createObjectURL(new Blob(['hello world']));
        await waitFor(() => state.messages.length === n + 1);
    }
    state.urlApi.createObjectURL(new Blob(['hello world']));
    await delay(10);
    assert.equal(state.messages.length, 10);
    const laterWrapper = (...args) => state.original(...args);
    state.urlApi.createObjectURL = laterWrapper;
    state.stop();
    assert.equal(state.urlApi.createObjectURL, laterWrapper);
});

test('leaving the page stops capture and restores its original URL function', async (t) => {
    const state = setup(t);
    state.hide();
    assert.equal(state.urlApi.createObjectURL, state.original);
    state.urlApi.createObjectURL(new Blob(['hello world']));
    await delay(10);
    assert.equal(state.messages.length, 0);
});

test('diagnostics show calls and skipped sizes/streams; a self-test does not download', async (t) => {
    const state = setup(t);
    state.urlApi.createObjectURL(new Blob([new Uint8Array(10)]));
    state.urlApi.createObjectURL(new Blob([new Uint8Array(65)]));
    state.urlApi.createObjectURL(new state.MediaSource());
    assert.equal(state.probe().ok, true);
    const result = state.inspect();
    assert.equal(result.attached, true);
    assert.equal(result.counters.calls, 4);
    assert.equal(result.counters.blobs, 3);
    assert.equal(result.counters.streams, 1);
    assert.equal(result.counters.belowThreshold, 2);
    assert.equal(result.counters.overLimit, 1);
    assert.equal(state.messages.length, 0);
    state.urlApi.createObjectURL = state.original;
    assert.equal(state.inspect().attached, false);
    assert.equal(state.probe().ok, false);
});

test('diagnostics distinguish bytes read from a reply received through the bridge', async (t) => {
    const state = setup(t);
    state.urlApi.createObjectURL(new Blob(['hello world']));
    await waitFor(() => state.inspect().counters.acknowledged === 1);
    assert.equal(state.inspect().counters.captured, 1);
    assert.equal(state.inspect().counters.rejected, 0);
    assert.equal(state.inspect().counters.bridgeTimeouts, 0);
});
