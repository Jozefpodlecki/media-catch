import fs from 'node:fs/promises';
import path from 'node:path';
import { requireCopiedProfile } from './browser/profile-guard.mjs';
import { configureTemporaryAddonPermissions } from './browser/addon-permissions.mjs';
import { connectBrowserConsole, evaluateBrowserTask } from './browser/rdp-console.mjs';

export async function allowDevelopmentExtension(runner, options, { apply = true } = {}) {
    const desktop = requireCopiedProfile(runner, options);
    const manifest = JSON.parse(
        await fs.readFile(path.join(options.sourceDir, 'manifest.json'), 'utf8'),
    );
    const id = manifest.browser_specific_settings?.gecko?.id;
    if (!id) throw new Error('A stable Gecko extension ID is required for automatic permissions.');
    const connection = await connectBrowserConsole(desktop.runningInfo.debuggerPort);
    try {
        const text = await evaluateBrowserTask(connection, configureTemporaryAddonPermissions, {
            id,
            apply,
        });
        if (typeof text !== 'string')
            throw new Error('The browser did not return a permission verification result.');
        const permissions = JSON.parse(text);
        if (!permissions.privateWindows || !permissions.restrictedSites)
            throw new Error('The browser did not confirm both add-on permissions.');
        if (!permissions.toolbarPinned)
            throw new Error(
                'The browser did not confirm that the add-on is pinned to the toolbar.',
            );
        return permissions;
    } finally {
        connection.client.disconnect();
    }
}
