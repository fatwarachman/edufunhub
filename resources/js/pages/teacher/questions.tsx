import {
    actionButtonClass,
    ClassroomDialog,
    ConfirmDialog,
    primaryButtonClass,
    useGameCatalog,
} from '@/components/classroom/classroom-ui';
import InputError from '@/components/input-error';
import {
    OptionContent,
    optionImage,
    type OptionMediaData,
    QuestionMedia,
    type QuestionMediaData,
} from '@/components/question-media';
import { BackButton, NavButton } from '@/components/site-nav';
import { TeacherTabs } from '@/components/teacher/teacher-tabs';
import {
    GradeChips,
    OutcomeBar,
    SuccessNotice,
    teacherFieldClass,
    Toggle,
    type UsageStats,
    useTeacherFormat,
} from '@/components/teacher/teacher-ui';
import { useDateFormatter } from '@/hooks/use-date-formatter';
import { useTranslations } from '@/hooks/use-translations';
import PlayerLayout from '@/layouts/player-layout';
import { gradeLabel } from '@/lib/grade';
import { QUESTION_LEVELS, questionLevelKey } from '@/lib/question-levels';
import { SubjectIcon, useSubjectName, useSubjects } from '@/lib/subjects';
import { cn } from '@/lib/utils';
import { type PaginationLink } from '@/types/admin';
import { Link, router } from '@inertiajs/react';
import {
    BarChart3,
    BookOpenCheck,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    ChevronsDownUp,
    ChevronsUpDown,
    CircleCheck,
    CircleDot,
    CircleX,
    Coins,
    EyeOff,
    FileUp,
    Gamepad2,
    GraduationCap,
    Image as ImageIcon,
    Layers,
    Lightbulb,
    ListChecks,
    Loader2,
    Pencil,
    Plus,
    RotateCcw,
    Search,
    SignalHigh,
    SignalLow,
    SignalMedium,
    SlidersHorizontal,
    ToggleLeft,
    Trash2,
    Users,
    X,
} from 'lucide-react';
import { type ChangeEvent, useEffect, useId, useRef, useState } from 'react';

type QuestionOption = {
    id: string;
    en?: string | null;
    media?: OptionMediaData | null;
};

interface QuestionRow {
    id: number;
    type: 'choice' | 'true_false';
    subject: string;
    prompt_id: string;
    prompt_en: string | null;
    options: QuestionOption[] | Record<string, QuestionOption> | null;
    visual: QuestionMediaData | null;
    answer: number;
    hint_id: string | null;
    hint_en: string | null;
    games: string[];
    grades: number[];
    level: number;
    topic: { id: number; name_id: string; name_en: string | null } | null;
    has_picture?: boolean;
    is_active: boolean;
    source: string;
    created_at: string | null;
    updated_at: string | null;
    stats: UsageStats & { games: string[]; grades: number[] };
}

interface Paginated<T> {
    data: T[];
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
    from: number | null;
    to: number | null;
    links: PaginationLink[];
}

interface Filters {
    search?: string;
    grade?: number;
    subject?: string;
    topic?: number;
    level?: number;
    type?: string;
    status?: string;
    game?: string;
    picture?: string;
    sort?: string;
    per_page?: number;
}

interface TopicOption {
    id: number;
    subject_key: string;
    name_id: string;
    name_en: string | null;
}

interface TeacherQuestionsProps {
    filters: Filters;
    questions: Paginated<QuestionRow>;
    perPageOptions: number[];
    totalQuestions: number;
    games: string[];
    choiceOnlyGames: string[];
    subjects: string[];
    grades: number[];
    topics: TopicOption[];
}

const LIST_URL = '/teacher/questions/list';
const SEARCH_DELAY = 350;
const FILTER_KEYS = [
    'grade',
    'subject',
    'topic',
    'level',
    'type',
    'status',
    'game',
    'picture',
] as const;
const LEVEL_ICONS = { 1: SignalLow, 2: SignalMedium, 3: SignalHigh } as const;

/** Every question the teacher wrote as an accordion list with filters. */
export default function TeacherQuestions({
    filters,
    questions,
    perPageOptions,
    totalQuestions,
    games,
    choiceOnlyGames,
    subjects,
    grades,
    topics,
}: TeacherQuestionsProps) {
    const { t, i18n } = useTranslations();
    const subjectName = useSubjectName();
    const format = useTeacherFormat();
    const catalog = useGameCatalog();
    const [search, setSearch] = useState(filters.search ?? '');
    const [searching, setSearching] = useState(false);
    const [open, setOpen] = useState<Set<number>>(() => new Set());
    const [editingGames, setEditingGames] = useState<QuestionRow | null>(null);
    const [deleting, setDeleting] = useState<QuestionRow | null>(null);
    const [busy, setBusy] = useState(false);
    const timer = useRef<number | undefined>(undefined);
    const perPage = filters.per_page ?? perPageOptions[0];
    const activeFilters = FILTER_KEYS.filter(
        (key) => filters[key] !== undefined,
    ).length;
    const hasFilters = Boolean(filters.search) || activeFilters > 0;
    const allOpen =
        questions.data.length > 0 &&
        questions.data.every((question) => open.has(question.id));
    const subjectTopics = topics.filter(
        (topic) => topic.subject_key === filters.subject,
    );
    const localized = (id: string, en: string | null | undefined): string =>
        i18n.language === 'en' && en ? en : id;

    useEffect(() => () => window.clearTimeout(timer.current), []);

    const visit = (
        next: Partial<Record<keyof Filters, string | number | undefined>>,
    ) => {
        const query: Record<string, string> = {};
        for (const [key, value] of Object.entries({ ...filters, ...next })) {
            if (value !== undefined && value !== null && value !== '') {
                query[key] = String(value);
            }
        }
        if (query.per_page === String(perPageOptions[0])) {
            delete query.per_page;
        }
        router.get(LIST_URL, query, {
            preserveScroll: true,
            preserveState: true,
            replace: true,
            onStart: () => setSearching(true),
            onFinish: () => setSearching(false),
            onSuccess: () => setOpen(new Set()),
        });
    };

    const onSearch = (event: ChangeEvent<HTMLInputElement>) => {
        const value = event.target.value;
        setSearch(value);
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(
            () => visit({ search: value.trim() || undefined }),
            SEARCH_DELAY,
        );
    };

    const clearSearch = () => {
        window.clearTimeout(timer.current);
        setSearch('');
        visit({ search: undefined });
    };

    const resetFilters = () => {
        window.clearTimeout(timer.current);
        setSearch('');
        router.get(
            LIST_URL,
            filters.per_page ? { per_page: String(filters.per_page) } : {},
            { preserveScroll: true, preserveState: true, replace: true },
        );
    };

    const toggle = (id: number) =>
        setOpen((current) => {
            const next = new Set(current);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });

    const destroy = () => {
        if (!deleting) {
            return;
        }
        setBusy(true);
        router.delete(`/teacher/questions/${deleting.id}`, {
            preserveScroll: true,
            onFinish: () => {
                setBusy(false);
                setDeleting(null);
            },
        });
    };

    const select = (
        key: keyof Filters,
        label: string,
        options: { value: string | number; label: string }[],
        allLabel: string,
        extra?: Partial<Record<keyof Filters, undefined>>,
        disabled?: boolean,
    ) => (
        <label className="flex min-w-0 flex-col gap-1">
            <span className="text-xs font-bold text-[#151b2e]">{label}</span>
            <select
                value={filters[key] ?? ''}
                onChange={(event) =>
                    visit({
                        [key]: event.target.value || undefined,
                        page: undefined,
                        ...extra,
                    } as Partial<Record<keyof Filters, string | undefined>>)
                }
                disabled={disabled}
                className={cn(
                    teacherFieldClass,
                    'disabled:cursor-not-allowed disabled:bg-[#f1efe8]',
                )}
                data-testid={`teacher-filter-${key}`}
            >
                <option value="">{allLabel}</option>
                {options.map((option) => (
                    <option key={option.value} value={option.value}>
                        {option.label}
                    </option>
                ))}
            </select>
        </label>
    );

    return (
        <PlayerLayout title={t('teacher.list.pageTitle')}>
            <TeacherTabs active="questions" />
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div className="flex min-w-0 flex-col items-start gap-3">
                    <BackButton
                        href="/teacher/questions"
                        label={t('teacher.form.back')}
                    />
                    <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
                        {t('teacher.list.pageTitle')}
                    </h1>
                    <p className="max-w-2xl text-muted-foreground">
                        {t('teacher.list.pageIntro')}
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <NavButton
                        href="/teacher/questions/import"
                        icon={FileUp}
                        label={t('teacher.import')}
                        testId="teacher-list-import-link"
                    />
                    <NavButton
                        href="/teacher/questions/create"
                        icon={Plus}
                        label={t('teacher.create')}
                        variant="primary"
                        testId="teacher-list-create-link"
                    />
                </div>
            </div>

            <SuccessNotice />

            <section
                className="auth-card flex min-w-0 flex-col gap-4 !p-4 sm:!p-5"
                aria-label={t('teacher.list.filters')}
                data-testid="teacher-list-filters"
            >
                <div className="relative">
                    <Search
                        className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-[#151b2e]"
                        aria-hidden="true"
                    />
                    <input
                        type="search"
                        value={search}
                        onChange={onSearch}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                                event.preventDefault();
                                window.clearTimeout(timer.current);
                                visit({ search: search.trim() || undefined });
                            }
                        }}
                        placeholder={t('teacher.list.searchAll')}
                        aria-label={t('teacher.list.searchAll')}
                        className={`${teacherFieldClass} !pr-20 !pl-10`}
                        data-testid="teacher-search"
                    />
                    <span className="absolute top-1/2 right-2 flex -translate-y-1/2 items-center gap-1">
                        {searching && (
                            <Loader2
                                className="size-4 animate-spin text-[#6c5ce7]"
                                aria-label={t('teacher.list.searching')}
                            />
                        )}
                        {search !== '' && (
                            <button
                                type="button"
                                onClick={clearSearch}
                                aria-label={t('teacher.list.clearSearch')}
                                className="grid size-9 place-items-center rounded-lg text-[#151b2e] hover:bg-[#fff0cf]"
                                data-testid="teacher-search-clear"
                            >
                                <X className="size-4" aria-hidden="true" />
                            </button>
                        )}
                    </span>
                </div>
                <p className="-mt-2 text-xs text-muted-foreground">
                    {t('teacher.list.searchHint')}
                </p>

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                    {select(
                        'subject',
                        t('teacher.form.subject'),
                        subjects.map((subject) => ({
                            value: subject,
                            label: subjectName(subject),
                        })),
                        t('teacher.list.allSubjects'),
                        { topic: undefined },
                    )}
                    {select(
                        'topic',
                        t('teacher.list.topic'),
                        subjectTopics.map((topic) => ({
                            value: topic.id,
                            label: localized(topic.name_id, topic.name_en),
                        })),
                        filters.subject
                            ? t('teacher.list.allTopics')
                            : t('teacher.list.pickSubjectFirst'),
                        undefined,
                        !filters.subject || subjectTopics.length === 0,
                    )}
                    {select(
                        'grade',
                        t('teacher.list.grades'),
                        grades.map((grade) => ({
                            value: grade,
                            label: gradeLabel(t, grade),
                        })),
                        t('teacher.list.allGrades'),
                    )}
                    {select(
                        'level',
                        t('teacher.form.level'),
                        QUESTION_LEVELS.map((level) => ({
                            value: level.value,
                            label: t(`questionLevel.levels.${level.key}`),
                        })),
                        t('teacher.list.allLevels'),
                    )}
                    {select(
                        'type',
                        t('teacher.form.type'),
                        [
                            {
                                value: 'choice',
                                label: t('teacher.form.choice'),
                            },
                            {
                                value: 'true_false',
                                label: t('teacher.form.trueFalse'),
                            },
                        ],
                        t('teacher.list.allTypes'),
                    )}
                    {select(
                        'status',
                        t('teacher.list.status'),
                        [
                            {
                                value: 'active',
                                label: t('teacher.list.statusActive'),
                            },
                            {
                                value: 'inactive',
                                label: t('teacher.list.inactive'),
                            },
                        ],
                        t('teacher.list.allStatuses'),
                    )}
                    {select(
                        'game',
                        t('teacher.list.game'),
                        games.map((game) => ({
                            value: game,
                            label: catalog.title(game),
                        })),
                        t('teacher.list.allGamesFilter'),
                    )}
                    {select(
                        'picture',
                        t('teacher.list.picture'),
                        [
                            {
                                value: 'with',
                                label: t('teacher.list.withPicture'),
                            },
                            {
                                value: 'without',
                                label: t('teacher.list.withoutPicture'),
                            },
                        ],
                        t('teacher.list.anyPicture'),
                    )}
                    <label className="flex min-w-0 flex-col gap-1">
                        <span className="text-xs font-bold text-[#151b2e]">
                            {t('teacher.list.sort')}
                        </span>
                        <select
                            value={filters.sort ?? 'newest'}
                            onChange={(event) =>
                                visit({
                                    sort:
                                        event.target.value === 'newest'
                                            ? undefined
                                            : event.target.value,
                                })
                            }
                            className={teacherFieldClass}
                            data-testid="teacher-filter-sort"
                        >
                            <option value="newest">
                                {t('teacher.list.sortNewest')}
                            </option>
                            <option value="oldest">
                                {t('teacher.list.sortOldest')}
                            </option>
                            <option value="prompt">
                                {t('teacher.list.sortPrompt')}
                            </option>
                        </select>
                    </label>
                    <div className="flex items-end">
                        <button
                            type="button"
                            onClick={resetFilters}
                            disabled={!hasFilters}
                            className={cn(actionButtonClass, 'w-full')}
                            data-testid="teacher-filter-reset"
                        >
                            <RotateCcw className="size-4" aria-hidden="true" />
                            {t('teacher.list.resetFilters')}
                            {activeFilters > 0 && (
                                <span className="rounded-full bg-[#ffd93d] px-1.5 text-xs tabular-nums">
                                    {activeFilters}
                                </span>
                            )}
                        </button>
                    </div>
                </div>
            </section>

            <section
                className="auth-card flex min-w-0 flex-col gap-4 !p-4 sm:!p-5"
                aria-labelledby="teacher-list-title"
            >
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2
                        id="teacher-list-title"
                        className="flex flex-wrap items-center gap-2 text-xl font-bold"
                    >
                        <ListChecks className="size-5" aria-hidden="true" />
                        {t('teacher.list.title')}
                        <span
                            className="rounded-full border-2 border-[#151b2e] bg-[#ffd93d] px-2 text-sm tabular-nums"
                            data-testid="teacher-list-count"
                        >
                            {hasFilters
                                ? t('teacher.list.countFiltered', {
                                      count: format.number(questions.total),
                                      total: format.number(totalQuestions),
                                  })
                                : format.number(questions.total)}
                        </span>
                    </h2>
                    {questions.data.length > 1 && (
                        <button
                            type="button"
                            onClick={() =>
                                setOpen(
                                    allOpen
                                        ? new Set()
                                        : new Set(
                                              questions.data.map((q) => q.id),
                                          ),
                                )
                            }
                            className={actionButtonClass}
                            data-testid="teacher-expand-all"
                        >
                            {allOpen ? (
                                <ChevronsDownUp
                                    className="size-4"
                                    aria-hidden="true"
                                />
                            ) : (
                                <ChevronsUpDown
                                    className="size-4"
                                    aria-hidden="true"
                                />
                            )}
                            {allOpen
                                ? t('teacher.list.collapseAll')
                                : t('teacher.list.expandAll')}
                        </button>
                    )}
                </div>

                {questions.data.length === 0 ? (
                    <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-[#151b2e]/30 px-4 py-10 text-center">
                        <BookOpenCheck
                            className="size-9 text-muted-foreground"
                            aria-hidden="true"
                        />
                        <p className="font-bold">
                            {hasFilters
                                ? t('teacher.list.noMatch')
                                : t('teacher.list.emptyTitle')}
                        </p>
                        {hasFilters ? (
                            <button
                                type="button"
                                onClick={resetFilters}
                                className={actionButtonClass}
                            >
                                <RotateCcw
                                    className="size-4"
                                    aria-hidden="true"
                                />
                                {t('teacher.list.resetFilters')}
                            </button>
                        ) : (
                            <p className="text-sm text-muted-foreground">
                                {t('teacher.list.emptyHint')}
                            </p>
                        )}
                    </div>
                ) : (
                    <ol
                        className={cn(
                            'flex flex-col gap-2.5 transition-opacity',
                            searching && 'opacity-60',
                        )}
                        data-testid="teacher-question-list"
                    >
                        {questions.data.map((question, index) => (
                            <QuestionItem
                                key={question.id}
                                question={question}
                                number={(questions.from ?? 1) + index}
                                open={open.has(question.id)}
                                onToggle={() => toggle(question.id)}
                                onPickGames={() => setEditingGames(question)}
                                onDelete={() => setDeleting(question)}
                                allGames={games.length}
                            />
                        ))}
                    </ol>
                )}

                <ListPagination
                    questions={questions}
                    perPage={perPage}
                    perPageOptions={perPageOptions}
                    onPerPage={(value) =>
                        visit({ per_page: value, page: undefined } as Partial<
                            Record<keyof Filters, number | undefined>
                        >)
                    }
                />
            </section>

            {editingGames && (
                <GamesDialog
                    key={editingGames.id}
                    question={editingGames}
                    games={games}
                    choiceOnlyGames={choiceOnlyGames}
                    onClose={() => setEditingGames(null)}
                />
            )}

            <ConfirmDialog
                open={deleting !== null}
                onClose={() => setDeleting(null)}
                onConfirm={destroy}
                busy={busy}
                title={t('teacher.list.deleteTitle')}
                description={t('teacher.list.confirmDelete')}
                confirmLabel={t('teacher.list.delete')}
                testId="teacher-delete-dialog"
            />
        </PlayerLayout>
    );
}

/** One question: a summary header that opens a detail panel. */
function QuestionItem({
    question,
    number,
    open,
    onToggle,
    onPickGames,
    onDelete,
    allGames,
}: {
    question: QuestionRow;
    number: number;
    open: boolean;
    onToggle: () => void;
    onPickGames: () => void;
    onDelete: () => void;
    allGames: number;
}) {
    const { t, i18n } = useTranslations();
    const english = i18n.language === 'en';
    const subjectName = useSubjectName();
    const subjects = useSubjects();
    const format = useTeacherFormat();
    const catalog = useGameCatalog();
    const { formatDateTime } = useDateFormatter();
    const panelId = useId();
    const levelKey = questionLevelKey(question.level);
    const level = QUESTION_LEVELS.find((item) => item.key === levelKey);
    const LevelIcon =
        LEVEL_ICONS[(level?.value ?? 1) as keyof typeof LEVEL_ICONS];
    const prompt =
        english && question.prompt_en ? question.prompt_en : question.prompt_id;
    const hint =
        english && question.hint_en ? question.hint_en : question.hint_id;
    const topic = question.topic
        ? english && question.topic.name_en
            ? question.topic.name_en
            : question.topic.name_id
        : null;
    const options: QuestionOption[] = Array.isArray(question.options)
        ? question.options
        : Object.values(question.options ?? {});
    const optionMedia = options.map((option) => option.media ?? null);
    const isChoice = question.type === 'choice';
    const chip =
        'inline-flex items-center gap-1 rounded-full border-2 border-[#151b2e] px-2 py-0.5 text-xs font-bold';

    return (
        <li
            className={cn(
                'min-w-0 rounded-2xl border-2 border-[#151b2e] bg-white transition-shadow',
                open && 'shadow-[3px_3px_0_#151b2e]',
                !question.is_active && 'bg-[#faf7ef]',
            )}
            data-testid="teacher-question-row"
        >
            <button
                type="button"
                onClick={onToggle}
                aria-expanded={open}
                aria-controls={panelId}
                className="flex w-full min-w-0 items-start gap-3 rounded-2xl p-3 text-left focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#6c5ce7] sm:p-4"
                data-testid="teacher-question-toggle"
            >
                <span
                    className="grid min-h-9 min-w-9 shrink-0 place-items-center rounded-xl border-2 border-[#151b2e] bg-[#ffd93d] px-1.5 text-sm font-black tabular-nums"
                    data-testid="teacher-question-number"
                >
                    {number}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-2">
                    <span className="line-clamp-2 font-semibold break-words sm:line-clamp-none">
                        {prompt}
                    </span>
                    <span className="flex flex-wrap items-center gap-1.5">
                        <span className={cn(chip, 'bg-[#fff0cf]')}>
                            <SubjectIcon
                                icon={
                                    subjects.find(
                                        (item) => item.key === question.subject,
                                    )?.icon
                                }
                                className="size-3.5"
                            />
                            {subjectName(question.subject)}
                        </span>
                        {topic && (
                            <span className={cn(chip, 'bg-[#efeaff]')}>
                                <Layers
                                    className="size-3.5"
                                    aria-hidden="true"
                                />
                                {topic}
                            </span>
                        )}
                        <span className={cn(chip, 'bg-white')}>
                            {isChoice ? (
                                <ListChecks
                                    className="size-3.5"
                                    aria-hidden="true"
                                />
                            ) : (
                                <ToggleLeft
                                    className="size-3.5"
                                    aria-hidden="true"
                                />
                            )}
                            {isChoice
                                ? t('teacher.form.choice')
                                : t('teacher.form.trueFalse')}
                        </span>
                        <span
                            className={chip}
                            style={{ background: level?.tone ?? '#dff7ea' }}
                        >
                            <LevelIcon
                                className="size-3.5"
                                aria-hidden="true"
                            />
                            {t(`questionLevel.levels.${levelKey}`)}
                        </span>
                        <span className={cn(chip, 'bg-white')}>
                            <GraduationCap
                                className="size-3.5"
                                aria-hidden="true"
                            />
                            {question.grades
                                .map((grade) => gradeLabel(t, grade))
                                .join(', ')}
                        </span>
                        <span
                            className={cn(chip, 'bg-[#c9f5e5]')}
                            title={t('teacher.list.shownIn', {
                                count: question.games.length,
                            })}
                        >
                            <Gamepad2 className="size-3.5" aria-hidden="true" />
                            {question.games.length === allGames
                                ? t('teacher.list.allGamesShort')
                                : format.number(question.games.length)}
                        </span>
                        <span className={cn(chip, 'bg-white')}>
                            <Users className="size-3.5" aria-hidden="true" />
                            {t('teacher.list.answeredShort', {
                                count: format.number(question.stats.answered),
                            })}
                        </span>
                        {question.has_picture && (
                            <span
                                className={cn(chip, 'bg-[#dbeafe]')}
                                data-testid="teacher-question-picture"
                            >
                                <ImageIcon
                                    className="size-3.5"
                                    aria-hidden="true"
                                />
                                {t('teacher.list.picture')}
                            </span>
                        )}
                        {!question.is_active && (
                            <span className={cn(chip, 'bg-[#ffe1e6]')}>
                                <EyeOff
                                    className="size-3.5"
                                    aria-hidden="true"
                                />
                                {t('teacher.list.inactive')}
                            </span>
                        )}
                    </span>
                </span>
                <ChevronDown
                    className={cn(
                        'mt-2 size-5 shrink-0 transition-transform duration-300 motion-reduce:transition-none',
                        open && 'rotate-180',
                    )}
                    aria-hidden="true"
                />
            </button>

            <div
                id={panelId}
                role="region"
                aria-label={prompt}
                aria-hidden={!open}
                inert={!open}
                className={cn(
                    'grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none',
                    open
                        ? 'grid-rows-[1fr] opacity-100'
                        : 'grid-rows-[0fr] opacity-0',
                )}
                data-testid="teacher-question-panel"
            >
                <div className="min-h-0 overflow-hidden">
                    <div className="flex min-w-0 flex-col gap-4 border-t-2 border-[#151b2e]/10 p-3 sm:p-4">
                        {question.visual && (
                            <div className="w-full max-w-md">
                                <QuestionMedia media={question.visual} />
                            </div>
                        )}

                        <div className="flex flex-col gap-2">
                            <h3 className="flex items-center gap-1.5 text-sm font-bold">
                                <CircleDot
                                    className="size-4"
                                    aria-hidden="true"
                                />
                                {t('teacher.list.answers')}
                            </h3>
                            {isChoice ? (
                                <ul
                                    className="grid grid-cols-1 gap-2 sm:grid-cols-2"
                                    data-testid="teacher-question-options"
                                >
                                    {options.map((option, index) => {
                                        const correct =
                                            index === question.answer;
                                        return (
                                            <li
                                                key={index}
                                                className={cn(
                                                    'flex min-w-0 items-center gap-2 rounded-xl border-2 p-2 text-sm font-semibold',
                                                    correct
                                                        ? 'border-[#1aab8a] bg-[#dff7ea]'
                                                        : 'border-[#151b2e]/20 bg-white',
                                                )}
                                            >
                                                <span className="grid size-6 shrink-0 place-items-center rounded-full border-2 border-[#151b2e] bg-white text-xs font-bold">
                                                    {String.fromCharCode(
                                                        65 + index,
                                                    )}
                                                </span>
                                                <OptionContent
                                                    text={
                                                        english
                                                            ? option.en ||
                                                              option.id
                                                            : option.id
                                                    }
                                                    image={optionImage(
                                                        optionMedia,
                                                        index,
                                                    )}
                                                    size="sm"
                                                />
                                                {correct && (
                                                    <CircleCheck
                                                        className="ml-auto size-4 shrink-0 text-[#116a56]"
                                                        aria-label={t(
                                                            'teacher.analysis.correct',
                                                        )}
                                                    />
                                                )}
                                            </li>
                                        );
                                    })}
                                </ul>
                            ) : (
                                <p className="inline-flex w-fit items-center gap-2 rounded-xl border-2 border-[#1aab8a] bg-[#dff7ea] px-3 py-2 text-sm font-bold">
                                    {question.answer === 1 ? (
                                        <CircleCheck
                                            className="size-4 text-[#116a56]"
                                            aria-hidden="true"
                                        />
                                    ) : (
                                        <CircleX
                                            className="size-4 text-[#b23a52]"
                                            aria-hidden="true"
                                        />
                                    )}
                                    {t('teacher.list.correctAnswer')}:{' '}
                                    {question.answer === 1
                                        ? t('teacher.form.true')
                                        : t('teacher.form.false')}
                                </p>
                            )}
                        </div>

                        {hint && (
                            <p className="flex items-start gap-2 rounded-xl border-2 border-dashed border-[#151b2e]/25 bg-[#fff9e6] px-3 py-2 text-sm">
                                <Lightbulb
                                    className="mt-0.5 size-4 shrink-0"
                                    aria-hidden="true"
                                />
                                <span className="min-w-0 break-words">
                                    {hint}
                                </span>
                            </p>
                        )}

                        <div className="grid gap-4 lg:grid-cols-2">
                            <div className="flex min-w-0 flex-col gap-2">
                                <h3 className="flex items-center gap-1.5 text-sm font-bold">
                                    <BarChart3
                                        className="size-4"
                                        aria-hidden="true"
                                    />
                                    {t('teacher.list.usage')}
                                </h3>
                                <div className="grid grid-cols-3 gap-2 text-center">
                                    <Tile
                                        value={format.number(
                                            question.stats.answered,
                                        )}
                                        label={t('teacher.stats.answered')}
                                    />
                                    <Tile
                                        value={format.number(
                                            question.stats.correct,
                                        )}
                                        label={t('teacher.form.true')}
                                        tone="text-[#116a56]"
                                    />
                                    <Tile
                                        value={format.number(
                                            question.stats.wrong,
                                        )}
                                        label={t('teacher.form.false')}
                                        tone="text-[#b23a52]"
                                    />
                                </div>
                                <OutcomeBar
                                    correct={question.stats.correct}
                                    wrong={question.stats.wrong}
                                />
                                <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold text-muted-foreground">
                                    <span className="inline-flex items-center gap-1">
                                        <Coins
                                            className="size-3.5"
                                            aria-hidden="true"
                                        />
                                        {format.money(
                                            question.stats.compensation,
                                        )}
                                    </span>
                                    <span className="inline-flex items-center gap-1">
                                        <Users
                                            className="size-3.5"
                                            aria-hidden="true"
                                        />
                                        {t('teacher.list.players', {
                                            count: format.number(
                                                question.stats.players,
                                            ),
                                        })}
                                    </span>
                                </p>
                            </div>

                            <div className="flex min-w-0 flex-col gap-2">
                                <h3 className="flex items-center gap-1.5 text-sm font-bold">
                                    <Gamepad2
                                        className="size-4"
                                        aria-hidden="true"
                                    />
                                    {t('teacher.list.shownIn', {
                                        count: question.games.length,
                                    })}
                                </h3>
                                <div
                                    className="flex flex-wrap gap-1.5 text-xs"
                                    data-testid="teacher-question-games"
                                >
                                    {question.games.length === allGames ? (
                                        <span
                                            className={cn(chip, 'bg-[#c9f5e5]')}
                                        >
                                            {t('teacher.list.allGames')}
                                        </span>
                                    ) : (
                                        question.games.map((game) => (
                                            <span
                                                key={game}
                                                className={cn(chip, 'bg-white')}
                                            >
                                                {catalog.title(game)}
                                            </span>
                                        ))
                                    )}
                                </div>
                                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                    <span className="font-semibold">
                                        {t('teacher.list.grades')}:
                                    </span>
                                    <GradeChips grades={question.grades} />
                                </div>
                                {question.created_at && (
                                    <p className="text-xs text-muted-foreground">
                                        {t('teacher.list.createdAt', {
                                            date: formatDateTime(
                                                question.created_at,
                                            ),
                                        })}
                                    </p>
                                )}
                            </div>
                        </div>

                        <div className="flex flex-wrap gap-2 border-t-2 border-[#151b2e]/10 pt-3">
                            <button
                                type="button"
                                onClick={onPickGames}
                                className={actionButtonClass}
                                data-testid="teacher-pick-games"
                            >
                                <SlidersHorizontal
                                    className="size-4"
                                    aria-hidden="true"
                                />
                                {t('teacher.list.pickGames')}
                            </button>
                            <Link
                                href={`/teacher/questions/${question.id}`}
                                className={actionButtonClass}
                                data-testid="teacher-show"
                            >
                                <BarChart3
                                    className="size-4"
                                    aria-hidden="true"
                                />
                                {t('teacher.list.analysis')}
                            </Link>
                            <Link
                                href={`/teacher/questions/${question.id}/edit`}
                                className={actionButtonClass}
                                data-testid="teacher-edit"
                            >
                                <Pencil className="size-4" aria-hidden="true" />
                                {t('teacher.list.edit')}
                            </Link>
                            <button
                                type="button"
                                onClick={onDelete}
                                className={cn(
                                    actionButtonClass,
                                    'bg-[#ffe1e6] text-[#8e2a3f] hover:bg-[#ffc9d3]',
                                )}
                                data-testid="teacher-delete"
                            >
                                <Trash2 className="size-4" aria-hidden="true" />
                                {t('teacher.list.delete')}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </li>
    );
}

function Tile({
    value,
    label,
    tone,
}: {
    value: string;
    label: string;
    tone?: string;
}) {
    return (
        <div className="flex min-w-0 flex-col rounded-xl border-2 border-[#151b2e] bg-[#faf7ef] px-1 py-2">
            <strong className={cn('text-lg tabular-nums', tone)}>
                {value}
            </strong>
            <span className="text-[10px] leading-tight font-bold break-words text-[#3d4357] min-[360px]:text-xs">
                {label}
            </span>
        </div>
    );
}

/** Page numbers, result range and page size (30, 50, 100, 200). */
function ListPagination({
    questions,
    perPage,
    perPageOptions,
    onPerPage,
}: {
    questions: Paginated<QuestionRow>;
    perPage: number;
    perPageOptions: number[];
    onPerPage: (value: number) => void;
}) {
    const { t } = useTranslations();
    const format = useTeacherFormat();
    const links = questions.links ?? [];
    const prev = links[0];
    const next = links[links.length - 1];
    const pages = links.slice(1, -1);
    const pageClass =
        'inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border-2 border-[#151b2e] px-2 text-sm font-bold tabular-nums transition-colors';

    if (questions.total === 0) {
        return null;
    }

    return (
        <nav
            className="flex flex-col gap-3 border-t-2 border-[#151b2e]/10 pt-4 md:flex-row md:items-center md:justify-between"
            aria-label={t('teacher.list.pagination')}
            data-testid="teacher-pagination"
        >
            <div className="flex flex-wrap items-center gap-3 text-sm">
                <span
                    className="font-semibold tabular-nums"
                    data-testid="teacher-range"
                >
                    {t('teacher.list.range', {
                        from: format.number(questions.from ?? 0),
                        to: format.number(questions.to ?? 0),
                        total: format.number(questions.total),
                    })}
                </span>
                <label className="inline-flex items-center gap-2 font-semibold">
                    {t('teacher.list.perPage')}
                    <select
                        value={perPage}
                        onChange={(event) =>
                            onPerPage(Number(event.target.value))
                        }
                        className={cn(teacherFieldClass, 'w-auto')}
                        data-testid="teacher-per-page"
                    >
                        {perPageOptions.map((value) => (
                            <option key={value} value={value}>
                                {value}
                            </option>
                        ))}
                    </select>
                </label>
            </div>
            {questions.last_page > 1 && (
                <div className="flex flex-wrap items-center gap-1.5">
                    <PageLink
                        href={prev?.url ?? null}
                        className={pageClass}
                        label={t('teacher.list.prev')}
                    >
                        <ChevronLeft className="size-4" aria-hidden="true" />
                    </PageLink>
                    {pages.map((link, index) =>
                        link.url === null ? (
                            <span
                                key={`gap-${index}`}
                                className="px-1 text-sm font-bold"
                                aria-hidden="true"
                            >
                                …
                            </span>
                        ) : (
                            <PageLink
                                key={link.label}
                                href={link.url}
                                active={link.active}
                                className={pageClass}
                                label={t('teacher.list.pageNumber', {
                                    page: link.label,
                                })}
                            >
                                {link.label}
                            </PageLink>
                        ),
                    )}
                    <PageLink
                        href={next?.url ?? null}
                        className={pageClass}
                        label={t('teacher.list.next')}
                    >
                        <ChevronRight className="size-4" aria-hidden="true" />
                    </PageLink>
                </div>
            )}
        </nav>
    );
}

function PageLink({
    href,
    active,
    className,
    label,
    children,
}: {
    href: string | null;
    active?: boolean;
    className: string;
    label: string;
    children: React.ReactNode;
}) {
    if (!href) {
        return (
            <span
                className={cn(className, 'cursor-not-allowed opacity-40')}
                aria-disabled="true"
                aria-label={label}
            >
                {children}
            </span>
        );
    }
    return (
        <Link
            href={href}
            preserveScroll
            preserveState
            aria-label={label}
            aria-current={active ? 'page' : undefined}
            className={cn(
                className,
                active
                    ? 'bg-[#151b2e] text-white'
                    : 'bg-white text-[#151b2e] hover:bg-[#fff0cf]',
            )}
            data-testid="teacher-page-link"
        >
            {children}
        </Link>
    );
}

/** Picks the games one question is shown in. */
function GamesDialog({
    question,
    games,
    choiceOnlyGames,
    onClose,
}: {
    question: QuestionRow;
    games: string[];
    choiceOnlyGames: string[];
    onClose: () => void;
}) {
    const { t } = useTranslations();
    const catalog = useGameCatalog();
    const supported = games.filter(
        (game) => question.type === 'choice' || !choiceOnlyGames.includes(game),
    );
    const [picked, setPicked] = useState<string[]>(
        question.games.filter((game) => supported.includes(game)),
    );
    const [error, setError] = useState<string | undefined>();
    const [saving, setSaving] = useState(false);
    const allPicked = picked.length === supported.length;

    const toggle = (game: string) =>
        setPicked((current) =>
            current.includes(game)
                ? current.filter((g) => g !== game)
                : [...current, game],
        );

    const save = () => {
        setSaving(true);
        router.patch(
            `/teacher/questions/${question.id}/games`,
            { games: picked },
            {
                preserveScroll: true,
                onSuccess: () => onClose(),
                onError: (errors) =>
                    setError(
                        errors.games ??
                            Object.values(errors)[0] ??
                            t('teacher.form.fixErrors'),
                    ),
                onFinish: () => setSaving(false),
            },
        );
    };

    return (
        <ClassroomDialog
            open
            onClose={onClose}
            title={t('teacher.list.gamesTitle')}
            description={t('teacher.list.gamesNote')}
            wide
            testId="teacher-games-dialog"
            footer={
                <>
                    <button
                        type="button"
                        onClick={onClose}
                        className={actionButtonClass}
                    >
                        {t('teacher.form.cancel')}
                    </button>
                    <button
                        type="button"
                        onClick={save}
                        disabled={saving || picked.length === 0}
                        className={primaryButtonClass}
                        data-testid="teacher-games-save"
                    >
                        {saving
                            ? t('teacher.form.saving')
                            : t('teacher.list.gamesSave')}
                    </button>
                </>
            }
        >
            <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-bold">
                        {t('teacher.list.gamesPicked', {
                            count: picked.length,
                            total: supported.length,
                        })}
                    </span>
                    <button
                        type="button"
                        onClick={() => setPicked(allPicked ? [] : supported)}
                        className="min-h-11 rounded-lg px-2 text-sm font-bold text-[#6c5ce7] underline-offset-2 hover:underline"
                        data-testid="teacher-games-all"
                    >
                        {allPicked
                            ? t('teacher.list.gamesNone')
                            : t('teacher.list.gamesAll')}
                    </button>
                </div>
                <div className="flex flex-wrap gap-2">
                    {games.map((game) => (
                        <Toggle
                            key={game}
                            pressed={picked.includes(game)}
                            onClick={() => toggle(game)}
                            disabled={!supported.includes(game)}
                            testId={`teacher-game-${game}`}
                        >
                            {catalog.title(game)}
                        </Toggle>
                    ))}
                </div>
                {question.type === 'true_false' && (
                    <p className="text-xs text-muted-foreground">
                        {t('teacher.form.skyChoiceOnly', {
                            games: choiceOnlyGames
                                .map((game) => catalog.title(game))
                                .join(', '),
                        })}
                    </p>
                )}
                <InputError message={error} />
            </div>
        </ClassroomDialog>
    );
}
