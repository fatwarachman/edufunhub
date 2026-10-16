import { AiBadge, FlashMessages } from '@/components/admin/admin-kit';
import {
    fieldClass,
    gameLabel,
    Panel,
    QUESTION_LEVEL_LABELS,
    useSubjectLabel,
} from '@/components/admin/game-stats';
import {
    type Generation,
    GenerationRow,
    gradeLabel,
    useGenerationPolling,
} from '@/components/admin/generation-progress';
import InputError from '@/components/input-error';
import AdminLayout from '@/layouts/admin-layout';
import { tr } from '@/lib/admin-i18n';
import { SubjectIcon, useSubjects } from '@/lib/subjects';
import { cn } from '@/lib/utils';
import { Head, Link, useForm } from '@inertiajs/react';
import {
    ArrowLeft,
    Bot,
    Check,
    ChevronDown,
    CircleAlert,
    Gamepad2,
    Gauge,
    GraduationCap,
    History,
    Loader2,
    Minus,
    Plus,
    Search,
    Sparkles,
    Star,
    X,
} from 'lucide-react';
import { type FormEvent, type ReactNode, useState } from 'react';

interface TopicOption {
    id: number;
    subject_key: string;
    name_id: string;
    name_en: string | null;
    material: string | null;
}

interface Props {
    ai: { configured: boolean; model: string | null };
    subjects: string[];
    topics: TopicOption[];
    grades: number[];
    games: string[];
    maxPerCombination: number;
    maxTotal: number;
    aiTotal: number;
    generations: Generation[];
    errors?: Record<string, string>;
}

export default function GenerateQuestions({
    ai,
    subjects,
    topics,
    grades,
    games,
    maxPerCombination,
    maxTotal,
    aiTotal,
    generations,
    errors: pageErrors,
}: Props) {
    const form = useForm({
        scope: 'custom' as 'all' | 'custom',
        subjects: [] as string[],
        topic_ids: [] as number[],
        grades: [] as number[],
        per_combination: 5,
        level: 1,
        games: [...games],
        activate: false,
    });
    const { data, setData, errors, processing } = form;
    const pickedSubjects = data.scope === 'all' ? subjects : data.subjects;
    const pickedGrades = data.scope === 'all' ? grades : data.grades;
    const topicsOf = (subject: string) =>
        topics.filter((topic) => topic.subject_key === subject);
    const pickedTopicIds = data.scope === 'all' ? [] : data.topic_ids;
    const targets =
        pickedSubjects.reduce(
            (sum, subject) => sum + Math.max(1, topicsOf(subject).length),
            0,
        ) + pickedTopicIds.length;
    const total = targets * pickedGrades.length * data.per_combination;
    const running = useGenerationPolling(generations, [
        'generations',
        'aiTotal',
    ]);

    const submit = (event: FormEvent) => {
        event.preventDefault();
        form.post('/admin/questions/generate', { preserveScroll: true });
    };

    return (
        <AdminLayout title="Generate questions">
            <Head title={tr('Generate questions')} />
            <div className="flex w-full flex-col gap-6">
                <div>
                    <Link
                        href="/admin/questions"
                        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
                    >
                        <ArrowLeft className="size-4" />
                        {tr('Question Bank')}
                    </Link>
                    <h1 className="mt-2 flex items-center gap-2 text-2xl font-bold text-foreground">
                        <Sparkles className="size-6 text-violet-500" />
                        {tr('Generate questions with AI')}
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        {tr(
                            'Bilingual multiple choice questions per subject and grade. Every generated question is flagged',
                        )}{' '}
                        <AiBadge /> {tr('in the bank (')}
                        {aiTotal} {tr('so far).')}
                    </p>
                </div>

                <FlashMessages errors={pageErrors} />

                {!ai.configured ? (
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
                        <span className="flex items-center gap-2">
                            <CircleAlert className="size-4 shrink-0" />
                            {tr(
                                'Connect an AI server and choose a model first.',
                            )}
                        </span>
                        <Link href="/admin/ai-settings" className="link">
                            {tr('Open AI Settings')}
                        </Link>
                    </div>
                ) : (
                    <p className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Bot className="size-4" />
                        {tr('Model')}{' '}
                        <span className="font-mono text-foreground">
                            {ai.model}
                        </span>
                        ·{' '}
                        <Link href="/admin/ai-settings" className="link">
                            {tr('change')}
                        </Link>
                    </p>
                )}

                <Panel title={tr('What to generate')} icon={Sparkles}>
                    <form
                        onSubmit={submit}
                        className="flex flex-col gap-6"
                        data-testid="generate-form"
                    >
                        <div
                            className="grid gap-2 sm:grid-cols-2"
                            role="radiogroup"
                            aria-label={tr('Scope')}
                        >
                            <ScopeCard
                                selected={data.scope === 'all'}
                                onSelect={() => setData('scope', 'all')}
                                title={tr('Every subject and grade')}
                                detail={tr(
                                    '{0} subjects × {1} grades (TK–12)',
                                    [subjects.length, grades.length],
                                )}
                                testId="scope-all"
                            />
                            <ScopeCard
                                selected={data.scope === 'custom'}
                                onSelect={() => setData('scope', 'custom')}
                                title={tr('Chosen subjects and grades')}
                                detail={tr('Pick below')}
                                testId="scope-custom"
                            />
                        </div>

                        {data.scope === 'custom' && (
                            <>
                                <SubjectTopicTree
                                    subjects={subjects}
                                    topicsOf={topicsOf}
                                    pickedSubjects={data.subjects}
                                    pickedTopics={data.topic_ids}
                                    error={
                                        errors.subjects ??
                                        Object.entries(
                                            errors as Record<string, string>,
                                        ).find(([key]) =>
                                            key.startsWith('topic_ids'),
                                        )?.[1]
                                    }
                                    onChange={(next) =>
                                        setData((current) => ({
                                            ...current,
                                            ...next,
                                        }))
                                    }
                                />
                                <GradePicker
                                    grades={grades}
                                    picked={data.grades}
                                    error={errors.grades}
                                    onChange={(next) => setData('grades', next)}
                                />
                            </>
                        )}

                        <LevelPicker
                            level={data.level}
                            perCombination={data.per_combination}
                            maxPerCombination={maxPerCombination}
                            levelError={
                                (errors as Record<string, string>).level
                            }
                            perError={errors.per_combination}
                            onLevel={(level) => setData('level', level)}
                            onPer={(value) => setData('per_combination', value)}
                        />

                        <GamePicker
                            games={games}
                            picked={data.games}
                            error={errors.games}
                            onChange={(next) => setData('games', next)}
                        />

                        <label className="flex items-start gap-2 text-sm text-foreground">
                            <input
                                type="checkbox"
                                checked={data.activate}
                                onChange={(event) =>
                                    setData('activate', event.target.checked)
                                }
                                className="mt-0.5 size-4 rounded border-input"
                            />
                            <span>
                                {tr('Activate immediately')}
                                <span className="block text-xs text-muted-foreground">
                                    {tr(
                                        'Off: questions wait inactive so you can review them first (recommended).',
                                    )}
                                </span>
                            </span>
                        </label>

                        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                            <p
                                className={cn(
                                    'text-sm',
                                    total > maxTotal
                                        ? 'font-medium text-destructive'
                                        : 'text-muted-foreground',
                                )}
                                data-testid="gen-total"
                            >
                                {targets} {tr('subjects/topics ×')}{' '}
                                {pickedGrades.length} {tr('grades ×')}{' '}
                                {data.per_combination} = <b>{total}</b>{' '}
                                {tr('questions (max')} {maxTotal})
                            </p>
                            <button
                                type="submit"
                                disabled={
                                    !ai.configured ||
                                    processing ||
                                    total === 0 ||
                                    total > maxTotal ||
                                    data.games.length === 0
                                }
                                className="inline-flex h-10 items-center gap-2 rounded-lg bg-violet-600 px-4 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
                                data-testid="gen-submit"
                            >
                                {processing ? (
                                    <Loader2 className="size-4 animate-spin" />
                                ) : (
                                    <Sparkles className="size-4" />
                                )}
                                {tr('Generate')} {total} {tr('questions')}
                            </button>
                        </div>
                    </form>
                </Panel>

                <Panel
                    title={tr('Recent requests')}
                    icon={History}
                    description={
                        running ? tr('Updating every few seconds…') : undefined
                    }
                >
                    {generations.length === 0 ? (
                        <p className="py-4 text-center text-sm text-muted-foreground">
                            {tr('Nothing generated yet.')}
                        </p>
                    ) : (
                        <ul
                            className="flex flex-col divide-y divide-border"
                            data-testid="generations"
                        >
                            {generations.map((g) => (
                                <GenerationRow key={g.id} generation={g} />
                            ))}
                        </ul>
                    )}
                </Panel>
            </div>
        </AdminLayout>
    );
}

const PANEL_CLASS =
    'flex flex-col gap-3 rounded-2xl border-2 border-[#1f2a44] bg-card p-3 shadow-[2px_2px_0_#1f2a44] sm:p-4 dark:border-white/20 dark:shadow-none';

function PanelHeader({
    icon: Icon,
    tone,
    title,
    detail,
    children,
}: {
    icon: typeof Gamepad2;
    tone: string;
    title: string;
    detail: ReactNode;
    children?: ReactNode;
}) {
    return (
        <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
                <span
                    className="grid size-9 shrink-0 place-items-center rounded-xl border-2 border-[#1f2a44] text-[#1f2a44]"
                    style={{ background: tone }}
                >
                    <Icon className="size-4" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                    <span className="block text-sm font-bold text-foreground">
                        {title}
                    </span>
                    <span
                        className="block text-xs text-muted-foreground tabular-nums"
                        aria-live="polite"
                    >
                        {detail}
                    </span>
                </span>
            </div>
            {children}
        </div>
    );
}

const GRADE_STAGES: { key: string; label: string; grades: number[] }[] = [
    { key: 'tk', label: 'Kindergarten (TK)', grades: [0] },
    { key: 'sd', label: 'Elementary (SD)', grades: [1, 2, 3, 4, 5, 6] },
    { key: 'smp', label: 'Junior high (SMP)', grades: [7, 8, 9] },
    { key: 'sma', label: 'Senior high (SMA)', grades: [10, 11, 12] },
];

function GradePicker({
    grades,
    picked,
    error,
    onChange,
}: {
    grades: number[];
    picked: number[];
    error?: string;
    onChange: (next: number[]) => void;
}) {
    const stages = GRADE_STAGES.map((stage) => ({
        ...stage,
        grades: stage.grades.filter((grade) => grades.includes(grade)),
    })).filter((stage) => stage.grades.length > 0);
    const allPicked = grades.every((grade) => picked.includes(grade));
    const toggleGrade = (grade: number) =>
        onChange(
            picked.includes(grade)
                ? picked.filter((value) => value !== grade)
                : [...picked, grade].sort((a, b) => a - b),
        );
    const toggleStage = (stageGrades: number[]) => {
        const full = stageGrades.every((grade) => picked.includes(grade));
        onChange(
            full
                ? picked.filter((grade) => !stageGrades.includes(grade))
                : [...new Set([...picked, ...stageGrades])].sort(
                      (a, b) => a - b,
                  ),
        );
    };

    return (
        <fieldset className={PANEL_CLASS} data-testid="gen-grades">
            <legend className="sr-only">{tr('Grades')}</legend>
            <PanelHeader
                icon={GraduationCap}
                tone="#8fb8ff"
                title={tr('Grades')}
                detail={tr('{0} of {1} grades picked', [
                    picked.length,
                    grades.length,
                ])}
            >
                <button
                    type="button"
                    onClick={() => onChange(allPicked ? [] : [...grades])}
                    className="inline-flex h-9 shrink-0 items-center rounded-lg border border-border px-3 text-xs font-medium text-foreground hover:bg-muted"
                    data-testid="gen-grades-all"
                >
                    {allPicked ? tr('Unpick all') : tr('Pick all')}
                </button>
            </PanelHeader>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-[auto_minmax(0,2fr)_minmax(0,1.2fr)_minmax(0,1.2fr)]">
                {stages.map((stage) => {
                    const count = stage.grades.filter((grade) =>
                        picked.includes(grade),
                    ).length;
                    const full = count === stage.grades.length;
                    return (
                        <div
                            key={stage.key}
                            className={cn(
                                'flex min-w-0 flex-col gap-2 rounded-xl border p-2.5 transition-colors',
                                count > 0
                                    ? 'border-violet-300 bg-violet-50/60 dark:border-violet-800 dark:bg-violet-950/30'
                                    : 'border-border',
                            )}
                            data-testid={`gen-grade-stage-${stage.key}`}
                        >
                            <button
                                type="button"
                                onClick={() => toggleStage(stage.grades)}
                                aria-pressed={full}
                                className="flex items-center justify-between gap-2 text-left text-xs font-semibold text-foreground hover:text-violet-700 dark:hover:text-violet-300"
                            >
                                <span className="truncate">
                                    {tr(stage.label)}
                                </span>
                                <span className="shrink-0 font-normal text-muted-foreground tabular-nums">
                                    {count}/{stage.grades.length}
                                </span>
                            </button>
                            <div className="flex flex-wrap gap-1.5">
                                {stage.grades.map((grade) => {
                                    const selected = picked.includes(grade);
                                    return (
                                        <button
                                            key={grade}
                                            type="button"
                                            aria-pressed={selected}
                                            onClick={() => toggleGrade(grade)}
                                            className={cn(
                                                'inline-flex h-9 min-w-9 items-center justify-center rounded-lg border px-2.5 text-sm font-semibold tabular-nums transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                                                selected
                                                    ? 'border-violet-600 bg-violet-600 text-white shadow-[2px_2px_0_#1f2a44] dark:shadow-none'
                                                    : 'border-border bg-background text-foreground hover:border-violet-400',
                                            )}
                                            title={gradeLabel(grade)}
                                            data-testid={`gen-grade-${grade}`}
                                        >
                                            {grade === 0 ? tr('TK') : grade}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>
            <InputError message={error} />
        </fieldset>
    );
}

const LEVEL_OPTIONS: {
    value: number;
    hint: string;
    tone: string;
}[] = [
    {
        value: 1,
        hint: 'Basic recall most pupils of the grade know.',
        tone: '#5ad1a6',
    },
    {
        value: 2,
        hint: 'Needs understanding or one reasoning step.',
        tone: '#ffd93d',
    },
    {
        value: 3,
        hint: 'Multi-step, challenging but fair for the grade.',
        tone: '#ff8a5c',
    },
];

function LevelPicker({
    level,
    perCombination,
    maxPerCombination,
    levelError,
    perError,
    onLevel,
    onPer,
}: {
    level: number;
    perCombination: number;
    maxPerCombination: number;
    levelError?: string;
    perError?: string;
    onLevel: (level: number) => void;
    onPer: (value: number) => void;
}) {
    const clamp = (value: number) =>
        Math.min(maxPerCombination, Math.max(1, Math.round(value) || 1));

    return (
        <fieldset className={PANEL_CLASS} data-testid="gen-level">
            <legend className="sr-only">{tr('Question level')}</legend>
            <PanelHeader
                icon={Gauge}
                tone="#c4a7ff"
                title={tr('Question level & amount')}
                detail={tr(
                    'Level ×{0} points · {1} questions per topic & grade',
                    [level, perCombination],
                )}
            />
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
                <div
                    className="grid gap-2 sm:grid-cols-3"
                    role="radiogroup"
                    aria-label={tr('Question level')}
                >
                    {LEVEL_OPTIONS.map((option) => {
                        const selected = level === option.value;
                        return (
                            <button
                                key={option.value}
                                type="button"
                                role="radio"
                                aria-checked={selected}
                                onClick={() => onLevel(option.value)}
                                className={cn(
                                    'flex min-w-0 items-start gap-2.5 rounded-xl border-2 p-2.5 text-left transition-[box-shadow,background-color,border-color] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                                    selected
                                        ? 'border-[#1f2a44] bg-violet-50 shadow-[3px_3px_0_#1f2a44] dark:border-violet-500 dark:bg-violet-950/40 dark:shadow-none'
                                        : 'border-border hover:bg-muted/60',
                                )}
                                data-testid={`gen-level-${option.value}`}
                            >
                                <span
                                    className="grid size-8 shrink-0 place-items-center rounded-lg border-2 border-[#1f2a44] text-xs font-bold text-[#1f2a44] tabular-nums"
                                    style={{ background: option.tone }}
                                    aria-hidden="true"
                                >
                                    ×{option.value}
                                </span>
                                <span className="min-w-0">
                                    <span className="flex items-center gap-1 text-sm font-bold text-foreground">
                                        {tr(
                                            QUESTION_LEVEL_LABELS[option.value],
                                        )}
                                        <span
                                            className="flex text-amber-500"
                                            aria-hidden="true"
                                        >
                                            {Array.from(
                                                { length: option.value },
                                                (_, index) => (
                                                    <Star
                                                        key={index}
                                                        className="size-3 fill-current"
                                                    />
                                                ),
                                            )}
                                        </span>
                                    </span>
                                    <span className="mt-0.5 block text-xs text-muted-foreground">
                                        {tr(option.hint)}
                                    </span>
                                </span>
                            </button>
                        );
                    })}
                </div>
                <div className="flex flex-col gap-1.5 rounded-xl border border-border p-2.5">
                    <label
                        htmlFor="gen-per"
                        className="text-xs font-semibold text-foreground"
                    >
                        {tr('Questions per topic & grade')}
                    </label>
                    <div className="flex items-center gap-1.5">
                        <button
                            type="button"
                            onClick={() => onPer(clamp(perCombination - 1))}
                            disabled={perCombination <= 1}
                            aria-label={tr('Fewer questions')}
                            className="grid size-9 place-items-center rounded-lg border border-border text-foreground hover:bg-muted disabled:opacity-40"
                        >
                            <Minus className="size-4" />
                        </button>
                        <input
                            id="gen-per"
                            type="number"
                            min={1}
                            max={maxPerCombination}
                            value={perCombination}
                            onChange={(event) =>
                                onPer(clamp(Number(event.target.value)))
                            }
                            className={cn(
                                fieldClass,
                                'w-16 text-center tabular-nums',
                            )}
                            data-testid="gen-per"
                        />
                        <button
                            type="button"
                            onClick={() => onPer(clamp(perCombination + 1))}
                            disabled={perCombination >= maxPerCombination}
                            aria-label={tr('More questions')}
                            className="grid size-9 place-items-center rounded-lg border border-border text-foreground hover:bg-muted disabled:opacity-40"
                        >
                            <Plus className="size-4" />
                        </button>
                    </div>
                    <span className="text-[11px] text-muted-foreground">
                        {tr('Max {0}', [maxPerCombination])}
                    </span>
                </div>
            </div>
            <InputError message={levelError ?? perError} />
        </fieldset>
    );
}

function GamePicker({
    games,
    picked,
    error,
    onChange,
}: {
    games: string[];
    picked: string[];
    error?: string;
    onChange: (next: string[]) => void;
}) {
    const [query, setQuery] = useState('');
    const needle = query.trim().toLowerCase();
    const visible = needle
        ? games.filter(
              (game) =>
                  gameLabel(game).toLowerCase().includes(needle) ||
                  game.includes(needle),
          )
        : games;
    const allVisiblePicked =
        visible.length > 0 && visible.every((game) => picked.includes(game));
    const toggleGame = (game: string) =>
        onChange(
            picked.includes(game)
                ? picked.filter((key) => key !== game)
                : [...picked, game],
        );
    const toggleVisible = () =>
        onChange(
            allVisiblePicked
                ? picked.filter((game) => !visible.includes(game))
                : [...new Set([...picked, ...visible])],
        );

    return (
        <fieldset className={PANEL_CLASS} data-testid="gen-games">
            <legend className="sr-only">{tr('Use in games')}</legend>
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                    <span className="grid size-9 shrink-0 place-items-center rounded-xl border-2 border-[#1f2a44] bg-[#FFF176] text-[#1f2a44]">
                        <Gamepad2 className="size-4" aria-hidden="true" />
                    </span>
                    <span className="min-w-0">
                        <span className="block text-sm font-bold text-foreground">
                            {tr('Use in games')}
                        </span>
                        <span
                            className="block text-xs text-muted-foreground tabular-nums"
                            aria-live="polite"
                            data-testid="gen-games-count"
                        >
                            {tr('{0} of {1} games picked', [
                                picked.length,
                                games.length,
                            ])}
                        </span>
                    </span>
                </div>
                <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                    <div className="relative min-w-0 flex-1 sm:w-64 sm:flex-none">
                        <Search
                            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                            aria-hidden="true"
                        />
                        <input
                            type="search"
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder={tr('Search games…')}
                            aria-label={tr('Search games')}
                            className={cn(fieldClass, 'pr-8 pl-9')}
                            data-testid="gen-games-search"
                        />
                        {query && (
                            <button
                                type="button"
                                onClick={() => setQuery('')}
                                aria-label={tr('Clear search')}
                                className="absolute top-1/2 right-2 grid size-6 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                            >
                                <X className="size-3.5" />
                            </button>
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={toggleVisible}
                        disabled={visible.length === 0}
                        className="inline-flex h-9 shrink-0 items-center rounded-lg border border-border px-3 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-40"
                        data-testid="gen-games-toggle-visible"
                    >
                        {allVisiblePicked
                            ? tr('Unpick shown')
                            : tr('Pick shown')}
                    </button>
                </div>
            </div>
            {visible.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
                    {tr('No game matches “{0}”.', [query.trim()])}
                </p>
            ) : (
                <ul className="grid max-h-72 grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                    {visible.map((game) => {
                        const selected = picked.includes(game);
                        return (
                            <li key={game} className="min-w-0">
                                <button
                                    type="button"
                                    role="checkbox"
                                    aria-checked={selected}
                                    onClick={() => toggleGame(game)}
                                    className={cn(
                                        'flex h-11 w-full min-w-0 items-center gap-2 rounded-xl border px-2.5 text-left text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                                        selected
                                            ? 'border-violet-400 bg-violet-50 font-medium text-violet-900 dark:border-violet-700 dark:bg-violet-950/40 dark:text-violet-100'
                                            : 'border-border text-foreground hover:bg-muted/60',
                                    )}
                                    data-testid={`gen-game-${game}`}
                                >
                                    <span
                                        className={cn(
                                            'grid size-5 shrink-0 place-items-center rounded-md border transition-colors',
                                            selected
                                                ? 'border-violet-600 bg-violet-600 text-white'
                                                : 'border-input bg-background',
                                        )}
                                        aria-hidden="true"
                                    >
                                        {selected && (
                                            <Check className="size-3.5" />
                                        )}
                                    </span>
                                    <span className="min-w-0 truncate">
                                        {gameLabel(game)}
                                    </span>
                                </button>
                            </li>
                        );
                    })}
                </ul>
            )}
            <InputError message={error} />
        </fieldset>
    );
}

function SubjectTopicTree({
    subjects,
    topicsOf,
    pickedSubjects,
    pickedTopics,
    error,
    onChange,
}: {
    subjects: string[];
    topicsOf: (subject: string) => TopicOption[];
    pickedSubjects: string[];
    pickedTopics: number[];
    error?: string;
    onChange: (next: { subjects: string[]; topic_ids: number[] }) => void;
}) {
    const subjectLabel = useSubjectLabel();
    const [open, setOpen] = useState<Set<string>>(new Set());
    const toggleOpen = (subject: string) =>
        setOpen((current) => {
            const next = new Set(current);
            if (next.has(subject)) {
                next.delete(subject);
            } else {
                next.add(subject);
            }
            return next;
        });

    const withoutSubjectTopics = (subject: string) => {
        const ids = new Set(topicsOf(subject).map((topic) => topic.id));
        return pickedTopics.filter((id) => !ids.has(id));
    };

    const toggleSubject = (subject: string) => {
        const whole = pickedSubjects.includes(subject);
        const partial = topicsOf(subject).some((topic) =>
            pickedTopics.includes(topic.id),
        );
        onChange(
            whole || partial
                ? {
                      subjects: pickedSubjects.filter((key) => key !== subject),
                      topic_ids: withoutSubjectTopics(subject),
                  }
                : {
                      subjects: [...pickedSubjects, subject],
                      topic_ids: withoutSubjectTopics(subject),
                  },
        );
    };

    const toggleTopic = (subject: string, topicId: number) => {
        const all = topicsOf(subject).map((topic) => topic.id);
        const current = pickedSubjects.includes(subject)
            ? all
            : pickedTopics.filter((id) => all.includes(id));
        const next = current.includes(topicId)
            ? current.filter((id) => id !== topicId)
            : [...current, topicId];
        const others = withoutSubjectTopics(subject);
        const rest = pickedSubjects.filter((key) => key !== subject);
        onChange(
            next.length === all.length
                ? { subjects: [...rest, subject], topic_ids: others }
                : { subjects: rest, topic_ids: [...others, ...next] },
        );
    };

    const allPicked = subjects.every((subject) =>
        pickedSubjects.includes(subject),
    );
    const catalog = useSubjects();
    const expandable = subjects.filter(
        (subject) => topicsOf(subject).length > 0,
    );
    const allOpen =
        expandable.length > 0 &&
        expandable.every((subject) => open.has(subject));

    return (
        <fieldset className="flex flex-col gap-2" data-testid="gen-tree">
            <legend className="mb-2 flex w-full items-center justify-between gap-2 text-sm font-medium text-foreground">
                <span>
                    {tr('Subjects & topics')}
                    <span className="block text-xs font-normal text-muted-foreground">
                        {tr(
                            'A whole subject covers all its topics. Pick single topics to generate only for them.',
                        )}
                    </span>
                </span>
                <span className="flex shrink-0 items-center gap-3">
                    <button
                        type="button"
                        onClick={() =>
                            setOpen(
                                allOpen
                                    ? new Set()
                                    : new Set(
                                          subjects.filter(
                                              (subject) =>
                                                  topicsOf(subject).length > 0,
                                          ),
                                      ),
                            )
                        }
                        className="text-xs font-normal text-muted-foreground underline underline-offset-2 hover:text-foreground"
                        data-testid="gen-tree-expand-all"
                    >
                        {allOpen ? tr('Collapse all') : tr('Expand all')}
                    </button>
                    <button
                        type="button"
                        onClick={() =>
                            onChange(
                                allPicked
                                    ? { subjects: [], topic_ids: [] }
                                    : {
                                          subjects: [...subjects],
                                          topic_ids: [],
                                      },
                            )
                        }
                        className="text-xs font-normal text-muted-foreground underline underline-offset-2 hover:text-foreground"
                    >
                        {tr('Select all / none')}
                    </button>
                </span>
            </legend>
            <ul className="flex flex-col gap-3">
                {subjects.map((subject) => {
                    const info = catalog.find((item) => item.key === subject);
                    const subjectTopics = topicsOf(subject);
                    const whole = pickedSubjects.includes(subject);
                    const count = whole
                        ? subjectTopics.length
                        : subjectTopics.filter((topic) =>
                              pickedTopics.includes(topic.id),
                          ).length;
                    const partial = !whole && count > 0;
                    const active = whole || partial;
                    const hasTopics = subjectTopics.length > 0;
                    const expanded = hasTopics && open.has(subject);
                    return (
                        <li
                            key={subject}
                            className={cn(
                                'overflow-hidden rounded-2xl border-2 border-[#1f2a44] bg-card transition-[box-shadow,transform] duration-200 dark:border-white/20',
                                active
                                    ? 'shadow-[4px_4px_0_#1f2a44] dark:shadow-[0_0_18px_rgba(167,139,250,0.25)]'
                                    : 'shadow-[2px_2px_0_#1f2a44] dark:shadow-none',
                            )}
                            data-testid={`gen-subject-${subject}`}
                            data-state={expanded ? 'open' : 'closed'}
                        >
                            <div
                                className={cn(
                                    'flex items-center gap-3 px-3 py-2.5 transition-colors sm:px-4',
                                    active &&
                                        'bg-violet-50 dark:bg-violet-950/40',
                                )}
                            >
                                <TriCheckbox
                                    checked={whole}
                                    indeterminate={partial}
                                    onChange={() => toggleSubject(subject)}
                                    label={tr('Pick all of {0}', [
                                        subjectLabel(subject),
                                    ])}
                                    testId={`gen-subject-check-${subject}`}
                                />
                                <button
                                    type="button"
                                    onClick={() =>
                                        hasTopics
                                            ? toggleOpen(subject)
                                            : toggleSubject(subject)
                                    }
                                    aria-expanded={
                                        hasTopics ? expanded : undefined
                                    }
                                    aria-controls={
                                        hasTopics
                                            ? `gen-topics-${subject}`
                                            : undefined
                                    }
                                    className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-lg text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                                    data-testid={`gen-subject-toggle-${subject}`}
                                >
                                    <span
                                        className="grid size-10 shrink-0 place-items-center rounded-xl border-2 border-[#1f2a44] text-[#1f2a44]"
                                        style={{
                                            background:
                                                info?.color ?? '#efeaff',
                                        }}
                                        aria-hidden="true"
                                    >
                                        <SubjectIcon
                                            icon={info?.icon}
                                            className="size-5"
                                        />
                                    </span>
                                    <span className="flex min-w-0 flex-1 flex-col">
                                        <span className="truncate text-sm font-bold text-foreground">
                                            {subjectLabel(subject)}
                                        </span>
                                        <span className="text-xs text-muted-foreground">
                                            {!hasTopics
                                                ? tr(
                                                      'No topics: questions cover the whole subject',
                                                  )
                                                : whole
                                                  ? tr(
                                                        'All {0} topics picked',
                                                        [subjectTopics.length],
                                                    )
                                                  : partial
                                                    ? tr(
                                                          '{0} of {1} topics picked',
                                                          [
                                                              count,
                                                              subjectTopics.length,
                                                          ],
                                                      )
                                                    : tr('{0} topics', [
                                                          subjectTopics.length,
                                                      ])}
                                        </span>
                                    </span>
                                    {hasTopics && (
                                        <span
                                            className={cn(
                                                'grid size-8 shrink-0 place-items-center rounded-full border-2 border-[#1f2a44] bg-background text-foreground transition-[transform,background-color] duration-300 ease-out motion-reduce:transition-none dark:border-white/30',
                                                expanded &&
                                                    'rotate-180 bg-[#FFF176] text-[#1f2a44]',
                                            )}
                                            aria-hidden="true"
                                        >
                                            <ChevronDown className="size-4" />
                                        </span>
                                    )}
                                </button>
                            </div>
                            {hasTopics && (
                                <div
                                    id={`gen-topics-${subject}`}
                                    className={cn(
                                        'grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none',
                                        expanded
                                            ? 'grid-rows-[1fr] opacity-100'
                                            : 'grid-rows-[0fr] opacity-0',
                                    )}
                                    aria-hidden={!expanded}
                                    inert={!expanded}
                                >
                                    <div className="min-h-0 overflow-hidden">
                                        <ul className="grid gap-2 border-t-2 border-dashed border-[#1f2a44]/25 p-3 sm:grid-cols-2 sm:p-4 dark:border-white/15">
                                            {subjectTopics.map((topic) => {
                                                const checked =
                                                    whole ||
                                                    pickedTopics.includes(
                                                        topic.id,
                                                    );
                                                return (
                                                    <li key={topic.id}>
                                                        <label
                                                            className={cn(
                                                                'flex h-full cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2.5 transition-colors',
                                                                checked
                                                                    ? 'border-violet-400 bg-violet-50 dark:border-violet-700 dark:bg-violet-950/40'
                                                                    : 'border-border hover:bg-muted/60',
                                                            )}
                                                        >
                                                            <TriCheckbox
                                                                checked={
                                                                    checked
                                                                }
                                                                onChange={() =>
                                                                    toggleTopic(
                                                                        subject,
                                                                        topic.id,
                                                                    )
                                                                }
                                                                label={
                                                                    topic.name_id
                                                                }
                                                                testId={`gen-topic-${topic.id}`}
                                                            />
                                                            <span className="min-w-0 flex-1">
                                                                <span className="block text-sm font-semibold break-words text-foreground">
                                                                    {
                                                                        topic.name_id
                                                                    }
                                                                </span>
                                                                {topic.material && (
                                                                    <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">
                                                                        {
                                                                            topic.material
                                                                        }
                                                                    </span>
                                                                )}
                                                            </span>
                                                        </label>
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                    </div>
                                </div>
                            )}
                        </li>
                    );
                })}
            </ul>
            <p className="text-xs text-muted-foreground">
                {tr('Need another topic?')}{' '}
                <Link href="/admin/subjects" className="link">
                    {tr('Manage topics in Subjects')}
                </Link>
            </p>
            <InputError message={error} />
        </fieldset>
    );
}

function TriCheckbox({
    checked,
    indeterminate = false,
    onChange,
    label,
    testId,
}: {
    checked: boolean;
    indeterminate?: boolean;
    onChange: () => void;
    label: string;
    testId?: string;
}) {
    return (
        <button
            type="button"
            role="checkbox"
            aria-checked={indeterminate ? 'mixed' : checked}
            aria-label={label}
            onClick={onChange}
            data-testid={testId}
            className={cn(
                'mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                checked || indeterminate
                    ? 'border-violet-600 bg-violet-600 text-white'
                    : 'border-input bg-background hover:border-violet-400',
            )}
        >
            {indeterminate ? (
                <Minus className="size-3.5" />
            ) : checked ? (
                <Check className="size-3.5" />
            ) : null}
        </button>
    );
}

function ScopeCard({
    selected,
    onSelect,
    title,
    detail,
    testId,
}: {
    selected: boolean;
    onSelect: () => void;
    title: string;
    detail: string;
    testId: string;
}) {
    return (
        <button
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={onSelect}
            data-testid={testId}
            className={cn(
                'flex flex-col items-start gap-0.5 rounded-xl border px-4 py-3 text-left transition-colors',
                selected
                    ? 'border-violet-400 bg-violet-50 dark:border-violet-700 dark:bg-violet-950/40'
                    : 'border-border hover:bg-accent',
            )}
        >
            <span className="text-sm font-medium text-foreground">
                {tr(title)}
            </span>
            <span className="text-xs text-muted-foreground">{tr(detail)}</span>
        </button>
    );
}
