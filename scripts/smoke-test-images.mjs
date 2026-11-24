import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import webExt from 'web-ext';
import { buildRuntimeFixture } from './testing/runtime-fixture.mjs';
import { projectRoot } from './lib/project.mjs';

const index = process.argv.indexOf('--browser');
if (index < 0 || !process.argv[index + 1])
    throw new Error('Supply --browser <Firefox executable>.');
await fs.mkdir(path.join(projectRoot, 'artifacts'), { recursive: true });
const fixture = await fs.mkdtemp(path.join(projectRoot, 'artifacts', 'images-smoke-'));
const sourceDir = path.join(fixture, 'extension');
const profile = path.join(fixture, 'profile');
const downloads = path.join(fixture, 'downloads');
await fs.cp(path.join(projectRoot, 'extension'), sourceDir, { recursive: true });
await fs.mkdir(profile);
await fs.mkdir(downloads);
const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5V8AAAAASUVORK5CYII=',
    'base64',
);
let resolveReport;
const completed = new Promise((resolve) => {
    resolveReport = resolve;
});
const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    if (url.pathname === '/report' && request.method === 'POST') {
        const chunks = [];
        for await (const chunk of request) chunks.push(chunk);
        const report = JSON.parse(Buffer.concat(chunks));
        await fs.writeFile(path.join(fixture, 'report.json'), JSON.stringify(report, null, 2));
        response.end('ok');
        resolveReport(report);
    } else if (url.pathname === '/page') {
        response.writeHead(200, { 'Content-Type': 'text/html' })
            .end(`<!doctype html><title>Image scan test</title>
            <a href="/full/linked.png?secure=full-token"><span><img src="/thumb/linked.png?secure=thumb-token" alt="Nested link"></span></a>
            <img src="/thumb/plain.png?secure=unchanged-token" alt="Source only">
            <a href="/full/linked.png?secure=full-token"><img src="/thumb/linked.png?secure=thumb-token" alt="Duplicate"></a>
            <img data-src="/thumb/lazy.png" alt="Lazy image">
            <div style="background-image:url('/thumb/background.png');width:10px;height:10px"></div>
            <a href="/full/direct.png">Direct image</a>
            <div id="shadow"></div><script>const shadowImage=document.createElement('img');shadowImage.src='/thumb/shadow.png';document.getElementById('shadow').attachShadow({mode:'open'}).append(shadowImage);</script>`);
    } else if (
        /^\/(thumb|full)\/(linked|plain|lazy|background|direct|shadow)\.png$/.test(url.pathname)
    ) {
        if (url.pathname === '/full/linked.png' && url.searchParams.get('secure') !== 'full-token')
            response.writeHead(403).end('Invalid signature');
        else response.writeHead(200, { 'Content-Type': 'image/png' }).end(png);
    } else response.writeHead(404).end();
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;

async function smoke(base) {
    const { scanImages, startImageBatch, imageBatchState, getAttemptHistory, transformImageUrl } =
        TestRuntime;
    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    try {
        const tab = await browser.tabs.create({ url: base + '/page' });
        for (let i = 0; i < 100; i++) {
            if ((await browser.tabs.get(tab.id)).status === 'complete') break;
            await delay(50);
        }
        const scan = await scanImages(tab.id);
        if (scan.images.length !== 6 || !scan.images[0].href.endsWith('secure=full-token'))
            throw new Error('Image scan did not extract the nested signed link.');
        for (const kind of ['lazy', 'background', 'link']) {
            if (!scan.images.some((image) => image.kind === kind))
                throw new Error('Missing scanned image kind: ' + kind);
        }
        const items = scan.images.map((image) => ({
            url:
                image.href || transformImageUrl(image.currentSrc || image.src, '/thumb/', '/full/'),
            frameId: image.frameId,
        }));
        await startImageBatch({ action: 'images-download', tabId: tab.id, items });
        for (let i = 0; i < 200; i++) {
            const entries = getAttemptHistory();
            if (
                !imageBatchState(tab.id).batch.running &&
                entries.length === 6 &&
                entries.every((entry) => entry.state === 'complete')
            )
                break;
            if (entries.some((entry) => ['failed', 'interrupted'].includes(entry.state)))
                throw new Error('Image download failed: ' + JSON.stringify(entries));
            await delay(50);
        }
        const entries = getAttemptHistory();
        if (entries.length !== 6 || entries.some((entry) => entry.state !== 'complete'))
            throw new Error('Image downloads did not complete or deduplicate.');
        const files = [];
        for (const entry of entries) {
            const [download] = await browser.downloads.search({ id: entry.downloadId });
            files.push({ filename: download.filename, bytes: download.bytesReceived });
        }
        await fetch(base + '/report', {
            method: 'POST',
            body: JSON.stringify({
                ok: true,
                scanned: scan.images.length,
                batch: imageBatchState(tab.id).batch,
                files,
            }),
        });
    } catch (error) {
        await fetch(base + '/report', {
            method: 'POST',
            body: JSON.stringify({ ok: false, error: error.message }),
        });
    }
}

await buildRuntimeFixture(sourceDir);
const manifest = JSON.parse(await fs.readFile(path.join(sourceDir, 'manifest.json'), 'utf8'));
manifest.permissions.push('http://127.0.0.1/*');
manifest.background.scripts.push('smoke-images.js');
await fs.writeFile(path.join(sourceDir, 'manifest.json'), JSON.stringify(manifest));
await fs.writeFile(
    path.join(sourceDir, 'smoke-images.js'),
    `(${smoke.toString()})(${JSON.stringify(base)});`,
);
let runner, timer;
try {
    runner = await webExt.cmd.run({
        sourceDir,
        artifactsDir: path.join(fixture, 'web-ext'),
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
            'browser.download.always_ask_before_handling_new_types': false,
        },
    });
    const report = await Promise.race([
        completed,
        new Promise((_, reject) => {
            timer = setTimeout(
                () => reject(new Error('Image smoke test timed out: ' + fixture)),
                30000,
            );
        }),
    ]);
    if (!report.ok) throw new Error(report.error);
    for (const file of report.files) {
        if (!path.resolve(file.filename).startsWith(downloads + path.sep))
            throw new Error('Unexpected native image download path.');
        const bytes = await fs.readFile(file.filename);
        if (!bytes.equals(png) || file.bytes !== png.length)
            throw new Error('Native image bytes do not match the PNG fixture.');
    }
    console.log(JSON.stringify({ ...report, fixture }, null, 2));
} finally {
    clearTimeout(timer);
    if (runner) {
        const closed = new Promise((resolve) => runner.registerCleanup(resolve));
        await runner.exit();
        await closed;
    }
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
}
