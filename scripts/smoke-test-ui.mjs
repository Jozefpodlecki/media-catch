import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createPreviewServer } from './preview-popup.mjs';

const browser = process.argv[process.argv.indexOf('--browser') + 1];
if (!process.argv.includes('--browser') || !browser)
    throw new Error('Pass --browser <Firefox executable>');
const output = path.resolve('artifacts', `ui-smoke-${Date.now()}`);
const profile = path.join(output, 'profile');
await fs.mkdir(profile, { recursive: true });
const results = [];
let gate;
let report;
const completed = new Promise((resolve) => {
    report = resolve;
});

async function exercise() {
    const results = [];
    const wait = async (condition) => {
        for (let i = 0; i < 150; i++) {
            if (condition()) return;
            await new Promise((resolve) => setTimeout(resolve, 40));
        }
        throw new Error('Timed out waiting for UI');
    };
    try {
        const frame = document.querySelector('iframe');
        await wait(() => frame.contentDocument?.querySelector('[aria-label="Stop blob capture"]'));
        let doc = frame.contentDocument;
        let win = frame.contentWindow;
        const find = (label) => doc.querySelector(`[aria-label="${label}"]`);
        const click = async (label) => {
            const button = find(label);
            if (!button || button.disabled) throw new Error(`Unavailable action: ${label}`);
            button.click();
            await new Promise((resolve) => setTimeout(resolve, 70));
        };
        const key = async (element, value) => {
            element.dispatchEvent(new win.KeyboardEvent('keydown', { key: value, bubbles: true }));
            await new Promise((resolve) => setTimeout(resolve, 50));
        };
        const check = (value, description) => {
            if (!value) throw new Error(description);
            results.push(description);
        };
        await click('Stop blob capture');
        const number = doc.querySelector('[role="spinbutton"]');
        number.focus();
        await key(number, 'ArrowUp');
        check(number.value === '10.1', 'Size stepper supports ArrowUp');
        await click('Decrease threshold');
        check(number.value === '10', 'Size stepper buttons update its value');
        const name = [...doc.querySelectorAll('input')].find((input) => input.title === 'Filename');
        Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, 'value').set.call(
            name,
            'test.bin',
        );
        name.dispatchEvent(new win.Event('input', { bubbles: true }));
        await wait(() => find('Clear filename'));
        await click('Clear filename');
        check(name.value === '' && doc.activeElement === name, 'Clear field restores input focus');
        await click('Media & HLS');
        await click('Use this playlist URL');
        await click('Inspect playlist quality options');
        await wait(() => find('Video quality'));
        const combo = find('Video quality');
        combo.focus();
        await key(combo, 'ArrowDown');
        check(combo.getAttribute('aria-expanded') === 'true', 'Dropdown opens from keyboard');
        await key(combo, 'ArrowDown');
        await key(combo, 'Enter');
        check(
            combo.textContent.includes('1280x720') && doc.activeElement === combo,
            'Dropdown selects quality and retains focus',
        );
        await key(combo, 'End');
        await key(combo, 'Enter');
        check(combo.textContent.includes('854x480'), 'Dropdown supports End');
        await key(combo, 'Home');
        await key(combo, 'Enter');
        check(combo.textContent.includes('1920x1080'), 'Dropdown supports Home');
        await key(combo, 'ArrowDown');
        await key(combo, 'Escape');
        check(combo.getAttribute('aria-expanded') === 'false', 'Escape closes dropdown');
        await click('History');
        const filter = find('Filter history');
        filter.focus();
        await key(filter, 's');
        await key(filter, 'Enter');
        check(
            doc.body.textContent.includes('No matching attempts'),
            'Dropdown typeahead filters history',
        );
        await key(filter, 'Home');
        await key(filter, 'Enter');
        check(
            doc.querySelectorAll('.history-item').length === 3,
            'History filter restores all attempts',
        );
        check(
            [...doc.querySelectorAll('button')].every(
                (button) => button.getAttribute('aria-label') || button.textContent.trim(),
            ),
            'Every icon action has an accessible name',
        );
        check(!doc.querySelector('select'), 'Dropdown uses the shared custom component');
        check(
            doc.documentElement.scrollWidth <= doc.documentElement.clientWidth,
            'No horizontal overflow at popup width',
        );
        await click('Clear session history');
        check(
            doc.body.textContent.includes('No activity yet'),
            'Clear history updates empty state',
        );
        await click('Media & HLS');
        find('Video quality').focus();
        await key(find('Video quality'), 'ArrowDown');
        const box = doc.querySelector('[role="listbox"]').getBoundingClientRect();
        check(
            box.top >= 0 &&
                box.bottom <= win.innerHeight &&
                box.left >= 0 &&
                box.right <= win.innerWidth,
            'Dropdown stays inside viewport',
        );
        await key(find('Video quality'), 'Escape');
        await key(find('Media & HLS'), 'ArrowLeft');
        check(
            find('Images').getAttribute('aria-selected') === 'true' &&
                doc.activeElement === find('Images'),
            'Images participates in keyboard tab navigation',
        );
        await key(find('Images'), 'ArrowLeft');
        check(
            find('Blobs').getAttribute('aria-selected') === 'true' &&
                doc.activeElement === find('Blobs'),
            'Arrow keys switch tabs and move focus',
        );
        frame.style.width = '200px';
        await new Promise((resolve) => setTimeout(resolve, 80));
        check(
            doc.documentElement.scrollWidth <= doc.documentElement.clientWidth,
            'Controls reflow at 200px equivalent to a 400px popup at double zoom',
        );
        frame.style.width = '360px';
        const inputNamed = (title) =>
            [...doc.querySelectorAll('input')].find((input) => input.title === title);
        const edit = async (input, value) => {
            input.focus();
            input.dispatchEvent(new win.FocusEvent('focusin', { bubbles: true }));
            Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, 'value').set.call(
                input,
                value,
            );
            input.dispatchEvent(new win.Event('input', { bubbles: true }));
            await new Promise((resolve) => setTimeout(resolve, 40));
            input.blur();
            input.dispatchEvent(new win.FocusEvent('focusout', { bubbles: true }));
            await new Promise((resolve) => setTimeout(resolve, 40));
        };
        await edit(inputNamed('Filename'), 'keep-my-draft.mp4');
        const editedThreshold = doc.querySelector('[role="spinbutton"]');
        await edit(editedThreshold, '24');
        check(
            doc.querySelector('[role="spinbutton"]').value === '24',
            'Capture threshold commits typed edits',
        );
        await click('Media & HLS');
        await edit(inputNamed('Request URL contains'), '/manifest');
        await click('Blobs');
        check(
            inputNamed('Filename').value === 'keep-my-draft.mp4',
            'Feature drafts survive switching views',
        );
        check(
            doc.querySelector('[role="spinbutton"]').value === '24',
            'Capture threshold survives switching views',
        );
        win.browser.tabs.previewNavigate('https://other.example/player');
        await wait(() =>
            doc.querySelector('.header-context').textContent.includes('other.example'),
        );
        await wait(() => find('Start blob capture') && !find('Start blob capture').disabled);
        check(
            doc.querySelector('[role="spinbutton"]').value === '10',
            'Another website receives its default capture settings',
        );
        check(
            inputNamed('Filename').value === '',
            'Navigation resets temporary blob selection and filename',
        );
        await click('Media & HLS');
        check(
            inputNamed('Request URL contains').value === '.m3u8',
            'Request filter settings do not leak between websites',
        );
        await edit(inputNamed('Request URL contains'), '/other-playlist');
        win.browser.tabs.previewNavigate('https://example.com/another-page?test=1');
        await wait(() =>
            doc.querySelector('.header-context').textContent.includes('example.com/another-page'),
        );
        await wait(
            () => find('Enable network detection') && !find('Enable network detection').disabled,
        );
        check(
            inputNamed('Request URL contains').value === '/manifest',
            'Returning to a website restores its saved request settings',
        );
        await click('Blobs');
        check(
            doc.querySelector('[role="spinbutton"]').value === '24',
            'Returning to a website restores its saved capture threshold',
        );
        await click('Media & HLS');
        await click('Use this playlist URL');
        await click('Inspect playlist quality options');
        await wait(() => find('Video quality'));
        find('Video quality').focus();
        await key(find('Video quality'), 'ArrowDown');
        await key(find('Video quality'), 'Escape');
        const navigate = async (url) => {
            const previous = frame.contentDocument;
            if (frame.src === new URL(url, location.href).href)
                frame.contentWindow.location.reload();
            else frame.src = url;
            await wait(
                () =>
                    frame.contentDocument !== previous &&
                    frame.contentDocument?.querySelector(
                        'input[title="Default capture threshold"]:not(:disabled)',
                    ),
            );
            doc = frame.contentDocument;
            win = frame.contentWindow;
        };
        frame.style.width = '360px';
        await navigate('/preview-index.html?source=2#settings');
        check(
            doc.querySelector('.header-context').textContent.includes('example.com/video'),
            'Dashboard remains bound to the source tab rather than its own active tab',
        );
        check(
            inputNamed('Website capture threshold').value === '24' &&
                inputNamed('Website request filter').value === '/manifest',
            'Saved website preferences survive closing and reopening the UI',
        );
        const observer = document.createElement('iframe');
        observer.src = '/preview-index.html#settings';
        observer.style.cssText = 'position:absolute;width:320px;height:700px;left:400px;top:0';
        document.body.append(observer);
        await wait(() =>
            observer.contentDocument?.querySelector(
                'input[title="Default capture threshold"]:not(:disabled)',
            ),
        );
        await edit(inputNamed('Default capture threshold'), '18');
        try {
            await wait(
                () =>
                    observer.contentDocument.querySelector(
                        'input[title="Default capture threshold"]',
                    ).value === '18',
            );
        } catch {
            throw new Error(
                `Settings synchronization failed: source=${inputNamed('Default capture threshold').value}, observer=${observer.contentDocument.querySelector('input[title="Default capture threshold"]')?.value}`,
            );
        }
        check(true, 'Open extension pages synchronize persisted changes');
        check(
            inputNamed('Website capture threshold').value === '24',
            'An explicit website override survives changing global defaults',
        );
        observer.remove();
        await click('Reset selected website to defaults');
        await wait(() => inputNamed('Website capture threshold').value === '18');
        check(true, 'Resetting a website restores inherited defaults');
        await click('Forget all website preferences');
        await wait(() => doc.body.textContent.includes('No website overrides saved.'));
        check(
            inputNamed('Default capture threshold').value === '18',
            'Forgetting saved websites retains global defaults',
        );
        await navigate('/preview-index.html#settings');
        check(
            doc.body.textContent.includes('No website selected') &&
                !doc.querySelector('.header-context').textContent.includes('preview-index'),
            'An unlinked dashboard opens settings without targeting itself',
        );
        check(
            inputNamed('Default capture threshold').value === '18',
            'Global defaults survive another UI reload',
        );
        await navigate('/preview-index.html?source=2#settings');
        await click('Images');
        check(
            doc.body.textContent.includes('Scan this page for images'),
            'Images starts with an honest empty state',
        );
        await click('Scan page images');
        await wait(() => inputNamed('Download URL for image 1'));
        await wait(() => doc.querySelector('.image-thumbnail img')?.naturalWidth === 160);
        check(
            doc.querySelector('.image-thumbnail img').src.includes('/images/thumb/first.jpg'),
            'Image scan renders a loaded thumbnail from the observed source',
        );
        await wait(() => doc.querySelector('[aria-label="Preview unavailable"]'));
        check(
            Boolean(doc.querySelector('[aria-label="Preview unavailable"]')),
            'Failed thumbnails show an accessible fallback',
        );
        check(
            inputNamed('Download URL for image 1').value.endsWith('first.jpg?secure=full-token'),
            'Image scan prefers the enclosing signed full-size link',
        );
        check(
            doc.body.textContent.includes('2 unique selected'),
            'Image downloads deduplicate final URLs',
        );
        check(
            doc.body.textContent.includes('URL patterns') &&
                doc.querySelector('.image-pattern code').textContent.includes('{file}.jpg'),
            'Page image scan produces URL pattern groups',
        );
        const patternRows = [...doc.querySelectorAll('.image-pattern')];
        const fullPattern = patternRows.find((row) =>
            row.querySelector('code').textContent.includes('/full/'),
        );
        fullPattern.querySelector('button[aria-label^="Select images for pattern"]').click();
        await new Promise((resolve) => setTimeout(resolve, 70));
        check(
            doc.querySelectorAll('.image-selection input:checked').length === 2,
            'A URL pattern selects its matching image references',
        );
        fullPattern.querySelector('button[aria-label^="Use path prefix"]').click();
        await new Promise((resolve) => setTimeout(resolve, 70));
        check(
            inputNamed('Find in image URLs').value === '/images/full/' &&
                inputNamed('Replace in image URLs').value === '/images/full/',
            'A pattern prefix starts an identity transformation without changing URLs',
        );
        await click('Select all images');
        await edit(inputNamed('Find in image URLs'), '');
        await edit(inputNamed('Replace in image URLs'), '');
        const imageCount = [...doc.querySelector('.image-toolbar').children].find(
            (element) => !element.classList.contains('tool-wrap'),
        );
        check(
            imageCount.getBoundingClientRect().height <= 24,
            'Image selection count stays on one line at popup width',
        );
        find('Image URL source').focus();
        await key(find('Image URL source'), 'ArrowDown');
        await key(find('Image URL source'), 'End');
        await key(find('Image URL source'), 'Enter');
        check(
            inputNamed('Download URL for image 1').value.includes('/thumb/'),
            'Image source selection uses the original source',
        );
        await edit(inputNamed('Find in image URLs'), '/thumb/');
        await edit(inputNamed('Replace in image URLs'), '/full/');
        check(
            inputNamed('Download URL for image 1').value.endsWith(
                '/full/first.jpg?secure=thumb-token',
            ),
            'Literal image URL transformation preserves the existing signature',
        );
        await edit(
            inputNamed('Download URL for image 1'),
            'https://cdn.example/new folder/photo.jpg',
        );
        check(
            inputNamed('Download URL for image 1').value ===
                'https://cdn.example/new folder/photo.jpg',
            'Image URL editing preserves the draft without live URL normalization',
        );
        await edit(inputNamed('Download URL for image 1'), 'javascript:alert(1)');
        check(
            find('Download selected images').disabled,
            'Invalid selected image URL blocks bulk download',
        );
        await edit(
            inputNamed('Download URL for image 1'),
            'https://cdn.example/images/full/custom.jpg?secure=manual-token',
        );
        await click('Media & HLS');
        await click('Images');
        check(
            inputNamed('Download URL for image 1').value.endsWith('custom.jpg?secure=manual-token'),
            'Individual image URL edits survive view changes',
        );
        await click('Deselect all images');
        check(
            find('Download selected images').disabled,
            'An empty image selection cannot download',
        );
        await click('Select all images');
        await click('Download selected images');
        await wait(() => doc.body.textContent.includes('Queue finished:'));
        check(
            doc.body.textContent.includes('3 started'),
            'Image batch reports starts separately from native completion',
        );
        frame.style.width = '200px';
        await new Promise((resolve) => setTimeout(resolve, 80));
        check(
            doc.documentElement.scrollWidth <= doc.documentElement.clientWidth,
            'Image controls and URLs reflow at narrow width',
        );
        find('Image capture information').scrollIntoView({ block: 'center' });
        await click('Image capture information');
        const imageInfo = find('Image capture information')
            .parentElement.querySelector('.info-content')
            .getBoundingClientRect();
        check(
            imageInfo.left >= 0 &&
                imageInfo.right <= win.innerWidth &&
                imageInfo.top >= 0 &&
                imageInfo.bottom <= win.innerHeight,
            'Image information stays inside a narrow viewport',
        );
        await key(find('Image capture information'), 'Escape');
        check(
            !find('Image capture information').parentElement.open &&
                doc.activeElement === find('Image capture information'),
            'Image information closes with Escape and restores focus',
        );
        frame.style.width = '360px';
        const imageBackground = win.getComputedStyle(doc.querySelector('.panel')).backgroundColor;
        await click(find('Use light theme') ? 'Use light theme' : 'Use dark theme');
        check(
            imageBackground !== win.getComputedStyle(doc.querySelector('.panel')).backgroundColor,
            'Image controls render in both color themes',
        );
        await click('Site rules');
        await wait(() => !find('New site rule').disabled && inputNamed('Rule name'));
        check(
            find('Arm site rules and run actions').disabled,
            'Rules cannot arm without an enabled saved rule',
        );
        await edit(inputNamed('Rule name'), 'Save matching HLS');
        await click('Save site rule');
        await wait(() => find('Edit rule Save matching HLS'));
        check(
            !find('Arm site rules and run actions').disabled &&
                doc.body.textContent.includes('Edit rule'),
            'Saving a site rule acknowledges the editor and enables explicit arming',
        );
        await click('Preview site rules without downloading');
        await wait(() => find('Disarm site rules'));
        check(
            doc.body.textContent.includes('Preview active'),
            'Rule preview is distinct from executing actions',
        );
        await click('Disarm site rules');
        await click('Arm site rules and run actions');
        await wait(() => doc.body.textContent.includes('Rules armed'));
        check(true, 'Site rules require a separate explicit arm action');
        await click('Disarm site rules');
        await edit(inputNamed('Rule name'), 'My unsaved edit');
        await click('Images');
        await click('Site rules');
        check(
            inputNamed('Rule name').value === 'My unsaved edit',
            'Rule editor drafts survive view switches and polling',
        );
        frame.style.width = '200px';
        await new Promise((resolve) => setTimeout(resolve, 80));
        check(
            doc.documentElement.scrollWidth <= doc.documentElement.clientWidth,
            'Rules editor and six navigation tabs reflow at narrow width',
        );
        frame.style.width = '360px';
        await click('Arm site rules and run actions');
        await wait(() => find('Disarm site rules'));
        await navigate('/preview-index.html?source=2#settings');
        await click('Site rules');
        await wait(() => find('Edit rule Save matching HLS') && find('Disarm site rules'));
        check(
            !!find('Disarm site rules'),
            'Saved rules and the armed background session survive UI reopening',
        );
        await click('Delete rule Save matching HLS');
        await wait(() => !find('Edit rule Save matching HLS'));
        check(
            find('Arm site rules and run actions').disabled,
            'Deleting the last rule disables arming',
        );
        await click('Blobs');
        const scanCountBeforeInternal = win.browser.runtime.previewCommands.filter(
            (action) => action === 'scan',
        ).length;
        win.browser.tabs.previewNavigate('about:torconnect');
        await wait(() =>
            doc.body.textContent.includes('Browser and extension pages cannot be scanned.'),
        );
        check(
            find('Start blob capture').matches(':disabled'),
            'Tor connection pages disable blob capture',
        );
        check(
            !doc.querySelector('[role="alert"]'),
            'Unsupported pages show neutral feedback rather than a host-permission error',
        );
        check(
            win.browser.runtime.previewCommands.filter((action) => action === 'scan').length ===
                scanCountBeforeInternal,
            'Internal-page navigation never sends an automatic scan',
        );
        await click('Images');
        check(
            find('Scan page images').matches(':disabled') &&
                inputNamed('Find in image URLs').matches(':disabled'),
            'Internal pages disable image capture and transformation controls',
        );
        await click('Media & HLS');
        check(
            find('Enable network detection').matches(':disabled') &&
                find('Observe video and source elements').matches(':disabled'),
            'Internal pages disable network and DOM monitoring controls',
        );
        await click('Site rules');
        check(
            find('Save site rule').matches(':disabled'),
            'Internal pages cannot save source-specific rules',
        );
        await click('History');
        check(
            find('History').getAttribute('aria-selected') === 'true',
            'History remains accessible on internal pages',
        );
        await click('Website settings');
        check(
            !inputNamed('Default capture threshold').matches(':disabled'),
            'Global settings remain usable on internal pages',
        );
        win.browser.tabs.previewNavigate('https://example.com/returned');
        await click('Blobs');
        await wait(() => !find('Start blob capture').matches(':disabled'));
        check(
            !doc.body.textContent.includes('Browser and extension pages cannot be scanned.'),
            'Capture automatically becomes available when the source returns to a website',
        );
        await fetch('/__report', {
            method: 'POST',
            body: JSON.stringify({ ok: true, checks: results }),
        });
    } catch (error) {
        await fetch('/__report', {
            method: 'POST',
            body: JSON.stringify({ ok: false, checks: results, error: String(error) }),
        });
    }
}

const server = createPreviewServer(async (request, response, url) => {
    if (url.pathname === '/__check') {
        response
            .writeHead(200, { 'Content-Type': 'text/html' })
            .end(
                `<!doctype html><html><body style="margin:0;background:#17161c"><iframe src="/preview-popup.html?theme=dark&state=watching" style="border:0;width:360px;height:850px"></iframe><img src="/__gate" style="display:none"><script>(${exercise.toString()})()</script></body></html>`,
            );
        return true;
    }
    if (url.pathname === '/__gate') {
        gate = response;
        return true;
    }
    if (url.pathname === '/__report') {
        const chunks = [];
        for await (const chunk of request) chunks.push(chunk);
        report(JSON.parse(Buffer.concat(chunks).toString()));
        response.writeHead(200).end('ok');
        gate?.writeHead(200, { 'Content-Type': 'image/svg+xml' }).end(
            '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>',
        );
        return true;
    }
    return false;
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const child = spawn(
    browser,
    [
        '--headless',
        '--no-remote',
        '--profile',
        profile,
        '--window-size',
        '360,850',
        '--screenshot',
        path.join(output, 'dropdown.png'),
        `http://127.0.0.1:${server.address().port}/__check`,
    ],
    { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
);
child.stdout.on('data', (data) => results.push(String(data)));
child.stderr.on('data', (data) => results.push(String(data)));
let timer;
try {
    const result = await Promise.race([
        completed,
        new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error('UI check timed out')), 30000);
            child.once('error', reject);
        }),
    ]);
    await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify({ ...result, output }, null, 2));
    if (!result.ok) process.exitCode = 1;
    await new Promise((resolve) => {
        if (child.exitCode !== null) return resolve();
        child.once('exit', resolve);
        setTimeout(resolve, 2000).unref();
    });
} catch (error) {
    console.error(error.message, results.join(''));
    process.exitCode = 1;
} finally {
    clearTimeout(timer);
    if (child.exitCode === null) child.kill();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
}
