import type { CommandOf } from '../../shared/messages';
import { createSettingsRepository } from './repository';

export type SettingsCommand = CommandOf<
    'settings-get' | 'settings-update' | 'settings-reset' | 'settings-defaults' | 'settings-clear'
>;
let repository: ReturnType<typeof createSettingsRepository> | undefined;

export async function handleSettingsCommand(message: SettingsCommand) {
    repository ??= createSettingsRepository(browser.storage.local);
    const settings =
        message.action === 'settings-get'
            ? await repository.get()
            : await repository.update(
                  message.action === 'settings-update'
                      ? { type: 'siteUpdated', siteKey: message.siteKey, patch: message.patch }
                      : message.action === 'settings-reset'
                        ? { type: 'siteReset', siteKey: message.siteKey }
                        : message.action === 'settings-defaults'
                          ? { type: 'defaultsUpdated', patch: message.patch }
                          : { type: 'sitesCleared' },
              );
    return { ok: true, settings };
}
