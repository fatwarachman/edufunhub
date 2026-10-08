import { useGameSocket } from '@/hooks/use-game-socket';
import { type CharacterLook } from '@/lib/character/draw-character';
import { useCallback, useReducer } from 'react';

/**
 * Floor Drop client state. The Go referee (package floordrop) is
 * authoritative: it sends a full `state_sync` on connect and after lobby
 * changes, and streams round events (`question_start`, `answer_progress`,
 * `lock_answers`, `tile_drop`, `round_summary`, `player_eliminated`,
 * `podium_result`). The reducer only applies them; it never decides who
 * survives.
 */
export type FloorPhase =
    | 'NONE'
    | 'LOBBY'
    | 'QUESTION_ACTIVE'
    | 'LOCK_ANSWERS'
    | 'REVEAL_DROP'
    | 'ROUND_SUMMARY'
    | 'GAME_OVER';

export type FloorRole = 'host' | 'player';

export interface FloorPlayer {
    user_id: number;
    name: string;
    grade: number;
    character?: CharacterLook | null;
    online: boolean;
    alive: boolean;
    out_round: number;
    reason: string;
    left: boolean;
    /** Tile the player stands on (shown after answers lock). */
    choice?: number;
    /** Wrong answers the player's floor can still take. */
    lives?: number;
}

export interface FloorRanking {
    user_id: number;
    name: string;
    rank: number;
    character?: CharacterLook | null;
    survival_ms: number;
    accuracy: number;
    correct: number;
    rounds: number;
    out_round: number;
    reason: string;
    lives?: number;
}

export interface FloorResult {
    user_id: number;
    rank: number;
    won: boolean;
    points: number;
    survival_ms: number;
    accuracy: number;
    correct: number;
    rounds: number;
}

export interface FloorYou {
    user_id: number;
    alive: boolean;
    out_round: number;
    reason: string;
    answered: boolean;
    choice?: number;
    lives?: number;
}

export interface FloorState {
    phase: FloorPhase;
    role: FloorRole;
    pin?: string;
    subject?: string;
    host?: { user_id: number; name: string; online: boolean };
    players: FloorPlayer[];
    alive: number;
    answered: number;
    min_players: number;
    max_players: number;
    round: number;
    round_id?: number;
    time_limit?: number;
    /** Server remaining time when the snapshot arrived. */
    remaining_ms?: number;
    receivedAt: number;
    ready_ms?: number;
    next_time_limit?: number;
    question?: { text: string; subject: string; worth: number };
    options?: string[];
    tiles?: number[];
    correct_index?: number;
    eliminated_user_ids?: number[];
    /** Players whose floor cracked (lost a life) this round. */
    cracked_user_ids?: number[];
    sudden_death?: boolean;
    lives_max?: number;
    /** Game length chosen by the host (minutes) and the options. */
    minutes?: number;
    durations?: number[];
    player_limits?: number[];
    /** Time left in the game when the snapshot or event arrived. */
    ends_ms?: number;
    /** Local clock time (ms) the game ends, derived from ends_ms. */
    ends_at?: number;
    hint?: string;
    you?: FloorYou;
    podium?: FloorRanking[];
    ranking?: FloorRanking[];
    result?: FloorResult;
    closed?: string;
}

const EMPTY: FloorState = {
    phase: 'NONE',
    role: 'player',
    players: [],
    alive: 0,
    answered: 0,
    min_players: 2,
    max_players: 100,
    round: 0,
    receivedAt: 0,
    lives_max: 3,
};

/** Applies the server's lives map ({user_id: lives}) to players and you. */
function withLives(
    state: FloorState,
    lives: Record<string, number> | undefined,
): Pick<FloorState, 'players' | 'you'> {
    if (!lives) {
        return { players: state.players, you: state.you };
    }
    return {
        players: state.players.map((p) =>
            lives[String(p.user_id)] === undefined
                ? p
                : { ...p, lives: lives[String(p.user_id)] },
        ),
        you:
            state.you && lives[String(state.you.user_id)] !== undefined
                ? { ...state.you, lives: lives[String(state.you.user_id)] }
                : state.you,
    };
}

type Action =
    | { type: 'state'; msg: Record<string, unknown> }
    | { type: 'event'; msg: Record<string, unknown> };

function markOut(
    players: FloorPlayer[],
    ids: number[],
    round: number,
    reason?: string,
): FloorPlayer[] {
    const out = new Set(ids);
    return players.map((p) =>
        out.has(p.user_id) && p.alive
            ? {
                  ...p,
                  alive: false,
                  out_round: round,
                  reason:
                      reason ?? (p.choice === undefined ? 'timeout' : 'wrong'),
              }
            : p,
    );
}

/** Turns the server's relative ends_ms into a local end time. */
function reduce(state: FloorState, action: Action): FloorState {
    const next = reduceMessage(state, action);
    const endsMs = (action.msg as { ends_ms?: unknown }).ends_ms;
    if (typeof endsMs === 'number') {
        return { ...next, ends_at: Date.now() + endsMs };
    }
    if (next.phase === 'LOBBY' || next.phase === 'GAME_OVER') {
        return { ...next, ends_at: undefined };
    }
    return next.ends_at === undefined && state.ends_at !== undefined
        ? { ...next, ends_at: state.ends_at }
        : next;
}

function reduceMessage(state: FloorState, action: Action): FloorState {
    const msg = action.msg;
    const now = Date.now();
    if (action.type === 'state') {
        const next = { ...EMPTY, ...(msg as Partial<FloorState>) };
        return { ...next, players: next.players ?? [], receivedAt: now };
    }
    switch (msg.t) {
        case 'question_start': {
            const you = state.you
                ? { ...state.you, answered: false, choice: undefined }
                : state.you;
            return {
                ...state,
                phase: 'QUESTION_ACTIVE',
                round: msg.round as number,
                round_id: msg.round_id as number,
                time_limit: msg.time_limit as number,
                remaining_ms: msg.remaining_ms as number,
                receivedAt: now,
                question: msg.question as FloorState['question'],
                options: msg.options as string[],
                alive: msg.alive as number,
                ends_ms: msg.ends_ms as number | undefined,
                answered: 0,
                tiles: undefined,
                correct_index: undefined,
                eliminated_user_ids: undefined,
                cracked_user_ids: undefined,
                sudden_death: undefined,
                hint: undefined,
                players: state.players.map((p) => ({
                    ...p,
                    choice: undefined,
                })),
                you,
            };
        }
        case 'answer_ack':
            return state.you
                ? {
                      ...state,
                      you: {
                          ...state.you,
                          answered: true,
                          choice: msg.choice as number,
                      },
                  }
                : state;
        case 'answer_progress':
            return msg.round_id === state.round_id
                ? {
                      ...state,
                      answered: msg.answered as number,
                      alive: msg.alive as number,
                  }
                : state;
        case 'lock_answers': {
            const choices = (msg.choices ?? {}) as Record<string, number>;
            return {
                ...state,
                phase: 'LOCK_ANSWERS',
                remaining_ms: 0,
                receivedAt: now,
                tiles: msg.tiles as number[],
                players: state.players.map((p) => ({
                    ...p,
                    choice: choices[String(p.user_id)],
                })),
            };
        }
        case 'tile_drop': {
            const ids = (msg.eliminated_user_ids ?? []) as number[];
            const youOut = state.you && ids.includes(state.you.user_id);
            const lived = withLives(
                state,
                msg.lives as Record<string, number> | undefined,
            );
            state = { ...state, ...lived };
            return {
                ...state,
                cracked_user_ids: (msg.cracked_user_ids ?? []) as number[],
                phase: 'REVEAL_DROP',
                receivedAt: now,
                correct_index: msg.correct_index as number,
                eliminated_user_ids: ids,
                sudden_death: msg.sudden_death as boolean,
                alive: msg.survivors as number,
                tiles: msg.tiles as number[],
                hint: msg.hint as string,
                players: markOut(state.players, ids, msg.round as number),
                you:
                    state.you && youOut
                        ? {
                              ...state.you,
                              alive: false,
                              out_round: msg.round as number,
                              reason:
                                  state.you.choice === undefined
                                      ? 'timeout'
                                      : 'wrong',
                          }
                        : state.you,
            };
        }
        case 'round_summary':
            return {
                ...state,
                phase: 'ROUND_SUMMARY',
                receivedAt: now,
                alive: msg.survivors as number,
                next_time_limit: msg.next_time_limit as number,
                ends_ms: msg.ends_ms as number | undefined,
            };
        case 'player_eliminated': {
            const ids = (msg.user_ids ?? []) as number[];
            const reason = msg.reason as string;
            const youOut = state.you && ids.includes(state.you.user_id);
            return {
                ...state,
                alive: msg.survivors as number,
                players: markOut(state.players, ids, state.round, reason),
                you:
                    state.you && youOut
                        ? {
                              ...state.you,
                              alive: false,
                              out_round: state.round,
                              reason,
                          }
                        : state.you,
            };
        }
        case 'podium_result':
            return {
                ...state,
                phase: 'GAME_OVER',
                receivedAt: now,
                podium: msg.podium as FloorRanking[],
                ranking: msg.ranking as FloorRanking[],
                result: (msg.you as FloorResult | undefined) ?? state.result,
            };
        default:
            return state;
    }
}

/** WebSocket link to the Floor Drop referee for a host screen or a player. */
export function useFloorDrop(
    wsUrl: string | null,
    role: FloorRole,
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
        `/games/floor-drop/token?role=${role}`,
        'state_sync',
        locale,
        { onState, onError, onMessage },
    );

    return { state, ...socket };
}
