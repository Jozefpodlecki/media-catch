import { ImagesProvider } from '../features/images/ImagesProvider';
import type { ReactNode } from 'react';
import type { ApplicationState } from '../state/application';
import { ApplicationProvider } from './ApplicationProvider';
import { SourceProvider, useSource } from './SourceProvider';
import { TaskProvider } from './TaskProvider';
import { SiteSettingsProvider } from '../settings/SiteSettingsProvider';
import { BlobProvider } from '../features/blobs/BlobProvider';
import { MediaProvider } from '../features/media/MediaProvider';
import { HistoryProvider } from '../features/history/HistoryProvider';
import type { PageDescriptor } from './page';

function Workspace({ children }: { children: ReactNode }) {
    const source = useSource();
    return (
        <TaskProvider key={`${source.workspaceKey}:${source.loading}`}>
            <BlobProvider>
                <MediaProvider>
                    <ImagesProvider>
                        <HistoryProvider>{children}</HistoryProvider>
                    </ImagesProvider>
                </MediaProvider>
            </BlobProvider>
        </TaskProvider>
    );
}
export function Providers({
    initial,
    page,
    children,
}: {
    initial: ApplicationState;
    page: PageDescriptor;
    children: ReactNode;
}) {
    return (
        <ApplicationProvider initial={initial}>
            <SourceProvider page={page}>
                <SiteSettingsProvider>
                    <Workspace>{children}</Workspace>
                </SiteSettingsProvider>
            </SourceProvider>
        </ApplicationProvider>
    );
}
