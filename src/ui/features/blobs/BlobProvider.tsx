import { useCallback, useEffect, useMemo, useReducer, type ReactNode } from 'react';
import { requiredContext } from '../../context';
import { command } from '../../api';
import {
    blobReducer,
    initialBlobState,
    type BlobState,
    type BlobSelection,
} from '../../state/blobs';
import { useSource } from '../../app/SourceProvider';
import { useTaskActions } from '../../app/TaskProvider';
import { useSiteSettings } from '../../settings/SiteSettingsProvider';
import { usePolling, useRequestScope } from '../../services/hooks';
import { errorMessage } from '../../../shared/errors';

interface BlobActions {
    editUrl(value: string): void;
    editFilename(value: string): void;
    selectFrame(value: number): void;
    selectDetected(value: string): void;
    useSelection(value: BlobSelection): void;
    scan(): Promise<void>;
    toggleCapture(): Promise<void>;
    testHook(): Promise<void>;
    download(): Promise<void>;
}
const [StateProvider, useBlobState] = requiredContext<BlobState>('Blob state');
const [ActionsProvider, useBlobActions] = requiredContext<BlobActions>('Blob actions');
export { useBlobState, useBlobActions };

export function BlobProvider({ children }: { children: ReactNode }) {
    const { tab } = useSource();
    const tabId = tab?.id;
    const [state, dispatch] = useReducer(blobReducer, initialBlobState);
    const { run } = useTaskActions();
    const { captureMinimumMiB } = useSiteSettings();
    const requests = useRequestScope();
    const refresh = useCallback(async () => {
        if (tabId === undefined) return;
        await requests.read(
            'watch',
            () => command('watch-status', { tabId }),
            (watch) => dispatch({ type: 'watchReceived', watch }),
        );
    }, [tabId, requests]);
    const syncFailed = useCallback(
        (error: unknown) => dispatch({ type: 'syncFailed', error: errorMessage(error) }),
        [],
    );
    usePolling(refresh, tabId !== undefined, syncFailed);
    const scan = useCallback(
        () =>
            run(async () => {
                if (tabId === undefined) return;
                dispatch({ type: 'scanStarted' });
                await requests.read(
                    'scan',
                    () => command('scan', { tabId }),
                    (result) => dispatch({ type: 'scanReceived', frames: result.frames }),
                );
            }),
        [tabId, requests, run],
    );
    useEffect(() => {
        if (tabId !== undefined) void scan();
    }, [tabId, scan]);
    const actions = useMemo<BlobActions>(
        () => ({
            editUrl: (value) => dispatch({ type: 'urlEdited', url: value }),
            editFilename: (filename) => dispatch({ type: 'filenameEdited', filename }),
            selectFrame: (frameId) => dispatch({ type: 'frameSelected', frameId }),
            useSelection: (selection) => dispatch({ type: 'blobSelected', selection }),
            selectDetected(value) {
                const [frameId, index] = value.split(':').map(Number);
                const found = state.frames.find((frame) => frame.frameId === frameId)?.blobs[index];
                if (found)
                    dispatch({
                        type: 'blobSelected',
                        selection: { frameId, url: found.url, filename: found.filename },
                    });
            },
            scan,
            toggleCapture: () =>
                run(async () => {
                    if (tabId === undefined) return;
                    await requests.mutate(
                        'watch',
                        () =>
                            state.watch.enabled
                                ? command('watch-stop', { tabId })
                                : command('watch-start', {
                                      tabId,
                                      minimumMiB: captureMinimumMiB,
                                  }),
                        (watch) => dispatch({ type: 'watchReceived', watch }),
                    );
                }),
            testHook: () =>
                run(async () => {
                    if (tabId === undefined) return;
                    await requests.mutate(
                        'watch',
                        () => command('watch-test', { tabId }),
                        (watch) => dispatch({ type: 'watchReceived', watch }),
                    );
                }),
            download: () =>
                run(async () => {
                    if (tabId === undefined) return;
                    await command('download', {
                        tabId,
                        ...state.selection,
                    });
                    return 'Download started.';
                }),
        }),
        [
            state.frames,
            state.selection,
            state.watch.enabled,
            tabId,
            requests,
            run,
            scan,
            captureMinimumMiB,
        ],
    );
    return (
        <StateProvider value={state}>
            <ActionsProvider value={actions}>{children}</ActionsProvider>
        </StateProvider>
    );
}
