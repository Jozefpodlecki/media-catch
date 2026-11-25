import fs from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';
import { deflateSync } from 'node:zlib';
import { projectRoot } from '../lib/project.mjs';

function pngChunk(type, data) {
    const body = Buffer.concat([Buffer.from(type), data]);
    let crc = 0xffffffff;
    for (const byte of body) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    const size = Buffer.alloc(4);
    size.writeUInt32BE(data.length);
    const checksum = Buffer.alloc(4);
    checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([size, body, checksum]);
}
const header = Buffer.alloc(13);
header.writeUInt32BE(160, 0);
header.writeUInt32BE(120, 4);
header[8] = 8;
header[9] = 2;
const pixels = Buffer.alloc(120 * (1 + 160 * 3));
for (let y = 0; y < 120; y++) {
    for (let x = 0; x < 160; x++) {
        const offset = y * 481 + 1 + x * 3;
        pixels[offset] = 40 + x;
        pixels[offset + 1] = 70 + y;
        pixels[offset + 2] = (x + y) % 40 < 20 ? 220 : 140;
    }
}
export const fixturePng = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(pixels)),
    pngChunk('IEND', Buffer.alloc(0)),
]);

export async function createSiteFixtures(assets = new Map()) {
    const bundled = await build({
        entryPoints: [path.join(projectRoot, 'src/hls/playlist.ts')],
        bundle: true,
        format: 'esm',
        write: false,
    });
    const files = new Map([
        ['/fixtures/1-gallery', ['gallery.html', 'text/html']],
        ['/fixtures/2-hls', ['hls.html', 'text/html']],
        ['/fixtures/gallery.js', ['gallery.js', 'text/javascript']],
        ['/fixtures/hls.js', ['hls.js', 'text/javascript']],
        ['/fixtures/style.css', ['style.css', 'text/css']],
    ]);
    const vendorFiles = new Set([
        'ffmpeg/index.js',
        'ffmpeg/types.js',
        'ffmpeg/classes.js',
        'ffmpeg/const.js',
        'ffmpeg/errors.js',
        'ffmpeg/utils.js',
        'ffmpeg/worker.js',
        'core/ffmpeg-core.js',
        'core/ffmpeg-core.wasm',
    ]);
    return async (request, response) => {
        const url = new URL(request.url, 'http://127.0.0.1');
        const pathname = url.pathname;
        if (
            request.method === 'POST' &&
            /^\/asset\/(fixture\.m3u8|segment-\d+\.ts)$/.test(pathname)
        ) {
            const chunks = [];
            let size = 0;
            for await (const chunk of request) {
                size += chunk.length;
                if (size > 1024 * 1024) {
                    response.writeHead(413).end();
                    return true;
                }
                chunks.push(chunk);
            }
            assets.set(pathname.slice(6), Buffer.concat(chunks));
            response.end('ok');
        } else if (!['GET', 'HEAD'].includes(request.method)) return false;
        else if (files.has(pathname)) {
            const [filename, type] = files.get(pathname);
            response
                .writeHead(200, { 'Content-Type': type })
                .end(await fs.readFile(path.join(projectRoot, 'examples/fixtures', filename)));
        } else if (pathname === '/fixtures/playlist.js') {
            response
                .writeHead(200, { 'Content-Type': 'text/javascript' })
                .end(bundled.outputFiles[0].contents);
        } else if (pathname.startsWith('/vendor/') && vendorFiles.has(pathname.slice(8))) {
            response
                .writeHead(200, {
                    'Content-Type': pathname.endsWith('.wasm')
                        ? 'application/wasm'
                        : 'text/javascript',
                })
                .end(await fs.readFile(path.join(projectRoot, 'extension', pathname)));
        } else if (
            /^\/(thumb|full)\/(linked|plain|lazy|background|direct|shadow)\.png$/.test(pathname)
        ) {
            if (pathname === '/full/linked.png' && url.searchParams.get('secure') !== 'full-token')
                response.writeHead(403).end('Invalid signature');
            else response.writeHead(200, { 'Content-Type': 'image/png' }).end(fixturePng);
        } else if (assets.has(pathname)) {
            response
                .writeHead(200, {
                    'Content-Type': pathname.endsWith('.m3u8')
                        ? 'application/vnd.apple.mpegurl'
                        : 'video/mp2t',
                })
                .end(assets.get(pathname));
        } else return false;
        return true;
    };
}
