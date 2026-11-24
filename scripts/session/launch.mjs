import { allowDevelopmentExtension } from '../allow-extension.mjs';

export async function launchDevelopmentBrowser(options) {
    const { default: webExt } = await import('web-ext');
    return webExt.cmd.run(options);
}

export async function allowBrowserDefaults(runner, options) {
    const result = await allowDevelopmentExtension(runner, options);
    console.log(
        'The extension is pinned to the toolbar and allowed in private windows and on sites with restrictions in the development profile.',
    );
    return result;
}

export function printInstallPreview(options) {
    console.log(
        JSON.stringify(
            {
                action: 'temporary-install',
                ...options,
                toolbarPinned: true,
                permissionDefaults: {
                    privateWindows: 'Allow',
                    restrictedSites: 'Allow',
                    scope: 'This extension in the copied development profile',
                },
            },
            null,
            4,
        ),
    );
}
