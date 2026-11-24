import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
export async function readJson(filename) {
    try {
        return JSON.parse(await fs.readFile(filename, 'utf8'));
    } catch (error) {
        if (error.code === 'ENOENT') return null;
        throw error;
    }
}

export function isProcessAlive(pid) {
    if (!Number.isInteger(pid) || pid <= 0) return false;
    try {
        process.kill(pid, 0);
        return true;
    } catch (error) {
        return error.code === 'EPERM';
    }
}

export function sessionFiles(directory) {
    return {
        stateFile: path.join(directory, 'session.json'),
        stopFile: path.join(directory, 'stop.json'),
    };
}
export async function claimSession(directory) {
    await fs.mkdir(directory, { recursive: true });
    const { stateFile, stopFile } = sessionFiles(directory);
    const previous = await readJson(stateFile);
    if (previous && isProcessAlive(previous.pid))
        throw new Error('A session is already active. Run Remove-Extension.ps1 first.');
    if (previous) await fs.unlink(stateFile);
    const token = randomUUID();
    await fs.writeFile(stateFile, JSON.stringify({ pid: process.pid, token }), { flag: 'wx' });
    return { stateFile, stopFile, token };
}
export async function releaseSession({ stateFile, stopFile, token }) {
    for (const filename of [stateFile, stopFile])
        if ((await readJson(filename))?.token === token) await fs.unlink(filename);
}
