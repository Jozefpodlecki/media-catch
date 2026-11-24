import { Icon, ToolButton, Info, Panel, TextInput, SelectInput } from '../../components';
import { useMediaState, useMediaActions } from './MediaProvider';
import { useBlobActions } from '../blobs/BlobProvider';
import { useSource } from '../../app/SourceProvider';
import { useApplicationActions } from '../../app/ApplicationProvider';
import { useBusy } from '../../app/TaskProvider';
import {
    useSiteSettings,
    useSiteSettingsActions,
    useSettingsStatus,
} from '../../settings/SiteSettingsProvider';
import { PatternInput } from '../../settings/PatternInput';
import { urlLabel } from '../../presentation';
export function MediaView() {
    const { snapshot: media, form } = useMediaState();
    const { playlist, filename: mp4Name, variants, variant } = form;
    const actions = useMediaActions();
    const blobActions = useBlobActions();
    const application = useApplicationActions();
    const { tab } = useSource();
    const busy = useBusy();
    const settings = useSiteSettings();
    const settingsStatus = useSettingsStatus();
    const settingsActions = useSiteSettingsActions();
    const pattern = media.network ? media.pattern : settings.requestPattern;
    return (
        <>
            <Panel
                title="Requests"
                count={media.records.filter((item) => item.source === 'network').length}
                tools={
                    <>
                        <Info label="Network detection">
                            <p>
                                Enabling asks Firefox for optional website access, including CDNs.
                                Only this tab is monitored. Enable, then reload or play.
                            </p>
                            <p>
                                The filter matches a URL substring. Detection does not modify
                                requests.
                            </p>
                        </Info>
                        <ToolButton
                            icon="radio"
                            label={
                                media.network
                                    ? 'Stop network detection'
                                    : 'Enable network detection'
                            }
                            pressed={media.network}
                            tone={media.network ? 'ghost' : 'primary'}
                            disabled={busy || !tab || (!media.network && !settingsStatus.loaded)}
                            onClick={() => void actions.toggleNetwork()}
                        />
                    </>
                }
            >
                <PatternInput
                    label="Request URL contains"
                    value={pattern}
                    onCommit={settingsActions.setPattern}
                    disabled={media.network || !settingsStatus.loaded}
                />
                <div className="observer-row">
                    <Icon name="media" />
                    <span>Video / source</span>
                    {media.elements && <span className="count">{media.observations.length}</span>}
                    <span className="row-spacer" />
                    <Info label="Element observation">
                        <p>
                            Observe inserted video/source elements, src/type changes and media load
                            events in accessible frames. Stops on reload.
                        </p>
                    </Info>
                    <ToolButton
                        icon={media.elements ? 'stop' : 'eye'}
                        label={
                            media.elements
                                ? 'Stop observing media elements'
                                : 'Observe video and source elements'
                        }
                        pressed={media.elements}
                        disabled={busy || !tab}
                        onClick={() => void actions.toggleElements()}
                    />
                </div>
                {!!media.observations.length && (
                    <details className="diagnostics">
                        <summary>
                            <Icon name="pulse" />
                            <span>Element changes</span>
                            <Icon name="chevron" />
                        </summary>
                        <div className="diagnostics-body">
                            {media.observations.slice(0, 8).map((item, index) => (
                                <p className="diagnostic-log" key={index}>
                                    &lt;{item.tag}&gt; · {item.reason}
                                    <span>{item.currentSrc || item.url}</span>
                                </p>
                            ))}
                        </div>
                    </details>
                )}
            </Panel>
            <Panel
                title="Media"
                count={media.records.length}
                tools={
                    <ToolButton
                        icon="trash"
                        label="Clear detected media"
                        disabled={busy || !media.records.length}
                        onClick={() => void actions.clearDetected()}
                    />
                }
            >
                {!media.records.length ? (
                    <div className="empty-state">
                        <Icon name="media" />
                        <p>No media detected</p>
                        <span>Enable requests or observe the player.</span>
                    </div>
                ) : (
                    <div className="resource-list">
                        {media.records.map((item) => (
                            <article className="media-item" key={item.id}>
                                <div className="media-type">
                                    <Icon name={item.url.startsWith('blob:') ? 'file' : 'media'} />
                                </div>
                                <div className="media-copy">
                                    <div className="media-meta">
                                        <span className="format-pill">
                                            {item.kind === 'HLS'
                                                ? 'HLS'
                                                : item.url.startsWith('blob:')
                                                  ? 'BLOB'
                                                  : 'MEDIA'}
                                        </span>
                                        <span>
                                            {item.source === 'network'
                                                ? item.status
                                                : 'Element updated'}
                                        </span>
                                    </div>
                                    <p title={item.url}>{urlLabel(item.url)}</p>
                                </div>
                                <ToolButton
                                    icon="arrow"
                                    label={
                                        item.url.startsWith('blob:')
                                            ? 'Use this blob URL'
                                            : 'Use this playlist URL'
                                    }
                                    onClick={() => {
                                        if (item.url.startsWith('blob:')) {
                                            blobActions.useSelection({
                                                url: item.url,
                                                frameId: item.frameId,
                                                filename: '',
                                            });
                                            application.selectView('blobs');
                                        } else {
                                            actions.editPlaylist(item.url);
                                            document
                                                .getElementById('convert-panel')
                                                ?.scrollIntoView({ block: 'nearest' });
                                        }
                                    }}
                                />
                            </article>
                        ))}
                    </div>
                )}
            </Panel>
            <div id="convert-panel">
                <Panel
                    title="Convert"
                    tools={
                        <>
                            <Info label="Conversion support">
                                <p>
                                    Finished, unencrypted HLS and compatible codecs only. No
                                    re-encoding. Up to 64 MiB input/output and 500 assets.
                                </p>
                                <p>
                                    Encrypted/DRM streams and live playlists are unsupported. Your
                                    source page must stay open.
                                </p>
                            </Info>
                        </>
                    }
                >
                    <TextInput
                        label="HLS playlist URL"
                        value={playlist}
                        onValueChange={actions.editPlaylist}
                        placeholder="Playlist URL"
                        spellCheck={false}
                        actions={
                            <ToolButton
                                icon="search"
                                label="Inspect playlist quality options"
                                disabled={busy || !playlist}
                                onClick={() => void actions.inspectPlaylist()}
                            />
                        }
                    />
                    {!!variants.length && (
                        <SelectInput
                            label="Video quality"
                            icon="media"
                            value={String(variant)}
                            options={variants.map((item, index) => ({
                                value: String(index),
                                label: item.label,
                            }))}
                            onValueChange={(value) => actions.selectVariant(Number(value))}
                        />
                    )}
                    <div className="convert-row">
                        <TextInput
                            label="MP4 filename"
                            icon="file"
                            value={mp4Name}
                            onValueChange={actions.editFilename}
                            placeholder="media"
                            suffix=".mp4"
                        />
                        <ToolButton
                            icon="convert"
                            label="Create MP4"
                            tone="primary"
                            disabled={busy || !playlist || !tab || media.job?.running}
                            onClick={() => void actions.convert()}
                        />
                    </div>
                    <p className="subtle convert-limits">VOD · Unencrypted · ≤64 MiB</p>
                </Panel>
            </div>
        </>
    );
}
