export function createRequestScope() {
    let active = true;
    let generation = 0;
    const versions = new Map<string, number>();
    const locked = new Set<string>();
    const invalidate = (resource: string) => {
        const version = (versions.get(resource) ?? 0) + 1;
        versions.set(resource, version);
        return version;
    };
    const perform = async <T>(
        resource: string,
        task: () => Promise<T>,
        apply: (value: T) => void,
        exclusive: boolean,
    ) => {
        if (!active || locked.has(resource)) return false;
        const version = invalidate(resource);
        const startedIn = generation;
        if (exclusive) locked.add(resource);
        try {
            const value = await task();
            if (!active || generation !== startedIn || versions.get(resource) !== version)
                return false;
            apply(value);
            return true;
        } catch (error) {
            if (active && generation === startedIn && versions.get(resource) === version)
                throw error;
            return false;
        } finally {
            if (generation === startedIn && exclusive) locked.delete(resource);
        }
    };
    return {
        read: <T>(resource: string, task: () => Promise<T>, apply: (value: T) => void) =>
            perform(resource, task, apply, false),
        mutate: <T>(resource: string, task: () => Promise<T>, apply: (value: T) => void) =>
            perform(resource, task, apply, true),
        invalidate,
        activate() {
            active = true;
            generation++;
            versions.clear();
            locked.clear();
        },
        dispose() {
            active = false;
            generation++;
            versions.clear();
            locked.clear();
        },
        get active() {
            return active;
        },
    };
}
