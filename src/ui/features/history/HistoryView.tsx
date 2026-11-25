import { Icon, ToolButton, SelectInput, Metric } from '../../components';
import { useHistoryState, useHistoryActions } from './HistoryProvider';
import { useBusy } from '../../app/TaskProvider';
import { active, size, modeLabels, StateMark } from '../../presentation';
export function HistoryView({ fullHistory }: { fullHistory: boolean }) {
    const { entries, filter } = useHistoryState();
    const actions = useHistoryActions();
    const busy = useBusy();
    const shown = entries.filter(
        (entry) =>
            filter === 'all' ||
            entry.state === filter ||
            (filter === 'failed' && ['failed', 'interrupted'].includes(entry.state)) ||
            (filter === 'active' && active(entry.state)),
    );
    return (
        <>
            <div className="history-toolbar">
                <div className="history-metrics">
                    <Metric icon="history" value={entries.length} label="attempts" />
                    <Metric
                        icon="check"
                        value={entries.filter((item) => item.state === 'complete').length}
                        label="completed"
                    />
                    <Metric
                        icon="x"
                        value={
                            entries.filter((item) => ['failed', 'interrupted'].includes(item.state))
                                .length
                        }
                        label="failed or interrupted"
                    />
                </div>
                {!fullHistory && (
                    <ToolButton
                        icon="expand"
                        label="Open full history"
                        onClick={() => void actions.open()}
                    />
                )}
            </div>
            <div className="history-filter">
                <SelectInput
                    label="Filter history"
                    icon="filter"
                    value={filter}
                    options={[
                        { value: 'all', label: 'All attempts' },
                        { value: 'failed', label: 'Failed / interrupted' },
                        { value: 'active', label: 'In progress' },
                        { value: 'complete', label: 'Completed' },
                        { value: 'canceled', label: 'Canceled' },
                        { value: 'skipped', label: 'Skipped' },
                    ]}
                    onValueChange={actions.selectFilter}
                />
                <ToolButton
                    icon="trash"
                    label="Clear session history"
                    disabled={busy || !entries.length}
                    onClick={() => void actions.clear()}
                />
            </div>
            {!shown.length ? (
                <div className="empty-state history-empty">
                    <Icon name="history" />
                    <p>{entries.length ? 'No matching attempts' : 'No activity yet'}</p>
                </div>
            ) : (
                <div className="history-list">
                    {shown.map((item) => (
                        <article className="history-item" key={item.id}>
                            <div className="history-item-heading">
                                <h2>{item.filename || 'Unnamed blob'}</h2>
                                <StateMark state={item.state} />
                                {item.state === 'complete' && item.downloadId !== undefined && (
                                    <ToolButton
                                        icon="folder"
                                        label="Show downloaded file in folder"
                                        onClick={() => void actions.reveal(item.downloadId!)}
                                    />
                                )}
                            </div>
                            <p className="history-meta">
                                <time dateTime={item.startedAt}>
                                    {new Date(item.startedAt).toLocaleString()}
                                </time>
                                <span>{size(item.size)}</span>
                                <span>{modeLabels[item.mode] || item.mode}</span>
                                {item.rule && <span>Rule: {item.rule}</span>}
                            </p>
                            {item.message && item.state !== 'complete' && (
                                <p
                                    className={`history-message ${['failed', 'interrupted'].includes(item.state) ? 'text-error' : ''}`}
                                >
                                    {item.message}
                                </p>
                            )}
                            <details className="source-details">
                                <summary aria-label="Source details" title="Source details">
                                    <Icon name="link" />
                                    <Icon name="chevron" />
                                </summary>
                                <dl>
                                    <div>
                                        <dt>Page</dt>
                                        <dd>{item.sourcePage || 'Unavailable'}</dd>
                                    </div>
                                    <div>
                                        <dt>URL</dt>
                                        <dd>{item.url || 'Unavailable'}</dd>
                                    </div>
                                    <div>
                                        <dt>Location</dt>
                                        <dd>
                                            Tab {item.tabId} · Frame {item.frameId}
                                            {item.downloadId === undefined
                                                ? ''
                                                : ` · Download ${item.downloadId}`}
                                        </dd>
                                    </div>
                                </dl>
                            </details>
                        </article>
                    ))}
                </div>
            )}
        </>
    );
}
