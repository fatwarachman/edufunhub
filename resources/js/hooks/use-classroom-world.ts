import { useGameSocket } from '@/hooks/use-game-socket';
import {
    type ChatMessage,
    parseRoster,
    parseSay,
    parseState,
    type RosterPlayer,
    type SayMessage,
    type WelcomeMessage,
} from '@/lib/classroom-world/protocol';
import { useCallback, useMemo, useRef, useState } from 'react';

export interface WorldEvents {
    roster: (players: RosterPlayer[]) => void;
    state: (msg: Record<string, unknown>) => void;
    chat: (msg: ChatMessage) => void;
    say: (msg: SayMessage) => void;
    /** Return true when the error was shown elsewhere (e.g. the DM panel). */
    error: (code: string) => boolean;
    emote: (id: number, e: string) => void;
    enter: (booth: number, game: string) => void;
    kicked: (reason: string) => void;
}

/**
 * Socket to the Go classroom world. Keeps React state small (welcome,
 * roster, chat log, last error); per-tick positions go straight to the
 * three.js scene through `events.state` without re-rendering React.
 */
export function useClassroomWorld(
    wsUrl: string | null,
    tokenUrl: string,
    locale: string,
) {
    const [welcome, setWelcome] = useState<WelcomeMessage | null>(null);
    const [roster, setRoster] = useState<RosterPlayer[]>([]);
    const [log, setLog] = useState<ChatMessage[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [kicked, setKicked] = useState<string | null>(null);
    const events = useRef<Partial<WorldEvents>>({});

    const handlers = useMemo(
        () => ({
            onState: (msg: WelcomeMessage) => {
                setWelcome(msg);
                setError(null);
            },
            onError: (code: string) => {
                if (!events.current.error?.(code)) {
                    setError(code);
                }
            },
            onMessage: (msg: Record<string, unknown>) => {
                switch (msg.t) {
                    case 'roster': {
                        const players = parseRoster(msg);
                        setRoster(players);
                        events.current.roster?.(players);
                        break;
                    }
                    case 'state':
                        events.current.state?.(msg);
                        break;
                    case 'chat': {
                        if (
                            typeof msg.id !== 'number' ||
                            typeof msg.text !== 'string'
                        ) {
                            return;
                        }
                        const chat = msg as unknown as ChatMessage;
                        setLog((prev) => [...prev.slice(-49), chat]);
                        events.current.chat?.(chat);
                        break;
                    }
                    case 'say': {
                        const say = parseSay(msg);
                        if (say) {
                            events.current.say?.(say);
                        }
                        break;
                    }
                    case 'emote':
                        if (
                            typeof msg.id === 'number' &&
                            typeof msg.e === 'string'
                        ) {
                            events.current.emote?.(msg.id, msg.e);
                        }
                        break;
                    case 'enter':
                        if (
                            typeof msg.booth === 'number' &&
                            typeof msg.game === 'string'
                        ) {
                            events.current.enter?.(msg.booth, msg.game);
                        }
                        break;
                    case 'kicked': {
                        const reason =
                            typeof msg.reason === 'string'
                                ? msg.reason
                                : 'removed';
                        setKicked(reason);
                        events.current.kicked?.(reason);
                        break;
                    }
                }
            },
        }),
        [],
    );

    const { status, send } = useGameSocket<WelcomeMessage>(
        kicked ? null : wsUrl,
        tokenUrl,
        'welcome',
        locale,
        handlers,
    );

    const lastInput = useRef({ x: 0, z: 0, at: 0 });
    const trailing = useRef<ReturnType<typeof setTimeout> | null>(null);
    const sendInput = useCallback(
        (x: number, z: number) => {
            const prev = lastInput.current;
            const now = performance.now();
            if (trailing.current) {
                clearTimeout(trailing.current);
                trailing.current = null;
            }
            if (Math.abs(prev.x - x) < 0.02 && Math.abs(prev.z - z) < 0.02) {
                return;
            }
            const flush = () => {
                const round = (n: number) => Math.round(n * 100) / 100;
                if (send({ t: 'input', x: round(x), z: round(z) })) {
                    lastInput.current = { x, z, at: performance.now() };
                }
            };
            // At most 20 messages a second; the latest direction always lands.
            const wait = 50 - (now - prev.at);
            if (wait > 0) {
                trailing.current = setTimeout(flush, wait);
                return;
            }
            flush();
        },
        [send],
    );

    return {
        status,
        welcome,
        roster,
        log,
        error,
        kicked,
        events,
        sendInput,
        sendChat: (text: string) => send({ t: 'chat', text }),
        /** Proximity DM; the server resolves the sender from the token. */
        sendSay: (to: number, text: string) => send({ t: 'say', to, text }),
        sendEmote: (e: string) => send({ t: 'emote', e }),
        enterBooth: (booth: number) => send({ t: 'enter', booth }),
        clearError: () => setError(null),
        parseState,
    };
}
