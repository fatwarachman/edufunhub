import {
    actionButtonClass,
    ClassroomDialog,
    primaryButtonClass,
    useLocalized,
} from '@/components/classroom/classroom-ui';
import {
    type QuestionOptionsPage,
    type QuestionPick,
    type Topic,
} from '@/components/classroom/types';
import { teacherFieldClass, Toggle } from '@/components/teacher/teacher-ui';
import { useTranslations } from '@/hooks/use-translations';
import { gradeLabel } from '@/lib/grade';
import http from '@/lib/http';
import { QUESTION_LEVELS, questionLevelKey } from '@/lib/question-levels';
import { useSubjectName } from '@/lib/subjects';
import { cn } from '@/lib/utils';
import {
    Check,
    ChevronLeft,
    ChevronRight,
    Loader2,
    Plus,
    Search,
    UserRound,
} from 'lucide-react';
import { type FormEvent, useCallback, useEffect, useState } from 'react';

interface Filters {
    search: string;
    subject: string;
    topic: string;
    level: string;
    grade: string;
    mine: boolean;
    page: number;
}

const EMPTY_FILTERS: Filters = {
    search: '',
    subject: '',
    topic: '',
    level: '',
    grade: '',
    mine: false,
    page: 1,
};

/**
 * Modal that browses GET /teacher/classrooms/question-options and lets the
 * teacher tick questions for one game. Changes apply on "Done".
 */
export function QuestionPickerDialog({
    open,
    onClose,
    game,
    gameTitle,
    selected,
    onApply,
    max,
    subjects,
    topics,
    grades,
}: {
    open: boolean;
    onClose: () => void;
    game: string;
    gameTitle: string;
    selected: QuestionPick[];
    onApply: (picks: QuestionPick[]) => void;
    max: number;
    subjects: string[];
    topics: Topic[];
    grades: number[];
}) {
    const { t } = useTranslations();
    const subjectName = useSubjectName();
    const localized = useLocalized();
    const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
    const [search, setSearch] = useState('');
    const [result, setResult] = useState<QuestionOptionsPage | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(false);
    const [picks, setPicks] = useState<QuestionPick[]>(selected);

    useEffect(() => {
        if (open) {
            setPicks(selected);
            setFilters(EMPTY_FILTERS);
            setSearch('');
            setResult(null);
            setError(false);
        }
        // Only reset the draft and filters when the dialog opens.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const load = useCallback(
        async (current: Filters) => {
            setLoading(true);
            setError(false);
            const params = new URLSearchParams({ game });
            if (current.search) params.set('search', current.search);
            if (current.subject) params.set('subject', current.subject);
            if (current.topic) params.set('topic', current.topic);
            if (current.level) params.set('level', current.level);
            if (current.grade) params.set('grade', current.grade);
            if (current.mine) params.set('mine', '1');
            if (current.page > 1) params.set('page', String(current.page));
            try {
                const { data, response } = await http.get<QuestionOptionsPage>(
                    `/teacher/classrooms/questions?${params.toString()}`,
                );
                if (!response.ok || !data) {
                    setError(true);
                    return;
                }
                setResult(data);
            } catch {
                setError(true);
            } finally {
                setLoading(false);
            }
        },
        [game],
    );

    useEffect(() => {
        if (open && filters.subject) {
            void load(filters);
        }
    }, [open, filters, load]);

    const hasSubject = Boolean(filters.subject);

    const update = (next: Partial<Filters>) =>
        setFilters((current) => ({ ...current, page: 1, ...next }));

    const submitSearch = (event: FormEvent) => {
        event.preventDefault();
        update({ search: search.trim().slice(0, 100) });
    };

    const pickedIds = new Set(picks.map((pick) => pick.id));
    const full = picks.length >= max;
    const toggle = (question: QuestionPick) => {
        setPicks((current) =>
            current.some((pick) => pick.id === question.id)
                ? current.filter((pick) => pick.id !== question.id)
                : current.length >= max
                  ? current
                  : [...current, question],
        );
    };

    const subjectTopics = filters.subject
        ? topics.filter((topic) => topic.subject_key === filters.subject)
        : topics;

    return (
        <ClassroomDialog
            open={open}
            onClose={onClose}
            wide
            title={t('classroom.picker.title', { game: gameTitle })}
            description={t('classroom.picker.intro', { max })}
            testId="classroom-picker"
            footer={
                <>
                    <span
                        className="mr-auto self-center text-sm font-bold"
                        aria-live="polite"
                        data-testid="classroom-picker-count"
                    >
                        {t('classroom.picker.selected', {
                            count: picks.length,
                            max,
                        })}
                    </span>
                    <button
                        type="button"
                        onClick={onClose}
                        className={actionButtonClass}
                    >
                        {t('classroom.common.cancel')}
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            onApply(picks);
                            onClose();
                        }}
                        className={primaryButtonClass}
                        data-testid="classroom-picker-apply"
                    >
                        <Check className="size-4" aria-hidden="true" />
                        {t('classroom.picker.apply')}
                    </button>
                </>
            }
        >
            <div className="flex flex-col gap-4">
                <div className="grid gap-2 sm:grid-cols-2">
                    <form
                        onSubmit={submitSearch}
                        className="relative sm:col-span-2"
                        role="search"
                    >
                        <Search
                            className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
                            aria-hidden="true"
                        />
                        <input
                            type="search"
                            value={search}
                            disabled={!hasSubject}
                            maxLength={100}
                            onChange={(event) => setSearch(event.target.value)}
                            onBlur={() =>
                                search.trim() !== filters.search &&
                                update({ search: search.trim() })
                            }
                            placeholder={t('classroom.picker.search')}
                            aria-label={t('classroom.picker.search')}
                            className={`${teacherFieldClass} !pl-10`}
                            data-testid="classroom-picker-search"
                        />
                    </form>
                    <select
                        value={filters.subject}
                        onChange={(event) =>
                            update({ subject: event.target.value, topic: '' })
                        }
                        aria-label={t('classroom.picker.subject')}
                        className={teacherFieldClass}
                        data-testid="classroom-picker-subject"
                    >
                        <option value="">
                            {t('classroom.picker.selectSubject')}
                        </option>
                        {subjects.map((subject) => (
                            <option key={subject} value={subject}>
                                {subjectName(subject)}
                            </option>
                        ))}
                    </select>
                    <select
                        value={filters.topic}
                        onChange={(event) =>
                            update({ topic: event.target.value })
                        }
                        aria-label={t('classroom.picker.topic')}
                        className={teacherFieldClass}
                        disabled={!hasSubject || subjectTopics.length === 0}
                        data-testid="classroom-picker-topic"
                    >
                        <option value="">
                            {t('classroom.picker.allTopics')}
                        </option>
                        {subjectTopics.map((topic) => (
                            <option key={topic.id} value={topic.id}>
                                {localized.topic(topic)}
                            </option>
                        ))}
                    </select>
                    <select
                        value={filters.level}
                        onChange={(event) =>
                            update({ level: event.target.value })
                        }
                        aria-label={t('classroom.picker.level')}
                        className={teacherFieldClass}
                        data-testid="classroom-picker-level"
                    >
                        <option value="">
                            {t('classroom.picker.allLevels')}
                        </option>
                        {QUESTION_LEVELS.map((level) => (
                            <option key={level.value} value={level.value}>
                                {t(`classroom.levels.${level.key}`)}
                            </option>
                        ))}
                    </select>
                    <select
                        value={filters.grade}
                        onChange={(event) =>
                            update({ grade: event.target.value })
                        }
                        aria-label={t('classroom.picker.grade')}
                        className={teacherFieldClass}
                        data-testid="classroom-picker-grade"
                    >
                        <option value="">
                            {t('classroom.picker.allGrades')}
                        </option>
                        {grades.map((grade) => (
                            <option key={grade} value={grade}>
                                {gradeLabel(t, grade)}
                            </option>
                        ))}
                    </select>
                    <div className="sm:col-span-2">
                        <Toggle
                            pressed={filters.mine}
                            onClick={() => update({ mine: !filters.mine })}
                            testId="classroom-picker-mine"
                        >
                            <UserRound className="size-4" aria-hidden="true" />
                            {t('classroom.picker.mine')}
                        </Toggle>
                    </div>
                </div>

                {full && (
                    <p
                        role="status"
                        className="rounded-xl border-2 border-[#1f2a44] bg-[#fff4cc] px-3 py-2 text-sm font-bold"
                    >
                        {t('classroom.picker.full', { max })}
                    </p>
                )}

                <div aria-busy={loading} className="flex flex-col gap-2">
                    {!hasSubject ? (
                        <p className="rounded-xl border-2 border-dashed border-[#151b2e]/30 px-4 py-6 text-center text-sm font-bold">
                            {t('classroom.picker.selectSubjectHint')}
                        </p>
                    ) : error ? (
                        <p
                            role="alert"
                            className="rounded-xl border-2 border-[#c0392b] bg-[#ffe9e6] px-3 py-2 text-sm font-bold text-[#8e2a1f]"
                        >
                            {t('classroom.picker.error')}
                        </p>
                    ) : loading && !result ? (
                        <div className="flex justify-center py-8">
                            <Loader2
                                className="size-6 animate-spin motion-reduce:animate-none"
                                aria-label={t('classroom.common.loading')}
                            />
                        </div>
                    ) : result && result.data.length === 0 ? (
                        <p className="rounded-xl border-2 border-dashed border-[#151b2e]/30 px-4 py-6 text-center text-sm font-bold">
                            {t('classroom.picker.empty')}
                        </p>
                    ) : (
                        <ul
                            className={cn(
                                'flex flex-col gap-2',
                                loading && 'opacity-60',
                            )}
                            data-testid="classroom-picker-list"
                        >
                            {result?.data.map((question) => {
                                const picked = pickedIds.has(question.id);
                                return (
                                    <li key={question.id}>
                                        <button
                                            type="button"
                                            onClick={() => toggle(question)}
                                            disabled={!picked && full}
                                            aria-pressed={picked}
                                            className={cn(
                                                'flex w-full min-w-0 items-start gap-3 rounded-xl border-2 border-[#1f2a44] p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                                                picked
                                                    ? 'bg-[#fff4cc]'
                                                    : 'bg-white hover:bg-[#FFFDE6]',
                                            )}
                                            data-testid="classroom-picker-option"
                                        >
                                            <span
                                                className={cn(
                                                    'grid size-7 shrink-0 place-items-center rounded-lg border-2 border-[#1f2a44]',
                                                    picked
                                                        ? 'bg-[#1f2a44] text-white'
                                                        : 'bg-white',
                                                )}
                                                aria-hidden="true"
                                            >
                                                {picked ? (
                                                    <Check className="size-4" />
                                                ) : (
                                                    <Plus className="size-4" />
                                                )}
                                            </span>
                                            <QuestionSummary
                                                question={question}
                                            />
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>

                {result && result.last_page > 1 && (
                    <nav
                        className="flex flex-wrap items-center justify-between gap-2"
                        aria-label={t('classroom.common.page', {
                            current: result.current_page,
                            last: result.last_page,
                        })}
                    >
                        <span className="text-sm text-muted-foreground">
                            {t('classroom.common.page', {
                                current: result.current_page,
                                last: result.last_page,
                            })}
                        </span>
                        <div className="flex gap-2">
                            <button
                                type="button"
                                className={actionButtonClass}
                                disabled={result.current_page <= 1 || loading}
                                onClick={() =>
                                    setFilters((current) => ({
                                        ...current,
                                        page: current.page - 1,
                                    }))
                                }
                                aria-label={t('classroom.common.prev')}
                            >
                                <ChevronLeft
                                    className="size-4"
                                    aria-hidden="true"
                                />
                            </button>
                            <button
                                type="button"
                                className={actionButtonClass}
                                disabled={
                                    result.current_page >= result.last_page ||
                                    loading
                                }
                                onClick={() =>
                                    setFilters((current) => ({
                                        ...current,
                                        page: current.page + 1,
                                    }))
                                }
                                aria-label={t('classroom.common.next')}
                                data-testid="classroom-picker-next"
                            >
                                <ChevronRight
                                    className="size-4"
                                    aria-hidden="true"
                                />
                            </button>
                        </div>
                    </nav>
                )}
            </div>
        </ClassroomDialog>
    );
}

/** Prompt + subject / topic / level / mine chips of a question. */
export function QuestionSummary({ question }: { question: QuestionPick }) {
    const { t } = useTranslations();
    const subjectName = useSubjectName();
    const localized = useLocalized();
    return (
        <span className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span className="text-sm font-semibold break-words">
                {localized.prompt(question)}
            </span>
            <span className="flex flex-wrap items-center gap-1.5 text-xs font-bold">
                <span className="rounded-full border-2 border-[#1f2a44] bg-[#fff0cf] px-2 py-0.5">
                    {subjectName(question.subject)}
                </span>
                {question.topic && (
                    <span className="rounded-full border-2 border-[#1f2a44] bg-[#efeaff] px-2 py-0.5">
                        {localized.topic(question.topic)}
                    </span>
                )}
                <span className="rounded-full border-2 border-[#1f2a44] bg-[#e0f0ff] px-2 py-0.5">
                    {t('classroom.picker.gradeValue', {
                        grade: question.grades
                            .map((grade) => gradeLabel(t, grade))
                            .join(', '),
                    })}
                </span>
                <span className="rounded-full border-2 border-[#1f2a44] bg-[#f3e8ff] px-2 py-0.5">
                    {t('classroom.picker.levelValue', {
                        level: t(
                            `classroom.levels.${questionLevelKey(question.level)}`,
                        ),
                    })}
                </span>
                {question.type === 'true_false' && (
                    <span className="rounded-full border-2 border-[#1f2a44] bg-white px-2 py-0.5">
                        {t('classroom.picker.trueFalse')}
                    </span>
                )}
                {question.is_mine && (
                    <span className="rounded-full border-2 border-[#1f2a44] bg-[#c9f5e5] px-2 py-0.5">
                        {t('classroom.picker.mineBadge')}
                    </span>
                )}
            </span>
        </span>
    );
}
