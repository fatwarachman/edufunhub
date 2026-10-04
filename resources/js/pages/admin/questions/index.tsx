import { AiBadge } from '@/components/admin/admin-kit';
import {
    BAND_LABELS,
    EmptyState,
    SUBJECT_LABELS,
    fieldClass,
    formatNumber,
    formatPercent,
    gameLabel,
    rateTone,
} from '@/components/admin/game-stats';
import AdminLayout from '@/layouts/admin-layout';
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
    ChevronLeft,
    ChevronRight,
    Coins,
    GraduationCap,
    Landmark,
    Languages,
    Layers,
    ListChecks,
    Loader2,
    Pencil,
    Plus,
    Power,
    RotateCcw,
    Scale,
    Search,
    Sparkles,
    Trash2,
} from 'lucide-react';
import { type ReactNode, useEffect, useRef, useState } from 'react';

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
}

interface QuestionsProps {
    mode: 'subjects' | 'list';
    subjectStats: SubjectStat[];
    questions: PaginatedData<QuestionRow> | null;
    filters: Filters;
    summary: {
        total: number;
        active: number;
        ai: number;
        ai_pending: number;
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

function subjectLabel(subject: string): string {
    return SUBJECT_LABELS[subject] ?? subject;
}

function correctAnswer(question: QuestionRow): string {
    if (question.type === 'true_false')
        return question.answer === 1 ? 'True' : 'False';
    return question.options?.[question.answer]?.id ?? '—';
}

export default function QuestionsIndex(props: QuestionsProps) {
    return (
        <>
            <Head title="Question Bank" />
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
    const [search, setSearch] = useState('');

    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div className="flex flex-col gap-1">
                    <h2 className="font-display text-2xl font-bold text-foreground">
                        Question Bank
                    </h2>
                    <p className="text-sm text-muted-foreground">
                        {formatNumber(summary.total)} questions ·{' '}
                        {formatNumber(summary.active)} active ·{' '}
                        {games
                            .map(
                                (game) =>
                                    `${gameLabel(game)} ${summary.byGame[game] ?? 0}`,
                            )
                            .join(' · ')}
                        . Choose a subject to manage its questions.
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
                            aria-label="Search all questions"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search all questions…"
                            className={cn(fieldClass, 'w-64 pl-9')}
                        />
                    </form>
                    <Link
                        href="/admin/questions/generate"
                        className="inline-flex items-center gap-2 rounded-lg border border-violet-300 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-700 hover:bg-violet-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-300 dark:hover:bg-violet-950/70"
                        data-testid="questions-generate"
                    >
                        <Sparkles className="size-4" />
                        Generate with AI
                    </Link>
                    <Link
                        href="/admin/questions/create"
                        className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                        <Plus className="size-4" />
                        Add question
                    </Link>
                </div>
            </div>

            {(summary.ai > 0 || summary.bonus > 0) && (
                <div className="flex flex-wrap gap-2 text-sm">
                    {summary.ai > 0 && (
                        <Link
                            href="/admin/questions?source=ai"
                            className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 hover:bg-accent"
                            data-testid="questions-ai-link"
                        >
                            <AiBadge />
                            {formatNumber(summary.ai)} AI-created
                            {summary.ai_pending > 0 && (
                                <span className="text-xs text-amber-700 dark:text-amber-300">
                                    · {formatNumber(summary.ai_pending)} waiting
                                    for review
                                </span>
                            )}
                        </Link>
                    )}
                    {summary.bonus > 0 && (
                        <Link
                            href="/admin/questions?source=bonus"
                            className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 hover:bg-accent"
                        >
                            <Coins className="size-4 text-amber-500" />
                            {formatNumber(summary.bonus)} bonus questions
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
                                                {stat.total} questions ·{' '}
                                                {stat.active} active
                                            </span>
                                        </div>
                                    </div>
                                    <ArrowUpRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                                </div>

                                <div className="flex flex-col gap-2">
                                    <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                                        <GraduationCap className="size-3.5" />
                                        Questions per grade
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
                                                        {
                                                            BAND_LABELS[
                                                                band.value
                                                            ]
                                                        }
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
                                        {formatNumber(stat.answered)} answers
                                        recorded
                                    </span>
                                    <span>
                                        Correct:{' '}
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
                className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
                <Layers className="size-4" />
                View all questions in one list
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
}: QuestionsProps) {
    const [search, setSearch] = useState(filters.search ?? '');
    const [deleteTarget, setDeleteTarget] = useState<QuestionRow | null>(null);
    const [deleting, setDeleting] = useState(false);
    const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
    const firstRender = useRef(true);
    const subject =
        filters.subject && filters.subject !== 'all' ? filters.subject : null;
    const stat = subjectStats.find((row) => row.subject === subject);

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
          : filters.source === 'ai' && !filters.search
            ? 'AI-created questions'
            : filters.source === 'bonus' && !filters.search
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
                        All subjects
                    </Link>
                    <h2 className="font-display text-2xl font-bold text-foreground">
                        {title}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                        {formatNumber(questions.total)} questions
                        {stat ? ` · ${stat.active} active` : ''}. Changes reach
                        running games within about a minute.
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
                    Add question
                </Link>
            </div>

            <div
                className="flex flex-wrap items-center gap-2"
                role="group"
                aria-label="Filter by grade"
            >
                <GradeTab
                    active={!filters.band}
                    onClick={() => apply({ band: undefined })}
                >
                    All grades
                    {stat && <Count>{stat.total}</Count>}
                </GradeTab>
                {bands.map((band) => (
                    <GradeTab
                        key={band.value}
                        active={filters.band === String(band.value)}
                        onClick={() => apply({ band: String(band.value) })}
                    >
                        {BAND_LABELS[band.value]}
                        {stat && <Count>{stat.bands[band.value] ?? 0}</Count>}
                    </GradeTab>
                ))}
            </div>

            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card p-3 shadow-sm">
                <div className="relative min-w-56 flex-1">
                    <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                        type="search"
                        aria-label="Search questions"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search question text or key…"
                        className={cn(fieldClass, 'w-full pl-9')}
                    />
                </div>
                <select
                    aria-label="Subject"
                    value={filters.subject ?? 'all'}
                    onChange={(e) =>
                        apply({ subject: e.target.value, band: undefined })
                    }
                    className={fieldClass}
                >
                    <option value="all">All subjects</option>
                    {subjects.map((value) => (
                        <option key={value} value={value}>
                            {subjectLabel(value)}
                        </option>
                    ))}
                </select>
                <select
                    aria-label="Game"
                    value={filters.game ?? ''}
                    onChange={(e) =>
                        apply({ game: e.target.value || undefined })
                    }
                    className={fieldClass}
                >
                    <option value="">All games</option>
                    {games.map((game) => (
                        <option key={game} value={game}>
                            {gameLabel(game)}
                        </option>
                    ))}
                </select>
                <select
                    aria-label="Type"
                    value={filters.type ?? ''}
                    onChange={(e) =>
                        apply({ type: e.target.value || undefined })
                    }
                    className={fieldClass}
                >
                    <option value="">All types</option>
                    <option value="choice">Multiple choice</option>
                    <option value="true_false">True / false</option>
                </select>
                <select
                    aria-label="Status"
                    value={filters.status ?? ''}
                    onChange={(e) =>
                        apply({ status: e.target.value || undefined })
                    }
                    className={fieldClass}
                >
                    <option value="">Any status</option>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                </select>
                <select
                    aria-label="Source"
                    value={filters.source ?? ''}
                    onChange={(e) =>
                        apply({ source: e.target.value || undefined })
                    }
                    className={fieldClass}
                    data-testid="questions-source-filter"
                >
                    <option value="">Any source</option>
                    <option value="ai">AI-created</option>
                    <option value="bonus">Bonus questions</option>
                </select>
                <select
                    aria-label="Sort"
                    value={filters.sort ?? ''}
                    onChange={(e) =>
                        apply({ sort: e.target.value || undefined })
                    }
                    className={fieldClass}
                >
                    <option value="">Sort by grade</option>
                    <option value="hardest">Hardest first</option>
                    <option value="most_answered">Most answered</option>
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
                        Reset
                    </button>
                )}
            </div>

            <div className="rounded-2xl border border-border bg-card shadow-sm">
                {questions.data.length === 0 ? (
                    <EmptyState
                        icon={ListChecks}
                        title="No questions found"
                        description="Adjust the filters or add a new question."
                    />
                ) : (
                    <ul className="divide-y divide-border">
                        {questions.data.map((question) => (
                            <li
                                key={question.id}
                                className={cn(
                                    'flex gap-4 p-4',
                                    !question.is_active && 'opacity-60',
                                )}
                            >
                                <div
                                    className={cn(
                                        'flex w-20 shrink-0 flex-col items-center justify-center rounded-xl px-2 py-2 text-center',
                                        BAND_TONE[question.band],
                                    )}
                                    data-testid="question-grade"
                                >
                                    <span className="text-[10px] font-semibold tracking-wider uppercase opacity-80">
                                        {BAND_LEVEL[question.band]}
                                    </span>
                                    <span className="text-sm leading-tight font-bold">
                                        Grade
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
                                            Answer:{' '}
                                            <span className="font-medium text-foreground">
                                                {correctAnswer(question)}
                                            </span>
                                        </p>
                                        <div className="flex flex-wrap items-center gap-1.5 text-xs">
                                            {question.source === 'ai' && (
                                                <AiBadge />
                                            )}
                                            {(question.points ?? 0) > 0 && (
                                                <Badge tone="amber">
                                                    Bonus +{question.points}
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
                                                    ? 'Multiple choice'
                                                    : 'True / false'}
                                            </Badge>
                                            {question.games.map((game) => (
                                                <Badge
                                                    key={game}
                                                    tone="primary"
                                                >
                                                    {gameLabel(game)}
                                                </Badge>
                                            ))}
                                            <span className="text-muted-foreground">
                                                by{' '}
                                                {question.author ??
                                                    (question.source ===
                                                    'system'
                                                        ? 'EduFunHub'
                                                        : 'Unknown')}
                                            </span>
                                            {!question.is_active && (
                                                <Badge tone="muted">
                                                    Inactive
                                                </Badge>
                                            )}
                                            <span className="font-mono text-muted-foreground">
                                                {question.key}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="flex shrink-0 items-center gap-4">
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
                                                answers
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <IconButton
                                                label="Statistics"
                                                href={`/admin/questions/${question.id}`}
                                                icon={ChartNoAxesColumn}
                                            />
                                            <IconButton
                                                label="Edit"
                                                href={`/admin/questions/${question.id}/edit`}
                                                icon={Pencil}
                                            />
                                            <IconButton
                                                label={
                                                    question.is_active
                                                        ? 'Deactivate'
                                                        : 'Activate'
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
                                                label="Delete"
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

            {questions.total > 0 && (
                <div className="flex items-center justify-between gap-4 text-sm text-muted-foreground">
                    <span>
                        Showing {questions.from}–{questions.to} of{' '}
                        {questions.total}
                    </span>
                    <div className="flex items-center gap-1">
                        <PageLink
                            href={prev?.url ?? null}
                            label="Previous"
                            icon={ChevronLeft}
                        />
                        <PageLink
                            href={next?.url ?? null}
                            label="Next"
                            icon={ChevronRight}
                        />
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
                            Delete question?
                        </h3>
                        <p className="mt-2 text-sm text-muted-foreground">
                            “{deleteTarget.prompt_id}” and its{' '}
                            {formatNumber(deleteTarget.times_answered)} recorded
                            answers will be removed. Deactivate it instead to
                            keep its statistics.
                        </p>
                        <div className="mt-6 flex items-center justify-end gap-3">
                            <button
                                type="button"
                                onClick={() => setDeleteTarget(null)}
                                disabled={deleting}
                                className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
                            >
                                Cancel
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
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
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
    tone?: 'default' | 'primary' | 'muted' | 'amber';
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
        <Link href={href} className={classes} aria-label={label} title={label}>
            <Icon className="size-4" />
        </Link>
    ) : (
        <button
            type="button"
            onClick={onClick}
            className={classes}
            aria-label={label}
            title={label}
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
            aria-label={label}
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
    <AdminLayout title="Question Bank">{page}</AdminLayout>
);
