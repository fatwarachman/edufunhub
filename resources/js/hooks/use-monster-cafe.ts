import { useGameSocket } from '@/hooks/use-game-socket';
import { type CharacterLook } from '@/lib/character/draw-character';
import { useCallback, useReducer } from 'react';

/**
 * Monster Café client state. The Go referee (package monstercafe) is
 * authoritative: it sends `state_sync` (room, roster, leaderboard),
 * `kitchen_sync` (private kitchen of a player) and streams events
 * (`question`, `answer_result`, `order_served`, `order_failed`, `burnt`,
 * `rat_appear`, `rat_result`, `pie_hit`, `pie_result`, `action_broadcast`,
 * `leaderboard_sync`, `podium_result`). The reducer only applies them and
 * turns every remaining `*_ms` into an absolute deadline (`*At`).
 */
export type MonsterCafePhase = 'NONE' | 'LOBBY' | 'PLAYING' | 'GAME_OVER';
export type MonsterCafeRole = 'host' | 'player';
/** Page role from `?role=`; `solo` plays alone with a player token. */
export type MonsterCafePageRole = MonsterCafeRole | 'solo';
export type MonsterKind =
    'SLIME' | 'CYCLOPS' | 'VAMPIRE' | 'YETI' | 'DRAGON' | 'GHOST';
export type Ingredient =
    | 'BUN'
    | 'PATTY'
    | 'CHEESE'
    | 'LETTUCE'
    | 'TOMATO'
    | 'SAUCE'
    | 'DOUGH'
    | 'MUSHROOM'
    | 'PEPPERONI'
    | 'OLIVE';
export type Dish = 'BURGER' | 'PIZZA' | 'MESS';
export type Mood = 'HAPPY' | 'IMPATIENT' | 'ANGRY';
export type OvenState = 'EMPTY' | 'COOKING' | 'READY' | 'BURNT';
export type FeedKind = 'SERVED' | 'ANGRY' | 'BURNT' | 'RAT' | 'PIE';

/** Ingredient order of the pantry grid (contract enum order). */
export const PANTRY: Ingredient[] = [
    'BUN',
    'PATTY',
    'CHEESE',
    'LETTUCE',
    'TOMATO',
    'SAUCE',
    'DOUGH',
    'MUSHROOM',
    'PEPPERONI',
    'OLIVE',
];

export interface MonsterCafePlayerRef {
    user_id: number;
    name: string;
    character?: CharacterLook | null;
}

export interface MonsterCafeRosterEntry extends MonsterCafePlayerRef {
    grade: number;
    online: boolean;
    left: boolean;
}

export interface MonsterCafeBoardEntry extends MonsterCafePlayerRef {
    coins: number;
    served: number;
    rank: number;
    online: boolean;
    left: boolean;
}

export interface MonsterCafeAction {
    id: number;
    at: number;
    kind: FeedKind;
    player: MonsterCafePlayerRef;
    target?: MonsterCafePlayerRef;
    dish?: Dish;
    coins?: number;
}

export interface MonsterCafeRanking extends MonsterCafePlayerRef {
    rank: number;
    coins: number;
    served: number;
    burnt: number;
    angry: number;
    correct: number;
    answered: number;
    accuracy: number;
    points: number;
    left?: boolean;
}

export interface MonsterCafeResult {
    user_id: number;
    rank: number;
    won?: boolean;
    points: number;
    coins: number;
    served: number;
    correct?: number;
    answered?: number;
}

export interface MonsterCafeOrder {
    id: string;
    monster: MonsterKind;
    dish: Dish;
    recipe: Ingredient[];
    patience_ms: number;
    patience_total_ms: number;
    mood: Mood;
    /** Absolute (client clock) time the monster leaves. */
    deadlineAt: number;
}

export interface MonsterCafeOven {
    state: OvenState;
    dish: Dish | '';
    items: Ingredient[];
    ready_in_ms: number;
    burn_in_ms: number;
    readyAt: number;
    burnAt: number;
}

export interface MonsterCafeQuestion {
    question_id: string;
    ingredient: Ingredient;
    number: number;
    text: string;
    subject: string;
    options: string[];
    /** Client time the question arrived. */
    receivedAt: number;
}

export interface MonsterCafeRat {
    rat_id: string;
    ingredient: Ingredient;
    steal_in_ms: number;
    stealAt: number;
}

export interface MonsterCafeKitchen {
    orders: MonsterCafeOrder[];
    tray: Ingredient[];
    plate: Ingredient[];
    oven: MonsterCafeOven;
    dish: { dish: Dish; items: Ingredient[] } | null;
    question: MonsterCafeQuestion | null;
    cooldown_ms: number;
    cooldownAt: number;
    rat: MonsterCafeRat | null;
    pies: number;
    score: number;
    served: number;
    streak: number;
    correct: number;
    answered: number;
    rank: number;
    of: number;
}

export interface MonsterCafeAnswer {
    question_id: string;
    correct: boolean;
    choice: number;
    correct_index: number;
    ingredient?: Ingredient;
    cooldown_ms?: number;
    hint?: string;
    at: number;
}

export interface MonsterCafePieHit {
    attacker: MonsterCafePlayerRef;
    duration_ms: number;
    /** Client time the blur ends. */
    until: number;
    seq: number;
}

export interface MonsterCafeState {
    phase: MonsterCafePhase;
    role: MonsterCafeRole;
    pin?: string;
    /** Solo kitchen: one player is also the room owner. */
    solo?: boolean;
    owner?: number;
    host_name?: string;
    roster: MonsterCafeRosterEntry[];
    minutes: number;
    minutes_options: number[];
    subject?: string;
    remaining_ms?: number;
    /** Client time `remaining_ms` was stamped. */
    receivedAt: number;
    leaderboard: MonsterCafeBoardEntry[];
    feed: MonsterCafeAction[];
    you?: number;
    kitchen?: MonsterCafeKitchen;
    answer?: MonsterCafeAnswer;
    pieHit?: MonsterCafePieHit;
    podium?: MonsterCafeRanking[];
    ranking?: MonsterCafeRanking[];
    result?: MonsterCafeResult;
    closed?: string;
}

export type MonsterCafeSend = (msg: Record<string, unknown>) => boolean;

const EMPTY: MonsterCafeState = {
    phase: 'NONE',
    role: 'player',
    roster: [],
    minutes: 5,
    minutes_options: [3, 5, 7, 10, 15],
    receivedAt: 0,
    leaderboard: [],
    feed: [],
};

/** Feed entries kept on screen. */
const FEED_SIZE = 20;

type Raw = Record<string, unknown>;

function num(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function list<T>(value: unknown): T[] {
    return Array.isArray(value) ? (value as T[]) : [];
}

/** Converts a raw `kitchen_sync` into absolute deadlines. */
export function toKitchen(
    raw: Raw,
    now: number,
    previous?: MonsterCafeKitchen,
): MonsterCafeKitchen {
    const ovenRaw = (raw.oven ?? {}) as Raw;
    const questionRaw = raw.question as Raw | null | undefined;
    const ratRaw = raw.rat as Raw | null | undefined;
    const dishRaw = raw.dish as Raw | null | undefined;
    const question: MonsterCafeQuestion | null = questionRaw
        ? {
              question_id: String(questionRaw.question_id ?? ''),
              ingredient: questionRaw.ingredient as Ingredient,
              number: num(questionRaw.number),
              text: String(questionRaw.text ?? ''),
              subject: String(questionRaw.subject ?? ''),
              options: list<string>(questionRaw.options),
              receivedAt:
                  previous?.question &&
                  previous.question.question_id === questionRaw.question_id
                      ? previous.question.receivedAt
                      : now,
          }
        : null;
    return {
        orders: list<Raw>(raw.orders).map((o) => ({
            id: String(o.id ?? ''),
            monster: o.monster as MonsterKind,
            dish: o.dish as Dish,
            recipe: list<Ingredient>(o.recipe),
            patience_ms: num(o.patience_ms),
            patience_total_ms: Math.max(1, num(o.patience_total_ms)),
            mood: (o.mood as Mood) ?? 'HAPPY',
            deadlineAt: now + num(o.patience_ms),
        })),
        tray: list<Ingredient>(raw.tray),
        plate: list<Ingredient>(raw.plate),
        oven: {
            state: (ovenRaw.state as OvenState) ?? 'EMPTY',
            dish: (ovenRaw.dish as Dish | '') ?? '',
            items: list<Ingredient>(ovenRaw.items),
            ready_in_ms: num(ovenRaw.ready_in_ms),
            burn_in_ms: num(ovenRaw.burn_in_ms),
            readyAt: now + num(ovenRaw.ready_in_ms),
            burnAt: now + num(ovenRaw.burn_in_ms),
        },
        dish: dishRaw
            ? {
                  dish: dishRaw.dish as Dish,
                  items: list<Ingredient>(dishRaw.items),
              }
            : null,
        question,
        cooldown_ms: num(raw.cooldown_ms),
        // No cooldown = no deadline: `now + 0` would sit a few ms ahead of the
        // page clock until its next tick and flash the cooldown overlay.
        cooldownAt: num(raw.cooldown_ms) > 0 ? now + num(raw.cooldown_ms) : 0,
        rat: ratRaw
            ? {
                  rat_id: String(ratRaw.rat_id ?? ''),
                  ingredient: ratRaw.ingredient as Ingredient,
                  steal_in_ms: num(ratRaw.steal_in_ms),
                  stealAt: now + num(ratRaw.steal_in_ms),
              }
            : null,
        pies: num(raw.pies),
        score: num(raw.score),
        served: num(raw.served),
        streak: num(raw.streak),
        correct: num(raw.correct),
        answered: num(raw.answered),
        rank: num(raw.rank),
        of: num(raw.of),
    };
}

type Action =
    | { type: 'state'; msg: Raw }
    | { type: 'event'; msg: Raw }
    | { type: 'clear_pie' };

/**
 * Own result row of a podium payload. `you` may be the user id, a ranking
 * row or a result object; the ranking row fills the gaps.
 */
export function toResult(
    you: unknown,
    ranking: MonsterCafeRanking[],
    fallbackId?: number,
): MonsterCafeResult | undefined {
    const id =
        typeof you === 'number'
            ? you
            : you && typeof you === 'object'
              ? num((you as Raw).user_id)
              : (fallbackId ?? 0);
    const row = ranking.find((r) => r.user_id === id);
    const extra =
        you && typeof you === 'object'
            ? (you as Partial<MonsterCafeResult>)
            : {};
    if (!row && !extra.user_id) {
        return undefined;
    }
    const rank = num(extra.rank) || row?.rank || 0;
    return {
        user_id: id,
        rank,
        won: extra.won ?? rank === 1,
        points: num(extra.points) || row?.points || 0,
        coins: num(extra.coins) || row?.coins || 0,
        served: num(extra.served) || row?.served || 0,
        correct: extra.correct ?? row?.correct,
        answered: extra.answered ?? row?.answered,
    };
}

function reduce(state: MonsterCafeState, action: Action): MonsterCafeState {
    const now = Date.now();
    if (action.type === 'clear_pie') {
        return state.pieHit ? { ...state, pieHit: undefined } : state;
    }
    const msg = action.msg;
    if (action.type === 'state') {
        const next = { ...EMPTY, ...(msg as Partial<MonsterCafeState>) };
        const samePin = next.pin !== undefined && next.pin === state.pin;
        /** `state_sync.podium` carries the whole `podium_result` payload. */
        const podiumRaw = msg.podium as Raw | MonsterCafeRanking[] | undefined;
        const podiumObj =
            podiumRaw && !Array.isArray(podiumRaw) ? podiumRaw : undefined;
        const ranking = podiumObj
            ? list<MonsterCafeRanking>(podiumObj.ranking)
            : samePin
              ? state.ranking
              : undefined;
        const podium = podiumObj
            ? list<MonsterCafeRanking>(podiumObj.podium)
            : Array.isArray(podiumRaw)
              ? podiumRaw
              : samePin
                ? state.podium
                : undefined;
        const you = typeof msg.you === 'number' ? msg.you : undefined;
        return {
            ...next,
            you,
            roster: list<MonsterCafeRosterEntry>(next.roster),
            leaderboard: list<MonsterCafeBoardEntry>(next.leaderboard),
            feed: list<MonsterCafeAction>(next.feed),
            minutes_options: next.minutes_options?.length
                ? next.minutes_options
                : EMPTY.minutes_options,
            receivedAt: now,
            kitchen:
                samePin && next.phase === 'PLAYING' ? state.kitchen : undefined,
            answer: samePin ? state.answer : undefined,
            pieHit: samePin ? state.pieHit : undefined,
            podium,
            ranking,
            result:
                next.phase === 'GAME_OVER' && podiumObj && ranking
                    ? (toResult(podiumObj.you, ranking, you) ??
                      (samePin ? state.result : undefined))
                    : samePin && next.phase === 'GAME_OVER'
                      ? state.result
                      : undefined,
        };
    }
    switch (msg.t) {
        case 'kitchen_sync':
            return {
                ...state,
                kitchen: toKitchen(msg, now, state.kitchen),
            };
        case 'question':
            return state.kitchen
                ? {
                      ...state,
                      kitchen: {
                          ...state.kitchen,
                          question: {
                              ...((msg.question ?? msg) as Omit<
                                  MonsterCafeQuestion,
                                  'receivedAt'
                              >),
                              receivedAt: now,
                          },
                      },
                      answer: undefined,
                  }
                : state;
        case 'answer_result': {
            const answer = {
                ...(msg as unknown as MonsterCafeAnswer),
                at: now,
            };
            const cooldown = num(msg.cooldown_ms);
            return {
                ...state,
                answer,
                kitchen:
                    state.kitchen && cooldown > 0
                        ? {
                              ...state.kitchen,
                              cooldown_ms: cooldown,
                              cooldownAt: now + cooldown,
                          }
                        : state.kitchen,
            };
        }
        case 'rat_appear':
            return state.kitchen
                ? {
                      ...state,
                      kitchen: {
                          ...state.kitchen,
                          rat: {
                              rat_id: String(msg.rat_id ?? ''),
                              ingredient: msg.ingredient as Ingredient,
                              steal_in_ms: num(msg.steal_ms),
                              stealAt: now + num(msg.steal_ms),
                          },
                      },
                  }
                : state;
        case 'rat_result':
            return state.kitchen?.rat?.rat_id === String(msg.rat_id)
                ? { ...state, kitchen: { ...state.kitchen, rat: null } }
                : state;
        case 'pie_hit': {
            const duration = num(msg.duration_ms) || 2000;
            return {
                ...state,
                pieHit: {
                    attacker: msg.attacker as MonsterCafePlayerRef,
                    duration_ms: duration,
                    until: now + duration,
                    seq: (state.pieHit?.seq ?? 0) + 1,
                },
            };
        }
        case 'action_broadcast': {
            const entry = msg as unknown as MonsterCafeAction;
            if (state.feed.some((f) => f.id === entry.id)) {
                return state;
            }
            return {
                ...state,
                feed: [...state.feed, entry].slice(-FEED_SIZE),
            };
        }
        case 'leaderboard_sync':
            return {
                ...state,
                leaderboard: list<MonsterCafeBoardEntry>(msg.leaderboard),
                remaining_ms: num(msg.remaining_ms),
                receivedAt: now,
            };
        case 'podium_result': {
            const ranking = list<MonsterCafeRanking>(msg.ranking);
            return {
                ...state,
                phase: 'GAME_OVER',
                podium: list<MonsterCafeRanking>(msg.podium),
                ranking,
                result: toResult(msg.you, ranking, state.you) ?? state.result,
                answer: undefined,
                pieHit: undefined,
            };
        }
        default:
            return state;
    }
}

/** WebSocket link to the Monster Café referee for a host screen or a player. */
export function useMonsterCafe(
    wsUrl: string | null,
    role: MonsterCafeRole,
    locale: string,
    onError: (code: string) => void,
    onEvent?: (msg: Raw) => void,
) {
    const [state, dispatch] = useReducer(reduce, EMPTY);
    const onState = useCallback(
        (msg: Raw) => dispatch({ type: 'state', msg }),
        [],
    );
    const onMessage = useCallback(
        (msg: Raw) => {
            dispatch({ type: 'event', msg });
            onEvent?.(msg);
        },
        [onEvent],
    );
    const socket = useGameSocket<Raw>(
        wsUrl,
        `/games/monster-cafe/token?role=${role}`,
        'state_sync',
        locale,
        { onState, onError, onMessage },
    );
    const clearPie = useCallback(() => dispatch({ type: 'clear_pie' }), []);

    return { state, clearPie, ...socket };
}

export type MonsterCafeStatus = ReturnType<typeof useMonsterCafe>['status'];
