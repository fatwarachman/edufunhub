import { type RoomPayload, type RoomSeat } from '@/components/multiplayer/room';
import {
    type OptionMediaData,
    type QuestionMediaData,
} from '@/components/question-media';
import { useGameSocket } from '@/hooks/use-game-socket';
import {
    answerKey,
    answerMessage,
    canAnswer as canAnswerNow,
    isValidOption,
} from '@/lib/tug-of-war';
import { useCallback, useState } from 'react';

export interface TugSeat extends RoomSeat {
    team: number;
    bot?: boolean;
    pulls: number;
    correct: number;
    wrong: number;
    answered: boolean;
    mvp: boolean;
}

export interface TugTeam {
    team: number;
    size: number;
    pulls: number;
    points: number;
}

export interface TugState extends RoomPayload<TugSeat> {
    subject_fallback?: boolean;
    question_count: number;
    question_counts: number[];
    win_steps: number;
    stage: 'countdown' | 'question' | 'reveal' | null;
    round: number;
    number: number;
    rope: number;
    remaining_ms: number;
    question: null | {
        id: string;
        number: number;
        text: string;
        media?: QuestionMediaData | null;
        options: string[];
        option_media?: OptionMediaData[] | null;
        subject: string;
        worth: number;
    };
    your_choice: number | null;
    reveal: null | {
        number: number;
        team: number;
        seat: number;
        bot: boolean;
        name: string;
        correct_index: number;
        prompt: string;
        answer: string;
        hint: string;
    };
    teams: TugTeam[];
    winner?: number | null;
    forfeit: boolean;
    stopped: boolean;
    solo: boolean;
    result: null | {
        watching: boolean;
        points: number;
        mvp: boolean;
        team: number;
        team_points: number;
        won: boolean;
    };
    match?: { key: string };
}

/** Only sends intents; the Go referee owns every outcome and deadline. */
export function useTugOfWar(wsUrl: string | null, locale: string) {
    const [state, setState] = useState<TugState | null>(null);
    const [error, setError] = useState<string | null>(null);
    /** Answer key of the round an answer was just sent for. */
    const [pending, setPending] = useState<string | null>(null);
    const onState = useCallback((next: TugState) => {
        setState(next.pin ? next : null);
        setError(null);
        setPending((key) => (key === answerKey(next) ? key : null));
    }, []);
    const onError = useCallback((code: string) => {
        setError(code);
        setPending(null);
    }, []);
    const onMessage = useCallback((message: Record<string, unknown>) => {
        if (message.t === 'left') {
            setState(null);
            setPending(null);
        }
    }, []);
    const connection = useGameSocket<TugState>(
        wsUrl,
        '/games/tug-of-war/token',
        'tugofwar_state',
        locale,
        { onState, onError, onMessage },
    );
    const online = connection.status === 'online';
    const canAnswer = Boolean(state && canAnswerNow(state, online, pending));
    const answer = (option: number) => {
        if (
            !state ||
            !isValidOption(state, option) ||
            !canAnswerNow(state, online, pending)
        ) {
            return;
        }
        if (connection.send(answerMessage(state, option))) {
            setPending(answerKey(state));
        } else {
            setError('unknown');
        }
    };
    return { ...connection, state, error, canAnswer, answer };
}
