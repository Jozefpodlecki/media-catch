export type View = 'blobs' | 'images' | 'media' | 'history' | 'settings';
export interface ApplicationState {
    view: View;
    dark: boolean;
}
export type ApplicationAction = { type: 'viewSelected'; view: View } | { type: 'themeToggled' };

export function applicationReducer(
    state: ApplicationState,
    action: ApplicationAction,
): ApplicationState {
    switch (action.type) {
        case 'viewSelected':
            return { ...state, view: action.view };
        case 'themeToggled':
            return { ...state, dark: !state.dark };
    }
}
