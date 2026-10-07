import { JoinByPinCard } from '@/components/join-by-pin';
import { OnlineDot } from '@/components/online-dot';
import PlayerCharacter, {
    type CharacterData,
} from '@/components/player-character';
import { PlayerCountBadge } from '@/components/player-count-badge';
import { NavButton } from '@/components/site-nav';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import { WhatsAppShareButton } from '@/components/whatsapp-share-button';
import { useMyUserId } from '@/hooks/use-chat-socket';
import { useTranslations } from '@/hooks/use-translations';
import PlayerLayout from '@/layouts/player-layout';
import { gameIcon } from '@/lib/games';
import { gradeLabel, hasGrade } from '@/lib/grade';
import { absoluteUrl } from '@/lib/share';
import { Deferred, Link, router } from '@inertiajs/react';
import {
    CircleAlert,
    Coins,
    Crown,
    Flame,
    Gamepad2,
    GraduationCap,
    History,
    IdCard,
    Loader2,
    Medal,
    MessageCircle,
    Play,
    Sparkles,
    Star,
    Users,
} from 'lucide-react';
import { useMemo, useState } from 'react';

type LeaderboardPeriod = 'week' | 'month' | 'all';

interface LeaderboardData {
    entries: {
        rank: number;
        userId: number;
        name: string;
        points: number;
        isMe: boolean;
        character: { color: string; accessory: string };
    }[];
    me: { rank: number; points: number } | null;
}

const LEADERBOARD_PERIODS: LeaderboardPeriod[] = ['week', 'month', 'all'];

/** Podium colours for the top three ranks. */
const PODIUM: Record<number, string> = {
    1: 'bg-[#ffd93d]',
    2: 'bg-[#c9d3e3]',
    3: 'bg-[#f4c095]',
};

interface PortalGame {
    key: string;
    titleKey: string;
    descriptionKey: string | null;
    url: string;
    icon: string;
    accent: string;
    minGrade: number;
    maxGrade: number;
    minPlayers: number;
    maxPlayers: number;
    awardsPoints: boolean;
    requiresGrade: boolean;
    recommended: boolean;
    plays: number;
    popularRank: number | null;
}

interface ActiveGame {
    game_key: string;
    titleKey: string;
    icon: string;
    accent: string;
    pin: string | null;
    phase: string;
    host: boolean;
    url: string;
}

interface PortalProps {
    player: {
        name: string;
        grade: number | null;
        character: CharacterData;
        detailsComplete: boolean;
    };
    detailsRequiredNotice: boolean;
    progress: {
        points: number;
        level: number;
        levelProgress: number;
        pointsPerLevel: number;
        nextLevelAt: number;
    };
    rank: number | null;
    categories: { key: string; titleKey: string; games: PortalGame[] }[];
    popularityDays: number;
    leaderboards: Record<LeaderboardPeriod, LeaderboardData>;
    recent: {
        id: number;
        game_key: string;
        game_name: string;
        points: number;
        played_at: string;
    }[];
    /** Deferred: rooms the player is still seated in on the game service. */
    activeGames?: ActiveGame[];
}

export default function Portal({
    player,
    detailsRequiredNotice,
    progress,
    rank,
    categories,
    popularityDays,
    leaderboards,
    recent,
    activeGames,
}: PortalProps) {
    const { t, i18n } = useTranslations();
    const myId = useMyUserId();
    const [filter, setFilter] = useState<string>('all');
    const numberFormat = useMemo(
        () => new Intl.NumberFormat(i18n.language),
        [i18n.language],
    );

    const games = useMemo(
        () =>
            categories
                .filter((c) => filter === 'all' || c.key === filter)
                .flatMap((c) =>
                    c.games.map((g) => ({ ...g, categoryKey: c.titleKey })),
                ),
        [categories, filter],
    );
    const totalGames = useMemo(
        () => categories.reduce((sum, c) => sum + c.games.length, 0),
        [categories],
    );
    const levelPercent = Math.round(
        (progress.levelProgress / progress.pointsPerLevel) * 100,
    );

    return (
        <PlayerLayout title={t('portal.title')}>
            {!player.detailsComplete && (
                <PlayerDetailsNotice emphasized={detailsRequiredNotice} />
            )}
            <section
                className="auth-card grid items-center gap-6 !bg-[#fff4d6] md:grid-cols-[200px_minmax(0,1fr)] lg:grid-cols-[220px_minmax(0,1fr)_280px]"
                aria-labelledby="portal-hero-title"
            >
                <div className="relative mx-auto w-32 sm:w-40 md:w-full">
                    <PlayerCharacter character={player.character} />
                    <OnlineDot userId={myId} className="edu-online-dot--lg" />
                </div>
                <div className="flex min-w-0 flex-col gap-3">
                    <span className="auth-badge self-start">
                        {t('portal.badge')}
                    </span>
                    <h1
                        id="portal-hero-title"
                        className="text-3xl font-bold tracking-tight text-balance break-words md:text-4xl"
                        data-testid="portal-player-name"
                    >
                        {t('portal.greeting', { name: player.name })}
                    </h1>
                    <div className="flex flex-wrap gap-2 text-sm font-bold">
                        <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-[#151b2e] bg-[#6c5ce7] px-3 py-1 text-white">
                            <GraduationCap className="size-4" />
                            {hasGrade(player.grade)
                                ? gradeLabel(t, player.grade)
                                : t('player.gradeMissing')}
                        </span>
                        <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-[#151b2e] bg-white px-3 py-1">
                            <Star className="size-4 text-[#f5a623]" />
                            {t('portal.level', { level: progress.level })}
                        </span>
                        {rank !== null && (
                            <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-[#151b2e] bg-white px-3 py-1">
                                <Medal className="size-4 text-[#e85d75]" />
                                {t('portal.rank', { rank })}
                            </span>
                        )}
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <div
                            className="h-4 overflow-hidden rounded-full border-2 border-[#151b2e] bg-white"
                            role="progressbar"
                            aria-valuemin={0}
                            aria-valuemax={progress.pointsPerLevel}
                            aria-valuenow={progress.levelProgress}
                            aria-label={t('portal.levelProgress')}
                        >
                            <div
                                className="h-full bg-[repeating-linear-gradient(45deg,#6c5ce7_0_8px,#8577ef_8px_16px)] transition-[width] duration-700"
                                style={{ width: `${levelPercent}%` }}
                            />
                        </div>
                        <p className="text-xs font-semibold text-muted-foreground">
                            {t('portal.nextLevel', {
                                points: numberFormat.format(
                                    progress.nextLevelAt - progress.points,
                                ),
                                level: progress.level + 1,
                            })}
                        </p>
                    </div>
                    {!hasGrade(player.grade) && (
                        <NavButton
                            href="/dashboard#grade"
                            icon={GraduationCap}
                            label={t('flagQuest.state.setGrade')}
                            className="self-start"
                        />
                    )}
                </div>
                <div className="flex flex-col gap-3 rounded-2xl border-[3px] border-[#151b2e] bg-[#ffd93d] p-4 md:col-span-2 lg:col-span-1">
                    <p className="flex items-center gap-2 font-bold">
                        <Coins className="size-5" />
                        {t('player.points')}
                    </p>
                    <p
                        className="text-5xl font-bold tabular-nums"
                        data-testid="portal-points"
                    >
                        {numberFormat.format(progress.points)}
                    </p>
                    <p className="text-sm">{t('portal.pointsNote')}</p>
                </div>
            </section>

            <Deferred
                data="activeGames"
                fallback={
                    <span className="sr-only">
                        {t('portal.activeGames.loading')}
                    </span>
                }
            >
                <ActiveGames games={activeGames ?? []} />
            </Deferred>

            <JoinByPinCard />

            <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
                <section
                    className="flex min-w-0 flex-col gap-5"
                    aria-labelledby="portal-games-title"
                >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <h2
                            id="portal-games-title"
                            className="flex items-center gap-2 text-2xl font-bold"
                        >
                            <Gamepad2 />
                            {t('portal.games.title')}
                        </h2>
                        <div
                            className="flex flex-wrap gap-2"
                            role="group"
                            aria-label={t('portal.filterLabel')}
                        >
                            {[
                                {
                                    key: 'all',
                                    titleKey: 'portal.all',
                                    count: totalGames,
                                },
                                ...categories.map((c) => ({
                                    key: c.key,
                                    titleKey: c.titleKey,
                                    count: c.games.length,
                                })),
                            ].map((c) => {
                                const active = filter === c.key;
                                return (
                                    <button
                                        key={c.key}
                                        type="button"
                                        aria-pressed={active}
                                        onClick={() => setFilter(c.key)}
                                        data-testid={`portal-filter-${c.key}`}
                                        className={`inline-flex min-h-11 max-w-full items-center gap-2 rounded-full border-2 border-[#151b2e] py-1 pr-1.5 pl-4 text-sm font-bold transition-colors ${
                                            active
                                                ? 'bg-[#151b2e] text-white'
                                                : 'bg-white hover:bg-[#fff0cf]'
                                        }`}
                                    >
                                        <span className="min-w-0 truncate">
                                            {t(c.titleKey)}
                                        </span>
                                        <span
                                            className={`inline-flex h-6 min-w-7 shrink-0 items-center justify-center rounded-full px-2 text-xs font-black tabular-nums ${
                                                active
                                                    ? 'bg-[#ffd93d] text-[#151b2e]'
                                                    : 'border-2 border-[#151b2e] bg-[#fff4d6] text-[#151b2e]'
                                            }`}
                                            data-testid={`portal-filter-count-${c.key}`}
                                        >
                                            <span className="sr-only">
                                                {t('gameList.filterCount', {
                                                    count: c.count,
                                                })}
                                            </span>
                                            <span aria-hidden>
                                                {numberFormat.format(c.count)}
                                            </span>
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <ul
                        className="grid gap-5 sm:grid-cols-2"
                        data-testid="portal-game-list"
                    >
                        {games.map((game) => {
                            const Icon = gameIcon(game.icon);
                            const needsDetails = !player.detailsComplete;
                            const blocked =
                                game.requiresGrade && player.grade === null;
                            return (
                                <li key={game.key}>
                                    <article className="auth-card flex h-full flex-col gap-4 !p-5">
                                        <div className="flex items-start justify-between gap-3">
                                            <span
                                                className="grid size-14 shrink-0 place-items-center rounded-2xl border-[3px] border-[#151b2e] text-white shadow-[3px_3px_0_#151b2e]"
                                                style={{
                                                    background: game.accent,
                                                }}
                                            >
                                                <Icon className="size-7" />
                                            </span>
                                            <div className="flex flex-wrap justify-end gap-1.5">
                                                {game.recommended && (
                                                    <span className="inline-flex items-center gap-1 rounded-full border-2 border-[#151b2e] bg-[#dff7ea] px-2 py-0.5 text-[11px] font-bold text-[#0d5a48]">
                                                        <Sparkles className="size-3" />
                                                        {t(
                                                            'portal.recommended',
                                                        )}
                                                    </span>
                                                )}
                                                <span
                                                    className={`rounded-full border-2 border-[#151b2e] px-2 py-0.5 text-[11px] font-bold ${
                                                        game.awardsPoints
                                                            ? 'bg-[#ffd93d]'
                                                            : 'bg-white'
                                                    }`}
                                                >
                                                    {game.awardsPoints
                                                        ? t(
                                                              'portal.earnsPoints',
                                                          )
                                                        : t('portal.practice')}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="flex flex-1 flex-col gap-1.5">
                                            <p className="text-xs font-bold text-muted-foreground uppercase">
                                                {t(game.categoryKey)} ·{' '}
                                                {t('portal.gradeRange', {
                                                    min: game.minGrade,
                                                    max: game.maxGrade,
                                                })}
                                            </p>
                                            <h3 className="text-xl font-bold">
                                                {t(game.titleKey)}
                                            </h3>
                                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                                <PlayerCountBadge
                                                    minPlayers={game.minPlayers}
                                                    maxPlayers={game.maxPlayers}
                                                    testId={`portal-players-${game.key}`}
                                                />
                                                {game.popularRank !== null && (
                                                    <span
                                                        className="inline-flex items-center gap-1 rounded-full border-2 border-[#151b2e] bg-[#ffe1e6] px-2 py-0.5 text-[11px] font-bold text-[#9b1c3a]"
                                                        data-testid={`portal-popular-${game.key}`}
                                                    >
                                                        <Flame className="size-3" />
                                                        {t(
                                                            'portal.mostPlayed',
                                                            {
                                                                rank: game.popularRank,
                                                            },
                                                        )}
                                                    </span>
                                                )}
                                                <span
                                                    className="inline-flex items-center gap-1.5 text-xs font-bold text-[#151b2e]/75"
                                                    data-testid={`portal-plays-${game.key}`}
                                                >
                                                    <Users
                                                        className="size-3.5"
                                                        aria-hidden
                                                    />
                                                    {game.plays > 0
                                                        ? t('portal.plays', {
                                                              count: game.plays,
                                                              formatted:
                                                                  numberFormat.format(
                                                                      game.plays,
                                                                  ),
                                                              days: popularityDays,
                                                          })
                                                        : t(
                                                              'portal.playsNone',
                                                              {
                                                                  days: popularityDays,
                                                              },
                                                          )}
                                                </span>
                                            </div>
                                            {game.descriptionKey && (
                                                <p className="text-sm text-muted-foreground">
                                                    {t(game.descriptionKey)}
                                                </p>
                                            )}
                                        </div>
                                        {needsDetails ? (
                                            <NavButton
                                                href="/dashboard#player-details"
                                                icon={IdCard}
                                                label={t('portal.detailsFirst')}
                                                testId={`portal-details-${game.key}`}
                                            />
                                        ) : blocked ? (
                                            <NavButton
                                                href="/dashboard#grade"
                                                icon={GraduationCap}
                                                label={t(
                                                    'portal.setGradeFirst',
                                                )}
                                            />
                                        ) : (
                                            <div className="flex items-center gap-2">
                                                <div className="min-w-0 flex-1">
                                                    <NavButton
                                                        href={game.url}
                                                        icon={Play}
                                                        label={t('portal.play')}
                                                        variant="primary"
                                                        block
                                                        testId={`portal-play-${game.key}`}
                                                    />
                                                </div>
                                                <WhatsAppShareButton
                                                    compact
                                                    text={t(
                                                        'player.shareWaGameText',
                                                        {
                                                            game: t(
                                                                game.titleKey,
                                                            ),
                                                            url: absoluteUrl(
                                                                game.url,
                                                            ),
                                                        },
                                                    )}
                                                    label={t(
                                                        'player.shareWaGame',
                                                    )}
                                                    testId={`portal-share-wa-${game.key}`}
                                                />
                                            </div>
                                        )}
                                    </article>
                                </li>
                            );
                        })}
                    </ul>
                    <p className="text-xs text-muted-foreground">
                        {t('portal.pointsRule')}
                    </p>
                </section>

                <aside className="flex min-w-0 flex-col gap-7">
                    <Leaderboard
                        boards={leaderboards}
                        numberFormat={numberFormat}
                    />

                    <section
                        className="auth-card flex flex-col gap-4 !p-5"
                        aria-labelledby="portal-recent-title"
                    >
                        <h2
                            id="portal-recent-title"
                            className="flex items-center gap-2 text-xl font-bold"
                        >
                            <History className="size-5" />
                            {t('portal.recent')}
                        </h2>
                        {recent.length === 0 ? (
                            <p className="rounded-xl border-2 border-dashed border-[#151b2e]/25 px-4 py-6 text-center text-sm text-muted-foreground">
                                {t('player.historyNote')}
                            </p>
                        ) : (
                            <ul className="flex flex-col divide-y divide-[#151b2e]/15">
                                {recent.map((item) => (
                                    <li
                                        key={item.id}
                                        className="flex items-center justify-between gap-3 py-2.5"
                                    >
                                        <div className="min-w-0">
                                            <p className="truncate text-sm font-semibold">
                                                {item.game_name}
                                            </p>
                                            <time
                                                className="text-xs text-muted-foreground"
                                                dateTime={item.played_at}
                                            >
                                                {new Intl.DateTimeFormat(
                                                    i18n.language,
                                                    {
                                                        dateStyle: 'medium',
                                                        timeStyle: 'short',
                                                    },
                                                ).format(
                                                    new Date(item.played_at),
                                                )}
                                            </time>
                                        </div>
                                        <span className="shrink-0 text-sm font-bold text-[#116a56] tabular-nums">
                                            +{numberFormat.format(item.points)}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        )}
                        <NavButton
                            href="/dashboard"
                            icon={History}
                            label={t('portal.allHistory')}
                            block
                        />
                    </section>
                </aside>
            </div>
        </PlayerLayout>
    );
}

function Leaderboard({
    boards,
    numberFormat,
}: {
    boards: Record<LeaderboardPeriod, LeaderboardData>;
    numberFormat: Intl.NumberFormat;
}) {
    const { t } = useTranslations();
    const [period, setPeriod] = useState<LeaderboardPeriod>('week');
    const board = boards[period];
    const meListed = board.entries.some((row) => row.isMe);

    return (
        <section
            className="auth-card flex flex-col gap-4 !p-5"
            aria-labelledby="portal-leaderboard-title"
            data-testid="portal-leaderboard-card"
        >
            <h2
                id="portal-leaderboard-title"
                className="flex items-center gap-2 text-xl font-bold"
            >
                <Crown className="size-5 text-[#f5a623]" />
                {t('portal.leaderboard')}
            </h2>
            <div
                className="grid grid-cols-[1fr_1fr_1.35fr] gap-1 rounded-[1.25rem] border-2 border-[#151b2e] bg-white p-1"
                role="tablist"
                aria-label={t('portal.leaderboardPeriod.label')}
            >
                {LEADERBOARD_PERIODS.map((key) => (
                    <button
                        key={key}
                        type="button"
                        role="tab"
                        id={`leaderboard-tab-${key}`}
                        aria-selected={period === key}
                        aria-controls="leaderboard-panel"
                        onClick={() => setPeriod(key)}
                        data-testid={`portal-leaderboard-tab-${key}`}
                        className={`min-h-9 min-w-0 rounded-full px-1 text-[11px] leading-tight font-bold transition-colors sm:text-xs ${
                            period === key
                                ? 'bg-[#151b2e] text-white'
                                : 'text-[#151b2e] hover:bg-[#fff0cf]'
                        }`}
                    >
                        {t(`portal.leaderboardPeriod.${key}`)}
                    </button>
                ))}
            </div>
            <div
                id="leaderboard-panel"
                role="tabpanel"
                aria-labelledby={`leaderboard-tab-${period}`}
                className="flex flex-col gap-2"
            >
                {board.entries.length === 0 ? (
                    <p className="rounded-xl border-2 border-dashed border-[#151b2e]/25 px-4 py-6 text-center text-sm text-[#151b2e]/75">
                        {t(
                            period === 'all'
                                ? 'portal.leaderboardEmpty'
                                : 'portal.leaderboardEmptyPeriod',
                        )}
                    </p>
                ) : (
                    <ol
                        className="flex flex-col gap-2"
                        data-testid="portal-leaderboard"
                    >
                        {board.entries.map((row) => (
                            <li
                                key={row.rank}
                                className={`flex items-center gap-3 rounded-xl border-2 border-[#151b2e] px-2.5 py-1.5 ${
                                    row.isMe
                                        ? 'bg-[#fff0cf] ring-2 ring-[#f5a623]'
                                        : 'bg-white'
                                }`}
                            >
                                <span
                                    className={`grid size-7 shrink-0 place-items-center rounded-full text-sm font-bold tabular-nums ${
                                        PODIUM[row.rank]
                                            ? `border-2 border-[#151b2e] ${PODIUM[row.rank]}`
                                            : 'border-2 border-[#151b2e]/25'
                                    }`}
                                    aria-label={t('portal.rank', {
                                        rank: row.rank,
                                    })}
                                >
                                    {row.rank}
                                </span>
                                <span className="relative shrink-0">
                                    <PlayerCharacter
                                        character={row.character}
                                        size={36}
                                        backdrop={false}
                                    />
                                    <OnlineDot userId={row.userId} />
                                </span>
                                {row.isMe ? (
                                    <span className="min-w-0 flex-1 truncate text-sm font-bold">
                                        {row.name}
                                        <span className="font-semibold text-[#151b2e]/80">
                                            {' '}
                                            ({t('portal.you')})
                                        </span>
                                    </span>
                                ) : (
                                    <PlayerMenu
                                        userId={row.userId}
                                        name={row.name}
                                        rank={row.rank}
                                        points={numberFormat.format(row.points)}
                                    />
                                )}
                                <span className="text-sm font-bold tabular-nums">
                                    {numberFormat.format(row.points)}
                                </span>
                            </li>
                        ))}
                    </ol>
                )}
                {board.me && !meListed && (
                    <p
                        className="flex items-center justify-between gap-3 rounded-xl border-2 border-dashed border-[#151b2e] bg-[#fff0cf] px-3 py-2 text-sm font-bold"
                        data-testid="portal-leaderboard-me"
                    >
                        <span>
                            {t('portal.leaderboardMe', {
                                rank: numberFormat.format(board.me.rank),
                            })}
                        </span>
                        <span className="tabular-nums">
                            {numberFormat.format(board.me.points)}
                        </span>
                    </p>
                )}
                {!board.me && board.entries.length > 0 && (
                    <p className="text-center text-xs font-semibold text-[#151b2e]/75">
                        {t('portal.leaderboardNotRanked')}
                    </p>
                )}
            </div>
        </section>
    );
}

/**
 * Clickable leaderboard name: opens a small menu with the player's rank and
 * a "Chat" action that starts (or reopens) a direct chat with them.
 */
function PlayerMenu({
    userId,
    name,
    rank,
    points,
}: {
    userId: number;
    name: string;
    rank: number;
    points: string;
}) {
    const { t } = useTranslations();
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const startChat = async () => {
        setBusy(true);
        setError(null);
        try {
            const res = await fetch('/chat/direct', {
                method: 'POST',
                credentials: 'same-origin',
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                    'X-CSRF-TOKEN':
                        document.querySelector<HTMLMetaElement>(
                            'meta[name="csrf-token"]',
                        )?.content ?? '',
                },
                body: JSON.stringify({ user_id: userId }),
            });
            const data = (await res.json().catch(() => ({}))) as {
                conversation?: { id: number };
                message?: string;
            };
            if (!res.ok || !data.conversation) {
                setError(data.message ?? t('portal.playerMenu.chatError'));
                return;
            }
            setOpen(false);
            router.visit(`/chat?c=${data.conversation.id}`);
        } catch {
            setError(t('portal.playerMenu.chatError'));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Popover
            open={open}
            onOpenChange={(next) => {
                setOpen(next);
                setError(null);
            }}
        >
            <PopoverTrigger asChild>
                <button
                    type="button"
                    className="min-w-0 flex-1 truncate rounded-md text-left text-sm font-bold underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6c5ce7]"
                    aria-label={t('portal.playerMenu.open', { name })}
                    data-testid={`portal-leaderboard-player-${userId}`}
                >
                    {name}
                </button>
            </PopoverTrigger>
            <PopoverContent
                align="start"
                sideOffset={6}
                className="w-60 rounded-2xl border-[3px] border-[#151b2e] bg-white p-3 text-[#151b2e] shadow-[4px_4px_0_#151b2e]"
                data-testid="portal-player-menu"
            >
                <p className="truncate text-sm font-bold">{name}</p>
                <p className="text-xs font-semibold text-[#151b2e]/75">
                    {t('portal.playerMenu.summary', { rank, points })}
                </p>
                <button
                    type="button"
                    onClick={startChat}
                    disabled={busy}
                    className="mt-3 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border-[2.5px] border-[#151b2e] bg-[#ffd93d] px-3 text-sm font-bold shadow-[2px_2px_0_#151b2e] transition-colors hover:bg-[#ffe680] disabled:opacity-60"
                    data-testid="portal-player-chat"
                >
                    {busy ? (
                        <Loader2 className="size-4 animate-spin" />
                    ) : (
                        <MessageCircle className="size-4" />
                    )}
                    {t('portal.playerMenu.chat')}
                </button>
                {error && (
                    <p
                        className="mt-2 text-xs font-bold text-[#c0262d]"
                        role="alert"
                    >
                        {error}
                    </p>
                )}
            </PopoverContent>
        </Popover>
    );
}

function PlayerDetailsNotice({ emphasized }: { emphasized: boolean }) {
    const { t } = useTranslations();

    return (
        <section
            role={emphasized ? 'alert' : 'status'}
            data-testid="portal-details-notice"
            className={`auth-card flex flex-col gap-4 !bg-[#ffe3e3] sm:flex-row sm:items-center ${
                emphasized ? 'ring-4 ring-[#e85d75]/40' : ''
            }`}
        >
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl border-[3px] border-[#151b2e] bg-[#e85d75] text-white shadow-[3px_3px_0_#151b2e]">
                <CircleAlert className="size-6" />
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
                <h2 className="text-lg font-bold">
                    {t('portal.detailsNoticeTitle')}
                </h2>
                <p className="text-sm text-[#151b2e]/80">
                    {t('portal.detailsNoticeBody')}
                </p>
            </div>
            <NavButton
                href="/dashboard#player-details"
                icon={IdCard}
                label={t('portal.detailsNoticeAction')}
                variant="primary"
                className="shrink-0 self-start sm:self-center"
                testId="portal-details-notice-action"
            />
        </section>
    );
}

/**
 * Rooms the player is still seated in, so closing the browser by accident
 * never costs a running game: one tap returns to the room.
 */
function ActiveGames({ games }: { games: ActiveGame[] }) {
    const { t } = useTranslations();
    if (games.length === 0) {
        return null;
    }
    return (
        <section
            className="auth-card flex flex-col gap-3 !border-[#116a56] !bg-[#e8faf6] !p-5"
            aria-labelledby="portal-active-title"
            data-testid="portal-active-games"
        >
            <div className="flex flex-col gap-1">
                <h2
                    id="portal-active-title"
                    className="flex items-center gap-2 text-xl font-bold"
                >
                    <Play className="size-5" />
                    {t('portal.activeGames.title')}
                </h2>
                <p className="text-sm text-muted-foreground">
                    {t('portal.activeGames.intro')}
                </p>
            </div>
            <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {games.map((game) => {
                    const Icon = gameIcon(game.icon);
                    return (
                        <li
                            key={`${game.game_key}-${game.pin ?? 'none'}`}
                            className="flex min-w-0 items-center gap-3 rounded-2xl border-2 border-[#151b2e] bg-white p-3"
                            data-testid={`portal-active-${game.game_key}`}
                        >
                            <span
                                className="grid size-11 shrink-0 place-items-center rounded-xl border-2 border-[#151b2e] text-white"
                                style={{ backgroundColor: game.accent }}
                            >
                                <Icon className="size-5" aria-hidden="true" />
                            </span>
                            <div className="min-w-0 flex-1">
                                <p className="truncate font-bold">
                                    {t(game.titleKey)}
                                </p>
                                <p className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                                    {game.pin && (
                                        <span className="font-semibold tabular-nums">
                                            {t('portal.activeGames.pin', {
                                                pin: game.pin,
                                            })}
                                        </span>
                                    )}
                                    <span>
                                        {t(
                                            `portal.activeGames.phase.${game.phase === 'lobby' ? 'lobby' : 'playing'}`,
                                        )}
                                    </span>
                                    {game.host && (
                                        <span>
                                            {t('portal.activeGames.host')}
                                        </span>
                                    )}
                                </p>
                            </div>
                            <Link
                                href={game.url}
                                className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border-2 border-[#151b2e] bg-[#116a56] px-3.5 text-sm font-bold text-white shadow-[2px_2px_0_#151b2e]"
                                data-testid={`portal-active-resume-${game.game_key}`}
                            >
                                <Play className="size-4" aria-hidden="true" />
                                {t('portal.activeGames.resume')}
                            </Link>
                        </li>
                    );
                })}
            </ul>
        </section>
    );
}
