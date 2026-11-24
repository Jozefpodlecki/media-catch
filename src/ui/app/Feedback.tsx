import { Icon, ToolButton } from '../components';
import { useTaskState, useTaskActions } from './TaskProvider';
import { useSource } from './SourceProvider';
import { useBlobState } from '../features/blobs/BlobProvider';
import { useMediaState } from '../features/media/MediaProvider';
import { useHistoryState } from '../features/history/HistoryProvider';
import { useSettingsStatus } from '../settings/SiteSettingsProvider';
import { useSiteSettingsActions } from '../settings/SiteSettingsProvider';
import { useApplicationState } from './ApplicationProvider';
export function Feedback() {
    const tasks = useTaskState();
    const actions = useTaskActions();
    const source = useSource();
    const settings = useSettingsStatus();
    const settingsActions = useSiteSettingsActions();
    const { view } = useApplicationState();
    const error = tasks.error || source.error;
    const notice = tasks.notice;
    const blobs = useBlobState();
    const media = useMediaState();
    const history = useHistoryState();
    const syncError = blobs.syncError || media.syncError || history.syncError;
    return (
        <>
            {' '}
            {error && (
                <div className="notice notice-error" role="alert">
                    <Icon name="info" />
                    <span>{error}</span>
                    <ToolButton
                        icon="x"
                        label="Dismiss error"
                        onClick={() => {
                            actions.dismissError();
                            source.dismissError();
                        }}
                    />
                </div>
            )}
            {notice && (
                <div className="notice" role="status">
                    <Icon name="check" />
                    <span>{notice}</span>
                    <ToolButton icon="x" label="Dismiss message" onClick={actions.dismissNotice} />
                </div>
            )}
            {syncError && (
                <div className="notice notice-error" role="status">
                    <Icon name="refresh" />
                    <span>Refresh failed: {syncError}</span>
                </div>
            )}
            {settings.error && view !== 'settings' && (
                <div className="notice notice-error" role="alert">
                    <Icon name="settings" />
                    <span>{settings.error}</span>
                    <ToolButton
                        icon="refresh"
                        label="Retry loading preferences"
                        onClick={settingsActions.retry}
                    />
                </div>
            )}
        </>
    );
}
