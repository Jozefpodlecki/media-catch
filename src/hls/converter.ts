import { FFmpeg } from '@ffmpeg/ffmpeg';
import { collectHls, parsePlaylist, mediaUrl, type Asset } from './playlist';
export { collectHls, parsePlaylist, mediaUrl };
export async function remux(
    files: Asset[],
    video: string,
    audio: string | undefined,
    signal: AbortSignal,
    progress: (message: string) => void,
): Promise<Blob> {
    const ffmpeg = new FFmpeg();
    const logs: string[] = [];
    ffmpeg.on('log', (event) => {
        logs.push(event.message);
        if (logs.length > 8) logs.shift();
    });
    ffmpeg.on('progress', (event) =>
        progress(`Remuxing MP4… ${Math.min(99, Math.max(0, Math.round(event.progress * 100)))}%`),
    );
    const abort = () => ffmpeg.terminate();
    signal.addEventListener('abort', abort, { once: true });
    try {
        signal.throwIfAborted();
        progress('Loading local FFmpeg engine…');
        await ffmpeg.load(
            {
                classWorkerURL: browser.runtime.getURL('vendor/ffmpeg/worker.js'),
                coreURL: browser.runtime.getURL('vendor/core/ffmpeg-core.js'),
                wasmURL: browser.runtime.getURL('vendor/core/ffmpeg-core.wasm'),
            },
            { signal },
        );
        for (const file of files) {
            signal.throwIfAborted();
            await ffmpeg.writeFile(file.name, file.data, { signal });
        }
        const args = video.endsWith('.m3u8')
            ? ['-protocol_whitelist', 'file,crypto,data', '-allowed_extensions', 'ALL', '-i', video]
            : ['-i', video];
        if (audio)
            args.push(
                '-protocol_whitelist',
                'file,crypto,data',
                '-allowed_extensions',
                'ALL',
                '-i',
                audio,
                '-map',
                '0:v:0',
                '-map',
                '1:a:0',
            );
        else args.push('-map', '0:v:0?', '-map', '0:a:0?');
        args.push('-c', 'copy', '-movflags', '+faststart', 'output.mp4');
        if ((await ffmpeg.exec(args, 120000, { signal })) !== 0)
            throw new Error(
                'MP4 remux failed. The codecs or media layout may be unsupported. ' +
                    logs.slice(-3).join(' ').slice(0, 700),
            );
        const bytes = await ffmpeg.readFile('output.mp4', 'binary', { signal });
        if (typeof bytes === 'string' || bytes.byteLength > 64 * 1024 * 1024 || !bytes.byteLength)
            throw new Error('MP4 output is empty or exceeds 64 MiB.');
        return new Blob([new Uint8Array(bytes)], { type: 'video/mp4' });
    } finally {
        signal.removeEventListener('abort', abort);
        ffmpeg.terminate();
    }
}
