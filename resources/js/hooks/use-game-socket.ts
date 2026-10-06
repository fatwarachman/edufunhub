import { watchSocket } from '@/lib/socket-watchdog';
import { useCallback, useEffect, useRef, useState } from 'react';

export type GameSocketStatus =
    'connecting' | 'online' | 'reconnecting' | 'offline' | 'grade_required';

function csrfToken(): string {
    return (
        document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')
            ?.content ?? ''
    );
}

function resolveWsUrl(base: string): string {
    if (/^wss?:\/\//.test(base)) {
        return base;
    }
    const scheme = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${scheme}//${window.location.host}${base.startsWith('/') ? base : `/${base}`}`;
}

/**
 * WebSocket link to a Go game referee: fetches a signed player token from
 * `tokenUrl`, connects, reconnects with backoff and forwards messages of
 * `stateType` to `onState`. A 422 from the token endpoint means the player
 * has no grade yet.
 *
 * Phones often keep a dead socket "open" after the screen was locked or the
 * app was switched (no close event ever fires), which left players looking
 * at a stale dice/question dialog. `watchSocket` reconnects as soon as the
 * page becomes visible again or the network returns, and whenever the link
 * has been silent despite pings. A reconnect makes the server send the
 * current state again.
 */
export function useGameSocket<State>(
    wsUrl: string | null,
    tokenUrl: string,
    stateType: string,
    locale: string,
    handlers: {
        onState: (state: State) => void;
        onError: (code: string) => void;
        /** Every other server event (games that stream deltas). */
        onMessage?: (msg: Record<string, unknown>) => void;
    },
) {
    const enabled = Boolean(wsUrl);
    const [status, setStatus] = useState<GameSocketStatus>('connecting');
    const socket = useRef<WebSocket | null>(null);
    const handlersRef = useRef(handlers);
    const localeRef = useRef(locale);
    const attempts = useRef(0);

    useEffect(() => {
        handlersRef.current = handlers;
    }, [handlers]);

    const send = useCallback((msg: Record<string, unknown>) => {
        const ws = socket.current;
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(msg));
            return true;
        }
        return false;
    }, []);

    useEffect(() => {
        localeRef.current = locale;
        send({ t: 'locale', locale });
    }, [locale, send]);

    useEffect(() => {
        if (!enabled || !wsUrl) {
            return;
        }
        let closed = false;
        let connecting = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const seen = { current: () => {} };

        const schedule = () => {
            if (closed) {
                return;
            }
            attempts.current += 1;
            setStatus(attempts.current > 6 ? 'offline' : 'reconnecting');
            timer = setTimeout(
                connect,
                Math.min(1000 * 2 ** Math.min(attempts.current, 4), 15000),
            );
        };

        const connect = async () => {
            if (connecting || closed) {
                return;
            }
            connecting = true;
            clearTimeout(timer);
            let token: string;
            try {
                const res = await fetch(tokenUrl, {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: {
                        Accept: 'application/json',
                        'X-CSRF-TOKEN': csrfToken(),
                        'X-Requested-With': 'XMLHttpRequest',
                    },
                });
                if (res.status === 422) {
                    connecting = false;
                    setStatus('grade_required');
                    return;
                }
                if (!res.ok) {
                    throw new Error(String(res.status));
                }
                token = (await res.json()).token;
            } catch {
                connecting = false;
                schedule();
                return;
            }
            connecting = false;
            if (closed) {
                return;
            }
            const ws = new WebSocket(
                `${resolveWsUrl(wsUrl)}?locale=${encodeURIComponent(localeRef.current)}&token=${encodeURIComponent(token)}`,
            );
            socket.current = ws;
            seen.current();
            ws.onopen = () => {
                attempts.current = 0;
                seen.current();
                setStatus('online');
            };
            ws.onmessage = (event: MessageEvent<string>) => {
                seen.current();
                let msg: Record<string, unknown>;
                try {
                    msg = JSON.parse(event.data);
                } catch {
                    return;
                }
                if (msg.t === stateType) {
                    handlersRef.current.onState(msg as unknown as State);
                } else if (msg.t === 'error') {
                    handlersRef.current.onError(msg.code as string);
                } else if (msg.t !== 'pong') {
                    handlersRef.current.onMessage?.(msg);
                }
            };
            ws.onclose = () => {
                if (socket.current === ws) {
                    socket.current = null;
                }
                if (!closed) {
                    schedule();
                }
            };
        };

        /** Drops the current socket without waiting for its close event and connects again. */
        const reconnect = () => {
            const ws = socket.current;
            if (ws) {
                ws.onclose = null;
                ws.onmessage = null;
                ws.close();
                socket.current = null;
            }
            attempts.current = 0;
            setStatus('reconnecting');
            void connect();
        };
        const watchdog = watchSocket({
            current: () => socket.current,
            ping: () => send({ t: 'ping' }),
            reconnect,
        });
        seen.current = watchdog.seen;

        void connect();
        return () => {
            closed = true;
            clearTimeout(timer);
            watchdog.stop();
            const ws = socket.current;
            if (ws) {
                ws.onclose = null;
                ws.close();
            }
            socket.current = null;
        };
    }, [enabled, wsUrl, tokenUrl, stateType, send]);

    return { status: enabled ? status : null, send };
}
