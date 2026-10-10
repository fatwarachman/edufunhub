import { type QuestionMediaData } from '@/components/question-media';
import { useGameSocket } from '@/hooks/use-game-socket';

export interface TrainState {
    phase: 'ready' | 'question' | 'done';
    subject?: string;
    subject_fallback?: boolean;
    round: number;
    total: number;
    lives: number;
    max: number;
    wagons: number;
    streak: number;
    score: number;
    correct: number;
    wrong: number;
    paused: boolean;
    history: boolean[];
    player: { name: string; grade: number };
    question?: {
        id: string;
        subject: string;
        text: string;
        media?: QuestionMediaData | null;
        options: string[];
        delay: number;
        approach_ms: number;
        elapsed_ms: number;
    };
    feedback?: {
        kind: 'correct' | 'wrong' | 'missed';
        lane: number;
        score: number;
        answer: number;
        text: string;
    };
    result?: {
        points: number;
        correct: number;
        wrong: number;
        seconds: number;
        percent: number;
        passed: boolean;
        wagons: number;
        reason: 'lives' | 'finished';
    };
}

/** WebSocket link to the Go Kereta Pengetahuan referee. */
export function useTrainConnection(
    wsUrl: string | null,
    locale: string,
    handlers: {
        onState: (state: TrainState) => void;
        onError: (code: string) => void;
    },
) {
    return useGameSocket<TrainState>(
        wsUrl,
        '/games/knowledge-train/token',
        'train_state',
        locale,
        handlers,
    );
}
