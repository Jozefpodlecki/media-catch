import { ImagesView } from '../features/images/ImagesView';
import { useApplicationState } from './ApplicationProvider';
import { AppHeader } from './AppHeader';
import { Feedback } from './Feedback';
import { ConversionStatus } from '../features/media/ConversionStatus';
import { BlobsView } from '../features/blobs/BlobsView';
import { MediaView } from '../features/media/MediaView';
import { HistoryView } from '../features/history/HistoryView';
import { SettingsView } from '../settings/SettingsView';
import { useSource } from './SourceProvider';
import type { PageDescriptor } from './page';
export function App({ page }: { page: PageDescriptor }) {
    const fullHistory = page.mode === 'history';
    const dashboard = page.mode === 'dashboard';
    const source = useSource();
    const { view } = useApplicationState();
    return (
        <div
            className={
                fullHistory ? 'history-shell' : dashboard ? 'dashboard-shell' : 'popup-shell'
            }
        >
            <AppHeader fullHistory={fullHistory} dashboard={dashboard} />
            <main
                className="app-content"
                id={`view-${view}`}
                role={fullHistory ? undefined : 'tabpanel'}
                aria-labelledby={fullHistory ? undefined : `nav-${view}`}
            >
                <Feedback />
                <ConversionStatus />
                {dashboard &&
                    !source.tab &&
                    !source.loading &&
                    view !== 'settings' &&
                    view !== 'history' && (
                        <p className="source-hint">
                            Open the popup on your source webpage and choose Open dashboard to link
                            that tab.
                        </p>
                    )}
                {view === 'blobs' && <BlobsView />}
                {view === 'images' && <ImagesView />}
                {view === 'media' && <MediaView />}
                {view === 'history' && <HistoryView fullHistory={fullHistory} />}
                {view === 'settings' && <SettingsView />}
            </main>
        </div>
    );
}
