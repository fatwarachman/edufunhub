import type { SkyRoundState } from '@/lib/sky-quiz';
import { useCallback, useEffect, useRef, useState } from 'react';

export type SkyConnectionStatus =
    'connecting' | 'online' | 'reconnecting' | 'offline' | 'grade_required';

export type SkyServerState = SkyRoundState & {
    player: { name: string; grade: number };
    paused?: boolean;
};

interface Handlers {
    onState: (state: SkyServerState) => void;
    onScore: (score: number) => void;
    onError: (code: string) => void;
}

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
 * WebSocket link to the Go Sky Quiz referee. The server picks questions for the
 * player's profile grade, judges every answer and awards verified points.
 */
export function useSkyConnection(
    wsUrl: string | null,
    locale: string,
    handlers: Handlers,
) {
    const enabled = Boolean(wsUrl);
    const [status, setStatus] = useState<SkyConnectionStatus>('connecting');
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
        let timer: ReturnType<typeof setTimeout> | undefined;

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
            let token: string;
            try {
                const res = await fetch('/games/sky-quiz/token', {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: {
                        Accept: 'application/json',
                        'X-CSRF-TOKEN': csrfToken(),
                        'X-Requested-With': 'XMLHttpRequest',
                    },
                });
                if (res.status === 422) {
                    setStatus('grade_required');
                    return;
                }
                if (!res.ok) {
                    throw new Error(String(res.status));
                }
                token = (await res.json()).token;
            } catch {
                schedule();
                return;
            }
            if (closed) {
                return;
            }
            const ws = new WebSocket(
                `${resolveWsUrl(wsUrl)}?locale=${encodeURIComponent(localeRef.current)}&token=${encodeURIComponent(token)}`,
            );
            socket.current = ws;
            ws.onopen = () => {
                attempts.current = 0;
                setStatus('online');
            };
            ws.onmessage = (event: MessageEvent<string>) => {
                let msg: Record<string, unknown>;
                try {
                    msg = JSON.parse(event.data);
                } catch {
                    return;
                }
                if (msg.t === 'sky_state') {
                    handlersRef.current.onState(
                        msg as unknown as SkyServerState,
                    );
                } else if (msg.t === 'sky_score') {
                    handlersRef.current.onScore(msg.score as number);
                } else if (msg.t === 'error') {
                    handlersRef.current.onError(msg.code as string);
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

        void connect();
        const ping = setInterval(() => send({ t: 'ping' }), 20000);
        return () => {
            closed = true;
            clearTimeout(timer);
            clearInterval(ping);
            socket.current?.close();
            socket.current = null;
        };
    }, [enabled, wsUrl, send]);

    return { status: enabled ? status : null, send };
}
