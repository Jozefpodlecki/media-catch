export function scanPageImages() {
    const images: {
        src: string;
        currentSrc: string;
        href: string;
        alt: string;
        kind: 'image' | 'srcset' | 'lazy' | 'background' | 'link';
    }[] = [];
    const seen = new Set<string>();
    let truncated = false;
    let inspected = 0;
    const resolve = (value: string | null) => {
        if (!value || value.length > 16384) return '';
        try {
            const url = new URL(value, document.baseURI);
            return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
                ? url.href
                : '';
        } catch {
            return '';
        }
    };
    const add = (
        src: string,
        currentSrc: string,
        href: string,
        alt: string,
        kind: (typeof images)[number]['kind'],
    ) => {
        if (kind !== 'image' && !src && !currentSrc) return;
        const key = `${src}\n${currentSrc}\n${href}`;
        if ((!src && !currentSrc && !href) || seen.has(key)) return;
        if (images.length >= 500) {
            truncated = true;
            return;
        }
        seen.add(key);
        images.push({ src, currentSrc, href, alt: alt.slice(0, 300), kind });
    };
    const srcset = (value: string | null, href: string, alt: string) => {
        if (!value || value.length > 16384) return;
        let cursor = 0;
        while (cursor < value.length && !truncated) {
            while (cursor < value.length && /[\s,]/.test(value[cursor])) cursor++;
            const start = cursor;
            while (cursor < value.length && !/\s/.test(value[cursor])) cursor++;
            const token = value.slice(start, cursor);
            add(resolve(token.replace(/,+$/, '')), '', href, alt, 'srcset');
            if (token.endsWith(',')) continue;
            while (cursor < value.length && value[cursor] !== ',') cursor++;
        }
    };
    const roots: (Document | ShadowRoot)[] = [document];
    for (let index = 0; index < roots.length && !truncated; index++) {
        for (const element of roots[index].querySelectorAll('*')) {
            if (++inspected > 10000) {
                truncated = true;
                break;
            }
            if (element.shadowRoot) {
                if (roots.length < 100) roots.push(element.shadowRoot);
                else truncated = true;
            }
            const tag = element.localName;
            const href = resolve(element.closest('a[href]')?.getAttribute('href') || null);
            const alt = element.getAttribute('alt') || '';
            if (tag === 'img') {
                const image = element as HTMLImageElement;
                add(
                    resolve(image.getAttribute('src')),
                    resolve(image.currentSrc),
                    href,
                    alt,
                    'image',
                );
                for (const attribute of ['data-src', 'data-original', 'data-lazy-src'])
                    add(resolve(image.getAttribute(attribute)), '', href, alt, 'lazy');
                srcset(image.getAttribute('srcset'), href, alt);
                srcset(image.getAttribute('data-srcset'), href, alt);
            } else if (tag === 'source' && element.closest('picture')) {
                srcset(element.getAttribute('srcset'), '', alt);
                srcset(element.getAttribute('data-srcset'), '', alt);
            } else if (tag === 'a') {
                const target = resolve(element.getAttribute('href'));
                if (
                    !element.querySelector('img,picture') &&
                    /\.(?:jpe?g|png|gif|webp|avif|svg|bmp|ico|tiff?)(?:[?#]|$)/i.test(target)
                )
                    add(target, '', '', element.textContent?.slice(0, 300) || '', 'link');
            }
            const background = getComputedStyle(element).backgroundImage;
            if (background && background !== 'none' && background.length <= 16384) {
                for (const match of background.matchAll(
                    /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/g,
                ))
                    add(
                        resolve((match[1] ?? match[2] ?? match[3]).trim()),
                        '',
                        '',
                        alt,
                        'background',
                    );
            }
            if (truncated) break;
        }
    }
    return { images, truncated };
}
