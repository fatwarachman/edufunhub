import { type RefObject, useLayoutEffect } from 'react';

/** Breathing room kept between the brand and the first nav button. */
const BRAND_GAP = 12;

/** Labelled nav buttons that can fold to an icon (not those inside panels). */
const FOLDABLE =
    '.edu-nav-btn:not(.edu-nav-btn--icon):not(.edu-nav-btn--block):has(> .edu-nav-label)';

function foldable(nav: HTMLElement): HTMLElement[] {
    return Array.from(nav.querySelectorAll<HTMLElement>(FOLDABLE)).filter(
        (button) =>
            !button.closest('[hidden], [class*="-panel"]') &&
            button.offsetParent !== null,
    );
}

/** The header row the nav shares with the brand (nav may sit in a sub-group). */
function headerRow(nav: HTMLElement): HTMLElement | null {
    let row = nav.parentElement;
    while (
        row &&
        row.parentElement &&
        row.parentElement.tagName !== 'HEADER' &&
        row.tagName !== 'HEADER'
    ) {
        if (row.querySelector('.edu-game-brand, .auth-brand, h1')) {
            return row;
        }
        row = row.parentElement;
    }
    return row;
}

/** True when the header row overflows or squeezes the game title or brand name (taglines may truncate). */
function crowded(nav: HTMLElement): boolean {
    const row = headerRow(nav);
    if (!row) {
        return false;
    }
    /*
     * Only the header row counts: wide page content (tables, toasts, game
     * canvases) must never fold the menu.
     */
    if (row.scrollWidth > row.clientWidth + 1) {
        return true;
    }
    if (
        row.getBoundingClientRect().right >
        document.documentElement.clientWidth + 1
    ) {
        return true;
    }
    const navBox = nav.getBoundingClientRect();
    const rowBox = row.getBoundingClientRect();
    if (navBox.right > rowBox.right + 1) {
        return true;
    }
    if (navBox.left < rowBox.left - 1) {
        return true;
    }
    /* Items spilling to the left do not scroll, they slide over the brand. */
    const items = Array.from(
        nav.querySelectorAll<HTMLElement>('.edu-nav-btn, .edu-nav-clock'),
    )
        .filter(
            (item) =>
                item.offsetParent !== null &&
                !item.closest('[hidden], [class*="-panel"]'),
        )
        .map((item) => item.getBoundingClientRect());
    const brands = Array.from(
        row.querySelectorAll<HTMLElement>(
            '.edu-game-brand, .auth-brand, .edu-brand-wordmark, h1',
        ),
    )
        .filter((brand) => !nav.contains(brand) && brand.offsetParent !== null)
        .map((brand) => brand.getBoundingClientRect());
    for (const brand of brands) {
        for (const item of items) {
            if (
                item.left < brand.right + BRAND_GAP &&
                item.right > brand.left - BRAND_GAP &&
                item.top < brand.bottom - 1 &&
                item.bottom > brand.top + 1
            ) {
                return true;
            }
        }
    }
    const texts = row.querySelectorAll<HTMLElement>(
        'h1, h1 .truncate, .edu-brand-text',
    );
    for (const text of Array.from(texts)) {
        if (
            !nav.contains(text) &&
            text.offsetParent !== null &&
            text.scrollWidth > text.clientWidth + 1
        ) {
            return true;
        }
    }
    return false;
}

/** Session key of the folded button the player opened last (keeps its label). */
const PINNED_KEY = 'edu-nav-pinned';

const MORPH_MS = 260;
const MORPH_EASING = 'cubic-bezier(0.2, 0.8, 0.2, 1)';

function buttonKey(button: HTMLElement): string {
    return button.dataset.testid ?? button.getAttribute('href') ?? '';
}

function readPinned(): string | null {
    try {
        return window.sessionStorage.getItem(PINNED_KEY);
    } catch {
        return null;
    }
}

function writePinned(key: string): void {
    try {
        window.sessionStorage.setItem(PINNED_KEY, key);
    } catch {
        /* Private mode: the pin only lasts for this page. */
    }
}

function reducedMotion(): boolean {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Eases a button between its old and new width. A button that folds keeps
 * its label while it shrinks and only turns into an icon at the end; one that
 * unfolds grows while its label fades in.
 */
function morph(
    button: HTMLElement,
    from: number,
    to: number,
    folding: boolean,
): void {
    if (Math.abs(from - to) < 1) {
        return;
    }
    if (folding) {
        button.removeAttribute('data-folded');
    }
    button.classList.add('edu-nav-btn--morph');
    const label = button.querySelector<HTMLElement>(':scope > .edu-nav-label');
    /* fill: forwards holds the end width until the final state is applied. */
    const grow = button.animate(
        [{ width: `${from}px` }, { width: `${to}px` }],
        { duration: MORPH_MS, easing: MORPH_EASING, fill: 'forwards' },
    );
    const fade = label?.animate(
        folding
            ? [{ opacity: 1 }, { opacity: 0 }]
            : [{ opacity: 0 }, { opacity: 1 }],
        { duration: MORPH_MS, easing: 'ease', fill: 'forwards' },
    );
    let settled = false;
    const done = () => {
        if (settled) {
            return;
        }
        settled = true;
        if (folding) {
            button.setAttribute('data-folded', '');
        }
        button.classList.remove('edu-nav-btn--morph');
        grow.cancel();
        fade?.cancel();
    };
    grow.onfinish = done;
    grow.oncancel = done;
}

/**
 * Shows every nav label while it fits, and folds labels into icons one by
 * one starting from the rightmost button when the header gets too tight.
 * Tapping a folded button gives it its label back: the labelled button
 * nearest to the folded ones folds in its place, both morphing smoothly.
 * Compact (game) headers fall back to the menu button when even icons do not
 * fit.
 * Works on the DOM directly (no re-render) and re-measures on resize.
 */
export function useNavFold(navRef: RefObject<HTMLElement | null>): void {
    useLayoutEffect(() => {
        const nav = navRef.current;
        if (!nav || typeof ResizeObserver === 'undefined') {
            return;
        }
        let frame = 0;
        let lastWidth = -1;
        const collapsible = nav.classList.contains('edu-nav-bar--compact');

        const fit = (
            animate = false,
            startWidths?: Map<HTMLElement, number>,
        ) => {
            const buttons = foldable(nav);
            const before = new Map(
                buttons.map((button) => [
                    button,
                    {
                        width:
                            startWidths?.get(button) ??
                            button.getBoundingClientRect().width,
                        folded: button.hasAttribute('data-folded'),
                    },
                ]),
            );
            for (const button of buttons) {
                button
                    .getAnimations({ subtree: true })
                    .forEach((running) => running.cancel());
                button.classList.remove('edu-nav-btn--morph');
            }

            nav.removeAttribute('data-collapsed');
            for (const button of buttons) {
                button.removeAttribute('data-folded');
            }
            /* Fold from the right; the pinned button folds last. */
            const pinned = readPinned();
            const order = [...buttons].reverse();
            const pinnedIndex = order.findIndex(
                (button) => buttonKey(button) === pinned,
            );
            if (pinnedIndex >= 0) {
                order.push(...order.splice(pinnedIndex, 1));
            }
            for (const button of order) {
                if (!crowded(nav)) {
                    break;
                }
                button.setAttribute('data-folded', '');
            }
            if (collapsible && crowded(nav)) {
                nav.setAttribute('data-collapsed', '');
            }
            nav.setAttribute('data-fitted', '');

            if (
                !animate ||
                reducedMotion() ||
                nav.hasAttribute('data-collapsed')
            ) {
                return;
            }
            for (const button of buttons) {
                const old = before.get(button);
                const folded = button.hasAttribute('data-folded');
                if (
                    !old ||
                    old.folded === folded ||
                    button.offsetParent === null
                ) {
                    continue;
                }
                morph(
                    button,
                    old.width,
                    button.getBoundingClientRect().width,
                    folded,
                );
            }
        };
        const schedule = () => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(() => {
                const width = document.documentElement.clientWidth;
                if (width !== lastWidth || !nav.hasAttribute('data-fitted')) {
                    lastWidth = width;
                    fit();
                }
            });
        };
        /*
         * A folded button was tapped: pin it so it shows its label. Measure
         * after React has rendered the click (open menu, chevron) so the
         * morph ends at the real width.
         */
        const onPress = (event: Event) => {
            const button = (
                event.target as Element | null
            )?.closest<HTMLElement>('.edu-nav-btn[data-folded]');
            if (
                !button ||
                !nav.contains(button) ||
                !foldable(nav).includes(button)
            ) {
                return;
            }
            writePinned(buttonKey(button));
            const widths = new Map(
                foldable(nav).map((item) => [
                    item,
                    item.getBoundingClientRect().width,
                ]),
            );
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(() => fit(true, widths));
        };

        fit();
        lastWidth = document.documentElement.clientWidth;
        nav.addEventListener('click', onPress);
        const observer = new ResizeObserver(schedule);
        observer.observe(headerRow(nav) ?? nav);
        observer.observe(document.documentElement);
        const content = new MutationObserver(() => {
            nav.removeAttribute('data-fitted');
            schedule();
        });
        content.observe(nav, {
            childList: true,
            subtree: true,
            characterData: true,
        });
        document.fonts?.ready.then(() => {
            nav.removeAttribute('data-fitted');
            schedule();
        });

        return () => {
            cancelAnimationFrame(frame);
            nav.removeEventListener('click', onPress);
            observer.disconnect();
            content.disconnect();
        };
    }, [navRef]);
}
