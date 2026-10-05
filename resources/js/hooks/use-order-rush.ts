import { useGameSocket } from '@/hooks/use-game-socket';
import { type CharacterLook } from '@/lib/character/draw-character';
import { useCallback, useReducer } from 'react';

/**
 * Order Rush client state. The Go referee (package orderrush) is
 * authoritative: it sends a full `state_sync` on connect and after lobby
 * changes, then streams `sequence_validated`, `sabotage_received`,
 * `powerup_result`, `action_broadcast`, `race_progress_broadcast` and
 * `podium_result`. The reducer only applies them; it never decides whether
 * an order is right and never sees the correct order.
 */
export type RushPhase = 'NONE' | 'LOBBY' | 'RACE_ACTIVE' | 'GAME_OVER';
export type RushRole = 'host' | 'player';
export type RushMode = 'RACE' | 'TIME_ATTACK';
export type PowerUp = 'TANGLE' | 'FREEZE' | 'SHIELD';
export type SequenceKind = 'cable' | 'protocol';

export interface RushPlayerRef {
    user_id: number;
    name: string;
    character?: CharacterLook | null;
}

export interface RushRosterEntry extends RushPlayerRef {
    grade: number;
    online: boolean;
    left: boolean;
}

export interface RushBoardEntry extends RushPlayerRef {
    id: string;
    username: string;
    avatar?: CharacterLook | null;
    score: number;
    step: number;
    streak: number;
    rank: number;
    online: boolean;
    left: boolean;
}

export interface SequenceItem {
    id: string;
    label: string;
    color?: string;
    stripe?: string;
}

export interface SequenceQuestion {
    id: string;
    set: string;
    category: string;
    kind: SequenceKind;
    title: string;
    description: string;
    total_slots: number;
    pool_items: SequenceItem[];
}

export interface CatalogEntry {
    key: string;
    category: string;
    kind: SequenceKind;
    title: string;
    slots: number;
}

export interface RushYou extends RushPlayerRef {
    score: number;
    streak: number;
    step: number;
    wrong: number;
    shield: boolean;
    inventory: PowerUp[];
    question?: SequenceQuestion;
    frozen_ms?: number;
    tangled_ms?: number;
}

export interface Validation {
    question_id: string;
    is_correct: boolean;
    error_slot_index: number;
    earned_score: number;
    speed_bonus?: number;
    streak: number;
    score: number;
    step: number;
    total_slots: number;
    kind: SequenceKind;
    duration_ms: number;
    powerup_granted?: PowerUp;
    inventory?: PowerUp[];
    next_question?: SequenceQuestion;
    /** Client receive time (drives the validator animation). */
    at: number;
}

export interface Sabotage {
    attacker_name: string;
    attacker?: RushPlayerRef;
    type: PowerUp;
    duration_ms: number;
    blocked: boolean;
    /** Client receive time; the effect lasts until at + duration_ms. */
    at: number;
}

export interface RushAction {
    id: number;
    at: number;
    type: PowerUp;
    blocked?: boolean;
    source_player: RushPlayerRef;
    target_player?: RushPlayerRef;
}

export interface RushRanking extends RushPlayerRef {
    rank: number;
    score: number;
    step: number;
    wrong: number;
    accuracy: number;
    avg_ms: number;
    best_streak: number;
    finished: boolean;
    left: boolean;
}

export interface RushResult {
    user_id: number;
    rank: number;
    won: boolean;
    points: number;
    score: number;
    step: number;
    wrong: number;
    accuracy: number;
    avg_ms: number;
    best_streak: number;
}

export interface RushState {
    phase: RushPhase;
    role: RushRole;
    pin?: string;
    host?: { user_id: number; name: string; online: boolean };
    players: RushRosterEntry[];
    min_players: number;
    max_players: number;
    mode: RushMode;
    modules: number;
    minutes: number;
    sets: string[];
    catalog: CatalogEntry[];
    race_targets: number[];
    time_limits: number[];
    combo_every: number;
    remaining_ms?: number;
    receivedAt: number;
    leaderboard: RushBoardEntry[];
    feed: RushAction[];
    you?: RushYou;
    validation?: Validation;
    sabotage?: Sabotage;
    podium?: RushRanking[];
    ranking?: RushRanking[];
    result?: RushResult;
    closed?: string;
}

const EMPTY: RushState = {
    phase: 'NONE',
    role: 'player',
    players: [],
    min_players: 2,
    max_players: 60,
    mode: 'RACE',
    modules: 10,
    minutes: 3,
    sets: [],
    catalog: [],
    race_targets: [],
    time_limits: [],
    combo_every: 3,
    receivedAt: 0,
    leaderboard: [],
    feed: [],
};

const FEED_SIZE = 15;

type Action =
    | { type: 'state'; msg: Record<string, unknown> }
    | { type: 'event'; msg: Record<string, unknown> };

function reduce(state: RushState, action: Action): RushState {
    const msg = action.msg;
    const now = Date.now();
    if (action.type === 'state') {
        const next = { ...EMPTY, ...(msg as Partial<RushState>) };
        const you = next.you;
        const sameQuestion =
            you?.question?.id !== undefined &&
            you.question.id === state.you?.question?.id;
        // A running freeze or tangle survives a resync.
        const sabotage =
            you && (you.frozen_ms ?? 0) > 0
                ? {
                      attacker_name: state.sabotage?.attacker_name ?? '',
                      type: 'FREEZE' as const,
                      duration_ms: you.frozen_ms ?? 0,
                      blocked: false,
                      at: now,
                  }
                : you && (you.tangled_ms ?? 0) > 0
                  ? {
                        attacker_name: state.sabotage?.attacker_name ?? '',
                        type: 'TANGLE' as const,
                        duration_ms: you.tangled_ms ?? 0,
                        blocked: false,
                        at: now,
                    }
                  : undefined;
        return {
            ...next,
            players: next.players ?? [],
            leaderboard: next.leaderboard ?? [],
            feed: next.feed ?? [],
            catalog: next.catalog ?? state.catalog,
            receivedAt: now,
            validation: sameQuestion ? state.validation : undefined,
            sabotage,
        };
    }
    switch (msg.t) {
        case 'sequence_validated': {
            const v = { ...(msg as unknown as Validation), at: now };
            const you = state.you
                ? {
                      ...state.you,
                      score: v.score,
                      streak: v.streak,
                      step: v.step,
                      wrong: v.is_correct
                          ? state.you.wrong
                          : state.you.wrong + 1,
                      inventory: v.inventory ?? state.you.inventory,
                      question: v.next_question ?? state.you.question,
                  }
                : state.you;
            return { ...state, you, validation: v };
        }
        case 'sabotage_received':
            return {
                ...state,
                sabotage: { ...(msg as unknown as Sabotage), at: now },
            };
        case 'powerup_result': {
            if (!state.you) {
                return state;
            }
            return {
                ...state,
                you: {
                    ...state.you,
                    inventory: (msg.inventory as PowerUp[]) ?? [],
                    shield: msg.type === 'SHIELD' ? true : state.you.shield,
                },
            };
        }
        case 'action_broadcast': {
            const entry = msg as unknown as RushAction;
            if (state.feed.some((f) => f.id === entry.id)) {
                return state;
            }
            let you = state.you;
            // Our shield broke on a blocked attack.
            if (
                you &&
                entry.blocked &&
                entry.target_player?.user_id === you.user_id
            ) {
                you = { ...you, shield: false };
            }
            return {
                ...state,
                you,
                feed: [...state.feed, entry].slice(-FEED_SIZE),
            };
        }
        case 'race_progress_broadcast':
            return {
                ...state,
                leaderboard: msg.leaderboard as RushBoardEntry[],
                remaining_ms: msg.remaining_ms as number,
                receivedAt: now,
            };
        case 'podium_result':
            return {
                ...state,
                phase: 'GAME_OVER',
                podium: msg.podium as RushRanking[],
                ranking: msg.ranking as RushRanking[],
                result: (msg.you as RushResult | undefined) ?? state.result,
                sabotage: undefined,
            };
        default:
            return state;
    }
}

/** WebSocket link to the Order Rush referee for a host screen or a player. */
export function useOrderRush(
    wsUrl: string | null,
    role: RushRole,
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
        `/games/order-rush/token?role=${role}`,
        'state_sync',
        locale,
        { onState, onError, onMessage },
    );

    return { state, ...socket };
}
