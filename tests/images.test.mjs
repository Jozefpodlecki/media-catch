import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import {
    scanPageImages,
    imageUrl,
    transformImageUrl,
    imagesReducer,
    initialImagesState,
    imageTarget,
    imageDraftUrl,
    extractImagePatterns,
} from '../.build/ui-state.mjs';

const signed =
    'https://cdn.example/images/thumb/116/photo.jpg?secure=A4i3nSxSVo-D-GedoU89hA==,1795571729';
const full =
    'https://cdn.example/images/full/116/photo.jpg?secure=4fPJq5wTwgPuLLFh2ImVkw==,1795571690';
const image = {
    id: '0:0',
    frameId: 0,
    src: signed,
    currentSrc: signed,
    href: full,
    alt: '<script>text</script>',
};

test('image URL drafts preserve edits while submitted targets remain validated and normalized', () => {
    let state = imagesReducer(initialImagesState, {
        type: 'scanned',
        images: [image],
        truncated: false,
    });
    for (const value of [
        'https://cdn.example',
        'https://cdn.example/new folder/photo.jpg',
        'https://',
        '',
    ]) {
        state = imagesReducer(state, { type: 'override', id: image.id, value });
        assert.equal(imageDraftUrl(state, image), value);
        state = imagesReducer(state, { type: 'batch', batch: null });
        assert.equal(imageDraftUrl(state, image), value);
    }
    assert.throws(() => imageTarget(state, image));
    state = imagesReducer(state, {
        type: 'override',
        id: image.id,
        value: 'https://cdn.example/new folder/photo.jpg',
    });
    assert.equal(imageTarget(state, image), 'https://cdn.example/new%20folder/photo.jpg');
    assert.equal(imageDraftUrl(state, image), 'https://cdn.example/new folder/photo.jpg');
});

test('compiled image scan is self-contained and resolves nearest ancestor links and base URLs', () => {
    const nodes = [
        { src: '../thumb/photo.jpg', currentSrc: signed, href: full, alt: 'Photo' },
        { src: 'javascript:alert(1)', currentSrc: '', href: '/gallery', alt: 'x'.repeat(400) },
        { src: 'data:image/png;base64,abc', currentSrc: '', href: null },
        ...Array.from({ length: 500 }, (_, index) => ({
            src: `/image-${index}.jpg`,
            currentSrc: '',
            href: null,
        })),
    ].map((item) => ({
        localName: 'img',
        currentSrc: item.currentSrc,
        getAttribute(name) {
            return item[name] ?? null;
        },
        closest(selector) {
            assert.equal(selector, 'a[href]');
            return item.href === null ? null : { getAttribute: () => item.href };
        },
    }));
    const result = vm.runInNewContext(`(${scanPageImages.toString()})()`, {
        URL,
        getComputedStyle: () => ({ backgroundImage: 'none' }),
        document: {
            baseURI: 'https://site.example/gallery/index.html',
            querySelectorAll: () => nodes,
        },
    });
    assert.equal(result.images.length, 500);
    assert.equal(result.truncated, true);
    assert.equal(result.images[0].src, 'https://site.example/thumb/photo.jpg');
    assert.equal(result.images[0].href, full);
    assert.equal(result.images[1].src, '');
    assert.equal(result.images[1].href, 'https://site.example/gallery');
    assert.equal(result.images[1].alt.length, 300);
    assert.equal(result.images[2].src, 'https://site.example/image-0.jpg');
});

test('image URL replacement is literal and preserves signature text without manufacturing a signature', () => {
    assert.equal(
        transformImageUrl(signed, '/thumb/', '/full/'),
        signed.replace('/thumb/', '/full/'),
    );
    assert.equal(transformImageUrl(signed, '', 'ignored'), signed);
    assert.equal(
        transformImageUrl('https://site.example/thumb.jpg', 'thumb', '$&'),
        'https://site.example/$&.jpg',
    );
    assert.equal(
        transformImageUrl('https://site.example/a.jpg?token=$&', '$&', '$1'),
        'https://site.example/a.jpg?token=$1',
    );
    for (const url of [
        'javascript:alert(1)',
        'file:///test.jpg',
        'data:image/png;base64,abc',
        'https://user:pass@site.example/a.jpg',
        'https://example.com/' + 'x'.repeat(16384),
    ])
        assert.throws(() => imageUrl(url));
});

test('whole-document image scan covers lazy, responsive, CSS, direct links and open shadow references', () => {
    const node = (tag, attrs = {}, extra = {}) => ({
        localName: tag,
        currentSrc: '',
        textContent: '',
        getAttribute: (key) => attrs[key] ?? null,
        closest: () => null,
        querySelector: () => null,
        ...extra,
    });
    const shadow = node('img', { src: '/shadow/image.jpg' });
    const nodes = [
        node('img', {
            'data-src': '/lazy/photo.jpg',
            srcset: '/responsive/a.jpg?secure=abc,123 1x,/responsive/b.jpg 2x',
        }),
        node(
            'source',
            { srcset: '/picture/large.webp 1200w' },
            { closest: (selector) => (selector === 'picture' ? {} : null) },
        ),
        node(
            'div',
            {},
            {
                background:
                    'linear-gradient(red, blue), url("/background/one.png"), url(/background/two.png)',
            },
        ),
        node('a', { href: '/linked/full.jpg?secure=valid' }),
        node('a', { href: '/gallery/not-an-image' }),
        node('div', {}, { shadowRoot: { querySelectorAll: () => [shadow] } }),
        node('img', { src: '/lazy/photo.jpg' }),
    ];
    const result = vm.runInNewContext(`(${scanPageImages.toString()})()`, {
        URL,
        getComputedStyle: (element) => ({ backgroundImage: element.background || 'none' }),
        document: {
            baseURI: 'https://site.example/page',
            querySelectorAll: (selector) => {
                assert.equal(selector, '*');
                return nodes;
            },
        },
    });
    const urls = result.images.map((image) => image.src);
    for (const url of [
        '/lazy/photo.jpg',
        '/responsive/a.jpg?secure=abc,123',
        '/responsive/b.jpg',
        '/picture/large.webp',
        '/background/one.png',
        '/background/two.png',
        '/linked/full.jpg?secure=valid',
        '/shadow/image.jpg',
    ])
        assert.ok(urls.includes('https://site.example' + url), url);
    assert.equal(urls.filter((url) => url.endsWith('/lazy/photo.jpg')).length, 1);
    assert.equal(
        urls.some((url) => url.includes('not-an-image')),
        false,
    );
    assert.equal(result.truncated, false);
    assert.deepEqual(
        new Set(result.images.map((image) => image.kind)),
        new Set(['lazy', 'srcset', 'background', 'link', 'image']),
    );
});

test('whole-document traversal reports its element budget without scanning indefinitely', () => {
    let styled = 0;
    const element = { localName: 'div', getAttribute: () => null, closest: () => null };
    const result = vm.runInNewContext(`(${scanPageImages.toString()})()`, {
        URL,
        getComputedStyle: () => {
            styled++;
            return { backgroundImage: 'none' };
        },
        document: {
            baseURI: 'https://site.example/',
            querySelectorAll: () => Array.from({ length: 10001 }, () => element),
        },
    });
    assert.equal(styled, 10000);
    assert.equal(result.truncated, true);
});

test('patterns group observed origins and numeric paths while masking filenames and signed query values', () => {
    const images = [
        image,
        {
            ...image,
            id: '0:1',
            src: signed.replace('/116/photo.jpg', '/117/second.jpg'),
            currentSrc: '',
            href: full.replace('/116/photo.jpg', '/117/second.jpg'),
        },
        { ...image, id: '0:2' },
    ];
    const patterns = extractImagePatterns(images);
    assert.equal(patterns.length, 2);
    const thumb = patterns.find((pattern) => pattern.template.includes('/thumb/'));
    assert.equal(
        thumb.template,
        'https://cdn.example/images/thumb/{number}/{file}.jpg?secure={value}',
    );
    assert.equal(thumb.prefix, '/images/thumb/');
    assert.equal(thumb.count, 2);
    assert.deepEqual(thumb.imageIds, ['0:0', '0:1', '0:2']);
    assert.equal(thumb.example, signed);
    assert.equal(
        patterns.some((pattern) => pattern.template.includes('A4i3')),
        false,
    );
    let state = imagesReducer(initialImagesState, { type: 'scanned', images, truncated: false });
    state = imagesReducer(state, { type: 'patternSelected', ids: thumb.imageIds });
    state = imagesReducer(state, { type: 'prefixChosen', prefix: thumb.prefix });
    assert.deepEqual(state.selected, thumb.imageIds);
    assert.equal(state.find, '/images/thumb/');
    assert.equal(state.replacement, state.find);
    assert.equal(imageDraftUrl(state, image), full);
});

test('pattern extraction separates origins and query-key sets and ignores unsupported URLs', () => {
    const patterns = extractImagePatterns([
        { ...image, src: 'https://a.example/pic.jpg?z=secret&a=2', currentSrc: '', href: '' },
        {
            ...image,
            id: '0:1',
            src: 'https://a.example/other.jpg?a=3&z=different',
            currentSrc: '',
            href: '',
        },
        {
            ...image,
            id: '0:2',
            src: 'http://a.example/other.jpg?a=3&z=different',
            currentSrc: '',
            href: '',
        },
        {
            ...image,
            id: '0:3',
            src: 'https://a.example/pic.jpg?a=3',
            currentSrc: '',
            href: 'javascript:alert(1)',
        },
    ]);
    assert.equal(patterns.length, 3);
    assert.equal(patterns[0].template, 'https://a.example/{file}.jpg?a={value}&z={value}');
    assert.equal(patterns[0].count, 2);
    assert.equal(patterns[0].prefix, '');
});

test('image selection, transformations and per-image edits stay separate from batch polling', () => {
    let state = imagesReducer(initialImagesState, {
        type: 'scanned',
        images: [image],
        truncated: false,
    });
    assert.equal(imageTarget(state, image), full);
    state = imagesReducer(state, { type: 'source', source: 'src' });
    assert.equal(imageTarget(state, image), signed);
    state = imagesReducer(state, { type: 'find', value: '/thumb/' });
    state = imagesReducer(state, { type: 'replacement', value: '/full/' });
    assert.equal(imageTarget(state, image), signed.replace('/thumb/', '/full/'));
    state = imagesReducer(state, { type: 'override', id: image.id, value: full });
    state = imagesReducer(state, { type: 'toggle', id: image.id });
    state = imagesReducer(state, { type: 'batch', batch: { running: true } });
    assert.equal(imageTarget(state, image), full);
    assert.deepEqual(state.selected, []);
    assert.equal(state.find, '/thumb/');
    state = imagesReducer(state, { type: 'selectAll', selected: true });
    assert.deepEqual(state.selected, [image.id]);
    state = imagesReducer(state, { type: 'source', source: 'link' });
    assert.deepEqual(state.overrides, {});
    assert.deepEqual(initialImagesState.images, []);
});

function runtime() {
    const state = { downloads: [], native: new Map(), removed: [] };
    const noop = { addListener() {} };
    const browser = {
        runtime: {
            id: 'test',
            getURL: (path) => 'moz-extension://test/' + path,
            onMessage: {
                addListener(fn) {
                    state.message = fn;
                },
            },
        },
        tabs: {
            async get(id) {
                return { id, url: 'https://site.example/gallery', incognito: true };
            },
            onRemoved: {
                addListener(fn) {
                    state.removed.push(fn);
                },
            },
            onUpdated: noop,
        },
        webRequest: { onBeforeRequest: noop, onCompleted: noop, onErrorOccurred: noop },
        scripting: {
            async executeScript(options) {
                state.target = options.target;
                return (
                    state.frames || [{ frameId: 0, result: { images: [image], truncated: false } }]
                );
            },
        },
        downloads: {
            onChanged: {
                addListener(fn) {
                    state.changed = fn;
                },
            },
            async download(options) {
                state.downloads.push(options);
                await state.hold;
                if (options.url.includes('fail')) throw new Error('Server rejected download');
                const id = state.downloads.length;
                state.native.set(id, { state: state.early ? 'complete' : 'in_progress' });
                return id;
            },
            async search({ id }) {
                return [state.native.get(id)];
            },
        },
    };
    vm.runInNewContext(fs.readFileSync('extension/background.js', 'utf8'), {
        browser,
        URL,
        AbortController,
        setTimeout,
        clearTimeout,
    });
    state.send = (message, sender = { id: 'test', url: 'moz-extension://test/popup.html' }) =>
        state.message(message, sender);
    state.finished = async () => {
        for (let i = 0; i < 100; i++) {
            const result = await state.send({ action: 'images-state', tabId: 2 });
            if (!result.batch?.running) return result.batch;
            await new Promise((resolve) => setTimeout(resolve, 0));
        }
        throw new Error('Batch did not finish');
    };
    return state;
}

test('image scan bounds results across frames and rejects unsupported extracted URLs', async () => {
    const state = runtime();
    state.frames = [
        {
            frameId: 3,
            result: { images: [{ ...image, href: 'javascript:alert(1)' }], truncated: false },
        },
        {
            frameId: 4,
            result: { images: Array.from({ length: 500 }, () => image), truncated: false },
        },
    ];
    const result = await state.send({ action: 'images-scan', tabId: 2 });
    assert.equal(result.images.length, 500);
    assert.equal(result.truncated, true);
    assert.equal(result.images[0].href, '');
    assert.equal(result.images[0].frameId, 3);
    assert.equal(state.target.allFrames, true);
});

test('bulk images deduplicate final URLs, isolate failures, and follow native download completion', async () => {
    const state = runtime();
    const result = await state.send({
        action: 'images-download',
        tabId: 2,
        items: [
            { url: full, frameId: 0 },
            { url: full, frameId: 1 },
            { url: 'https://cdn.example/fail.jpg', frameId: 0 },
            { url: 'https://cdn.example/%2E%2E%2Fsafe.jpg?token=secret', frameId: 0 },
        ],
    });
    assert.equal(result.ok, true);
    const batch = await state.finished();
    assert.equal(batch.started, 2);
    assert.equal(batch.failed, 1);
    assert.equal(batch.total, 3);
    assert.equal(state.downloads[0].url, full);
    assert.equal(state.downloads[0].incognito, true);
    assert.equal(state.downloads[0].saveAs, false);
    assert.equal(state.downloads[0].conflictAction, 'uniquify');
    assert.equal(state.downloads[2].filename, 'safe.jpg');
    state.changed({ id: 1, state: { current: 'complete' } });
    const history = await state.send({ action: 'history-get' });
    assert.equal(history.entries.length, 3);
    assert.equal(history.entries.find((entry) => entry.downloadId === 1).state, 'complete');
    assert.equal(history.entries.filter((entry) => entry.state === 'failed').length, 1);
});

test('stop discards queued images without canceling started downloads and clear never resurrects history', async () => {
    const state = runtime();
    let release;
    state.hold = new Promise((resolve) => {
        release = resolve;
    });
    await state.send({
        action: 'images-download',
        tabId: 2,
        items: [
            { url: full, frameId: 0 },
            { url: signed, frameId: 0 },
        ],
    });
    const overlap = await state.send({
        action: 'images-download',
        tabId: 2,
        items: [{ url: full, frameId: 0 }],
    });
    assert.equal(overlap.ok, false);
    await state.send({ action: 'images-stop', tabId: 2 });
    await state.send({ action: 'history-clear' });
    release();
    const batch = await state.finished();
    assert.equal(batch.stopped, true);
    assert.equal(state.downloads.length, 1);
    state.changed({ id: 1, state: { current: 'complete' } });
    assert.equal((await state.send({ action: 'history-get' })).entries.length, 0);
});

test('image commands validate complete batches before starting and reject page senders', async () => {
    const state = runtime();
    for (const items of [
        [],
        [{ url: full, frameId: -1 }],
        [{ url: 'file:///test.jpg', frameId: 0 }],
        [
            { url: full, frameId: 0 },
            { url: 'javascript:alert(1)', frameId: 0 },
        ],
        Array.from({ length: 501 }, () => ({ url: full, frameId: 0 })),
    ]) {
        assert.equal((await state.send({ action: 'images-download', tabId: 2, items })).ok, false);
    }
    assert.equal(state.downloads.length, 0);
    const denied = state.send(
        { action: 'images-download', tabId: 2, items: [{ url: full, frameId: 0 }] },
        { id: 'test', url: 'https://site.example/', tab: { id: 2 }, frameId: 0 },
    );
    assert.equal(denied, undefined);
    state.early = true;
    await state.send({ action: 'images-download', tabId: 2, items: [{ url: full, frameId: 0 }] });
    await state.finished();
    assert.equal((await state.send({ action: 'history-get' })).entries[0].state, 'complete');
});
