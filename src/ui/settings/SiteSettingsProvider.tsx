import { useCallback, useEffect, useMemo, useReducer, useRef, type ReactNode } from 'react';
import { requiredContext } from '../context';
import { useSource } from '../app/SourceProvider';
import { command } from '../api';
import { errorMessage } from '../../shared/errors';
import {
    parseSettingsDocument,
    settingsForSite,
    settingsStorageKey,
    type SettingsChange,
    type SiteSettings,
    type SettingsDocument,
} from '../../shared/settings';
import { createPreferencesState, preferencesReducer } from '../state/preferences';
import { useRequestScope } from '../services/hooks';

interface SettingsStatus {
    document: SettingsDocument;
    loaded: boolean;
    saving: boolean;
    error: string;
}
interface SettingsActions {
    setMinimum(value: number): void;
    setPattern(value: string): void;
    reset(): void;
    updateSite(siteKey: string, patch: Partial<SiteSettings>): void;
    updateDefaults(patch: Partial<SiteSettings>): void;
    forgetSite(siteKey: string): void;
    forgetAll(): void;
    retry(): void;
}
const [ValuesProvider, useSiteSettings] = requiredContext<SiteSettings>('Site settings');
const [StatusProvider, useSettingsStatus] = requiredContext<SettingsStatus>('Settings status');
const [ActionsProvider, useSiteSettingsActions] =
    requiredContext<SettingsActions>('Site settings actions');
export { useSiteSettings, useSettingsStatus, useSiteSettingsActions };

export function SiteSettingsProvider({ children }: { children: ReactNode }) {
    const { siteKey } = useSource();
    const [state, dispatch] = useReducer(preferencesReducer, undefined, createPreferencesState);
    const sequence = useRef(0);
    const requests = useRequestScope();
    const load = useCallback(async () => {
        try {
            await requests.read(
                'settings',
                () => command('settings-get'),
                (result) => dispatch({ type: 'received', settings: result.settings }),
            );
        } catch (error) {
            if (requests.active) dispatch({ type: 'loadFailed', error: errorMessage(error) });
        }
    }, [requests]);
    useEffect(() => {
        const changed = (changes: Record<string, browser.storage.StorageChange>, area: string) => {
            if (area !== 'local' || !Object.hasOwn(changes, settingsStorageKey)) return;
            requests.invalidate('settings');
            try {
                dispatch({
                    type: 'received',
                    settings: parseSettingsDocument(changes[settingsStorageKey].newValue),
                    reset: changes[settingsStorageKey].newValue === undefined,
                });
            } catch (error) {
                dispatch({ type: 'loadFailed', error: errorMessage(error) });
            }
        };
        browser.storage.onChanged.addListener(changed);
        void load();
        return () => browser.storage.onChanged.removeListener(changed);
    }, [load, requests]);
    const persist = useCallback(
        async (change: SettingsChange) => {
            const id = ++sequence.current;
            dispatch({ type: 'queued', id, change });
            try {
                const result =
                    change.type === 'siteUpdated'
                        ? await command('settings-update', {
                              siteKey: change.siteKey,
                              patch: change.patch,
                          })
                        : change.type === 'siteReset'
                          ? await command('settings-reset', { siteKey: change.siteKey })
                          : change.type === 'defaultsUpdated'
                            ? await command('settings-defaults', { patch: change.patch })
                            : await command('settings-clear');
                if (requests.active) dispatch({ type: 'saved', id, settings: result.settings });
            } catch (error) {
                if (requests.active) dispatch({ type: 'failed', id, error: errorMessage(error) });
            }
        },
        [requests],
    );
    const value = useMemo(() => settingsForSite(state.config, siteKey), [state.config, siteKey]);
    const status = useMemo(
        () => ({
            document: state.config,
            loaded: state.loaded,
            saving: state.pending.length > 0,
            error: state.error,
        }),
        [state],
    );
    const actions = useMemo<SettingsActions>(
        () => ({
            setMinimum(value) {
                if (siteKey)
                    void persist({
                        type: 'siteUpdated',
                        siteKey,
                        patch: { captureMinimumMiB: value },
                    });
            },
            setPattern(value) {
                if (siteKey)
                    void persist({
                        type: 'siteUpdated',
                        siteKey,
                        patch: { requestPattern: value },
                    });
            },
            reset() {
                if (siteKey) void persist({ type: 'siteReset', siteKey });
            },
            updateSite: (siteKey, patch) => {
                void persist({ type: 'siteUpdated', siteKey, patch });
            },
            updateDefaults: (patch) => {
                void persist({ type: 'defaultsUpdated', patch });
            },
            forgetSite: (siteKey) => {
                void persist({ type: 'siteReset', siteKey });
            },
            forgetAll: () => {
                void persist({ type: 'sitesCleared' });
            },
            retry: () => {
                void load();
            },
        }),
        [siteKey, persist, load],
    );
    return (
        <ValuesProvider value={value}>
            <StatusProvider value={status}>
                <ActionsProvider value={actions}>{children}</ActionsProvider>
            </StatusProvider>
        </ValuesProvider>
    );
}
