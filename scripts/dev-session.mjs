import { isMainModule, reportFailure } from './lib/project.mjs';
import { runOptions } from './session/options.mjs';
import { startSession } from './session/start.mjs';
import { stopSession } from './session/stop.mjs';
export { runOptions, startSession, stopSession };
export async function main(argv) {
    const [command, ...args] = argv;
    const dryRun = args.includes('--dry-run');
    if (command === 'stop') return stopSession(dryRun);
    if (command !== 'start') throw new Error('Use start or stop.');
    const option = (name) => {
        const index = args.indexOf(name);
        if (index < 0 || !args[index + 1] || args[index + 1].startsWith('--'))
            throw new Error(`Missing ${name}.`);
        return args[index + 1];
    };
    return startSession(runOptions(option('--browser'), option('--profile')), dryRun);
}

if (isMainModule(import.meta.url)) main(process.argv.slice(2)).catch(reportFailure);
