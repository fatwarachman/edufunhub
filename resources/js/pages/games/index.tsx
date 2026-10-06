import { PlayerCountBadge } from '@/components/player-count-badge';
import { BackButton, NavButton, SiteNav } from '@/components/site-nav';
import { useTranslations } from '@/hooks/use-translations';
import { gameIcon } from '@/lib/games';
import { gradeShortLabel } from '@/lib/grade';
import { cn } from '@/lib/utils';
import { type GameMenuGame, type SharedData } from '@/types';
import { Head, usePage } from '@inertiajs/react';
import {
    Blocks,
    ChefHat,
    Coins,
    FlaskConical,
    Gamepad2,
    LayoutGrid,
    List,
    LogIn,
    type LucideIcon,
    PaintBucket,
    Play,
    Router,
    Search,
    SearchX,
    Sparkles,
    Swords,
    X,
} from 'lucide-react';
import { type ReactNode, useMemo, useState, useSyncExternalStore } from 'react';

/** Games announced as coming soon (classroom multiplayer and IT knowledge). */
const UPCOMING: { key: string; icon: LucideIcon; accent: string }[] = [
    { key: 'monsterCafe', icon: ChefHat, accent: 'bg-[#FF9E44]' },
    { key: 'saboteurLab', icon: FlaskConical, accent: 'bg-[#7ED957]' },
    { key: 'bossDefense', icon: Swords, accent: 'bg-[#8C7CF0]' },
    { key: 'pixelPainter', icon: PaintBucket, accent: 'bg-[#4FC3F7]' },
    { key: 'tetrisQuiz', icon: Blocks, accent: 'bg-[#FFD93D]' },
    { key: 'osiPingPong', icon: Router, accent: 'bg-[#F9A8D4]' },
];

type GameView = 'grid' | 'list';

const VIEW_KEY = 'gamelist.view';
const VIEW_EVENT = 'gamelist-view';

function readView(): GameView {
    try {
        return window.localStorage.getItem(VIEW_KEY) === 'list'
            ? 'list'
            : 'grid';
    } catch {
        return 'grid';
    }
}

function subscribeView(callback: () => void): () => void {
    window.addEventListener(VIEW_EVENT, callback);
    window.addEventListener('storage', callback);
    return () => {
        window.removeEventListener(VIEW_EVENT, callback);
        window.removeEventListener('storage', callback);
    };
}

function saveView(view: GameView): void {
    try {
        window.localStorage.setItem(VIEW_KEY, view);
    } catch {
        // Storage can be unavailable (private mode); the choice then lasts for this page only.
    }
    window.dispatchEvent(new Event(VIEW_EVENT));
}

/** Lower-cases and strips diacritics so "Kuis" matches "kuís". */
function normalize(text: string): string {
    return text
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
}

/** Keeps ?q= in the address bar without adding history entries. */
function syncQueryToUrl(query: string): void {
    const url = new URL(window.location.href);
    if (query.trim() === '') {
        url.searchParams.delete('q');
    } else {
        url.searchParams.set('q', query);
    }
    window.history.replaceState(window.history.state, '', url.toString());
}

function initialQuery(pageUrl: string): string {
    try {
        return new URL(pageUrl, 'http://localhost').searchParams.get('q') ?? '';
    } catch {
        return '';
    }
}

export default function GameList() {
    const { t } = useTranslations();
    const { props, url: pageUrl } = usePage<SharedData>();
    const signedIn = Boolean(props.auth?.user);
    const categories = useMemo(() => props.gameMenu ?? [], [props.gameMenu]);
    const [filter, setFilter] = useState<string>('all');
    const [query, setQuery] = useState<string>(() => initialQuery(pageUrl));
    const view = useSyncExternalStore(
        subscribeView,
        readView,
        () => 'grid' as GameView,
    );
    const backHref = signedIn ? '/portal' : '/';
    const searching = query.trim() !== '';

    const matched = useMemo(() => {
        const terms = normalize(query).split(/\s+/).filter(Boolean);
        return categories.map((category) => {
            const categoryText = t(category.titleKey);
            const games = terms.length
                ? category.games.filter((game) => {
                      const haystack = normalize(
                          [
                              t(game.titleKey),
                              game.descriptionKey ? t(game.descriptionKey) : '',
                              categoryText,
                          ].join(' '),
                      );
                      return terms.every((term) => haystack.includes(term));
                  })
                : category.games;
            return { ...category, games };
        });
    }, [categories, query, t]);

    const matchedTotal = matched.reduce(
        (sum, category) => sum + category.games.length,
        0,
    );
    const total = categories.reduce(
        (sum, category) => sum + category.games.length,
        0,
    );
    const shown = matched.filter(
        (category) =>
            (filter === 'all' || category.key === filter) &&
            category.games.length > 0,
    );
    const shownCount = shown.reduce(
        (sum, category) => sum + category.games.length,
        0,
    );

    const updateQuery = (value: string) => {
        setQuery(value);
        syncQueryToUrl(value);
    };

    const resetSearch = () => {
        updateQuery('');
        setFilter('all');
    };

    const range = (min: number, max: number) =>
        min === max
            ? gradeShortLabel(t, min)
            : `${gradeShortLabel(t, min)}–${gradeShortLabel(t, max)}`;

    const pointsBadge = (game: GameMenuGame, className?: string) => (
        <span
            className={cn(
                'inline-flex items-center gap-1 rounded-full border-2 border-[#1f2a44] px-3 py-0.5 text-xs font-black whitespace-nowrap text-[#1f2a44] shadow-[1.5px_1.5px_0px_#1f2a44]',
                game.awardsPoints ? 'bg-[#ffd93d]' : 'bg-white',
                className,
            )}
        >
            {game.awardsPoints && <Coins className="size-3" aria-hidden />}
            {game.awardsPoints ? t('portal.earnsPoints') : t('portal.practice')}
        </span>
    );

    const gradeBadge = (game: GameMenuGame, className?: string) => (
        <span
            className={cn(
                'rounded-full border-2 border-[#1f2a44] bg-[#FFFDE6] px-3 py-0.5 text-xs font-black whitespace-nowrap text-[#1f2a44] shadow-[1.5px_1.5px_0px_#1f2a44]',
                className,
            )}
        >
            {t('nav.gradeRange', {
                range: range(game.minGrade, game.maxGrade),
            })}
        </span>
    );

    const playButton = (game: GameMenuGame, compact = false): ReactNode =>
        !signedIn && !game.guestPlayable ? (
            <NavButton
                href="/login"
                icon={LogIn}
                label={t('nav.loginToPlay')}
                block={!compact}
                className={compact ? 'w-full sm:w-auto' : undefined}
                testId={`gamelist-login-${game.key}`}
            />
        ) : (
            <NavButton
                href={game.url}
                icon={Play}
                label={t('gameList.play')}
                variant="primary"
                block={!compact}
                className={compact ? 'w-full sm:w-auto' : undefined}
                testId={`gamelist-play-${game.key}`}
            />
        );

    const viewOptions: { key: GameView; icon: LucideIcon; label: string }[] = [
        { key: 'grid', icon: LayoutGrid, label: t('gameList.viewGrid') },
        { key: 'list', icon: List, label: t('gameList.viewList') },
    ];

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

                <div className="mx-auto mt-8 flex max-w-3xl items-stretch gap-2 sm:gap-3">
                    <div className="relative min-w-0 flex-1">
                        <Search
                            className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-[#1f2a44]"
                            aria-hidden
                        />
                        <input
                            type="search"
                            value={query}
                            onChange={(event) =>
                                updateQuery(event.target.value)
                            }
                            onKeyDown={(event) => {
                                if (event.key === 'Escape' && query) {
                                    event.preventDefault();
                                    updateQuery('');
                                }
                            }}
                            placeholder={t('gameList.searchPlaceholder')}
                            aria-label={t('gameList.searchLabel')}
                            autoComplete="off"
                            enterKeyHint="search"
                            data-testid="gamelist-search"
                            className="h-12 w-full min-w-0 rounded-2xl border-3 border-[#1f2a44] bg-white pr-12 pl-11 text-base font-bold text-[#1f2a44] shadow-[3px_3px_0px_#1f2a44] placeholder:font-semibold placeholder:text-slate-500 focus:outline-none focus-visible:ring-3 focus-visible:ring-[#6c5ce7] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FFF9E6] [&::-webkit-search-cancel-button]:appearance-none"
                        />
                        {query !== '' && (
                            <button
                                type="button"
                                onClick={() => updateQuery('')}
                                aria-label={t('gameList.clearSearch')}
                                title={t('gameList.clearSearch')}
                                data-testid="gamelist-search-clear"
                                className="absolute top-1/2 right-1.5 flex size-10 -translate-y-1/2 items-center justify-center rounded-xl text-[#1f2a44] hover:bg-[#FFF176] focus-visible:ring-3 focus-visible:ring-[#6c5ce7] focus-visible:outline-none"
                            >
                                <X className="size-5" aria-hidden />
                            </button>
                        )}
                    </div>
                    <div
                        role="group"
                        aria-label={t('gameList.viewLabel')}
                        className="flex shrink-0 rounded-2xl border-3 border-[#1f2a44] bg-white p-0.5 shadow-[3px_3px_0px_#1f2a44]"
                    >
                        {viewOptions.map(({ key, icon: Icon, label }) => (
                            <button
                                key={key}
                                type="button"
                                aria-pressed={view === key}
                                aria-label={label}
                                title={label}
                                onClick={() => saveView(key)}
                                data-testid={`gamelist-view-${key}`}
                                className={cn(
                                    'flex size-10 items-center justify-center rounded-xl transition-colors focus-visible:ring-3 focus-visible:ring-[#6c5ce7] focus-visible:outline-none',
                                    view === key
                                        ? 'bg-[#1f2a44] text-white'
                                        : 'text-[#1f2a44] hover:bg-[#FFF176]',
                                )}
                            >
                                <Icon className="size-5" aria-hidden />
                            </button>
                        ))}
                    </div>
                </div>

                <p
                    className={cn(
                        'mt-3 text-center text-sm font-bold text-slate-600',
                        !searching && 'sr-only',
                    )}
                    aria-live="polite"
                    data-testid="gamelist-result-count"
                >
                    {searching
                        ? t('gameList.resultCount', {
                              count: shownCount,
                              query: query.trim(),
                          })
                        : ''}
                </p>

                <div
                    className="mt-5 flex flex-wrap justify-center gap-2"
                    role="group"
                    aria-label={t('portal.filterLabel')}
                    data-testid="gamelist-filter"
                >
                    {[
                        {
                            key: 'all',
                            titleKey: 'portal.all',
                            count: matchedTotal,
                        },
                        ...matched.map((category) => ({
                            key: category.key,
                            titleKey: category.titleKey,
                            count: category.games.length,
                        })),
                    ].map((category) => {
                        const active = filter === category.key;
                        return (
                            <button
                                key={category.key}
                                type="button"
                                aria-pressed={active}
                                onClick={() => setFilter(category.key)}
                                data-testid={`gamelist-filter-${category.key}`}
                                className={cn(
                                    'inline-flex min-h-11 items-center gap-2 rounded-full border-3 border-[#1f2a44] py-1 pr-1.5 pl-4 text-sm font-black shadow-[2px_2px_0px_#1f2a44] transition-colors',
                                    active
                                        ? 'bg-[#1f2a44] text-white'
                                        : 'bg-white text-[#1f2a44] hover:bg-[#FFF176]',
                                    searching &&
                                        category.count === 0 &&
                                        !active &&
                                        'opacity-60',
                                )}
                            >
                                {t(category.titleKey)}
                                <span
                                    className={cn(
                                        'inline-flex h-6 min-w-7 items-center justify-center rounded-full px-2 text-xs font-black tabular-nums',
                                        active
                                            ? 'bg-[#FFD93D] text-[#1f2a44]'
                                            : 'border-2 border-[#1f2a44] bg-[#FFF9E6] text-[#1f2a44]',
                                    )}
                                    data-testid={`gamelist-filter-count-${category.key}`}
                                >
                                    <span className="sr-only">
                                        {t('gameList.filterCount', {
                                            count: category.count,
                                        })}
                                    </span>
                                    <span aria-hidden>{category.count}</span>
                                </span>
                            </button>
                        );
                    })}
                </div>

                <div className="mt-10 flex flex-col gap-12">
                    {shown.length === 0 && (
                        <div
                            className="mx-auto flex w-full max-w-xl flex-col items-center rounded-3xl border-3 border-dashed border-[#1f2a44] bg-white px-5 py-10 text-center"
                            data-testid="gamelist-empty"
                        >
                            <span className="flex size-14 items-center justify-center rounded-2xl border-3 border-[#1f2a44] bg-[#FFF176] text-[#1f2a44] shadow-[3px_3px_0px_#1f2a44]">
                                <SearchX className="size-7" aria-hidden />
                            </span>
                            <h2 className="mt-4 font-display text-xl font-black break-words text-[#1f2a44]">
                                {t('gameList.noResults', {
                                    query: query.trim(),
                                })}
                            </h2>
                            <p className="mt-2 text-sm font-semibold text-slate-600">
                                {t('gameList.noResultsHint')}
                            </p>
                            <button
                                type="button"
                                onClick={resetSearch}
                                className="edu-nav-btn edu-nav-btn--primary mt-5"
                                data-testid="gamelist-empty-reset"
                            >
                                {t('gameList.resetSearch')}
                            </button>
                        </div>
                    )}

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
                            {view === 'list' ? (
                                <ul
                                    className="flex flex-col gap-3"
                                    data-testid={`gamelist-rows-${category.key}`}
                                >
                                    {category.games.map((game) => {
                                        const Icon = gameIcon(game.icon);
                                        return (
                                            <li
                                                key={game.key}
                                                className="flex min-w-0 flex-col gap-3 rounded-2xl border-3 border-[#1f2a44] bg-white p-3 shadow-[3px_3px_0px_#1f2a44] sm:flex-row sm:items-center sm:gap-4 sm:p-4"
                                                data-testid={`gamelist-row-${game.key}`}
                                            >
                                                <div className="flex min-w-0 flex-1 items-center gap-3">
                                                    <div
                                                        className="flex size-11 shrink-0 items-center justify-center rounded-xl border-2 border-[#1f2a44] text-white shadow-[2px_2px_0px_#1f2a44]"
                                                        style={{
                                                            background:
                                                                game.accent,
                                                        }}
                                                    >
                                                        <Icon
                                                            className="size-6 stroke-[2.5]"
                                                            aria-hidden
                                                        />
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <h3 className="font-display text-base leading-tight font-black break-words text-[#1f2a44] sm:text-lg">
                                                            {t(game.titleKey)}
                                                        </h3>
                                                        <p className="mt-0.5 truncate text-xs font-bold text-slate-600">
                                                            {t(
                                                                category.titleKey,
                                                            )}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="flex min-w-0 flex-wrap items-center gap-1.5 sm:justify-end">
                                                    {gradeBadge(game)}
                                                    {pointsBadge(game)}
                                                    <PlayerCountBadge
                                                        minPlayers={
                                                            game.minPlayers
                                                        }
                                                        maxPlayers={
                                                            game.maxPlayers
                                                        }
                                                        className="max-w-full px-3 text-xs font-black shadow-[1.5px_1.5px_0px_#1f2a44]"
                                                        testId={`gamelist-players-${game.key}`}
                                                    />
                                                </div>
                                                <div className="shrink-0">
                                                    {playButton(game, true)}
                                                </div>
                                            </li>
                                        );
                                    })}
                                </ul>
                            ) : (
                                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                                    {category.games.map((game) => {
                                        const Icon = gameIcon(game.icon);
                                        return (
                                            <article
                                                key={game.key}
                                                className="flex min-w-0 flex-col justify-between rounded-3xl border-3 border-[#1f2a44] bg-white p-6 shadow-[5px_5px_0px_#1f2a44] transition-all hover:-translate-y-1.5 hover:shadow-[8px_8px_0px_#1f2a44]"
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
                                                        <div className="flex min-w-0 flex-wrap justify-end gap-1.5">
                                                            {gradeBadge(game)}
                                                            {pointsBadge(game)}
                                                            <PlayerCountBadge
                                                                minPlayers={
                                                                    game.minPlayers
                                                                }
                                                                maxPlayers={
                                                                    game.maxPlayers
                                                                }
                                                                className="px-3 text-xs font-black shadow-[1.5px_1.5px_0px_#1f2a44]"
                                                                testId={`gamelist-players-${game.key}`}
                                                            />
                                                        </div>
                                                    </div>

                                                    <h3 className="mt-5 font-display text-xl font-black text-[#1f2a44]">
                                                        {t(game.titleKey)}
                                                    </h3>
                                                    {game.descriptionKey && (
                                                        <p className="mt-3 text-sm leading-relaxed font-semibold text-slate-600">
                                                            {t(
                                                                game.descriptionKey,
                                                            )}
                                                        </p>
                                                    )}
                                                </div>

                                                <div className="mt-6 border-t-2 border-[#1f2a44]/10 pt-4">
                                                    {playButton(game)}
                                                </div>
                                            </article>
                                        );
                                    })}
                                </div>
                            )}
                        </section>
                    ))}

                    {filter === 'all' && !searching && (
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
