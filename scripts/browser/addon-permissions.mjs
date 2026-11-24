export async function configureTemporaryAddonPermissions({ id, apply }) {
    const { AddonManager } = ChromeUtils.importESModule(
        'resource://gre/modules/AddonManager.sys.mjs',
    );
    const { ExtensionPermissions, QuarantinedDomains } = ChromeUtils.importESModule(
        'resource://gre/modules/ExtensionPermissions.sys.mjs',
    );
    const { ExtensionParent } = ChromeUtils.importESModule(
        'resource://gre/modules/ExtensionParent.sys.mjs',
    );
    const addon = await AddonManager.getAddonByID(id);
    if (!addon?.temporarilyInstalled) throw new Error('Refusing to change a non-temporary add-on.');
    if (apply) {
        await ExtensionPermissions.add(id, {
            permissions: ['internal:privateBrowsingAllowed'],
            origins: [],
        });
        QuarantinedDomains.setUserAllowedAddonIdPref(id, true);
        await addon.reload();
    }
    let CustomizableUI;
    try {
        ({ CustomizableUI } = ChromeUtils.importESModule(
            'resource:///modules/CustomizableUI.sys.mjs',
        ));
    } catch {
        ({ CustomizableUI } = ChromeUtils.importESModule(
            'moz-src:///browser/components/customizableui/CustomizableUI.sys.mjs',
        ));
    }
    const widgetId = id.toLowerCase().replace(/[^a-z0-9_-]/g, '_') + '-browser-action';
    if (apply && CustomizableUI.getPlacementOfWidget(widgetId)?.area !== CustomizableUI.AREA_NAVBAR)
        CustomizableUI.addWidgetToArea(widgetId, CustomizableUI.AREA_NAVBAR);
    const toolbarPinned =
        CustomizableUI.getPlacementOfWidget(widgetId)?.area === CustomizableUI.AREA_NAVBAR;
    if (apply && !toolbarPinned)
        throw new Error('The browser could not pin the temporary add-on to the toolbar.');
    const policy = ExtensionParent.WebExtensionPolicy.getByID(id);
    return JSON.stringify({
        privateWindows: Boolean(policy?.privateBrowsingAllowed),
        restrictedSites: Boolean(policy?.ignoreQuarantine),
        toolbarPinned,
    });
}
