import { FFmpeg } from '/vendor/ffmpeg/index.js';
import { collectHls, parsePlaylist } from '/fixtures/playlist.js';

const status = document.getElementById('status');
const playlist = document.getElementById('playlist');
const video = document.getElementById('video');
let currentBlob;
let busy = false;
const progress = (message) => {
    status.textContent = message;
};

async function withEngine(operation) {
    if (busy) throw new Error('Fixture already running.');
    busy = true;
    document.querySelectorAll('button').forEach((button) => {
        button.disabled = true;
    });
    const engine = new FFmpeg();
    const timeout = setTimeout(() => engine.terminate(), 120000);
    try {
        await engine.load({
            classWorkerURL: '/vendor/ffmpeg/worker.js',
            coreURL: new URL('/vendor/core/ffmpeg-core.js', location.href).href,
            wasmURL: new URL('/vendor/core/ffmpeg-core.wasm', location.href).href,
        });
        return await operation(engine);
    } finally {
        clearTimeout(timeout);
        engine.terminate();
        busy = false;
        document.querySelectorAll('button').forEach((button) => {
            button.disabled = false;
        });
    }
}

async function generate() {
    return withEngine(async (engine) => {
        progress('Generating local HLS…');
        const code = await engine.exec([
            '-f',
            'lavfi',
            '-i',
            'testsrc=size=160x90:rate=10',
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
        if (code) throw new Error('Local HLS generation failed.');
        for (const file of await engine.listDir('/')) {
            if (file.name === 'fixture.m3u8' || /^segment-\d+\.ts$/.test(file.name)) {
                const response = await fetch('/asset/' + file.name, {
                    method: 'POST',
                    body: await engine.readFile(file.name),
                });
                if (!response.ok) throw new Error('Fixture asset upload failed.');
            }
        }
        playlist.value = '/fixture.m3u8';
        progress('Local HLS ready. Enable watches, then fetch HLS.');
    });
}

async function run() {
    return withEngine(async (engine) => {
        const url = new URL(playlist.value, location.href).href;
        const source = document.createElement('source');
        source.type = 'application/vnd.apple.mpegurl';
        source.src = url;
        video.removeAttribute('src');
        video.replaceChildren(source);
        let total = 0;
        const assets = await collectHls(
            url,
            0,
            async (remote, range) => {
                const response = await fetch(remote, {
                    headers: range ? { Range: range } : {},
                    signal: AbortSignal.timeout(30000),
                });
                if (!response.ok) throw new Error(`HTTP ${response.status}: ${remote}`);
                if (range && response.status !== 206) throw new Error('Server ignored byte range.');
                const chunks = [];
                const reader = response.body.getReader();
                try {
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        total += value.byteLength;
                        if (total > 64 * 1024 * 1024)
                            throw new Error('Fixture input exceeds 64 MiB.');
                        chunks.push(value);
                    }
                } finally {
                    await reader.cancel();
                }
                let data = new Uint8Array(await new Blob(chunks).arrayBuffer());
                if (
                    new URL(remote).hostname === 'test-streams.mux.dev' &&
                    /\.m3u8$/.test(new URL(remote).pathname)
                ) {
                    const parsed = parsePlaylist(new TextDecoder().decode(data), response.url);
                    if (parsed.variants.length) {
                        data = new TextEncoder().encode(
                            '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\n' + parsed.variants.at(-1).url,
                        );
                    } else {
                        const lines = [];
                        let segments = 0;
                        for (const line of parsed.text.split(/\r?\n/)) {
                            if (line.trim() === '#EXT-X-ENDLIST') break;
                            lines.push(line);
                            if (line.trim() && !line.startsWith('#') && ++segments === 2) break;
                        }
                        data = new TextEncoder().encode(lines.join('\n') + '\n#EXT-X-ENDLIST\n');
                    }
                }
                return { data, url: response.url };
            },
            progress,
        );
        for (const file of assets.files) await engine.writeFile(file.name, file.data);
        progress('Remuxing downloaded HLS…');
        const args = [
            '-protocol_whitelist',
            'file',
            '-allowed_extensions',
            'ALL',
            '-i',
            assets.video,
        ];
        if (assets.audio) args.push('-i', assets.audio, '-map', '0:v:0', '-map', '1:a:0');
        args.push('-c', 'copy', '-movflags', '+faststart', 'output.mp4');
        if (await engine.exec(args)) throw new Error('Fixture remux failed.');
        const bytes = await engine.readFile('output.mp4');
        if (bytes.byteLength > 64 * 1024 * 1024) throw new Error('Fixture output exceeds 64 MiB.');
        const previous = currentBlob;
        currentBlob = URL.createObjectURL(new Blob([bytes], { type: 'video/mp4' }));
        source.type = 'video/mp4';
        source.src = currentBlob;
        video.src = currentBlob;
        video.load();
        if (previous) URL.revokeObjectURL(previous);
        const result = { url: currentBlob, bytes: bytes.byteLength, fetchedBytes: total };
        progress(JSON.stringify(result, null, 2));
        return result;
    });
}

const showError = (error) => {
    progress('Failed: ' + error.message);
};
document.getElementById('generate').onclick = () => generate().catch(showError);
document.getElementById('run').onclick = () => run().catch(showError);
document.getElementById('public').onclick = () => {
    playlist.value = 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8';
    progress(
        'Public Mux Big Buck Bunny selected: lowest quality, first two segments. Requires internet/CORS; the 64 MiB limit still applies.',
    );
};
window.fixture = { generate, run };
window.addEventListener('pagehide', () => {
    if (currentBlob) URL.revokeObjectURL(currentBlob);
});
