import path from 'node:path';
import { build } from 'esbuild';
import { projectRoot } from '../lib/project.mjs';

export async function buildRuntimeFixture(directory) {
    await build({
        stdin: {
            contents: `import './src/background';
export { startBlobWatch, stopBlobWatch, inspectBlobWatch, testWatchedHooks } from './src/auto-watch';
export { getAttemptHistory } from './src/runtime/history';
export { scanImages, startImageBatch, imageBatchState, stopImageBatch } from './src/runtime/images';
export { transformImageUrl } from './src/shared/images';
export { toggleElementWatch, startNetworkWatch } from './src/runtime/media/monitoring';
export { getMediaState } from './src/media-runtime';
export { startConversion, cancelConversion, conversionState } from './src/runtime/media/conversion';`,
            resolveDir: projectRoot,
            loader: 'ts',
        },
        outfile: path.join(directory, 'background.js'),
        bundle: true,
        format: 'iife',
        globalName: 'TestRuntime',
        target: 'firefox140',
        logOverride: { 'empty-import-meta': 'silent' },
    });
}
