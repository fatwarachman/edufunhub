import { type ChatEvent, useChatEvents } from '@/hooks/use-chat-socket';
import { router } from '@inertiajs/react';
import { useCallback, useEffect, useRef, useState } from 'react';

interface Shared {
    gameReturn?: { href?: string } | null;
}

/** Pin of the classroom page the user is on (`/portal/classrooms/{pin}`). */
function pagePin(pathname: string): string | null {
    return /^\/portal\/classrooms\/(\d{6})(?:\/|$)/.exec(pathname)?.[1] ?? null;
}

/** Pin of the classroom the current game was opened from (server prop). */
function gamePin(props: Record<string, unknown> | undefined): string | null {
    const href = (props as Shared | undefined)?.gameReturn?.href ?? '';
    return /^\/portal\/classrooms\/(\d{6})$/.exec(href)?.[1] ?? null;
}

const POLL_MS = 15_000;

/**
 * Mounted once next to the Inertia app. When a classroom ends (teacher ended
 * it or its time ran out), the server pushes `classroom_ended` on the chat
 * socket; a student playing a game of that classroom, or sitting on its
 * classroom page / 3D room, is sent to the classroom page, which now shows
 * the "class ended" screen. The classroom id/pin only come from the server
 * (event + page props). While on a classroom game a light poll covers a
 * dead chat socket.
 */
export function ClassroomEndedLive({
    initialProps,
}: {
    initialProps: Record<string, unknown>;
}) {
    const [path, setPath] = useState(() => window.location.pathname);
    const [fromGame, setFromGame] = useState(() => gamePin(initialProps));
    const leaving = useRef(false);

    useEffect(
        () =>
            router.on('navigate', (event) => {
                leaving.current = false;
                setPath(window.location.pathname);
                setFromGame(
                    gamePin(event.detail.page.props as Record<string, unknown>),
                );
            }),
        [],
    );

    const current = pagePin(path) ?? fromGame;

    const leaveTo = useCallback((pin: string) => {
        if (leaving.current) {
            return;
        }
        leaving.current = true;
        try {
            sessionStorage.removeItem(`classroom-world:${pin}`);
        } catch {
            // Storage may be unavailable; the page still reloads.
        }
        router.visit(`/portal/classrooms/${pin}`, { replace: true });
    }, []);

    useChatEvents(
        useCallback(
            (event: ChatEvent) => {
                if (event.t !== 'classroom_ended' || !current) {
                    return;
                }
                if (String(event.pin ?? '') === current) {
                    leaveTo(current);
                }
            },
            [current, leaveTo],
        ),
    );

    // Fallback while inside a classroom game (chat socket may be down): the
    // classroom HUD endpoint answers 404/403 once the class is over.
    useEffect(() => {
        if (!fromGame || pagePin(path)) {
            return;
        }
        const timer = window.setInterval(async () => {
            if (document.hidden) {
                return;
            }
            try {
                const res = await fetch(`/portal/classrooms/${fromGame}/hud`, {
                    headers: {
                        Accept: 'application/json',
                        'X-Requested-With': 'XMLHttpRequest',
                    },
                    credentials: 'same-origin',
                });
                if (res.status === 404 || res.status === 403) {
                    leaveTo(fromGame);
                }
            } catch {
                // Offline: try again next tick.
            }
        }, POLL_MS);
        return () => window.clearInterval(timer);
    }, [fromGame, path, leaveTo]);

    return null;
}
