import { buildRuntimeFixture } from './testing/runtime-fixture.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { createSiteFixtures } from './testing/site-fixtures.mjs';
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
const handleFixture = await createSiteFixtures();
let resolveReport;
const reportPromise = new Promise((resolve) => {
    resolveReport = resolve;
});
const server = http.createServer(async (req, res) => {
    const pathname = new URL(req.url, 'http://127.0.0.1').pathname;
    if (req.method === 'POST' && pathname === '/report') {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const bytes = Buffer.concat(chunks);
        const report = JSON.parse(bytes);
        await fs.writeFile(path.join(fixture, 'report.json'), JSON.stringify(report, null, 2));
        res.end('ok');
        resolveReport(report);
    } else if (await handleFixture(req, res)) {
        return;
    } else if (pathname === '/slow.m3u8') {
        req.on('close', () => res.end());
    } else if (pathname === '/encrypted.m3u8') {
        res.end(
            '#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="key"\n#EXTINF:1,\nsegment-0.ts\n#EXT-X-ENDLIST',
        );
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
        const tab = await browser.tabs.create({ url: base + '/fixtures/2-hls' });
        for (let n = 0; n < 100; n++) {
            const loaded = await browser.tabs.get(tab.id);
            if (loaded.status === 'complete' && loaded.url === base + '/fixtures/2-hls') break;
            await wait(50);
        }
        const [generated] = await browser.scripting.executeScript({
            target: { tabId: tab.id },
            world: 'MAIN',
            func: async () => {
                try {
                    await window.fixture.generate();
                    return 'ready';
                } catch (error) {
                    return String(error);
                }
            },
        });
        if (generated.result !== 'ready')
            throw new Error('Page HLS generation failed: ' + JSON.stringify(generated));
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
        for (let n = 0; n < 100; n++) {
            if (getMediaState(tab.id).observations.some((item) => item.reason === 'attribute:src'))
                break;
            await wait(50);
        }
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
            func: async () => {
                for (let n = 0; n < 100 && !window.fixture; n++)
                    await new Promise((resolve) => setTimeout(resolve, 50));
                if (!window.fixture) throw new Error('HLS page fixture did not initialize.');
                try {
                    return (await window.fixture.run()).url;
                } catch (error) {
                    return 'Failed: ' + error.message;
                }
            },
        });
        if (typeof blob.result !== 'string' || !blob.result.startsWith('blob:'))
            throw new Error('Page fixture failed: ' + JSON.stringify(blob));
        for (let n = 0; n < 100; n++) {
            if (getMediaState(tab.id).observations.some((item) => item.url === blob.result)) break;
            await wait(50);
        }
        if (!getMediaState(tab.id).observations.some((item) => item.url === blob.result))
            throw new Error(
                'Page-generated video blob was not observed: ' +
                    JSON.stringify(getMediaState(tab.id)),
            );
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
        const { armRules, disarmRules, rulesState, ruleRepository } = TestRuntime;
        const origin = new URL(base).origin;
        const automatic = {
            id: 'automatic',
            name: 'Automatic HLS',
            enabled: true,
            trigger: 'network',
            match: 'contains',
            pattern: '/fixture.m3u8',
            action: 'auto',
        };
        await ruleRepository().save(origin, automatic);
        const requestPlaylist = async () =>
            browser.scripting.executeScript({
                target: { tabId: tab.id },
                world: 'MAIN',
                func: async (url) => {
                    await fetch(url);
                },
                args: [base + '/fixture.m3u8?rule=1'],
            });
        const until = async (predicate, description) => {
            for (let index = 0; index < 600; index++) {
                if (predicate()) return;
                await wait(50);
            }
            throw new Error(description + ': ' + JSON.stringify(rulesState(tab.id).runtime.log));
        };
        await armRules(tab.id, true);
        const beforePreview = getAttemptHistory().length;
        await requestPlaylist();
        await until(
            () => rulesState(tab.id).runtime.log.some((item) => item.state === 'preview'),
            'Rule preview did not match the network request',
        );
        if (getAttemptHistory().length !== beforePreview)
            throw new Error('Preview started a download');
        disarmRules(tab.id);
        await armRules(tab.id, false);
        await requestPlaylist();
        await until(
            () =>
                getAttemptHistory().some(
                    (item) =>
                        item.rule === automatic.name &&
                        ['complete', 'failed', 'interrupted'].includes(item.state),
                ),
            'Automatic HLS did not finish',
        );
        const ruleHls = getAttemptHistory().find((item) => item.rule === automatic.name);
        if (ruleHls.state !== 'complete')
            throw new Error('Automatic HLS failed: ' + ruleHls.message);
        const [ruleHlsDownload] = await browser.downloads.search({ id: ruleHls.downloadId });
        await requestPlaylist();
        await wait(200);
        if (getAttemptHistory().filter((item) => item.rule === automatic.name).length !== 1)
            throw new Error('Rule downloaded a duplicate URL');
        await ruleRepository().save(origin, {
            ...automatic,
            name: 'Automatic file blob',
            trigger: 'dom',
            pattern: 'blob:',
        });
        await armRules(tab.id, false);
        await browser.scripting.executeScript({
            target: { tabId: tab.id },
            world: 'MAIN',
            func: async () => {
                await window.fixture.run();
            },
        });
        await until(
            () =>
                getAttemptHistory().some(
                    (item) =>
                        item.rule === 'Automatic file blob' &&
                        ['complete', 'failed', 'interrupted'].includes(item.state),
                ),
            'DOM file-blob rule did not finish',
        );
        const ruleBlob = getAttemptHistory().find((item) => item.rule === 'Automatic file blob');
        if (ruleBlob.state !== 'complete')
            throw new Error('DOM file-blob rule failed: ' + ruleBlob.message);
        const [ruleBlobDownload] = await browser.downloads.search({ id: ruleBlob.downloadId });
        disarmRules(tab.id);
        if (!getMediaState(tab.id).elements)
            throw new Error('Disarming rules stopped the manual observer');
        await fetch(base + '/report', {
            method: 'POST',
            body: JSON.stringify({
                ok: true,
                network: detected.records.length,
                observations: detected.observations.map((item) => item.reason),
                files: [
                    hlsDownload.filename,
                    blobDownload.filename,
                    ruleHlsDownload.filename,
                    ruleBlobDownload.filename,
                ],
                rules: [
                    'network preview',
                    'network HLS conversion',
                    'duplicate suppression',
                    'DOM blob download',
                    'manual observer isolation',
                ],
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
    if (report.ok) {
        report.verifiedFiles = [];
        for (const filename of report.files) {
            if (!path.resolve(filename).startsWith(downloads + path.sep))
                throw new Error('Unexpected test download directory');
            const bytes = await fs.readFile(filename);
            if (bytes.toString('ascii', 4, 8) !== 'ftyp')
                throw new Error('Output is not an MP4 file');
            if (bytes.length < 1000) throw new Error('Native MP4 output is unexpectedly small.');
            report.verifiedFiles.push({ filename, bytes: bytes.length });
        }
        await fs.writeFile(path.join(fixture, 'report.json'), JSON.stringify(report, null, 2));
        console.log(
            'Verified native file sizes:',
            report.verifiedFiles.map((file) => file.bytes),
        );
    } else process.exitCode = 1;
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
