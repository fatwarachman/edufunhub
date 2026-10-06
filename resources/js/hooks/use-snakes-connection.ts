import { type RoomSeat } from '@/components/multiplayer/room';
import { useGameSocket } from '@/hooks/use-game-socket';

export interface SnakesPlayer extends RoomSeat {
    position: number;
    score: number;
    correct: number;
    wrong: number;
    /** Order in which the seat reached square 100 (0 = still racing). */
    finished?: number;
}

export interface SnakesState {
    phase: 'none' | 'lobby' | 'playing' | 'done';
    subject?: string;
    subject_fallback?: boolean;
    pin?: string;
    seq?: number;
    you: number;
    host?: number;
    players?: SnakesPlayer[];
    min_players: number;
    max_players: number;
    local_seats: boolean;
    winner?: number;
    points?: number;
    reason?: 'finish' | 'forfeit' | 'time';
    /** Game length in minutes chosen by the host (0 = until someone finishes). */
    minutes?: number;
    durations?: number[];
    finish_bonus?: number;
    /** Seat that reached square 100 first (-1 = nobody yet). */
    first?: number;
    finish_bonus_won?: boolean;
    /** Remaining game time of a timed game. */
    time_left_ms?: number;
    /** Turn wait before the dice rolls by itself. */
    roll_ms?: number;
    /** The dice of this turn rolled by itself (player away). */
    auto_roll?: boolean;
    turn?: number;
    step?: 'roll' | 'question' | 'reveal' | 'move';
    dice?: number;
    remaining_ms?: number;
    question?: {
        id: string;
        subject: string;
        text: string;
        options: string[];
        target: number;
        remaining_ms?: number;
    };
    reveal?: {
        answer: number;
        choice: number;
        correct: boolean;
        hint: string;
    };
    move?: {
        id: number;
        seat: number;
        from: number;
        dice: number;
        landing: number;
        final: number;
        kind: '' | 'ladder' | 'snake';
    };
}

/** WebSocket link to the Go Ular Tangga room referee. */
export function useSnakesConnection(
    wsUrl: string | null,
    locale: string,
    handlers: {
        onState: (state: SnakesState) => void;
        onError: (code: string) => void;
        /** Other server events, e.g. `{t: 'left', points}` after leaving a running game. */
        onMessage?: (msg: Record<string, unknown>) => void;
    },
) {
    return useGameSocket<SnakesState>(
        wsUrl,
        '/games/snakes-and-ladders/token',
        'snakes_state',
        locale,
        handlers,
    );
}
