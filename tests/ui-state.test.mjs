import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    blobReducer,
    initialBlobState,
    mediaReducer,
    initialMediaState,
    taskReducer,
    initialTaskState,
    historyReducer,
    initialHistoryState,
    applicationReducer,
    applySettingsChange as siteSettingsReducer,
    createSettingsDocument,
    siteKeyForUrl,
    settingsForSite,
    createRequestScope,
    sourceReducer,
} from '../.build/ui-state.mjs';
const initialSiteSettings = createSettingsDocument();

test('source title changes preserve drafts while reload, URL change, and closure reset ownership', () => {
    const tab = { id: 7, url: 'https://example.com/watch', title: 'Player' };
    let state = sourceReducer(
        { tab: null, revision: 0, loading: true, error: '' },
        { type: 'resolved', tab, navigated: false },
    );
    assert.equal(state.revision, 1);
    state = sourceReducer(state, {
        type: 'resolved',
        tab: { ...tab, title: 'Playing' },
        navigated: false,
    });
    assert.equal(state.revision, 1);
    state = sourceReducer(state, { type: 'resolved', tab, navigated: true });
    assert.equal(state.revision, 2);
    state = sourceReducer(state, {
        type: 'resolved',
        tab: { ...tab, url: 'https://example.com/next' },
        navigated: false,
    });
    assert.equal(state.revision, 3);
    state = sourceReducer(state, { type: 'failed', error: 'Closed' });
    assert.equal(state.tab, null);
    assert.equal(state.revision, 4);
    assert.equal(state.loading, false);
    state = sourceReducer(state, { type: 'dismissed' });
    assert.equal(state.error, '');
    assert.equal(state.revision, 4);
});

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((yes, no) => {
        resolve = yes;
        reject = no;
    });
    return { promise, resolve, reject };
}
const frame = {
    frameId: 2,
    page: 'https://example.com/player',
    blobs: [
        { url: 'blob:https://example.com/discovered', filename: 'detected.webm', source: 'video' },
    ],
};

test('scan selection is atomic and an empty scan clears stale URL, filename, and frame', () => {
    const selected = blobReducer(initialBlobState, { type: 'scanReceived', frames: [frame] });
    assert.deepEqual(selected.selection, {
        url: frame.blobs[0].url,
        filename: 'detected.webm',
        frameId: 2,
    });
    const empty = blobReducer(selected, { type: 'scanReceived', frames: [] });
    assert.deepEqual(empty.selection, { url: '', filename: '', frameId: 0 });
    assert.deepEqual(initialBlobState.frames, []);
});

test('a delayed scan updates results without replacing user edits made during the request', () => {
    let state = blobReducer(initialBlobState, { type: 'scanStarted' });
    state = blobReducer(state, { type: 'urlEdited', url: 'blob:https://example.com/manual' });
    state = blobReducer(state, { type: 'filenameEdited', filename: 'manual.mp4' });
    state = blobReducer(state, { type: 'scanReceived', frames: [frame] });
    assert.equal(state.frames.length, 1);
    assert.equal(state.selection.url, 'blob:https://example.com/manual');
    assert.equal(state.selection.filename, 'manual.mp4');
});

test('editing a playlist invalidates its qualities, including after switching back to the same URL', () => {
    const variants = [{ url: 'https://cdn.example/720.m3u8', label: '720p', bandwidth: 2000 }];
    let state = mediaReducer(initialMediaState, {
        type: 'playlistEdited',
        url: 'https://cdn.example/a.m3u8',
    });
    const request = {
        type: 'playlistInspected',
        url: state.form.playlist,
        revision: state.form.revision,
        variants,
    };
    state = mediaReducer(state, request);
    assert.equal(state.form.variants.length, 1);
    state = mediaReducer(state, { type: 'playlistEdited', url: 'https://cdn.example/b.m3u8' });
    assert.deepEqual(state.form.variants, []);
    assert.equal(state.form.variant, 0);
    assert.equal(mediaReducer(state, request), state);
    state = mediaReducer(state, { type: 'playlistEdited', url: request.url });
    assert.equal(mediaReducer(state, request), state);
});

test('polling snapshots preserve media drafts and history filters', () => {
    let media = mediaReducer(initialMediaState, {
        type: 'playlistEdited',
        url: 'https://cdn.example/a.m3u8',
    });
    media = mediaReducer(media, { type: 'filenameEdited', filename: 'my-video' });
    media = mediaReducer(media, {
        type: 'snapshotReceived',
        snapshot: { ...initialMediaState.snapshot, network: true },
    });
    assert.equal(media.form.filename, 'my-video');
    assert.equal(media.form.playlist, 'https://cdn.example/a.m3u8');
    let history = historyReducer(initialHistoryState, { type: 'filterSelected', filter: 'failed' });
    history = historyReducer(history, { type: 'received', entries: [{ id: 1 }] });
    assert.equal(history.filter, 'failed');
    assert.equal(history.entries.length, 1);
});

test('overlapping tasks retain busy status and an older result cannot replace newer feedback', () => {
    let state = taskReducer(initialTaskState, { type: 'started', id: 1 });
    state = taskReducer(state, { type: 'started', id: 2 });
    state = taskReducer(state, { type: 'finished', id: 2, notice: 'Latest action succeeded' });
    assert.deepEqual(state.pending, [1]);
    state = taskReducer(state, { type: 'finished', id: 1, error: 'Stale failure' });
    assert.deepEqual(state.pending, []);
    assert.equal(state.notice, 'Latest action succeeded');
    assert.equal(state.error, '');
});

test('site settings inherit defaults and stay isolated by normalized origin', () => {
    const first = siteKeyForUrl('https://EXAMPLE.com:443/watch?secret=1#player');
    assert.equal(first, 'https://example.com');
    let state = siteSettingsReducer(initialSiteSettings, {
        type: 'siteUpdated',
        siteKey: first,
        patch: { captureMinimumMiB: 24 },
    });
    assert.deepEqual(settingsForSite(state, first), {
        captureMinimumMiB: 24,
        requestPattern: '.m3u8',
    });
    assert.equal(settingsForSite(state, 'https://other.example').captureMinimumMiB, 10);
    assert.equal(settingsForSite(state, 'http://example.com').captureMinimumMiB, 10);
    assert.equal(settingsForSite(state, 'https://example.com:8443').captureMinimumMiB, 10);
    state = siteSettingsReducer(state, {
        type: 'siteUpdated',
        siteKey: 'https://other.example',
        patch: { requestPattern: '/playlist' },
    });
    assert.equal(settingsForSite(state, first).captureMinimumMiB, 24);
    state = siteSettingsReducer(state, { type: 'siteReset', siteKey: first });
    assert.equal(settingsForSite(state, first).captureMinimumMiB, 10);
    assert.equal(settingsForSite(state, 'https://other.example').requestPattern, '/playlist');
    assert.deepEqual(initialSiteSettings.sites, {});
    for (const value of [
        'about:addons',
        'blob:https://example.com/file',
        'file:///local',
        'invalid',
    ])
        assert.equal(siteKeyForUrl(value), null);
    assert.throws(
        () =>
            siteSettingsReducer(state, {
                type: 'siteUpdated',
                siteKey: 'https://example.com/private?token=1',
                patch: { captureMinimumMiB: 30 },
            }),
        /origin/,
    );
});

test('navigation and theme transitions do not mutate unrelated application state', () => {
    const initial = { view: 'media', dark: true };
    const next = applicationReducer(initial, { type: 'viewSelected', view: 'history' });
    assert.deepEqual(next, { view: 'history', dark: true });
    assert.deepEqual(applicationReducer(next, { type: 'themeToggled' }), {
        view: 'history',
        dark: false,
    });
    assert.deepEqual(initial, { view: 'media', dark: true });
});

test('only the latest resource read applies, even if replies arrive out of order', async () => {
    const requests = createRequestScope();
    const first = deferred();
    const second = deferred();
    const values = [];
    const old = requests.read(
        'watch',
        () => first.promise,
        (value) => values.push(value),
    );
    const latest = requests.read(
        'watch',
        () => second.promise,
        (value) => values.push(value),
    );
    second.resolve('new');
    assert.equal(await latest, true);
    first.resolve('old');
    assert.equal(await old, false);
    assert.deepEqual(values, ['new']);
});

test('history clearing invalidates older reads and pauses polling until the mutation finishes', async () => {
    const requests = createRequestScope();
    const read = deferred();
    const clear = deferred();
    let state = { ...initialHistoryState, entries: [{ id: 1 }] };
    const pendingRead = requests.read(
        'history',
        () => read.promise,
        (entries) => {
            state = historyReducer(state, { type: 'received', entries });
        },
    );
    const pendingClear = requests.mutate(
        'history',
        () => clear.promise,
        () => {
            state = historyReducer(state, { type: 'cleared' });
        },
    );
    let polled = false;
    assert.equal(
        await requests.read(
            'history',
            async () => {
                polled = true;
            },
            () => {},
        ),
        false,
    );
    assert.equal(polled, false);
    clear.resolve();
    await pendingClear;
    read.resolve([{ id: 1 }]);
    await pendingRead;
    assert.deepEqual(state.entries, []);
});

test('disposed or invalidated requests cannot update another source workspace', async () => {
    const requests = createRequestScope();
    const pending = deferred();
    let applied = false;
    const old = requests.read(
        'probe',
        () => pending.promise,
        () => {
            applied = true;
        },
    );
    requests.dispose();
    requests.activate();
    pending.resolve('previous site');
    assert.equal(await old, false);
    assert.equal(applied, false);
    const invalid = deferred();
    const stale = requests.read(
        'probe',
        () => invalid.promise,
        () => {
            applied = true;
        },
    );
    requests.invalidate('probe');
    invalid.reject(new Error('Old site failed'));
    assert.equal(await stale, false);
    assert.equal(applied, false);
});

test('failed resource mutations release polling and report the current failure', async () => {
    const requests = createRequestScope();
    await assert.rejects(
        requests.mutate(
            'media',
            async () => {
                throw new Error('Current failure');
            },
            () => {},
        ),
        /Current failure/,
    );
    let resumed = false;
    assert.equal(
        await requests.read(
            'media',
            async () => 1,
            () => {
                resumed = true;
            },
        ),
        true,
    );
    assert.equal(resumed, true);
});
