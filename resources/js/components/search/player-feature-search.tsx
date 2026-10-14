import { useTranslations } from '@/hooks/use-translations';
import { type FeatureSearchEntry, searchFeatures } from '@/lib/feature-search';
import { gameIcon } from '@/lib/games';
import { cn } from '@/lib/utils';
import english from '@/locales/en-feature-search.json';
import indonesian from '@/locales/id-feature-search.json';
import { type SharedData } from '@/types';
import { router, usePage } from '@inertiajs/react';
import {
    ArrowUpRight,
    Bell,
    BookOpenCheck,
    BrainCircuit,
    CircleUserRound,
    Compass,
    FileUp,
    Gamepad2,
    GraduationCap,
    LayoutDashboard,
    Library,
    type LucideIcon,
    MessageCircle,
    MessageSquarePlus,
    PencilLine,
    School,
    Search,
    Trophy,
    UserRound,
    Users,
    Wifi,
    X,
} from 'lucide-react';
import {
    type KeyboardEvent as ReactKeyboardEvent,
    type ReactNode,
    useEffect,
    useId,
    useMemo,
    useRef,
    useState,
} from 'react';
import { createPortal } from 'react-dom';

type FeatureKey = keyof typeof english.features;

interface PlayerEntry extends FeatureSearchEntry {
    icon: LucideIcon;
    accent?: string;
    hint?: string;
}

const MAX_RESULTS = 40;

/** Same icons as the header menu, so a result looks like where it leads. */
const PAGE_ICONS: Record<string, LucideIcon> = {
    '/dashboard': LayoutDashboard,
    '/portal': Trophy,
    '/gamelist': Gamepad2,
    '/leaderboard': Trophy,
    '/ability': BrainCircuit,
    '/character': UserRound,
    '/profile': CircleUserRound,
    '/friends': Users,
    '/chat': MessageCircle,
    '/players/online': Wifi,
    '/notifications': Bell,
    '/feedback': MessageSquarePlus,
    '/my-classrooms': GraduationCap,
    '/teacher-request': BookOpenCheck,
    '/teacher/questions': BookOpenCheck,
    '/teacher/questions/create': PencilLine,
    '/teacher/questions/import': FileUp,
    '/teacher/classrooms': School,
    '/teacher/classrooms/create': School,
    '/teacher/topics': Library,
};

/**
 * Pages, features and games a signed-in player (or teacher) can open.
 * Admin pages stay in the admin panel search.
 */
function usePlayerEntries(): PlayerEntry[] {
    const { props } = usePage<SharedData>();
    const { t, i18n } = useTranslations();
    const gameMenu = props.gameMenu;
    const isTeacher = Boolean(props.auth?.user?.is_teacher);
    const copy = i18n.language.startsWith('id') ? indonesian : english;

    return useMemo(() => {
        const entries: PlayerEntry[] = [];
        for (const [key, feature] of Object.entries(copy.features)) {
            if (feature.href.startsWith('/admin')) continue;
            if (feature.href === '/teacher-request' && isTeacher) continue;
            const en = english.features[key as FeatureKey];
            const id = indonesian.features[key as FeatureKey];
            entries.push({
                href: feature.href,
                title: feature.title,
                group: feature.teacherOnly ? copy.teacher : copy.player,
                teacherOnly: feature.teacherOnly,
                keywords: [
                    en.title,
                    id.title,
                    'keywords' in en ? en.keywords : '',
                    'keywords' in id ? id.keywords : '',
                    feature.href,
                ].join(' '),
                icon: PAGE_ICONS[feature.href] ?? Compass,
            });
        }
        for (const category of gameMenu ?? []) {
            for (const game of category.games) {
                entries.push({
                    href: game.url,
                    title: t(game.titleKey),
                    group: `${copy.games} · ${t(category.titleKey)}`,
                    hint: game.descriptionKey
                        ? t(game.descriptionKey)
                        : undefined,
                    keywords: [
                        game.key,
                        t(game.titleKey, { lng: 'id' }),
                        t(game.titleKey, { lng: 'en' }),
                        t(category.titleKey, { lng: 'id' }),
                        t(category.titleKey, { lng: 'en' }),
                        game.descriptionKey
                            ? t(game.descriptionKey, { lng: 'id' })
                            : '',
                        game.descriptionKey
                            ? t(game.descriptionKey, { lng: 'en' })
                            : '',
                        'game permainan',
                    ].join(' '),
                    icon: gameIcon(game.icon),
                    accent: game.accent,
                });
            }
        }
        return entries;
    }, [copy, gameMenu, isTeacher, t]);
}

/**
 * Header search for players and teachers: finds games, pages and features
 * (Ctrl/⌘ K). Same pick-and-go flow as the admin feature search, in the
 * player site look.
 */
export function PlayerFeatureSearch({
    className,
    children,
}: {
    className?: string;
    /** Custom trigger content (phone menu row); icon button otherwise. */
    children?: ReactNode;
}) {
    const { i18n } = useTranslations();
    const copy = i18n.language.startsWith('id') ? indonesian : english;
    const [open, setOpen] = useState(false);

    useEffect(() => {
        if (children) {
            return;
        }
        const onKey = (event: KeyboardEvent) => {
            if (
                (event.ctrlKey || event.metaKey) &&
                event.key.toLowerCase() === 'k'
            ) {
                event.preventDefault();
                setOpen((value) => !value);
            }
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [children]);

    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                className={className ?? 'edu-nav-btn edu-nav-btn--icon'}
                aria-label={children ? undefined : copy.playerTitle}
                data-tip={children ? undefined : `${copy.playerTitle} (Ctrl K)`}
                aria-haspopup="dialog"
                data-testid={
                    children ? 'nav-more-feature-search' : 'nav-feature-search'
                }
            >
                {children ?? <Search aria-hidden="true" />}
            </button>
            {open && <SearchDialog onClose={() => setOpen(false)} />}
        </>
    );
}

function SearchDialog({ onClose }: { onClose: () => void }) {
    const { props } = usePage<SharedData>();
    const { i18n } = useTranslations();
    const copy = i18n.language.startsWith('id') ? indonesian : english;
    const entries = usePlayerEntries();
    const [query, setQuery] = useState('');
    const [active, setActive] = useState(0);
    const titleId = useId();
    const listId = useId();
    const listRef = useRef<HTMLUListElement | null>(null);

    const results = useMemo(
        () =>
            searchFeatures(entries, query, {
                superadmin: false,
                teacher: Boolean(props.auth?.user?.is_teacher),
            }).slice(0, MAX_RESULTS) as PlayerEntry[],
        [entries, query, props.auth?.user?.is_teacher],
    );
    const groups = [...new Set(results.map((entry) => entry.group))];
    const current = Math.min(active, Math.max(results.length - 1, 0));

    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onClose();
            }
        };
        document.addEventListener('keydown', onKey);
        const unsubscribe = router.on('navigate', onClose);
        const { overflow } = document.body.style;
        document.body.style.overflow = 'hidden';
        return () => {
            document.removeEventListener('keydown', onKey);
            unsubscribe();
            document.body.style.overflow = overflow;
        };
    }, [onClose]);

    useEffect(() => {
        listRef.current
            ?.querySelector<HTMLElement>(`[data-index="${current}"]`)
            ?.scrollIntoView({ block: 'nearest' });
    }, [current]);

    const go = (entry: PlayerEntry | undefined) => {
        if (!entry) return;
        onClose();
        router.visit(entry.href);
    };

    const onInputKey = (event: ReactKeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            setActive((value) =>
                results.length ? (value + 1) % results.length : 0,
            );
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActive((value) =>
                results.length
                    ? (value - 1 + results.length) % results.length
                    : 0,
            );
        } else if (event.key === 'Enter') {
            event.preventDefault();
            go(results[current]);
        }
    };

    if (typeof document === 'undefined') {
        return null;
    }

    return createPortal(
        <div
            className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-black/60 p-3 pt-[8vh] backdrop-blur-sm sm:p-4 sm:pt-[10vh]"
            onPointerDown={(event) => {
                if (event.target === event.currentTarget) {
                    onClose();
                }
            }}
            data-testid="feature-search-dialog"
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                className="relative flex max-h-[84dvh] w-full max-w-xl animate-in flex-col gap-3 rounded-3xl border-4 border-[#1f2a44] bg-[#FFF9E6] p-4 text-[#1f2a44] shadow-[8px_8px_0px_#1f2a44] duration-200 zoom-in-95 sm:p-5"
            >
                <button
                    type="button"
                    onClick={onClose}
                    className="absolute top-3 right-3 inline-flex size-11 items-center justify-center rounded-full border-2 border-[#1f2a44] bg-white hover:bg-[#FFF176] focus-visible:ring-2 focus-visible:ring-[#1f2a44] focus-visible:outline-none"
                    aria-label={copy.close}
                    data-testid="feature-search-close"
                >
                    <X className="size-5" aria-hidden />
                </button>
                <div className="flex items-center gap-3 pr-12">
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl border-3 border-[#1f2a44] bg-[#FFD93D] shadow-[3px_3px_0px_#1f2a44]">
                        <Search className="size-5" aria-hidden />
                    </span>
                    <div className="min-w-0">
                        <h2
                            id={titleId}
                            className="font-display text-lg font-black sm:text-xl"
                        >
                            {copy.playerTitle}
                        </h2>
                        <p className="text-xs font-bold text-slate-600 sm:text-sm">
                            {copy.playerDescription}
                        </p>
                    </div>
                </div>
                <label className="relative block">
                    <span className="sr-only">{copy.playerTitle}</span>
                    <Search
                        className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-slate-500"
                        aria-hidden
                    />
                    <input
                        type="search"
                        value={query}
                        onChange={(event) => {
                            setQuery(event.target.value);
                            setActive(0);
                        }}
                        onKeyDown={onInputKey}
                        placeholder={copy.playerPlaceholder}
                        autoFocus
                        role="combobox"
                        aria-expanded="true"
                        aria-controls={listId}
                        aria-activedescendant={
                            results[current]
                                ? `${listId}-${current}`
                                : undefined
                        }
                        autoComplete="off"
                        className="h-12 w-full rounded-2xl border-3 border-[#1f2a44] bg-white !pr-3 !pl-11 text-base font-bold text-[#1f2a44] placeholder:font-semibold placeholder:text-slate-500 focus-visible:ring-2 focus-visible:ring-[#1f2a44] focus-visible:outline-none"
                        data-testid="feature-search-input"
                    />
                </label>
                <ul
                    id={listId}
                    ref={listRef}
                    role="listbox"
                    aria-label={copy.results}
                    className="-mx-1 flex min-h-0 [scrollbar-gutter:stable] flex-col gap-1 overflow-y-auto overscroll-contain pr-2 pb-2 pl-1"
                    data-testid="feature-search-results"
                >
                    {results.length === 0 && (
                        <li
                            className="rounded-2xl border-2 border-dashed border-[#1f2a44]/40 px-4 py-6 text-center text-sm font-bold text-slate-600"
                            data-testid="feature-search-empty"
                        >
                            {copy.playerEmpty}
                        </li>
                    )}
                    {groups.map((group) => (
                        <li key={group} role="presentation">
                            <p className="px-1 pt-2 pb-1 text-[11px] font-black tracking-wide text-slate-700 uppercase">
                                {group}
                            </p>
                            <ul role="group" className="flex flex-col gap-1">
                                {results.map((entry, index) =>
                                    entry.group !== group ? null : (
                                        <ResultRow
                                            key={entry.href}
                                            id={`${listId}-${index}`}
                                            index={index}
                                            entry={entry}
                                            selected={index === current}
                                            onHover={() => setActive(index)}
                                            onPick={() => go(entry)}
                                        />
                                    ),
                                )}
                            </ul>
                        </li>
                    ))}
                </ul>
                <p className="hidden border-t-2 border-[#1f2a44]/15 pt-2 text-xs font-bold text-slate-600 sm:block">
                    {copy.hint}
                </p>
            </div>
        </div>,
        document.body,
    );
}

function ResultRow({
    id,
    index,
    entry,
    selected,
    onHover,
    onPick,
}: {
    id: string;
    index: number;
    entry: PlayerEntry;
    selected: boolean;
    onHover: () => void;
    onPick: () => void;
}) {
    const Icon = entry.icon;
    return (
        <li
            id={id}
            role="option"
            aria-selected={selected}
            data-index={index}
            onPointerMove={onHover}
            onClick={onPick}
            className={cn(
                'flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl border-2 px-2.5 py-2',
                selected
                    ? 'border-[#1f2a44] bg-[#FFD93D] shadow-[2px_2px_0px_#1f2a44]'
                    : 'border-transparent hover:bg-[#ffefc2]',
            )}
            data-testid="feature-search-result"
            data-href={entry.href}
        >
            <span
                className="flex size-10 shrink-0 items-center justify-center rounded-xl border-2 border-[#1f2a44] bg-white"
                style={entry.accent ? { background: entry.accent } : undefined}
            >
                <Icon className="size-5 text-[#1f2a44]" aria-hidden />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-sm leading-snug font-black break-words">
                    {entry.title}
                </span>
                {entry.hint && (
                    <span className="line-clamp-2 text-xs font-semibold text-slate-700">
                        {entry.hint}
                    </span>
                )}
            </span>
            <ArrowUpRight className="size-4 shrink-0" aria-hidden />
        </li>
    );
}
