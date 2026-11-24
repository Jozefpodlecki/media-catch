import { useCallback } from 'react';
import { useApplicationState } from './ApplicationProvider';
import { useSource } from './SourceProvider';
import { useTaskActions } from './TaskProvider';
export function useDashboardActions() {
    const { tab } = useSource();
    const { view } = useApplicationState();
    const { run } = useTaskActions();
    return useCallback(
        () =>
            run(async () => {
                const url = new URL(browser.runtime.getURL('index.html'));
                if (tab) url.searchParams.set('source', String(tab.id));
                url.hash = tab ? view : 'settings';
                await browser.tabs.create({ url: url.href });
            }),
        [tab, view, run],
    );
}
