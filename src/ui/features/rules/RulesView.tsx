import { Info, Panel, SelectInput, TextInput, ToolButton } from '../../components';
import { useSource } from '../../app/SourceProvider';
import { useBusy } from '../../app/TaskProvider';
import { useRulesActions, useRulesState } from './RulesProvider';
import { validateRule, type SiteRule } from '../../../shared/rules';

export function RulesView() {
    const { siteKey } = useSource();
    const { draft, document, loaded, error, runtime } = useRulesState();
    const actions = useRulesActions();
    const busy = useBusy();
    const rules = siteKey ? document.sites[siteKey] || [] : [];
    let validation = '';
    try {
        validateRule({ ...draft, id: draft.id || 'new' });
    } catch (error) {
        validation = error instanceof Error ? error.message : 'Invalid rule.';
    }
    return (
        <>
            <Panel
                title="Site rules"
                count={rules.length}
                tools={
                    <Info label="Rule execution information">
                        <p>
                            Rules are saved for this exact website origin. Preview logs matches
                            without downloads. Arm runs the saved enabled rules on this tab.
                        </p>
                        <p>
                            Navigation, permission removal, or saving changes to active rules
                            disarms the tab. Disarm stops queued actions; already started downloads
                            and conversions continue.
                        </p>
                        <p>
                            Matches use URL hosts and paths, excluding query strings and fragments.
                            Wildcards use * and match the whole URL. Auto routes HLS to local MP4
                            conversion and other media to download. MediaSource blobs need their
                            playlist.
                        </p>
                        <p>
                            Arm before starting playback or changing sources. Limits: 10 rules per
                            site, 10 matches per arming, two pending actions. Duplicate rule/URL
                            matches run once.
                        </p>
                    </Info>
                }
            >
                <p className="mb-3 break-all text-xs text-[var(--muted)]">
                    {siteKey || 'Open the popup from a source website to configure rules.'}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                    <span className="mr-auto text-xs" role="status">
                        {runtime.armed
                            ? runtime.preview
                                ? 'Preview active'
                                : 'Rules armed'
                            : 'Disarmed'}{' '}
                        · {runtime.actions} matches · {runtime.pending} pending
                    </span>
                    {runtime.armed ? (
                        <ToolButton
                            icon="stop"
                            label="Disarm site rules"
                            tone="danger"
                            disabled={busy}
                            onClick={() => void actions.disarm()}
                        />
                    ) : (
                        <>
                            <ToolButton
                                icon="eye"
                                label="Preview site rules without downloading"
                                disabled={
                                    busy ||
                                    !loaded ||
                                    !siteKey ||
                                    !rules.some((rule) => rule.enabled)
                                }
                                onClick={() => void actions.arm(true)}
                            />
                            <ToolButton
                                icon="play"
                                label="Arm site rules and run actions"
                                tone="primary"
                                disabled={
                                    busy ||
                                    !loaded ||
                                    !siteKey ||
                                    !rules.some((rule) => rule.enabled)
                                }
                                onClick={() => void actions.arm(false)}
                            />
                        </>
                    )}
                </div>
                {error && (
                    <div className="mt-2 flex items-center gap-2" role="alert">
                        <p className="min-w-0 flex-1 break-words text-xs text-[var(--error)]">
                            {error}
                        </p>
                        <ToolButton
                            icon="refresh"
                            label="Retry loading rules"
                            onClick={() => void actions.retry()}
                        />
                    </div>
                )}
                <div className="mt-3 grid gap-2">
                    {rules.map((rule) => (
                        <article
                            key={rule.id}
                            className="flex items-center gap-2 border-t border-[var(--line)] pt-2"
                        >
                            <label className="flex min-w-0 flex-1 items-start gap-2 text-xs">
                                <input
                                    type="checkbox"
                                    aria-label={`Enable rule ${rule.name}`}
                                    checked={rule.enabled}
                                    disabled={busy}
                                    onChange={() => void actions.toggleRule(rule.id)}
                                />
                                <span className="min-w-0 break-words">
                                    <strong>{rule.name}</strong>
                                    <span className="block break-all text-[var(--muted)]">
                                        {rule.trigger} · {rule.pattern} → {rule.action}
                                    </span>
                                </span>
                            </label>
                            <ToolButton
                                icon="settings"
                                label={`Edit rule ${rule.name}`}
                                disabled={busy}
                                onClick={() => actions.editRule(rule.id)}
                            />
                            <ToolButton
                                icon="trash"
                                label={`Delete rule ${rule.name}`}
                                disabled={busy}
                                onClick={() => void actions.deleteRule(rule.id)}
                            />
                        </article>
                    ))}
                </div>
            </Panel>
            <Panel
                title={draft.id ? 'Edit rule' : 'New rule'}
                tools={
                    <>
                        <ToolButton
                            icon="plus"
                            label="New site rule"
                            disabled={busy}
                            onClick={actions.newRule}
                        />
                        <ToolButton
                            icon="check"
                            label="Save site rule"
                            tone="primary"
                            disabled={busy || !loaded || !siteKey || !!validation}
                            onClick={() => void actions.saveRule()}
                        />
                    </>
                }
            >
                <div className="grid gap-3">
                    <TextInput
                        label="Rule name"
                        value={draft.name}
                        placeholder="Rule name"
                        maxLength={80}
                        onValueChange={(name) => actions.changeDraft({ name })}
                    />
                    <SelectInput
                        label="Rule trigger"
                        icon="pulse"
                        value={draft.trigger}
                        options={[
                            { value: 'dom', label: 'Video / source DOM update' },
                            { value: 'network', label: 'Network request completed' },
                        ]}
                        onValueChange={(trigger) =>
                            actions.changeDraft({ trigger: trigger as SiteRule['trigger'] })
                        }
                    />
                    <SelectInput
                        label="Rule URL matcher"
                        icon="filter"
                        value={draft.match}
                        options={[
                            { value: 'contains', label: 'URL contains' },
                            { value: 'wildcard', label: 'URL wildcard (*)' },
                        ]}
                        onValueChange={(match) =>
                            actions.changeDraft({ match: match as SiteRule['match'] })
                        }
                    />
                    <TextInput
                        label="Rule URL pattern"
                        value={draft.pattern}
                        placeholder=".m3u8"
                        maxLength={256}
                        onValueChange={(pattern) => actions.changeDraft({ pattern })}
                    />
                    <SelectInput
                        label="Rule action"
                        icon="arrow"
                        value={draft.action}
                        options={[
                            { value: 'auto', label: 'Auto: HLS → MP4, otherwise download' },
                            { value: 'record', label: 'Record match only' },
                            { value: 'download', label: 'Download original media' },
                            { value: 'hls', label: 'Convert HLS to MP4' },
                        ]}
                        onValueChange={(action) =>
                            actions.changeDraft({ action: action as SiteRule['action'] })
                        }
                    />
                    <label className="flex items-center gap-2 text-xs">
                        <input
                            type="checkbox"
                            checked={draft.enabled}
                            onChange={(event) =>
                                actions.changeDraft({ enabled: event.target.checked })
                            }
                        />
                        Rule enabled when tab is armed
                    </label>
                    {validation && draft.name && (
                        <p className="break-words text-xs text-[var(--error)]">{validation}</p>
                    )}
                </div>
            </Panel>
            <Panel title="Rule activity" count={runtime.log.length}>
                {!runtime.log.length ? (
                    <p className="py-3 text-center text-xs text-[var(--muted)]">
                        No matches yet. Arm or preview before playing media.
                    </p>
                ) : (
                    <div className="grid gap-3">
                        {runtime.log.map((entry) => (
                            <article
                                key={entry.id}
                                className="min-w-0 border-t border-[var(--line)] pt-2 text-xs"
                            >
                                <p>
                                    <strong>{entry.rule}</strong> · {entry.state}
                                </p>
                                <p className="break-words">{entry.message}</p>
                                <p className="break-all text-[var(--muted)]">{entry.url}</p>
                            </article>
                        ))}
                    </div>
                )}
            </Panel>
        </>
    );
}
