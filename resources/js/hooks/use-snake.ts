import { type RoomPayload, type RoomSeat } from '@/components/multiplayer/room';
import { useGameSocket } from '@/hooks/use-game-socket';
import { useCallback, useState } from 'react';

export type SnakeDirection = 'up' | 'down' | 'left' | 'right';
export type SnakeMode = 'shared' | 'split';
export type Cell = [number, number];

export interface SnakeSeat extends RoomSeat {
    alive?: boolean;
    lives?: number;
    tail?: number;
    correct?: number;
    wrong?: number;
    score?: number;
}

export interface SnakeOnBoard {
    seat: number;
    body: Cell[];
    dir: SnakeDirection;
    alive: boolean;
    frozen: boolean;
    ready?: boolean;
}

export interface SnakeQuestion {
    id: string;
    text: string;
    options: string[];
    labels: string[];
    subject: string;
    worth: number;
    remaining_ms: number;
    /** `read`: every snake frozen while players read; `hunt`: snakes move. */
    phase: 'read' | 'hunt';
    read_ms: number;
    hunt_ms: number;
}

export interface SnakeBoard {
    seat?: number;
    snakes: SnakeOnBoard[];
    foods: { label: string; x: number; y: number; size?: number }[];
    blocks: Cell[];
    question?: SnakeQuestion | null;
}

export interface SnakeState extends RoomPayload<SnakeSeat> {
    mode: SnakeMode;
    grid: number;
    initial_tail: number;
    lives: number;
    cut: number;
    grow: number;
    subject?: string;
    subject_fallback?: boolean;
    board: SnakeBoard | null;
    boards: SnakeBoard[];
    food_size: number;
    read_seconds: number;
    remaining_ms: number;
    feedback: null | {
        seq: number;
        seat: number;
        correct: boolean;
        timeout: boolean;
        label: string;
        prompt: string;
        answer: string;
        hint: string;
        attack?: { from: number; to: number; kind: 'tail' | 'block' };
    };
    winner: number | null;
    reason: '' | 'cleared' | 'last' | 'time' | 'out' | 'stopped';
    stopped: boolean;
    result: { points: number } | null;
    match?: { key: string };
}

/** Only sends intents; the Go referee owns movement, food, answers and points. */
export function useSnake(wsUrl: string | null, locale: string) {
    const [state, setState] = useState<SnakeState | null>(null);
    const [error, setError] = useState<string | null>(null);
    const onState = useCallback((next: SnakeState) => {
        setState(next.pin ? next : null);
        setError(null);
    }, []);
    const onError = useCallback((code: string) => setError(code), []);
    const onMessage = useCallback((message: Record<string, unknown>) => {
        if (message.t === 'left') {
            setState(null);
        }
    }, []);
    const connection = useGameSocket<SnakeState>(
        wsUrl,
        '/games/snake/token',
        'snake_state',
        locale,
        { onState, onError, onMessage },
    );
    const { send } = connection;
    const turn = useCallback(
        (direction: SnakeDirection) => send({ t: 'turn', direction }),
        [send],
    );
    const ready = useCallback(() => send({ t: 'ready' }), [send]);
    return { ...connection, state, error, turn, ready };
}
