import { type QuestionMediaData } from '@/components/question-media';
import { useGameSocket } from '@/hooks/use-game-socket';
import { type CharacterLook } from '@/lib/character/draw-character';
import { useCallback, useReducer } from 'react';

/**
 * Economy Heist client state. The Go referee (package heist) is
 * authoritative: it sends a full `state_sync` on connect and after lobby
 * changes, `player_sync` with the private player state, and streams events
 * (`question`, `answer_result`, `chest_result`, `balance_update`,
 * `action_broadcast`, `leaderboard_sync`, `heist_expired`,
 * `podium_result`). The reducer only applies them; it never computes gold.
 */
export type HeistPhase = 'NONE' | 'LOBBY' | 'PLAYING' | 'GAME_OVER';
export type HeistRole = 'host' | 'player';
export type HeistStage = 'QUESTION' | 'CHEST' | 'TARGET' | 'COOLDOWN' | '';
export type HeistWin = 'TIME_LIMIT' | 'GOLD_TARGET';
export type ChestType =
    | 'ADD_GOLD'
    | 'LOSE_GOLD'
    | 'SHIELD'
    | 'STEAL_PERCENT'
    | 'SWAP_GOLD'
    | 'BANKRUPT_BOMB';

export interface HeistPlayerRef {
    user_id: number;
    name: string;
    character?: CharacterLook | null;
}

export interface HeistRosterEntry extends HeistPlayerRef {
    grade: number;
    online: boolean;
    left: boolean;
}

export interface HeistBoardEntry extends HeistPlayerRef {
    gold: number;
    rank: number;
    online: boolean;
    left: boolean;
    correct: number;
}

export interface HeistQuestion {
    id: string;
    number: number;
    text: string;
    media?: QuestionMediaData | null;
    subject: string;
    options: string[];
}

export interface HeistChest {
    type: ChestType;
    value: number;
    unit: 'flat' | 'percent';
    requires_target: boolean;
}

export interface HeistChestResult extends HeistChest {
    chest_index: number;
    chests: HeistChest[];
    gold: number;
    delta: number;
}

export interface HeistAnswerResult {
    question_id: string;
    correct: boolean;
    choice: number;
    correct_index: number;
    hint?: string;
}

export interface HeistAction {
    id: number;
    at: number;
    action: ChestType | 'BLOCKED';
    attempt?: ChestType;
    amount: number;
    value: number;
    unit: string;
    blocked?: boolean;
    source_player: HeistPlayerRef;
    target_player?: HeistPlayerRef;
}

export interface HeistYou extends HeistPlayerRef {
    gold: number;
    has_shield: boolean;
    stage: HeistStage;
    correct: number;
    wrong: number;
    steals: number;
    swaps: number;
    question?: HeistQuestion;
    cooldown_ms?: number;
    pending?: HeistChest;
    target_ms?: number;
}

export interface HeistRanking extends HeistPlayerRef {
    rank: number;
    gold: number;
    correct: number;
    wrong: number;
    steals: number;
    swaps: number;
    left: boolean;
}

export interface HeistResult {
    user_id: number;
    rank: number;
    won: boolean;
    points: number;
    gold: number;
    correct: number;
    wrong: number;
    steals: number;
    swaps: number;
}

export interface HeistState {
    phase: HeistPhase;
    role: HeistRole;
    pin?: string;
    subject?: string;
    host?: { user_id: number; name: string; online: boolean };
    players: HeistRosterEntry[];
    min_players: number;
    max_players: number;
    win: HeistWin;
    minutes: number;
    target_gold: number;
    time_limits: number[];
    gold_targets: number[];
    cooldown_ms: number;
    /** Server remaining time when `receivedAt` was stamped. */
    remaining_ms?: number;
    receivedAt: number;
    leaderboard: HeistBoardEntry[];
    feed: HeistAction[];
    you?: HeistYou;
    /** When `you` was last synced (for cooldown / target countdowns). */
    youAt: number;
    answer?: HeistAnswerResult;
    chest?: HeistChestResult;
    /** Increments on every chest reveal (lets the UI hold it on screen). */
    chestSeq: number;
    expired?: boolean;
    podium?: HeistRanking[];
    ranking?: HeistRanking[];
    result?: HeistResult;
    closed?: string;
}

const EMPTY: HeistState = {
    phase: 'NONE',
    role: 'player',
    players: [],
    min_players: 2,
    max_players: 60,
    win: 'TIME_LIMIT',
    minutes: 5,
    target_gold: 2500,
    time_limits: [],
    gold_targets: [],
    cooldown_ms: 3000,
    receivedAt: 0,
    leaderboard: [],
    feed: [],
    youAt: 0,
    chestSeq: 0,
};

/** Feed entries kept on screen. */
const FEED_SIZE = 15;

type Action =
    | { type: 'state'; msg: Record<string, unknown> }
    | { type: 'event'; msg: Record<string, unknown> };

function reduce(state: HeistState, action: Action): HeistState {
    const msg = action.msg;
    const now = Date.now();
    if (action.type === 'state') {
        const next = { ...EMPTY, ...(msg as Partial<HeistState>) };
        const sameQuestion =
            next.you?.question?.id !== undefined &&
            next.you.question.id === state.you?.question?.id;
        return {
            ...next,
            players: next.players ?? [],
            leaderboard: next.leaderboard ?? [],
            feed: next.feed ?? [],
            receivedAt: now,
            youAt: now,
            chestSeq: state.chestSeq,
            // A resync keeps the chest reveal while the player is still on it.
            chest: next.you?.stage === 'TARGET' ? state.chest : undefined,
            answer: sameQuestion ? state.answer : undefined,
        };
    }
    switch (msg.t) {
        case 'player_sync': {
            const you = msg.you as HeistYou;
            const newQuestion =
                you.stage === 'QUESTION' &&
                you.question?.id !== state.you?.question?.id;
            return {
                ...state,
                you,
                youAt: now,
                answer: newQuestion ? undefined : state.answer,
            };
        }
        case 'question':
            return state.you
                ? {
                      ...state,
                      you: {
                          ...state.you,
                          stage: 'QUESTION',
                          question: msg.question as HeistQuestion,
                      },
                      answer: undefined,
                  }
                : state;
        case 'answer_result':
            return {
                ...state,
                answer: msg as unknown as HeistAnswerResult,
                chest: undefined,
                expired: false,
            };
        case 'chest_result':
            return {
                ...state,
                chest: msg as unknown as HeistChestResult,
                chestSeq: state.chestSeq + 1,
            };
        case 'balance_update': {
            const id = msg.player_id as number;
            const gold = msg.gold as number;
            const you =
                state.you && state.you.user_id === id
                    ? {
                          ...state.you,
                          gold,
                          has_shield:
                              (msg.has_shield as boolean | undefined) ??
                              state.you.has_shield,
                      }
                    : state.you;
            return {
                ...state,
                you,
                leaderboard: state.leaderboard.map((row) =>
                    row.user_id === id ? { ...row, gold } : row,
                ),
            };
        }
        case 'action_broadcast': {
            const entry = msg as unknown as HeistAction;
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
                leaderboard: msg.leaderboard as HeistBoardEntry[],
                remaining_ms: msg.remaining_ms as number,
                receivedAt: now,
            };
        case 'heist_expired':
            return { ...state, expired: true, chest: undefined };
        case 'podium_result':
            return {
                ...state,
                phase: 'GAME_OVER',
                podium: msg.podium as HeistRanking[],
                ranking: msg.ranking as HeistRanking[],
                result: (msg.you as HeistResult | undefined) ?? state.result,
                you: state.you ? { ...state.you, stage: '' } : state.you,
                chest: undefined,
                answer: undefined,
            };
        default:
            return state;
    }
}

/** WebSocket link to the Economy Heist referee for a host screen or a player. */
export function useEconomyHeist(
    wsUrl: string | null,
    role: HeistRole,
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
        `/games/economy-heist/token?role=${role}`,
        'state_sync',
        locale,
        { onState, onError, onMessage },
    );

    return { state, ...socket };
}
