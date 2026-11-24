import path from 'node:path';
import { projectRoot } from '../lib/project.mjs';
export function runOptions(browser, profile) {
    return {
        sourceDir: path.join(projectRoot, 'extension'),
        artifactsDir: path.join(projectRoot, 'dist'),
        firefox: path.resolve(browser),
        firefoxProfile: path.resolve(profile),
        keepProfileChanges: false,
        noInput: true,
        startUrl: ['about:addons'],
        ignoreFiles: [],
        args: [],
    };
}
