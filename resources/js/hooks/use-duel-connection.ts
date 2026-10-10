import { type RoomPayload } from '@/components/multiplayer/room';
import { type QuestionMediaData } from '@/components/question-media';
import { useGameSocket } from '@/hooks/use-game-socket';
import { type CharacterLook } from '@/lib/character/draw-character';

export type DuelConnectionStatus =
    'connecting' | 'online' | 'reconnecting' | 'offline' | 'grade_required';

export type DuelPhase =
    'idle' | 'queue' | 'countdown' | 'question' | 'reveal' | 'done';

export interface DuelSide {
    name: string;
    grade: number;
    character?: CharacterLook | null;
    score?: number;
    correct?: number;
    history?: boolean[];
}

export interface DuelOpponent extends DuelSide {
    /** Account id of a human opponent (absent for bots). */
    user_id?: number;
    bot: boolean;
    online: boolean;
    answered: boolean;
}

export interface DuelState {
    phase: DuelPhase;
    subject?: string;
    subject_fallback?: boolean;
    round: number;
    total: number;
    round_ms: number;
    match_id?: string;
    waited_ms?: number;
    bot_after_ms?: number;
    countdown_ms?: number;
    you?: DuelSide;
    opponent?: DuelOpponent;
    /** Invite room (standard lobby) while waiting for a friend. */
    room?: RoomPayload;
    question?: {
        id: string;
        subject: string;
        text: string;
        media?: QuestionMediaData | null;
        options: string[];
        choice: number;
        remaining_ms?: number;
    };
    reveal?: {
        answer: number;
        yours: number;
        theirs: number;
        gained: number;
        opponent_gained: number;
        hint: string;
    };
    result?: {
        outcome: 'win' | 'lose' | 'draw';
        points: number;
        correct: number;
        wrong: number;
        score: number;
        opponent_score: number;
    };
}

/** WebSocket link to the Go duel referee (matching, timers, judging, points). */
export function useDuelConnection(
    wsUrl: string | null,
    locale: string,
    handlers: {
        onState: (state: DuelState) => void;
        onError: (code: string) => void;
    },
) {
    return useGameSocket<DuelState>(
        wsUrl,
        '/games/quiz-duel/token',
        'duel_state',
        locale,
        handlers,
    );
}
