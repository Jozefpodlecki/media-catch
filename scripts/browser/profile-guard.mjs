import path from 'node:path';
export function requireCopiedProfile(runner, options) {
    const desktop = runner.extensionRunners?.find((item) => item.getName() === 'Firefox Desktop');
    const copiedProfile = desktop?.profile?.path();
    if (
        options.keepProfileChanges !== false ||
        desktop?.params.keepProfileChanges !== false ||
        !copiedProfile ||
        path.resolve(copiedProfile).toLowerCase() ===
            path.resolve(options.firefoxProfile).toLowerCase()
    ) {
        throw new Error(
            'Automatic permissions require a copied development profile. The normal profile was not changed.',
        );
    }
    return desktop;
}
