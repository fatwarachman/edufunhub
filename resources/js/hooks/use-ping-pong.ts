import { type RoomPayload, type RoomSeat } from '@/components/multiplayer/room';
import { useGameSocket } from '@/hooks/use-game-socket';
import {
    answerKey,
    answerMessage,
    canSubmitAnswer,
    isValidOption,
} from '@/lib/ping-pong';
import { useCallback, useRef, useState } from 'react';

export interface PingPongSeat extends RoomSeat {
    bot?: boolean;
}
export interface PingPongState extends RoomPayload<PingPongSeat> {
    round: number;
    turn_number?: number;
    turn: number;
    subject?: string;
    subject_fallback?: boolean;
    question: null | {
        id: string;
        text: string;
        options: string[];
        subject: string;
        worth: number;
    };
    remaining_ms: number;
    goals: [number, number];
    target: number;
    max_rounds: number;
    rally: number;
    feedback: null | {
        round: number;
        seat: number;
        correct: boolean;
        goal: boolean;
        prompt: string;
        answer: string;
        hint: string;
    };
    winner: number | null;
    stopped: boolean;
    result: { points: number } | null;
    match?: { key: string };
}

/** Only sends intents; the Go referee owns every outcome and deadline. */
export function usePingPong(wsUrl: string | null, locale: string) {
    const [state, setState] = useState<PingPongState | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [submitted, setSubmitted] = useState<string | null>(null);
    const [choice, setChoice] = useState<number | null>(null);
    const pending = useRef<string | null>(null);
    const onState = useCallback((next: PingPongState) => {
        setState(next.pin ? next : null);
        setError(null);
        const key = answerKey(next);
        if (pending.current !== key) {
            pending.current = null;
            setSubmitted(null);
        }
    }, []);
    const onError = useCallback((code: string) => {
        setError(code);
        pending.current = null;
        setSubmitted(null);
    }, []);
    const onMessage = useCallback((message: Record<string, unknown>) => {
        if (message.t === 'left') {
            setState(null);
            pending.current = null;
            setSubmitted(null);
        }
    }, []);
    const connection = useGameSocket<PingPongState>(
        wsUrl,
        '/games/ping-pong/token',
        'pingpong_state',
        locale,
        { onState, onError, onMessage },
    );
    const answer = (option: number) => {
        if (
            !state ||
            !isValidOption(state, option) ||
            !canSubmitAnswer(
                state,
                connection.status === 'online',
                pending.current,
            )
        )
            return;
        const key = answerKey(state);
        pending.current = key;
        if (connection.send(answerMessage(state, option))) {
            setSubmitted(key);
            setChoice(option);
        } else {
            pending.current = null;
            setError('unknown');
        }
    };
    return {
        ...connection,
        state,
        error,
        submitted: submitted === (state ? answerKey(state) : ''),
        choice: submitted === (state ? answerKey(state) : '') ? choice : null,
        answer,
    };
}
