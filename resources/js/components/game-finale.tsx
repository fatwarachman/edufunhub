import { PlayerAvatar } from '@/components/player-avatar';
import { Button } from '@/components/ui/button';
import { useTranslations } from '@/hooks/use-translations';
import { type CharacterLook } from '@/lib/character/draw-character';
import { gameIcon } from '@/lib/games';
import http from '@/lib/http';
import { cn } from '@/lib/utils';
import { type SharedData } from '@/types';
import { Link, usePage } from '@inertiajs/react';
import { Coins, Crown, Medal, PartyPopper, Trophy, X } from 'lucide-react';
import {
    createElement,
    type CSSProperties,
    useCallback,
    useEffect,
    useId,
    useRef,
    useState,
} from 'react';

/**
 * Standard end of every game (see docs/multiplayer.md): a confetti
 * celebration on the screen of every player, then a leaderboard modal with
 * the final ranking of this match and the game's all-time top players.
 *
 * Pages mount <GameFinale> once and flip `done` when the referee reports the
 * game is over. It celebrates once per finished game: `done` going false
 * (room back in its lobby or playing again) arms it for the next result.
 * `matchKey` (room PIN, match id …) keeps a new room from being skipped.
 */
export interface FinaleStanding {
    /** Stable key (seat, user id). */
    key: string | number;
    name: string;
    rank: number;
    /** Main score of the game (points, gold, words …), already formatted. */
    score?: string | number;
    detail?: string;
    character?: CharacterLook | null;
    seat?: number;
    userId?: number | null;
    isYou?: boolean;
}

interface BoardEntry {
    rank: number;
    userId: number;
    name: string;
    points: number;
    isMe: boolean;
    character: CharacterLook;
}

interface GameBoard {
    key: string;
    titleKey: string;
    icon: string;
    accent: string;
    players: number;
    entries: BoardEntry[];
    me: { rank: number; points: number } | null;
}

/**
 * Ranks rows best first by `score` (higher is better unless `ascending`).
 * Ties share a rank (dense ranking), so equal scores never look unfair.
 */
export function rankStandings<T>(
    rows: T[],
    score: (row: T) => number,
    toStanding: (row: T, rank: number) => FinaleStanding,
    ascending = false,
): FinaleStanding[] {
    const sorted = [...rows].sort((a, b) =>
        ascending ? score(a) - score(b) : score(b) - score(a),
    );
    return sorted.map((row) =>
        toStanding(
            row,
            sorted.filter((other) =>
                ascending
                    ? score(other) < score(row)
                    : score(other) > score(row),
            ).length + 1,
        ),
    );
}

/** Server ranking rows of the projector games (floor-drop, heist …). */
export function podiumStandings<
    R extends {
        user_id: number;
        name: string;
        rank: number;
        character?: CharacterLook | null;
    },
>(
    ranking: R[] | undefined,
    you: number | undefined,
    score: (row: R) => string | number,
    detail?: (row: R) => string,
): FinaleStanding[] {
    return (ranking ?? []).map((row, index) => ({
        key: row.user_id,
        name: row.name,
        rank: row.rank,
        score: score(row),
        detail: detail?.(row),
        character: row.character,
        seat: index,
        userId: row.user_id,
        isYou: you !== undefined && row.user_id === you,
    }));
}

const CONFETTI_COLORS = [
    '#ffd93d',
    '#ff6584',
    '#00c9a7',
    '#6c5ce7',
    '#ff9e44',
    '#4dabf7',
];
const PIECES = 90;
/** Celebration length before the leaderboard modal opens. */
const CELEBRATION_MS = 2600;

const RANK_TONE: Record<number, string> = {
    1: 'bg-[#1f2a44] text-[#FFD93D]',
    2: 'bg-[#DCE3EE]',
    3: 'bg-[#F4C095]',
};

function prefersReducedMotion(): boolean {
    return (
        typeof window !== 'undefined' &&
        Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
    );
}

/** Full-screen confetti burst, pointer-transparent, removed after it ends. */
export function Confetti({ seed }: { seed: string }) {
    const [pieces] = useState(() =>
        Array.from({ length: PIECES }, (_, i) => ({
            id: `${seed}-${i}`,
            left: Math.random() * 100,
            delay: Math.random() * 0.6,
            duration: 2.2 + Math.random() * 1.6,
            drift: (Math.random() - 0.5) * 160,
            spin: (Math.random() > 0.5 ? 1 : -1) * (360 + Math.random() * 540),
            size: 6 + Math.random() * 7,
            round: Math.random() > 0.7,
            color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        })),
    );
    return (
        <div
            className="edu-confetti pointer-events-none fixed inset-0 z-[60] overflow-hidden"
            aria-hidden
            data-testid="game-confetti"
        >
            {pieces.map((piece) => (
                <span
                    key={piece.id}
                    className="edu-confetti-piece"
                    style={
                        {
                            left: `${piece.left}%`,
                            width: piece.size,
                            height: piece.round
                                ? piece.size
                                : piece.size * 0.45,
                            borderRadius: piece.round ? '9999px' : '2px',
                            backgroundColor: piece.color,
                            animationDelay: `${piece.delay}s`,
                            animationDuration: `${piece.duration}s`,
                            '--drift': `${piece.drift}px`,
                            '--spin': `${piece.spin}deg`,
                        } as CSSProperties
                    }
                />
            ))}
        </div>
    );
}

export function GameFinale({
    game,
    done,
    matchKey,
    standings = [],
    won,
    points,
    title,
    onPlayAgain,
    playAgainLabel,
}: {
    /** Catalog key, e.g. `crossword` (all-time board of that game). */
    game: string;
    /** True once the referee reports the game is over. */
    done: boolean;
    /** Changes for every finished game (PIN + seq, match id …). */
    matchKey: string | null | undefined;
    /** Final ranking of this match, best first. Empty for solo games. */
    standings?: FinaleStanding[];
    /** This player won / passed: changes the headline only. */
    won?: boolean;
    /** Points this game added to the account. */
    points?: number | null;
    /** Headline override (e.g. "Rani wins!"). */
    title?: string;
    onPlayAgain?: () => void;
    playAgainLabel?: string;
}) {
    const { t } = useTranslations();
    const [celebrating, setCelebrating] = useState(false);
    const [open, setOpen] = useState(false);
    /** Result being celebrated; null while the game runs (arms the next one). */
    const [shownKey, setShownKey] = useState<string | null>(null);
    const current = done && matchKey ? matchKey : null;

    if (current !== shownKey && (current === null || shownKey === null)) {
        setShownKey(current);
        setOpen(false);
        setCelebrating(current !== null);
    }

    useEffect(() => {
        if (shownKey === null) {
            return;
        }
        const reduced = prefersReducedMotion();
        const openTimer = window.setTimeout(
            () => setOpen(true),
            reduced ? 300 : 1400,
        );
        const stopTimer = window.setTimeout(
            () => setCelebrating(false),
            reduced ? 0 : CELEBRATION_MS + 2000,
        );
        return () => {
            window.clearTimeout(openTimer);
            window.clearTimeout(stopTimer);
        };
    }, [shownKey]);

    const headline =
        title ??
        (won
            ? t('finale.titleWin')
            : standings.length > 1
              ? t('finale.titleDone')
              : t('finale.titleSolo'));

    return (
        <>
            {celebrating && shownKey && (
                <Confetti key={shownKey} seed={shownKey} />
            )}
            {done && !open && shownKey !== null && (
                <button
                    type="button"
                    onClick={() => setOpen(true)}
                    className="fixed right-4 bottom-4 z-40 inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-[#1f2a44] bg-[#FFD93D] px-4 font-display text-sm font-black text-[#1f2a44] shadow-[3px_3px_0px_#1f2a44] hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-[#1f2a44] focus-visible:outline-none"
                    data-testid="finale-reopen"
                >
                    <Trophy className="size-4" aria-hidden />
                    {t('finale.reopen')}
                </button>
            )}
            {open && (
                <FinaleModal
                    game={game}
                    headline={headline}
                    won={won}
                    points={points}
                    standings={standings}
                    onClose={() => setOpen(false)}
                    onPlayAgain={
                        onPlayAgain
                            ? () => {
                                  setOpen(false);
                                  onPlayAgain();
                              }
                            : undefined
                    }
                    playAgainLabel={playAgainLabel}
                />
            )}
        </>
    );
}

function FinaleModal({
    game,
    headline,
    won,
    points,
    standings,
    onClose,
    onPlayAgain,
    playAgainLabel,
}: {
    game: string;
    headline: string;
    won?: boolean;
    points?: number | null;
    standings: FinaleStanding[];
    onClose: () => void;
    onPlayAgain?: () => void;
    playAgainLabel?: string;
}) {
    const { t } = useTranslations();
    const signedIn = Boolean(usePage<SharedData>().props.auth?.user);
    const titleId = useId();
    const closeRef = useRef<HTMLButtonElement>(null);
    const [board, setBoard] = useState<GameBoard | null | 'error' | 'guest'>(
        signedIn ? null : 'guest',
    );
    const [tab, setTab] = useState<'match' | 'all'>(
        standings.length > 0 ? 'match' : 'all',
    );

    const load = useCallback(() => {
        if (!signedIn) {
            return;
        }
        let alive = true;
        http.get<GameBoard>(`/leaderboard/games/${game}`)
            .then(({ data, response }) => {
                if (alive) {
                    setBoard(response.ok && data ? data : 'error');
                }
            })
            .catch(() => alive && setBoard('error'));
        return () => {
            alive = false;
        };
    }, [game, signedIn]);

    useEffect(() => load(), [load]);

    useEffect(() => {
        closeRef.current?.focus();
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onClose();
            }
        };
        document.addEventListener('keydown', onKey);
        const overflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.removeEventListener('keydown', onKey);
            document.body.style.overflow = overflow;
        };
    }, [onClose]);

    return (
        <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 backdrop-blur-sm sm:items-center sm:p-4"
            onPointerDown={(event) => {
                if (event.target === event.currentTarget) {
                    onClose();
                }
            }}
            data-testid="finale-modal"
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                className="relative flex max-h-[min(92dvh,44rem)] w-full max-w-lg animate-in flex-col overflow-hidden rounded-3xl border-4 border-[#1f2a44] bg-[#FFF9E6] text-[#1f2a44] shadow-[8px_8px_0px_#1f2a44] duration-200 zoom-in-90"
            >
                <button
                    ref={closeRef}
                    type="button"
                    onClick={onClose}
                    className="absolute top-3 right-3 z-10 inline-flex size-11 items-center justify-center rounded-full border-2 border-[#1f2a44] bg-white hover:bg-[#FFF176] focus-visible:ring-2 focus-visible:ring-[#1f2a44] focus-visible:outline-none"
                    aria-label={t('finale.close')}
                    data-testid="finale-close"
                >
                    <X className="size-5" aria-hidden />
                </button>

                <header className="flex flex-col items-center gap-1 border-b-2 border-[#1f2a44]/15 px-5 pt-6 pb-4 text-center">
                    <span className="flex size-14 items-center justify-center rounded-2xl border-3 border-[#1f2a44] bg-[#FFD93D] shadow-[3px_3px_0px_#1f2a44]">
                        {won ? (
                            <Trophy className="size-8" aria-hidden />
                        ) : (
                            <PartyPopper className="size-8" aria-hidden />
                        )}
                    </span>
                    <h2
                        id={titleId}
                        className="mt-2 px-10 font-display text-2xl font-black text-balance break-words"
                        data-testid="finale-title"
                    >
                        {headline}
                    </h2>
                    {points !== undefined && points !== null && (
                        <p
                            className="inline-flex items-center gap-1.5 rounded-full border-2 border-[#1f2a44] bg-white px-3 py-1 text-sm font-black"
                            data-testid="finale-points"
                        >
                            <Coins className="size-4" aria-hidden />
                            {t('finale.points', { points })}
                        </p>
                    )}
                </header>

                {standings.length > 0 && (
                    <div
                        className="grid grid-cols-2 gap-1 px-4 pt-3"
                        role="tablist"
                        aria-label={t('finale.title')}
                    >
                        {(['match', 'all'] as const).map((value) => (
                            <button
                                key={value}
                                type="button"
                                role="tab"
                                aria-selected={tab === value}
                                onClick={() => setTab(value)}
                                data-testid={`finale-tab-${value}`}
                                className={cn(
                                    'min-h-11 rounded-xl border-2 border-[#1f2a44] px-2 text-sm font-black',
                                    tab === value
                                        ? 'bg-[#1f2a44] text-white'
                                        : 'bg-white hover:bg-[#FFF176]',
                                )}
                            >
                                {t(`finale.tabs.${value}`)}
                            </button>
                        ))}
                    </div>
                )}

                <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                    {tab === 'match' && standings.length > 0 ? (
                        <MatchStandings standings={standings} />
                    ) : (
                        <AllTimeBoard board={board} />
                    )}
                </div>

                <footer className="flex flex-col gap-3 border-t-2 border-[#1f2a44]/15 px-4 py-3 sm:flex-row sm:justify-end">
                    {signedIn && (
                        <Link
                            href={`/leaderboard?tab=games&game=${game}`}
                            className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border-2 border-[#1f2a44] bg-white px-4 text-sm font-black hover:bg-[#FFF176] focus-visible:ring-2 focus-visible:ring-[#1f2a44] focus-visible:outline-none"
                            data-testid="finale-full"
                        >
                            <Medal className="size-4" aria-hidden />
                            {t('finale.fullBoard')}
                        </Link>
                    )}
                    {onPlayAgain && (
                        <Button
                            onClick={onPlayAgain}
                            className="min-h-11 rounded-xl border-2 border-[#1f2a44] bg-[#1f2a44] px-5 font-display font-black text-white shadow-[3px_3px_0px_#FF9E44]"
                            data-testid="finale-again"
                        >
                            {playAgainLabel ?? t('finale.again')}
                        </Button>
                    )}
                    <Button
                        variant="ghost"
                        onClick={onClose}
                        className="min-h-11 rounded-xl px-5 font-black text-[#1f2a44] hover:bg-[#1f2a44]/10"
                        data-testid="finale-ok"
                    >
                        {t('finale.ok')}
                    </Button>
                </footer>
            </div>
        </div>
    );
}

function RankBadge({ rank }: { rank: number }) {
    return (
        <span
            className={cn(
                'flex size-8 shrink-0 items-center justify-center rounded-full border-2 border-[#1f2a44] text-sm font-black tabular-nums',
                RANK_TONE[rank] ?? 'bg-white',
            )}
        >
            {rank === 1 ? <Crown className="size-4" aria-hidden /> : rank}
            {rank === 1 && <span className="sr-only">1</span>}
        </span>
    );
}

function MatchStandings({ standings }: { standings: FinaleStanding[] }) {
    const { t } = useTranslations();
    return (
        <ol className="flex flex-col gap-2" data-testid="finale-match">
            {standings.map((row) => (
                <li
                    key={row.key}
                    className={cn(
                        'flex min-w-0 items-center gap-2.5 rounded-2xl border-2 border-[#1f2a44] p-2',
                        row.isYou ? 'bg-[#FFF176]' : 'bg-white',
                    )}
                    data-testid="finale-match-row"
                    data-rank={row.rank}
                >
                    <RankBadge rank={row.rank} />
                    <span className="size-10 shrink-0">
                        <PlayerAvatar
                            character={row.character}
                            seat={row.seat ?? 0}
                            userId={row.userId ?? undefined}
                        />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-sm font-black">
                            {row.name}
                            {row.isYou && ` (${t('room.you')})`}
                        </span>
                        {row.detail && (
                            <span className="truncate text-xs font-bold text-slate-600">
                                {row.detail}
                            </span>
                        )}
                    </span>
                    {row.score !== undefined && (
                        <span className="shrink-0 rounded-lg border-2 border-[#1f2a44] bg-white px-2 py-0.5 text-xs font-black tabular-nums">
                            {row.score}
                        </span>
                    )}
                </li>
            ))}
        </ol>
    );
}

function AllTimeBoard({
    board,
}: {
    board: GameBoard | null | 'error' | 'guest';
}) {
    const { t } = useTranslations();
    if (board === 'guest') {
        return (
            <div className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-[#1f2a44]/25 px-4 py-6 text-center">
                <p className="text-sm font-bold text-slate-600">
                    {t('finale.guest')}
                </p>
                <Link
                    href="/register"
                    className="inline-flex min-h-11 items-center rounded-xl border-2 border-[#1f2a44] bg-[#FFD93D] px-4 text-sm font-black text-[#1f2a44]"
                >
                    {t('nav.registerFree')}
                </Link>
            </div>
        );
    }
    if (board === null) {
        return (
            <div
                className="flex flex-col gap-2"
                role="status"
                aria-label={t('finale.loading')}
                data-testid="finale-loading"
            >
                {[0, 1, 2, 3].map((i) => (
                    <div
                        key={i}
                        className="h-14 animate-pulse rounded-2xl border-2 border-[#1f2a44]/15 bg-[#1f2a44]/[0.06]"
                    />
                ))}
            </div>
        );
    }
    if (board === 'error') {
        return (
            <p className="rounded-xl border-2 border-dashed border-[#1f2a44]/25 px-4 py-6 text-center text-sm font-bold text-slate-600">
                {t('finale.error')}
            </p>
        );
    }
    const meListed = board.entries.some((entry) => entry.isMe);
    return (
        <div className="flex flex-col gap-2" data-testid="finale-all">
            <p className="flex items-center gap-2 text-xs font-black text-slate-600 uppercase">
                {createElement(gameIcon(board.icon), {
                    className: 'size-4',
                    style: { color: board.accent },
                    'aria-hidden': true,
                })}
                {t('finale.allTime', { game: t(board.titleKey) })}
            </p>
            {board.entries.length === 0 ? (
                <p className="rounded-xl border-2 border-dashed border-[#1f2a44]/25 px-4 py-6 text-center text-sm font-bold text-slate-600">
                    {t('finale.empty')}
                </p>
            ) : (
                <ol className="flex flex-col gap-2">
                    {board.entries.map((entry) => (
                        <li
                            key={entry.userId}
                            className={cn(
                                'flex min-w-0 items-center gap-2.5 rounded-2xl border-2 border-[#1f2a44] p-2',
                                entry.isMe ? 'bg-[#FFF176]' : 'bg-white',
                            )}
                            data-testid="finale-all-row"
                        >
                            <RankBadge rank={entry.rank} />
                            <span className="size-10 shrink-0">
                                <PlayerAvatar
                                    character={entry.character}
                                    userId={entry.userId}
                                />
                            </span>
                            <span className="min-w-0 flex-1 truncate text-sm font-black">
                                {entry.name}
                                {entry.isMe && ` (${t('room.you')})`}
                            </span>
                            <span className="shrink-0 rounded-lg border-2 border-[#1f2a44] bg-white px-2 py-0.5 text-xs font-black tabular-nums">
                                {t('finale.pointsShort', {
                                    points: entry.points,
                                })}
                            </span>
                        </li>
                    ))}
                </ol>
            )}
            {board.me && !meListed && (
                <p
                    className="rounded-2xl border-2 border-[#1f2a44] bg-[#FFF176] px-3 py-2 text-sm font-black"
                    data-testid="finale-me"
                >
                    {t('finale.myRank', {
                        rank: board.me.rank,
                        points: board.me.points,
                        total: board.players,
                    })}
                </p>
            )}
        </div>
    );
}
