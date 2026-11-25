import http from 'node:http';
import fs from 'node:fs/promises';
import { projectPath } from '../lib/project.mjs';
import { assets } from './assets.mjs';
import { renderPreviewDocument } from './document.mjs';
import { fixturePng } from '../testing/site-fixtures.mjs';
const headers = (type) => ({
    'Content-Type': type + '; charset=utf-8',
    'Cache-Control': 'no-store',
});
export function createPreviewServer(intercept = () => false) {
    return http.createServer(async (request, response) => {
        const url = new URL(request.url, 'http://127.0.0.1');
        try {
            if (await intercept(request, response, url)) return;
            if (url.pathname === '/images/thumb/first.jpg') {
                response.writeHead(200, { 'Content-Type': 'image/png' }).end(fixturePng);
                return;
            }
            if (!['GET', 'HEAD'].includes(request.method)) {
                response.writeHead(405).end('Method not allowed');
                return;
            }
            if (
                [
                    '/preview-popup.html',
                    '/preview-history.html',
                    '/preview-index.html',
                    '/index.html',
                ].includes(url.pathname)
            ) {
                const html = await renderPreviewDocument(url);
                response
                    .writeHead(200, headers('text/html'))
                    .end(request.method === 'HEAD' ? undefined : html);
                return;
            }
            const asset = assets.get(url.pathname);
            if (!asset) {
                response.writeHead(404).end('Not found');
                return;
            }
            const data = await fs.readFile(projectPath(asset[0]));
            response
                .writeHead(200, headers(asset[1]))
                .end(request.method === 'HEAD' ? undefined : data);
        } catch {
            response.writeHead(500).end('Preview asset unavailable. Run npm run compile first.');
        }
    });
}
