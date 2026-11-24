import { extractImagePatterns } from '../../../shared/image-patterns';
import { useCallback, useMemo, useReducer, type ReactNode } from 'react';
import { requiredContext } from '../../context';
import { command } from '../../api';
import { useSource } from '../../app/SourceProvider';
import { useTaskActions } from '../../app/TaskProvider';
import { usePolling, useRequestScope } from '../../services/hooks';
import {
    imagesReducer,
    initialImagesState,
    imageTarget,
    type ImagesState,
} from '../../state/images';
import { errorMessage } from '../../../shared/errors';

interface ImagesActions {
    scan(): Promise<void>;
    selectPattern(template: string): void;
    usePatternPrefix(template: string): void;
    download(): Promise<void>;
    stop(): Promise<void>;
    toggle(id: string): void;
    selectAll(selected: boolean): void;
    source(value: ImagesState['source']): void;
    find(value: string): void;
    replacement(value: string): void;
    override(id: string, value: string): void;
    page(value: number): void;
}
const [StateProvider, useImagesState] = requiredContext<ImagesState>('Images state');
const [ActionsProvider, useImagesActions] = requiredContext<ImagesActions>('Images actions');
export { useImagesState, useImagesActions };

export function ImagesProvider({ children }: { children: ReactNode }) {
    const { tab } = useSource();
    const tabId = tab?.id;
    const [state, dispatch] = useReducer(imagesReducer, initialImagesState);
    const { run } = useTaskActions();
    const requests = useRequestScope();
    const refresh = useCallback(async () => {
        if (tabId === undefined) return;
        await requests.read(
            'batch',
            () => command('images-state', { tabId }),
            ({ batch }) => dispatch({ type: 'batch', batch }),
        );
    }, [requests, tabId]);
    const failed = useCallback(
        (error: unknown) => dispatch({ type: 'failed', error: errorMessage(error) }),
        [],
    );
    usePolling(refresh, tabId !== undefined, failed);
    const actions = useMemo<ImagesActions>(
        () => ({
            selectPattern(template) {
                const pattern = extractImagePatterns(state.images).find(
                    (item) => item.template === template,
                );
                if (pattern) dispatch({ type: 'patternSelected', ids: pattern.imageIds });
            },
            usePatternPrefix(template) {
                const pattern = extractImagePatterns(state.images).find(
                    (item) => item.template === template,
                );
                if (pattern?.prefix) dispatch({ type: 'prefixChosen', prefix: pattern.prefix });
            },
            scan: () =>
                run(async () => {
                    if (tabId === undefined) return;
                    await requests.read(
                        'scan',
                        () => command('images-scan', { tabId }),
                        (result) => dispatch({ type: 'scanned', ...result }),
                    );
                }),
            download: () =>
                run(async () => {
                    if (tabId === undefined) return;
                    const items = state.images
                        .filter((image) => state.selected.includes(image.id))
                        .map((image) => ({
                            url: imageTarget(state, image),
                            frameId: image.frameId,
                        }));
                    if (!items.length) throw new Error('Select at least one image.');
                    await requests.mutate(
                        'batch',
                        () => command('images-download', { tabId, items }),
                        ({ batch }) => dispatch({ type: 'batch', batch }),
                    );
                }),
            stop: () =>
                run(async () => {
                    if (tabId === undefined) return;
                    await requests.mutate(
                        'batch',
                        () => command('images-stop', { tabId }),
                        ({ batch }) => dispatch({ type: 'batch', batch }),
                    );
                }),
            toggle: (id) => dispatch({ type: 'toggle', id }),
            selectAll: (selected) => dispatch({ type: 'selectAll', selected }),
            source: (source) => dispatch({ type: 'source', source }),
            find: (value) => dispatch({ type: 'find', value }),
            replacement: (value) => dispatch({ type: 'replacement', value }),
            override: (id, value) => dispatch({ type: 'override', id, value }),
            page: (page) => dispatch({ type: 'page', page }),
        }),
        [tabId, state, requests, run],
    );
    return (
        <StateProvider value={state}>
            <ActionsProvider value={actions}>{children}</ActionsProvider>
        </StateProvider>
    );
}
