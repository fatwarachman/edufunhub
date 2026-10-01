import PlayerCharacter, {
    type CharacterData,
} from '@/components/player-character';
import { NavButton } from '@/components/site-nav';
import { useTranslations } from '@/hooks/use-translations';
import PlayerLayout from '@/layouts/player-layout';
import {
    Coins,
    Crown,
    Dice5,
    Flag,
    Gamepad2,
    GraduationCap,
    History,
    type LucideIcon,
    Medal,
    Plane,
    Play,
    Sparkles,
    Star,
} from 'lucide-react';
import { useMemo, useState } from 'react';

interface PortalGame {
    key: string;
    titleKey: string;
    descriptionKey: string | null;
    url: string;
    icon: string;
    accent: string;
    minGrade: number;
    maxGrade: number;
    awardsPoints: boolean;
    requiresGrade: boolean;
    recommended: boolean;
}

interface PortalProps {
    player: { name: string; grade: number | null; character: CharacterData };
    progress: {
        points: number;
        level: number;
        levelProgress: number;
        pointsPerLevel: number;
        nextLevelAt: number;
    };
    rank: number | null;
    categories: { key: string; titleKey: string; games: PortalGame[] }[];
    leaderboard: {
        rank: number;
        name: string;
        points: number;
        isMe: boolean;
        character: { color: string; accessory: string };
    }[];
    recent: {
        id: number;
        game_key: string;
        game_name: string;
        points: number;
        played_at: string;
    }[];
}

const ICONS: Record<string, LucideIcon> = {
    flag: Flag,
    dice: Dice5,
    plane: Plane,
    gamepad: Gamepad2,
};

export default function Portal({
    player,
    progress,
    rank,
    categories,
    leaderboard,
    recent,
}: PortalProps) {
    const { t, i18n } = useTranslations();
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
    const levelPercent = Math.round(
        (progress.levelProgress / progress.pointsPerLevel) * 100,
    );

    return (
        <PlayerLayout title={t('portal.title')}>
            <section
                className="auth-card grid items-center gap-6 !bg-[#fff4d6] md:grid-cols-[200px_minmax(0,1fr)] lg:grid-cols-[220px_minmax(0,1fr)_280px]"
                aria-labelledby="portal-hero-title"
            >
                <div className="mx-auto w-32 sm:w-40 md:w-full">
                    <PlayerCharacter character={player.character} />
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
                            {player.grade
                                ? t('player.gradeOption', {
                                      grade: player.grade,
                                  })
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
                    {!player.grade && (
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
                                { key: 'all', titleKey: 'portal.all' },
                                ...categories,
                            ].map((c) => (
                                <button
                                    key={c.key}
                                    type="button"
                                    aria-pressed={filter === c.key}
                                    onClick={() => setFilter(c.key)}
                                    className={`min-h-11 rounded-full border-2 border-[#151b2e] px-4 text-sm font-bold transition-colors ${
                                        filter === c.key
                                            ? 'bg-[#151b2e] text-white'
                                            : 'bg-white hover:bg-[#fff0cf]'
                                    }`}
                                >
                                    {t(c.titleKey)}
                                </button>
                            ))}
                        </div>
                    </div>

                    <ul
                        className="grid gap-5 sm:grid-cols-2"
                        data-testid="portal-game-list"
                    >
                        {games.map((game) => {
                            const Icon = ICONS[game.icon] ?? Gamepad2;
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
                                            {game.descriptionKey && (
                                                <p className="text-sm text-muted-foreground">
                                                    {t(game.descriptionKey)}
                                                </p>
                                            )}
                                        </div>
                                        {blocked ? (
                                            <NavButton
                                                href="/dashboard#grade"
                                                icon={GraduationCap}
                                                label={t(
                                                    'portal.setGradeFirst',
                                                )}
                                            />
                                        ) : (
                                            <NavButton
                                                href={game.url}
                                                icon={Play}
                                                label={t('portal.play')}
                                                variant="primary"
                                                testId={`portal-play-${game.key}`}
                                            />
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
                    <section
                        className="auth-card flex flex-col gap-4 !p-5"
                        aria-labelledby="portal-leaderboard-title"
                    >
                        <h2
                            id="portal-leaderboard-title"
                            className="flex items-center gap-2 text-xl font-bold"
                        >
                            <Crown className="size-5 text-[#f5a623]" />
                            {t('portal.leaderboard')}
                        </h2>
                        {leaderboard.length === 0 ? (
                            <p className="rounded-xl border-2 border-dashed border-[#151b2e]/25 px-4 py-6 text-center text-sm text-muted-foreground">
                                {t('portal.leaderboardEmpty')}
                            </p>
                        ) : (
                            <ol
                                className="flex flex-col gap-2"
                                data-testid="portal-leaderboard"
                            >
                                {leaderboard.map((row) => (
                                    <li
                                        key={row.rank}
                                        className={`flex items-center gap-3 rounded-xl border-2 border-[#151b2e] px-2.5 py-1.5 ${
                                            row.isMe
                                                ? 'bg-[#fff0cf]'
                                                : 'bg-white'
                                        }`}
                                    >
                                        <span className="w-6 text-center text-sm font-bold tabular-nums">
                                            {row.rank}
                                        </span>
                                        <PlayerCharacter
                                            character={row.character}
                                            size={36}
                                            backdrop={false}
                                            className="shrink-0"
                                        />
                                        <span className="min-w-0 flex-1 truncate text-sm font-bold">
                                            {row.name}
                                            {row.isMe && (
                                                <span className="font-semibold text-muted-foreground">
                                                    {' '}
                                                    ({t('portal.you')})
                                                </span>
                                            )}
                                        </span>
                                        <span className="text-sm font-bold tabular-nums">
                                            {numberFormat.format(row.points)}
                                        </span>
                                    </li>
                                ))}
                            </ol>
                        )}
                    </section>

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
