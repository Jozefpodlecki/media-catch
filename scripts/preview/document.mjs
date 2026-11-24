import fs from 'node:fs/promises';
import { runtimePath } from '../lib/project.mjs';
export async function renderPreviewDocument(url) {
    const page = url.pathname.includes('index')
        ? 'index'
        : url.pathname.includes('history')
          ? 'history'
          : 'popup';
    const theme = url.searchParams.get('theme') === 'dark' ? 'dark' : 'light';
    const requested = url.searchParams.get('state');
    const state = ['empty', 'error', 'watching', 'loading', 'long'].includes(requested)
        ? requested
        : 'found';
    const html = (await fs.readFile(runtimePath(`${page}.html`), 'utf8'))
        .replace(
            '<html lang="en">',
            `<html lang="en" style="color-scheme:${theme}" data-preview-state="${state}">`,
        )
        .replace('<head>', '<head><base href="/assets/">')
        .replace('</head>', '<style>body[data-page="popup"]{width:min(400px,100%)}</style></head>')
        .replace(
            '<script src="ui.js">',
            '<script src="/examples/react-preview.js"></script><script src="ui.js">',
        );
    return html;
}
