import { ToolButton, Info } from '../components';
import { useApplicationState, useApplicationActions } from './ApplicationProvider';
import { useSource } from './SourceProvider';
import { urlLabel } from '../presentation';
import { useDashboardActions } from './useDashboardActions';
export function AppHeader({
    fullHistory,
    dashboard = false,
}: {
    fullHistory: boolean;
    dashboard?: boolean;
}) {
    const { view: pane, dark } = useApplicationState();
    const application = useApplicationActions();
    const { tab, loading, unavailable } = useSource();
    const openDashboard = useDashboardActions();
    const views = ['blobs', 'images', 'media', 'rules', 'history', 'settings'] as const;
    return (
        <>
            <header className="app-header">
                <img src="icons/blob-download.svg" className="brand-icon" alt="Media Catch" />
                <div className="header-context">
                    <h1>{fullHistory ? 'History' : 'Media Catch'}</h1>
                    {!fullHistory && (
                        <span title={tab?.url}>
                            {tab
                                ? urlLabel(tab.url) || 'Current tab'
                                : unavailable
                                  ? 'Open a website to capture media'
                                  : dashboard
                                    ? 'Website preferences & downloads'
                                    : loading
                                      ? 'Connecting…'
                                      : 'No source website'}
                        </span>
                    )}
                </div>
                <Info label="Session information">
                    <strong>Local settings · Session history</strong>
                    <p>
                        History keeps the last 100 attempts in memory. Reloading the extension
                        clears it. Media conversion runs locally.
                    </p>
                    <p>
                        Website preferences are saved in this browser profile, including changes
                        made in private windows. Only sites you configure are saved. Monitoring
                        always starts manually.
                    </p>
                </Info>
                {!dashboard && (
                    <ToolButton
                        icon="expand"
                        label="Open dashboard"
                        onClick={() => void openDashboard()}
                    />
                )}
                <ToolButton
                    icon={dark ? 'sun' : 'moon'}
                    label={dark ? 'Use light theme' : 'Use dark theme'}
                    onClick={application.toggleTheme}
                />
            </header>
            {!fullHistory && (
                <nav className="view-tabs" role="tablist" aria-label="Capture views">
                    {views.map((value, index) => (
                        <ToolButton
                            key={value}
                            id={`nav-${value}`}
                            role="tab"
                            aria-selected={pane === value}
                            aria-controls={`view-${value}`}
                            tabIndex={pane === value ? 0 : -1}
                            icon={value === 'blobs' ? 'blob' : value === 'images' ? 'image' : value}
                            label={
                                value === 'blobs'
                                    ? 'Blobs'
                                    : value === 'images'
                                      ? 'Images'
                                      : value === 'media'
                                        ? 'Media & HLS'
                                        : value === 'rules'
                                          ? 'Site rules'
                                          : value === 'history'
                                            ? 'History'
                                            : 'Website settings'
                            }
                            pressed={pane === value}
                            onClick={() => application.selectView(value)}
                            onKeyDown={(event) => {
                                if (
                                    ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)
                                ) {
                                    event.preventDefault();
                                    const next =
                                        event.key === 'Home'
                                            ? 0
                                            : event.key === 'End'
                                              ? views.length - 1
                                              : (index +
                                                    (event.key === 'ArrowRight'
                                                        ? 1
                                                        : views.length - 1)) %
                                                views.length;
                                    application.selectView(views[next]);
                                    document.getElementById(`nav-${views[next]}`)?.focus();
                                }
                            }}
                        />
                    ))}
                </nav>
            )}
        </>
    );
}
