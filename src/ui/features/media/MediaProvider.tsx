import { useCallback, useMemo, useReducer, type ReactNode } from 'react';
import { requiredContext } from '../../context';
import { command, type MediaState } from '../../api';
import type { BlobSelection } from '../../state/blobs';
import { mediaReducer, initialMediaState, type MediaFeatureState } from '../../state/media';
import { useSource } from '../../app/SourceProvider';
import { useTaskActions } from '../../app/TaskProvider';
import { useSiteSettings } from '../../settings/SiteSettingsProvider';
import { usePolling, useRequestScope } from '../../services/hooks';
import { errorMessage } from '../../../shared/errors';

interface MediaActions {
    editPlaylist(value: string): void;
    editFilename(value: string): void;
    selectVariant(value: number): void;
    toggleNetwork(): Promise<void>;
    toggleElements(): Promise<void>;
    clearDetected(): Promise<void>;
    inspectPlaylist(): Promise<void>;
    convert(): Promise<void>;
    remuxBlob(selection: BlobSelection): Promise<void>;
    cancel(): Promise<void>;
}
const [StateProvider, useMediaState] = requiredContext<MediaFeatureState>('Media state');
const [ActionsProvider, useMediaActions] = requiredContext<MediaActions>('Media actions');
export { useMediaState, useMediaActions };

export function MediaProvider({ children }: { children: ReactNode }) {
    const { tab } = useSource();
    const tabId = tab?.id;
    const [state, dispatch] = useReducer(mediaReducer, initialMediaState);
    const { run } = useTaskActions();
    const { requestPattern } = useSiteSettings();
    const requests = useRequestScope();
    const applySnapshot = useCallback(
        (snapshot: MediaState) => dispatch({ type: 'snapshotReceived', snapshot }),
        [],
    );
    const refresh = useCallback(async () => {
        if (tabId === undefined) return;
        await requests.read('media', () => command('media-state', { tabId }), applySnapshot);
    }, [tabId, requests, applySnapshot]);
    const syncFailed = useCallback(
        (error: unknown) => dispatch({ type: 'syncFailed', error: errorMessage(error) }),
        [],
    );
    usePolling(refresh, tabId !== undefined, syncFailed);
    const actions = useMemo<MediaActions>(() => {
        const requireTabId = () => {
            if (tabId === undefined) throw new Error('Open a source webpage first.');
            return tabId;
        };
        const update = (task: () => Promise<MediaState>, notice?: string) =>
            run(async () => {
                const applied = await requests.mutate('media', task, applySnapshot);
                return applied ? notice : undefined;
            });
        return {
            editPlaylist(url) {
                requests.invalidate('probe');
                dispatch({ type: 'playlistEdited', url });
            },
            editFilename: (filename) => dispatch({ type: 'filenameEdited', filename }),
            selectVariant: (variant) => dispatch({ type: 'variantSelected', variant }),
            toggleNetwork: () =>
                update(async () => {
                    if (state.snapshot.network)
                        return command('network-stop', { tabId: requireTabId() });
                    const granted = await browser.permissions.request({
                        origins: ['http://*/*', 'https://*/*'],
                    });
                    if (!granted) throw new Error('Website access was not granted.');
                    return command('network-start', {
                        tabId: requireTabId(),
                        pattern: requestPattern,
                    });
                }),
            toggleElements: () =>
                update(() =>
                    command(state.snapshot.elements ? 'elements-stop' : 'elements-start', {
                        tabId: requireTabId(),
                    }),
                ),
            clearDetected: () => update(() => command('media-clear', { tabId: requireTabId() })),
            cancel: () => update(() => command('conversion-cancel', { tabId })),
            convert: () =>
                update(
                    () =>
                        command('hls-start', {
                            tabId: requireTabId(),
                            url: state.form.playlist,
                            variant: state.form.variant,
                            filename: `${state.form.filename || 'media'}.mp4`,
                        }),
                    'Conversion started.',
                ),
            remuxBlob: (selection) =>
                update(() =>
                    command('blob-remux', {
                        tabId: requireTabId(),
                        ...selection,
                        filename: selection.filename || 'media.mp4',
                    }),
                ),
            inspectPlaylist: () =>
                run(async () => {
                    const { playlist: url, revision } = state.form;
                    let notice: string | undefined;
                    await requests.read(
                        'probe',
                        () => command('hls-probe', { url }),
                        (result) => {
                            if (result.live) throw new Error('Live playlists are unsupported.');
                            dispatch({
                                type: 'playlistInspected',
                                url,
                                revision,
                                variants: result.variants,
                            });
                            notice = result.variants.length
                                ? `${result.variants.length} quality options.`
                                : 'Playlist ready.';
                        },
                    );
                    return notice;
                }),
        };
    }, [
        state.snapshot.network,
        state.snapshot.elements,
        state.form,
        tabId,
        requestPattern,
        requests,
        run,
        applySnapshot,
    ]);
    return (
        <StateProvider value={state}>
            <ActionsProvider value={actions}>{children}</ActionsProvider>
        </StateProvider>
    );
}
