import { projectPath } from '../lib/project.mjs';
import { claimSession } from './store.mjs';
import { createSessionController } from './controller.mjs';
import { launchDevelopmentBrowser, allowBrowserDefaults, printInstallPreview } from './launch.mjs';

export async function startSession(
    options,
    dryRun = false,
    run,
    directory = projectPath('.dev-session'),
    allowPermissions,
) {
    if (dryRun) return printInstallPreview(options);
    if (!run) {
        run = launchDevelopmentBrowser;
        allowPermissions ??= allowBrowserDefaults;
    }
    const ownership = await claimSession(directory);
    const controller = createSessionController(ownership);
    try {
        const runner = await run(options);
        await controller.attach(runner);
        if (!controller.stopping && allowPermissions) await allowPermissions(runner, options);
        console.log(
            'Temporary extension installed. Run npm run compile after editing src/; generated extension changes reload automatically.',
        );
        await controller.done;
    } finally {
        await controller.close();
    }
}
