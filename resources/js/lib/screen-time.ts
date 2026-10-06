import { router } from '@inertiajs/react';

/**
 * Active screen-time tracker. Started once from `app.tsx`; lives outside
 * React (no state, no re-renders) with one interval timer.
 *
 * While the tab is visible and the user gave input within the last 5
 * minutes, active seconds accumulate and are reported to
 * `POST /screen-time/beat` every 30 s, on navigation to another area, and
 * when the tab is hidden or closed (fetch keepalive). Guests send nothing.
 */

const BEAT_MS = 30_000;
const IDLE_MS = 5 * 60_000;
const MIN_GAP_MS = 10_000;
const MAX_SECONDS = 60;
const ENDPOINT = '/screen-time/beat';

interface TrackerProps {
    auth?: { user?: { id?: number } | null };
}

let started = false;
let signedIn = false;
let area = 'other';
/** Start of the stretch not yet reported, or null while hidden / idle. */
let since: number | null = null;
let lastInput = 0;
let lastSent = 0;

/** `game:<key>` on game pages, else the first path segment. */
export function screenTimeArea(pathname: string): string {
    const parts = pathname.toLowerCase().split('/').filter(Boolean);
    const clean = (value: string) =>
        value.replace(/[^a-z0-9-]/g, '').slice(0, 34);

    if ((parts[0] === 'games' || parts[0] === 'play') && parts[1]) {
        const key = clean(parts[1]);
        if (key) return `game:${key}`;
    }

    return clean(parts[0] ?? '') || 'home';
}

function readSignedIn(props: Record<string, unknown> | undefined): boolean {
    return Boolean((props as TrackerProps | undefined)?.auth?.user?.id);
}

function xsrfToken(): string | null {
    const match = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : null;
}

function send(seconds: number, beatArea: string): void {
    const xsrf = xsrfToken();
    const headers: Record<string, string> = {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
    };
    if (xsrf) {
        headers['X-XSRF-TOKEN'] = xsrf;
    } else {
        headers['X-CSRF-TOKEN'] =
            document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')
                ?.content ?? '';
    }

    lastSent = Date.now();
    fetch(ENDPOINT, {
        method: 'POST',
        keepalive: true,
        credentials: 'same-origin',
        headers,
        body: JSON.stringify({ seconds_active: seconds, area: beatArea }),
    }).catch(() => undefined);
}

/**
 * Report the active seconds since the last report. `force` skips the
 * minimum gap (tab hidden / closed), so no time is lost on leave.
 */
function flush(force = false): void {
    if (since === null) return;
    const now = Date.now();
    if (!force && now - lastSent < MIN_GAP_MS) return;

    const end = Math.min(now, lastInput + IDLE_MS);
    const seconds = Math.round((end - since) / 1000);
    since = end < now ? null : now;

    if (signedIn && seconds >= 1) {
        send(Math.min(seconds, MAX_SECONDS), area);
    }
}

function resume(): void {
    lastInput = Date.now();
    if (since === null && signedIn && document.visibilityState === 'visible') {
        since = lastInput;
    }
}

export function startScreenTime(initialProps: Record<string, unknown>): void {
    if (started || typeof window === 'undefined') return;
    started = true;

    signedIn = readSignedIn(initialProps);
    area = screenTimeArea(window.location.pathname);
    resume();

    const passive = { passive: true, capture: true } as const;
    for (const type of [
        'pointerdown',
        'pointermove',
        'keydown',
        'wheel',
        'touchstart',
        'scroll',
    ]) {
        window.addEventListener(type, resume, passive);
    }

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
            flush(true);
            since = null;
        } else {
            resume();
        }
    });
    window.addEventListener('pagehide', () => {
        flush(true);
        since = null;
    });

    router.on('navigate', (event) => {
        const nextArea = screenTimeArea(window.location.pathname);
        const nextSignedIn = readSignedIn(
            event.detail.page.props as Record<string, unknown>,
        );
        if (nextSignedIn !== signedIn) {
            flush(true);
        } else if (nextArea !== area) {
            flush();
        }
        area = nextArea;
        signedIn = nextSignedIn;
        if (!signedIn) since = null;
        resume();
    });

    window.setInterval(() => {
        if (document.visibilityState !== 'visible') {
            since = null;
            return;
        }
        flush(true);
    }, BEAT_MS);
}
