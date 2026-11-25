import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import { webcrypto } from 'node:crypto';
import {
    validateRule,
    parseRulesDocument,
    matchRule,
    ruleAction,
    rulesStorageKey,
    createRulesRepository,
    rulesReducer,
    initialRulesState,
} from '../.build/ui-state.mjs';

const rule = {
    id: 'video',
    name: 'Save video',
    enabled: true,
    trigger: 'network',
    match: 'contains',
    pattern: '.mp4',
    action: 'auto',
};
const event = {
    tabId: 2,
    frameId: 0,
    trigger: 'network',
    url: 'https://cdn.example/video.mp4?secure=secret',
    reason: 'completed',
};

test('rule schemas are bounded and exclude executable fields, secrets and invalid origins', () => {
    assert.equal(validateRule(rule).name, 'Save video');
    for (const change of [
        { pattern: '*' },
        { pattern: 'a'.repeat(257) },
        { pattern: '?token=secret' },
        { script: 'alert(1)' },
        { action: 'evaluate' },
        { enabled: 'true' },
    ])
        assert.throws(() => validateRule({ ...rule, ...change }));
    assert.throws(() => parseRulesDocument({ version: 2, revision: 0, sites: {} }));
    assert.throws(() =>
        parseRulesDocument({
            version: 1,
            revision: 0,
            sites: { 'https://site.example/path': [rule] },
        }),
    );
    assert.throws(() =>
        parseRulesDocument({
            version: 1,
            revision: 0,
            sites: { 'https://site.example': [rule, rule] },
        }),
    );
    assert.throws(() =>
        parseRulesDocument({
            version: 1,
            revision: 0,
            sites: {
                'https://site.example': Array.from({ length: 11 }, (_, index) => ({
                    ...rule,
                    id: String(index),
                })),
            },
        }),
    );
});

test('rule matching is case-insensitive, bounded glob matching over host/path and classifies HLS MIME types', () => {
    assert.equal(matchRule(rule, event), true);
    assert.equal(matchRule(rule, { ...event, url: 'https://cdn.example/video?hint=.mp4' }), false);
    assert.equal(matchRule(rule, { ...event, trigger: 'dom' }), false);
    assert.equal(matchRule({ ...rule, enabled: false }, event), false);
    const glob = { ...rule, match: 'wildcard', pattern: 'https://*.example/*/VIDEO.MP4' };
    assert.equal(
        matchRule(glob, { ...event, url: 'https://cdn.example/path/video.mp4?secure=secret' }),
        true,
    );
    assert.equal(matchRule(glob, { ...event, url: 'http://cdn.example/path/video.mp4' }), false);
    assert.equal(
        matchRule(
            { ...rule, match: 'wildcard', pattern: '*video.mp4' },
            { ...event, url: 'https://cdn.example/video.mp4/video.mp4' },
        ),
        true,
    );
    assert.equal(
        matchRule(rule, { ...event, url: 'https://user:pass@cdn.example/video.mp4' }),
        false,
    );
    assert.equal(ruleAction(rule, event), 'download');
    assert.equal(ruleAction(rule, { ...event, url: 'https://cdn.example/master.m3u8' }), 'hls');
    assert.equal(
        ruleAction(rule, {
            ...event,
            url: 'https://cdn.example/stream',
            mediaType: 'application/vnd.apple.mpegurl',
        }),
        'hls',
    );
    assert.equal(ruleAction(rule, { ...event, url: 'blob:https://site.example/id' }), 'download');
    assert.equal(
        ruleAction(rule, {
            ...event,
            url: 'blob:https://site.example/id',
            mediaType: 'application/vnd.apple.mpegurl',
        }),
        'download',
    );
});

test('saved site rules serialize concurrent changes, survive reopening, isolate origins and recover from write failures', async () => {
    const data = {};
    let fail = false;
    const storage = {
        async get(key) {
            return structuredClone(data[key] ? { [key]: data[key] } : {});
        },
        async set(value) {
            if (fail) {
                fail = false;
                throw new Error('Disk full');
            }
            Object.assign(data, structuredClone(value));
        },
    };
    const repository = createRulesRepository(storage);
    await Promise.all([
        repository.save('https://site.example', rule),
        repository.save('https://site.example', { ...rule, id: 'other' }),
        repository.save('http://site.example', { ...rule, id: 'http' }),
    ]);
    assert.equal(
        (await createRulesRepository(storage).get()).sites['https://site.example'].length,
        2,
    );
    fail = true;
    await assert.rejects(
        repository.save('https://site.example', { ...rule, name: 'Unsaved' }),
        /Disk full/,
    );
    assert.equal((await repository.get()).sites['https://site.example'][0].name, rule.name);
    await repository.remove('https://site.example', rule.id);
    assert.equal((await repository.get()).sites['https://site.example'].length, 1);
    assert.equal((await repository.get()).sites['http://site.example'][0].id, 'http');
    assert.equal(Object.keys(data).length, 1);
    assert.ok(data[rulesStorageKey]);
});

test('rule polling preserves editor drafts and older documents cannot overwrite acknowledged saves', () => {
    let state = rulesReducer(initialRulesState, {
        type: 'draft',
        patch: { name: 'Unsaved draft' },
    });
    state = rulesReducer(state, {
        type: 'received',
        document: { version: 1, revision: 3, sites: { 'https://site.example': [rule] } },
    });
    state = rulesReducer(state, {
        type: 'runtime',
        runtime: { ...state.runtime, armed: true, preview: true },
    });
    state = rulesReducer(state, {
        type: 'received',
        document: { version: 1, revision: 1, sites: {} },
    });
    assert.equal(state.document.revision, 3);
    assert.equal(state.draft.name, 'Unsaved draft');
    state = rulesReducer(state, { type: 'saved', document: state.document, rule });
    assert.equal(state.runtime.armed, false);
    assert.equal(state.draft.name, rule.name);
    state = rulesReducer(state, { type: 'new' });
    assert.equal(state.draft.id, '');
});

function runtime() {
    const state = {
        data: {},
        storageListeners: [],
        removed: [],
        updated: [],
        downloads: [],
        configs: {},
        granted: true,
        url: 'https://site.example/watch',
    };
    const noop = { addListener() {} };
    const browser = {
        runtime: {
            id: 'test',
            getURL: (value) => 'moz-extension://test/' + value,
            onMessage: {
                addListener(fn) {
                    state.message = fn;
                },
            },
        },
        storage: {
            local: {
                async get(key) {
                    return structuredClone(state.data[key] ? { [key]: state.data[key] } : {});
                },
                async set(values) {
                    const changes = {};
                    for (const [key, value] of Object.entries(values)) {
                        changes[key] = { oldValue: state.data[key], newValue: value };
                        state.data[key] = structuredClone(value);
                    }
                    for (const fn of state.storageListeners) fn(changes, 'local');
                },
            },
            onChanged: {
                addListener(fn) {
                    state.storageListeners.push(fn);
                },
            },
        },
        permissions: {
            async contains() {
                return state.granted;
            },
            onRemoved: {
                addListener(fn) {
                    state.revoke = fn;
                },
            },
        },
        tabs: {
            async get(id) {
                return {
                    id,
                    url: id === 2 ? state.url : 'https://other.example/',
                    incognito: true,
                };
            },
            onRemoved: {
                addListener(fn) {
                    state.removed.push(fn);
                },
            },
            onUpdated: {
                addListener(fn) {
                    state.updated.push(fn);
                },
            },
        },
        webRequest: {
            onBeforeRequest: noop,
            onCompleted: {
                addListener(fn) {
                    state.completed = fn;
                },
            },
            onErrorOccurred: noop,
        },
        scripting: {
            async executeScript(options) {
                if (options.func.name === 'configureMediaObserver') {
                    const config = options.args[0];
                    state.configs[config.scope || 'manual'] = config;
                    return [{ frameId: 0, result: { enabled: config.enabled } }];
                }
                state.discovering = true;
                await state.holdDiscovery;
                return [{ frameId: 0, result: true }];
            },
        },
        downloads: {
            onChanged: {
                addListener(fn) {
                    state.changed = fn;
                },
            },
            async download(options) {
                state.downloads.push(options);
                await state.hold;
                return state.downloads.length;
            },
            async search() {
                return [{ state: 'complete' }];
            },
        },
    };
    vm.runInNewContext(fs.readFileSync('extension/background.js', 'utf8'), {
        browser,
        URL,
        Blob,
        AbortController,
        setTimeout,
        clearTimeout,
        crypto: webcrypto,
    });
    state.send = (message, sender = { id: 'test', url: 'moz-extension://test/popup.html' }) =>
        state.message(message, sender);
    state.save = async (value = rule, origin = 'https://site.example') => {
        const result = await state.send({ action: 'rules-save', origin, rule: value });
        assert.equal(result.ok, true, result.error);
    };
    state.arm = async (preview = false) => {
        const result = await state.send({ action: 'rules-arm', tabId: 2, preview });
        assert.equal(result.ok, true, result.error);
    };
    state.emit = (url = event.url, tabId = 2) =>
        state.completed({ tabId, frameId: 0, url, requestId: url, statusCode: 200 });
    state.settle = async () => {
        for (let index = 0; index < 100; index++) {
            const snapshot = await state.send({ action: 'rules-state', tabId: 2 });
            if (!snapshot.runtime.pending) return snapshot.runtime;
            await new Promise((resolve) => setTimeout(resolve, 0));
        }
        throw new Error('Rule queue did not finish');
    };
    return state;
}

test('network rules require explicit arming, deduplicate URLs, preserve signed targets and track native completion', async () => {
    const state = runtime();
    state.url = 'https://site.example/watch?session=secret';
    await state.save();
    state.emit();
    assert.equal(state.downloads.length, 0);
    await state.arm();
    state.emit();
    state.emit();
    state.emit(event.url, -1);
    state.emit(event.url, 3);
    const snapshot = await state.settle();
    assert.equal(state.downloads.length, 1);
    assert.equal(state.downloads[0].url, event.url);
    assert.equal(state.downloads[0].incognito, true);
    assert.equal(snapshot.log[0].state, 'started');
    assert.equal(snapshot.log[0].url.includes('secret'), false);
    const history = await state.send({ action: 'history-get' });
    assert.equal(history.entries[0].state, 'complete');
    assert.equal(history.entries[0].rule, rule.name);
    assert.equal(history.entries[0].url, 'https://cdn.example/video.mp4');
    assert.equal(history.entries[0].sourcePage, 'https://site.example/watch');
});

test('preview executes the matcher without side effects and edits/navigation/revocation disarm the tab', async () => {
    const state = runtime();
    await state.save();
    await state.arm(true);
    state.emit();
    assert.equal((await state.settle()).log[0].state, 'preview');
    assert.equal(state.downloads.length, 0);
    await state.save({ ...rule, name: 'Updated' });
    assert.equal((await state.send({ action: 'rules-state', tabId: 2 })).runtime.armed, false);
    await state.arm();
    for (const fn of state.updated) fn(2, { status: 'loading' });
    state.emit('https://cdn.example/next.mp4');
    await state.settle();
    assert.equal(state.downloads.length, 0);
    await state.arm();
    state.revoke();
    assert.equal((await state.send({ action: 'rules-state', tabId: 2 })).runtime.armed, false);
    state.granted = false;
    assert.equal((await state.send({ action: 'rules-arm', tabId: 2, preview: false })).ok, false);
});

test('DOM rules use separately authorized observers and source attribute changes prefer the new src', async () => {
    const state = runtime();
    await state.save({ ...rule, trigger: 'dom' });
    await state.arm();
    const config = state.configs.rules;
    assert.ok(config.enabled && config.token);
    const payload = {
        action: 'media-observed',
        token: config.token,
        observations: [
            {
                tag: 'video',
                url: 'https://cdn.example/new.mp4',
                currentSrc: 'https://cdn.example/old.mp4',
                type: 'video/mp4',
                reason: 'attribute:src',
                time: new Date().toISOString(),
            },
        ],
    };
    const sender = { id: 'test', url: 'https://site.example/watch', tab: { id: 2 }, frameId: 0 };
    assert.equal(state.send({ ...payload, token: 'forged' }, sender), undefined);
    assert.equal(state.send(payload, { ...sender, frameId: 99 }), undefined);
    await state.send(payload, sender);
    await state.settle();
    assert.equal(state.downloads[0].url, 'https://cdn.example/new.mp4');
    await state.send({ action: 'elements-start', tabId: 2 });
    assert.equal(state.configs.manual.enabled, true);
    await state.send({ action: 'rules-disarm', tabId: 2 });
    assert.equal(state.configs.rules.enabled, false);
    assert.equal(state.configs.manual.enabled, true);
    assert.equal(state.send({ action: 'rules-arm', tabId: 2, preview: false }, sender), undefined);
});

test('disarming drops pending actions, per-site arming is isolated, and queues are bounded', async () => {
    const state = runtime();
    await state.save();
    assert.equal((await state.send({ action: 'rules-arm', tabId: 3, preview: false })).ok, false);
    await state.arm();
    let release;
    state.hold = new Promise((resolve) => {
        release = resolve;
    });
    state.emit('https://cdn.example/one.mp4');
    await new Promise((resolve) => setTimeout(resolve, 0));
    state.emit('https://cdn.example/two.mp4');
    state.emit('https://cdn.example/three.mp4');
    assert.equal((await state.send({ action: 'rules-state', tabId: 2 })).runtime.pending, 2);
    await state.send({ action: 'rules-disarm', tabId: 2 });
    release();
    await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal(state.downloads.length, 1);
    assert.equal(
        (await state.send({ action: 'rules-state', tabId: 2 })).runtime.log.some(
            (entry) => entry.state === 'skipped',
        ),
        true,
    );
});

test('disarming during frame discovery prevents a late observer installation', async () => {
    const state = runtime();
    await state.save({ ...rule, trigger: 'dom' });
    let release;
    state.holdDiscovery = new Promise((resolve) => {
        release = resolve;
    });
    const arming = state.send({ action: 'rules-arm', tabId: 2, preview: false });
    for (let index = 0; index < 100 && !state.discovering; index++)
        await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(state.discovering, true);
    await state.send({ action: 'rules-disarm', tabId: 2 });
    release();
    assert.equal((await arming).ok, false);
    assert.equal(state.configs.rules.enabled, false);
    assert.equal((await state.send({ action: 'rules-state', tabId: 2 })).runtime.armed, false);
});

test('each arming accepts at most ten distinct matches and closing a tab clears its session', async () => {
    const state = runtime();
    await state.save();
    await state.arm(true);
    for (let index = 0; index < 12; index++) {
        state.emit(`https://cdn.example/${index}.mp4`);
        await state.settle();
    }
    const snapshot = await state.settle();
    assert.equal(snapshot.actions, 10);
    assert.equal(snapshot.log.filter((entry) => entry.state === 'preview').length, 10);
    assert.equal(snapshot.log.filter((entry) => entry.state === 'skipped').length, 2);
    for (const callback of state.removed) callback(2);
    const closed = (await state.send({ action: 'rules-state', tabId: 2 })).runtime;
    assert.equal(closed.armed, false);
    assert.equal(closed.log.length, 0);
});
