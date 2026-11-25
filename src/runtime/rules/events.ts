import type { RuleEvent } from '../../shared/rules';
const listeners = new Set<(event: RuleEvent) => void>();
export function subscribeRuleEvents(listener: (event: RuleEvent) => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}
export function publishRuleEvent(event: RuleEvent) {
    for (const listener of listeners) listener(event);
}
