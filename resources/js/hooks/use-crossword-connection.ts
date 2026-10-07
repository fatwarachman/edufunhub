import { type RoomPayload, type RoomSeat } from '@/components/multiplayer/room';
import { useGameSocket } from '@/hooks/use-game-socket';

export interface CrosswordSeat extends RoomSeat {
    score: number;
    solved: number;
    wrong: number;
    hints: number;
}

export interface CrosswordWord {
    index: number;
    number: number;
    dir: 'across' | 'down';
    row: number;
    col: number;
    length: number;
    clue: string;
    solved_by: number;
}

export interface CrosswordLevel {
    level: number;
    size: number;
    words: number;
    minutes: number;
}

export interface CrosswordState extends Partial<
    Omit<RoomPayload<CrosswordSeat>, 'phase'>
> {
    phase: 'none' | 'lobby' | 'playing' | 'done';
    you: number;
    levels: CrosswordLevel[];
    level?: number;
    grid?: {
        rows: number;
        cols: number;
        cells: ({ letter?: string } | null)[][];
    };
    words?: CrosswordWord[];
    remaining_ms?: number;
    reason?: 'solved' | 'time' | 'stopped';
    winner?: number;
    points?: number;
    answers?: string[];
    draw?: boolean;
    unsolved?: number;
}

export interface CrosswordGuess {
    word: number;
    correct: boolean;
}

/** WebSocket link to the Go Teka-Teki Silang referee. */
export function useCrosswordConnection(
    wsUrl: string | null,
    locale: string,
    handlers: {
        onState: (state: CrosswordState) => void;
        onError: (code: string) => void;
    },
) {
    return useGameSocket<CrosswordState>(
        wsUrl,
        '/games/crossword/token',
        'crossword_state',
        locale,
        handlers,
    );
}
