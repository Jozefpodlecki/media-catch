import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    createSettingsDocument,
    parseSettingsDocument,
    settingsStorageKey,
    maximumSavedSites,
    createSettingsRepository,
    settingsForSite,
    createPreferencesState,
    preferencesReducer,
    describePage,
    initialViewForPage,
} from '../.build/ui-state.mjs';

function storageFixture() {
    const data = {};
    let fail = false;
    const storage = {
        async get(key) {
            return Object.hasOwn(data, key) ? { [key]: structuredClone(data[key]) } : {};
        },
        async set(values) {
            if (fail) {
                fail = false;
                throw new Error('Storage write failed');
            }
            Object.assign(data, structuredClone(values));
        },
    };
    return {
        data,
        storage,
        failNextWrite: () => {
            fail = true;
        },
    };
}

test('site preferences persist across repository instances and changes merge serially', async () => {
    const { storage } = storageFixture();
    const repository = createSettingsRepository(storage);
    await Promise.all([
        repository.update({
            type: 'siteUpdated',
            siteKey: 'https://example.com',
            patch: { captureMinimumMiB: 24 },
        }),
        repository.update({
            type: 'siteUpdated',
            siteKey: 'https://example.com',
            patch: { requestPattern: '/manifest' },
        }),
        repository.update({
            type: 'siteUpdated',
            siteKey: 'https://other.example',
            patch: { requestPattern: '.mpd' },
        }),
        repository.update({ type: 'defaultsUpdated', patch: { captureMinimumMiB: 16 } }),
    ]);
    const reloaded = await createSettingsRepository(storage).get();
    assert.equal(reloaded.version, 1);
    assert.equal(reloaded.revision, 4);
    assert.deepEqual(settingsForSite(reloaded, 'https://example.com'), {
        captureMinimumMiB: 24,
        requestPattern: '/manifest',
    });
    assert.deepEqual(settingsForSite(reloaded, 'https://other.example'), {
        captureMinimumMiB: 16,
        requestPattern: '.mpd',
    });
    assert.equal(settingsForSite(reloaded, 'https://untouched.example').captureMinimumMiB, 16);
});

test('failed writes do not poison later mutations or report unsaved data as persisted', async () => {
    const fixture = storageFixture();
    const repository = createSettingsRepository(fixture.storage);
    fixture.failNextWrite();
    await assert.rejects(
        repository.update({
            type: 'siteUpdated',
            siteKey: 'https://example.com',
            patch: { captureMinimumMiB: 25 },
        }),
        /Storage write failed/,
    );
    assert.deepEqual((await repository.get()).sites, {});
    await repository.update({
        type: 'siteUpdated',
        siteKey: 'https://other.example',
        patch: { captureMinimumMiB: 30 },
    });
    assert.deepEqual(Object.keys((await repository.get()).sites), ['https://other.example']);
});

test('invalid, sensitive, and unsupported preference payloads are rejected without writes', async () => {
    const fixture = storageFixture();
    const repository = createSettingsRepository(fixture.storage);
    for (const [siteKey, patch] of [
        ['https://example.com/path?token=secret', { requestPattern: '.m3u8' }],
        ['https://user:password@example.com', { requestPattern: '.m3u8' }],
        ['blob:https://example.com/file', { captureMinimumMiB: 10 }],
        ['https://example.com', { captureMinimumMiB: 64 }],
        ['https://example.com', { captureMinimumMiB: NaN }],
        ['https://example.com', { requestPattern: '*' }],
        ['https://example.com', { requestPattern: 'x'.repeat(81) }],
        ['https://example.com', { dataUrl: 'data:bytes' }],
        ['https://example.com', { automaticMonitoring: true }],
    ])
        await assert.rejects(repository.update({ type: 'siteUpdated', siteKey, patch }));
    assert.deepEqual(fixture.data, {});
    fixture.data[settingsStorageKey] = { version: 99, secret: 'do-not-overwrite' };
    await assert.rejects(repository.get(), /unsupported format/);
    await assert.rejects(repository.update({ type: 'sitesCleared' }), /unsupported format/);
    assert.equal(fixture.data[settingsStorageKey].secret, 'do-not-overwrite');
});

test('forget actions retain defaults and never clear unrelated extension storage', async () => {
    const fixture = storageFixture();
    fixture.data.unrelated = 'keep';
    const repository = createSettingsRepository(fixture.storage);
    await repository.update({ type: 'defaultsUpdated', patch: { captureMinimumMiB: 20 } });
    await repository.update({
        type: 'siteUpdated',
        siteKey: 'https://a.example',
        patch: { requestPattern: '/a' },
    });
    await repository.update({
        type: 'siteUpdated',
        siteKey: 'https://b.example',
        patch: { requestPattern: '/b' },
    });
    await repository.update({ type: 'siteReset', siteKey: 'https://a.example' });
    assert.deepEqual(Object.keys((await repository.get()).sites), ['https://b.example']);
    await repository.update({ type: 'sitesCleared' });
    const saved = await repository.get();
    assert.equal(saved.defaults.captureMinimumMiB, 20);
    assert.deepEqual(saved.sites, {});
    assert.equal(fixture.data.unrelated, 'keep');
});

test('website limits reject new entries without evicting saved preferences', async () => {
    const fixture = storageFixture();
    const document = createSettingsDocument();
    for (let i = 0; i < maximumSavedSites; i++)
        document.sites[`https://site-${i}.example`] = { captureMinimumMiB: 10 };
    fixture.data[settingsStorageKey] = document;
    const repository = createSettingsRepository(fixture.storage);
    await assert.rejects(
        repository.update({
            type: 'siteUpdated',
            siteKey: 'https://extra.example',
            patch: { captureMinimumMiB: 10 },
        }),
        /Forget an existing/,
    );
    assert.equal(Object.keys((await repository.get()).sites).length, maximumSavedSites);
    await repository.update({
        type: 'siteUpdated',
        siteKey: 'https://site-0.example',
        patch: { captureMinimumMiB: 12 },
    });
    assert.equal((await repository.get()).sites['https://site-0.example'].captureMinimumMiB, 12);
});

test('settings snapshots cannot overwrite newer optimistic edits while writes are pending', () => {
    let state = preferencesReducer(createPreferencesState(), {
        type: 'received',
        settings: createSettingsDocument(),
    });
    const change = {
        type: 'siteUpdated',
        siteKey: 'https://example.com',
        patch: { captureMinimumMiB: 24 },
    };
    state = preferencesReducer(state, { type: 'queued', id: 1, change });
    state = preferencesReducer(state, { type: 'received', settings: createSettingsDocument() });
    assert.equal(state.config.sites[change.siteKey].captureMinimumMiB, 24);
    const external = createSettingsDocument();
    external.revision = 3;
    external.defaults.requestPattern = '/new-default';
    external.sites[change.siteKey] = { captureMinimumMiB: 28 };
    state = preferencesReducer(state, { type: 'received', settings: external });
    const older = createSettingsDocument();
    older.revision = 1;
    older.sites[change.siteKey] = change.patch;
    state = preferencesReducer(state, { type: 'saved', id: 1, settings: older });
    assert.equal(state.config.revision, 3);
    assert.equal(state.config.sites[change.siteKey].captureMinimumMiB, 28);
    assert.deepEqual(state.pending, []);
});

test('save failure rolls controls back to persisted values and exposes a retryable error', () => {
    let state = preferencesReducer(createPreferencesState(), {
        type: 'received',
        settings: createSettingsDocument(),
    });
    state = preferencesReducer(state, {
        type: 'queued',
        id: 1,
        change: { type: 'defaultsUpdated', patch: { captureMinimumMiB: 25 } },
    });
    assert.equal(state.config.defaults.captureMinimumMiB, 25);
    state = preferencesReducer(state, { type: 'failed', id: 1, error: 'Disk full' });
    assert.equal(state.config.defaults.captureMinimumMiB, 10);
    assert.equal(state.error, 'Disk full');
    state = preferencesReducer(state, { type: 'received', settings: createSettingsDocument() });
    assert.equal(state.error, '');
});

test('dashboard source links are explicit and an unlinked index opens settings', () => {
    assert.deepEqual(describePage('dashboard', '?source=12'), {
        mode: 'dashboard',
        sourceTabId: 12,
    });
    assert.equal(initialViewForPage(describePage('dashboard', ''), ''), 'settings');
    assert.equal(initialViewForPage(describePage('dashboard', '?source=12'), ''), 'blobs');
    assert.equal(
        initialViewForPage(describePage('dashboard', '?source=12'), '#settings'),
        'settings',
    );
    assert.equal(initialViewForPage(describePage('history', ''), '#blobs'), 'history');
    for (const query of [
        '?source=-1',
        '?source=0',
        '?source=1.2',
        '?source=Infinity',
        '?source=999999999999999999',
        '?source=12x',
    ])
        assert.equal(describePage('dashboard', query).sourceTabId, null);
    assert.equal(describePage('popup', '?source=12').sourceTabId, null);
    assert.deepEqual(parseSettingsDocument(undefined), createSettingsDocument());
});

test('failed optimistic edits roll back independently while other edits remain pending', () => {
    let state = createPreferencesState();
    state = preferencesReducer(state, {
        type: 'queued',
        id: 1,
        change: { type: 'defaultsUpdated', patch: { captureMinimumMiB: 25 } },
    });
    state = preferencesReducer(state, {
        type: 'queued',
        id: 2,
        change: { type: 'defaultsUpdated', patch: { requestPattern: '/playlist' } },
    });
    state = preferencesReducer(state, { type: 'failed', id: 1, error: 'Disk full' });
    assert.equal(state.config.defaults.captureMinimumMiB, 10);
    assert.equal(state.config.defaults.requestPattern, '/playlist');
    assert.deepEqual(
        state.pending.map(({ id }) => id),
        [2],
    );
    assert.equal(state.error, 'Disk full');
});

test('external settings updates merge with pending edits across origins', () => {
    let state = preferencesReducer(createPreferencesState(), {
        type: 'queued',
        id: 1,
        change: {
            type: 'siteUpdated',
            siteKey: 'https://first.example',
            patch: { captureMinimumMiB: 25 },
        },
    });
    const external = createSettingsDocument();
    external.revision = 2;
    external.defaults.requestPattern = '/external';
    external.sites['https://second.example'] = { captureMinimumMiB: 32 };
    state = preferencesReducer(state, { type: 'received', settings: external });
    assert.equal(state.config.sites['https://first.example'].captureMinimumMiB, 25);
    assert.equal(state.config.sites['https://second.example'].captureMinimumMiB, 32);
    assert.equal(state.config.defaults.requestPattern, '/external');
    assert.equal(state.saved.sites['https://first.example'], undefined);
});

test('a later optimistic edit survives an earlier acknowledgment of the same field', () => {
    let state = createPreferencesState();
    for (const [id, value] of [
        [1, 25],
        [2, 30],
    ])
        state = preferencesReducer(state, {
            type: 'queued',
            id,
            change: { type: 'defaultsUpdated', patch: { captureMinimumMiB: value } },
        });
    const settings = createSettingsDocument();
    settings.revision = 1;
    settings.defaults.captureMinimumMiB = 25;
    state = preferencesReducer(state, { type: 'saved', id: 1, settings });
    assert.equal(state.saved.defaults.captureMinimumMiB, 25);
    assert.equal(state.config.defaults.captureMinimumMiB, 30);
    state = preferencesReducer(state, { type: 'failed', id: 2, error: 'Failed' });
    assert.equal(state.config.defaults.captureMinimumMiB, 25);
});
