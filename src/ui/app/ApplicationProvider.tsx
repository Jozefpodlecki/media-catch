import { useEffect, useMemo, useReducer, type ReactNode } from 'react';
import { requiredContext } from '../context';
import { applicationReducer, type ApplicationState, type View } from '../state/application';

const [StateProvider, useApplicationState] = requiredContext<ApplicationState>('Application state');
const [ActionsProvider, useApplicationActions] = requiredContext<{
    selectView(view: View): void;
    toggleTheme(): void;
}>('Application actions');
export { useApplicationState, useApplicationActions };

export function ApplicationProvider({
    initial,
    children,
}: {
    initial: ApplicationState;
    children: ReactNode;
}) {
    const [state, dispatch] = useReducer(applicationReducer, initial);
    useEffect(() => {
        document.documentElement.style.colorScheme = state.dark ? 'dark' : 'light';
    }, [state.dark]);
    const actions = useMemo(
        () => ({
            selectView: (view: View) => dispatch({ type: 'viewSelected', view }),
            toggleTheme: () => dispatch({ type: 'themeToggled' }),
        }),
        [],
    );
    return (
        <StateProvider value={state}>
            <ActionsProvider value={actions}>{children}</ActionsProvider>
        </StateProvider>
    );
}
