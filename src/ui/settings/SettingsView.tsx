import { useMemo, useState } from 'react';
import { Icon, Info, Metric, NumberInput, Panel, SelectInput, ToolButton } from '../components';
import { PatternInput } from './PatternInput';
import { useSettingsStatus, useSiteSettingsActions } from './SiteSettingsProvider';
import { settingsForSite } from '../../shared/settings';
import { useSource } from '../app/SourceProvider';

export function SettingsView() {
    const { siteKey } = useSource();
    const { document, loaded, saving, error } = useSettingsStatus();
    const actions = useSiteSettingsActions();
    const [selected, selectSite] = useState(siteKey || '');
    const origins = Object.keys(document.sites).sort();
    const options = useMemo(
        () =>
            [...new Set([...(siteKey ? [siteKey] : []), ...origins])].map((origin) => ({
                value: origin,
                label: origin,
                detail: origin === siteKey ? 'Source website' : 'Saved preferences',
            })),
        [siteKey, origins.join('\n')],
    );
    const target = options.some((option) => option.value === selected)
        ? selected
        : options[0]?.value || '';
    const effective = settingsForSite(document, target || null);
    const overrides = target ? document.sites[target] : undefined;
    return (
        <div className="settings-grid">
            <Panel
                title="Defaults"
                tools={
                    <Info label="Preference storage">
                        <p>
                            Preferences stay in this browser profile using local extension storage.
                            Private and regular windows share them. Only configured origins are
                            saved; paths and page history are excluded.
                        </p>
                        <p>Preferences never enable capture or monitoring automatically.</p>
                    </Info>
                }
            >
                <div className="settings-field">
                    <span>Capture larger than</span>
                    <NumberInput
                        label="Default capture threshold"
                        value={document.defaults.captureMinimumMiB}
                        onValueChange={(value) =>
                            actions.updateDefaults({ captureMinimumMiB: value })
                        }
                        disabled={!loaded}
                    />
                </div>
                <div className="settings-field">
                    <span>Request URL contains</span>
                    <PatternInput
                        label="Default request filter"
                        value={document.defaults.requestPattern}
                        onCommit={(requestPattern) => actions.updateDefaults({ requestPattern })}
                        disabled={!loaded}
                    />
                </div>
                <p className="subtle">Applies where a website has no override.</p>
            </Panel>
            <div id="site-settings-editor">
                <Panel
                    title="Website"
                    tools={
                        <ToolButton
                            icon="refresh"
                            label="Reset selected website to defaults"
                            disabled={!loaded || !overrides}
                            onClick={() => actions.forgetSite(target)}
                        />
                    }
                >
                    {!target ? (
                        <div className="empty-state">
                            <Icon name="settings" />
                            <p>No website selected</p>
                            <span>Open the popup on a webpage, then open the dashboard.</span>
                        </div>
                    ) : (
                        <>
                            <SelectInput
                                label="Website to configure"
                                icon="link"
                                value={target}
                                options={options}
                                onValueChange={selectSite}
                                disabled={!loaded}
                            />
                            <div className="settings-field">
                                <span>Capture larger than</span>
                                <NumberInput
                                    key={target}
                                    label="Website capture threshold"
                                    value={effective.captureMinimumMiB}
                                    onValueChange={(captureMinimumMiB) =>
                                        actions.updateSite(target, { captureMinimumMiB })
                                    }
                                    disabled={!loaded}
                                />
                            </div>
                            <div className="settings-field">
                                <span>Request URL contains</span>
                                <PatternInput
                                    key={target}
                                    label="Website request filter"
                                    value={effective.requestPattern}
                                    onCommit={(requestPattern) =>
                                        actions.updateSite(target, { requestPattern })
                                    }
                                    disabled={!loaded}
                                />
                            </div>
                            <p className="subtle">
                                {overrides
                                    ? 'Customized fields override defaults.'
                                    : 'Using defaults. Editing creates an override.'}
                            </p>
                        </>
                    )}
                </Panel>
            </div>
            <Panel
                title="Saved websites"
                count={origins.length}
                tools={
                    <ToolButton
                        icon="trash"
                        tone="danger"
                        label="Forget all website preferences"
                        disabled={!loaded || !origins.length}
                        onClick={actions.forgetAll}
                    />
                }
            >
                {!origins.length ? (
                    <p className="empty-note">No website overrides saved.</p>
                ) : (
                    <div className="saved-sites">
                        {origins.map((origin) => (
                            <article className="saved-site" key={origin}>
                                <div className="saved-site-copy">
                                    <strong>{origin}</strong>
                                    <span>
                                        {Object.hasOwn(document.sites[origin], 'captureMinimumMiB')
                                            ? `> ${document.sites[origin].captureMinimumMiB} MiB`
                                            : 'Default threshold'}{' '}
                                        ·{' '}
                                        {document.sites[origin].requestPattern ||
                                            'Default request filter'}
                                    </span>
                                </div>
                                <ToolButton
                                    icon="arrow"
                                    label={`Edit ${origin}`}
                                    onClick={() => {
                                        selectSite(origin);
                                        window.document
                                            .getElementById('site-settings-editor')
                                            ?.scrollIntoView({ block: 'nearest' });
                                    }}
                                />
                                <ToolButton
                                    icon="trash"
                                    label={`Forget ${origin}`}
                                    onClick={() => actions.forgetSite(origin)}
                                />
                            </article>
                        ))}
                    </div>
                )}
            </Panel>
            <div className="settings-status" role="status">
                <Metric
                    icon={error ? 'x' : saving ? 'pulse' : 'check'}
                    value={origins.length}
                    label="saved websites"
                />
                <span>
                    {error ||
                        (!loaded
                            ? 'Loading preferences…'
                            : saving
                              ? 'Saving…'
                              : 'Saved locally · Commit fields with blur or Enter.')}
                </span>
                {error && (
                    <ToolButton
                        icon="refresh"
                        label="Retry loading preferences"
                        onClick={actions.retry}
                    />
                )}
            </div>
        </div>
    );
}
