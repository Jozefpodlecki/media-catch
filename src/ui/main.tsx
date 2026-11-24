import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { Providers } from './app/Providers';
import { describePage, initialViewForPage } from './app/page';
const page = describePage(document.body.dataset.page, location.search);
const view = initialViewForPage(page, location.hash);
const dark =
    document.documentElement.style.colorScheme === 'dark' ||
    (!document.documentElement.style.colorScheme &&
        matchMedia('(prefers-color-scheme: dark)').matches);
createRoot(document.getElementById('root')!).render(
    <Providers initial={{ view, dark }} page={page}>
        <App page={page} />
    </Providers>,
);
