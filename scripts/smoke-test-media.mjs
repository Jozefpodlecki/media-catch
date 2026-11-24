import { buildRuntimeFixture } from './testing/runtime-fixture.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import webExt from 'web-ext';
const index = process.argv.indexOf('--browser');
if (index < 0 || !process.argv[index + 1])
    throw new Error('Supply --browser with a Firefox executable.');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixture = await fs.mkdtemp(path.join(root, 'artifacts/media-smoke-'));
const extension = path.join(fixture, 'extension'),
    profile = path.join(fixture, 'profile'),
    downloads = path.join(fixture, 'downloads');
await fs.cp(path.join(root, 'extension'), extension, { recursive: true });
await fs.mkdir(profile);
await fs.mkdir(downloads);
const assets = new Map();
let resolveReport;
const reportPromise = new Promise((resolve) => {
    resolveReport = resolve;
});
const server = http.createServer(async (req, res) => {
    const pathname = new URL(req.url, 'http://127.0.0.1').pathname;
    if (req.method === 'POST') {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const bytes = Buffer.concat(chunks);
        if (pathname === '/report') {
            const report = JSON.parse(bytes);
            await fs.writeFile(path.join(fixture, 'report.json'), JSON.stringify(report, null, 2));
            res.end('ok');
            resolveReport(report);
        } else if (pathname.startsWith('/asset/')) {
            assets.set('/' + decodeURIComponent(pathname.slice(7)), bytes);
            res.end('ok');
        } else res.writeHead(404).end();
    } else if (pathname === '/page') {
        res.setHeader('Content-Type', 'text/html');
        res.end('<!doctype html><title>Media smoke test</title><video id="video"></video>');
    } else if (pathname === '/slow.m3u8') {
        req.on('close', () => res.end());
    } else if (pathname === '/encrypted.m3u8') {
        res.end(
            '#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="key"\n#EXTINF:1,\nsegment-0.ts\n#EXT-X-ENDLIST',
        );
    } else if (assets.has(pathname)) {
        res.setHeader(
            'Content-Type',
            pathname.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : 'video/mp2t',
        );
        res.end(assets.get(pathname));
    } else res.writeHead(404).end();
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
async function smoke(base) {
    const {
        toggleElementWatch,
        startNetworkWatch,
        getMediaState,
        startConversion,
        cancelConversion,
        conversionState,
        getAttemptHistory,
    } = TestRuntime;
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    try {
        const { FFmpeg } = await import(browser.runtime.getURL('vendor/ffmpeg/index.js'));
        const engine = new FFmpeg();
        const log = [];
        engine.on('log', (entry) => {
            log.push(entry.message);
            if (log.length > 5) log.shift();
        });
        await engine.load({
            classWorkerURL: browser.runtime.getURL('vendor/ffmpeg/worker.js'),
            coreURL: browser.runtime.getURL('vendor/core/ffmpeg-core.js'),
            wasmURL: browser.runtime.getURL('vendor/core/ffmpeg-core.wasm'),
        });
        const code = await engine.exec([
            '-f',
            'lavfi',
            '-i',
            'color=c=black:s=160x90:r=10',
            '-f',
            'lavfi',
            '-i',
            'sine=frequency=500:sample_rate=44100',
            '-t',
            '1',
            '-c:v',
            'libx264',
            '-threads',
            '1',
            '-pix_fmt',
            'yuv420p',
            '-c:a',
            'aac',
            '-f',
            'hls',
            '-hls_time',
            '0.5',
            '-hls_list_size',
            '0',
            '-hls_segment_filename',
            'segment-%d.ts',
            'fixture.m3u8',
        ]);
        if (code) throw new Error('Fixture generation failed: ' + log.join(' '));
        for (const file of await engine.listDir('/'))
            if (file.name === 'fixture.m3u8' || file.name.startsWith('segment-'))
                await fetch(base + '/asset/' + file.name, {
                    method: 'POST',
                    body: await engine.readFile(file.name),
                });
        if (
            await engine.exec([
                '-protocol_whitelist',
                'file,crypto,data',
                '-allowed_extensions',
                'ALL',
                '-i',
                'fixture.m3u8',
                '-c',
                'copy',
                'source.mp4',
            ])
        )
            throw new Error('MP4 fixture generation failed.');
        const source = Array.from(await engine.readFile('source.mp4'));
        engine.terminate();
        const tab = await browser.tabs.create({ url: base + '/page' });
        for (let n = 0; n < 100; n++) {
            const loaded = await browser.tabs.get(tab.id);
            if (loaded.status === 'complete' && loaded.url === base + '/page') break;
            await wait(50);
        }
        await startNetworkWatch(tab.id, '.m3u8');
        await toggleElementWatch(tab.id, true);
        await browser.scripting.executeScript({
            target: { tabId: tab.id },
            world: 'MAIN',
            func: async (base) => {
                const source = document.createElement('source');
                source.src = base + '/fixture.m3u8';
                source.type = 'application/vnd.apple.mpegurl';
                document.getElementById('video').append(source);
                await fetch(source.src);
            },
            args: [base],
        });
        await wait(250);
        await browser.scripting.executeScript({
            target: { tabId: tab.id },
            world: 'MAIN',
            func: (base) => {
                document.querySelector('source').src = base + '/fixture.m3u8?changed=1';
            },
            args: [base],
        });
        await wait(250);
        const detected = getMediaState(tab.id);
        if (!detected.records.some((item) => item.source === 'network' && item.kind === 'HLS'))
            throw new Error('Network playlist was not detected.');
        if (
            !detected.observations.some((item) => item.reason === 'created') ||
            !detected.observations.some((item) => item.reason === 'attribute:src')
        )
            throw new Error(
                'DOM creation/modification was not observed: ' +
                    JSON.stringify(detected.observations),
            );
        async function finish() {
            for (let n = 0; n < 600 && conversionState().running; n++) await wait(50);
            for (let n = 0; n < 100 && getAttemptHistory()[0].state === 'in_progress'; n++)
                await wait(50);
            return getAttemptHistory()[0];
        }
        startConversion(
            {
                tabId: tab.id,
                frameId: 0,
                url: base + '/fixture.m3u8',
                filename: 'hls-test.mp4',
                variant: 0,
            },
            'hls',
        );
        let entry = await finish();
        if (entry.state !== 'complete') throw new Error('HLS conversion failed: ' + entry.message);
        const [hlsDownload] = await browser.downloads.search({ id: entry.downloadId });
        const [blob] = await browser.scripting.executeScript({
            target: { tabId: tab.id },
            world: 'MAIN',
            func: (data) =>
                URL.createObjectURL(new Blob([new Uint8Array(data)], { type: 'video/mp4' })),
            args: [source],
        });
        startConversion(
            { tabId: tab.id, frameId: 0, url: blob.result, filename: 'blob-test.mp4' },
            'blob',
        );
        entry = await finish();
        if (entry.state !== 'complete') throw new Error('File blob remux failed: ' + entry.message);
        const [blobDownload] = await browser.downloads.search({ id: entry.downloadId });
        startConversion(
            { tabId: tab.id, frameId: 0, url: base + '/encrypted.m3u8', filename: 'encrypted.mp4' },
            'hls',
        );
        entry = await finish();
        if (entry.state !== 'failed' || !entry.message.includes('Encrypted'))
            throw new Error('Encrypted playlist was not rejected.');
        startConversion(
            { tabId: tab.id, frameId: 0, url: base + '/slow.m3u8', filename: 'canceled.mp4' },
            'hls',
        );
        await wait(100);
        cancelConversion();
        entry = await finish();
        if (entry.state !== 'canceled')
            throw new Error('Conversion cancellation did not stop the job.');
        await fetch(base + '/report', {
            method: 'POST',
            body: JSON.stringify({
                ok: true,
                network: detected.records.length,
                observations: detected.observations.map((item) => item.reason),
                files: [hlsDownload.filename, blobDownload.filename],
                history: getAttemptHistory().map(({ mode, state, size, message }) => ({
                    mode,
                    state,
                    size,
                    message,
                })),
            }),
        });
    } catch (error) {
        await fetch(base + '/report', {
            method: 'POST',
            body: JSON.stringify({ ok: false, error: error.message }),
        });
    }
}
await buildRuntimeFixture(extension);
const manifest = JSON.parse(await fs.readFile(path.join(extension, 'manifest.json'), 'utf8'));
manifest.permissions.push('http://*/*', 'https://*/*');
manifest.optional_permissions = [];
manifest.background.scripts.push('smoke-media.js');
await fs.writeFile(path.join(extension, 'manifest.json'), JSON.stringify(manifest));
await fs.writeFile(
    path.join(extension, 'smoke-media.js'),
    `(${smoke.toString()})(${JSON.stringify(base)});`,
);
let runner, timer;
try {
    runner = await webExt.cmd.run({
        sourceDir: extension,
        artifactsDir: path.join(root, 'dist'),
        firefox: process.argv[index + 1],
        firefoxProfile: profile,
        keepProfileChanges: false,
        noReload: true,
        noInput: true,
        args: ['--headless'],
        startUrl: ['about:blank'],
        ignoreFiles: [],
        pref: {
            'browser.download.folderList': 2,
            'browser.download.dir': downloads.replaceAll('\\', '\\\\'),
            'browser.download.useDownloadDir': true,
        },
    });
    const report = await Promise.race([
        reportPromise,
        new Promise((_, reject) => {
            timer = setTimeout(
                () => reject(new Error('Live media test timed out: ' + fixture)),
                60000,
            );
        }),
    ]);
    console.log(JSON.stringify(report, null, 2));
    if (report.ok)
        for (const filename of report.files) {
            if (!path.resolve(filename).startsWith(downloads + path.sep))
                throw new Error('Unexpected test download directory');
            const bytes = await fs.readFile(filename);
            if (bytes.toString('ascii', 4, 8) !== 'ftyp')
                throw new Error('Output is not an MP4 file');
        }
    else process.exitCode = 1;
    console.log('Media test artifacts:', fixture);
} finally {
    clearTimeout(timer);
    if (runner) {
        const closed = new Promise((resolve) => runner.registerCleanup(resolve));
        await runner.exit();
        await closed;
    }
    server.close();
}
