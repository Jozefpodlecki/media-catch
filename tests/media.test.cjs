const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
function setup() {
    const state = { allowed: false };
    const browser = {
        scripting: {
            async executeScript(options) {
                if (options.args?.[0]?.enabled) state.elementConfig = options.args[0];
                return [{ frameId: 0, result: options.args?.[0] || true }];
            },
        },
        downloads: { onChanged: { addListener() {} } },
        runtime: {
            id: 'own',
            getURL: () => 'moz-extension://own/',
            onMessage: {
                addListener(fn) {
                    state.send = (message) => fn(message, { id: 'own' });
                    state.fromPage = (message, sender) => fn(message, { id: 'own', ...sender });
                },
            },
        },
        permissions: {
            async contains() {
                return state.allowed;
            },
        },
        tabs: { onRemoved: { addListener() {} }, onUpdated: { addListener() {} } },
        webRequest: {
            onBeforeRequest: {
                addListener(fn) {
                    state.request = fn;
                },
            },
            onCompleted: {
                addListener(fn) {
                    state.completed = fn;
                },
            },
            onErrorOccurred: {
                addListener(fn) {
                    state.failed = fn;
                },
            },
        },
    };
    vm.runInNewContext(fs.readFileSync(require.resolve('../extension/background.js'), 'utf8'), {
        browser,
        crypto: require('node:crypto').webcrypto,
        URL,
        Map,
        Set,
        AbortController,
        AbortSignal,
        setTimeout,
        clearTimeout,
        blobLimit: 64 * 1024 * 1024,
    });
    return state;
}
test('network monitoring requires permission, filters the selected tab, and tracks request outcomes', async () => {
    const state = setup();
    assert.equal(
        (await state.send({ action: 'network-start', tabId: 4, pattern: '*.m3u8' })).ok,
        false,
    );
    state.allowed = true;
    assert.equal(
        (await state.send({ action: 'network-start', tabId: 4, pattern: '*.m3u8' })).ok,
        true,
    );
    for (const [tabId, url, id] of [
        [4, 'https://cdn.example/a.M3U8?token=1', 'yes'],
        [4, 'https://cdn.example/segment.ts', 'no'],
        [5, 'https://cdn.example/a.m3u8', 'other'],
        [-1, 'https://cdn.example/a.m3u8', 'worker'],
    ])
        state.request({ tabId, frameId: 0, url, requestId: id });
    let records = (await state.send({ action: 'media-state', tabId: 4 })).records;
    assert.equal(records.length, 1);
    assert.equal(records[0].kind, 'HLS');
    state.completed({ requestId: 'yes', statusCode: 200 });
    assert.equal(
        (await state.send({ action: 'media-state', tabId: 4 })).records[0].status,
        'HTTP 200',
    );
    state.failed({ requestId: 'yes', error: 'NETWORK_FAILED' });
    assert.equal(
        (await state.send({ action: 'media-state', tabId: 4 })).records[0].status,
        'NETWORK_FAILED',
    );
    await state.send({ action: 'network-stop', tabId: 4 });
    state.request({
        tabId: 4,
        frameId: 0,
        url: 'https://cdn.example/b.m3u8',
        requestId: 'stopped',
    });
    assert.equal((await state.send({ action: 'media-state', tabId: 4 })).records.length, 1);
});
test('web pages cannot start monitors or read captured media', () => {
    const state = setup();
    const sender = { tab: { id: 4 }, frameId: 0, url: 'https://example.com/' };
    for (const action of ['network-start', 'media-state', 'hls-start'])
        assert.equal(state.fromPage({ action, tabId: 4 }, sender), undefined);
});

test('element observations validate page metadata and ignore malformed records', async () => {
    const state = setup();
    const start = await state.send({ action: 'elements-start', tabId: 4 });
    assert.equal(start.ok, true);
    const sender = { tab: { id: 4 }, frameId: 0, url: 'https://example.com/' };
    assert.equal(
        state.fromPage({ action: 'media-observed', token: 'wrong', observations: [] }, sender),
        undefined,
    );
    const result = await state.fromPage(
        {
            action: 'media-observed',
            token: state.elementConfig.token,
            observations: [
                null,
                3,
                {},
                { tag: 'script', url: 'https://example.com/evil.js' },
                {
                    tag: 'source',
                    url: 'https://example.com/video.m3u8',
                    type: {},
                    reason: 'attribute:src',
                },
            ],
        },
        sender,
    );
    assert.equal(result.ok, true);
    const current = await state.send({ action: 'media-state', tabId: 4 });
    assert.equal(current.observations.length, 1);
    assert.equal(current.observations[0].type, '');
    assert.equal(current.records.length, 1);
    assert.equal(current.records[0].kind, 'HLS');
});
