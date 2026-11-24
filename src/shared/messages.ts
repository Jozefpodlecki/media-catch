import { imageLimit } from './images';
import type { SiteSettings } from './settings';
type TabRequest = { tabId: number };
type FileRequest = TabRequest & { url: string; frameId: number; filename?: string };

export interface CommandPayloads {
    'settings-get': Record<never, never>;
    'settings-update': { siteKey: string; patch: Partial<SiteSettings> };
    'settings-reset': { siteKey: string };
    'settings-defaults': { patch: Partial<SiteSettings> };
    'settings-clear': Record<never, never>;
    'images-scan': TabRequest;
    'images-state': TabRequest;
    'images-stop': TabRequest;
    'images-download': TabRequest & { items: { url: string; frameId: number }[] };
    scan: TabRequest;
    download: FileRequest;
    'watch-start': TabRequest & { minimumMiB: number };
    'watch-stop': TabRequest;
    'watch-status': TabRequest;
    'watch-test': TabRequest;
    'history-get': Record<never, never>;
    'history-clear': Record<never, never>;
    'media-state': TabRequest;
    'network-start': TabRequest & { pattern?: string };
    'network-stop': TabRequest;
    'elements-start': TabRequest;
    'elements-stop': TabRequest;
    'media-clear': TabRequest;
    'hls-probe': { url: string };
    'hls-start': TabRequest & {
        url: string;
        filename?: string;
        variant?: number;
        frameId?: number;
    };
    'blob-remux': Omit<FileRequest, 'frameId'> & { frameId?: number };
    'conversion-cancel': { tabId?: number };
}

export type CommandAction = keyof CommandPayloads;
export type ExtensionCommand = {
    [Action in CommandAction]: { action: Action } & CommandPayloads[Action];
}[CommandAction];
export type CommandOf<Action extends CommandAction> = Extract<ExtensionCommand, { action: Action }>;
export type ConversionCommand = CommandOf<'hls-start' | 'blob-remux'>;
export type MediaCommand = CommandOf<
    | 'media-state'
    | 'network-start'
    | 'network-stop'
    | 'elements-start'
    | 'elements-stop'
    | 'media-clear'
    | 'hls-probe'
    | 'hls-start'
    | 'blob-remux'
    | 'conversion-cancel'
>;
export interface AutomaticCapture {
    action: 'auto-blob';
    token: string;
    url?: string;
    dataUrl?: unknown;
    captureError?: string;
}
export interface ObservedMedia {
    action: 'media-observed';
    token: string;
    observations: unknown[];
}
export type PageCommand = AutomaticCapture | ObservedMedia;

const isRecord = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === 'object' && !Array.isArray(value);
const isId = (value: unknown) => Number.isSafeInteger(value) && Number(value) >= 0;
const hasTab = (value: Record<string, unknown>) => isId(value.tabId);
const hasUrl = (value: Record<string, unknown>) =>
    typeof value.url === 'string' && value.url.length <= 16384;
const hasOptionalFrame = (value: Record<string, unknown>) =>
    value.frameId === undefined || isId(value.frameId);
const hasFilename = (value: Record<string, unknown>) =>
    value.filename === undefined ||
    (typeof value.filename === 'string' && value.filename.length <= 4096);
const isFileRequest = (value: Record<string, unknown>) =>
    hasTab(value) && hasUrl(value) && isId(value.frameId) && hasFilename(value);

const validators: Record<CommandAction, (value: Record<string, unknown>) => boolean> = {
    'settings-get': () => true,
    'settings-update': (value) => typeof value.siteKey === 'string' && isRecord(value.patch),
    'settings-reset': (value) => typeof value.siteKey === 'string',
    'settings-defaults': (value) => isRecord(value.patch),
    'settings-clear': () => true,
    'images-scan': hasTab,
    'images-state': hasTab,
    'images-stop': hasTab,
    'images-download': (value) =>
        hasTab(value) &&
        Array.isArray(value.items) &&
        value.items.length > 0 &&
        value.items.length <= imageLimit &&
        value.items.every((item: unknown) => isRecord(item) && hasUrl(item) && isId(item.frameId)),
    scan: hasTab,
    download: isFileRequest,
    'watch-start': (value) => hasTab(value) && typeof value.minimumMiB === 'number',
    'watch-stop': hasTab,
    'watch-status': hasTab,
    'watch-test': hasTab,
    'history-get': () => true,
    'history-clear': () => true,
    'media-state': hasTab,
    'network-start': (value) =>
        hasTab(value) && (value.pattern === undefined || typeof value.pattern === 'string'),
    'network-stop': hasTab,
    'elements-start': hasTab,
    'elements-stop': hasTab,
    'media-clear': hasTab,
    'hls-probe': hasUrl,
    'hls-start': (value) =>
        hasTab(value) &&
        hasUrl(value) &&
        hasFilename(value) &&
        hasOptionalFrame(value) &&
        (value.variant === undefined || isId(value.variant)),
    'blob-remux': (value) =>
        hasTab(value) && hasUrl(value) && hasFilename(value) && hasOptionalFrame(value),
    'conversion-cancel': (value) => value.tabId === undefined || isId(value.tabId),
};

export function parseExtensionCommand(value: unknown): ExtensionCommand | undefined {
    if (
        !isRecord(value) ||
        typeof value.action !== 'string' ||
        !Object.hasOwn(validators, value.action)
    )
        return undefined;
    if (!validators[value.action as CommandAction](value))
        throw new Error('Invalid extension command payload.');
    return value as ExtensionCommand;
}

export function parsePageCommand(value: unknown): PageCommand | undefined {
    if (!isRecord(value) || typeof value.token !== 'string' || value.token.length > 100)
        return undefined;
    if (
        value.action === 'auto-blob' &&
        (value.url === undefined || typeof value.url === 'string') &&
        (value.captureError === undefined || typeof value.captureError === 'string')
    )
        return value as unknown as AutomaticCapture;
    if (value.action === 'media-observed' && Array.isArray(value.observations))
        return value as unknown as ObservedMedia;
    return undefined;
}
