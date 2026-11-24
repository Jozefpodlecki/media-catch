import { buildRuntimeFixture } from './testing/runtime-fixture.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import webExt from 'web-ext';
const index = process.argv.indexOf('--browser');
if (index < 0 || !process.argv[index + 1])
    throw new Error('Supply --browser with a Firefox executable path.');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
await fs.mkdir(path.join(root, 'artifacts'), { recursive: true });
const fixture = await fs.mkdtemp(path.join(root, 'artifacts', 'hook-smoke-'));
const sourceDir = path.join(fixture, 'extension');
const profile = path.join(fixture, 'profile');
const downloads = path.join(fixture, 'downloads');
await fs.cp(path.join(root, 'extension'), sourceDir, { recursive: true });
await fs.mkdir(profile);
await fs.mkdir(downloads);

let resolveReport;
const reportPromise = new Promise((resolve) => {
    resolveReport = resolve;
});
const server = http.createServer(async (request, response) => {
    if (request.url === '/report' && request.method === 'POST') {
        let body = '';
        for await (const chunk of request) {
            body += chunk;
            if (body.length > 20000) {
                response.writeHead(413).end();
                return;
            }
        }
        const report = JSON.parse(body);
        await fs.writeFile(path.join(fixture, 'report.json'), JSON.stringify(report, null, 2));
        response.end('ok');
        resolveReport(report);
    } else if (request.url === '/fixture.html') {
        response.writeHead(200, { 'Content-Type': 'text/html' })
            .end(`<!doctype html><title>Blob hook live test</title><script>
      globalThis.cachedCreate = URL.createObjectURL;
      globalThis.preexisting = URL.createObjectURL(new Blob([new Uint8Array(11 * 1024 * 1024)]));
    </script>`);
    } else if (request.url === '/worker.js') {
        response
            .writeHead(200, { 'Content-Type': 'text/javascript' })
            .end('postMessage(URL.createObjectURL(new Blob([new Uint8Array(11 * 1024 * 1024)])));');
    } else response.writeHead(404).end();
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const baseUrl = `http://127.0.0.1:${server.address().port}`;

async function backgroundSmoke(baseUrl) {
    const { startBlobWatch, stopBlobWatch, inspectBlobWatch, testWatchedHooks, getAttemptHistory } =
        TestRuntime;
    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    try {
        const tab = await browser.tabs.create({ url: baseUrl + '/fixture.html' });
        for (let n = 0; n < 100; n++) {
            const loaded = await browser.tabs.get(tab.id);
            if (loaded.status === 'complete' && loaded.url === baseUrl + '/fixture.html') break;
            await delay(50);
        }
        await startBlobWatch({ tabId: tab.id, minimumMiB: 10 });
        const initial = await inspectBlobWatch(tab.id);
        if (!initial.diagnostics[0]?.attached || initial.diagnostics[0].counters.calls !== 0)
            throw new Error('Hook did not start attached with zero new calls.');
        const [page] = await browser.scripting.executeScript({
            target: { tabId: tab.id },
            world: 'MAIN',
            func: async () => {
                URL.revokeObjectURL(
                    URL.createObjectURL(new Blob([new Uint8Array(10 * 1024 * 1024)])),
                );
                URL.revokeObjectURL(
                    URL.createObjectURL(new Blob([new Uint8Array(11 * 1024 * 1024)])),
                );
                URL.revokeObjectURL(URL.createObjectURL(new MediaSource()));
                const frame = document.createElement('iframe');
                document.body.append(frame);
                const foreignBlob = new frame.contentWindow.Blob([new Uint8Array(1)]);
                const foreignRealm = !(foreignBlob instanceof Blob);
                URL.revokeObjectURL(URL.createObjectURL(foreignBlob));
                frame.remove();
                URL.revokeObjectURL(
                    globalThis.cachedCreate(new Blob([new Uint8Array(11 * 1024 * 1024)])),
                );
                const workerUrl = await new Promise((resolve, reject) => {
                    globalThis.smokeWorker = new Worker('/worker.js');
                    globalThis.smokeWorker.onmessage = (event) => resolve(event.data);
                    globalThis.smokeWorker.onerror = () => reject(new Error('Worker failed'));
                });
                return { workerCreatedUrl: workerUrl.startsWith('blob:'), foreignRealm };
            },
        });
        for (let n = 0; n < 200 && getAttemptHistory()[0]?.state !== 'complete'; n++)
            await delay(50);
        const diagnostics = await inspectBlobWatch(tab.id);
        const counters = diagnostics.diagnostics[0]?.counters;
        if (
            getAttemptHistory().length !== 1 ||
            getAttemptHistory()[0].state !== 'complete' ||
            getAttemptHistory()[0].size !== 11 * 1024 * 1024
        ) {
            throw new Error(
                'Expected one completed 11 MiB automatic download: ' +
                    JSON.stringify({
                        history: getAttemptHistory().map(({ state, message }) => ({
                            state,
                            message,
                        })),
                        diagnostics,
                    }),
            );
        }
        if (
            !page.result.foreignRealm ||
            counters.calls !== 4 ||
            counters.blobs !== 3 ||
            counters.streams !== 1 ||
            counters.belowThreshold !== 2 ||
            counters.captured !== 1 ||
            counters.acknowledged !== 1
        ) {
            throw new Error('Unexpected hook counters: ' + JSON.stringify(counters));
        }
        const probe = await testWatchedHooks(tab.id);
        if (!probe.hookTest.startsWith('1 of 1') || getAttemptHistory().length !== 1)
            throw new Error('Non-downloading self-test failed.');
        await stopBlobWatch(tab.id);
        await browser.scripting.executeScript({
            target: { tabId: tab.id },
            world: 'MAIN',
            func: () => {
                URL.revokeObjectURL(
                    URL.createObjectURL(new Blob([new Uint8Array(11 * 1024 * 1024)])),
                );
            },
        });
        await delay(150);
        if (getAttemptHistory().length !== 1) throw new Error('Capture continued after stopping.');
        const [download] = await browser.downloads.search({
            id: getAttemptHistory()[0].downloadId,
        });
        await fetch(baseUrl + '/report', {
            method: 'POST',
            body: JSON.stringify({
                ok: true,
                workerCreatedUrl: page.result.workerCreatedUrl,
                crossRealmBlobRecognized: page.result.foreignRealm,
                downloadFile: download?.filename,
                downloadExists: download?.exists,
                receivedBytes: download?.bytesReceived,
                counters,
                history: getAttemptHistory().map(({ state, size, mode }) => ({
                    state,
                    size,
                    mode,
                })),
                selfTest: probe.hookTest,
                skipped: [
                    'preexisting',
                    'exactly 10 MiB',
                    'MediaSource',
                    'cached original',
                    'worker-created',
                    'after stop',
                ],
            }),
        });
    } catch (error) {
        await fetch(baseUrl + '/report', {
            method: 'POST',
            body: JSON.stringify({ ok: false, error: error.message }),
        });
    }
}

await buildRuntimeFixture(sourceDir);
const manifest = JSON.parse(await fs.readFile(path.join(sourceDir, 'manifest.json'), 'utf8'));
manifest.permissions.push('http://127.0.0.1/*');
manifest.background.scripts.push('smoke-background.js');
await fs.writeFile(path.join(sourceDir, 'manifest.json'), JSON.stringify(manifest));
await fs.writeFile(
    path.join(sourceDir, 'smoke-background.js'),
    `(${backgroundSmoke.toString()})(${JSON.stringify(baseUrl)});`,
);
let runner;
let timeout;
try {
    runner = await webExt.cmd.run({
        sourceDir,
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
            'browser.download.always_ask_before_handling_new_types': false,
        },
    });
    const report = await Promise.race([
        reportPromise,
        new Promise((_, reject) => {
            timeout = setTimeout(
                () => reject(new Error('Live hook test timed out. Artifacts: ' + fixture)),
                30000,
            );
        }),
    ]);
    console.log(JSON.stringify(report, null, 2));
    if (report.ok) {
        if (!path.resolve(report.downloadFile).startsWith(path.resolve(downloads) + path.sep))
            throw new Error('Unexpected test download destination.');
        if ((await fs.stat(report.downloadFile)).size !== 11 * 1024 * 1024)
            throw new Error('Test file size did not match.');
    }
    console.log('Test artifacts:', fixture);
    if (!report.ok) process.exitCode = 1;
} finally {
    clearTimeout(timeout);
    if (runner) {
        const closed = new Promise((resolve) => runner.registerCleanup(resolve));
        await runner.exit();
        await closed;
    }
    server.close();
}
