import { type RoomPayload, type RoomSeat } from '@/components/multiplayer/room';
import { type QuestionMediaData } from '@/components/question-media';
import { useGameSocket } from '@/hooks/use-game-socket';

export type MiniGameKey =
    'market-math' | 'number-garden' | 'explore-indonesia' | 'mini-lab';

export interface MiniSeat extends RoomSeat {
    score: number;
    correct: number;
    answered: boolean;
    history: boolean[];
}

export interface MiniVisualItem {
    icon: string;
    label: string;
    value: string;
    color: string;
    count: number;
}

export interface MiniVisual {
    kind:
        | ''
        | 'shop'
        | 'garden'
        | 'sequence'
        | 'letters'
        | 'tiles'
        | 'map'
        | 'lab';
    items: MiniVisualItem[];
    note: string;
}

export interface MiniQuestion {
    id: string;
    subject: string;
    worth: number;
    text: string;
    media?: QuestionMediaData | null;
    options: string[];
    choice: number;
    visual: MiniVisual;
    round_ms: number;
    remaining_ms?: number;
}

export interface MiniState extends Partial<
    Omit<RoomPayload<MiniSeat>, 'phase'>
> {
    game: MiniGameKey;
    phase: 'none' | 'lobby' | 'playing' | 'done';
    you: number;
    total: number;
    step?: 'countdown' | 'question' | 'reveal';
    round?: number;
    countdown_ms?: number;
    question?: MiniQuestion;
    reveal?: { answer: number; hint: string; gained: number };
    winner?: number;
    /** True when the host stopped the game for everyone. */
    stopped?: boolean;
    result?: {
        points: number;
        correct: number;
        wrong: number;
        score: number;
        won: boolean;
    };
}

/** WebSocket link to one Go room quiz game (package minigames). */
export function useMiniGameConnection(
    game: MiniGameKey,
    wsUrl: string | null,
    locale: string,
    handlers: {
        onState: (state: MiniState) => void;
        onError: (code: string) => void;
    },
) {
    return useGameSocket<MiniState>(
        wsUrl,
        `/games/${game}/token`,
        'mini_state',
        locale,
        handlers,
    );
}
