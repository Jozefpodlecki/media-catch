import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runOptions, startSession, stopSession } from '../scripts/dev-session.mjs';
import { allowDevelopmentExtension } from '../scripts/allow-extension.mjs';
import { claimSession, releaseSession } from '../scripts/session/store.mjs';
import vm from 'node:vm';
import { configureTemporaryAddonPermissions } from '../scripts/browser/addon-permissions.mjs';

function addonSetupFixture({
    temporary = true,
    pinned = false,
    blocked = false,
    modernImport = false,
} = {}) {
    const placements = new Map([
        ['other-addon-browser-action', { area: 'nav-bar', position: 2 }],
        [
            'blob-url-downloader_local_invalid-browser-action',
            { area: pinned ? 'nav-bar' : 'unified-extensions-area', position: 3 },
        ],
    ]);
    const calls = [];
    const CustomizableUI = {
        AREA_NAVBAR: 'nav-bar',
        getPlacementOfWidget: (id) => placements.get(id),
        addWidgetToArea(id, area) {
            calls.push(['pin', id, area]);
            if (!blocked) placements.set(id, { area, position: 3 });
        },
    };
    const modules = {
        'resource://gre/modules/AddonManager.sys.mjs': {
            AddonManager: {
                async getAddonByID() {
                    return {
                        temporarilyInstalled: temporary,
                        async reload() {
                            calls.push(['reload']);
                        },
                    };
                },
            },
        },
        'resource://gre/modules/ExtensionPermissions.sys.mjs': {
            ExtensionPermissions: {
                async add(id, permissions) {
                    calls.push(['permissions', id, permissions]);
                },
            },
            QuarantinedDomains: {
                setUserAllowedAddonIdPref(id, value) {
                    calls.push(['restricted', id, value]);
                },
            },
        },
        'resource://gre/modules/ExtensionParent.sys.mjs': {
            ExtensionParent: {
                WebExtensionPolicy: {
                    getByID: () => ({ privateBrowsingAllowed: true, ignoreQuarantine: true }),
                },
            },
        },
        [modernImport
            ? 'moz-src:///browser/components/customizableui/CustomizableUI.sys.mjs'
            : 'resource:///modules/CustomizableUI.sys.mjs']: { CustomizableUI },
    };
    const configure = vm.runInNewContext(`(${configureTemporaryAddonPermissions.toString()})`, {
        ChromeUtils: {
            importESModule(uri) {
                if (!modules[uri]) throw new Error('Module unavailable');
                return modules[uri];
            },
        },
    });
    return {
        calls,
        placements,
        configure: async (apply = true) =>
            JSON.parse(await configure({ id: 'blob-url-downloader@local.invalid', apply })),
    };
}

test('temporary add-on setup pins only its toolbar button after reload and preserves other add-ons', async () => {
    for (const modernImport of [false, true]) {
        const fixture = addonSetupFixture({ modernImport });
        const result = await fixture.configure();
        assert.equal(result.toolbarPinned, true);
        assert.equal(result.privateWindows, true);
        assert.equal(result.restrictedSites, true);
        assert.equal(
            fixture.calls.findIndex(([type]) => type === 'pin') >
                fixture.calls.findIndex(([type]) => type === 'reload'),
            true,
        );
        assert.deepEqual(fixture.placements.get('other-addon-browser-action'), {
            area: 'nav-bar',
            position: 2,
        });
        assert.deepEqual(
            fixture.calls.find(([type]) => type === 'pin'),
            ['pin', 'blob-url-downloader_local_invalid-browser-action', 'nav-bar'],
        );
    }
});

test('toolbar verification is read-only and already pinned buttons are not moved', async () => {
    const fixture = addonSetupFixture();
    assert.equal((await fixture.configure(false)).toolbarPinned, false);
    assert.deepEqual(fixture.calls, []);
    const pinned = addonSetupFixture({ pinned: true });
    await pinned.configure();
    assert.equal(
        pinned.calls.some(([type]) => type === 'pin'),
        false,
    );
});

test('pin failures are explicit and permanent add-ons are never modified', async () => {
    await assert.rejects(addonSetupFixture({ blocked: true }).configure(), /could not pin/);
    const permanent = addonSetupFixture({ temporary: false });
    await assert.rejects(permanent.configure(), /non-temporary/);
    assert.deepEqual(permanent.calls, []);
});

test('development session uses a copied profile and supports targeted removal', async (t) => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'blob-session-test-'));
    t.after(() => fs.rmdir(directory));
    const options = runOptions('C:/test/firefox.exe', 'C:/test/profile');
    assert.equal(options.keepProfileChanges, false);
    assert.deepEqual(options.startUrl, ['about:addons']);
    assert.match(options.sourceDir, /[\\/]extension$/);
    let signalReady;
    const ready = new Promise((resolve) => {
        signalReady = resolve;
    });
    let exited = false;
    let allowed = false;
    const session = startSession(
        options,
        false,
        async (received) => {
            assert.equal(received, options);
            return {
                registerCleanup(callback) {
                    this.callback = callback;
                },
                async exit() {
                    exited = true;
                    this.callback();
                },
            };
        },
        directory,
        async (runner, received) => {
            assert.equal(received, options);
            allowed = true;
            signalReady();
        },
    );
    await ready;
    assert.equal(allowed, true);
    try {
        await assert.rejects(
            startSession(options, false, async () => {}, directory),
            /already active/,
        );
        await stopSession(true, directory);
        assert.equal(exited, false);
        await stopSession(false, directory);
        await session;
        assert.equal(exited, true);
        await assert.rejects(fs.access(path.join(directory, 'session.json')));
    } finally {
        if (!exited) {
            await stopSession(false, directory);
            await session;
        }
    }
});

test('failed startup clears session state and allows another attempt', async (t) => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'blob-session-test-'));
    t.after(() => fs.rmdir(directory));
    await assert.rejects(
        startSession(
            {},
            false,
            async () => {
                throw new Error('test launch failure');
            },
            directory,
        ),
        /test launch failure/,
    );
    await assert.rejects(fs.access(path.join(directory, 'session.json')));
});

test('permission setup refuses the original profile or a session that keeps profile changes', async () => {
    const options = runOptions('C:/test/firefox.exe', 'C:/test/profile');
    const desktop = {
        getName: () => 'Firefox Desktop',
        params: { keepProfileChanges: false },
        profile: { path: () => options.firefoxProfile },
    };
    await assert.rejects(
        allowDevelopmentExtension({ extensionRunners: [desktop] }, options),
        /copied development profile/,
    );
    desktop.profile.path = () => 'C:/test/temporary-copy';
    await assert.rejects(
        allowDevelopmentExtension(
            { extensionRunners: [desktop] },
            { ...options, keepProfileChanges: true },
        ),
        /copied development profile/,
    );
    desktop.params.keepProfileChanges = true;
    await assert.rejects(
        allowDevelopmentExtension({ extensionRunners: [desktop] }, options),
        /copied development profile/,
    );
});

test('permission setup failure closes the owned browser and clears session state', async (t) => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'blob-session-test-'));
    t.after(() => fs.rmdir(directory));
    let exited = false;
    await assert.rejects(
        startSession(
            {},
            false,
            async () => ({
                registerCleanup(callback) {
                    this.callback = callback;
                },
                async exit() {
                    exited = true;
                    this.callback();
                },
            }),
            directory,
            async () => {
                throw new Error('Permission verification failed');
            },
        ),
        /Permission verification failed/,
    );
    assert.equal(exited, true);
    await assert.rejects(fs.access(path.join(directory, 'session.json')));
});

test('failed browser shutdown still releases session ownership', async (t) => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'blob-session-test-'));
    t.after(() => fs.rmdir(directory));
    await assert.rejects(
        startSession(
            {},
            false,
            async () => ({
                registerCleanup() {},
                async exit() {
                    throw new Error('test shutdown failure');
                },
            }),
            directory,
            async () => {
                throw new Error('test permission failure');
            },
        ),
        /test shutdown failure/,
    );
    await assert.rejects(fs.access(path.join(directory, 'session.json')));
});

test('stale ownership cannot release a newer session or its stop request', async (t) => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'blob-session-test-'));
    const ownership = await claimSession(directory);
    t.after(async () => {
        await fs.unlink(ownership.stateFile);
        await fs.unlink(ownership.stopFile);
        await fs.rmdir(directory);
    });
    await fs.writeFile(
        ownership.stateFile,
        JSON.stringify({ pid: process.pid, token: 'new-session' }),
    );
    await fs.writeFile(ownership.stopFile, JSON.stringify({ token: 'new-session' }));
    await releaseSession(ownership);
    assert.equal(JSON.parse(await fs.readFile(ownership.stateFile, 'utf8')).token, 'new-session');
    assert.equal(JSON.parse(await fs.readFile(ownership.stopFile, 'utf8')).token, 'new-session');
});
