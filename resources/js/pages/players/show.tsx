import { BadgeMedal, type EarnedBadge } from '@/components/badges';
import {
    ChatButton,
    FriendButton,
    type FriendRelation,
} from '@/components/leaderboard-player-menu';
import { OnlineDot } from '@/components/online-dot';
import PlayerCharacter, {
    type CharacterData,
} from '@/components/player-character';
import { useTranslations } from '@/hooks/use-translations';
import PlayerLayout from '@/layouts/player-layout';
import { gameIcon } from '@/lib/games';
import { gradeLabel, hasGrade } from '@/lib/grade';
import { Head, Link } from '@inertiajs/react';
import {
    ArrowLeft,
    Award,
    CalendarDays,
    Coins,
    Gamepad2,
    GraduationCap,
    IdCard,
    MapPin,
    School,
    Star,
    Trophy,
    UserRound,
    Users,
} from 'lucide-react';
import { createElement, useState, type ReactNode } from 'react';

interface PlayerPageProps {
    player: {
        id: number;
        name: string;
        grade: number | null;
        age: number | null;
        school_name: string | null;
        school_city: string | null;
        character: CharacterData | null;
        joined_at: string | null;
        last_seen_at: string | null;
    };
    stats: {
        points: number;
        level: number;
        rank: number | null;
        games: number;
    };
    badges: EarnedBadge[];
    topGames: {
        key: string;
        name: string;
        titleKey: string | null;
        icon: string | null;
        accent: string | null;
        plays: number;
    }[];
    isMe: boolean;
    relation: FriendRelation | 'self';
    friendshipId: number | null;
}

const CARD = 'auth-card flex min-w-0 flex-col gap-4 !p-4 sm:!p-5';

/** Public page of another player, opened from a leaderboard name. */
export default function PlayerPage({
    player,
    stats,
    badges,
    topGames,
    isMe,
    relation: initialRelation,
}: PlayerPageProps) {
    const { t, i18n } = useTranslations();
    const number = new Intl.NumberFormat(i18n.language);
    const date = (value: string | null) =>
        value
            ? new Intl.DateTimeFormat(i18n.language, {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
              }).format(new Date(value))
            : '—';
    const [relation, setRelation] = useState(initialRelation);

    return (
        <PlayerLayout title={t('playerPage.title', { name: player.name })}>
            <Head>
                <meta name="robots" content="noindex, nofollow" />
            </Head>
            <Link
                href="/dashboard"
                className="inline-flex items-center gap-1.5 self-start text-sm font-bold text-[#151b2e]/80 hover:text-[#151b2e] hover:underline"
                data-testid="player-page-back"
            >
                <ArrowLeft className="size-4" aria-hidden />
                {t('nav.backToDashboard')}
            </Link>

            <section
                className="auth-card grid min-w-0 items-center gap-5 !bg-[#fff4d6] !p-4 sm:!p-6 md:grid-cols-[160px_minmax(0,1fr)]"
                aria-labelledby="player-page-title"
                data-testid="player-page-hero"
            >
                <div className="relative mx-auto w-32 md:w-full">
                    {player.character ? (
                        <PlayerCharacter character={player.character} />
                    ) : (
                        <span className="grid aspect-square place-items-center rounded-2xl border-2 border-[#151b2e] bg-white">
                            <UserRound className="size-12" aria-hidden />
                        </span>
                    )}
                    <OnlineDot
                        userId={player.id}
                        className="edu-online-dot--lg"
                    />
                </div>
                <div className="flex min-w-0 flex-col gap-3">
                    <div className="flex min-w-0 flex-col gap-2">
                        <h1
                            id="player-page-title"
                            className="text-2xl font-bold tracking-tight text-balance break-words sm:text-3xl"
                            data-testid="player-page-name"
                        >
                            {player.name}
                        </h1>
                        <div className="flex flex-wrap gap-2 text-sm font-bold">
                            <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-[#151b2e] bg-[#6c5ce7] px-3 py-1 text-white">
                                <GraduationCap className="size-4" aria-hidden />
                                {hasGrade(player.grade)
                                    ? gradeLabel(t, player.grade)
                                    : t('player.gradeMissing')}
                            </span>
                            {player.age !== null && (
                                <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-[#151b2e] bg-white px-3 py-1">
                                    <CalendarDays
                                        className="size-4"
                                        aria-hidden
                                    />
                                    {t('player.age', { count: player.age })}
                                </span>
                            )}
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <Stat
                            icon={<Coins className="size-4" aria-hidden />}
                            label={t('profile.stats.points')}
                            value={number.format(stats.points)}
                        />
                        <Stat
                            icon={<Star className="size-4" aria-hidden />}
                            label={t('profile.stats.level')}
                            value={number.format(stats.level)}
                        />
                        <Stat
                            icon={<Trophy className="size-4" aria-hidden />}
                            label={t('profile.stats.rank')}
                            value={
                                stats.rank
                                    ? `#${number.format(stats.rank)}`
                                    : '—'
                            }
                            testId="player-page-rank"
                        />
                        <Stat
                            icon={<Gamepad2 className="size-4" aria-hidden />}
                            label={t('profile.stats.games')}
                            value={number.format(stats.games)}
                        />
                    </div>
                    <div className="flex flex-col gap-1.5 sm:max-w-xs">
                        <span className="flex items-center gap-1.5 text-xs font-bold tracking-wide text-[#151b2e]/75 uppercase">
                            <Users className="size-3.5" aria-hidden />
                            {t('playerPage.friendship')}
                        </span>
                        {relation === 'self' || isMe ? (
                            <Link
                                href="/profile"
                                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border-[2.5px] border-[#151b2e] bg-white px-3 text-sm font-bold shadow-[2px_2px_0_#151b2e] hover:bg-[#fff9e6]"
                                data-testid="player-page-own"
                            >
                                <IdCard className="size-4" aria-hidden />
                                {t('playerPage.ownProfile')}
                            </Link>
                        ) : (
                            <div className="flex flex-col gap-2">
                                <FriendButton
                                    userId={player.id}
                                    relation={relation}
                                    onChange={setRelation}
                                    testId="player-page-friend"
                                />
                                <ChatButton
                                    userId={player.id}
                                    testId="player-page-chat"
                                />
                            </div>
                        )}
                    </div>
                </div>
            </section>

            <div className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
                <section className={CARD} data-testid="player-page-info">
                    <h2 className="flex items-center gap-2 text-xl font-bold">
                        <IdCard className="size-5" aria-hidden />
                        {t('playerPage.info')}
                    </h2>
                    <dl className="grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-4 gap-y-2.5 text-sm">
                        <InfoRow label={t('playerPage.name')}>
                            {player.name}
                        </InfoRow>
                        <InfoRow label={t('profile.info.grade')}>
                            {hasGrade(player.grade)
                                ? gradeLabel(t, player.grade)
                                : '—'}
                        </InfoRow>
                        <InfoRow label={t('player.schoolName')}>
                            <span
                                className="flex flex-col"
                                data-testid="player-page-school"
                            >
                                <span className="inline-flex items-center gap-1.5">
                                    <School
                                        className="size-3.5 shrink-0"
                                        aria-hidden
                                    />
                                    {player.school_name || '—'}
                                </span>
                                {player.school_city && (
                                    <span className="inline-flex items-center gap-1.5 text-xs text-[#151b2e]/75">
                                        <MapPin
                                            className="size-3.5 shrink-0"
                                            aria-hidden
                                        />
                                        {player.school_city}
                                    </span>
                                )}
                            </span>
                        </InfoRow>
                        <InfoRow label={t('profile.info.age')}>
                            <span data-testid="player-page-age">
                                {player.age !== null
                                    ? t('player.age', { count: player.age })
                                    : '—'}
                            </span>
                        </InfoRow>
                        <InfoRow label={t('profile.info.joined')}>
                            {date(player.joined_at)}
                        </InfoRow>
                        <InfoRow label={t('profile.info.lastSeen')}>
                            {date(player.last_seen_at)}
                        </InfoRow>
                    </dl>
                </section>

                <div className="flex min-w-0 flex-col gap-6">
                    <section className={CARD} data-testid="player-page-badges">
                        <h2 className="flex items-center gap-2 text-xl font-bold">
                            <Award className="size-5" aria-hidden />
                            {t('playerPage.badges', { count: badges.length })}
                        </h2>
                        {badges.length === 0 ? (
                            <p className="rounded-xl border-2 border-dashed border-[#151b2e]/25 px-4 py-5 text-center text-sm text-[#151b2e]/75">
                                {t('playerPage.noBadges')}
                            </p>
                        ) : (
                            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                                {badges.map((badge) => (
                                    <li
                                        key={badge.key}
                                        className="flex min-w-0 items-center gap-2 rounded-xl border-2 border-[#151b2e] bg-white px-2.5 py-2"
                                    >
                                        <BadgeMedal badge={badge} />
                                        <span className="min-w-0 text-sm font-bold break-words">
                                            {t(`badges.names.${badge.key}`)}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>

                    <section className={CARD} data-testid="player-page-games">
                        <h2 className="flex items-center gap-2 text-xl font-bold">
                            <Gamepad2 className="size-5" aria-hidden />
                            {t('playerPage.topGames')}
                        </h2>
                        {topGames.length === 0 ? (
                            <p className="rounded-xl border-2 border-dashed border-[#151b2e]/25 px-4 py-5 text-center text-sm text-[#151b2e]/75">
                                {t('playerPage.noGames')}
                            </p>
                        ) : (
                            <ul className="flex flex-col gap-2">
                                {topGames.map((game) => (
                                    <li
                                        key={game.key}
                                        className="flex min-w-0 items-center gap-3 rounded-xl border-2 border-[#151b2e] bg-white px-3 py-2"
                                    >
                                        <span
                                            className="grid size-9 shrink-0 place-items-center rounded-lg border-2 border-[#151b2e]"
                                            style={{
                                                background:
                                                    game.accent ?? '#fff4d6',
                                            }}
                                        >
                                            {createElement(
                                                gameIcon(
                                                    game.icon ?? 'gamepad',
                                                ),
                                                {
                                                    className: 'size-4',
                                                    'aria-hidden': true,
                                                },
                                            )}
                                        </span>
                                        <span className="min-w-0 flex-1 truncate text-sm font-bold">
                                            {game.titleKey
                                                ? t(game.titleKey)
                                                : game.name}
                                        </span>
                                        <span className="shrink-0 text-xs font-bold text-[#151b2e]/80 tabular-nums">
                                            {t('playerPage.plays', {
                                                count: game.plays,
                                            })}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>
                </div>
            </div>
        </PlayerLayout>
    );
}

function Stat({
    icon,
    label,
    value,
    testId,
}: {
    icon: ReactNode;
    label: string;
    value: string;
    testId?: string;
}) {
    return (
        <div className="flex min-w-0 flex-col gap-0.5 rounded-xl border-2 border-[#151b2e] bg-white px-3 py-2">
            <span className="flex items-center gap-1.5 text-xs font-bold text-[#151b2e]/85">
                {icon}
                <span className="truncate">{label}</span>
            </span>
            <span
                className="truncate text-lg font-bold tabular-nums"
                data-testid={testId}
            >
                {value}
            </span>
        </div>
    );
}

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
    return (
        <>
            <dt className="font-semibold text-[#151b2e]/80">{label}</dt>
            <dd className="min-w-0 font-semibold break-words">{children}</dd>
        </>
    );
}
