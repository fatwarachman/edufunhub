import { useGameSocket } from '@/hooks/use-game-socket';
import { type CharacterLook } from '@/lib/character/draw-character';
import { useCallback, useReducer } from 'react';

/**
 * Block Battle (Tetris Kuis) client state. The Go referee (package
 * blockbattle) is authoritative: boards, gravity, garbage and scoring run on
 * the server. It sends a full `state_sync` on connect, lobby and phase
 * changes; phones receive their own `board` (coalesced per tick), the arena
 * a 5 Hz `boards` snapshot of every player, FORTRESS rooms a shared
 * `fortress` wall. The reducer only applies them.
 */
export type BBPhase = 'NONE' | 'LOBBY' | 'COUNTDOWN' | 'PLAYING' | 'GAME_OVER';
export type BBRole = 'host' | 'player';
export type BBMode = 'BATTLE' | 'WORDS' | 'FORTRESS';
export type BBContent = 'WORDS_ID' | 'WORDS_EN' | 'MATH';
export type BBFx = 'PENALTY' | 'EXPOSED';
export type BBPieceType = 'I' | 'J' | 'L' | 'O' | 'S' | 'T' | 'Z';
export type BBReward = 'I_PIECE' | 'ATTACK';
export type BBAction =
    'left' | 'right' | 'rotate' | 'rotate_ccw' | 'soft' | 'hard';

export const BB_MODES: BBMode[] = ['BATTLE', 'WORDS', 'FORTRESS'];
export const BB_DURATIONS = [3, 5, 7, 10];
export const BB_CONTENTS: BBContent[] = ['WORDS_ID', 'WORDS_EN', 'MATH'];

/** Cell coordinate `[x, y]`: column from the left, row from the top. */
export type BBPoint = [number, number];

export interface BBRef {
    id: number;
    name: string;
}

export interface BBRosterEntry {
    user_id: number;
    name: string;
    grade: number;
    character?: CharacterLook | null;
    online: boolean;
    left: boolean;
    order: number;
}

export interface BBPiece {
    type: BBPieceType;
    cells: BBPoint[];
    glyphs?: string[];
}

export interface BBNextPiece {
    type: BBPieceType;
    glyphs?: string[];
}

export interface BBTarget {
    kind: 'word' | 'math';
    text: string;
}

/** Own personal board (phone). */
export interface BBBoard {
    cells: string;
    glyphs?: string;
    piece: BBPiece | null;
    ghost: BBPoint[];
    next: BBNextPiece[];
    pending: number;
    lines: number;
    score: number;
    combo: number;
    level: number;
    gravity_ms: number;
    fx: BBFx[];
    fx_ms: Partial<Record<BBFx, number>>;
    alive: boolean;
    rank: number;
    target?: BBTarget;
}

/** Compact board of one player (arena grid). `c` already merges the piece. */
export interface BBMiniBoard {
    id: number;
    c: string;
    g?: string;
    alive: boolean;
    rank: number;
    lines: number;
    score: number;
    pending: number;
    fx: BBFx[];
    kos: number;
}

export interface BBFortress {
    cols: number;
    rows: number;
    cells: string;
    armored: number[];
    strength: number;
    max_strength: number;
    monster: { hp: number; max: number; next_hit_ms: number };
    queue: BBRef[];
    turn: {
        user: BBRef;
        until_ms: number;
        piece: BBPiece | null;
        ghost?: BBPoint[];
    } | null;
    remaining_ms: number;
}

export interface BBQuestion {
    qid: number;
    text: string;
    options: string[];
    subject: string;
    worth: number;
    time_limit_ms: number;
}

export interface BBAnswer {
    qid: number;
    correct: boolean;
    correct_index: number;
    hint?: string;
    reward_choice?: boolean;
    reward_ms?: number;
    penalty_ms?: number;
    queue_position?: number;
}

export interface BBRanking {
    user_id: number;
    name: string;
    rank: number;
    character?: CharacterLook | null;
    score: number;
    lines: number;
    kos: number;
    correct: number;
    wrong: number;
    accuracy: number;
    alive_ms: number;
    left: boolean;
}

export interface BBResult {
    rank: number;
    won: boolean;
    points: number;
    score: number;
    correct: number;
    wrong: number;
    accuracy: number;
}

export interface BBTeam {
    won: boolean;
    reason: 'monster_defeated' | 'time_up' | 'wall_broken' | 'stopped';
}

/** Feed entry of the live events (attack, ko, word, monster_hit). */
export interface BBEvent {
    t: 'attack' | 'ko' | 'word' | 'monster_hit';
    from?: BBRef;
    to?: BBRef;
    user?: BBRef;
    by?: BBRef;
    lines?: number;
    kind?: 'line_clear' | 'quiz';
    exposed?: boolean;
    rank?: number;
    alive?: number;
    word?: string;
    points?: number;
    combo?: number;
    col?: number;
    destroyed?: number;
    strength?: number;
    /** Client-side id for list keys. */
    uid: number;
}

export interface BBState {
    phase: BBPhase;
    role: BBRole;
    pin?: string;
    mode: BBMode;
    minutes: number;
    content: BBContent;
    modes: BBMode[];
    durations: number[];
    contents: BBContent[];
    subject?: string;
    host?: { user_id: number; name: string; online: boolean };
    players: BBRosterEntry[];
    min_players: number;
    max_players: number;
    countdown_ms?: number;
    /** Local time of the last `state_sync` (countdown base). */
    receivedAt: number;
    remaining_ms?: number;
    /** Local time `remaining_ms` was received. */
    clockAt: number;
    alive?: number;
    you?: { user_id: number; alive: boolean; rank: number };
    boards: BBMiniBoard[];
    board?: BBBoard;
    fortress?: BBFortress;
    /** Local time of the last fortress snapshot (turn/monster timers). */
    fortressAt: number;
    question?: BBQuestion;
    questionAt: number;
    choice?: number;
    answer?: BBAnswer;
    /** Local deadline of the open BATTLE reward choice. */
    rewardUntil?: number;
    rewardResult?: { reward: BBReward; target?: BBRef; lines?: number };
    /** Local deadline of the own FORTRESS turn. */
    turnUntil?: number;
    queuePosition?: number;
    feed: BBEvent[];
    podium?: BBRanking[];
    ranking?: BBRanking[];
    result?: BBResult;
    team?: BBTeam;
    closed?: string;
}

const FEED_SIZE = 16;
let eventSeq = 0;

const EMPTY: BBState = {
    phase: 'NONE',
    role: 'player',
    mode: 'BATTLE',
    minutes: 5,
    content: 'WORDS_ID',
    modes: BB_MODES,
    durations: BB_DURATIONS,
    contents: BB_CONTENTS,
    players: [],
    min_players: 1,
    max_players: 50,
    receivedAt: 0,
    clockAt: 0,
    boards: [],
    fortressAt: 0,
    questionAt: 0,
    feed: [],
};

/**
 * Server times named `until_ms` are read as a duration from now; values that
 * look like a Unix timestamp in milliseconds are converted to local time.
 */
export function deadline(untilMs: number, now: number): number {
    return untilMs > 1e12 ? untilMs : now + Math.max(0, untilMs);
}

type Action =
    | { type: 'state'; msg: Record<string, unknown> }
    | { type: 'event'; msg: Record<string, unknown> }
    | { type: 'choose'; choice: number };

function reduce(state: BBState, action: Action): BBState {
    const now = Date.now();
    if (action.type === 'choose') {
        return { ...state, choice: action.choice };
    }
    const msg = action.msg;
    if (action.type === 'state') {
        const next = { ...EMPTY, ...(msg as Partial<BBState>) };
        const live = next.phase === 'PLAYING' || next.phase === 'COUNTDOWN';
        // A resync keeps the streamed parts the snapshot does not carry.
        const keep = live && state.pin === next.pin;
        return {
            ...next,
            modes: next.modes?.length ? next.modes : BB_MODES,
            durations: next.durations?.length ? next.durations : BB_DURATIONS,
            contents: next.contents?.length ? next.contents : BB_CONTENTS,
            players: next.players ?? [],
            boards: next.boards ?? (keep ? state.boards : []),
            fortress: next.fortress ?? (keep ? state.fortress : undefined),
            fortressAt: next.fortress ? now : keep ? state.fortressAt : 0,
            board: keep ? state.board : undefined,
            question: keep ? state.question : undefined,
            questionAt: keep ? state.questionAt : 0,
            choice: keep ? state.choice : undefined,
            answer: keep ? state.answer : undefined,
            rewardUntil: keep ? state.rewardUntil : undefined,
            turnUntil: keep ? state.turnUntil : undefined,
            queuePosition: keep ? state.queuePosition : undefined,
            feed: keep ? state.feed : [],
            podium: next.podium,
            ranking: next.ranking,
            result: next.result ?? (keep ? state.result : undefined),
            receivedAt: now,
            clockAt: now,
        };
    }
    switch (msg.t) {
        case 'board':
            return {
                ...state,
                phase: state.phase === 'COUNTDOWN' ? 'PLAYING' : state.phase,
                board: msg as unknown as BBBoard,
            };
        case 'boards':
            return {
                ...state,
                phase: state.phase === 'COUNTDOWN' ? 'PLAYING' : state.phase,
                boards: (msg.boards as BBMiniBoard[]) ?? [],
                alive: msg.alive as number,
                remaining_ms: msg.remaining_ms as number,
                clockAt: now,
            };
        case 'fortress': {
            const fortress = msg as unknown as BBFortress;
            return {
                ...state,
                phase: state.phase === 'COUNTDOWN' ? 'PLAYING' : state.phase,
                fortress,
                fortressAt: now,
                remaining_ms: fortress.remaining_ms,
                clockAt: now,
            };
        }
        case 'question':
            return {
                ...state,
                phase: state.phase === 'COUNTDOWN' ? 'PLAYING' : state.phase,
                question: msg as unknown as BBQuestion,
                questionAt: now,
                choice: undefined,
                answer: undefined,
            };
        case 'answer_result': {
            const answer = msg as unknown as BBAnswer;
            return {
                ...state,
                answer,
                rewardUntil:
                    answer.reward_choice && answer.reward_ms
                        ? now + answer.reward_ms
                        : state.rewardUntil,
                queuePosition: answer.queue_position ?? state.queuePosition,
            };
        }
        case 'reward_result':
            return {
                ...state,
                rewardUntil: undefined,
                rewardResult: msg as unknown as BBState['rewardResult'],
            };
        case 'your_turn':
            return {
                ...state,
                turnUntil: deadline(msg.until_ms as number, now),
                queuePosition: 0,
            };
        case 'attack':
        case 'ko':
        case 'word':
        case 'monster_hit': {
            eventSeq += 1;
            const event = { ...(msg as object), uid: eventSeq } as BBEvent;
            const you = state.you;
            return {
                ...state,
                feed: [...state.feed, event].slice(-FEED_SIZE),
                alive:
                    msg.t === 'ko' && typeof msg.alive === 'number'
                        ? msg.alive
                        : state.alive,
                you:
                    msg.t === 'ko' && you && event.user?.id === you.user_id
                        ? { ...you, alive: false, rank: event.rank ?? you.rank }
                        : you,
            };
        }
        case 'podium_result':
            return {
                ...state,
                phase: 'GAME_OVER',
                podium: msg.podium as BBRanking[],
                ranking: msg.ranking as BBRanking[],
                result: (msg.you as BBResult | undefined) ?? state.result,
                team: (msg.team as BBTeam | undefined) ?? state.team,
                rewardUntil: undefined,
                turnUntil: undefined,
            };
        default:
            return state;
    }
}

/** WebSocket link to the Block Battle referee for the arena or a phone. */
export function useBlockBattle(
    wsUrl: string | null,
    role: BBRole,
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
        `/games/block-battle/token?role=${role}`,
        'state_sync',
        locale,
        { onState, onError, onMessage },
    );
    const choose = useCallback(
        (choice: number) => dispatch({ type: 'choose', choice }),
        [],
    );

    return { state, choose, ...socket };
}
