import fs from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { build } from 'esbuild';
import { projectRoot, projectPath, runtimePath, toolingPath } from '../lib/project.mjs';

function runNodeScript(script, args, failure) {
    const result = spawnSync(process.execPath, [projectPath(script), ...args], {
        cwd: projectRoot,
        stdio: 'inherit',
    });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(failure);
}

export function typecheck() {
    runNodeScript('node_modules/typescript/bin/tsc', ['--noEmit'], 'TypeScript checking failed');
}

export async function compileRuntime() {
    await build({
        entryPoints: [projectPath('src/background.ts')],
        outfile: runtimePath('background.js'),
        bundle: true,
        format: 'iife',
        target: 'firefox140',
        logOverride: { 'empty-import-meta': 'silent' },
    });
    await build({
        entryPoints: [projectPath('src/ui/main.tsx')],
        outfile: runtimePath('ui.js'),
        bundle: true,
        format: 'iife',
        target: 'firefox140',
        minify: true,
        define: { 'process.env.NODE_ENV': '"production"' },
    });
    runNodeScript(
        'node_modules/@tailwindcss/cli/dist/index.mjs',
        ['-i', projectPath('src/ui/styles.css'), '-o', runtimePath('ui.css'), '--minify'],
        'Tailwind compilation failed',
    );
}

export async function compileDevelopmentAssets() {
    await fs.mkdir(toolingPath(), { recursive: true });
    await build({
        entryPoints: [projectPath('src/hls/playlist.ts')],
        outfile: toolingPath('playlist.mjs'),
        bundle: true,
        format: 'esm',
        platform: 'node',
        target: 'node20',
    });
    await build({
        stdin: {
            contents: `export { blobReducer, initialBlobState } from './src/ui/state/blobs';
export { mediaReducer, initialMediaState } from './src/ui/state/media';
export { historyReducer, initialHistoryState } from './src/ui/state/history';
export { sourceReducer } from './src/ui/state/source';
export { taskReducer, initialTaskState } from './src/ui/state/tasks';
export { applicationReducer } from './src/ui/state/application';
export { applySettingsChange, createSettingsDocument, siteKeyForUrl, settingsForSite, parseSettingsDocument, validateSettingsPatch, settingsStorageKey, maximumSavedSites } from './src/shared/settings';
export { createSettingsRepository } from './src/runtime/settings/repository';
export { preferencesReducer, createPreferencesState } from './src/ui/state/preferences';
export { describePage, initialViewForPage } from './src/ui/app/page';
export { createRequestScope } from './src/ui/services/request-scope';
export { extractImagePatterns } from './src/shared/image-patterns';
export { imageUrl, transformImageUrl } from './src/shared/images';
export { imagesReducer, initialImagesState, imageTarget, imageDraftUrl } from './src/ui/state/images';
export { scanPageImages } from './src/injected/images';`,
            resolveDir: projectRoot,
            loader: 'ts',
        },
        outfile: toolingPath('ui-state.mjs'),
        bundle: true,
        format: 'esm',
        platform: 'node',
        target: 'node20',
    });
    await build({
        stdin: {
            contents: `export { configureBlobBridge } from './src/injected/blob-bridge';
export { configureBlobHook } from './src/injected/blob-hook';
export { inspectBlobHook, testBlobHook } from './src/injected/blob-diagnostics';`,
            resolveDir: projectRoot,
            loader: 'ts',
        },
        outfile: toolingPath('injected.js'),
        bundle: true,
        format: 'iife',
        globalName: 'Injected',
        target: 'firefox140',
    });
    await build({
        entryPoints: [projectPath('examples/react-preview.ts')],
        outfile: toolingPath('react-preview.js'),
        bundle: true,
        format: 'iife',
        target: 'firefox140',
    });
}
