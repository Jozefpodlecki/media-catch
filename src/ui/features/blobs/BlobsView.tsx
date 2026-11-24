import {
    Icon,
    ToolButton,
    Info,
    Panel,
    TextInput,
    NumberInput,
    SelectInput,
    Metric,
} from '../../components';
import { useBlobState, useBlobActions } from './BlobProvider';
import { useMediaActions } from '../media/MediaProvider';
import { useSource } from '../../app/SourceProvider';
import { useBusy } from '../../app/TaskProvider';
import {
    useSiteSettings,
    useSiteSettingsActions,
    useSettingsStatus,
} from '../../settings/SiteSettingsProvider';
import { urlLabel } from '../../presentation';
export function BlobsView() {
    const { frames, selection, watch, probe } = useBlobState();
    const { url: blobUrl, frameId, filename } = selection;
    const actions = useBlobActions();
    const mediaActions = useMediaActions();
    const { tab } = useSource();
    const busy = useBusy();
    const settings = useSiteSettings();
    const settingsStatus = useSettingsStatus();
    const settingsActions = useSiteSettingsActions();
    const minimum = watch.enabled ? watch.minimumMiB : settings.captureMinimumMiB;
    const totals = watch.diagnostics.reduce(
        (sum, item) => ({
            calls: sum.calls + (item.counters.calls || 0),
            streams: sum.streams + (item.counters.streams || 0),
        }),
        { calls: 0, streams: 0 },
    );
    return (
        <>
            <Panel
                title="Capture"
                tools={
                    <>
                        <Info label="Capture limits">
                            <p>
                                New file blobs only: above your threshold, up to 64 MiB. Ten
                                captures per session. Watching stops on reload.
                            </p>
                            <p>
                                MediaSource streams, workers, cached functions and earlier calls are
                                not captured.
                            </p>
                        </Info>
                        <ToolButton
                            icon={watch.enabled ? 'stop' : 'play'}
                            label={watch.enabled ? 'Stop blob capture' : 'Start blob capture'}
                            tone={watch.enabled ? 'ghost' : 'primary'}
                            pressed={watch.enabled}
                            disabled={busy || !tab || (!watch.enabled && !settingsStatus.loaded)}
                            onClick={() => void actions.toggleCapture()}
                        />
                    </>
                }
            >
                <div className="capture-row">
                    <NumberInput
                        label="Capture blobs larger than this size"
                        value={minimum}
                        onValueChange={settingsActions.setMinimum}
                        disabled={watch.enabled || busy || !settingsStatus.loaded}
                    />
                    <div className="metrics">
                        <Metric icon="radio" value={totals.calls} label="calls observed" />
                        <Metric icon="media" value={totals.streams} label="streams skipped" />
                        <Metric icon="blob" value={watch.count} label="downloads started" />
                    </div>
                </div>
                <details className="diagnostics">
                    <summary>
                        <Icon name="pulse" />
                        <span>Diagnostics</span>
                        <Icon name="chevron" />
                    </summary>
                    <div className="diagnostics-body">
                        <div className="diagnostic-heading">
                            <span>
                                {watch.diagnostics.filter((item) => item.attached).length}/
                                {watch.diagnostics.length} hooks active
                            </span>
                            <ToolButton
                                icon="search"
                                label="Test the hook without downloading"
                                disabled={busy || !watch.enabled}
                                onClick={() => void actions.testHook()}
                            />
                        </div>
                        {watch.diagnosticError && (
                            <p className="field-error">{watch.diagnosticError}</p>
                        )}
                        {watch.diagnostics.map((item) => (
                            <dl className="diagnostic-grid" key={item.frameId}>
                                <div className="diagnostic-frame">
                                    Frame {item.frameId}{' '}
                                    <span className={item.attached ? 'text-success' : 'text-error'}>
                                        {item.attached ? 'active' : 'missing/replaced'}
                                    </span>
                                </div>
                                {[
                                    ['Calls', item.counters.calls],
                                    ['Streams', item.counters.streams],
                                    ['Read', item.counters.captured],
                                    ['Replies', item.counters.acknowledged],
                                    ['Rejected', item.counters.rejected],
                                    ['Timeouts', item.counters.bridgeTimeouts],
                                    ['Small', item.counters.belowThreshold],
                                    ['Large', item.counters.overLimit],
                                    ['Duplicate', item.counters.duplicates],
                                    ['Busy', item.counters.busy],
                                ].map(([label, value]) => (
                                    <div key={label}>
                                        <dt>{label}</dt>
                                        <dd>{value}</dd>
                                    </div>
                                ))}
                            </dl>
                        ))}
                        {!watch.enabled && (
                            <p className="subtle">Enable capture to inspect the current page.</p>
                        )}
                        {probe && (
                            <p className="subtle" role="status">
                                {probe}
                            </p>
                        )}
                    </div>
                </details>
            </Panel>
            <Panel
                title="Files"
                count={frames.reduce((sum, frame) => sum + frame.blobs.length, 0)}
                tools={
                    <ToolButton
                        icon="refresh"
                        label="Rescan for blob URLs"
                        disabled={busy || !tab}
                        onClick={() => void actions.scan()}
                    />
                }
            >
                {frames.reduce((sum, frame) => sum + frame.blobs.length, 0) > 1 && (
                    <SelectInput
                        label="Detected blob"
                        icon="media"
                        value={
                            frames
                                .flatMap((frame) =>
                                    frame.blobs.map((blob, index) => ({
                                        value: `${frame.frameId}:${index}`,
                                        url: blob.url,
                                    })),
                                )
                                .find((item) => item.url === blobUrl)?.value || ''
                        }
                        options={frames.flatMap((frame) =>
                            frame.blobs.map((blob, index) => ({
                                value: `${frame.frameId}:${index}`,
                                label: blob.filename || blob.url,
                                detail: `${blob.source} · ${frame.frameId === 0 ? 'Main page' : `Frame ${frame.frameId}`}`,
                            })),
                        )}
                        placeholder="Detected blobs"
                        onValueChange={actions.selectDetected}
                        disabled={busy}
                    />
                )}
                <TextInput
                    label="Blob URL"
                    icon="link"
                    value={blobUrl}
                    onValueChange={actions.editUrl}
                    placeholder="Paste a blob URL"
                    spellCheck={false}
                    actions={
                        <>
                            <ToolButton
                                icon="blob"
                                label="Download original file"
                                tone="primary"
                                disabled={busy || !blobUrl || !tab}
                                onClick={() => void actions.download()}
                            />
                            <ToolButton
                                icon="convert"
                                label="Remux file blob to MP4"
                                disabled={busy || !blobUrl || !tab}
                                onClick={() => void mediaActions.remuxBlob(selection)}
                            >
                                <span className="format-tag">MP4</span>
                            </ToolButton>
                        </>
                    }
                />
                <TextInput
                    label="Filename"
                    icon="file"
                    value={filename}
                    onValueChange={actions.editFilename}
                    placeholder="Automatic filename"
                    clearable
                />
                {frames.length > 1 && (
                    <SelectInput
                        label="Source frame"
                        icon="frame"
                        value={String(frameId)}
                        options={frames.map((frame) => ({
                            value: String(frame.frameId),
                            label: frame.frameId === 0 ? 'Main page' : `Frame ${frame.frameId}`,
                            detail: urlLabel(frame.page),
                        }))}
                        onValueChange={(value) => actions.selectFrame(Number(value))}
                    />
                )}
                {!frames.some((frame) => frame.blobs.length) && (
                    <p className="empty-note">No blobs detected. Play the media or paste a URL.</p>
                )}
                <div className="panel-foot">
                    <span className="subtle">64 MiB max</span>
                    <Info label="File and stream blobs">
                        <p>
                            A MediaSource blob is a player handle, not a complete file. Use its
                            playlist in Media & HLS. Remuxing needs readable media with compatible
                            codecs.
                        </p>
                    </Info>
                </div>
            </Panel>
        </>
    );
}
