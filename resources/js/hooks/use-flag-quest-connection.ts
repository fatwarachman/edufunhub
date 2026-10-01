import type {
    ChallengeState,
    CompleteState,
    MissionInfo,
    Point,
    WorldData,
} from '@/lib/flag-quest/world';
import { useCallback, useEffect, useRef, useState } from 'react';

export type ConnectionStatus =
    | 'connecting'
    | 'online'
    | 'reconnecting'
    | 'offline'
    | 'unavailable'
    | 'grade_required';

export interface Welcome {
    player: { name: string; grade: number; color: string; accessory: string };
    missions: MissionInfo[];
    mission: string;
    world: WorldData;
    pos: Point;
    speeds: { walk: number; run: number };
    stats: { correct: number; wrong: number; failures: number };
}

interface Handlers {
    onCorrection: (p: Point) => void;
    onEvent?: (msg: Record<string, unknown>) => void;
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
 * Manages the authenticated WebSocket to the Go game service, with automatic
 * reconnect (fresh token each time) and typed state for the UI.
 */
export function useFlagQuestConnection(
    wsUrl: string,
    locale: string,
    enabled: boolean,
    handlers: Handlers,
) {
    const [status, setStatus] = useState<ConnectionStatus>(
        enabled ? 'connecting' : 'unavailable',
    );
    const [welcome, setWelcome] = useState<Welcome | null>(null);
    const [world, setWorld] = useState<WorldData | null>(null);
    const [challenge, setChallenge] = useState<ChallengeState | null>(null);
    const [complete, setComplete] = useState<CompleteState | null>(null);
    const [raising, setRaising] = useState<{
        startedAt: number;
        duration: number;
    } | null>(null);
    const [stats, setStats] = useState({ correct: 0, wrong: 0, failures: 0 });

    const socket = useRef<WebSocket | null>(null);
    const handlersRef = useRef(handlers);
    const localeRef = useRef(locale);
    const attempts = useRef(0);
    const closed = useRef(false);

    useEffect(() => {
        handlersRef.current = handlers;
    }, [handlers]);

    const send = useCallback((msg: Record<string, unknown>) => {
        const ws = socket.current;
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(msg));
        }
    }, []);

    useEffect(() => {
        localeRef.current = locale;
        send({ t: 'locale', locale });
    }, [locale, send]);

    useEffect(() => {
        if (!enabled) {
            return;
        }
        closed.current = false;
        let timer: ReturnType<typeof setTimeout> | undefined;

        const handle = (raw: MessageEvent<string>) => {
            let msg: Record<string, unknown>;
            try {
                msg = JSON.parse(raw.data);
            } catch {
                return;
            }
            switch (msg.t) {
                case 'welcome': {
                    const w = msg as unknown as Welcome & {
                        challenge?: ChallengeState;
                        complete?: CompleteState;
                    };
                    setWelcome(w);
                    setWorld(w.world);
                    setStats(w.stats);
                    setChallenge(
                        w.challenge
                            ? { ...w.challenge, receivedAt: performance.now() }
                            : null,
                    );
                    setComplete(w.complete ?? null);
                    setRaising(null);
                    handlersRef.current.onCorrection(w.pos);
                    break;
                }
                case 'correct':
                    handlersRef.current.onCorrection({
                        x: msg.x as number,
                        y: msg.y as number,
                    });
                    break;
                case 'challenge': {
                    const c = msg as unknown as ChallengeState & {
                        checkpoints?: WorldData['checkpoints'];
                    };
                    setChallenge({ ...c, receivedAt: performance.now() });
                    if (c.feedback) {
                        setStats((s) => ({
                            ...s,
                            correct: s.correct + (c.feedback?.correct ? 1 : 0),
                            wrong:
                                s.wrong +
                                (!c.feedback?.correct && c.feedback?.answer
                                    ? 1
                                    : 0),
                        }));
                    }
                    if (c.checkpoints) {
                        setWorld((w) =>
                            w ? { ...w, checkpoints: c.checkpoints! } : w,
                        );
                    }
                    break;
                }
                case 'gates': {
                    const cps = msg.checkpoints as WorldData['checkpoints'];
                    setWorld((w) => (w ? { ...w, checkpoints: cps } : w));
                    if (msg.stats) {
                        setStats(msg.stats as typeof stats);
                    }
                    setChallenge(null);
                    break;
                }
                case 'raise':
                    setRaising({
                        startedAt: performance.now(),
                        duration: msg.duration_ms as number,
                    });
                    break;
                case 'complete':
                    setRaising(null);
                    setComplete(msg as unknown as CompleteState);
                    break;
                case 'error':
                    setNotice({
                        code: msg.code as string,
                        retryMs: msg.retry_ms as number | undefined,
                        at: Date.now(),
                    });
                    break;
            }
        };

        const connect = async () => {
            setStatus(attempts.current === 0 ? 'connecting' : 'reconnecting');
            let token: string;
            try {
                const res = await fetch('/games/flag-quest/token', {
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
            if (closed.current) {
                return;
            }
            const url = `${resolveWsUrl(wsUrl)}?locale=${encodeURIComponent(localeRef.current)}&token=${encodeURIComponent(token)}`;
            const ws = new WebSocket(url);
            socket.current = ws;
            ws.onopen = () => {
                attempts.current = 0;
                setStatus('online');
            };
            ws.onmessage = handle;
            ws.onclose = () => {
                if (socket.current === ws) {
                    socket.current = null;
                }
                if (!closed.current) {
                    schedule();
                }
            };
        };

        const schedule = () => {
            if (closed.current) {
                return;
            }
            attempts.current += 1;
            setStatus(attempts.current > 6 ? 'offline' : 'reconnecting');
            const delay = Math.min(
                1000 * 2 ** Math.min(attempts.current, 4),
                15000,
            );
            timer = setTimeout(connect, delay);
        };

        void connect();
        const ping = setInterval(() => send({ t: 'ping' }), 20000);
        return () => {
            closed.current = true;
            clearTimeout(timer);
            clearInterval(ping);
            socket.current?.close();
            socket.current = null;
        };
    }, [enabled, wsUrl, send]);

    const retry = useCallback(() => {
        attempts.current = 0;
        window.location.reload();
    }, []);

    return {
        status,
        welcome,
        world,
        challenge,
        complete,
        raising,
        stats,
        send,
        retry,
        clearChallenge: () => setChallenge(null),
        clearComplete: () => setComplete(null),
    };
}
