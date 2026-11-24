import type { MediaObservation } from '../shared/contracts';
export function configureMediaObserver(config: { enabled: boolean; token?: string }) {
    globalThis.__mediaObserver?.stop();
    if (!config.enabled) return { enabled: false };
    let sent = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let pending: MediaObservation[] = [];
    const known = new WeakMap<Element, string>();
    const inspect = (element: Element, reason: string) => {
        if (!(element instanceof HTMLVideoElement || element instanceof HTMLSourceElement)) return;
        const url = (element.src || '').slice(0, 16384);
        const currentSrc =
            element instanceof HTMLVideoElement ? element.currentSrc.slice(0, 16384) : '';
        if (![url, currentSrc].some((value) => /^(https?:|blob:)/.test(value))) return;
        const type = element instanceof HTMLSourceElement ? element.type.slice(0, 100) : '';
        const signature = JSON.stringify([url, currentSrc, type]);
        if (known.get(element) === signature) return;
        known.set(element, signature);
        if (sent + pending.length >= 100) return;
        pending.push({
            tag: element.localName,
            url: url.slice(0, 16384),
            currentSrc: currentSrc.slice(0, 16384),
            type: type.slice(0, 100),
            reason,
            time: new Date().toISOString(),
        });
        if (!timer)
            timer = setTimeout(() => {
                timer = undefined;
                const observations = pending;
                pending = [];
                sent += observations.length;
                void browser.runtime
                    .sendMessage({ action: 'media-observed', token: config.token, observations })
                    .catch(() => {});
            }, 100);
    };
    const scan = (root: Element | Document, reason: string) => {
        if (root instanceof Element) inspect(root, reason);
        for (const element of root.querySelectorAll('video,source')) inspect(element, reason);
    };
    const observer = new MutationObserver((records) => {
        for (const record of records) {
            if (record.type === 'attributes' && record.target instanceof Element)
                inspect(record.target, `attribute:${record.attributeName}`);
            for (const node of record.addedNodes)
                if (node instanceof Element) scan(node, 'created');
        }
    });
    const onMedia = (event: Event) => {
        if (event.target instanceof Element) inspect(event.target, event.type);
    };
    observer.observe(document, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['src', 'type'],
    });
    for (const type of ['loadstart', 'loadedmetadata', 'emptied'])
        document.addEventListener(type, onMedia, true);
    const stop = () => {
        observer.disconnect();
        clearTimeout(timer);
        pending = [];
        for (const type of ['loadstart', 'loadedmetadata', 'emptied'])
            document.removeEventListener(type, onMedia, true);
        window.removeEventListener('pagehide', stop);
        globalThis.__mediaObserver = undefined;
    };
    globalThis.__mediaObserver = { stop };
    window.addEventListener('pagehide', stop, { once: true });
    scan(document, 'existing');
    return { enabled: true };
}
