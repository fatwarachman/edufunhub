import { type RoomSeat } from '@/components/multiplayer/room';
import { useGameSocket } from '@/hooks/use-game-socket';

export interface SnakesPlayer extends RoomSeat {
    position: number;
    score: number;
    correct: number;
    wrong: number;
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
    reason?: 'finish' | 'forfeit';
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
