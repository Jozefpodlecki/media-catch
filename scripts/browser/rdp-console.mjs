export async function connectBrowserConsole(port) {
    const { default: FirefoxRDPClient } = await import(
        new URL('./lib/firefox/rdp-client.js', import.meta.resolve('web-ext'))
    );
    class PermissionClient extends FirefoxRDPClient {
        _handleMessage(packet) {
            if (packet.type === 'evaluationResult') this.emit('evaluationResult', packet);
            else super._handleMessage(packet);
        }
    }
    const client = new PermissionClient();

    try {
        await client.connect(port);
        const descriptor = await client.request({ to: 'root', type: 'getProcess', id: 0 });
        if (!descriptor.processDescriptor?.actor)
            throw new Error('The browser did not expose its development process descriptor.');
        const target = await client.request({
            to: descriptor.processDescriptor.actor,
            type: 'getTarget',
        });
        const consoleActor = target.process?.consoleActor;
        if (!consoleActor) throw new Error('The browser did not expose its development console.');
        return { client, consoleActor };
    } catch (error) {
        client.disconnect();
        throw error;
    }
}

export async function evaluateBrowserTask(
    { client, consoleActor },
    task,
    payload,
    { timeoutMs = 15000 } = {},
) {
    let rejectEvaluation;
    const onError = (error) => rejectEvaluation?.(error);
    client.on('error', onError);
    const text = '(' + task.toString() + ')(' + JSON.stringify(payload) + ')';
    let timeout;
    let resultID;
    const earlyResults = [];
    let finish;
    const resultPromise = new Promise((resolve, reject) => {
        rejectEvaluation = reject;
        finish = (packet) => {
            if (packet.from !== consoleActor) return;
            if (!resultID) {
                earlyResults.push(packet);
                return;
            }
            if (packet.resultID !== resultID) return;
            if (packet.exception || packet.exceptionMessage || packet.topLevelAwaitRejected)
                reject(
                    new Error(
                        `The browser could not apply the requested add-on permissions: ${typeof packet.exceptionMessage === 'string' ? packet.exceptionMessage : 'browser evaluation failed'}`,
                    ),
                );
            else resolve(packet.result);
        };
        client.on('evaluationResult', finish);
        timeout = setTimeout(
            () => reject(new Error('Timed out applying development add-on permissions.')),
            timeoutMs,
        );
    });
    try {
        const initiation = Promise.resolve()
            .then(() =>
                client.request({
                    to: consoleActor,
                    type: 'evaluateJSAsync',
                    text,
                    mapped: { await: true },
                }),
            )
            .then((response) => {
                resultID = response.resultID;
                for (const packet of earlyResults) finish(packet);
                return resultPromise;
            });
        return await Promise.race([initiation, resultPromise]);
    } finally {
        clearTimeout(timeout);
        client.removeListener('evaluationResult', finish);
        client.removeListener('error', onError);
    }
}
