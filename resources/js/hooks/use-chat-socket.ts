import { useEffect, useRef, useState } from 'react';

export type ChatSocketStatus = 'connecting' | 'online' | 'reconnecting' | 'off';

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
 * Live link to the Go chat container. Receives events Laravel publishes
 * (`{t: 'message', message}`), reconnects with backoff and calls `onResync`
 * after every reconnect so the page can refetch what it missed.
 */
export function useChatSocket(
    wsUrl: string | null,
    handlers: {
        onEvent: (event: Record<string, unknown>) => void;
        onResync: () => void;
    },
): ChatSocketStatus {
    const [status, setStatus] = useState<ChatSocketStatus>(
        wsUrl ? 'connecting' : 'off',
    );
    const handlersRef = useRef(handlers);
    useEffect(() => {
        handlersRef.current = handlers;
    }, [handlers]);

    useEffect(() => {
        if (!wsUrl) {
            return;
        }
        let closed = false;
        let attempts = 0;
        let everOnline = false;
        let socket: WebSocket | null = null;
        let timer: ReturnType<typeof setTimeout> | undefined;

        const schedule = () => {
            if (closed) {
                return;
            }
            attempts += 1;
            setStatus('reconnecting');
            timer = setTimeout(
                connect,
                Math.min(1000 * 2 ** Math.min(attempts, 4), 15000),
            );
        };

        const connect = async () => {
            let token: string;
            try {
                const res = await fetch('/chat/token', {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: {
                        Accept: 'application/json',
                        'X-CSRF-TOKEN': csrfToken(),
                        'X-Requested-With': 'XMLHttpRequest',
                    },
                });
                if (res.status === 503) {
                    setStatus('off');
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
                `${resolveWsUrl(wsUrl)}?token=${encodeURIComponent(token)}`,
            );
            socket = ws;
            ws.onopen = () => {
                attempts = 0;
                setStatus('online');
                if (everOnline) {
                    handlersRef.current.onResync();
                }
                everOnline = true;
            };
            ws.onmessage = (event: MessageEvent<string>) => {
                try {
                    const msg = JSON.parse(event.data);
                    if (msg && typeof msg === 'object' && msg.t !== 'hello') {
                        handlersRef.current.onEvent(msg);
                    }
                } catch {
                    // Ignore malformed frames.
                }
            };
            ws.onclose = () => {
                if (socket === ws) {
                    socket = null;
                }
                if (!closed) {
                    schedule();
                }
            };
        };

        void connect();
        return () => {
            closed = true;
            clearTimeout(timer);
            socket?.close();
        };
    }, [wsUrl]);

    return status;
}
