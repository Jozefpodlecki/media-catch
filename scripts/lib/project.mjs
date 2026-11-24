import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
export const projectPath = (...parts) => path.join(projectRoot, ...parts);
export const runtimePath = (...parts) => projectPath('extension', ...parts);
export const toolingPath = (...parts) => projectPath('.build', ...parts);

export function isMainModule(moduleUrl) {
    return Boolean(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(moduleUrl);
}

export function reportFailure(error) {
    console.error(error.message);
    process.exitCode = 1;
}
