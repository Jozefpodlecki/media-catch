import http from 'node:http';
import { createSiteFixtures } from './testing/site-fixtures.mjs';

const handle = await createSiteFixtures();
const server = http.createServer((request, response) => {
    handle(request, response)
        .then((handled) => {
            if (!handled) response.writeHead(404).end('Use /fixtures/1-gallery or /fixtures/2-hls');
        })
        .catch((error) => {
            console.error(error);
            if (!response.headersSent) response.writeHead(500);
            response.end('Fixture server failed.');
        });
});
server.listen(8001, '127.0.0.1', () => {
    console.log('Image gallery: http://127.0.0.1:8001/fixtures/1-gallery');
    console.log('HLS to blob: http://127.0.0.1:8001/fixtures/2-hls');
});
