import {
    applySettingsChange,
    parseSettingsDocument,
    settingsStorageKey,
    type SettingsChange,
    type SettingsDocument,
} from '../../shared/settings';

export interface SettingsStorage {
    get(key: string): Promise<Record<string, unknown>>;
    set(values: Record<string, unknown>): Promise<unknown>;
}
export function createSettingsRepository(storage: SettingsStorage) {
    let writes: Promise<unknown> = Promise.resolve();
    const read = async () =>
        parseSettingsDocument((await storage.get(settingsStorageKey))[settingsStorageKey]);
    return {
        async get(): Promise<SettingsDocument> {
            await writes;
            return read();
        },
        update(change: SettingsChange): Promise<SettingsDocument> {
            const pending = writes.then(async () => {
                const previous = await read();
                const next = applySettingsChange(previous, change);
                if (JSON.stringify(next) === JSON.stringify(previous)) return previous;
                if (previous.revision === Number.MAX_SAFE_INTEGER)
                    throw new Error('Settings revision limit reached.');
                const document = { ...next, revision: previous.revision + 1 };
                await storage.set({ [settingsStorageKey]: document });
                return document;
            });
            writes = pending.catch(() => {});
            return pending;
        },
    };
}
