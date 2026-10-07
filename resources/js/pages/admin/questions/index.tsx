import { AiBadge } from '@/components/admin/admin-kit';
import {
    BAND_LABELS,
    EmptyState,
    fieldClass,
    formatNumber,
    formatPercent,
    gameLabel,
    rateTone,
    useSubjectLabel,
} from '@/components/admin/game-stats';
import {
    type Generation,
    GenerationRow,
    useGenerationPolling,
} from '@/components/admin/generation-progress';
import AdminLayout from '@/layouts/admin-layout';
import { tr } from '@/lib/admin-i18n';
import { cn } from '@/lib/utils';
import { type PaginatedData } from '@/types/admin';
import { Head, Link, router } from '@inertiajs/react';
import {
    ArrowLeft,
    ArrowUpRight,
    Atom,
    BookOpen,
    Calculator,
    ChartNoAxesColumn,
    Check,
    ChevronLeft,
    ChevronRight,
    CircleCheck,
    Coins,
    Gamepad2,
    GraduationCap,
    Landmark,
    Languages,
    Layers,
    ListChecks,
    Loader2,
    Pencil,
    Plus,
    Power,
    PowerOff,
    RotateCcw,
    Scale,
    School,
    Search,
    Settings2,
    ShieldCheck,
    Sparkles,
    Trash2,
    X,
} from 'lucide-react';
import {
    type ReactNode,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';

type BulkAction = 'activate' | 'deactivate' | 'delete';

interface QuestionRow {
    id: number;
    key: string;
    type: 'choice' | 'true_false';
    band: number;
    subject: string;
    prompt_id: string;
    prompt_en: string | null;
    options: { id: string; en?: string }[] | null;
    answer: number;
    games: string[];
    is_active: boolean;
    times_answered: number;
    times_correct: number;
    success_rate: number | null;
    source: string;
    points: number | null;
    author: string | null;
}

interface SubjectStat {
    subject: string;
    total: number;
    active: number;
    answered: number;
    success_rate: number | null;
    bands: Record<string, number>;
}

interface Filters {
    search?: string;
    game?: string;
    band?: string;
    subject?: string;
    type?: string;
    status?: string;
    sort?: string;
    source?: string;
    bonus?: string;
    author?: string;
}

type CreatorFilter = 'ai' | 'teacher' | 'admin' | 'system';

type SourceCounts = Record<'all' | CreatorFilter, number>;

const CREATOR_FILTERS: {
    value: CreatorFilter | undefined;
    label: string;
    icon: React.ElementType;
}[] = [
    { value: undefined, label: 'All', icon: Layers },
    { value: 'ai', label: 'AI', icon: Sparkles },
    { value: 'teacher', label: 'Teacher', icon: School },
    { value: 'admin', label: 'Admin', icon: ShieldCheck },
    { value: 'system', label: 'System', icon: Settings2 },
];

const LIST_TITLES: Record<CreatorFilter, string> = {
    ai: 'AI-created questions',
    teacher: 'Teacher-created questions',
    admin: 'Admin-created questions',
    system: 'System questions',
};

interface QuestionsProps {
    mode: 'subjects' | 'list';
    subjectStats: SubjectStat[];
    questions: PaginatedData<QuestionRow> | null;
    sourceCounts: SourceCounts | null;
    teachers: { id: number; name: string }[];
    filters: Filters;
    liveGenerations?: Generation[];
    summary: {
        total: number;
        active: number;
        ai: number;
        ai_pending: number;
        teacher: number;
        bonus: number;
        byGame: Record<string, number>;
    };
    games: string[];
    subjects: string[];
    types: string[];
    bands: { value: number; min: number; max: number }[];
}

const SUBJECT_STYLE: Record<
    string,
    { icon: React.ElementType; color: string }
> = {
    math: { icon: Calculator, color: 'bg-bubble-blue' },
    science: { icon: Atom, color: 'bg-bubble-green' },
    language: { icon: BookOpen, color: 'bg-bubble-orange' },
    social: { icon: Landmark, color: 'bg-bubble-purple' },
    english: { icon: Languages, color: 'bg-bubble-pink' },
    civics: { icon: Scale, color: 'bg-bubble-ink' },
};

/** Grade badge colours per band so the grade is readable at a glance. */
const BAND_TONE: Record<number, string> = {
    0: 'bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300',
    1: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
    2: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
    3: 'bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-300',
};

const BAND_LEVEL: Record<number, string> = {
    0: 'SD',
    1: 'SD',
    2: 'SMP',
    3: 'SMA',
};

function correctAnswer(question: QuestionRow): string {
    if (question.type === 'true_false')
        return question.answer === 1 ? tr('True') : tr('False');
    return question.options?.[question.answer]?.id ?? '—';
}

export default function QuestionsIndex(props: QuestionsProps) {
    return (
        <>
            <Head title={tr('Question Bank')} />
            <LiveGenerations generations={props.liveGenerations ?? []} />
            {props.mode === 'subjects' ? (
                <SubjectOverview {...props} />
            ) : (
                <QuestionList {...props} />
            )}
        </>
    );
}

function SubjectOverview({
    subjectStats,
    summary,
    games,
    bands,
}: QuestionsProps) {
    const subjectLabel = useSubjectLabel();
    const [search, setSearch] = useState('');

    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div className="flex flex-col gap-1">
                    <h2 className="font-display text-2xl font-bold text-foreground">
                        {tr('Question Bank')}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                        {formatNumber(summary.total)} {tr('questions ·')}{' '}
                        {formatNumber(summary.active)} {tr('active ·')}{' '}
                        {games
                            .map(
                                (game) =>
                                    `${gameLabel(game)} ${summary.byGame[game] ?? 0}`,
                            )
                            .join(' · ')}
                        {tr('. Choose a subject to manage its questions.')}
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <form
                        onSubmit={(event) => {
                            event.preventDefault();
                            if (search.trim()) {
                                router.get('/admin/questions', {
                                    search: search.trim(),
                                });
                            }
                        }}
                        className="relative"
                    >
                        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                        <input
                            type="search"
                            aria-label={tr('Search all questions')}
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder={tr('Search all questions…')}
                            className={cn(fieldClass, 'w-64 pl-9')}
                        />
                    </form>
                    <Link
                        href="/admin/questions/generate"
                        className="inline-flex items-center gap-2 rounded-lg border border-violet-300 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-700 hover:bg-violet-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-300 dark:hover:bg-violet-950/70"
                        data-testid="questions-generate"
                    >
                        <Sparkles className="size-4" />
                        {tr('Generate with AI')}
                    </Link>
                    <Link
                        href="/admin/questions/create"
                        className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                        <Plus className="size-4" />
                        {tr('Add question')}
                    </Link>
                </div>
            </div>

            {(summary.ai > 0 || summary.teacher > 0 || summary.bonus > 0) && (
                <div className="flex flex-wrap gap-2 text-sm">
                    {summary.ai > 0 && (
                        <Link
                            href="/admin/questions?source=ai"
                            className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 hover:bg-accent"
                            data-testid="questions-ai-link"
                        >
                            <AiBadge />
                            {formatNumber(summary.ai)} {tr('AI-created')}
                            {summary.ai_pending > 0 && (
                                <span className="text-xs text-amber-700 dark:text-amber-300">
                                    · {formatNumber(summary.ai_pending)}{' '}
                                    {tr('waiting for review')}
                                </span>
                            )}
                        </Link>
                    )}
                    {summary.teacher > 0 && (
                        <Link
                            href="/admin/questions?source=teacher"
                            className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 hover:bg-accent"
                            data-testid="questions-teacher-link"
                        >
                            <SourceBadge source="teacher" />
                            {formatNumber(summary.teacher)}{' '}
                            {tr('Teacher-created')}
                        </Link>
                    )}
                    {summary.bonus > 0 && (
                        <Link
                            href="/admin/questions?bonus=1"
                            className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 hover:bg-accent"
                        >
                            <Coins className="size-4 text-amber-500" />
                            {formatNumber(summary.bonus)}{' '}
                            {tr('bonus questions')}
                        </Link>
                    )}
                </div>
            )}

            <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {subjectStats.map((stat) => {
                    const style = SUBJECT_STYLE[stat.subject] ?? {
                        icon: ListChecks,
                        color: 'bg-bubble-blue',
                    };
                    const Icon = style.icon;
                    const maxBand = Math.max(1, ...Object.values(stat.bands));

                    return (
                        <li key={stat.subject}>
                            <Link
                                href={`/admin/questions?subject=${stat.subject}`}
                                className="group flex h-full flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                                data-testid={`subject-${stat.subject}`}
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex min-w-0 items-center gap-3">
                                        <span
                                            className={cn(
                                                'flex size-11 shrink-0 items-center justify-center rounded-xl text-white shadow-sm',
                                                style.color,
                                            )}
                                        >
                                            <Icon className="size-5" />
                                        </span>
                                        <div className="flex min-w-0 flex-col">
                                            <span className="truncate font-semibold text-foreground">
                                                {subjectLabel(stat.subject)}
                                            </span>
                                            <span className="text-xs text-muted-foreground">
                                                {stat.total} {tr('questions ·')}{' '}
                                                {stat.active} {tr('active')}
                                            </span>
                                        </div>
                                    </div>
                                    <ArrowUpRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                                </div>

                                <div className="flex flex-col gap-2">
                                    <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                                        <GraduationCap className="size-3.5" />
                                        {tr('Questions per grade')}
                                    </span>
                                    <ul className="flex flex-col gap-1.5">
                                        {bands.map((band) => {
                                            const count =
                                                stat.bands[band.value] ?? 0;
                                            return (
                                                <li
                                                    key={band.value}
                                                    className="grid grid-cols-[6.5rem_1fr_2rem] items-center gap-2 text-xs"
                                                >
                                                    <span className="text-foreground">
                                                        {tr(
                                                            BAND_LABELS[
                                                                band.value
                                                            ],
                                                        )}
                                                    </span>
                                                    <span className="h-2 overflow-hidden rounded-full bg-muted">
                                                        <span
                                                            className="block h-full rounded-full bg-primary"
                                                            style={{
                                                                width: `${(count / maxBand) * 100}%`,
                                                            }}
                                                        />
                                                    </span>
                                                    <span className="text-right text-foreground tabular-nums">
                                                        {count}
                                                    </span>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                </div>

                                <div className="mt-auto flex items-center justify-between border-t border-border pt-3 text-xs text-muted-foreground">
                                    <span>
                                        {formatNumber(stat.answered)}{' '}
                                        {tr('answers recorded')}
                                    </span>
                                    <span>
                                        {tr('Correct:')}{' '}
                                        <span
                                            className={cn(
                                                'font-semibold',
                                                rateTone(stat.success_rate),
                                            )}
                                        >
                                            {formatPercent(stat.success_rate)}
                                        </span>
                                    </span>
                                </div>
                            </Link>
                        </li>
                    );
                })}
            </ul>

            <Link
                href="/admin/questions?subject=all"
                className="inline-flex w-fit items-center gap-1.5 link text-sm"
            >
                <Layers className="size-4" />
                {tr('View all questions in one list')}
            </Link>
        </div>
    );
}

function QuestionList({
    questions,
    filters,
    games,
    subjects,
    bands,
    subjectStats,
    sourceCounts,
    teachers,
}: QuestionsProps) {
    const subjectLabel = useSubjectLabel();
    const [search, setSearch] = useState(filters.search ?? '');
    const [deleteTarget, setDeleteTarget] = useState<QuestionRow | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [selected, setSelected] = useState<Set<number>>(() => new Set());
    const [bulkConfirm, setBulkConfirm] = useState(false);
    const [bulkBusy, setBulkBusy] = useState<BulkAction | null>(null);
    const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
    const firstRender = useRef(true);
    const subject =
        filters.subject && filters.subject !== 'all' ? filters.subject : null;
    const stat = subjectStats.find((row) => row.subject === subject);
    const visibleIds = useMemo(
        () => questions?.data.map((question) => question.id) ?? [],
        [questions],
    );
    const selectedVisible = visibleIds.filter((id) => selected.has(id));
    const allSelected =
        visibleIds.length > 0 && selectedVisible.length === visibleIds.length;

    const toggleOne = (id: number) =>
        setSelected((current) => {
            const next = new Set(current);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    const toggleAll = () =>
        setSelected(allSelected ? new Set() : new Set(visibleIds));
    const runBulk = (action: BulkAction) => {
        if (selectedVisible.length === 0) return;
        setBulkBusy(action);
        router.post(
            '/admin/questions/bulk',
            { action, ids: selectedVisible },
            {
                preserveScroll: true,
                onSuccess: () => setSelected(new Set()),
                onFinish: () => {
                    setBulkBusy(null);
                    setBulkConfirm(false);
                },
            },
        );
    };

    const apply = (changes: Filters) => {
        const query = Object.fromEntries(
            Object.entries({ ...filters, ...changes }).filter(
                ([, value]) => value !== undefined && value !== '',
            ),
        );
        router.get('/admin/questions', query, {
            preserveScroll: true,
            preserveState: true,
        });
    };

    useEffect(() => {
        if (firstRender.current) {
            firstRender.current = false;
            return;
        }
        if (debounce.current) clearTimeout(debounce.current);
        debounce.current = setTimeout(
            () => apply({ search: search.trim() || undefined }),
            400,
        );
        return () => {
            if (debounce.current) clearTimeout(debounce.current);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search]);

    if (!questions) return null;

    const narrowed = Boolean(
        filters.search ||
        filters.game ||
        filters.band ||
        filters.type ||
        filters.status ||
        filters.source ||
        filters.bonus ||
        filters.sort,
    );
    const prev = questions.links.find((link) =>
        link.label.includes('Previous'),
    );
    const next = questions.links.find((link) => link.label.includes('Next'));
    const title = subject
        ? subjectLabel(subject)
        : filters.subject === 'all'
          ? 'All subjects'
          : filters.source && !filters.search
            ? (LIST_TITLES[filters.source as CreatorFilter] ?? 'Search results')
            : filters.bonus && !filters.search
              ? 'Bonus questions'
              : 'Search results';

    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div className="flex flex-col gap-2">
                    <Link
                        href="/admin/questions"
                        className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
                    >
                        <ArrowLeft className="size-4" />
                        {tr('All subjects')}
                    </Link>
                    <h2 className="font-display text-2xl font-bold text-foreground">
                        {tr(title)}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                        {formatNumber(questions.total)} {tr('questions')}
                        {stat ? tr(' · {0} active', [stat.active]) : ''}
                        {tr(
                            '. Changes reach running games within about a minute.',
                        )}
                    </p>
                </div>
                <Link
                    href={
                        subject
                            ? `/admin/questions/create?subject=${subject}`
                            : '/admin/questions/create'
                    }
                    className="inline-flex w-fit items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                    <Plus className="size-4" />
                    {tr('Add question')}
                </Link>
            </div>

            <div
                className="flex flex-wrap items-center gap-2"
                role="group"
                aria-label={tr('Filter by grade')}
            >
                <GradeTab
                    active={!filters.band}
                    onClick={() => apply({ band: undefined })}
                >
                    {tr('All grades')}
                    {stat && <Count>{stat.total}</Count>}
                </GradeTab>
                {bands.map((band) => (
                    <GradeTab
                        key={band.value}
                        active={filters.band === String(band.value)}
                        onClick={() => apply({ band: String(band.value) })}
                    >
                        {tr(BAND_LABELS[band.value])}
                        {stat && <Count>{stat.bands[band.value] ?? 0}</Count>}
                    </GradeTab>
                ))}
            </div>

            {sourceCounts && (
                <div className="flex min-w-0 flex-col gap-1.5">
                    <span
                        id="questions-creator-label"
                        className="text-xs font-medium text-muted-foreground"
                    >
                        {tr('Created by')}
                    </span>
                    <div
                        className="-mx-1 flex min-w-0 [scrollbar-width:thin] gap-1.5 overflow-x-auto px-1 pb-1 sm:flex-wrap sm:overflow-visible"
                        role="group"
                        aria-labelledby="questions-creator-label"
                        data-testid="questions-source-filter"
                    >
                        {CREATOR_FILTERS.map((option) => {
                            const active =
                                (filters.source ?? undefined) === option.value;
                            const Icon = option.icon;
                            return (
                                <button
                                    key={option.label}
                                    type="button"
                                    aria-pressed={active}
                                    onClick={() =>
                                        apply({
                                            source: option.value,
                                            author: undefined,
                                        })
                                    }
                                    data-testid={`questions-source-${option.value ?? 'all'}`}
                                    className={cn(
                                        'inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-sm font-medium whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                                        active
                                            ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                                            : 'border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground',
                                    )}
                                >
                                    <Icon className="size-4" />
                                    {tr(option.label)}
                                    <Count>
                                        {formatNumber(
                                            sourceCounts[option.value ?? 'all'],
                                        )}
                                    </Count>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card p-3 shadow-sm">
                <div className="relative min-w-56 flex-1">
                    <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                        type="search"
                        aria-label={tr('Search questions')}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder={tr('Search question text or key…')}
                        className={cn(fieldClass, 'w-full pl-9')}
                    />
                </div>
                <select
                    aria-label={tr('Subject')}
                    value={filters.subject ?? 'all'}
                    onChange={(e) =>
                        apply({ subject: e.target.value, band: undefined })
                    }
                    className={fieldClass}
                >
                    <option value="all">{tr('All subjects')}</option>
                    {subjects.map((value) => (
                        <option key={value} value={value}>
                            {subjectLabel(value)}
                        </option>
                    ))}
                </select>
                <select
                    aria-label={tr('Game')}
                    value={filters.game ?? ''}
                    onChange={(e) =>
                        apply({ game: e.target.value || undefined })
                    }
                    className={fieldClass}
                >
                    <option value="">{tr('All games')}</option>
                    {games.map((game) => (
                        <option key={game} value={game}>
                            {gameLabel(game)}
                        </option>
                    ))}
                </select>
                <select
                    aria-label={tr('Type')}
                    value={filters.type ?? ''}
                    onChange={(e) =>
                        apply({ type: e.target.value || undefined })
                    }
                    className={fieldClass}
                >
                    <option value="">{tr('All types')}</option>
                    <option value="choice">{tr('Multiple choice')}</option>
                    <option value="true_false">{tr('True / false')}</option>
                </select>
                <select
                    aria-label={tr('Status')}
                    value={filters.status ?? ''}
                    onChange={(e) =>
                        apply({ status: e.target.value || undefined })
                    }
                    className={fieldClass}
                >
                    <option value="">{tr('Any status')}</option>
                    <option value="active">{tr('Active')}</option>
                    <option value="inactive">{tr('Inactive')}</option>
                    <option value="played">{tr('Played in quizzes')}</option>
                    <option value="unplayed">{tr('Not played yet')}</option>
                </select>
                {filters.source === 'teacher' && teachers.length > 0 && (
                    <select
                        aria-label={tr('Teacher')}
                        value={filters.author ?? ''}
                        onChange={(e) =>
                            apply({ author: e.target.value || undefined })
                        }
                        className={cn(fieldClass, 'max-w-full min-w-0')}
                        data-testid="questions-author-filter"
                    >
                        <option value="">{tr('All teachers')}</option>
                        {teachers.map((teacher) => (
                            <option key={teacher.id} value={teacher.id}>
                                {teacher.name}
                            </option>
                        ))}
                    </select>
                )}
                <select
                    aria-label={tr('Bonus')}
                    value={filters.bonus ?? ''}
                    onChange={(e) =>
                        apply({ bonus: e.target.value || undefined })
                    }
                    className={fieldClass}
                    data-testid="questions-bonus-filter"
                >
                    <option value="">{tr('Any points')}</option>
                    <option value="1">{tr('Bonus questions')}</option>
                </select>
                <select
                    aria-label={tr('Sort')}
                    value={filters.sort ?? ''}
                    onChange={(e) =>
                        apply({ sort: e.target.value || undefined })
                    }
                    className={fieldClass}
                >
                    <option value="">{tr('Sort by grade')}</option>
                    <option value="hardest">{tr('Hardest first')}</option>
                    <option value="most_answered">{tr('Most answered')}</option>
                </select>
                {narrowed && (
                    <button
                        type="button"
                        onClick={() => {
                            setSearch('');
                            router.get(
                                '/admin/questions',
                                { subject: filters.subject ?? 'all' },
                                { preserveScroll: true },
                            );
                        }}
                        className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                        <RotateCcw className="size-4" />
                        {tr('Reset')}
                    </button>
                )}
            </div>

            <div className="rounded-2xl border border-border bg-card shadow-sm">
                {questions.data.length > 0 && (
                    <div
                        className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-t-2xl border-b border-border bg-card/95 px-4 py-2.5 backdrop-blur"
                        data-testid="questions-bulk-bar"
                    >
                        <label className="inline-flex min-h-9 cursor-pointer items-center gap-2.5 text-sm font-medium text-foreground">
                            <input
                                type="checkbox"
                                checked={allSelected}
                                ref={(element) => {
                                    if (element) {
                                        element.indeterminate =
                                            selectedVisible.length > 0 &&
                                            !allSelected;
                                    }
                                }}
                                onChange={toggleAll}
                                className="size-4 rounded border-border accent-primary"
                                aria-label={tr(
                                    'Select all questions on this page',
                                )}
                                data-testid="questions-select-all"
                            />
                            {selectedVisible.length > 0
                                ? tr('{0} selected', [
                                      formatNumber(selectedVisible.length),
                                  ])
                                : tr('Select all ({0})', [
                                      formatNumber(visibleIds.length),
                                  ])}
                        </label>
                        <div className="ml-auto flex flex-wrap items-center gap-2">
                            <BulkButton
                                icon={Power}
                                label={tr('Activate')}
                                tone="success"
                                busy={bulkBusy === 'activate'}
                                disabled={
                                    selectedVisible.length === 0 ||
                                    bulkBusy !== null
                                }
                                onClick={() => runBulk('activate')}
                                testId="questions-bulk-activate"
                            />
                            <BulkButton
                                icon={PowerOff}
                                label={tr('Deactivate')}
                                busy={bulkBusy === 'deactivate'}
                                disabled={
                                    selectedVisible.length === 0 ||
                                    bulkBusy !== null
                                }
                                onClick={() => runBulk('deactivate')}
                                testId="questions-bulk-deactivate"
                            />
                            <BulkButton
                                icon={Trash2}
                                label={tr('Delete')}
                                tone="danger"
                                disabled={
                                    selectedVisible.length === 0 ||
                                    bulkBusy !== null
                                }
                                onClick={() => setBulkConfirm(true)}
                                testId="questions-bulk-delete"
                            />
                        </div>
                    </div>
                )}
                {questions.data.length === 0 ? (
                    <EmptyState
                        icon={ListChecks}
                        title={tr('No questions found')}
                        description={tr(
                            'Adjust the filters or add a new question.',
                        )}
                    />
                ) : (
                    <ul className="divide-y divide-border">
                        {questions.data.map((question) => (
                            <li
                                key={question.id}
                                className={cn(
                                    'flex gap-3 p-4 sm:gap-4',
                                    !question.is_active && 'opacity-60',
                                    selected.has(question.id) &&
                                        'bg-primary/5 opacity-100',
                                )}
                            >
                                <input
                                    type="checkbox"
                                    checked={selected.has(question.id)}
                                    onChange={() => toggleOne(question.id)}
                                    className="mt-1 size-4 shrink-0 rounded border-border accent-primary"
                                    aria-label={tr('Select question {0}', [
                                        question.key,
                                    ])}
                                    data-testid="question-select"
                                />
                                <div
                                    className={cn(
                                        'flex w-16 shrink-0 flex-col items-center justify-center rounded-xl px-1.5 py-2 text-center sm:w-20 sm:px-2',
                                        BAND_TONE[question.band],
                                    )}
                                    data-testid="question-grade"
                                >
                                    <span className="text-[10px] font-semibold tracking-wider uppercase opacity-80">
                                        {tr(BAND_LEVEL[question.band])}
                                    </span>
                                    <span className="text-sm leading-tight font-bold">
                                        {tr('Grade')}
                                    </span>
                                    <span className="text-base leading-tight font-bold tabular-nums">
                                        {bands[question.band]
                                            ? `${bands[question.band].min}–${bands[question.band].max}`
                                            : '—'}
                                    </span>
                                </div>
                                <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                    <div className="flex min-w-0 flex-col gap-1.5">
                                        <Link
                                            href={`/admin/questions/${question.id}`}
                                            className="font-medium text-foreground hover:text-primary hover:underline"
                                        >
                                            {question.prompt_id}
                                        </Link>
                                        <p className="text-xs text-muted-foreground">
                                            {tr('Answer:')}{' '}
                                            <span className="font-medium text-foreground">
                                                {correctAnswer(question)}
                                            </span>
                                        </p>
                                        <div className="flex flex-wrap items-center gap-1.5 text-xs">
                                            <SourceBadge
                                                source={question.source}
                                                author={question.author}
                                            />
                                            {(question.points ?? 0) > 0 && (
                                                <Badge tone="amber">
                                                    {tr('Bonus +')}
                                                    {question.points}
                                                </Badge>
                                            )}
                                            {!subject && (
                                                <Badge>
                                                    {subjectLabel(
                                                        question.subject,
                                                    )}
                                                </Badge>
                                            )}
                                            <Badge>
                                                {question.type === 'choice'
                                                    ? tr('Multiple choice')
                                                    : tr('True / false')}
                                            </Badge>
                                            {question.games.map((game) => (
                                                <Badge
                                                    key={game}
                                                    tone="primary"
                                                >
                                                    {gameLabel(game)}
                                                </Badge>
                                            ))}
                                            {question.times_answered > 0 ? (
                                                <span
                                                    className="inline-flex items-center overflow-hidden rounded-full border border-sky-200 font-medium dark:border-sky-900"
                                                    data-testid="question-played-badge"
                                                    title={tr(
                                                        'Shown in quizzes and answered {0} times',
                                                        [
                                                            formatNumber(
                                                                question.times_answered,
                                                            ),
                                                        ],
                                                    )}
                                                >
                                                    <span className="inline-flex items-center gap-1 bg-sky-50 px-2 py-0.5 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300">
                                                        <Gamepad2
                                                            className="size-3"
                                                            aria-hidden
                                                        />
                                                        {tr('Played')}
                                                    </span>
                                                    <span
                                                        className="inline-flex items-center gap-0.5 bg-emerald-50 px-1.5 py-0.5 text-emerald-700 tabular-nums dark:bg-emerald-950/40 dark:text-emerald-300"
                                                        data-testid="question-correct-count"
                                                    >
                                                        <Check
                                                            className="size-3"
                                                            aria-hidden
                                                        />
                                                        {formatNumber(
                                                            question.times_correct,
                                                        )}
                                                        <span className="sr-only">
                                                            {tr('correct')}
                                                        </span>
                                                    </span>
                                                    <span
                                                        className={cn(
                                                            'inline-flex items-center gap-0.5 px-1.5 py-0.5 tabular-nums',
                                                            question.times_answered >
                                                                question.times_correct
                                                                ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'
                                                                : 'bg-muted text-muted-foreground',
                                                        )}
                                                        data-testid="question-wrong-count"
                                                    >
                                                        <X
                                                            className="size-3"
                                                            aria-hidden
                                                        />
                                                        {formatNumber(
                                                            question.times_answered -
                                                                question.times_correct,
                                                        )}
                                                        <span className="sr-only">
                                                            {tr('wrong')}
                                                        </span>
                                                    </span>
                                                </span>
                                            ) : (
                                                <Badge tone="muted">
                                                    <span data-testid="question-unplayed-badge">
                                                        {tr('Not played yet')}
                                                    </span>
                                                </Badge>
                                            )}
                                            {question.is_active ? (
                                                <Badge tone="success">
                                                    <span
                                                        className="inline-flex items-center gap-1"
                                                        data-testid="question-active-badge"
                                                    >
                                                        <CircleCheck
                                                            className="size-3"
                                                            aria-hidden
                                                        />
                                                        {tr('Active')}
                                                    </span>
                                                </Badge>
                                            ) : (
                                                <Badge tone="muted">
                                                    {tr('Inactive')}
                                                </Badge>
                                            )}
                                            <span className="font-mono text-muted-foreground">
                                                {question.key}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 sm:shrink-0 sm:justify-start">
                                        <div className="flex flex-col items-end text-xs">
                                            <span
                                                className={cn(
                                                    'text-sm font-semibold tabular-nums',
                                                    rateTone(
                                                        question.success_rate,
                                                    ),
                                                )}
                                            >
                                                {formatPercent(
                                                    question.success_rate,
                                                )}
                                            </span>
                                            <span className="text-muted-foreground">
                                                {formatNumber(
                                                    question.times_answered,
                                                )}{' '}
                                                {tr('answers')}
                                            </span>
                                        </div>
                                        <div className="flex flex-wrap items-center gap-1">
                                            <IconButton
                                                label={tr('Statistics')}
                                                href={`/admin/questions/${question.id}`}
                                                icon={ChartNoAxesColumn}
                                            />
                                            <IconButton
                                                label={tr('Edit')}
                                                href={`/admin/questions/${question.id}/edit`}
                                                icon={Pencil}
                                            />
                                            <IconButton
                                                label={
                                                    question.is_active
                                                        ? tr('Deactivate')
                                                        : tr('Activate')
                                                }
                                                icon={Power}
                                                onClick={() =>
                                                    router.patch(
                                                        `/admin/questions/${question.id}/toggle`,
                                                        {},
                                                        {
                                                            preserveScroll: true,
                                                        },
                                                    )
                                                }
                                                className={
                                                    question.is_active
                                                        ? 'text-green-600 dark:text-green-400'
                                                        : undefined
                                                }
                                            />
                                            <IconButton
                                                label={tr('Delete')}
                                                icon={Trash2}
                                                onClick={() =>
                                                    setDeleteTarget(question)
                                                }
                                                className="hover:text-destructive"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            {questions.total > 0 && questions.last_page > 1 && (
                <div className="flex items-center justify-between gap-4 text-sm text-muted-foreground">
                    <span>
                        {tr('Showing')} {questions.from}–{questions.to}{' '}
                        {tr('of')} {questions.total}
                    </span>
                    <div className="flex flex-wrap items-center gap-1">
                        <PageLink
                            href={prev?.url ?? null}
                            label={tr('Previous')}
                            icon={ChevronLeft}
                        />
                        <PageLink
                            href={next?.url ?? null}
                            label={tr('Next')}
                            icon={ChevronRight}
                        />
                    </div>
                </div>
            )}

            {bulkConfirm && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-4"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="bulk-delete-title"
                    data-testid="questions-bulk-confirm"
                >
                    <div
                        className="fixed inset-0 bg-black/50"
                        onClick={() => !bulkBusy && setBulkConfirm(false)}
                    />
                    <div className="relative z-10 w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl dark:border-white/15 dark:shadow-[0_0_24px_rgba(255,255,255,0.06)]">
                        <h3
                            id="bulk-delete-title"
                            className="text-lg font-semibold text-foreground"
                        >
                            {tr('Delete')}{' '}
                            {formatNumber(selectedVisible.length)}{' '}
                            {tr('questions?')}
                        </h3>
                        <p className="mt-2 text-sm text-muted-foreground">
                            {tr(
                                'The selected questions and their recorded answers will be removed. Deactivate them instead to keep their statistics.',
                            )}
                        </p>
                        <div className="mt-6 flex items-center justify-end gap-3">
                            <button
                                type="button"
                                onClick={() => setBulkConfirm(false)}
                                disabled={bulkBusy !== null}
                                className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
                            >
                                {tr('Cancel')}
                            </button>
                            <button
                                type="button"
                                disabled={bulkBusy !== null}
                                onClick={() => runBulk('delete')}
                                className="inline-flex items-center gap-2 rounded-lg bg-destructive px-4 py-2 text-sm font-medium text-white hover:bg-destructive/90 disabled:opacity-50"
                                data-testid="questions-bulk-confirm-delete"
                            >
                                {bulkBusy === 'delete' && (
                                    <Loader2 className="size-4 animate-spin" />
                                )}
                                {tr('Delete')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {deleteTarget && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-4"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="delete-question-title"
                >
                    <div
                        className="fixed inset-0 bg-black/50"
                        onClick={() => !deleting && setDeleteTarget(null)}
                    />
                    <div className="relative z-10 w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl dark:border-white/15 dark:shadow-[0_0_24px_rgba(255,255,255,0.06)]">
                        <h3
                            id="delete-question-title"
                            className="text-lg font-semibold text-foreground"
                        >
                            {tr('Delete question?')}
                        </h3>
                        <p className="mt-2 text-sm text-muted-foreground">
                            “{deleteTarget.prompt_id}
                            {tr('” and its')}{' '}
                            {formatNumber(deleteTarget.times_answered)}{' '}
                            {tr(
                                'recorded answers will be removed. Deactivate it instead to keep its statistics.',
                            )}
                        </p>
                        <div className="mt-6 flex items-center justify-end gap-3">
                            <button
                                type="button"
                                onClick={() => setDeleteTarget(null)}
                                disabled={deleting}
                                className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
                            >
                                {tr('Cancel')}
                            </button>
                            <button
                                type="button"
                                disabled={deleting}
                                onClick={() => {
                                    setDeleting(true);
                                    router.delete(
                                        `/admin/questions/${deleteTarget.id}`,
                                        {
                                            preserveScroll: true,
                                            onFinish: () => {
                                                setDeleting(false);
                                                setDeleteTarget(null);
                                            },
                                        },
                                    );
                                }}
                                className="inline-flex items-center gap-2 rounded-lg bg-destructive px-4 py-2 text-sm font-medium text-white hover:bg-destructive/90 disabled:opacity-50"
                            >
                                {deleting && (
                                    <Loader2 className="size-4 animate-spin" />
                                )}
                                {tr('Delete')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function BulkButton({
    icon: Icon,
    label,
    onClick,
    disabled,
    busy,
    tone = 'default',
    testId,
}: {
    icon: React.ElementType;
    label: string;
    onClick: () => void;
    disabled: boolean;
    busy?: boolean;
    tone?: 'default' | 'success' | 'danger';
    testId: string;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            data-testid={testId}
            className={cn(
                'inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50',
                tone === 'default' &&
                    'border-border bg-background text-foreground hover:bg-muted',
                tone === 'success' &&
                    'border-green-300 bg-green-50 text-green-700 hover:bg-green-100 dark:border-green-800 dark:bg-green-950/40 dark:text-green-300 dark:hover:bg-green-950/70',
                tone === 'danger' &&
                    'border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-950/70',
            )}
        >
            {busy ? (
                <Loader2 className="size-4 animate-spin" />
            ) : (
                <Icon className="size-4" />
            )}
            {tr(label)}
        </button>
    );
}

function GradeTab({
    active,
    onClick,
    children,
}: {
    active: boolean;
    onClick: () => void;
    children: ReactNode;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={active}
            className={cn(
                'inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                active
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-card text-muted-foreground hover:text-foreground',
            )}
        >
            {children}
        </button>
    );
}

/** Who created a question: AI, a teacher (with name), an admin or the built-in system bank. */
function SourceBadge({
    source,
    author,
}: {
    source: string;
    author?: string | null;
}) {
    if (source === 'ai') {
        return <AiBadge className="py-1 text-xs" />;
    }

    const teacher = source === 'teacher' || source === 'import';
    const label = teacher
        ? author
            ? tr('Teacher: {0}', [author])
            : tr('Teacher')
        : source === 'admin'
          ? author
              ? tr('Admin: {0}', [author])
              : tr('Admin')
          : source === 'system'
            ? tr('System')
            : tr('Unknown');

    return (
        <span
            className={cn(
                'inline-flex max-w-full min-w-0 items-center gap-1 rounded-full border px-2 py-0.5 font-medium',
                teacher
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300'
                    : source === 'admin'
                      ? 'border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950/50 dark:text-sky-300'
                      : 'border-border bg-muted text-muted-foreground',
            )}
            title={label}
            data-testid="question-source-badge"
        >
            {teacher ? (
                <School className="size-3 shrink-0" />
            ) : source === 'admin' ? (
                <ShieldCheck className="size-3 shrink-0" />
            ) : (
                <Settings2 className="size-3 shrink-0" />
            )}
            <span className="truncate">{label}</span>
        </span>
    );
}

function Count({ children }: { children: ReactNode }) {
    return (
        <span className="rounded-full bg-black/10 px-1.5 text-xs tabular-nums dark:bg-white/15">
            {children}
        </span>
    );
}

function Badge({
    children,
    tone = 'default',
}: {
    children: ReactNode;
    tone?: 'default' | 'primary' | 'muted' | 'amber' | 'success';
}) {
    return (
        <span
            className={cn(
                'inline-flex items-center rounded-full px-2 py-0.5 font-medium',
                tone === 'primary' && 'bg-primary/10 text-primary',
                tone === 'muted' && 'bg-muted text-muted-foreground',
                tone === 'default' && 'bg-secondary text-secondary-foreground',
                tone === 'amber' &&
                    'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300',
                tone === 'success' &&
                    'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
            )}
        >
            {children}
        </span>
    );
}

function IconButton({
    label,
    icon: Icon,
    href,
    onClick,
    className,
}: {
    label: string;
    icon: React.ElementType;
    href?: string;
    onClick?: () => void;
    className?: string;
}) {
    const classes = cn(
        'inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
        className,
    );

    return href ? (
        <Link
            href={href}
            className={classes}
            aria-label={tr(label)}
            title={tr(label)}
        >
            <Icon className="size-4" />
        </Link>
    ) : (
        <button
            type="button"
            onClick={onClick}
            className={classes}
            aria-label={tr(label)}
            title={tr(label)}
        >
            <Icon className="size-4" />
        </button>
    );
}

function PageLink({
    href,
    label,
    icon: Icon,
}: {
    href: string | null;
    label: string;
    icon: React.ElementType;
}) {
    const classes =
        'inline-flex size-8 items-center justify-center rounded-lg border border-border';

    return href ? (
        <Link
            href={href}
            preserveScroll
            className={cn(classes, 'text-foreground hover:bg-muted')}
            aria-label={tr(label)}
        >
            <Icon className="size-4" />
        </Link>
    ) : (
        <span
            className={cn(classes, 'text-muted-foreground/40')}
            aria-hidden="true"
        >
            <Icon className="size-4" />
        </span>
    );
}

QuestionsIndex.layout = (page: ReactNode) => (
    <AdminLayout title={tr('Question Bank')}>{page}</AdminLayout>
);

/**
 * AI generation still running: shown on the question bank so an admin who
 * left the generate page sees the progress again, refreshed every few seconds.
 */
function LiveGenerations({ generations }: { generations: Generation[] }) {
    const [finished, setFinished] = useState(false);
    const settle = useCallback(() => {
        setFinished(true);
        router.reload({ only: ['subjectStats', 'summary', 'questions'] });
    }, []);
    useGenerationPolling(generations, ['liveGenerations'], settle);

    if (generations.length === 0) {
        return finished ? (
            <div
                className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200"
                role="status"
                data-testid="live-generations-done"
            >
                <span className="flex items-center gap-2 font-medium">
                    <CircleCheck className="size-4 shrink-0" aria-hidden />
                    {tr('AI question generation finished.')}
                </span>
                <Link href="/admin/questions?source=ai" className="link">
                    {tr('Review AI questions')}
                </Link>
            </div>
        ) : null;
    }

    return (
        <section
            className="mb-6 flex flex-col gap-1 rounded-2xl border border-violet-200 bg-violet-50/60 px-4 py-2 dark:border-violet-900/60 dark:bg-violet-950/30"
            aria-label={tr('AI generation in progress')}
            data-testid="live-generations"
        >
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-violet-800 dark:text-violet-200">
                    <Sparkles className="size-4 shrink-0" aria-hidden />
                    {tr('AI generation in progress')}
                </h3>
                <Link
                    href="/admin/questions/generate"
                    className="link text-xs"
                    data-testid="live-generations-open"
                >
                    {tr('Open generate page')}
                </Link>
            </div>
            <ul className="flex flex-col divide-y divide-violet-200/70 dark:divide-violet-900/50">
                {generations.map((g) => (
                    <GenerationRow key={g.id} generation={g} />
                ))}
            </ul>
        </section>
    );
}
