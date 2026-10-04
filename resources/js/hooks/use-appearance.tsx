import { useCallback, useEffect, useState } from 'react';

export type Appearance = 'light' | 'dark' | 'system';

const prefersDark = () => {
    if (typeof window === 'undefined') {
        return false;
    }

    return window.matchMedia('(prefers-color-scheme: dark)').matches;
};

const setCookie = (name: string, value: string, days = 365) => {
    if (typeof document === 'undefined') {
        return;
    }

    const maxAge = days * 24 * 60 * 60;
    document.cookie = `${name}=${value};path=/;max-age=${maxAge};SameSite=Lax`;
};

/**
 * Switch the theme class in a single frame.
 *
 * Every `transition-colors` element would otherwise animate its own colour
 * change (hundreds at once on chart-heavy pages), which makes the toggle feel
 * slow. Transitions are suppressed for the frame in which the class flips.
 */
const applyTheme = (appearance: Appearance) => {
    const isDark =
        appearance === 'dark' || (appearance === 'system' && prefersDark());
    const root = document.documentElement;

    if (root.classList.contains('dark') === isDark) {
        root.style.colorScheme = isDark ? 'dark' : 'light';
        return;
    }

    const blocker = document.createElement('style');
    blocker.appendChild(
        document.createTextNode(
            '*,*::before,*::after{transition:none!important;animation-duration:0s!important}',
        ),
    );
    document.head.appendChild(blocker);

    root.classList.toggle('dark', isDark);
    root.style.colorScheme = isDark ? 'dark' : 'light';

    // Force a style flush so the new colours apply without transitions, then restore.
    void window.getComputedStyle(document.body).opacity;
    requestAnimationFrame(() => blocker.remove());
};

const mediaQuery = () => {
    if (typeof window === 'undefined') {
        return null;
    }

    return window.matchMedia('(prefers-color-scheme: dark)');
};

const handleSystemThemeChange = () => {
    const currentAppearance = localStorage.getItem('appearance') as Appearance;
    applyTheme(currentAppearance || 'system');
};

export function initializeTheme() {
    const savedAppearance =
        (localStorage.getItem('appearance') as Appearance) || 'system';

    applyTheme(savedAppearance);

    // Add the event listener for system theme changes...
    mediaQuery()?.addEventListener('change', handleSystemThemeChange);
}

const APPEARANCE_EVENT = 'appearance-change';

const resolveAppearance = (appearance: Appearance): 'light' | 'dark' =>
    appearance === 'dark' || (appearance === 'system' && prefersDark())
        ? 'dark'
        : 'light';

const storedAppearance = (): Appearance => {
    if (typeof window === 'undefined') {
        return 'system';
    }

    const saved = localStorage.getItem('appearance');

    return saved === 'light' || saved === 'dark' ? saved : 'system';
};

/**
 * `appearance` is the saved choice (light, dark or system); `resolvedAppearance`
 * is what is on screen. Toggles must flip the resolved value: with the saved
 * choice "system" on a dark-mode phone, setting "dark" would change nothing.
 */
export function useAppearance() {
    const [appearance, setAppearance] = useState<Appearance>(storedAppearance);
    const [resolvedAppearance, setResolvedAppearance] = useState<
        'light' | 'dark'
    >(() => resolveAppearance(storedAppearance()));

    const updateAppearance = useCallback((mode: Appearance) => {
        setAppearance(mode);
        setResolvedAppearance(resolveAppearance(mode));

        // Store in localStorage for client-side persistence...
        localStorage.setItem('appearance', mode);

        // Store in cookie for SSR...
        setCookie('appearance', mode);

        applyTheme(mode);

        // Keep every other mounted toggle in sync.
        window.dispatchEvent(
            new CustomEvent<Appearance>(APPEARANCE_EVENT, { detail: mode }),
        );
    }, []);

    useEffect(() => {
        const sync = () => {
            const mode = storedAppearance();
            setAppearance(mode);
            setResolvedAppearance(resolveAppearance(mode));
        };
        const media = mediaQuery();

        applyTheme(storedAppearance());
        window.addEventListener(APPEARANCE_EVENT, sync);
        window.addEventListener('storage', sync);
        media?.addEventListener('change', sync);

        return () => {
            window.removeEventListener(APPEARANCE_EVENT, sync);
            window.removeEventListener('storage', sync);
            media?.removeEventListener('change', sync);
        };
    }, []);

    const toggleAppearance = useCallback(() => {
        updateAppearance(resolvedAppearance === 'dark' ? 'light' : 'dark');
    }, [resolvedAppearance, updateAppearance]);

    return {
        appearance,
        resolvedAppearance,
        updateAppearance,
        toggleAppearance,
    } as const;
}
