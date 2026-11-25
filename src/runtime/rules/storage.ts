import {
    parseRulesDocument,
    rulesStorageKey,
    validateRule,
    maximumSiteRules,
    type SiteRule,
} from '../../shared/rules';
import { validateSiteKey } from '../../shared/settings';
import type { SettingsStorage } from '../settings/repository';

export function createRulesRepository(storage: SettingsStorage) {
    let writes: Promise<unknown> = Promise.resolve();
    const read = async () =>
        parseRulesDocument((await storage.get(rulesStorageKey))[rulesStorageKey]);
    return {
        async get() {
            await writes;
            return read();
        },
        save(origin: string, rule: SiteRule) {
            const key = validateSiteKey(origin);
            const clean = validateRule(rule);
            const pending = writes.then(async () => {
                const previous = await read();
                const rules = [...(previous.sites[key] || [])];
                const index = rules.findIndex((item) => item.id === clean.id);
                if (index >= 0) rules[index] = clean;
                else rules.push(clean);
                if (rules.length > maximumSiteRules)
                    throw new Error('Up to 10 rules can be saved per website.');
                const next = parseRulesDocument({
                    ...previous,
                    revision: previous.revision + 1,
                    sites: { ...previous.sites, [key]: rules },
                });
                await storage.set({ [rulesStorageKey]: next });
                return next;
            });
            writes = pending.catch(() => {});
            return pending;
        },
        remove(origin: string, id: string) {
            const key = validateSiteKey(origin);
            const pending = writes.then(async () => {
                const previous = await read();
                const sites = {
                    ...previous.sites,
                    [key]: (previous.sites[key] || []).filter((rule) => rule.id !== id),
                };
                if (!sites[key].length) delete sites[key];
                const next = parseRulesDocument({
                    ...previous,
                    revision: previous.revision + 1,
                    sites,
                });
                await storage.set({ [rulesStorageKey]: next });
                return next;
            });
            writes = pending.catch(() => {});
            return pending;
        },
    };
}
