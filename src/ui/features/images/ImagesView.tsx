import { Icon, Info, Panel, SelectInput, TextInput, ToolButton } from '../../components';
import { useImagesState, useImagesActions } from './ImagesProvider';
import { imageDraftUrl, imageTarget } from '../../state/images';
import { useSource } from '../../app/SourceProvider';
import { useBusy } from '../../app/TaskProvider';
import { ImagePatterns } from './ImagePatterns';

export function ImagesView() {
    const state = useImagesState();
    const actions = useImagesActions();
    const { tab } = useSource();
    const busy = useBusy();
    const selected = state.images.filter((image) => state.selected.includes(image.id));
    const targets = selected.map((image) => {
        try {
            return imageTarget(state, image);
        } catch {
            return '';
        }
    });
    const invalid = targets.some((url) => !url);
    const count = new Set(targets.filter(Boolean)).size;
    return (
        <>
            <Panel
                title="Images"
                count={state.images.length}
                tools={
                    <>
                        <Info label="Image capture information">
                            <p>
                                Scan the whole current document in accessible frames, including
                                responsive/lazy sources, backgrounds, image links, and open shadow
                                roots. Enclosing links are preferred; they may contain a full-size
                                URL with a valid signature.
                            </p>
                            <p>
                                Literal replacement preserves other URL text. Changing a signed path
                                may invalidate its signature. Review the final URLs before
                                downloading.
                            </p>
                            <p>
                                Up to 500 HTTP(S) images. Duplicate final URLs download once.
                                Firefox saves original responses; a link to a webpage saves that
                                page.
                            </p>
                        </Info>
                        <ToolButton
                            icon="refresh"
                            label="Scan page images"
                            disabled={busy || !tab || state.batch?.running}
                            onClick={() => void actions.scan()}
                        />
                    </>
                }
            >
                <SelectInput
                    label="Image URL source"
                    icon="image"
                    value={state.source}
                    options={[
                        { value: 'link', label: 'Enclosing link, otherwise image' },
                        { value: 'src', label: 'Image source' },
                    ]}
                    onValueChange={(value) => actions.source(value === 'src' ? 'src' : 'link')}
                />
                <div className="image-transform">
                    <TextInput
                        label="Find in image URLs"
                        value={state.find}
                        onValueChange={actions.find}
                        placeholder="/thumb/"
                    />
                    <TextInput
                        label="Replace in image URLs"
                        value={state.replacement}
                        onValueChange={actions.replacement}
                        placeholder="/full/"
                    />
                </div>
                <p className="subtle">
                    Changing the source or replacement resets individual URL edits.
                </p>
                <div className="image-toolbar">
                    <ToolButton
                        icon="check"
                        label="Select all images"
                        disabled={!state.images.length}
                        onClick={() => actions.selectAll(true)}
                    />
                    <ToolButton
                        icon="minus"
                        label="Deselect all images"
                        disabled={!state.selected.length}
                        onClick={() => actions.selectAll(false)}
                    />
                    <span className="image-selection-count">{count} unique selected</span>
                    <ToolButton
                        icon="blob"
                        label="Download selected images"
                        tone="primary"
                        disabled={busy || !tab || !count || invalid || state.batch?.running}
                        onClick={() => void actions.download()}
                    />
                    {state.batch?.running && (
                        <ToolButton
                            icon="stop"
                            label="Stop queued image downloads"
                            onClick={() => void actions.stop()}
                        />
                    )}
                </div>
                {invalid && (
                    <p className="text-error" role="alert">
                        Fix or deselect invalid image URLs.
                    </p>
                )}
                {state.truncated && (
                    <p className="subtle">
                        Scan limit reached. Results may be incomplete; at most 500 image references
                        are retained.
                    </p>
                )}
                {state.error && (
                    <p className="text-error" role="alert">
                        {state.error}
                    </p>
                )}
                {state.batch && (
                    <div className="image-progress" role="status">
                        <p>
                            {state.batch.running
                                ? 'Queuing'
                                : state.batch.stopped
                                  ? 'Queue stopped'
                                  : 'Queue finished'}
                            : {state.batch.started} started, {state.batch.failed} failed,{' '}
                            {Math.max(
                                0,
                                state.batch.total - state.batch.started - state.batch.failed,
                            )}{' '}
                            remaining.
                        </p>
                        <p className="subtle">
                            History tracks native completion. Stop leaves downloads already started
                            in Firefox running.
                        </p>
                        {state.batch.error && <p className="text-error">{state.batch.error}</p>}
                    </div>
                )}
            </Panel>
            <ImagePatterns />
            {!state.images.length ? (
                <div className="empty-state">
                    <Icon name="image" />
                    <p>{state.scanned ? 'No HTTP(S) images found' : 'Scan this page for images'}</p>
                </div>
            ) : (
                <Panel
                    title="Download preview"
                    tools={
                        <>
                            <ToolButton
                                icon="minus"
                                label="Previous image page"
                                disabled={state.page === 0}
                                onClick={() => actions.page(state.page - 1)}
                            />
                            <span>
                                {state.page + 1} / {Math.ceil(state.images.length / 25)}
                            </span>
                            <ToolButton
                                icon="plus"
                                label="Next image page"
                                disabled={(state.page + 1) * 25 >= state.images.length}
                                onClick={() => actions.page(state.page + 1)}
                            />
                        </>
                    }
                >
                    <div className="image-list">
                        {state.images
                            .slice(state.page * 25, (state.page + 1) * 25)
                            .map((image, index) => {
                                const url = imageDraftUrl(state, image);
                                let error = '';
                                try {
                                    imageTarget(state, image);
                                } catch {
                                    error = 'Use an HTTP(S) URL without credentials.';
                                }
                                const number = state.page * 25 + index + 1;
                                return (
                                    <article className="image-item" key={image.id}>
                                        <label className="image-selection">
                                            <input
                                                type="checkbox"
                                                checked={state.selected.includes(image.id)}
                                                onChange={() => actions.toggle(image.id)}
                                            />
                                            <span>{image.alt || `Image ${number}`}</span>
                                        </label>
                                        <details className="image-source">
                                            <summary>Source URLs · Frame {image.frameId}</summary>
                                            <dl>
                                                <dt>Found in</dt>
                                                <dd>{image.kind || 'image'}</dd>
                                                <dt>Image src</dt>
                                                <dd>{image.src || 'Unavailable'}</dd>
                                                <dt>Rendered source</dt>
                                                <dd>{image.currentSrc || 'Unavailable'}</dd>
                                                <dt>Enclosing link</dt>
                                                <dd>{image.href || 'None'}</dd>
                                            </dl>
                                        </details>
                                        <TextInput
                                            label={`Download URL for image ${number}`}
                                            value={url}
                                            error={error}
                                            onValueChange={(value) =>
                                                actions.override(image.id, value)
                                            }
                                        />
                                    </article>
                                );
                            })}
                    </div>
                </Panel>
            )}
        </>
    );
}
