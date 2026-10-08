import { router, usePage } from '@inertiajs/react';
import { useEffect, useRef } from 'react';

type Page = ReturnType<typeof usePage>;

/** Set on every back/forward, read once by the page that renders next. */
let restoredFromHistory = false;
if (typeof window !== 'undefined') {
    window.addEventListener('popstate', () => {
        restoredFromHistory = true;
    });
}

/**
 * Browser back/forward restores an Inertia page from history with the props
 * it had back then (e.g. an item still worn after it was taken off on
 * another page). Reload the given props from the server after such a visit
 * so the page always shows the saved state; `onFresh` gets the new page to
 * reset local form state.
 */
export function useFreshOnHistory(
    only: string[],
    onFresh?: (page: Page) => void,
): void {
    const key = only.join(',');
    const component = usePage().component;
    const callback = useRef(onFresh);

    useEffect(() => {
        callback.current = onFresh;
    });

    useEffect(() => {
        const props = key.split(',');
        const refresh = () =>
            router.reload({
                only: props,
                onSuccess: (page) => callback.current?.(page),
            });
        if (restoredFromHistory) {
            restoredFromHistory = false;
            refresh();
        }
        return router.on('navigate', (event) => {
            if (
                restoredFromHistory &&
                event.detail.page.component === component
            ) {
                restoredFromHistory = false;
                refresh();
            }
        });
    }, [key, component]);
}
