import { createContext, useContext } from 'react';
export function requiredContext<T>(name: string) {
    const context = createContext<T | undefined>(undefined);
    const useValue = () => {
        const value = useContext(context);
        if (value === undefined) throw new Error(`${name} requires its provider.`);
        return value;
    };
    return [context.Provider, useValue] as const;
}
