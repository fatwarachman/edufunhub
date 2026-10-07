import { AbilityCard, type PlayerAbility } from '@/components/ability-card';
import { BadgeCollection } from '@/components/badge-collection';
import { type BadgeProgress } from '@/components/badges';
import InputError from '@/components/input-error';
import { InstallAppCard } from '@/components/install-app-card';
import { LanguageToggle } from '@/components/language-toggle';
import { OnlineDot } from '@/components/online-dot';
import PlayerCharacter, {
    type CharacterData,
} from '@/components/player-character';
import { SchoolPicker } from '@/components/school-picker';
import { NavButton } from '@/components/site-nav';
import { Vault, type VaultItem } from '@/components/vault';
import { useTranslations } from '@/hooks/use-translations';
import PlayerLayout from '@/layouts/player-layout';
import { gameIcon } from '@/lib/games';
import { GRADE_LEVELS, gradeLabel, hasGrade } from '@/lib/grade';
import { SubjectIcon, useSubjectName, useSubjects } from '@/lib/subjects';
import { cn } from '@/lib/utils';
import { type SharedData } from '@/types';
import { Deferred, Link, useForm, usePage } from '@inertiajs/react';
import {
    Activity,
    BarChart3,
    BookOpenCheck,
    ChevronLeft,
    ChevronRight,
    Clock3,
    Coins,
    Crown,
    Flame,
    Gamepad2,
    GraduationCap,
    Heart,
    History,
    IdCard,
    MapPin,
    Medal,
    Play,
    School,
    Settings2,
    Star,
    Target,
    Trophy,
    UserRound,
} from 'lucide-react';
import { type ReactNode, useMemo, useState } from 'react';

type LeaderboardPeriod = 'week' | 'month' | 'all';

const PERIODS: LeaderboardPeriod[] = ['week', 'month', 'all'];

interface LeaderboardEntry {
    rank: number;
    userId: number;
    name: string;
    points: number;
    isMe: boolean;
    character: CharacterData;
}

interface LeaderboardData {
    entries: LeaderboardEntry[];
    me: { rank: number; points: number } | null;
}

interface GameStat {
    key: string;
    titleKey: string | null;
    name: string;
    url: string | null;
    icon: string;
    accent: string;
    plays: number;
    points: number;
    bestScore: number;
    accuracy: number | null;
    seconds: number;
    lastPlayedAt: string;
}

interface DashboardStats {
    totals: {
        plays: number;
        points: number;
        correct: number;
        wrong: number;
        accuracy: number | null;
        seconds: number;
        games: number;
    };
    subjects: {
        subject: string;
        answered: number;
        correct: number;
        accuracy: number;
    }[];
    games: GameStat[];
    activity: { date: string; plays: number; points: number }[];
    favouriteGame: string | null;
    activityDays: number;
}

interface HistoryItem {
    id: number;
    game_key: string;
    game_name: string;
    points: number;
    correct: number | null;
    wrong: number | null;
    duration_seconds: number | null;
    played_at: string;
}

interface PlayerDetails {
    birth_date: string | null;
    school_name: string | null;
    school_city: string | null;
}

interface DashboardProps {
    points: number;
    balance: number;
    vault: VaultItem[];
    grade: number | null;
    playerDetails: PlayerDetails;
    character: CharacterData;
    categories: {
        key: string;
        titleKey: string;
        games: { key: string; titleKey: string; url: string; icon: string }[];
    }[];
    progress: {
        points: number;
        level: number;
        levelProgress: number;
        pointsPerLevel: number;
        nextLevelAt: number;
    };
    rank: number | null;
    badges: { stats: Record<string, number>; badges: BadgeProgress[] };
    history: HistoryItem[];
    historyPagination: {
        current_page: number;
        last_page: number;
        total: number;
        prev_page_url: string | null;
        next_page_url: string | null;
    };
    /** Deferred: leaderboards per period with the viewer's own standing. */
    leaderboards?: Record<LeaderboardPeriod, LeaderboardData>;
    /** Deferred: personal analytics. */
    stats?: DashboardStats;
    /** Deferred: latest AI ability analysis made by an admin, if any. */
    ability?: PlayerAbility | null;
}

const INK = 'border-[#151b2e]';
const CARD = 'auth-card flex min-w-0 flex-col gap-4 !p-4 sm:!p-5';

/** Podium colours for the top three ranks. */
const PODIUM: Record<number, string> = {
    1: 'bg-[#ffd93d]',
    2: 'bg-[#c9d3e3]',
    3: 'bg-[#f4c095]',
};

function useDuration() {
    const { t } = useTranslations();
    return (seconds: number) => {
        if (seconds <= 0) {
            return t('playerDash.duration.none');
        }
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        if (h > 0) {
            return t('playerDash.duration.hm', { h, m });
        }
        if (m > 0) {
            return t('playerDash.duration.m', { m });
        }
        return t('playerDash.duration.s', { s: seconds });
    };
}

function SectionTitle({
    icon: Icon,
    id,
    children,
    aside,
}: {
    icon: typeof Trophy;
    id: string;
    children: ReactNode;
    aside?: ReactNode;
}) {
    return (
        <div className="flex flex-wrap items-center justify-between gap-2">
            <h2
                id={id}
                className="flex min-w-0 items-center gap-2 text-lg font-bold sm:text-xl"
            >
                <span
                    className={`grid size-8 shrink-0 place-items-center rounded-xl border-2 ${INK} bg-[#fff4d6]`}
                >
                    <Icon className="size-4" aria-hidden />
                </span>
                {children}
            </h2>
            {aside}
        </div>
    );
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

export default function Dashboard({
    points,
    balance,
    vault,
    grade,
    playerDetails,
    character,
    categories,
    progress,
    rank,
    badges,
    history,
    historyPagination,
    leaderboards,
    stats,
    ability,
}: DashboardProps) {
    const { t, i18n } = useTranslations();
    const { auth } = usePage<SharedData>().props;
    const number = useMemo(
        () => new Intl.NumberFormat(i18n.language),
        [i18n.language],
    );
    const levelPercent = Math.min(
        100,
        Math.round((progress.levelProgress / progress.pointsPerLevel) * 100),
    );
    const displayName = character.nickname || auth.user.name;
    const gameTitles = useMemo(
        () =>
            Object.fromEntries(
                categories.flatMap((category) =>
                    category.games.map((game) => [game.key, game.titleKey]),
                ),
            ) as Record<string, string>,
        [categories],
    );

    return (
        <PlayerLayout title={t('playerDash.title')}>
            <section
                className="auth-card grid min-w-0 items-center gap-5 !bg-[#fff4d6] !p-4 sm:!p-6 md:grid-cols-[180px_minmax(0,1fr)] lg:grid-cols-[200px_minmax(0,1fr)_300px]"
                aria-labelledby="dash-hero-title"
                data-testid="dash-hero"
            >
                <div className="relative mx-auto w-32 sm:w-40 md:w-full">
                    <PlayerCharacter character={character} />
                    <OnlineDot
                        userId={auth.user.id}
                        className="edu-online-dot--lg"
                    />
                </div>
                <div className="flex min-w-0 flex-col gap-3">
                    <span className="auth-badge self-start">
                        {t('playerDash.badge')}
                    </span>
                    <h1
                        id="dash-hero-title"
                        className="text-2xl font-bold tracking-tight text-balance break-words sm:text-3xl md:text-4xl"
                    >
                        {t('playerDash.greeting', { name: displayName })}
                    </h1>
                    <p className="text-sm text-[#151b2e]/80">
                        {t('playerDash.intro')}
                    </p>
                    <div className="flex flex-wrap gap-2 text-sm font-bold">
                        <span
                            className={`inline-flex items-center gap-1.5 rounded-full border-2 ${INK} bg-[#6c5ce7] px-3 py-1 text-white`}
                        >
                            <GraduationCap className="size-4" aria-hidden />
                            {hasGrade(grade)
                                ? gradeLabel(t, grade)
                                : t('player.gradeMissing')}
                        </span>
                        <span
                            className={`inline-flex items-center gap-1.5 rounded-full border-2 ${INK} bg-white px-3 py-1`}
                        >
                            <Star
                                className="size-4 text-[#f5a623]"
                                aria-hidden
                            />
                            {t('portal.level', { level: progress.level })}
                        </span>
                        <span
                            className={`inline-flex items-center gap-1.5 rounded-full border-2 ${INK} bg-white px-3 py-1`}
                            data-testid="dash-rank"
                        >
                            <Medal
                                className="size-4 text-[#e85d75]"
                                aria-hidden
                            />
                            {rank !== null
                                ? t('portal.rank', { rank })
                                : t('playerDash.noRank')}
                        </span>
                        {playerDetails.school_name && (
                            <span
                                className={`inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-full border-2 ${INK} bg-white px-3 py-1`}
                                data-testid="dash-school"
                            >
                                <School
                                    className="size-4 shrink-0"
                                    aria-hidden
                                />
                                <span className="truncate">
                                    {playerDetails.school_city
                                        ? t('playerDash.school', {
                                              school: playerDetails.school_name,
                                              city: playerDetails.school_city,
                                          })
                                        : playerDetails.school_name}
                                </span>
                            </span>
                        )}
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <div
                            className={`h-4 overflow-hidden rounded-full border-2 ${INK} bg-white`}
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
                        <p className="text-xs font-semibold text-[#151b2e]/75">
                            {t('portal.nextLevel', {
                                points: number.format(
                                    progress.nextLevelAt - progress.points,
                                ),
                                level: progress.level + 1,
                            })}
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <NavButton
                            href="/portal"
                            icon={Trophy}
                            label={t('playerDash.actions.portal')}
                            variant="primary"
                        />
                        <NavButton
                            href="/character"
                            icon={UserRound}
                            label={t('playerDash.actions.character')}
                        />
                        <LanguageToggle />
                    </div>
                </div>
                <div
                    className={`flex flex-col gap-2 rounded-2xl border-[3px] ${INK} bg-[#ffd93d] p-4 md:col-span-2 lg:col-span-1`}
                >
                    <p className="flex items-center gap-2 font-bold">
                        <Coins className="size-5" aria-hidden />
                        {t('player.points')}
                    </p>
                    <p
                        className="text-4xl font-bold tabular-nums sm:text-5xl"
                        data-testid="dashboard-points"
                    >
                        {number.format(points)}
                    </p>
                    <p className="text-sm">{t('player.pointsNote')}</p>
                    <p
                        className={`flex items-center justify-between gap-2 rounded-xl border-2 ${INK} bg-white/70 px-3 py-2 text-sm font-bold`}
                        data-testid="dashboard-balance"
                    >
                        <span>{t('shop.balance')}</span>
                        <span className="tabular-nums">
                            {number.format(balance)}
                        </span>
                    </p>
                </div>
            </section>

            <Deferred
                data="stats"
                fallback={
                    <div
                        className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6"
                        role="status"
                        aria-label={t('playerDash.loadingStats')}
                    >
                        {Array.from({ length: 6 }, (_, index) => (
                            <SkeletonBlock key={index} className="h-24" />
                        ))}
                    </div>
                }
            >
                <KpiStrip
                    stats={stats}
                    streak={badges.stats.streak ?? 0}
                    activeDays={badges.stats.active_days ?? 0}
                    number={number}
                />
            </Deferred>

            <div className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px] xl:gap-8">
                <div className="flex min-w-0 flex-col gap-6">
                    <Deferred
                        data="stats"
                        fallback={
                            <div className="grid min-w-0 grid-cols-1 gap-6 md:grid-cols-2">
                                <SkeletonBlock className="h-64" />
                                <SkeletonBlock className="h-64" />
                                <SkeletonBlock className="h-72 md:col-span-2" />
                            </div>
                        }
                    >
                        <AbilityCard
                            ability={ability}
                            ownerName={displayName}
                        />
                        <Analytics stats={stats} number={number} />
                    </Deferred>

                    <HistoryCard
                        history={history}
                        titles={gameTitles}
                        pagination={historyPagination}
                        number={number}
                    />

                    <BadgeCollection
                        badges={badges.badges}
                        stats={badges.stats}
                    />
                    <Vault items={vault} character={character} />
                </div>

                <aside className="flex min-w-0 flex-col gap-6">
                    <Deferred
                        data="leaderboards"
                        fallback={
                            <div
                                className="flex flex-col gap-3"
                                role="status"
                                aria-label={t('playerDash.board.loading')}
                            >
                                <SkeletonBlock className="h-44" />
                                <SkeletonBlock className="h-96" />
                            </div>
                        }
                    >
                        <LeaderboardCard
                            boards={leaderboards}
                            number={number}
                        />
                    </Deferred>

                    <h2 className="mt-2 flex items-center gap-2 text-sm font-bold tracking-wide text-[#151b2e]/70 uppercase">
                        <Settings2 className="size-4" aria-hidden />
                        {t('playerDash.settings')}
                    </h2>
                    <PlayerDetailsCard details={playerDetails} />
                    <GradeCard grade={grade} />
                    <InstallAppCard />
                </aside>
            </div>

            <section
                className="flex min-w-0 flex-col gap-3"
                aria-labelledby="dash-explore-title"
            >
                <SectionTitle icon={Gamepad2} id="dash-explore-title">
                    {t('playerDash.explore')}
                </SectionTitle>
                <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {categories.map((category) => (
                        <article key={category.key} className={CARD}>
                            <h3 className="font-bold">
                                {t(category.titleKey)}
                            </h3>
                            <ul className="flex flex-wrap gap-2">
                                {category.games.map((game) => {
                                    const Icon = gameIcon(game.icon);
                                    return (
                                        <li key={game.key} className="min-w-0">
                                            <Link
                                                href={game.url}
                                                className={`inline-flex min-h-10 max-w-full items-center gap-1.5 rounded-full border-2 ${INK} bg-white px-3 text-sm font-bold transition-colors hover:bg-[#fff0cf]`}
                                            >
                                                <Icon
                                                    className="size-4 shrink-0"
                                                    aria-hidden
                                                />
                                                <span className="truncate">
                                                    {t(game.titleKey)}
                                                </span>
                                            </Link>
                                        </li>
                                    );
                                })}
                            </ul>
                        </article>
                    ))}
                </div>
            </section>
        </PlayerLayout>
    );
}

function KpiStrip({
    stats,
    streak,
    activeDays,
    number,
}: {
    stats?: DashboardStats;
    streak: number;
    activeDays: number;
    number: Intl.NumberFormat;
}) {
    const { t } = useTranslations();
    const duration = useDuration();
    if (!stats) {
        return null;
    }
    const favourite = stats.games.find(
        (game) => game.key === stats.favouriteGame,
    );
    const tiles: {
        key: string;
        icon: typeof Trophy;
        label: string;
        value: string;
        tone: string;
    }[] = [
        {
            key: 'plays',
            icon: Gamepad2,
            label: t('playerDash.kpi.plays'),
            value: number.format(stats.totals.plays),
            tone: 'bg-[#ffd93d]',
        },
        {
            key: 'accuracy',
            icon: Target,
            label: t('playerDash.kpi.accuracy'),
            value:
                stats.totals.accuracy === null
                    ? t('playerDash.kpi.noData')
                    : `${number.format(stats.totals.accuracy)}%`,
            tone: 'bg-[#5ad1a6]',
        },
        {
            key: 'time',
            icon: Clock3,
            label: t('playerDash.kpi.time'),
            value: duration(stats.totals.seconds),
            tone: 'bg-[#8fb8ff]',
        },
        {
            key: 'streak',
            icon: Flame,
            label: t('playerDash.kpi.streak'),
            value: t('playerDash.kpi.streakValue', { count: streak }),
            tone: 'bg-[#ff8a5c]',
        },
        {
            key: 'activeDays',
            icon: Activity,
            label: t('playerDash.kpi.activeDays'),
            value: number.format(activeDays),
            tone: 'bg-[#ff9ecf]',
        },
        {
            key: 'favourite',
            icon: Heart,
            label: t('playerDash.kpi.favourite'),
            value: favourite
                ? favourite.titleKey
                    ? t(favourite.titleKey)
                    : favourite.name
                : t('playerDash.kpi.noData'),
            tone: 'bg-[#c4b5fd]',
        },
    ];

    return (
        <ul
            className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6"
            aria-label={t('playerDash.kpi.label')}
            data-testid="dash-kpis"
        >
            {tiles.map(({ key, icon: Icon, label, value, tone }) => (
                <li
                    key={key}
                    className={`flex min-w-0 flex-col gap-2 rounded-2xl border-[3px] ${INK} bg-white p-3 shadow-[4px_4px_0_#151b2e] sm:p-4`}
                    data-testid={`dash-kpi-${key}`}
                >
                    <span
                        className={`grid size-8 place-items-center rounded-lg border-2 ${INK} ${tone}`}
                    >
                        <Icon className="size-4" aria-hidden />
                    </span>
                    <span className="text-[11px] leading-tight font-bold tracking-wide text-[#151b2e]/70 uppercase sm:text-xs">
                        {label}
                    </span>
                    <span className="line-clamp-2 text-lg leading-tight font-bold break-words tabular-nums sm:text-xl">
                        {value}
                    </span>
                </li>
            ))}
        </ul>
    );
}

function Analytics({
    stats,
    number,
}: {
    stats?: DashboardStats;
    number: Intl.NumberFormat;
}) {
    if (!stats) {
        return null;
    }
    return (
        <>
            <div className="grid min-w-0 grid-cols-1 gap-6 md:grid-cols-2">
                <ActivityCard stats={stats} number={number} />
                <SubjectsCard stats={stats} number={number} />
            </div>
            <ContinueCard games={stats.games} />
            <GamesCard games={stats.games} number={number} />
        </>
    );
}

function ActivityCard({
    stats,
    number,
}: {
    stats: DashboardStats;
    number: Intl.NumberFormat;
}) {
    const { t, i18n } = useTranslations();
    const max = Math.max(1, ...stats.activity.map((day) => day.plays));
    const totalPlays = stats.activity.reduce((sum, day) => sum + day.plays, 0);
    const totalPoints = stats.activity.reduce(
        (sum, day) => sum + day.points,
        0,
    );
    const dayFormat = new Intl.DateTimeFormat(i18n.language, {
        day: 'numeric',
    });
    const longFormat = new Intl.DateTimeFormat(i18n.language, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
    });
    const parse = (date: string) => new Date(`${date}T12:00:00`);

    return (
        <section
            className={CARD}
            aria-labelledby="dash-activity-title"
            data-testid="dash-activity"
        >
            <SectionTitle icon={BarChart3} id="dash-activity-title">
                {t('playerDash.activity.title')}
            </SectionTitle>
            <p className="text-xs font-semibold text-[#151b2e]/70">
                {totalPlays > 0
                    ? t('playerDash.activity.total', {
                          plays: number.format(totalPlays),
                          points: number.format(totalPoints),
                      })
                    : t('playerDash.activity.empty')}
            </p>
            <ol className="grid h-40 grid-cols-[repeat(14,minmax(0,1fr))] items-end gap-1 border-b-2 border-[#151b2e] pb-0.5 sm:gap-1.5">
                {stats.activity.map((day) => {
                    const label = t('playerDash.activity.bar', {
                        date: longFormat.format(parse(day.date)),
                        plays: day.plays,
                        points: number.format(day.points),
                    });
                    return (
                        <li
                            key={day.date}
                            className="flex h-full min-w-0 flex-col justify-end"
                            title={label}
                        >
                            <span className="sr-only">{label}</span>
                            <span
                                className={cn(
                                    'block w-full rounded-t-md border-2 border-b-0',
                                    day.plays > 0
                                        ? `${INK} bg-[repeating-linear-gradient(45deg,#6c5ce7_0_6px,#8577ef_6px_12px)]`
                                        : 'border-[#151b2e]/15 bg-[#151b2e]/5',
                                )}
                                style={{
                                    height:
                                        day.plays > 0
                                            ? `${Math.max(8, (day.plays / max) * 100)}%`
                                            : '4px',
                                }}
                                aria-hidden
                            />
                        </li>
                    );
                })}
            </ol>
            <ol
                className="-mt-2 grid grid-cols-[repeat(14,minmax(0,1fr))] gap-1 text-center text-[10px] font-bold text-[#151b2e]/70 tabular-nums sm:gap-1.5"
                aria-hidden
            >
                {stats.activity.map((day) => (
                    <li key={day.date} className="min-w-0">
                        {dayFormat.format(parse(day.date))}
                    </li>
                ))}
            </ol>
            <p className="text-xs text-[#151b2e]/70">
                {t('playerDash.activity.note')}
            </p>
        </section>
    );
}

function SubjectsCard({
    stats,
    number,
}: {
    stats: DashboardStats;
    number: Intl.NumberFormat;
}) {
    const { t } = useTranslations();
    const subjectName = useSubjectName();
    const subjects = useSubjects();

    return (
        <section
            className={CARD}
            aria-labelledby="dash-subjects-title"
            data-testid="dash-subjects"
        >
            <SectionTitle icon={BookOpenCheck} id="dash-subjects-title">
                {t('playerDash.subjects.title')}
            </SectionTitle>
            {stats.subjects.length === 0 ? (
                <EmptyNote>{t('playerDash.subjects.empty')}</EmptyNote>
            ) : (
                <ul className="flex flex-col gap-3">
                    {stats.subjects.map((row) => {
                        const info = subjects.find(
                            (item) => item.key === row.subject,
                        );
                        return (
                            <li
                                key={row.subject}
                                className="flex min-w-0 flex-col gap-1"
                                data-testid={`dash-subject-${row.subject}`}
                            >
                                <div className="flex items-center justify-between gap-2 text-sm">
                                    <span className="flex min-w-0 items-center gap-1.5 font-bold">
                                        <SubjectIcon
                                            icon={info?.icon}
                                            className="size-4 shrink-0"
                                        />
                                        <span className="truncate">
                                            {subjectName(row.subject)}
                                        </span>
                                    </span>
                                    <span className="shrink-0 font-bold tabular-nums">
                                        {number.format(row.accuracy)}%
                                    </span>
                                </div>
                                <div
                                    className={`h-3 overflow-hidden rounded-full border-2 ${INK} bg-white`}
                                    role="meter"
                                    aria-valuemin={0}
                                    aria-valuemax={100}
                                    aria-valuenow={row.accuracy}
                                    aria-label={subjectName(row.subject)}
                                >
                                    <div
                                        className="h-full"
                                        style={{
                                            width: `${row.accuracy}%`,
                                            background:
                                                info?.color ?? '#ffd93d',
                                        }}
                                    />
                                </div>
                                <span className="text-xs text-[#151b2e]/70 tabular-nums">
                                    {t('playerDash.subjects.answered', {
                                        correct: number.format(row.correct),
                                        answered: number.format(row.answered),
                                    })}
                                </span>
                            </li>
                        );
                    })}
                </ul>
            )}
            <p className="mt-auto text-xs text-[#151b2e]/70">
                {t('playerDash.subjects.note')}
            </p>
        </section>
    );
}

function gameTitle(t: (key: string) => string, game: GameStat): string {
    return game.titleKey ? t(game.titleKey) : game.name;
}

function ContinueCard({ games }: { games: GameStat[] }) {
    const { t } = useTranslations();
    const playable = games.filter((game) => game.url).slice(0, 4);

    return (
        <section
            className={CARD}
            aria-labelledby="dash-continue-title"
            data-testid="dash-continue"
        >
            <SectionTitle
                icon={Play}
                id="dash-continue-title"
                aside={
                    <Link
                        href="/portal"
                        className="text-sm font-bold underline decoration-2 underline-offset-4"
                    >
                        {t('playerDash.continue.explore')}
                    </Link>
                }
            >
                {t('playerDash.continue.title')}
            </SectionTitle>
            {playable.length === 0 ? (
                <EmptyNote>{t('playerDash.continue.empty')}</EmptyNote>
            ) : (
                <ul className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
                    {playable.map((game) => {
                        const Icon = gameIcon(game.icon);
                        return (
                            <li key={game.key} className="min-w-0">
                                <Link
                                    href={game.url ?? '/portal'}
                                    className={`group flex min-h-16 items-center gap-3 rounded-2xl border-[3px] ${INK} bg-white p-2.5 shadow-[3px_3px_0_#151b2e] transition-transform hover:-translate-y-0.5`}
                                    data-testid={`dash-continue-${game.key}`}
                                >
                                    <span
                                        className={`grid size-11 shrink-0 place-items-center rounded-xl border-2 ${INK} text-white`}
                                        style={{ background: game.accent }}
                                    >
                                        <Icon className="size-5" aria-hidden />
                                    </span>
                                    <span className="min-w-0 flex-1 truncate font-bold">
                                        {gameTitle(t, game)}
                                    </span>
                                    <span
                                        className={`grid size-9 shrink-0 place-items-center rounded-full border-2 ${INK} bg-[#ffd93d]`}
                                        aria-hidden
                                    >
                                        <Play className="size-4" />
                                    </span>
                                </Link>
                            </li>
                        );
                    })}
                </ul>
            )}
        </section>
    );
}

function GamesCard({
    games,
    number,
}: {
    games: GameStat[];
    number: Intl.NumberFormat;
}) {
    const { t, i18n } = useTranslations();
    const duration = useDuration();
    const dateFormat = new Intl.DateTimeFormat(i18n.language, {
        dateStyle: 'medium',
    });
    const sorted = [...games].sort((a, b) => b.plays - a.plays);

    return (
        <section
            className={CARD}
            aria-labelledby="dash-games-title"
            data-testid="dash-games"
        >
            <SectionTitle icon={Gamepad2} id="dash-games-title">
                {t('playerDash.games.title')}
            </SectionTitle>
            {sorted.length === 0 ? (
                <EmptyNote>{t('playerDash.games.empty')}</EmptyNote>
            ) : (
                <ul className="flex flex-col gap-3">
                    {sorted.map((game) => {
                        const Icon = gameIcon(game.icon);
                        const cells = [
                            {
                                key: 'plays',
                                label: t('playerDash.games.plays'),
                                value: number.format(game.plays),
                            },
                            {
                                key: 'best',
                                label: t('playerDash.games.best'),
                                value: number.format(game.bestScore),
                            },
                            {
                                key: 'accuracy',
                                label: t('playerDash.games.accuracy'),
                                value:
                                    game.accuracy === null
                                        ? t('playerDash.kpi.noData')
                                        : `${number.format(game.accuracy)}%`,
                            },
                            {
                                key: 'time',
                                label: t('playerDash.games.time'),
                                value: duration(game.seconds),
                            },
                        ];
                        return (
                            <li
                                key={game.key}
                                className={`flex min-w-0 flex-col gap-3 rounded-2xl border-2 ${INK} bg-[#fffdf6] p-3`}
                                data-testid={`dash-game-${game.key}`}
                            >
                                <div className="flex min-w-0 items-center gap-3">
                                    <span
                                        className={`grid size-10 shrink-0 place-items-center rounded-xl border-2 ${INK} text-white`}
                                        style={{ background: game.accent }}
                                    >
                                        <Icon className="size-5" aria-hidden />
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate font-bold">
                                            {gameTitle(t, game)}
                                        </p>
                                        <p className="text-xs text-[#151b2e]/70">
                                            {t('playerDash.games.last', {
                                                date: dateFormat.format(
                                                    new Date(game.lastPlayedAt),
                                                ),
                                            })}
                                        </p>
                                    </div>
                                    <span className="shrink-0 rounded-full border-2 border-[#151b2e] bg-[#ffd93d] px-2 py-0.5 text-xs font-bold tabular-nums">
                                        +{number.format(game.points)}
                                    </span>
                                </div>
                                <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                                    {cells.map((cell) => (
                                        <div
                                            key={cell.key}
                                            className="min-w-0 rounded-xl bg-white px-2.5 py-1.5 ring-1 ring-[#151b2e]/15"
                                        >
                                            <dt className="text-[11px] leading-tight font-bold text-[#151b2e]/65 uppercase">
                                                {cell.label}
                                            </dt>
                                            <dd className="truncate font-bold tabular-nums">
                                                {cell.value}
                                            </dd>
                                        </div>
                                    ))}
                                </dl>
                                {game.accuracy !== null && (
                                    <div
                                        className="h-2 overflow-hidden rounded-full bg-[#151b2e]/10"
                                        aria-hidden
                                    >
                                        <div
                                            className="h-full rounded-full bg-[#1aab8a]"
                                            style={{
                                                width: `${game.accuracy}%`,
                                            }}
                                        />
                                    </div>
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}
        </section>
    );
}

function LeaderboardCard({
    boards,
    number,
}: {
    boards?: Record<LeaderboardPeriod, LeaderboardData>;
    number: Intl.NumberFormat;
}) {
    const { t } = useTranslations();
    const [period, setPeriod] = useState<LeaderboardPeriod>('week');
    if (!boards) {
        return null;
    }
    const board = boards[period];
    const meListed = board.entries.some((row) => row.isMe);
    const podium = board.entries.slice(0, 3);
    const order = [podium[1], podium[0], podium[2]];

    return (
        <section
            className={CARD}
            aria-labelledby="dash-board-title"
            data-testid="dash-leaderboard"
        >
            <SectionTitle
                icon={Crown}
                id="dash-board-title"
                aside={
                    <Link
                        href="/leaderboard"
                        prefetch
                        className="text-xs font-bold text-[#151b2e]/80 hover:text-[#151b2e] hover:underline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#6c5ce7]"
                        data-testid="dash-board-all"
                        aria-label={t('playerDash.board.seeAllLabel')}
                    >
                        {t('playerDash.board.seeAll')}
                    </Link>
                }
            >
                <Link
                    href="/leaderboard"
                    prefetch
                    className="group inline-flex min-w-0 items-center gap-1 rounded-md underline-offset-4 hover:underline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#6c5ce7]"
                    data-testid="dash-board-link"
                >
                    {t('playerDash.board.title')}
                    <ChevronRight
                        className="size-4 shrink-0 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
                        aria-hidden
                    />
                </Link>
            </SectionTitle>
            <div
                className={`grid grid-cols-[1fr_1fr_1.35fr] gap-1 rounded-[1.25rem] border-2 ${INK} bg-white p-1`}
                role="tablist"
                aria-label={t('portal.leaderboardPeriod.label')}
            >
                {PERIODS.map((key) => (
                    <button
                        key={key}
                        type="button"
                        role="tab"
                        id={`dash-board-tab-${key}`}
                        aria-selected={period === key}
                        aria-controls="dash-board-panel"
                        onClick={() => setPeriod(key)}
                        data-testid={`dash-board-tab-${key}`}
                        className={cn(
                            'min-h-9 min-w-0 rounded-full px-1 text-[11px] leading-tight font-bold transition-colors sm:text-xs',
                            period === key
                                ? 'bg-[#151b2e] text-white'
                                : 'text-[#151b2e] hover:bg-[#fff0cf]',
                        )}
                    >
                        {t(`portal.leaderboardPeriod.${key}`)}
                    </button>
                ))}
            </div>
            <div
                id="dash-board-panel"
                role="tabpanel"
                aria-labelledby={`dash-board-tab-${period}`}
                className="flex flex-col gap-3"
            >
                {board.entries.length === 0 ? (
                    <EmptyNote>
                        {t(
                            period === 'all'
                                ? 'portal.leaderboardEmpty'
                                : 'portal.leaderboardEmptyPeriod',
                        )}
                    </EmptyNote>
                ) : (
                    <>
                        <div
                            className="flex items-end gap-2 rounded-2xl bg-[#fff4d6] px-2 pt-3"
                            aria-label={t('playerDash.board.podium')}
                            role="group"
                            data-testid="dash-podium"
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
                                                size={row.rank === 1 ? 68 : 54}
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
                            data-testid="dash-board-list"
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
                                        {number.format(row.points)}
                                    </span>
                                </li>
                            ))}
                        </ol>
                    </>
                )}
                {board.me && !meListed && (
                    <p
                        className="flex items-center justify-between gap-3 rounded-xl border-2 border-dashed border-[#151b2e] bg-[#fff0cf] px-3 py-2 text-sm font-bold"
                        data-testid="dash-board-me"
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
                {!board.me && board.entries.length > 0 && (
                    <p className="text-center text-xs font-semibold text-[#151b2e]/75">
                        {t('portal.leaderboardNotRanked')}
                    </p>
                )}
            </div>
        </section>
    );
}

function HistoryCard({
    history,
    titles,
    pagination,
    number,
}: {
    history: HistoryItem[];
    /** Catalog title keys per game key, so names match the rest of the page. */
    titles: Record<string, string>;
    pagination: DashboardProps['historyPagination'];
    number: Intl.NumberFormat;
}) {
    const { t, i18n } = useTranslations();
    const duration = useDuration();
    const dateFormat = new Intl.DateTimeFormat(i18n.language, {
        dateStyle: 'medium',
        timeStyle: 'short',
    });

    return (
        <section
            id="history"
            className={cn(CARD, 'scroll-mt-6')}
            aria-labelledby="dash-history-title"
            data-testid="dash-history"
        >
            <SectionTitle icon={History} id="dash-history-title">
                {t('playerDash.history.title')}
            </SectionTitle>
            {history.length === 0 ? (
                <EmptyNote>
                    <span className="block font-bold text-[#151b2e]">
                        {t('player.emptyHistory')}
                    </span>
                    {t('player.historyNote')}
                </EmptyNote>
            ) : (
                <ul className="flex flex-col divide-y divide-[#151b2e]/15">
                    {history.map((item) => {
                        const total =
                            item.correct !== null && item.wrong !== null
                                ? item.correct + item.wrong
                                : 0;
                        return (
                            <li
                                key={item.id}
                                className="flex min-w-0 items-center justify-between gap-3 py-2.5"
                            >
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-semibold">
                                        {titles[item.game_key]
                                            ? t(titles[item.game_key])
                                            : item.game_name}
                                    </p>
                                    <p className="flex flex-wrap gap-x-1.5 text-xs text-[#151b2e]/70">
                                        <time dateTime={item.played_at}>
                                            {dateFormat.format(
                                                new Date(item.played_at),
                                            )}
                                        </time>
                                        {total > 0 && (
                                            <span>
                                                ·{' '}
                                                {t(
                                                    'playerDash.history.accuracy',
                                                    {
                                                        correct: item.correct,
                                                        total,
                                                    },
                                                )}
                                            </span>
                                        )}
                                        {item.duration_seconds ? (
                                            <span>
                                                ·{' '}
                                                {duration(
                                                    item.duration_seconds,
                                                )}
                                            </span>
                                        ) : null}
                                    </p>
                                </div>
                                <span className="shrink-0 text-sm font-bold text-[#116a56] tabular-nums">
                                    +{number.format(item.points)}
                                </span>
                            </li>
                        );
                    })}
                </ul>
            )}
            {pagination.last_page > 1 && (
                <nav
                    className="flex min-w-0 items-center justify-between gap-2"
                    aria-label={t('playerDash.history.title')}
                >
                    <PageLink
                        href={pagination.prev_page_url}
                        label={t('playerDash.history.prev')}
                        icon={<ChevronLeft className="size-4" aria-hidden />}
                    />
                    <span className="text-xs font-bold text-[#151b2e]/70 tabular-nums">
                        {t('playerDash.history.page', {
                            page: pagination.current_page,
                            last: pagination.last_page,
                        })}
                    </span>
                    <PageLink
                        href={pagination.next_page_url}
                        label={t('playerDash.history.next')}
                        icon={<ChevronRight className="size-4" aria-hidden />}
                        trailing
                    />
                </nav>
            )}
        </section>
    );
}

function PageLink({
    href,
    label,
    icon,
    trailing = false,
}: {
    href: string | null;
    label: string;
    icon: ReactNode;
    trailing?: boolean;
}) {
    const className = `inline-flex min-h-10 min-w-10 shrink-0 items-center justify-center gap-1 rounded-xl border-2 ${INK} bg-white px-2.5 text-sm font-bold sm:px-3`;
    const text = <span className="sr-only sm:not-sr-only">{label}</span>;
    if (!href) {
        return (
            <span className={cn(className, 'opacity-40')} aria-disabled>
                {!trailing && icon}
                {text}
                {trailing && icon}
            </span>
        );
    }
    return (
        <Link
            href={href}
            preserveScroll
            only={['history', 'historyPagination']}
            className={className}
        >
            {!trailing && icon}
            {text}
            {trailing && icon}
        </Link>
    );
}

function ageFromBirthDate(birthDate: string): number {
    const [year, month, day] = birthDate.split('-').map(Number);
    const now = new Date();
    const hadBirthday =
        now.getMonth() + 1 > month ||
        (now.getMonth() + 1 === month && now.getDate() >= day);

    return now.getFullYear() - year - (hadBirthday ? 0 : 1);
}

function PlayerDetailsCard({ details }: { details: PlayerDetails }) {
    const { t } = useTranslations();
    const form = useForm<{
        birth_date: string;
        school_name: string;
        school_city: string;
    }>({
        birth_date: details.birth_date ?? '',
        school_name: details.school_name ?? '',
        school_city: details.school_city ?? '',
    });
    const today = new Date().toISOString().slice(0, 10);
    const complete = Boolean(details.birth_date && details.school_name);

    return (
        <section
            id="player-details"
            className="auth-card flex scroll-mt-6 flex-col gap-3 !p-4 sm:!p-5"
        >
            <h2 className="flex items-center gap-2 text-xl font-bold">
                <IdCard className="size-5" aria-hidden />
                {t('player.details')}
            </h2>
            {complete && details.birth_date ? (
                <p className="flex flex-wrap items-center gap-x-1.5 text-sm font-semibold">
                    <span>
                        {t('player.age', {
                            count: ageFromBirthDate(details.birth_date),
                        })}
                    </span>
                    <span aria-hidden>·</span>
                    <span className="break-words">{details.school_name}</span>
                    {details.school_city && (
                        <span className="inline-flex items-center gap-1 text-[#151b2e]/75">
                            <MapPin className="size-3.5" aria-hidden />
                            {details.school_city}
                        </span>
                    )}
                </p>
            ) : (
                <p className="text-sm text-muted-foreground">
                    {t('player.detailsNote')}
                </p>
            )}
            <form
                className="flex flex-col gap-3"
                onSubmit={(event) => {
                    event.preventDefault();
                    form.patch('/player-details', { preserveScroll: true });
                }}
            >
                <label
                    htmlFor="birth-date-input"
                    className="text-sm font-semibold"
                >
                    {t('player.birthDate')}
                </label>
                <input
                    id="birth-date-input"
                    type="date"
                    name="birth_date"
                    value={form.data.birth_date}
                    max={today}
                    onChange={(event) =>
                        form.setData('birth_date', event.target.value)
                    }
                    className="min-h-11 w-full rounded-xl border-2 border-[#151b2e] bg-white px-3.5 font-semibold"
                />
                <InputError message={form.errors.birth_date} />
                <SchoolPicker
                    idPrefix="details-school"
                    schoolName={form.data.school_name}
                    schoolCity={form.data.school_city}
                    onSchoolNameChange={(value) =>
                        form.setData((current) => ({
                            ...current,
                            school_name: value,
                        }))
                    }
                    onSchoolCityChange={(value) =>
                        form.setData((current) => ({
                            ...current,
                            school_city: value,
                        }))
                    }
                    schoolError={form.errors.school_name}
                    cityError={form.errors.school_city}
                />
                {form.recentlySuccessful && (
                    <p
                        role="status"
                        className="text-sm font-semibold text-[#116a56]"
                    >
                        {t('player.detailsSaved')}
                    </p>
                )}
                <button
                    type="submit"
                    disabled={
                        form.processing ||
                        form.data.birth_date === '' ||
                        form.data.school_name.trim() === ''
                    }
                    className="px-5 py-2.5 font-bold disabled:opacity-50"
                >
                    {t('player.detailsSave')}
                </button>
            </form>
        </section>
    );
}

function GradeCard({ grade }: { grade: number | null }) {
    const { t } = useTranslations();
    const form = useForm<{ grade: string }>({
        grade: hasGrade(grade) ? String(grade) : '',
    });
    return (
        <section
            id="grade"
            className="auth-card flex scroll-mt-6 flex-col gap-3 !p-4 sm:!p-5"
        >
            <h2 className="flex items-center gap-2 text-xl font-bold">
                <GraduationCap className="size-5" aria-hidden />
                {t('player.grade')}
            </h2>
            <p className="text-sm text-muted-foreground">
                {t('player.gradeNote')}
            </p>
            <form
                className="flex flex-col gap-3"
                onSubmit={(event) => {
                    event.preventDefault();
                    form.patch('/grade', { preserveScroll: true });
                }}
            >
                <label htmlFor="grade-select" className="sr-only">
                    {t('player.grade')}
                </label>
                <select
                    id="grade-select"
                    name="grade"
                    value={form.data.grade}
                    onChange={(event) =>
                        form.setData('grade', event.target.value)
                    }
                    className="min-h-11 w-full rounded-xl border-2 border-[#151b2e] bg-white px-3.5 font-semibold"
                >
                    <option value="" disabled>
                        {t('player.gradePlaceholder')}
                    </option>
                    {GRADE_LEVELS.map((band) => (
                        <optgroup
                            key={band.key}
                            label={t(`player.gradeBands.${band.key}`)}
                        >
                            {band.grades.map((value) => (
                                <option key={value} value={value}>
                                    {gradeLabel(t, value)}
                                </option>
                            ))}
                        </optgroup>
                    ))}
                </select>
                <InputError message={form.errors.grade} />
                {form.recentlySuccessful && (
                    <p
                        role="status"
                        className="text-sm font-semibold text-[#116a56]"
                    >
                        {t('player.gradeSaved')}
                    </p>
                )}
                <button
                    type="submit"
                    disabled={form.processing || form.data.grade === ''}
                    className="px-5 py-2.5 font-bold disabled:opacity-50"
                >
                    {t('player.gradeSave')}
                </button>
            </form>
        </section>
    );
}
