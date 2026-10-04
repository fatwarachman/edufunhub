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

export function useAppearance() {
    const [appearance, setAppearance] = useState<Appearance>('system');

    const updateAppearance = useCallback((mode: Appearance) => {
        setAppearance(mode);

        // Store in localStorage for client-side persistence...
        localStorage.setItem('appearance', mode);

        // Store in cookie for SSR...
        setCookie('appearance', mode);

        applyTheme(mode);
    }, []);

    useEffect(() => {
        const savedAppearance = localStorage.getItem(
            'appearance',
        ) as Appearance | null;

        // eslint-disable-next-line react-hooks/set-state-in-effect
        updateAppearance(savedAppearance || 'system');

        return () =>
            mediaQuery()?.removeEventListener(
                'change',
                handleSystemThemeChange,
            );
    }, [updateAppearance]);

    return { appearance, updateAppearance } as const;
}
