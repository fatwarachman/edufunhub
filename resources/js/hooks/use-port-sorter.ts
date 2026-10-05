import { useGameSocket } from '@/hooks/use-game-socket';

/** A drop target of the active sorter set, in column order. */
export interface SorterBin {
    key: string;
    name: string;
    color: string;
}

export interface SorterSetSummary {
    key: string;
    title: string;
    description: string;
    bins: SorterBin[];
    items: number;
}

export interface PortSorterState {
    phase: 'ready' | 'falling' | 'done';
    set: { key: string; title: string; description: string };
    bins: SorterBin[];
    round: number;
    total: number;
    lives: number;
    max: number;
    level: number;
    levels: number;
    streak: number;
    best: number;
    score: number;
    correct: number;
    wrong: number;
    paused: boolean;
    history: boolean[];
    player: { name: string; grade: number };
    /** Admin-managed sets to pick from (only outside a run). */
    sets?: SorterSetSummary[];
    /** Cheat sheet of the chosen set (only outside a run). */
    legend?: { label: string; hint: string; bin: number; level: number }[];
    packet?: {
        id: string;
        label: string;
        column: number;
        delay: number;
        fall_ms: number;
        elapsed_ms: number;
    };
    feedback?: {
        kind: 'correct' | 'wrong' | 'missed';
        bin: number;
        answer: number;
        label: string;
        hint: string;
        score: number;
        level_up?: number;
    };
    result?: {
        points: number;
        correct: number;
        wrong: number;
        seconds: number;
        percent: number;
        passed: boolean;
        best_streak: number;
        missed: { label: string; hint: string; bin: number }[];
        reason: 'lives' | 'finished';
    };
}

/** WebSocket link to the Go Port Sorter referee. */
export function usePortSorterConnection(
    wsUrl: string | null,
    locale: string,
    handlers: {
        onState: (state: PortSorterState) => void;
        onError: (code: string) => void;
    },
) {
    return useGameSocket<PortSorterState>(
        wsUrl,
        '/games/port-sorter/token',
        'port_state',
        locale,
        handlers,
    );
}
