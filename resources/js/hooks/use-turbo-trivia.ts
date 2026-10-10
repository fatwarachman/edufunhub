import { type QuestionMediaData } from '@/components/question-media';
import { useGameSocket } from '@/hooks/use-game-socket';
import { type CharacterLook } from '@/lib/character/draw-character';
import { useCallback, useReducer } from 'react';

/**
 * Turbo Trivia client state. The Go referee (package turbotrivia) is
 * authoritative: it sends a full `state_sync` on connect and on lobby
 * changes, the projector receives a 20 Hz `tick` (kart positions, effects,
 * hazards) and phones a 5 Hz `kart` status. The reducer only applies them.
 */
export type TurboPhase = 'NONE' | 'LOBBY' | 'COUNTDOWN' | 'RACE' | 'GAME_OVER';
export type TurboRole = 'host' | 'player';
export type TurboItem = 'BANANA' | 'MISSILE' | 'LIGHTNING' | 'SHIELD';
export type TurboEffect =
    'NITRO' | 'STUTTER' | 'SPIN' | 'STAGGER' | 'SHRINK' | 'SHIELD';

export const TURBO_ITEMS: TurboItem[] = [
    'BANANA',
    'MISSILE',
    'LIGHTNING',
    'SHIELD',
];

export interface TurboRosterEntry {
    user_id: number;
    name: string;
    grade: number;
    character?: CharacterLook | null;
    online: boolean;
    left: boolean;
    order: number;
}

/** Compact kart of a tick (projector). */
export interface TurboKart {
    id: number;
    /** Distance driven in laps (0..laps). */
    p: number;
    /** Speed in km/h. */
    v: number;
    fx: TurboEffect[];
    rank: number;
    fin: boolean;
    left: boolean;
    on: boolean;
    items: number;
    ans: boolean;
}

export interface TurboBanana {
    id: number;
    x: number;
}

export interface TurboMissile {
    id: number;
    from: number;
    target: number;
    p: number;
}

export interface TurboRef {
    id: number;
    name: string;
}

export interface TurboEvent {
    kind: 'item' | 'banana_hit' | 'missile_hit' | 'finish' | 'left' | 'nitro';
    item?: TurboItem;
    by?: TurboRef;
    target?: TurboRef;
    struck?: TurboRef[];
    immune?: TurboRef[];
    blocked?: boolean;
    place?: number;
    x?: number;
    at_ms?: number;
    /** Client-side id for list keys. */
    uid?: number;
}

export interface TurboQuiz {
    qid: number;
    number: number;
    stage: 'QUESTION' | 'REVEAL' | 'DONE';
    time_limit: number;
    remaining_ms: number;
    question: {
        text: string;
        media?: QuestionMediaData | null;
        subject: string;
        worth: number;
    };
    options: string[];
    correct_index?: number;
    hint?: string;
}

export interface TurboYou {
    user_id: number;
    items: TurboItem[];
    answered: boolean;
    choice?: number;
    /** Result of the current question (set by answer_result). */
    correct?: boolean;
    finished: boolean;
    speed: number;
    fx: TurboEffect[];
    rank: number;
    of?: number;
    progress: number;
    lap?: number;
}

export interface TurboRanking {
    user_id: number;
    name: string;
    rank: number;
    character?: CharacterLook | null;
    finished: boolean;
    race_ms: number;
    progress: number;
    correct: number;
    wrong: number;
    accuracy: number;
    items_used: number;
    hits: number;
    left: boolean;
}

export interface TurboResult {
    user_id: number;
    rank: number;
    won: boolean;
    points: number;
    finished: boolean;
    race_ms: number;
    correct: number;
    wrong: number;
    accuracy: number;
    total: number;
}

export interface TurboState {
    phase: TurboPhase;
    role: TurboRole;
    pin?: string;
    subject?: string;
    host?: { user_id: number; name: string; online: boolean };
    players: TurboRosterEntry[];
    min_players: number;
    max_players: number;
    laps: number;
    total: number;
    question_counts: number[];
    asked: number;
    countdown_ms?: number;
    receivedAt: number;
    karts: TurboKart[];
    /** Karts of the previous tick (projector interpolation). */
    prevKarts: TurboKart[];
    bananas: TurboBanana[];
    missiles: TurboMissile[];
    /** Local time of the last tick (projector interpolation). */
    tickAt: number;
    race_ms?: number;
    answered?: number;
    feed: TurboEvent[];
    quiz?: TurboQuiz;
    you?: TurboYou;
    podium?: TurboRanking[];
    ranking?: TurboRanking[];
    result?: TurboResult;
    closed?: string;
}

const FEED_SIZE = 12;
let eventSeq = 0;

const EMPTY: TurboState = {
    phase: 'NONE',
    role: 'player',
    players: [],
    min_players: 2,
    max_players: 40,
    laps: 3,
    total: 12,
    question_counts: [10, 12, 15],
    asked: 0,
    receivedAt: 0,
    karts: [],
    prevKarts: [],
    bananas: [],
    missiles: [],
    tickAt: 0,
    feed: [],
};

type Action =
    | { type: 'state'; msg: Record<string, unknown> }
    | { type: 'event'; msg: Record<string, unknown> };

function withUid(event: TurboEvent): TurboEvent {
    eventSeq += 1;
    return { ...event, uid: eventSeq };
}

function reduce(state: TurboState, action: Action): TurboState {
    const msg = action.msg;
    const now = Date.now();
    if (action.type === 'state') {
        const next = { ...EMPTY, ...(msg as Partial<TurboState>) };
        return {
            ...next,
            players: next.players ?? [],
            karts: next.karts ?? [],
            prevKarts: next.karts ?? [],
            bananas: next.bananas ?? [],
            missiles: next.missiles ?? [],
            feed: (next.feed ?? []).map(withUid),
            receivedAt: now,
            tickAt: now,
        };
    }
    switch (msg.t) {
        case 'tick':
            return {
                ...state,
                phase: state.phase === 'GAME_OVER' ? state.phase : 'RACE',
                karts: msg.karts as TurboKart[],
                prevKarts: state.karts,
                bananas: msg.bananas as TurboBanana[],
                missiles: msg.missiles as TurboMissile[],
                race_ms: msg.race_ms as number,
                answered: msg.answered as number,
                tickAt: now,
                quiz: state.quiz
                    ? {
                          ...state.quiz,
                          remaining_ms: msg.remaining_ms as number,
                      }
                    : state.quiz,
                receivedAt:
                    state.quiz?.stage === 'QUESTION' ? now : state.receivedAt,
            };
        case 'kart':
            return state.you
                ? {
                      ...state,
                      phase: state.phase === 'GAME_OVER' ? state.phase : 'RACE',
                      you: {
                          ...state.you,
                          speed: msg.speed as number,
                          fx: msg.fx as TurboEffect[],
                          rank: msg.rank as number,
                          of: msg.of as number,
                          progress: msg.progress as number,
                          lap: msg.lap as number,
                          items: msg.items as TurboItem[],
                          finished: msg.finished as boolean,
                      },
                      quiz: state.quiz
                          ? {
                                ...state.quiz,
                                remaining_ms: msg.remaining_ms as number,
                            }
                          : state.quiz,
                      receivedAt:
                          state.quiz?.stage === 'QUESTION'
                              ? now
                              : state.receivedAt,
                  }
                : state;
        case 'question_start':
            return {
                ...state,
                phase: 'RACE',
                asked: msg.number as number,
                total: msg.total as number,
                receivedAt: now,
                quiz: {
                    qid: msg.qid as number,
                    number: msg.number as number,
                    stage: 'QUESTION',
                    time_limit: msg.time_limit as number,
                    remaining_ms: msg.remaining_ms as number,
                    question: msg.question as TurboQuiz['question'],
                    options: msg.options as string[],
                },
                you: state.you
                    ? {
                          ...state.you,
                          answered: false,
                          choice: undefined,
                          correct: undefined,
                      }
                    : state.you,
            };
        case 'answer_result':
            return state.you && state.quiz?.qid === msg.qid
                ? {
                      ...state,
                      you: {
                          ...state.you,
                          answered: true,
                          correct: msg.correct as boolean,
                          items: (msg.items as TurboItem[]) ?? state.you.items,
                      },
                  }
                : state;
        case 'question_end':
            return state.quiz && state.quiz.qid === msg.qid
                ? {
                      ...state,
                      quiz: {
                          ...state.quiz,
                          stage: 'REVEAL',
                          remaining_ms: 0,
                          correct_index: msg.correct_index as number,
                          hint: msg.hint as string,
                      },
                  }
                : state;
        case 'item_gained':
        case 'item_used':
            return state.you
                ? {
                      ...state,
                      you: { ...state.you, items: msg.items as TurboItem[] },
                  }
                : state;
        case 'finished':
            return state.you
                ? { ...state, you: { ...state.you, finished: true } }
                : state;
        case 'item_triggered':
        case 'race_event': {
            const event = msg.event as TurboEvent;
            // Nitro events are projector-only animations, not ticker lines.
            if (event.kind === 'nitro') {
                return state;
            }
            return {
                ...state,
                feed: [...state.feed, withUid(event)].slice(-FEED_SIZE),
            };
        }
        case 'podium_result':
            return {
                ...state,
                phase: 'GAME_OVER',
                podium: msg.podium as TurboRanking[],
                ranking: msg.ranking as TurboRanking[],
                result: (msg.you as TurboResult | undefined) ?? state.result,
                missiles: [],
            };
        default:
            return state;
    }
}

/** WebSocket link to the Turbo Trivia referee for the arena or a phone. */
export function useTurboTrivia(
    wsUrl: string | null,
    role: TurboRole,
    locale: string,
    onError: (code: string) => void,
    onEvent?: (msg: Record<string, unknown>) => void,
) {
    const [state, dispatch] = useReducer(reduce, EMPTY);
    const onState = useCallback(
        (msg: Record<string, unknown>) => dispatch({ type: 'state', msg }),
        [],
    );
    const onMessage = useCallback(
        (msg: Record<string, unknown>) => {
            dispatch({ type: 'event', msg });
            onEvent?.(msg);
        },
        [onEvent],
    );
    const socket = useGameSocket<Record<string, unknown>>(
        wsUrl,
        `/games/turbo-trivia/token?role=${role}`,
        'state_sync',
        locale,
        { onState, onError, onMessage },
    );

    return { state, ...socket };
}
