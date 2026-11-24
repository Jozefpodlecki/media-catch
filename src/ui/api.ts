import type { ImageCandidate, ImageBatch } from '../shared/images';
import type { Attempt, HookDiagnostic, MediaObservation } from '../shared/contracts';
import type { CommandPayloads, MediaCommand } from '../shared/messages';
import type { Variant } from '../hls/playlist';
import type { SettingsDocument } from '../shared/settings';

type CommandResults = {
    'images-scan': { images: ImageCandidate[]; truncated: boolean };
    'images-state': { batch: ImageBatch | null };
    'images-stop': { batch: ImageBatch | null };
    'images-download': { batch: ImageBatch | null };
    scan: { frames: BlobFrame[] };
    download: { id: number; size: number };
    'history-get': { entries: Attempt[] };
    'history-clear': Record<never, never>;
    'hls-probe': { variants: Variant[]; live: boolean };
} & Record<
    'settings-get' | 'settings-update' | 'settings-reset' | 'settings-defaults' | 'settings-clear',
    { settings: SettingsDocument }
> &
    Record<'watch-start' | 'watch-stop' | 'watch-status' | 'watch-test', WatchState> &
    Record<Exclude<MediaCommand['action'], 'hls-probe'>, MediaState>;
type CommandArguments<Action extends keyof CommandPayloads> =
    Record<never, never> extends CommandPayloads[Action]
        ? [data?: CommandPayloads[Action]]
        : [data: CommandPayloads[Action]];

export async function command<Action extends keyof CommandResults>(
    action: Action,
    ...args: CommandArguments<Action>
): Promise<CommandResults[Action]> {
    const result = (await browser.runtime.sendMessage({ action, ...args[0] })) as {
        ok?: boolean;
        error?: unknown;
    } | null;
    if (!result?.ok)
        throw new Error(
            typeof result?.error === 'string'
                ? result.error
                : 'The extension did not respond. Reload it and try again.',
        );
    return result as CommandResults[Action];
}
export interface BlobFrame {
    frameId: number;
    page: string;
    blobs: { url: string; filename: string; source: string }[];
}
export interface WatchState {
    enabled: boolean;
    minimumMiB: number;
    count: number;
    attempts: number;
    lastResult: string;
    diagnostics: ({ frameId: number } & HookDiagnostic)[];
    diagnosticError: string;
    hookTest?: string;
}
export interface MediaState {
    network: boolean;
    pattern: string;
    elements: boolean;
    observations: MediaObservation[];
    records: {
        id: number;
        tabId: number;
        frameId: number;
        url: string;
        source: string;
        time: string;
        status: string;
        kind: string;
    }[];
    job: { tabId: number; running: boolean; state: string; message: string } | null;
}
