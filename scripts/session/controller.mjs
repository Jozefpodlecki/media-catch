import { readJson, releaseSession } from './store.mjs';

export function createSessionController(ownership) {
    let runner;
    let stopping = false;
    let releasePromise;
    let resolveDone;
    const done = new Promise((resolve) => {
        resolveDone = resolve;
    });
    const report = (error) => console.error(error.message);
    const release = () => {
        if (releasePromise) return releasePromise;
        clearInterval(timer);
        releasePromise = releaseSession(ownership).then(resolveDone);
        return releasePromise;
    };
    const stop = async () => {
        if (stopping) return;
        stopping = true;
        if (runner) await runner.exit();
    };
    const onSignal = () => {
        stop().catch(report);
    };
    process.on('SIGINT', onSignal);
    process.on('SIGTERM', onSignal);
    const timer = setInterval(async () => {
        try {
            const request = await readJson(ownership.stopFile);
            if (request?.token === ownership.token) await stop();
        } catch (error) {
            report(error);
        }
    }, 500);
    return {
        done,
        get stopping() {
            return stopping;
        },
        async attach(ownedRunner) {
            runner = ownedRunner;
            runner.registerCleanup(() => {
                release().catch(report);
            });
            if (stopping) await runner.exit();
        },
        async close() {
            process.removeListener('SIGINT', onSignal);
            process.removeListener('SIGTERM', onSignal);
            try {
                if (runner && !releasePromise && !stopping) await stop();
            } finally {
                await release();
            }
        },
    };
}
