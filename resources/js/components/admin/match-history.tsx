import {
    formatDateTime,
    formatDuration,
    gameLabel,
} from '@/components/admin/game-stats';
import { cn } from '@/lib/utils';
import { Link } from '@inertiajs/react';
import { Bot, Crown, DoorOpen, Smartphone } from 'lucide-react';

export interface MatchSeat {
    seat: number;
    user_id: number | null;
    name: string;
    grade: number;
    is_local: boolean;
    is_bot: boolean;
    left_early: boolean;
    rank: number;
    score: number;
    correct: number;
    wrong: number;
    is_viewer: boolean;
}

export interface MatchRow {
    id: number;
    game_key: string;
    mode: string;
    pin: string | null;
    level: number | null;
    grade: number;
    players_count: number;
    finished: boolean;
    started_at: string;
    ended_at: string;
    duration_seconds: number;
    my_rank: number | null;
    players: MatchSeat[];
}

export const MODE_LABELS: Record<string, string> = {
    solo: 'Solo',
    room: 'Invite room',
    random: 'Random match',
    bot: 'Vs bot',
};

const gradeLabel = (grade: number) => (grade === 0 ? 'TK' : `Grade ${grade}`);

/** One recorded match: game, level, mode and every seat ranked. */
export function MatchCard({ match }: { match: MatchRow }) {
    const ranked = [...match.players].sort((a, b) => a.rank - b.rank);

    return (
        <article
            className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4"
            data-testid={`match-${match.id}`}
        >
            <header className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="font-semibold text-foreground">
                        {gameLabel(match.game_key)}
                    </span>
                    {match.level !== null && (
                        <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300">
                            Level {match.level}
                        </span>
                    )}
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                        {MODE_LABELS[match.mode] ?? match.mode}
                        {match.pin && ` · PIN ${match.pin}`}
                    </span>
                    {!match.finished && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                            Unfinished
                        </span>
                    )}
                    {match.my_rank !== null && (
                        <span
                            className={cn(
                                'rounded-full px-2 py-0.5 text-xs font-semibold',
                                match.my_rank === 1 && match.players_count > 1
                                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                                    : 'bg-muted text-muted-foreground',
                            )}
                        >
                            Rank {match.my_rank} / {match.players_count}
                        </span>
                    )}
                </div>
                <span className="text-xs text-muted-foreground tabular-nums">
                    {formatDateTime(match.ended_at)} ·{' '}
                    {formatDuration(match.duration_seconds)} · questions{' '}
                    {gradeLabel(match.grade)}
                </span>
            </header>
            <ol className="flex flex-col divide-y divide-border rounded-xl border border-border">
                {ranked.map((seat) => (
                    <li
                        key={seat.seat}
                        className={cn(
                            'flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm',
                            seat.is_viewer && 'bg-primary/5',
                        )}
                    >
                        <span className="flex w-6 shrink-0 justify-center font-semibold text-muted-foreground tabular-nums">
                            {seat.rank === 1 && match.players_count > 1 ? (
                                <Crown className="size-4 text-amber-500" />
                            ) : (
                                seat.rank
                            )}
                        </span>
                        <span className="flex min-w-0 flex-1 items-center gap-1.5">
                            {seat.user_id ? (
                                <Link
                                    href={`/admin/users/${seat.user_id}`}
                                    className="truncate font-medium text-foreground hover:underline"
                                >
                                    {seat.name}
                                </Link>
                            ) : (
                                <span className="truncate font-medium text-foreground">
                                    {seat.name}
                                </span>
                            )}
                            {seat.is_bot && (
                                <Bot
                                    className="size-3.5 shrink-0 text-muted-foreground"
                                    aria-label="Bot"
                                />
                            )}
                            {seat.is_local && (
                                <Smartphone
                                    className="size-3.5 shrink-0 text-muted-foreground"
                                    aria-label="Same device"
                                />
                            )}
                            {seat.left_early && (
                                <DoorOpen
                                    className="size-3.5 shrink-0 text-amber-500"
                                    aria-label="Left early"
                                />
                            )}
                            <span className="shrink-0 text-xs text-muted-foreground">
                                {gradeLabel(seat.grade)}
                            </span>
                        </span>
                        <span className="text-xs text-muted-foreground tabular-nums">
                            <span className="text-emerald-600 dark:text-emerald-400">
                                {seat.correct}✓
                            </span>{' '}
                            <span className="text-red-600 dark:text-red-400">
                                {seat.wrong}✗
                            </span>
                        </span>
                        <span className="w-16 text-right font-semibold text-foreground tabular-nums">
                            {seat.score}
                        </span>
                    </li>
                ))}
            </ol>
        </article>
    );
}
