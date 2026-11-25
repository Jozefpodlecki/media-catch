import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createSiteFixtures, fixturePng } from '../scripts/testing/site-fixtures.mjs';

test('shared site fixtures serve gallery, local remux modules and bounded media assets', async () => {
    const handler = await createSiteFixtures();
    const server = http.createServer(async (request, response) => {
        if (!(await handler(request, response))) response.writeHead(404).end();
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    try {
        const gallery = await (await fetch(base + '/fixtures/1-gallery')).text();
        assert.match(gallery, /secure=full-token/);
        assert.match(gallery, /data-src=/);
        const image = await fetch(base + '/thumb/plain.png');
        assert.equal(image.headers.get('content-type'), 'image/png');
        assert.deepEqual(Buffer.from(await image.arrayBuffer()), fixturePng);
        assert.equal((await fetch(base + '/full/linked.png?secure=bad')).status, 403);
        const hls = await (await fetch(base + '/fixtures/2-hls')).text();
        assert.match(hls, /type="module"/);
        for (const file of [
            '/fixtures/hls.js',
            '/fixtures/playlist.js',
            '/vendor/ffmpeg/index.js',
            '/vendor/ffmpeg/types.js',
            '/vendor/ffmpeg/worker.js',
            '/vendor/core/ffmpeg-core.js',
        ]) {
            const response = await fetch(base + file);
            assert.equal(response.status, 200, file);
            assert.equal(response.headers.get('content-type'), 'text/javascript', file);
        }
        const playlist = '#EXTM3U\n#EXT-X-ENDLIST';
        assert.equal(
            (await fetch(base + '/asset/fixture.m3u8', { method: 'POST', body: playlist })).status,
            200,
        );
        assert.equal(await (await fetch(base + '/fixture.m3u8')).text(), playlist);
        assert.equal(
            (await fetch(base + '/asset/other.js', { method: 'POST', body: 'x' })).status,
            404,
        );
        assert.equal(
            (
                await fetch(base + '/asset/segment-0.ts', {
                    method: 'POST',
                    body: Buffer.alloc(1024 * 1024 + 1),
                })
            ).status,
            413,
        );
        assert.equal((await fetch(base + '/vendor/unknown.js')).status, 404);
    } finally {
        server.closeAllConnections();
        await new Promise((resolve) => server.close(resolve));
    }
});
