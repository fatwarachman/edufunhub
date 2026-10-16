import { router } from '@inertiajs/react';

const ENDPOINT = '/current-page';
const MIN_GAP_MS = 15_000;
const MAX_LABEL_LENGTH = 160;

let started = false;
let lastSentAt = 0;
let lastValue = '';

function csrfHeaders(): Record<string, string> {
    const token = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/);

    return {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        ...(token
            ? { 'X-XSRF-TOKEN': decodeURIComponent(token[1]) }
            : {
                  'X-CSRF-TOKEN':
                      document.querySelector<HTMLMetaElement>(
                          'meta[name="csrf-token"]',
                      )?.content ?? '',
              }),
    };
}

const SECRET_PARAMS = /token|signature|expires|code|password|secret|key/i;

function sanitizedPath(): string {
    const params = new URLSearchParams(window.location.search);
    for (const name of [...params.keys()]) {
        if (SECRET_PARAMS.test(name)) params.delete(name);
    }
    const query = params.toString();

    return `${window.location.pathname}${query ? `?${query}` : ''}`.slice(
        0,
        2048,
    );
}

function readUserId(props: Record<string, unknown>): number | null {
    const auth = props.auth as { user?: { id?: number } | null } | undefined;
    return typeof auth?.user?.id === 'number' ? auth.user.id : null;
}

function send(props: Record<string, unknown>, force = false): void {
    const userId = readUserId(props);
    if (!userId || typeof window === 'undefined') return;

    const path = sanitizedPath();
    const label = (document.title || path).slice(0, MAX_LABEL_LENGTH);
    const value = `${userId}|${path}|${label}`;
    const now = Date.now();

    if (!force && value === lastValue && now - lastSentAt < MIN_GAP_MS) {
        return;
    }

    lastValue = value;
    lastSentAt = now;
    fetch(ENDPOINT, {
        method: 'POST',
        credentials: 'same-origin',
        keepalive: true,
        headers: csrfHeaders(),
        body: JSON.stringify({ path, label }),
    }).catch(() => undefined);
}

export function startCurrentPageTracking(
    initialProps: Record<string, unknown>,
): void {
    if (started || typeof window === 'undefined') return;
    started = true;

    window.setTimeout(() => send(initialProps, true), 400);

    router.on('navigate', (event) => {
        const props = event.detail.page.props as Record<string, unknown>;
        window.setTimeout(() => send(props), 400);
    });
}
