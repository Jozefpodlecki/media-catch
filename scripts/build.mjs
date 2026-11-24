import fs from 'node:fs/promises';
import { runtimePath } from './lib/project.mjs';
import { typecheck, compileRuntime, compileDevelopmentAssets } from './build/compiler.mjs';
import { copyRuntimeAssets, removeObsoleteBundles } from './build/assets.mjs';
import { copyVendorAssets } from './build/vendor.mjs';

typecheck();
await fs.mkdir(runtimePath(), { recursive: true });
await compileRuntime();
await copyRuntimeAssets();
await copyVendorAssets();
await removeObsoleteBundles();
await compileDevelopmentAssets();
console.log('Compiled extension:', runtimePath());
