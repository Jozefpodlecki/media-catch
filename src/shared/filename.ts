export function safeFilename(input: unknown, type: string) {
    const extensions: Record<string, string> = {
        'text/plain': 'txt',
        'text/html': 'html',
        'application/json': 'json',
        'application/pdf': 'pdf',
        'image/png': 'png',
        'image/jpeg': 'jpg',
        'image/webp': 'webp',
        'image/gif': 'gif',
        'video/mp4': 'mp4',
        'video/webm': 'webm',
        'audio/mpeg': 'mp3',
        'audio/ogg': 'ogg',
    };
    const filename = String(input || '')
        .split(/[\\/]/)
        .pop()!
        .replace(/[<>:"|?*\x00-\x1f\x7f]/g, '_')
        .replace(/^[. ]+|[. ]+$/g, '')
        .slice(0, 180);
    if (filename && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(filename))
        return filename;
    return `blob-download.${extensions[type.split(';')[0]] || 'bin'}`;
}
