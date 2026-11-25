import type { RulesDocument, RulesRuntimeState, SiteRule } from '../../shared/rules';
export const newRule = (): SiteRule => ({
    id: '',
    name: '',
    enabled: true,
    trigger: 'dom',
    match: 'contains',
    pattern: '.m3u8',
    action: 'auto',
});
export interface RulesState {
    document: RulesDocument;
    draft: SiteRule;
    loaded: boolean;
    error: string;
    runtime: RulesRuntimeState;
}
export const initialRulesState: RulesState = {
    document: { version: 1, revision: 0, sites: {} },
    draft: newRule(),
    loaded: false,
    error: '',
    runtime: { armed: false, preview: true, origin: '', actions: 0, pending: 0, log: [] },
};
export type RulesAction =
    | { type: 'received'; document: RulesDocument; reset?: boolean }
    | { type: 'runtime'; runtime: RulesRuntimeState }
    | { type: 'edit'; rule: SiteRule }
    | { type: 'draft'; patch: Partial<SiteRule> }
    | { type: 'new' }
    | { type: 'failed'; error: string }
    | { type: 'saved'; document: RulesDocument; rule?: SiteRule };
export function rulesReducer(state: RulesState, action: RulesAction): RulesState {
    switch (action.type) {
        case 'received':
            return {
                ...state,
                document:
                    action.reset || action.document.revision >= state.document.revision
                        ? action.document
                        : state.document,
                loaded: true,
                error: '',
            };
        case 'runtime':
            return { ...state, runtime: action.runtime };
        case 'edit':
            return { ...state, draft: { ...action.rule } };
        case 'draft':
            return { ...state, draft: { ...state.draft, ...action.patch } };
        case 'new':
            return { ...state, draft: newRule() };
        case 'failed':
            return { ...state, error: action.error };
        case 'saved':
            return {
                ...state,
                document:
                    action.document.revision >= state.document.revision
                        ? action.document
                        : state.document,
                draft: action.rule ? { ...action.rule } : newRule(),
                runtime: { ...state.runtime, armed: false },
                loaded: true,
                error: '',
            };
    }
}
