export const settingsStorageKey = 'sitePreferences.v1';
export const maximumSavedSites = 200;
export interface SiteSettings {
    captureMinimumMiB: number;
    requestPattern: string;
}
export interface SiteSettingsState {
    defaults: SiteSettings;
    sites: Record<string, Partial<SiteSettings>>;
}
export interface SettingsDocument extends SiteSettingsState {
    version: 1;
    revision: number;
}
export type SettingsChange =
    | { type: 'siteUpdated'; siteKey: string; patch: Partial<SiteSettings> }
    | { type: 'siteReset'; siteKey: string }
    | { type: 'defaultsUpdated'; patch: Partial<SiteSettings> }
    | { type: 'sitesCleared' };

export function createSettingsDocument(): SettingsDocument {
    return {
        version: 1,
        revision: 0,
        defaults: { captureMinimumMiB: 10, requestPattern: '.m3u8' },
        sites: {},
    };
}
export function siteKeyForUrl(value: string): string | null {
    try {
        const url = new URL(value);
        return ['http:', 'https:'].includes(url.protocol) ? url.origin : null;
    } catch {
        return null;
    }
}
function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}
export function validateSiteKey(value: unknown): string {
    if (typeof value !== 'string' || value.length > 2048 || siteKeyForUrl(value) !== value)
        throw new Error('Use a website origin without a path, query, or credentials.');
    return value;
}
export function validateSettingsPatch(value: unknown): Partial<SiteSettings> {
    if (
        !isRecord(value) ||
        Object.keys(value).some((key) => !['captureMinimumMiB', 'requestPattern'].includes(key))
    )
        throw new Error('Unsupported website setting.');
    const patch: Partial<SiteSettings> = {};
    if ('captureMinimumMiB' in value) {
        if (
            typeof value.captureMinimumMiB !== 'number' ||
            !Number.isFinite(value.captureMinimumMiB) ||
            value.captureMinimumMiB < 1 ||
            value.captureMinimumMiB > 63.9
        )
            throw new Error('Choose a capture threshold from 1 to 63.9 MiB.');
        patch.captureMinimumMiB = value.captureMinimumMiB;
    }
    if ('requestPattern' in value) {
        if (
            typeof value.requestPattern !== 'string' ||
            !value.requestPattern.replaceAll('*', '').trim() ||
            value.requestPattern.trim().length > 80
        )
            throw new Error('Use a request URL substring from 1 to 80 characters.');
        patch.requestPattern = value.requestPattern.trim();
    }
    return patch;
}
export function parseSettingsDocument(value: unknown): SettingsDocument {
    if (value === undefined) return createSettingsDocument();
    if (!isRecord(value) || value.version !== 1)
        throw new Error(
            'Saved settings have an unsupported format. They have not been overwritten.',
        );
    if (
        !Number.isSafeInteger(value.revision) ||
        Number(value.revision) < 0 ||
        !isRecord(value.sites) ||
        Object.keys(value.sites).length > maximumSavedSites
    )
        throw new Error('Saved settings are invalid. They have not been overwritten.');
    const defaults = validateSettingsPatch(value.defaults);
    if (defaults.captureMinimumMiB === undefined || defaults.requestPattern === undefined)
        throw new Error('Saved defaults are incomplete.');
    const sites: SiteSettingsState['sites'] = {};
    for (const [key, patch] of Object.entries(value.sites))
        sites[validateSiteKey(key)] = validateSettingsPatch(patch);
    return {
        version: 1,
        revision: Number(value.revision),
        defaults: defaults as SiteSettings,
        sites,
    };
}
export function settingsForSite(state: SiteSettingsState, siteKey: string | null): SiteSettings {
    return { ...state.defaults, ...(siteKey ? state.sites[siteKey] : {}) };
}
export function applySettingsChange<State extends SiteSettingsState>(
    state: State,
    change: SettingsChange,
): State {
    switch (change.type) {
        case 'siteUpdated': {
            const siteKey = validateSiteKey(change.siteKey);
            const patch = validateSettingsPatch(change.patch);
            if (
                !Object.hasOwn(state.sites, siteKey) &&
                Object.keys(state.sites).length >= maximumSavedSites
            )
                throw new Error(
                    `Up to ${maximumSavedSites} websites can be saved. Forget an existing website first.`,
                );
            return {
                ...state,
                sites: { ...state.sites, [siteKey]: { ...state.sites[siteKey], ...patch } },
            };
        }
        case 'siteReset': {
            const siteKey = validateSiteKey(change.siteKey);
            const sites = { ...state.sites };
            delete sites[siteKey];
            return { ...state, sites };
        }
        case 'defaultsUpdated':
            return {
                ...state,
                defaults: { ...state.defaults, ...validateSettingsPatch(change.patch) },
            };
        case 'sitesCleared':
            return { ...state, sites: {} };
    }
}
