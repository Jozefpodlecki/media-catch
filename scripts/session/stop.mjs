import fs from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { projectPath } from '../lib/project.mjs';
import { readJson, isProcessAlive, sessionFiles } from './store.mjs';
const sessionDir = projectPath('.dev-session');
export async function stopSession(dryRun = false, directory = sessionDir) {
    const { stateFile, stopFile } = sessionFiles(directory);
    const state = await readJson(stateFile);
    if (!state || !isProcessAlive(state.pid)) {
        console.log('No active extension development session.');
        return;
    }
    if (dryRun) {
        console.log("Would request that this project's development session close its browser.");
        return;
    }
    await fs.writeFile(stopFile, JSON.stringify({ token: state.token }));
    for (let attempt = 0; attempt < 120; attempt++) {
        const current = await readJson(stateFile);
        if (!current || current.token !== state.token || !isProcessAlive(state.pid)) {
            console.log('Development session stopped; its temporary extension is removed.');
            return;
        }
        await delay(500);
    }
    throw new Error(
        'The session has not stopped yet. Close its development browser or press Ctrl+C in its terminal. No unrelated browser process was targeted.',
    );
}
