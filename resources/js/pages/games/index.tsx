import { BackButton, NavButton, SiteNav } from '@/components/site-nav';
import { useTranslations } from '@/hooks/use-translations';
import { gameIcon } from '@/lib/games';
import { gradeShortLabel } from '@/lib/grade';
import { cn } from '@/lib/utils';
import { type SharedData } from '@/types';
import { Head, usePage } from '@inertiajs/react';
import {
    Blocks,
    ChefHat,
    Coins,
    FlaskConical,
    Gamepad2,
    LogIn,
    type LucideIcon,
    PaintBucket,
    Play,
    Router,
    Sparkles,
    Swords,
} from 'lucide-react';
import { useState } from 'react';

/** Games announced as coming soon (classroom multiplayer and IT knowledge). */
const UPCOMING: { key: string; icon: LucideIcon; accent: string }[] = [
    { key: 'monsterCafe', icon: ChefHat, accent: 'bg-[#FF9E44]' },
    { key: 'saboteurLab', icon: FlaskConical, accent: 'bg-[#7ED957]' },
    { key: 'bossDefense', icon: Swords, accent: 'bg-[#8C7CF0]' },
    { key: 'pixelPainter', icon: PaintBucket, accent: 'bg-[#4FC3F7]' },
    { key: 'tetrisQuiz', icon: Blocks, accent: 'bg-[#FFD93D]' },
    { key: 'osiPingPong', icon: Router, accent: 'bg-[#F9A8D4]' },
];

export default function GameList() {
    const { t } = useTranslations();
    const { props } = usePage<SharedData>();
    const signedIn = Boolean(props.auth?.user);
    const categories = props.gameMenu ?? [];
    const [filter, setFilter] = useState<string>('all');
    const backHref = signedIn ? '/portal' : '/';
    const shown = categories.filter(
        (category) => filter === 'all' || category.key === filter,
    );
    const total = categories.reduce(
        (sum, category) => sum + category.games.length,
        0,
    );

    const range = (min: number, max: number) =>
        min === max
            ? gradeShortLabel(t, min)
            : `${gradeShortLabel(t, min)}–${gradeShortLabel(t, max)}`;

    return (
        <div className="min-h-screen bg-[#FFF9E6] selection:bg-[#FF6584] selection:text-white">
            <Head title={`${t('gameList.title')} - EduFunHub`}>
                <meta name="description" content={t('gameList.meta')} />
            </Head>

            <header className="sticky top-0 z-40 border-b-4 border-[#1f2a44] bg-[#FFF9E6]/95 backdrop-blur-md">
                <div className="mx-auto flex min-h-20 items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
                    <div className="flex min-w-0 items-center gap-3">
                        <BackButton
                            href={backHref}
                            label={t(
                                signedIn ? 'nav.backToPortal' : 'nav.home',
                            )}
                            iconOnly
                            external={!signedIn}
                        />
                        <div className="flex min-w-0 flex-col">
                            <span className="truncate font-display text-xl font-black text-[#1f2a44] sm:text-2xl">
                                {t('gameList.arena')}{' '}
                                <span className="text-[#FF9E44]">
                                    EduFunHub
                                </span>
                            </span>
                            <span className="hidden text-xs font-bold text-slate-600 sm:block">
                                {t('gameList.tagline')}
                            </span>
                        </div>
                    </div>

                    <SiteNav compact />
                </div>
            </header>

            <main className="mx-auto px-4 py-10 sm:px-6 sm:py-12 lg:px-8">
                <div className="text-center">
                    <div className="inline-flex items-center gap-2 rounded-full border-3 border-[#1f2a44] bg-[#FFF176] px-4 py-1 text-xs font-black tracking-wider text-[#1f2a44] uppercase shadow-[3px_3px_0px_#1f2a44]">
                        <Gamepad2 className="h-4 w-4" />
                        {t('gameList.badge', { count: total })}
                    </div>
                    <h1 className="mt-4 font-display text-3xl font-black text-[#1f2a44] sm:text-5xl">
                        {t('gameList.heading')}{' '}
                        <span className="text-[#FF6584]">
                            {t('gameList.headingAccent')}
                        </span>
                    </h1>
                    <p className="mx-auto mt-3 max-w-2xl text-base font-bold text-slate-600 sm:text-lg">
                        {t('gameList.intro')}
                    </p>
                </div>

                <div
                    className="mt-8 flex flex-wrap justify-center gap-2"
                    role="group"
                    aria-label={t('portal.filterLabel')}
                    data-testid="gamelist-filter"
                >
                    {[
                        { key: 'all', titleKey: 'portal.all' },
                        ...categories,
                    ].map((category) => (
                        <button
                            key={category.key}
                            type="button"
                            aria-pressed={filter === category.key}
                            onClick={() => setFilter(category.key)}
                            className={cn(
                                'min-h-11 rounded-full border-3 border-[#1f2a44] px-4 text-sm font-black shadow-[2px_2px_0px_#1f2a44] transition-colors',
                                filter === category.key
                                    ? 'bg-[#1f2a44] text-white'
                                    : 'bg-white text-[#1f2a44] hover:bg-[#FFF176]',
                            )}
                        >
                            {t(category.titleKey)}
                        </button>
                    ))}
                </div>

                <div className="mt-10 flex flex-col gap-12">
                    {shown.map((category) => (
                        <section
                            key={category.key}
                            aria-labelledby={`category-${category.key}`}
                            data-testid={`gamelist-category-${category.key}`}
                        >
                            <h2
                                id={`category-${category.key}`}
                                className="mb-5 flex items-center gap-3 font-display text-2xl font-black text-[#1f2a44]"
                            >
                                {t(category.titleKey)}
                                <span className="rounded-full border-2 border-[#1f2a44] bg-white px-2.5 py-0.5 text-sm">
                                    {category.games.length}
                                </span>
                            </h2>
                            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                                {category.games.map((game) => {
                                    const Icon = gameIcon(game.icon);
                                    const locked =
                                        !signedIn && !game.guestPlayable;
                                    return (
                                        <article
                                            key={game.key}
                                            className="flex flex-col justify-between rounded-3xl border-3 border-[#1f2a44] bg-white p-6 shadow-[5px_5px_0px_#1f2a44] transition-all hover:-translate-y-1.5 hover:shadow-[8px_8px_0px_#1f2a44]"
                                            data-testid={`gamelist-game-${game.key}`}
                                        >
                                            <div>
                                                <div className="flex items-start justify-between gap-3">
                                                    <div
                                                        className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border-3 border-[#1f2a44] text-white shadow-[3px_3px_0px_#1f2a44]"
                                                        style={{
                                                            background:
                                                                game.accent,
                                                        }}
                                                    >
                                                        <Icon className="h-7 w-7 stroke-[2.5]" />
                                                    </div>
                                                    <div className="flex flex-wrap justify-end gap-1.5">
                                                        <span className="rounded-full border-2 border-[#1f2a44] bg-[#FFFDE6] px-3 py-0.5 text-xs font-black text-[#1f2a44] shadow-[1.5px_1.5px_0px_#1f2a44]">
                                                            {t(
                                                                'nav.gradeRange',
                                                                {
                                                                    range: range(
                                                                        game.minGrade,
                                                                        game.maxGrade,
                                                                    ),
                                                                },
                                                            )}
                                                        </span>
                                                        <span
                                                            className={cn(
                                                                'inline-flex items-center gap-1 rounded-full border-2 border-[#1f2a44] px-3 py-0.5 text-xs font-black text-[#1f2a44] shadow-[1.5px_1.5px_0px_#1f2a44]',
                                                                game.awardsPoints
                                                                    ? 'bg-[#ffd93d]'
                                                                    : 'bg-white',
                                                            )}
                                                        >
                                                            {game.awardsPoints && (
                                                                <Coins className="size-3" />
                                                            )}
                                                            {game.awardsPoints
                                                                ? t(
                                                                      'portal.earnsPoints',
                                                                  )
                                                                : t(
                                                                      'portal.practice',
                                                                  )}
                                                        </span>
                                                    </div>
                                                </div>

                                                <h3 className="mt-5 font-display text-xl font-black text-[#1f2a44]">
                                                    {t(game.titleKey)}
                                                </h3>
                                                {game.descriptionKey && (
                                                    <p className="mt-3 text-sm leading-relaxed font-semibold text-slate-600">
                                                        {t(game.descriptionKey)}
                                                    </p>
                                                )}
                                            </div>

                                            <div className="mt-6 border-t-2 border-[#1f2a44]/10 pt-4">
                                                {locked ? (
                                                    <NavButton
                                                        href="/login"
                                                        icon={LogIn}
                                                        label={t(
                                                            'nav.loginToPlay',
                                                        )}
                                                        block
                                                        testId={`gamelist-login-${game.key}`}
                                                    />
                                                ) : (
                                                    <NavButton
                                                        href={game.url}
                                                        icon={Play}
                                                        label={t(
                                                            'gameList.play',
                                                        )}
                                                        variant="primary"
                                                        block
                                                        testId={`gamelist-play-${game.key}`}
                                                    />
                                                )}
                                            </div>
                                        </article>
                                    );
                                })}
                            </div>
                        </section>
                    ))}

                    {filter === 'all' && (
                        <section
                            aria-labelledby="category-upcoming"
                            data-testid="gamelist-upcoming"
                        >
                            <h2
                                id="category-upcoming"
                                className="flex items-center gap-3 font-display text-2xl font-black text-[#1f2a44]"
                            >
                                <Sparkles className="size-6 text-[#FF9E44]" />
                                {t('gameList.upcoming.title')}
                                <span className="rounded-full border-2 border-[#1f2a44] bg-white px-2.5 py-0.5 text-sm">
                                    {UPCOMING.length}
                                </span>
                            </h2>
                            <p className="mt-2 mb-5 max-w-3xl text-sm font-bold text-slate-600">
                                {t('gameList.upcoming.intro')}
                            </p>
                            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                                {UPCOMING.map(({ key, icon: Icon, accent }) => {
                                    const base = `gameList.upcoming.games.${key}`;
                                    const gameplay = t(`${base}.gameplay`, {
                                        returnObjects: true,
                                    }) as string[];
                                    return (
                                        <article
                                            key={key}
                                            className="flex flex-col rounded-3xl border-3 border-[#1f2a44] bg-white p-6 shadow-[5px_5px_0px_#1f2a44]"
                                            data-testid={`gamelist-upcoming-${key}`}
                                        >
                                            <div className="flex items-start justify-between gap-3">
                                                <span
                                                    className={cn(
                                                        'flex size-12 shrink-0 items-center justify-center rounded-2xl border-3 border-[#1f2a44] text-[#1f2a44]',
                                                        accent,
                                                    )}
                                                >
                                                    <Icon
                                                        className="size-6"
                                                        aria-hidden
                                                    />
                                                </span>
                                                <span className="rounded-full border-2 border-[#1f2a44] bg-[#FFF176] px-2.5 py-0.5 text-xs font-black tracking-wide text-[#1f2a44] uppercase">
                                                    {t(
                                                        'gameList.upcoming.badge',
                                                    )}
                                                </span>
                                            </div>
                                            <h3 className="mt-4 font-display text-xl font-black text-[#1f2a44]">
                                                {t(`${base}.title`)}
                                            </h3>
                                            <p className="mt-0.5 text-xs font-black tracking-wide text-[#C2185B] uppercase">
                                                {t(`${base}.inspiration`)}
                                            </p>
                                            <dl className="mt-4 flex flex-1 flex-col gap-3 text-sm">
                                                <div>
                                                    <dt className="font-black text-[#1f2a44]">
                                                        {t(
                                                            'gameList.upcoming.conceptLabel',
                                                        )}
                                                    </dt>
                                                    <dd className="mt-0.5 font-semibold text-slate-600">
                                                        {t(`${base}.concept`)}
                                                    </dd>
                                                </div>
                                                <div>
                                                    <dt className="font-black text-[#1f2a44]">
                                                        {t(
                                                            'gameList.upcoming.gameplayLabel',
                                                        )}
                                                    </dt>
                                                    <dd className="mt-1">
                                                        <ul className="flex list-disc flex-col gap-1 pl-5 font-semibold text-slate-600 marker:text-[#FF9E44]">
                                                            {Array.isArray(
                                                                gameplay,
                                                            ) &&
                                                                gameplay.map(
                                                                    (line) => (
                                                                        <li
                                                                            key={
                                                                                line
                                                                            }
                                                                        >
                                                                            {
                                                                                line
                                                                            }
                                                                        </li>
                                                                    ),
                                                                )}
                                                        </ul>
                                                    </dd>
                                                </div>
                                                <div className="mt-auto rounded-2xl border-2 border-dashed border-[#1f2a44]/30 bg-[#FFF9E6] p-3">
                                                    <dt className="font-black text-[#1f2a44]">
                                                        {t(
                                                            'gameList.upcoming.funLabel',
                                                        )}
                                                    </dt>
                                                    <dd className="mt-0.5 font-semibold text-slate-600">
                                                        {t(`${base}.fun`)}
                                                    </dd>
                                                </div>
                                            </dl>
                                        </article>
                                    );
                                })}
                            </div>
                        </section>
                    )}
                </div>
            </main>
        </div>
    );
}
