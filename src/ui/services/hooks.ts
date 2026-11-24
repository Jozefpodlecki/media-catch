import { useEffect, useMemo } from 'react';
import { createRequestScope } from './request-scope';
export function useRequestScope() {
    const scope = useMemo(createRequestScope, []);
    useEffect(() => {
        scope.activate();
        return () => scope.dispose();
    }, [scope]);
    return scope;
}
export function usePolling(
    refresh: () => Promise<unknown>,
    enabled: boolean,
    onError: (error: unknown) => void,
) {
    useEffect(() => {
        if (!enabled) return;
        let active = true;
        let pending = false;
        const poll = async () => {
            if (!active || pending || document.hidden) return;
            pending = true;
            try {
                await refresh();
            } catch (error) {
                if (active) onError(error);
            } finally {
                pending = false;
            }
        };
        void poll();
        const timer = setInterval(() => void poll(), 2000);
        const visible = () => {
            if (!document.hidden) void poll();
        };
        document.addEventListener('visibilitychange', visible);
        return () => {
            active = false;
            clearInterval(timer);
            document.removeEventListener('visibilitychange', visible);
        };
    }, [refresh, enabled, onError]);
}
