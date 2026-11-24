import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { evaluateBrowserTask } from '../scripts/browser/rdp-console.mjs';
import { createPreviewServer } from '../scripts/preview-popup.mjs';

function connection(request) {
    const client = new EventEmitter();
    client.request = (packet) => request(client, packet);
    return { client, consoleActor: 'console' };
}

for (const early of [true, false]) {
    test(`debugger evaluation correlates ${early ? 'early' : 'late'} results and releases listeners`, async () => {
        const target = connection(async (client) => {
            const emit = () =>
                client.emit('evaluationResult', {
                    from: 'console',
                    resultID: 'our-result',
                    result: 'verified',
                });
            client.emit('evaluationResult', {
                from: 'other-console',
                resultID: 'other',
                result: 'ignore',
            });
            if (early) emit();
            else setImmediate(emit);
            return { resultID: 'our-result' };
        });
        assert.equal(await evaluateBrowserTask(target, () => {}, {}), 'verified');
        assert.equal(target.client.listenerCount('evaluationResult'), 0);
        assert.equal(target.client.listenerCount('error'), 0);
    });
}

test('debugger timeout includes an unresponsive initiating request', async () => {
    const target = connection(() => new Promise(() => {}));
    await assert.rejects(
        evaluateBrowserTask(target, () => {}, {}, { timeoutMs: 20 }),
        /Timed out/,
    );
    assert.equal(target.client.listenerCount('evaluationResult'), 0);
    assert.equal(target.client.listenerCount('error'), 0);
});

test('debugger failures release listeners and safely serialize task arguments', async () => {
    const value = '` ${doNotExecute()} " \\ \n';
    const target = connection(async (client, packet) => {
        assert.equal(
            packet.text,
            '(' + (() => {}).toString() + ')(' + JSON.stringify({ id: value }) + ')',
        );
        client.emit('evaluationResult', {
            from: 'console',
            resultID: 'result',
            exceptionMessage: 'test failure',
        });
        return { resultID: 'result' };
    });
    await assert.rejects(
        evaluateBrowserTask(target, () => {}, { id: value }),
        /test failure/,
    );
    assert.equal(target.client.listenerCount('evaluationResult'), 0);
});

test('preview routes serve real assets and sanitize preview parameters', async (t) => {
    const server = createPreviewServer();
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    t.after(() => {
        server.closeAllConnections();
        return new Promise((resolve) => server.close(resolve));
    });
    const base = `http://127.0.0.1:${server.address().port}`;
    const html = await (
        await fetch(base + '/preview-popup.html?theme=%22%3E%3Cscript%3E&state=%22%3E%3Cscript%3E')
    ).text();
    assert.match(html, /data-preview-state="found"/);
    assert.match(html, /color-scheme:light/);
    assert.match(html, /\/examples\/react-preview.js/);
    assert.match(html, /<base href="\/assets\/">/);
    const asset = await fetch(base + '/assets/ui.css');
    assert.equal(asset.status, 200);
    assert.match(asset.headers.get('content-type'), /text\/css/);
    const head = await fetch(base + '/preview-popup.html', { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(await head.text(), '');
    for (const filename of ['/package.json', '/src/background.ts', '/%2e%2e/package.json']) {
        assert.equal((await fetch(base + filename)).status, 404);
    }
    assert.equal((await fetch(base + '/preview-popup.html', { method: 'POST' })).status, 405);
});
