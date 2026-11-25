import fs from 'node:fs/promises';
import path from 'node:path';
import webExt from 'web-ext';
import { projectPath } from './lib/project.mjs';
import { connectBrowserConsole, evaluateBrowserTask } from './browser/rdp-console.mjs';
import { allowDevelopmentExtension } from './allow-extension.mjs';

const index = process.argv.indexOf('--browser');
if (index < 0 || !process.argv[index + 1])
    throw new Error('Supply --browser <Firefox executable>.');
await fs.mkdir(projectPath('artifacts'), { recursive: true });
const directory = await fs.mkdtemp(projectPath('artifacts', 'popup-smoke-'));
const profile = path.join(directory, 'profile');
const sourceDir = path.join(directory, 'extension');
await fs.mkdir(profile);
await fs.cp(projectPath('extension'), sourceDir, { recursive: true });

async function inspectPopup({ id, profile }) {
    try {
        const actualProfile = Services.dirsvc.get('ProfD', Ci.nsIFile).path;
        const normalize = (value) => value.replaceAll('\\', '/').replace(/\/$/, '').toLowerCase();
        if (normalize(actualProfile) !== normalize(profile))
            throw new Error('Unexpected browser profile.');
        const { AddonManager } = ChromeUtils.importESModule(
            'resource://gre/modules/AddonManager.sys.mjs',
        );
        const addon = await AddonManager.getAddonByID(id);
        if (!addon?.temporarilyInstalled) throw new Error('Expected a temporary test add-on.');
        const { ExtensionParent } = ChromeUtils.importESModule(
            'resource://gre/modules/ExtensionParent.sys.mjs',
        );
        const extension = ExtensionParent.WebExtensionPolicy.getByID(id).extension;
        const win = Services.wm.getMostRecentWindow('navigator:browser');
        win.focus();
        const widgetId = id.toLowerCase().replace(/[^a-z0-9_-]/g, '_') + '-browser-action';
        const node = win.document.getElementById(widgetId);
        const button = node?.querySelector('.unified-extensions-item-action-button') || node;
        if (!button) throw new Error('Toolbar button not found.');
        if (!node.closest('#nav-bar') || button.getBoundingClientRect().width <= 0)
            throw new Error('Temporary add-on is not visibly pinned to the toolbar.');
        button.dispatchEvent(new win.CustomEvent('command', { bubbles: true, cancelable: true }));
        await new Promise((resolve) => setTimeout(resolve, 2000));
        return JSON.stringify({
            toolbarPinned: true,
            views: [...extension.views].map((view) => ({
                type: view.viewType,
                uri: view.uri?.spec,
            })),
            panels: [...win.document.querySelectorAll('panel')]
                .filter((panel) => panel.state === 'open')
                .map((panel) => ({
                    id: panel.id,
                    width: panel.getBoundingClientRect().width,
                    height: panel.getBoundingClientRect().height,
                })),
            browsers: [...win.document.querySelectorAll('browser')]
                .filter((browser) => browser.getAttribute('webextension-view-type') === 'popup')
                .map((browser) => ({
                    width: browser.getBoundingClientRect().width,
                    height: browser.getBoundingClientRect().height,
                    style: browser.getAttribute('style'),
                })),
        });
    } catch (error) {
        return JSON.stringify({ error: String(error), stack: error.stack, panels: [] });
    }
}

let runner, connection;
try {
    const options = {
        sourceDir,
        artifactsDir: path.join(directory, 'web-ext'),
        firefox: process.argv[index + 1],
        firefoxProfile: profile,
        keepProfileChanges: false,
        noReload: true,
        noInput: true,
        args: ['--headless'],
        startUrl: ['about:blank'],
        ignoreFiles: [],
    };
    runner = await webExt.cmd.run(options);
    await allowDevelopmentExtension(runner, options);
    const desktop = runner.extensionRunners.find((item) => item.getName() === 'Firefox Desktop');
    connection = await connectBrowserConsole(desktop.runningInfo.debuggerPort);
    const manifest = JSON.parse(await fs.readFile(path.join(sourceDir, 'manifest.json'), 'utf8'));
    const report = JSON.parse(
        await evaluateBrowserTask(connection, inspectPopup, {
            id: manifest.browser_specific_settings.gecko.id,
            profile: desktop.profile.path(),
        }),
    );
    await fs.writeFile(path.join(directory, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ ...report, directory }, null, 2));
    if (
        !report.views?.some((view) => view.type === 'popup') ||
        !report.browsers?.some(
            (browser) => Math.abs(browser.width - 400) <= 1 && browser.height >= 100,
        )
    )
        throw new Error('Native extension popup did not open at a usable width.');
} finally {
    connection?.client.disconnect();
    if (runner) {
        const desktop = runner.extensionRunners.find(
            (item) => item.getName() === 'Firefox Desktop',
        );
        const child = desktop?.runningInfo?.firefox;
        const exited =
            child && child.exitCode === null && child.signalCode === null
                ? new Promise((resolve) => child.once('exit', resolve))
                : Promise.resolve();
        const closed = child
            ? new Promise((resolve) => child.once('close', resolve))
            : Promise.resolve();
        await runner.exit();
        await exited;
        let timeout;
        await Promise.race([
            closed,
            new Promise((resolve) => {
                timeout = setTimeout(resolve, 2000);
            }),
        ]);
        clearTimeout(timeout);
        child?.stdout?.destroy();
        child?.stderr?.destroy();
    }
}
