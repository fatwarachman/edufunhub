import { OnlineDot } from '@/components/online-dot';
import PlayerCharacter, {
    type CharacterData,
} from '@/components/player-character';
import { ResponsiveTable } from '@/components/responsive-table';
import { useTranslations } from '@/hooks/use-translations';
import PlayerLayout from '@/layouts/player-layout';
import { gameIcon } from '@/lib/games';
import { cn } from '@/lib/utils';
import { Deferred, Link, usePage } from '@inertiajs/react';
import {
    ChevronLeft,
    ChevronRight,
    Crown,
    Gamepad2,
    type LucideIcon,
    School,
    Trophy,
    Users,
    X,
} from 'lucide-react';
import {
    createElement,
    type ReactNode,
    useCallback,
    useEffect,
    useMemo,
    useState,
} from 'react';

type Period = 'week' | 'month' | 'all';
type Tab = 'overall' | 'schools' | 'games';

const PERIODS: Period[] = ['week', 'month', 'all'];
const TABS: Tab[] = ['overall', 'schools', 'games'];
const TAB_ICONS: Record<Tab, LucideIcon> = {
    overall: Trophy,
    schools: School,
    games: Gamepad2,
};

interface Entry {
    rank: number;
    userId: number;
    name: string;
    points: number;
    isMe: boolean;
    character: CharacterData;
}

interface Standing {
    rank: number;
    points: number;
}

interface Board {
    entries: Entry[];
    me: Standing | null;
}

interface SchoolRow {
    rank: number;
    key: string;
    name: string;
    city: string | null;
    players: number;
    points: number;
    isMine: boolean;
}

interface SchoolBoards {
    entries: SchoolRow[];
    mine: SchoolRow | null;
    mySchool: {
        name: string;
        city: string | null;
        entries: Entry[];
        me: Standing | null;
    } | null;
}

interface GameInfo {
    key: string;
    titleKey: string;
    icon: string;
    accent: string;
}

interface GameBoard extends GameInfo, Board {
    players: number;
}

interface LeaderboardProps {
    overall: Record<Period, Board>;
    games: GameInfo[];
    schools?: SchoolBoards;
    gameBoards?: GameBoard[];
}

const INK = 'border-[#151b2e]';
const CARD = 'auth-card flex min-w-0 flex-col gap-4 !p-4 sm:!p-5';

/** Podium colours for the top three ranks. */
const PODIUM: Record<number, string> = {
    1: 'bg-[#ffd93d]',
    2: 'bg-[#c9d3e3]',
    3: 'bg-[#f4c095]',
};

/** Query parameter of the current Inertia URL (works during SSR too). */
function useQueryParam(name: string): string | null {
    const { url } = usePage();
    const query = url.includes('?') ? url.slice(url.indexOf('?') + 1) : '';
    return new URLSearchParams(query).get(name);
}

function writeParams(values: Record<string, string | null>) {
    const url = new URL(window.location.href);
    Object.entries(values).forEach(([key, value]) => {
        if (value) {
            url.searchParams.set(key, value);
        } else {
            url.searchParams.delete(key);
        }
    });
    window.history.replaceState(window.history.state, '', url.toString());
}

function EmptyNote({ children }: { children: ReactNode }) {
    return (
        <p className="rounded-xl border-2 border-dashed border-[#151b2e]/25 px-4 py-6 text-center text-sm text-[#151b2e]/75">
            {children}
        </p>
    );
}

function SkeletonBlock({ className }: { className?: string }) {
    return (
        <div
            className={cn(
                'animate-pulse rounded-xl border-2 border-[#151b2e]/15 bg-[#151b2e]/[0.06]',
                className,
            )}
            aria-hidden
        />
    );
}

function BoardsSkeleton() {
    const { t } = useTranslations();
    return (
        <div
            className="flex flex-col gap-3"
            role="status"
            aria-label={t('leaderboardPage.loading')}
            data-testid="lb-skeleton"
        >
            <SkeletonBlock className="h-14" />
            <SkeletonBlock className="h-44" />
            <SkeletonBlock className="h-72" />
        </div>
    );
}

function SegmentedTabs<T extends string>({
    items,
    value,
    onChange,
    label,
    idPrefix,
    panelId,
    render,
}: {
    items: T[];
    value: T;
    onChange: (value: T) => void;
    label: string;
    idPrefix: string;
    panelId: string;
    render: (item: T) => ReactNode;
}) {
    return (
        <div
            className={`grid gap-1 rounded-[1.25rem] border-2 ${INK} bg-white p-1`}
            style={{
                gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))`,
            }}
            role="tablist"
            aria-label={label}
        >
            {items.map((item) => (
                <button
                    key={item}
                    type="button"
                    role="tab"
                    id={`${idPrefix}-${item}`}
                    aria-selected={value === item}
                    aria-controls={panelId}
                    onClick={() => onChange(item)}
                    data-testid={`${idPrefix}-${item}`}
                    className={cn(
                        'flex min-h-10 min-w-0 items-center justify-center gap-1.5 rounded-full px-2 text-xs leading-tight font-bold transition-colors sm:text-sm',
                        value === item
                            ? 'bg-[#151b2e] text-white'
                            : 'text-[#151b2e] hover:bg-[#fff0cf]',
                    )}
                >
                    {render(item)}
                </button>
            ))}
        </div>
    );
}

function PlayerBoard({
    board,
    number,
    empty,
    testId,
}: {
    board: Board;
    number: Intl.NumberFormat;
    empty: string;
    testId: string;
}) {
    const { t } = useTranslations();
    const meListed = board.entries.some((row) => row.isMe);
    const podium = board.entries.slice(0, 3);
    const order = [podium[1], podium[0], podium[2]];

    return (
        <div className="flex flex-col gap-3" data-testid={testId}>
            {board.entries.length === 0 ? (
                <EmptyNote>{empty}</EmptyNote>
            ) : (
                <>
                    <div
                        className="mx-auto flex w-full max-w-md items-end gap-2 rounded-2xl bg-[#fff4d6] px-2 pt-3"
                        aria-label={t('playerDash.board.podium')}
                        role="group"
                    >
                        {order.map((row, index) =>
                            row ? (
                                <div
                                    key={row.userId}
                                    className="flex min-w-0 flex-1 basis-0 flex-col items-center gap-1"
                                >
                                    <span className="relative">
                                        <PlayerCharacter
                                            character={row.character}
                                            size={row.rank === 1 ? 72 : 56}
                                            backdrop={false}
                                            animated={false}
                                        />
                                        {row.rank === 1 && (
                                            <Crown
                                                className="absolute -top-3 left-1/2 size-5 -translate-x-1/2 fill-[#ffd93d] text-[#151b2e]"
                                                aria-hidden
                                            />
                                        )}
                                    </span>
                                    <span
                                        className={cn(
                                            'w-full truncate text-center text-xs font-bold',
                                            row.isMe && 'text-[#6c5ce7]',
                                        )}
                                    >
                                        {row.name}
                                    </span>
                                    <span
                                        className={cn(
                                            `flex w-full flex-col items-center justify-start rounded-t-xl border-2 border-b-0 ${INK} pt-1.5 font-bold`,
                                            PODIUM[row.rank],
                                            row.rank === 1
                                                ? 'h-20'
                                                : row.rank === 2
                                                  ? 'h-14'
                                                  : 'h-10',
                                        )}
                                    >
                                        <span className="text-lg leading-none">
                                            {row.rank}
                                        </span>
                                        <span className="text-[10px] tabular-nums">
                                            {number.format(row.points)}
                                        </span>
                                    </span>
                                </div>
                            ) : (
                                <div
                                    key={`empty-${index}`}
                                    className="min-w-0 flex-1 basis-0"
                                />
                            ),
                        )}
                    </div>
                    <ol
                        className="flex flex-col gap-1.5"
                        data-testid={`${testId}-list`}
                    >
                        {board.entries.map((row) => (
                            <li
                                key={row.userId}
                                className={cn(
                                    `flex min-w-0 items-center gap-2.5 rounded-xl border-2 ${INK} px-2.5 py-1.5`,
                                    row.isMe
                                        ? 'bg-[#fff0cf] ring-2 ring-[#f5a623]'
                                        : 'bg-white',
                                )}
                                data-me={row.isMe ? 'true' : undefined}
                            >
                                <span
                                    className={cn(
                                        'grid size-7 shrink-0 place-items-center rounded-full border-2 text-sm font-bold tabular-nums',
                                        PODIUM[row.rank]
                                            ? `${INK} ${PODIUM[row.rank]}`
                                            : 'border-[#151b2e]/25',
                                    )}
                                    aria-label={t('portal.rank', {
                                        rank: row.rank,
                                    })}
                                >
                                    {row.rank}
                                </span>
                                <span className="relative shrink-0">
                                    <PlayerCharacter
                                        character={row.character}
                                        size={32}
                                        backdrop={false}
                                        animated={false}
                                    />
                                    <OnlineDot userId={row.userId} />
                                </span>
                                <span className="min-w-0 flex-1 truncate text-sm font-bold">
                                    {row.name}
                                    {row.isMe && (
                                        <span className="font-semibold text-[#151b2e]/80">
                                            {' '}
                                            ({t('portal.you')})
                                        </span>
                                    )}
                                </span>
                                <span className="shrink-0 text-sm font-bold tabular-nums">
                                    {t('playerDash.board.points', {
                                        formatted: number.format(row.points),
                                    })}
                                </span>
                            </li>
                        ))}
                    </ol>
                </>
            )}
            {board.me && !meListed && (
                <p
                    className="flex items-center justify-between gap-3 rounded-xl border-2 border-dashed border-[#151b2e] bg-[#fff0cf] px-3 py-2 text-sm font-bold"
                    data-testid={`${testId}-me`}
                >
                    <span>
                        {t('portal.leaderboardMe', {
                            rank: number.format(board.me.rank),
                        })}
                    </span>
                    <span className="tabular-nums">
                        {number.format(board.me.points)}
                    </span>
                </p>
            )}
        </div>
    );
}

function SectionHeading({
    icon: Icon,
    children,
    id,
}: {
    icon: LucideIcon;
    children: ReactNode;
    id: string;
}) {
    return (
        <h2
            id={id}
            className="flex min-w-0 items-center gap-2 text-lg font-bold sm:text-xl"
        >
            <span
                className={`grid size-8 shrink-0 place-items-center rounded-xl border-2 ${INK} bg-[#fff4d6]`}
            >
                <Icon className="size-4" aria-hidden />
            </span>
            <span className="min-w-0 break-words">{children}</span>
        </h2>
    );
}

function OverallPanel({
    overall,
    number,
}: {
    overall: Record<Period, Board>;
    number: Intl.NumberFormat;
}) {
    const { t } = useTranslations();
    const initialPeriod = useQueryParam('period');
    const [period, setPeriod] = useState<Period>(
        PERIODS.includes(initialPeriod as Period)
            ? (initialPeriod as Period)
            : 'week',
    );
    const board = overall[period];

    const choose = (next: Period) => {
        setPeriod(next);
        writeParams({ period: next === 'week' ? null : next });
    };

    return (
        <section
            className={CARD}
            aria-labelledby="lb-overall-title"
            data-testid="lb-overall"
        >
            <SectionHeading icon={Trophy} id="lb-overall-title">
                {t('leaderboardPage.overall.title')}
            </SectionHeading>
            <p className="text-sm text-[#151b2e]/80">
                {t('leaderboardPage.overall.intro')}
            </p>
            <SegmentedTabs
                items={PERIODS}
                value={period}
                onChange={choose}
                label={t('portal.leaderboardPeriod.label')}
                idPrefix="lb-period"
                panelId="lb-period-panel"
                render={(item) => t(`portal.leaderboardPeriod.${item}`)}
            />
            <div
                id="lb-period-panel"
                role="tabpanel"
                aria-labelledby={`lb-period-${period}`}
                className="flex flex-col gap-3"
            >
                <PlayerBoard
                    board={board}
                    number={number}
                    testId="lb-overall-board"
                    empty={t(
                        period === 'all'
                            ? 'portal.leaderboardEmpty'
                            : 'portal.leaderboardEmptyPeriod',
                    )}
                />
                {!board.me && board.entries.length > 0 && (
                    <p className="text-center text-xs font-semibold text-[#151b2e]/75">
                        {t('portal.leaderboardNotRanked')}
                    </p>
                )}
            </div>
        </section>
    );
}

function SchoolsPanel({
    schools,
    number,
}: {
    schools?: SchoolBoards;
    number: Intl.NumberFormat;
}) {
    const { t } = useTranslations();
    if (!schools) {
        return null;
    }
    const mineListed = schools.entries.some((row) => row.isMine);

    return (
        <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <section
                className={CARD}
                aria-labelledby="lb-schools-title"
                data-testid="lb-schools"
            >
                <SectionHeading icon={School} id="lb-schools-title">
                    {t('leaderboardPage.schools.title')}
                </SectionHeading>
                <p className="text-sm text-[#151b2e]/80">
                    {t('leaderboardPage.schools.intro')}
                </p>
                <ResponsiveTable
                    variant="player"
                    testId="lb-schools-table"
                    caption={t('leaderboardPage.schools.title')}
                    className="data-[layout=table]:overflow-hidden data-[layout=table]:rounded-2xl data-[layout=table]:border-2 data-[layout=table]:border-[#151b2e] data-[layout=table]:bg-white"
                    rows={schools.entries}
                    rowKey={(row) => row.key}
                    rowClassName={(row) =>
                        row.isMine ? '!bg-[#fff0cf]' : undefined
                    }
                    empty={
                        <EmptyNote>
                            {t('leaderboardPage.schools.empty')}
                        </EmptyNote>
                    }
                    columns={[
                        {
                            key: 'rank',
                            header: '#',
                            primary: true,
                            cellClassName: 'font-bold tabular-nums w-10',
                            cell: (row) => (
                                <span
                                    className={cn(
                                        'grid size-7 place-items-center rounded-full border-2 text-sm font-bold',
                                        PODIUM[row.rank]
                                            ? `${INK} ${PODIUM[row.rank]}`
                                            : 'border-[#151b2e]/25',
                                    )}
                                    aria-label={t('portal.rank', {
                                        rank: row.rank,
                                    })}
                                >
                                    {row.rank}
                                </span>
                            ),
                        },
                        {
                            key: 'name',
                            header: t('leaderboardPage.schools.school'),
                            primary: true,
                            cellClassName: 'font-bold',
                            cell: (row) => (
                                <span className="[overflow-wrap:anywhere]">
                                    {row.name}
                                    {row.isMine && (
                                        <span className="font-semibold text-[#6c5ce7]">
                                            {' '}
                                            ({t('leaderboardPage.schools.mine')}
                                            )
                                        </span>
                                    )}
                                </span>
                            ),
                        },
                        {
                            key: 'city',
                            header: t('leaderboardPage.schools.city'),
                            summary: true,
                            cell: (row) => row.city ?? '—',
                        },
                        {
                            key: 'players',
                            header: t('leaderboardPage.schools.players'),
                            align: 'right',
                            cellClassName: 'tabular-nums',
                            cell: (row) => number.format(row.players),
                        },
                        {
                            key: 'points',
                            header: t('leaderboardPage.schools.points'),
                            align: 'right',
                            summary: true,
                            cellClassName: 'font-bold tabular-nums',
                            cell: (row) =>
                                t('playerDash.board.points', {
                                    formatted: number.format(row.points),
                                }),
                        },
                    ]}
                />
                {schools.mine && !mineListed && (
                    <p
                        className="flex items-center justify-between gap-3 rounded-xl border-2 border-dashed border-[#151b2e] bg-[#fff0cf] px-3 py-2 text-sm font-bold"
                        data-testid="lb-schools-mine"
                    >
                        <span>
                            {t('leaderboardPage.schools.myRank', {
                                rank: number.format(schools.mine.rank),
                            })}
                        </span>
                        <span className="tabular-nums">
                            {number.format(schools.mine.points)}
                        </span>
                    </p>
                )}
            </section>

            <section
                className={CARD}
                aria-labelledby="lb-myschool-title"
                data-testid="lb-myschool"
            >
                <SectionHeading icon={Users} id="lb-myschool-title">
                    {t('leaderboardPage.mySchool.title')}
                </SectionHeading>
                {schools.mySchool ? (
                    <>
                        <p className="text-sm font-semibold break-words text-[#151b2e]/80">
                            {schools.mySchool.city
                                ? t('leaderboardPage.mySchool.nameCity', {
                                      name: schools.mySchool.name,
                                      city: schools.mySchool.city,
                                  })
                                : schools.mySchool.name}
                        </p>
                        <PlayerBoard
                            board={schools.mySchool}
                            number={number}
                            testId="lb-myschool-board"
                            empty={t('leaderboardPage.mySchool.empty')}
                        />
                    </>
                ) : (
                    <EmptyNote>
                        {t('leaderboardPage.mySchool.noSchool')}
                    </EmptyNote>
                )}
            </section>
        </div>
    );
}

function GameIcon({ icon, accent }: { icon?: string; accent?: string }) {
    return createElement(icon ? gameIcon(icon) : Gamepad2, {
        className: 'size-4',
        style: { color: accent },
        'aria-hidden': true,
    });
}

function GameModal({
    game,
    board,
    number,
    onClose,
}: {
    game: GameInfo;
    board: GameBoard | undefined;
    number: Intl.NumberFormat;
    onClose: () => void;
}) {
    const { t } = useTranslations();

    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
            }
        };
        document.addEventListener('keydown', handleKey);
        return () => document.removeEventListener('keydown', handleKey);
    }, [onClose]);

    // Lock body scroll while modal open
    useEffect(() => {
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = prev;
        };
    }, []);

    return (
        <div
            className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
            data-testid="lb-game-modal"
        >
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-[#151b2e]/60 backdrop-blur-sm"
                aria-hidden
                onClick={onClose}
            />
            {/* Panel */}
            <div
                className={cn(
                    'relative z-10 flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border-2 sm:rounded-2xl',
                    INK,
                    'bg-white',
                )}
                role="dialog"
                aria-modal="true"
                aria-labelledby="lb-game-modal-title"
            >
                {/* Header */}
                <div
                    className={`flex shrink-0 items-center gap-3 border-b-2 ${INK} bg-[#fff4d6] px-4 py-3`}
                >
                    <span
                        className={`grid size-9 shrink-0 place-items-center rounded-xl border-2 ${INK} bg-white`}
                    >
                        <GameIcon icon={game.icon} accent={game.accent} />
                    </span>
                    <div className="min-w-0 flex-1">
                        <h2
                            id="lb-game-modal-title"
                            className="truncate text-base font-bold sm:text-lg"
                        >
                            {t(game.titleKey)}
                        </h2>
                        {board && (
                            <p className="text-xs text-[#151b2e]/75">
                                {t('leaderboardPage.games.players', {
                                    formatted: number.format(board.players),
                                })}
                            </p>
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label={t('leaderboardPage.games.modalClose')}
                        data-testid="lb-game-modal-close"
                        className={`grid size-9 shrink-0 place-items-center rounded-xl border-2 ${INK} bg-white text-[#151b2e] transition-colors hover:bg-[#fff0cf]`}
                    >
                        <X className="size-4" aria-hidden />
                    </button>
                </div>
                {/* Body */}
                <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
                    {board ? (
                        <PlayerBoard
                            board={board}
                            number={number}
                            testId="lb-game-modal-board"
                            empty={t('leaderboardPage.games.empty')}
                        />
                    ) : (
                        <EmptyNote>
                            {t('leaderboardPage.games.empty')}
                        </EmptyNote>
                    )}
                </div>
            </div>
        </div>
    );
}

function GamesPanel({
    games,
    boards,
    number,
}: {
    games: GameInfo[];
    boards?: GameBoard[];
    number: Intl.NumberFormat;
}) {
    const { t, i18n } = useTranslations();
    const initialGame = useQueryParam('game');
    const [selectedGame, setSelectedGame] = useState<string | null>(
        games.some((g) => g.key === initialGame)
            ? (initialGame as string)
            : null,
    );

    const sortedGames = useMemo(
        () =>
            [...games].sort((a, b) =>
                t(a.titleKey).localeCompare(t(b.titleKey), i18n.language),
            ),
        [games, t, i18n.language],
    );

    const openModal = useCallback((key: string) => {
        setSelectedGame(key);
        writeParams({ game: key });
    }, []);

    const closeModal = useCallback(() => {
        setSelectedGame(null);
        writeParams({ game: null });
    }, []);

    const activeGame = games.find((g) => g.key === selectedGame);
    const activeBoard = boards?.find((b) => b.key === selectedGame);

    if (!boards) {
        return (
            <section
                className={cn(CARD, 'w-full')}
                aria-labelledby="lb-games-title"
                data-testid="lb-games"
            >
                <SectionHeading icon={Gamepad2} id="lb-games-title">
                    {t('leaderboardPage.games.title')}
                </SectionHeading>
                <BoardsSkeleton />
            </section>
        );
    }

    return (
        <>
            <section
                className={cn(CARD, 'w-full')}
                aria-labelledby="lb-games-title"
                data-testid="lb-games"
            >
                <SectionHeading icon={Gamepad2} id="lb-games-title">
                    {t('leaderboardPage.games.title')}
                </SectionHeading>
                <p className="text-sm text-[#151b2e]/80">
                    {t('leaderboardPage.games.intro')}
                </p>
                {sortedGames.length === 0 ? (
                    <EmptyNote>{t('leaderboardPage.games.empty')}</EmptyNote>
                ) : (
                    <ul
                        className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5"
                        aria-label={t('leaderboardPage.games.allGames')}
                        data-testid="lb-games-grid"
                    >
                        {sortedGames.map((game) => {
                            const board = boards.find(
                                (b) => b.key === game.key,
                            );
                            return (
                                <li key={game.key} className="flex min-w-0">
                                    <button
                                        type="button"
                                        onClick={() => openModal(game.key)}
                                        data-testid={`lb-game-card-${game.key}`}
                                        aria-label={`${t(game.titleKey)}, ${t('leaderboardPage.games.viewRanking')}`}
                                        className={cn(
                                            'group flex w-full min-w-0 flex-col gap-3 rounded-2xl border-2 bg-white p-3 text-left shadow-[0_3px_0_#151b2e] transition-[transform,background-color,box-shadow] hover:-translate-y-0.5 hover:bg-[#fff8e6] hover:shadow-[0_5px_0_#151b2e] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#6c5ce7] active:translate-y-0.5 active:shadow-[0_1px_0_#151b2e] motion-reduce:transition-none motion-reduce:hover:translate-y-0 sm:p-4',
                                            INK,
                                        )}
                                    >
                                        <span className="flex min-w-0 items-start gap-3">
                                            <span
                                                className={cn(
                                                    'grid size-11 shrink-0 place-items-center rounded-xl border-2',
                                                    INK,
                                                    'bg-[#fff4d6]',
                                                )}
                                                style={
                                                    game.accent
                                                        ? {
                                                              background: `${game.accent}18`,
                                                          }
                                                        : undefined
                                                }
                                            >
                                                {createElement(
                                                    game.icon
                                                        ? gameIcon(game.icon)
                                                        : Gamepad2,
                                                    {
                                                        className: 'size-6',
                                                        style: {
                                                            color: game.accent,
                                                        },
                                                        'aria-hidden': true,
                                                    },
                                                )}
                                            </span>
                                            <span
                                                className="line-clamp-2 min-w-0 flex-1 self-center text-base leading-snug font-bold break-words text-[#151b2e]"
                                                data-testid="lb-game-card-title"
                                            >
                                                {t(game.titleKey)}
                                            </span>
                                        </span>
                                        <span className="mt-auto flex min-w-0 items-center justify-between gap-2 border-t-2 border-dashed border-[#151b2e]/15 pt-2">
                                            <span className="flex min-w-0 items-center gap-1.5 text-xs text-[#151b2e]/80">
                                                <Users
                                                    className="size-4 shrink-0"
                                                    aria-hidden
                                                />
                                                <span className="min-w-0 truncate">
                                                    {t(
                                                        'leaderboardPage.games.playersLabel',
                                                    )}
                                                </span>
                                                <span className="shrink-0 text-sm font-bold text-[#151b2e] tabular-nums">
                                                    {number.format(
                                                        board?.players ?? 0,
                                                    )}
                                                </span>
                                            </span>
                                            <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-[#ffd93d] px-2 py-1 text-xs font-bold text-[#151b2e] transition-colors group-hover:bg-[#ffc800]">
                                                <span className="sr-only sm:not-sr-only">
                                                    {t(
                                                        'leaderboardPage.games.viewRanking',
                                                    )}
                                                </span>
                                                <ChevronRight
                                                    className="size-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
                                                    aria-hidden
                                                />
                                            </span>
                                        </span>
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </section>

            {activeGame && (
                <GameModal
                    game={activeGame}
                    board={activeBoard}
                    number={number}
                    onClose={closeModal}
                />
            )}
        </>
    );
}

export default function Leaderboard({
    overall,
    games,
    schools,
    gameBoards,
}: LeaderboardProps) {
    const { t, i18n } = useTranslations();
    const number = useMemo(
        () => new Intl.NumberFormat(i18n.language),
        [i18n.language],
    );
    const initialTab = useQueryParam('tab');
    const [tab, setTab] = useState<Tab>(
        TABS.includes(initialTab as Tab) ? (initialTab as Tab) : 'overall',
    );

    const chooseTab = (next: Tab) => {
        setTab(next);
        writeParams({ tab: next === 'overall' ? null : next });
    };

    return (
        <PlayerLayout title={t('leaderboardPage.title')}>
            <section
                className="auth-card flex min-w-0 flex-col gap-3 !bg-[#fff4d6] !p-4 sm:!p-6"
                aria-labelledby="lb-title"
                data-testid="lb-hero"
            >
                <Link
                    href="/dashboard"
                    prefetch
                    className="inline-flex items-center gap-1 self-start rounded-full text-sm font-bold text-[#151b2e] hover:underline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#6c5ce7]"
                    data-testid="lb-back"
                >
                    <ChevronLeft className="size-4" aria-hidden />
                    {t('leaderboardPage.back')}
                </Link>
                <h1
                    id="lb-title"
                    className="flex items-center gap-2 text-2xl font-bold tracking-tight text-balance break-words sm:text-3xl md:text-4xl"
                >
                    <Crown
                        className="size-7 shrink-0 fill-[#ffd93d] text-[#151b2e]"
                        aria-hidden
                    />
                    {t('leaderboardPage.title')}
                </h1>
                <p className="text-sm text-[#151b2e]/80">
                    {t('leaderboardPage.intro')}
                </p>
                <SegmentedTabs
                    items={TABS}
                    value={tab}
                    onChange={chooseTab}
                    label={t('leaderboardPage.tabs.label')}
                    idPrefix="lb-tab"
                    panelId="lb-tab-panel"
                    render={(item) => {
                        const Icon = TAB_ICONS[item];
                        return (
                            <>
                                <Icon
                                    className="hidden size-4 shrink-0 min-[400px]:block"
                                    aria-hidden
                                />
                                <span className="min-w-0 truncate">
                                    {t(`leaderboardPage.tabs.${item}`)}
                                </span>
                            </>
                        );
                    }}
                />
            </section>

            <div
                id="lb-tab-panel"
                role="tabpanel"
                aria-labelledby={`lb-tab-${tab}`}
                className="flex min-w-0 flex-col gap-6"
                data-tab={tab}
            >
                {tab === 'overall' && (
                    <div className="mx-auto w-full max-w-3xl">
                        <OverallPanel overall={overall} number={number} />
                    </div>
                )}
                {tab === 'schools' && (
                    <Deferred data="schools" fallback={<BoardsSkeleton />}>
                        <SchoolsPanel schools={schools} number={number} />
                    </Deferred>
                )}
                {tab === 'games' && (
                    <Deferred data="gameBoards" fallback={<BoardsSkeleton />}>
                        <GamesPanel
                            games={games}
                            boards={gameBoards}
                            number={number}
                        />
                    </Deferred>
                )}
            </div>
        </PlayerLayout>
    );
}
