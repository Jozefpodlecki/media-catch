import fs from 'node:fs/promises';
import path from 'node:path';
import { projectPath, runtimePath } from '../lib/project.mjs';

const packages = [
    ['react', 'react'],
    ['react-dom', 'react-dom'],
    ['tailwindcss', 'tailwindcss'],
    ['@ffmpeg/ffmpeg', 'ffmpeg-wrapper'],
    ['@ffmpeg/core', 'ffmpeg-core'],
];

async function copyAvailablePackageLicense(packageName, label) {
    for (const filename of ['LICENSE', 'LICENSE.txt']) {
        try {
            await fs.copyFile(
                projectPath('node_modules', packageName, filename),
                runtimePath('vendor', `${label}-LICENSE.txt`),
            );
            return true;
        } catch (error) {
            if (error.code !== 'ENOENT') throw error;
        }
    }
    return false;
}

async function removeTypeArtifacts(directory) {
    for (const item of await fs.readdir(directory, { withFileTypes: true })) {
        const filename = path.resolve(directory, item.name);
        if (!filename.startsWith(path.resolve(runtimePath()) + path.sep) || item.isSymbolicLink()) {
            throw new Error('Unexpected generated asset path');
        }
        if (item.isDirectory()) await removeTypeArtifacts(filename);
        else if (/\.(?:ts|map)$/.test(filename)) await fs.unlink(filename);
    }
}

async function restrictWorkerImport() {
    const workerFile = runtimePath('vendor/ffmpeg/worker.js');
    const worker = await fs.readFile(workerFile, 'utf8');
    const dynamicCoreImport = /import\(\s*\/\* @vite-ignore \*\/ _coreURL\)/g;
    if ([...worker.matchAll(dynamicCoreImport)].length !== 1) {
        throw new Error(
            'Review the pinned FFmpeg worker import patch before updating this dependency.',
        );
    }
    await fs.writeFile(
        workerFile,
        worker.replace(dynamicCoreImport, 'import("../core/ffmpeg-core.js")'),
    );
}

export async function copyVendorAssets() {
    await fs.cp(projectPath('node_modules/@ffmpeg/ffmpeg/dist/esm'), runtimePath('vendor/ffmpeg'), {
        recursive: true,
        filter: (filename) => !/\.(?:ts|map)$/.test(filename),
    });
    await fs.cp(projectPath('node_modules/@ffmpeg/core/dist/esm'), runtimePath('vendor/core'), {
        recursive: true,
    });
    await restrictWorkerImport();
    await removeTypeArtifacts(runtimePath('vendor'));
    await fs.copyFile(
        projectPath('docs/third-party-notices.md'),
        runtimePath('third-party-notices.md'),
    );
    await fs.copyFile(
        projectPath('licenses/ffmpeg-core-GPL-2.0.txt'),
        runtimePath('vendor/ffmpeg-core-GPL-2.0.txt'),
    );
    for (const [packageName, label] of packages)
        await copyAvailablePackageLicense(packageName, label);
}
