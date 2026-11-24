import fs from 'node:fs/promises';
import { projectPath, runtimePath } from '../lib/project.mjs';

export async function copyRuntimeAssets() {
    await fs.copyFile(projectPath('LICENCE'), runtimePath('LICENCE'));
    for (const file of ['manifest.json', 'popup.html', 'history.html', 'index.html']) {
        await fs.copyFile(projectPath('src', file), runtimePath(file));
    }
    await fs.cp(projectPath('src/icons'), runtimePath('icons'), { recursive: true });
}

export async function removeObsoleteBundles() {
    for (const filename of [
        'auto-watch.js',
        'media-runtime.js',
        'media-observer.js',
        'hls-converter.js',
        'THIRD_PARTY_NOTICES.md',
    ]) {
        await fs.rm(runtimePath(filename), { force: true });
    }
}
