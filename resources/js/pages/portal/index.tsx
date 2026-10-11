import { JoinByPinCard } from '@/components/join-by-pin';
import {
    LeaderboardPlayerMenu,
    type FriendRelation,
} from '@/components/leaderboard-player-menu';
import { OnlineDot } from '@/components/online-dot';
import PlayerCharacter, {
    type CharacterData,
} from '@/components/player-character';
import { PlayerCountBadge } from '@/components/player-count-badge';
import { NavButton } from '@/components/site-nav';
import { isTkjGame, TkjBadge } from '@/components/tkj-badge';
import { WhatsAppShareButton } from '@/components/whatsapp-share-button';
import { useMyUserId } from '@/hooks/use-chat-socket';
import { useTranslations } from '@/hooks/use-translations';
import PlayerLayout from '@/layouts/player-layout';
import { gameIcon } from '@/lib/games';
import { gradeLabel, hasGrade } from '@/lib/grade';
import { absoluteUrl } from '@/lib/share';
import { SubjectIcon } from '@/lib/subjects';
import { Deferred, Link } from '@inertiajs/react';
import {
    BarChart3,
    ChartNoAxesCombined,
    CircleAlert,
    Coins,
    Crown,
    Flame,
    Gamepad2,
    GraduationCap,
    History,
    IdCard,
    Info,
    Medal,
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
        relation?: FriendRelation;
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
    tags?: string[];
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
    news: PortalNewsData;
    schools: {
        entries: {
            rank: number;
            name: string;
            city: string | null;
            players: number;
            points: number;
            isMine: boolean;
        }[];
    };
    /** Deferred: rooms the player is still seated in on the game service. */
    activeGames?: ActiveGame[];
}

interface PortalNewsGame {
    key: string;
    titleKey: string;
    icon: string;
    accent: string;
    plays: number;
    players: number;
    url: string;
}

interface PortalNewsScore {
    id: number;
    gameKey: string;
    gameName: string;
    player: string;
    points: number;
    correct: number;
    wrong: number;
    playedAt: string;
}

interface PortalNewsSubject {
    key: string;
    nameId: string;
    nameEn: string | null;
    icon: string;
    color: string;
    answered: number;
    correct: number;
    accuracy: number;
}

interface PortalNewsData {
    periods: {
        today: PortalNewsGame[];
        threeDays: PortalNewsGame[];
        sevenDays: PortalNewsGame[];
    };
    highestScores: PortalNewsScore[];
    subjects: { best: PortalNewsSubject[]; weakest: PortalNewsSubject[] };
    pulse: {
        totalGames: number;
        totalPlays: number;
        activePlayers: number;
        questions: number;
        playsSevenDays: number;
    };
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
    news,
    schools,
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
                            href="/profile#grade"
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

            <PortalNewsWidgets news={news} numberFormat={numberFormat} />

            <SchoolLeaderboard schools={schools} numberFormat={numberFormat} />

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
                                                {isTkjGame(game) && (
                                                    <TkjBadge
                                                        testId={`portal-tkj-${game.key}`}
                                                    />
                                                )}
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
                                            <Link
                                                href={game.url}
                                                className="text-xl font-bold hover:text-[#6c5ce7]"
                                            >
                                                {t(game.titleKey)}
                                            </Link>
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
                                                href="/profile#player-details"
                                                icon={IdCard}
                                                label={t('portal.detailsFirst')}
                                                testId={`portal-details-${game.key}`}
                                            />
                                        ) : blocked ? (
                                            <NavButton
                                                href="/profile#grade"
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
                                    <li key={item.id}>
                                        <Link
                                            href={`/games/${item.game_key}`}
                                            className="flex items-center justify-between gap-3 py-2.5 transition-colors hover:text-[#6c5ce7]"
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
                                                        new Date(
                                                            item.played_at,
                                                        ),
                                                    )}
                                                </time>
                                            </div>
                                            <span className="shrink-0 text-sm font-bold text-[#116a56] tabular-nums">
                                                +
                                                {numberFormat.format(
                                                    item.points,
                                                )}
                                            </span>
                                        </Link>
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

function PortalNewsWidgets({
    news,
    numberFormat,
}: {
    news: PortalNewsData;
    numberFormat: Intl.NumberFormat;
}) {
    const { t, i18n } = useTranslations();
    const [period, setPeriod] = useState<'today' | 'threeDays' | 'sevenDays'>(
        'today',
    );
    const periodLabels = {
        today: t('portal.news.periods.today'),
        threeDays: t('portal.news.periods.threeDays'),
        sevenDays: t('portal.news.periods.sevenDays'),
    };
    const games = news.periods[period];

    return (
        <section
            className="flex flex-col gap-5"
            aria-labelledby="portal-news-title"
        >
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="flex min-w-0 flex-col gap-1">
                    <span className="auth-badge self-start">
                        {t('portal.news.eyebrow')}
                    </span>
                    <h2
                        id="portal-news-title"
                        className="text-2xl font-bold md:text-3xl"
                    >
                        {t('portal.news.title')}
                    </h2>
                    <p className="max-w-2xl text-sm text-muted-foreground">
                        {t('portal.news.intro')}
                    </p>
                </div>
                <Info
                    className="size-6 shrink-0 text-[#6c5ce7]"
                    aria-hidden="true"
                />
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <PortalPulseCard
                    href="/gamelist"
                    icon={Gamepad2}
                    label={t('portal.news.pulse.games')}
                    value={numberFormat.format(news.pulse.totalGames)}
                    accent="#efeaff"
                />
                <PortalPulseCard
                    href="/dashboard"
                    icon={BarChart3}
                    label={t('portal.news.pulse.plays')}
                    value={numberFormat.format(news.pulse.totalPlays)}
                    accent="#fff0cf"
                />
                <PortalPulseCard
                    href="/players/online"
                    icon={Users}
                    label={t('portal.news.pulse.players')}
                    value={numberFormat.format(news.pulse.activePlayers)}
                    accent="#dff7ea"
                />
                <PortalPulseCard
                    href="/gamelist"
                    icon={GraduationCap}
                    label={t('portal.news.pulse.questions')}
                    value={numberFormat.format(news.pulse.questions)}
                    accent="#ffe1e6"
                />
            </div>

            <div className="grid gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
                <section
                    className="auth-card flex min-w-0 flex-col gap-4 !p-5"
                    aria-labelledby="portal-popular-games-title"
                >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <h3
                            id="portal-popular-games-title"
                            className="flex items-center gap-2 text-xl font-bold"
                        >
                            <Flame className="size-5 text-[#e85d75]" />
                            {t('portal.news.mostPlayed')}
                        </h3>
                        <div
                            className="flex flex-wrap gap-1.5"
                            role="tablist"
                            aria-label={t('portal.news.periodLabel')}
                        >
                            {(
                                Object.keys(periodLabels) as Array<
                                    keyof typeof periodLabels
                                >
                            ).map((key) => (
                                <button
                                    key={key}
                                    type="button"
                                    role="tab"
                                    aria-selected={period === key}
                                    onClick={() => setPeriod(key)}
                                    className={`min-h-9 rounded-full border-2 border-[#151b2e] px-3 text-xs font-bold ${period === key ? 'bg-[#151b2e] text-white' : 'bg-white hover:bg-[#fff0cf]'}`}
                                >
                                    {periodLabels[key]}
                                </button>
                            ))}
                        </div>
                    </div>
                    {games.length === 0 ? (
                        <PortalEmpty text={t('portal.news.empty')} />
                    ) : (
                        <ol
                            className="flex flex-col gap-2"
                            data-testid="portal-news-most-played"
                        >
                            {games.map((game, index) => {
                                const Icon = gameIcon(game.icon);
                                return (
                                    <li key={game.key}>
                                        <Link
                                            href={game.url}
                                            className="flex min-w-0 items-center gap-3 rounded-xl border-2 border-[#151b2e] bg-white px-3 py-2.5 transition-transform hover:-translate-y-0.5"
                                        >
                                            <span className="grid size-8 shrink-0 place-items-center rounded-full border-2 border-[#151b2e] bg-[#ffd93d] text-sm font-bold">
                                                {index + 1}
                                            </span>
                                            <span
                                                className="grid size-10 shrink-0 place-items-center rounded-xl border-2 border-[#151b2e] text-white"
                                                style={{
                                                    background: game.accent,
                                                }}
                                            >
                                                <Icon
                                                    className="size-5"
                                                    aria-hidden="true"
                                                />
                                            </span>
                                            <span className="min-w-0 flex-1 truncate text-sm font-bold">
                                                {t(game.titleKey)}
                                            </span>
                                            <span className="shrink-0 text-right">
                                                <strong className="block text-sm tabular-nums">
                                                    {numberFormat.format(
                                                        game.plays,
                                                    )}
                                                    ×
                                                </strong>
                                                <small className="text-xs text-muted-foreground">
                                                    {numberFormat.format(
                                                        game.players,
                                                    )}{' '}
                                                    {t(
                                                        'portal.news.playersShort',
                                                    )}
                                                </small>
                                            </span>
                                        </Link>
                                    </li>
                                );
                            })}
                        </ol>
                    )}
                </section>

                <section
                    className="auth-card flex min-w-0 flex-col gap-4 !p-5"
                    aria-labelledby="portal-highest-score-title"
                >
                    <h3
                        id="portal-highest-score-title"
                        className="flex items-center gap-2 text-xl font-bold"
                    >
                        <Medal className="size-5 text-[#f5a623]" />
                        {t('portal.news.highestScores')}
                    </h3>
                    {news.highestScores.length === 0 ? (
                        <PortalEmpty text={t('portal.news.empty')} />
                    ) : (
                        <ol className="flex flex-col gap-2">
                            {news.highestScores.map((score, index) => (
                                <li key={score.id}>
                                    <Link
                                        href={`/leaderboard?game=${encodeURIComponent(score.gameKey)}`}
                                        className="flex min-w-0 items-center gap-3 rounded-xl border-2 border-[#151b2e] bg-white px-3 py-2.5 transition-transform hover:-translate-y-0.5"
                                    >
                                        <span className="grid size-8 shrink-0 place-items-center rounded-full border-2 border-[#151b2e] bg-[#fff0cf] text-sm font-bold">
                                            {index + 1}
                                        </span>
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-sm font-bold">
                                                {score.player}
                                            </p>
                                            <p className="truncate text-xs text-muted-foreground">
                                                {score.gameName}
                                            </p>
                                        </div>
                                        <strong className="shrink-0 text-sm text-[#116a56] tabular-nums">
                                            +{numberFormat.format(score.points)}
                                        </strong>
                                    </Link>
                                </li>
                            ))}
                        </ol>
                    )}
                </section>
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
                <SubjectPerformance
                    title={t('portal.news.bestSubjects')}
                    subjects={news.subjects.best}
                    numberFormat={numberFormat}
                    language={i18n.language}
                    positive
                />
                <SubjectPerformance
                    title={t('portal.news.weakestSubjects')}
                    subjects={news.subjects.weakest}
                    numberFormat={numberFormat}
                    language={i18n.language}
                />
            </div>
        </section>
    );
}

function SchoolLeaderboard({
    schools,
    numberFormat,
}: {
    schools: PortalProps['schools'];
    numberFormat: Intl.NumberFormat;
}) {
    const { t } = useTranslations();

    return (
        <section
            className="auth-card flex min-w-0 flex-col gap-4 !p-5"
            aria-labelledby="portal-schools-title"
        >
            <h2
                id="portal-schools-title"
                className="flex items-center gap-2 text-xl font-bold"
            >
                <GraduationCap className="size-5 text-[#6c5ce7]" />
                {t('portal.bestSchools')}
            </h2>
            {schools.entries.length === 0 ? (
                <PortalEmpty text={t('portal.bestSchoolsEmpty')} />
            ) : (
                <ol className="flex flex-col gap-2">
                    {schools.entries.map((school) => (
                        <li
                            key={school.name + (school.city ?? '')}
                            className="flex min-w-0 items-center gap-3 rounded-xl border-2 border-[#151b2e] bg-white px-3 py-2.5"
                        >
                            <span className="grid size-8 shrink-0 place-items-center rounded-full border-2 border-[#151b2e] bg-[#ffd93d] text-sm font-bold">
                                {school.rank}
                            </span>
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-bold">
                                    {school.name}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    {school.players} {t('portal.schoolPlayers')}
                                </p>
                            </div>
                            <strong className="shrink-0 text-sm text-[#116a56] tabular-nums">
                                {numberFormat.format(school.points)}{' '}
                                {t('portal.schoolPoints')}
                            </strong>
                        </li>
                    ))}
                </ol>
            )}
        </section>
    );
}

function PortalPulseCard({
    icon: Icon,
    label,
    value,
    accent,
    href,
}: {
    icon: typeof Gamepad2;
    label: string;
    value: string;
    accent: string;
    href: string;
}) {
    return (
        <Link
            href={href}
            className="auth-card flex min-w-0 items-center gap-3 !p-4 transition-transform hover:-translate-y-0.5"
        >
            <span
                className="grid size-11 shrink-0 place-items-center rounded-xl border-2 border-[#151b2e]"
                style={{ background: accent }}
            >
                <Icon className="size-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
                <p className="text-2xl font-bold tabular-nums">{value}</p>
                <p className="truncate text-xs font-bold text-muted-foreground">
                    {label}
                </p>
            </div>
        </Link>
    );
}

function SubjectPerformance({
    title,
    subjects,
    numberFormat,
    language,
    positive = false,
}: {
    title: string;
    subjects: PortalNewsSubject[];
    numberFormat: Intl.NumberFormat;
    language: string;
    positive?: boolean;
}) {
    const { t } = useTranslations();

    return (
        <section className="auth-card flex min-w-0 flex-col gap-4 !p-5">
            <h3 className="flex items-center gap-2 text-xl font-bold">
                <ChartNoAxesCombined
                    className={`size-5 ${positive ? 'text-[#116a56]' : 'text-[#e85d75]'}`}
                />
                {title}
            </h3>
            {subjects.length === 0 ? (
                <PortalEmpty text={t('portal.news.empty')} />
            ) : (
                <ol className="flex flex-col gap-2">
                    {subjects.map((subject, index) => (
                        <li key={subject.key}>
                            <Link
                                href={`/subjects/${encodeURIComponent(subject.key)}`}
                                className="flex min-w-0 items-center gap-3 rounded-xl border-2 border-[#151b2e] bg-white px-3 py-2.5 transition-transform hover:-translate-y-0.5"
                            >
                                <span className="grid size-7 shrink-0 place-items-center rounded-full border-2 border-[#151b2e] bg-[#fff0cf] text-xs font-bold">
                                    {index + 1}
                                </span>
                                <span
                                    className="grid size-9 shrink-0 place-items-center rounded-lg border-2 border-[#151b2e]"
                                    style={{ background: subject.color }}
                                >
                                    <SubjectIcon
                                        icon={subject.icon}
                                        className="size-4"
                                    />
                                </span>
                                <span className="min-w-0 flex-1 truncate text-sm font-bold">
                                    {language.startsWith('en')
                                        ? subject.nameEn || subject.nameId
                                        : subject.nameId}
                                </span>
                                <span className="shrink-0 text-sm font-bold tabular-nums">
                                    {numberFormat.format(subject.accuracy)}%
                                </span>
                            </Link>
                        </li>
                    ))}
                </ol>
            )}
        </section>
    );
}

function PortalEmpty({ text }: { text: string }) {
    return (
        <p className="rounded-xl border-2 border-dashed border-[#151b2e]/25 px-4 py-6 text-center text-sm text-muted-foreground">
            {text}
        </p>
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
                                    <LeaderboardPlayerMenu
                                        userId={row.userId}
                                        name={row.name}
                                        rank={row.rank}
                                        points={numberFormat.format(row.points)}
                                        relation={row.relation}
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
                href="/profile#player-details"
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
