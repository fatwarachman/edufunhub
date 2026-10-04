import { NavButton } from '@/components/site-nav';
import {
    GradeChips,
    OutcomeBar,
    StatCard,
    SuccessNotice,
    teacherFieldClass,
    type UsageStats,
    useTeacherFormat,
} from '@/components/teacher/teacher-ui';
import { useTranslations } from '@/hooks/use-translations';
import PlayerLayout from '@/layouts/player-layout';
import { GRADE_LEVELS, gradeLabel } from '@/lib/grade';
import { Link, router } from '@inertiajs/react';
import {
    BookOpenCheck,
    ChevronLeft,
    ChevronRight,
    CircleCheck,
    CircleX,
    Coins,
    FileUp,
    Gamepad2,
    GraduationCap,
    Pencil,
    Plus,
    Search,
    Trash2,
    Users,
} from 'lucide-react';
import { type FormEvent, useState } from 'react';

interface Bucket extends UsageStats {
    label: string;
}

interface GradeBucket extends UsageStats {
    grade: number;
}

interface QuestionRow {
    id: number;
    type: 'choice' | 'true_false';
    subject: string;
    prompt_id: string;
    prompt_en: string | null;
    games: string[];
    grades: number[];
    is_active: boolean;
    source: string;
    created_at: string | null;
    stats: UsageStats & { games: string[]; grades: number[] };
}

interface Paginated<T> {
    data: T[];
    current_page: number;
    last_page: number;
    total: number;
    prev_page_url: string | null;
    next_page_url: string | null;
}

interface TeacherIndexProps {
    overview: {
        summary: UsageStats & {
            questions: number;
            active_questions: number;
            used_questions: number;
        };
        byGame: Bucket[];
        byGrade: GradeBucket[];
        byLevel: Bucket[];
    };
    rates: Record<string, number>;
    filters: { search?: string; grade?: number; subject?: string };
    questions: Paginated<QuestionRow>;
    subjects: string[];
    grades: number[];
}

export default function TeacherIndex({
    overview,
    rates,
    filters,
    questions,
    subjects,
    grades,
}: TeacherIndexProps) {
    const { t } = useTranslations();
    const format = useTeacherFormat();
    const { summary } = overview;

    return (
        <PlayerLayout title={t('teacher.title')}>
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div className="flex min-w-0 flex-col items-start gap-3">
                    <span className="auth-badge">{t('teacher.badge')}</span>
                    <h1 className="text-3xl font-bold tracking-tight md:text-5xl">
                        {t('teacher.heading')}
                    </h1>
                    <p className="max-w-2xl text-muted-foreground">
                        {t('teacher.intro')}
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <NavButton
                        href="/teacher/questions/import"
                        icon={FileUp}
                        label={t('teacher.import')}
                        testId="teacher-import-link"
                    />
                    <NavButton
                        href="/teacher/questions/create"
                        icon={Plus}
                        label={t('teacher.create')}
                        variant="primary"
                        testId="teacher-create-link"
                    />
                </div>
            </div>

            <SuccessNotice />

            <section
                className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5"
                aria-label={t('teacher.heading')}
            >
                <StatCard
                    icon={BookOpenCheck}
                    accent="#efeaff"
                    label={t('teacher.stats.questions')}
                    value={format.number(summary.questions)}
                    hint={t('teacher.stats.questionsHint', {
                        active: format.number(summary.active_questions),
                        used: format.number(summary.used_questions),
                    })}
                    testId="teacher-stat-questions"
                />
                <StatCard
                    icon={Gamepad2}
                    accent="#fff0cf"
                    label={t('teacher.stats.used')}
                    value={format.number(summary.answered)}
                    hint={t('teacher.stats.usedHint', {
                        players: format.number(summary.players),
                    })}
                    testId="teacher-stat-used"
                />
                <StatCard
                    icon={CircleCheck}
                    accent="#dff7ea"
                    label={t('teacher.stats.correct')}
                    value={format.number(summary.correct)}
                    hint={t('teacher.stats.successRate', {
                        rate: format.percent(summary.success_rate),
                    })}
                    testId="teacher-stat-correct"
                />
                <StatCard
                    icon={CircleX}
                    accent="#ffe1e6"
                    label={t('teacher.stats.wrong')}
                    value={format.number(summary.wrong)}
                    testId="teacher-stat-wrong"
                />
                <StatCard
                    icon={Coins}
                    accent="#ffd93d"
                    label={t('teacher.stats.compensation')}
                    value={format.money(summary.compensation)}
                    hint={t('teacher.stats.compensationHint', {
                        count: summary.correct,
                    })}
                    testId="teacher-stat-compensation"
                />
            </section>

            <div className="grid gap-6 lg:grid-cols-3">
                <BreakdownCard
                    title={t('teacher.stats.byGame')}
                    icon={Gamepad2}
                    rows={overview.byGame.map((row) => ({
                        key: row.label,
                        label: t(`teacher.games.${row.label}`, {
                            defaultValue: row.label,
                        }),
                        stats: row,
                    }))}
                    testId="teacher-by-game"
                />
                <BreakdownCard
                    title={t('teacher.stats.byLevel')}
                    icon={GraduationCap}
                    rows={overview.byLevel.map((row) => ({
                        key: row.label,
                        label: t(`teacher.levels.${row.label}`),
                        stats: row,
                    }))}
                    testId="teacher-by-level"
                />
                <BreakdownCard
                    title={t('teacher.stats.byGrade')}
                    icon={Users}
                    rows={overview.byGrade.map((row) => ({
                        key: String(row.grade),
                        label: gradeLabel(t, row.grade),
                        stats: row,
                    }))}
                    testId="teacher-by-grade"
                />
            </div>

            <RatesCard rates={rates} />

            <QuestionList
                questions={questions}
                filters={filters}
                subjects={subjects}
                grades={grades}
            />
        </PlayerLayout>
    );
}

function BreakdownCard({
    title,
    icon: Icon,
    rows,
    testId,
}: {
    title: string;
    icon: typeof Gamepad2;
    rows: { key: string; label: string; stats: UsageStats }[];
    testId: string;
}) {
    const { t } = useTranslations();
    const format = useTeacherFormat();
    const used = rows.filter((row) => row.stats.answered > 0);

    return (
        <section
            className="auth-card flex min-w-0 flex-col gap-4 !p-5"
            data-testid={testId}
        >
            <h2 className="flex items-center gap-2 text-lg font-bold">
                <Icon className="size-5" aria-hidden="true" />
                {title}
            </h2>
            {used.length === 0 ? (
                <div className="rounded-xl border-2 border-dashed border-[#151b2e]/25 px-4 py-6 text-center">
                    <p className="text-sm font-bold">
                        {t('teacher.stats.empty')}
                    </p>
                    <p className="text-xs text-muted-foreground">
                        {t('teacher.stats.emptyHint')}
                    </p>
                </div>
            ) : (
                <ul className="flex flex-col gap-3">
                    {used.map((row) => (
                        <li key={row.key} className="flex flex-col gap-1.5">
                            <div className="flex items-baseline justify-between gap-3 text-sm">
                                <span className="min-w-0 truncate font-bold">
                                    {row.label}
                                </span>
                                <span className="shrink-0 text-muted-foreground tabular-nums">
                                    {t('teacher.stats.answered')}{' '}
                                    <strong className="text-[#151b2e]">
                                        {format.number(row.stats.answered)}
                                    </strong>
                                </span>
                            </div>
                            <OutcomeBar
                                correct={row.stats.correct}
                                wrong={row.stats.wrong}
                            />
                            <div className="flex flex-wrap justify-between gap-x-3 text-xs font-semibold">
                                <span className="text-[#116a56]">
                                    {format.number(row.stats.correct)}{' '}
                                    {t('teacher.form.true').toLowerCase()}
                                </span>
                                <span className="text-[#b23a52]">
                                    {format.number(row.stats.wrong)}{' '}
                                    {t('teacher.form.false').toLowerCase()}
                                </span>
                                <span className="text-muted-foreground">
                                    {format.money(row.stats.compensation)}
                                </span>
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}

function RatesCard({ rates }: { rates: Record<string, number> }) {
    const { t } = useTranslations();
    const format = useTeacherFormat();

    return (
        <section
            className="auth-card flex flex-col gap-4 !bg-[#fff9e6] !p-5"
            data-testid="teacher-rates"
        >
            <div className="flex flex-col gap-1">
                <h2 className="flex items-center gap-2 text-lg font-bold">
                    <Coins className="size-5" aria-hidden="true" />
                    {t('teacher.rates.title')}
                </h2>
                <p className="text-sm text-muted-foreground">
                    {t('teacher.rates.note')}
                </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {GRADE_LEVELS.map((level) => (
                    <div
                        key={level.key}
                        className="flex flex-col gap-2 rounded-xl border-2 border-[#151b2e] bg-white p-3"
                    >
                        <p className="text-sm font-bold">
                            {t(`teacher.levels.${level.key}`)}
                        </p>
                        <ul className="flex flex-col gap-1 text-sm">
                            {level.grades.map((grade) => (
                                <li
                                    key={grade}
                                    className="flex justify-between gap-2"
                                >
                                    <span className="text-muted-foreground">
                                        {gradeLabel(t, grade)}
                                    </span>
                                    <span className="font-bold tabular-nums">
                                        {format.money(rates[grade] ?? 0)}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </div>
                ))}
            </div>
        </section>
    );
}

function QuestionList({
    questions,
    filters,
    subjects,
    grades,
}: {
    questions: Paginated<QuestionRow>;
    filters: TeacherIndexProps['filters'];
    subjects: string[];
    grades: number[];
}) {
    const { t, i18n } = useTranslations();
    const format = useTeacherFormat();
    const [search, setSearch] = useState(filters.search ?? '');
    const hasFilters = Boolean(
        filters.search || filters.subject || filters.grade !== undefined,
    );

    const apply = (next: Partial<Record<string, string | undefined>>) => {
        const query = {
            search: filters.search,
            subject: filters.subject,
            grade:
                filters.grade === undefined ? undefined : String(filters.grade),
            ...next,
        };
        router.get(
            '/teacher/questions',
            Object.fromEntries(
                Object.entries(query).filter(([, value]) => value),
            ),
            { preserveScroll: true, preserveState: true },
        );
    };

    const submitSearch = (event: FormEvent) => {
        event.preventDefault();
        apply({ search: search.trim() || undefined });
    };

    const destroy = (question: QuestionRow) => {
        if (window.confirm(t('teacher.list.confirmDelete'))) {
            router.delete(`/teacher/questions/${question.id}`, {
                preserveScroll: true,
            });
        }
    };

    return (
        <section
            className="auth-card flex min-w-0 flex-col gap-5 !p-5"
            aria-labelledby="teacher-list-title"
        >
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h2
                    id="teacher-list-title"
                    className="flex items-center gap-2 text-xl font-bold"
                >
                    <BookOpenCheck className="size-5" aria-hidden="true" />
                    {t('teacher.list.title')}
                    <span className="rounded-full border-2 border-[#151b2e] bg-[#ffd93d] px-2 text-sm tabular-nums">
                        {format.number(questions.total)}
                    </span>
                </h2>
            </div>

            <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_200px_200px]">
                <form
                    onSubmit={submitSearch}
                    className="relative"
                    role="search"
                >
                    <Search
                        className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
                        aria-hidden="true"
                    />
                    <input
                        type="search"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder={t('teacher.list.search')}
                        aria-label={t('teacher.list.search')}
                        className={`${teacherFieldClass} !pl-10`}
                        data-testid="teacher-search"
                    />
                </form>
                <select
                    value={filters.grade ?? ''}
                    onChange={(event) =>
                        apply({ grade: event.target.value || undefined })
                    }
                    aria-label={t('teacher.list.grades')}
                    className={teacherFieldClass}
                    data-testid="teacher-filter-grade"
                >
                    <option value="">{t('teacher.list.allGrades')}</option>
                    {grades.map((grade) => (
                        <option key={grade} value={grade}>
                            {gradeLabel(t, grade)}
                        </option>
                    ))}
                </select>
                <select
                    value={filters.subject ?? ''}
                    onChange={(event) =>
                        apply({ subject: event.target.value || undefined })
                    }
                    aria-label={t('teacher.form.subject')}
                    className={teacherFieldClass}
                    data-testid="teacher-filter-subject"
                >
                    <option value="">{t('teacher.list.allSubjects')}</option>
                    {subjects.map((subject) => (
                        <option key={subject} value={subject}>
                            {t(`teacher.subjects.${subject}`)}
                        </option>
                    ))}
                </select>
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
                    {!hasFilters && (
                        <p className="text-sm text-muted-foreground">
                            {t('teacher.list.emptyHint')}
                        </p>
                    )}
                </div>
            ) : (
                <ul
                    className="flex flex-col gap-3"
                    data-testid="teacher-question-list"
                >
                    {questions.data.map((question) => {
                        const prompt =
                            i18n.language === 'en' && question.prompt_en
                                ? question.prompt_en
                                : question.prompt_id;
                        return (
                            <li
                                key={question.id}
                                className="grid gap-4 rounded-2xl border-2 border-[#151b2e] bg-white p-4 lg:grid-cols-[minmax(0,1fr)_260px_auto] lg:items-center"
                                data-testid="teacher-question-row"
                            >
                                <div className="flex min-w-0 flex-col gap-2">
                                    <div className="flex flex-wrap items-center gap-1.5 text-xs font-bold">
                                        <span className="rounded-full border-2 border-[#151b2e] bg-[#fff0cf] px-2 py-0.5">
                                            {t(
                                                `teacher.subjects.${question.subject}`,
                                            )}
                                        </span>
                                        <span className="rounded-full border-2 border-[#151b2e] bg-white px-2 py-0.5">
                                            {question.type === 'choice'
                                                ? t('teacher.form.choice')
                                                : t('teacher.form.trueFalse')}
                                        </span>
                                        {!question.is_active && (
                                            <span className="rounded-full border-2 border-[#151b2e] bg-[#ffe1e6] px-2 py-0.5">
                                                {t('teacher.list.inactive')}
                                            </span>
                                        )}
                                    </div>
                                    <p className="font-semibold break-words">
                                        {prompt}
                                    </p>
                                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                        <span className="font-semibold">
                                            {t('teacher.list.grades')}:
                                        </span>
                                        <GradeChips grades={question.grades} />
                                    </div>
                                </div>

                                <div className="flex min-w-0 flex-col gap-1.5 text-sm">
                                    <div className="flex justify-between gap-2">
                                        <span className="text-muted-foreground">
                                            {t('teacher.list.usage')}
                                        </span>
                                        <strong className="tabular-nums">
                                            {format.number(
                                                question.stats.answered,
                                            )}
                                            ×
                                        </strong>
                                    </div>
                                    <OutcomeBar
                                        correct={question.stats.correct}
                                        wrong={question.stats.wrong}
                                    />
                                    <div className="flex justify-between gap-2 text-xs font-semibold">
                                        <span className="text-[#116a56]">
                                            <CircleCheck
                                                className="mr-1 inline size-3.5"
                                                aria-hidden="true"
                                            />
                                            {format.number(
                                                question.stats.correct,
                                            )}
                                        </span>
                                        <span className="text-[#b23a52]">
                                            <CircleX
                                                className="mr-1 inline size-3.5"
                                                aria-hidden="true"
                                            />
                                            {format.number(
                                                question.stats.wrong,
                                            )}
                                        </span>
                                        <span className="flex items-center gap-1">
                                            <Coins
                                                className="size-3.5"
                                                aria-hidden="true"
                                            />
                                            {format.money(
                                                question.stats.compensation,
                                            )}
                                        </span>
                                    </div>
                                    {question.stats.answered > 0 && (
                                        <p className="text-xs text-muted-foreground">
                                            {t('teacher.list.playedIn')}:{' '}
                                            {question.stats.games
                                                .map((game) =>
                                                    t(`teacher.games.${game}`, {
                                                        defaultValue: game,
                                                    }),
                                                )
                                                .join(', ')}
                                            {question.stats.grades.length >
                                                0 && (
                                                <>
                                                    {' · '}
                                                    {t('teacher.list.playedBy')}
                                                    :{' '}
                                                    {question.stats.grades
                                                        .map((grade) =>
                                                            gradeLabel(
                                                                t,
                                                                grade,
                                                            ),
                                                        )
                                                        .join(', ')}
                                                </>
                                            )}
                                        </p>
                                    )}
                                </div>

                                <div className="flex gap-2 lg:flex-col">
                                    <Link
                                        href={`/teacher/questions/${question.id}/edit`}
                                        className="edu-nav-btn"
                                        aria-label={t('teacher.list.edit')}
                                        data-testid="teacher-edit"
                                    >
                                        <Pencil aria-hidden="true" />
                                        <span className="edu-nav-label">
                                            {t('teacher.list.edit')}
                                        </span>
                                    </Link>
                                    <button
                                        type="button"
                                        onClick={() => destroy(question)}
                                        className="edu-nav-btn"
                                        aria-label={t('teacher.list.delete')}
                                        data-testid="teacher-delete"
                                    >
                                        <Trash2 aria-hidden="true" />
                                        <span className="edu-nav-label">
                                            {t('teacher.list.delete')}
                                        </span>
                                    </button>
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}

            {questions.last_page > 1 && (
                <nav
                    className="flex flex-wrap items-center justify-between gap-3"
                    aria-label={t('teacher.list.page', {
                        current: questions.current_page,
                        last: questions.last_page,
                    })}
                >
                    <span className="text-sm text-muted-foreground">
                        {t('teacher.list.page', {
                            current: questions.current_page,
                            last: questions.last_page,
                        })}
                    </span>
                    <div className="flex gap-2">
                        {questions.prev_page_url && (
                            <NavButton
                                href={questions.prev_page_url}
                                icon={ChevronLeft}
                                label={t('teacher.list.prev')}
                            />
                        )}
                        {questions.next_page_url && (
                            <NavButton
                                href={questions.next_page_url}
                                icon={ChevronRight}
                                label={t('teacher.list.next')}
                            />
                        )}
                    </div>
                </nav>
            )}
        </section>
    );
}
