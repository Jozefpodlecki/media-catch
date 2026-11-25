import type { CommandOf } from '../../shared/messages';
import { armRules, disarmRules, rulesState, ruleRepository, disarmOriginRules } from './engine';

export async function handleRulesCommand(
    message: CommandOf<
        'rules-get' | 'rules-save' | 'rules-remove' | 'rules-arm' | 'rules-disarm' | 'rules-state'
    >,
) {
    switch (message.action) {
        case 'rules-get':
            return { ok: true, document: await ruleRepository().get() };
        case 'rules-save': {
            const document = await ruleRepository().save(message.origin, message.rule);
            disarmOriginRules(message.origin);
            return { ok: true, document };
        }
        case 'rules-remove': {
            const document = await ruleRepository().remove(message.origin, message.id);
            disarmOriginRules(message.origin);
            return { ok: true, document };
        }
        case 'rules-arm':
            return armRules(message.tabId, message.preview);
        case 'rules-disarm':
            return disarmRules(message.tabId);
        case 'rules-state':
            return rulesState(message.tabId);
    }
}
