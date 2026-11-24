export function inspectBlobHook() {
    return (
        globalThis.__blobDownloaderHook?.diagnostics?.() || {
            attached: false,
            counters: {},
            lastSize: null,
        }
    );
}

export function testBlobHook() {
    const hook = globalThis.__blobDownloaderHook;
    const before = hook?.diagnostics?.();
    if (!before?.attached)
        return {
            ok: false,
            error: 'The hook is missing or the page replaced it. Stop and restart watching.',
        };
    const url = URL.createObjectURL(new Blob([]));
    URL.revokeObjectURL(url);
    const after = hook!.diagnostics();
    return { ok: after.attached && after.counters.calls > before.counters.calls };
}
