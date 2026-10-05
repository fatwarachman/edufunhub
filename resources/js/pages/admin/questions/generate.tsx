import { AiBadge, FlashMessages } from '@/components/admin/admin-kit';
import {
    Panel,
    SUBJECT_LABELS,
    fieldClass,
    formatDateTime,
    gameLabel,
} from '@/components/admin/game-stats';
import InputError from '@/components/input-error';
import AdminLayout from '@/layouts/admin-layout';
import { cn } from '@/lib/utils';
import { Head, Link, router, useForm } from '@inertiajs/react';
import {
    ArrowLeft,
    Bot,
    CircleAlert,
    CircleCheck,
    History,
    Loader2,
    Sparkles,
} from 'lucide-react';
import { type FormEvent, type ReactNode, useEffect } from 'react';

interface Generation {
    id: number;
    model: string;
    subjects: string[];
    grades: number[];
    per_combination: number;
    activate: boolean;
    status: 'queued' | 'running' | 'done' | 'failed';
    total_jobs: number;
    done_jobs: number;
    created_count: number;
    skipped_count: number;
    error: string | null;
    requested_by: string | null;
    created_at: string | null;
    finished_at: string | null;
}

interface Props {
    ai: { configured: boolean; model: string | null };
    subjects: string[];
    grades: number[];
    games: string[];
    maxPerCombination: number;
    maxTotal: number;
    aiTotal: number;
    generations: Generation[];
    errors?: Record<string, string>;
}

const gradeLabel = (grade: number) => (grade === 0 ? 'TK' : `Grade ${grade}`);

export default function GenerateQuestions({
    ai,
    subjects,
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
        grades: [] as number[],
        per_combination: 5,
        games: [...games],
        activate: false,
    });
    const { data, setData, errors, processing } = form;
    const pickedSubjects = data.scope === 'all' ? subjects : data.subjects;
    const pickedGrades = data.scope === 'all' ? grades : data.grades;
    const total =
        pickedSubjects.length * pickedGrades.length * data.per_combination;
    const running = generations.some(
        (g) => g.status === 'queued' || g.status === 'running',
    );

    useEffect(() => {
        if (!running) {
            return;
        }
        const id = setInterval(
            () =>
                router.reload({
                    only: ['generations', 'aiTotal'],
                }),
            4000,
        );
        return () => clearInterval(id);
    }, [running]);

    const toggle = <T,>(list: T[], value: T): T[] =>
        list.includes(value)
            ? list.filter((item) => item !== value)
            : [...list, value];

    const submit = (event: FormEvent) => {
        event.preventDefault();
        form.post('/admin/questions/generate', { preserveScroll: true });
    };

    return (
        <AdminLayout>
            <Head title="Generate questions" />
            <div className="flex w-full flex-col gap-6">
                <div>
                    <Link
                        href="/admin/questions"
                        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
                    >
                        <ArrowLeft className="size-4" />
                        Question Bank
                    </Link>
                    <h1 className="mt-2 flex items-center gap-2 text-2xl font-bold text-foreground">
                        <Sparkles className="size-6 text-violet-500" />
                        Generate questions with AI
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        Bilingual multiple choice questions per subject and
                        grade. Every generated question is flagged <AiBadge />{' '}
                        in the bank ({aiTotal} so far).
                    </p>
                </div>

                <FlashMessages errors={pageErrors} />

                {!ai.configured ? (
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
                        <span className="flex items-center gap-2">
                            <CircleAlert className="size-4 shrink-0" />
                            Connect an AI server and choose a model first.
                        </span>
                        <Link href="/admin/ai-settings" className="link">
                            Open AI Settings
                        </Link>
                    </div>
                ) : (
                    <p className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Bot className="size-4" />
                        Model{' '}
                        <span className="font-mono text-foreground">
                            {ai.model}
                        </span>
                        ·{' '}
                        <Link href="/admin/ai-settings" className="link">
                            change
                        </Link>
                    </p>
                )}

                <Panel title="What to generate" icon={Sparkles}>
                    <form
                        onSubmit={submit}
                        className="flex flex-col gap-6"
                        data-testid="generate-form"
                    >
                        <div
                            className="grid gap-2 sm:grid-cols-2"
                            role="radiogroup"
                            aria-label="Scope"
                        >
                            <ScopeCard
                                selected={data.scope === 'all'}
                                onSelect={() => setData('scope', 'all')}
                                title="Every subject and grade"
                                detail={`${subjects.length} subjects × ${grades.length} grades (TK–12)`}
                                testId="scope-all"
                            />
                            <ScopeCard
                                selected={data.scope === 'custom'}
                                onSelect={() => setData('scope', 'custom')}
                                title="Chosen subjects and grades"
                                detail="Pick below"
                                testId="scope-custom"
                            />
                        </div>

                        {data.scope === 'custom' && (
                            <>
                                <ChipGroup
                                    label="Subjects"
                                    error={errors.subjects}
                                    onAll={() =>
                                        setData(
                                            'subjects',
                                            data.subjects.length ===
                                                subjects.length
                                                ? []
                                                : [...subjects],
                                        )
                                    }
                                >
                                    {subjects.map((subject) => (
                                        <Chip
                                            key={subject}
                                            selected={data.subjects.includes(
                                                subject,
                                            )}
                                            onClick={() =>
                                                setData(
                                                    'subjects',
                                                    toggle(
                                                        data.subjects,
                                                        subject,
                                                    ),
                                                )
                                            }
                                            testId={`gen-subject-${subject}`}
                                        >
                                            {SUBJECT_LABELS[subject] ?? subject}
                                        </Chip>
                                    ))}
                                </ChipGroup>
                                <ChipGroup
                                    label="Grades"
                                    error={errors.grades}
                                    onAll={() =>
                                        setData(
                                            'grades',
                                            data.grades.length === grades.length
                                                ? []
                                                : [...grades],
                                        )
                                    }
                                >
                                    {grades.map((grade) => (
                                        <Chip
                                            key={grade}
                                            selected={data.grades.includes(
                                                grade,
                                            )}
                                            onClick={() =>
                                                setData(
                                                    'grades',
                                                    toggle(data.grades, grade),
                                                )
                                            }
                                            testId={`gen-grade-${grade}`}
                                        >
                                            {gradeLabel(grade)}
                                        </Chip>
                                    ))}
                                </ChipGroup>
                            </>
                        )}

                        <div className="grid gap-5 sm:grid-cols-[200px_minmax(0,1fr)]">
                            <label className="flex flex-col gap-1.5">
                                <span className="text-sm font-medium text-foreground">
                                    Questions per subject & grade
                                </span>
                                <input
                                    type="number"
                                    min={1}
                                    max={maxPerCombination}
                                    value={data.per_combination}
                                    onChange={(event) =>
                                        setData(
                                            'per_combination',
                                            Number(event.target.value),
                                        )
                                    }
                                    className={`${fieldClass} w-28 tabular-nums`}
                                    data-testid="gen-per"
                                />
                                <InputError message={errors.per_combination} />
                            </label>
                            <ChipGroup
                                label="Use in games"
                                error={errors.games}
                            >
                                {games.map((game) => (
                                    <Chip
                                        key={game}
                                        selected={data.games.includes(game)}
                                        onClick={() =>
                                            setData(
                                                'games',
                                                toggle(data.games, game),
                                            )
                                        }
                                    >
                                        {gameLabel(game)}
                                    </Chip>
                                ))}
                            </ChipGroup>
                        </div>

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
                                Activate immediately
                                <span className="block text-xs text-muted-foreground">
                                    Off: questions wait inactive so you can
                                    review them first (recommended).
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
                                {pickedSubjects.length} subjects ×{' '}
                                {pickedGrades.length} grades ×{' '}
                                {data.per_combination} = <b>{total}</b>{' '}
                                questions (max {maxTotal})
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
                                Generate {total} questions
                            </button>
                        </div>
                    </form>
                </Panel>

                <Panel
                    title="Recent requests"
                    icon={History}
                    description={
                        running ? 'Updating every few seconds…' : undefined
                    }
                >
                    {generations.length === 0 ? (
                        <p className="py-4 text-center text-sm text-muted-foreground">
                            Nothing generated yet.
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

function GenerationRow({ generation: g }: { generation: Generation }) {
    const progress =
        g.total_jobs > 0 ? Math.round((g.done_jobs / g.total_jobs) * 100) : 0;
    const live = g.status === 'queued' || g.status === 'running';
    return (
        <li
            className="flex flex-col gap-2 py-3"
            data-testid={`generation-${g.id}`}
            data-status={g.status}
        >
            <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                    {live ? (
                        <Loader2 className="size-4 animate-spin text-violet-500" />
                    ) : g.status === 'failed' ? (
                        <CircleAlert className="size-4 text-destructive" />
                    ) : (
                        <CircleCheck className="size-4 text-emerald-500" />
                    )}
                    {g.created_count} created
                    {g.skipped_count > 0 && (
                        <span className="text-xs font-normal text-muted-foreground">
                            · {g.skipped_count} rejected (invalid or duplicate)
                        </span>
                    )}
                </span>
                <span className="text-xs text-muted-foreground">
                    {formatDateTime(g.created_at)} · {g.requested_by ?? '—'} ·{' '}
                    <span className="font-mono">{g.model}</span>
                </span>
            </div>
            <p className="text-xs text-muted-foreground">
                {g.subjects
                    .map((subject) => SUBJECT_LABELS[subject] ?? subject)
                    .join(', ')}{' '}
                · {g.grades.map(gradeLabel).join(', ')} · {g.per_combination}{' '}
                each · {g.activate ? 'active' : 'inactive for review'}
            </p>
            {live && (
                <div
                    className="h-1.5 overflow-hidden rounded-full bg-muted"
                    role="progressbar"
                    aria-valuenow={progress}
                    aria-valuemin={0}
                    aria-valuemax={100}
                >
                    <div
                        className="h-full rounded-full bg-violet-500 transition-[width]"
                        style={{ width: `${Math.max(4, progress)}%` }}
                    />
                </div>
            )}
            {g.error && <p className="text-xs text-destructive">{g.error}</p>}
            {g.created_count > 0 && !live && (
                <Link
                    href="/admin/questions?source=ai"
                    className="self-start link text-xs"
                >
                    Review AI questions
                </Link>
            )}
        </li>
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
            <span className="text-sm font-medium text-foreground">{title}</span>
            <span className="text-xs text-muted-foreground">{detail}</span>
        </button>
    );
}

function ChipGroup({
    label,
    error,
    onAll,
    children,
}: {
    label: string;
    error?: string;
    onAll?: () => void;
    children: ReactNode;
}) {
    return (
        <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 flex w-full items-center justify-between gap-2 text-sm font-medium text-foreground">
                {label}
                {onAll && (
                    <button
                        type="button"
                        onClick={onAll}
                        className="text-xs font-normal text-muted-foreground underline underline-offset-2 hover:text-foreground"
                    >
                        Select all / none
                    </button>
                )}
            </legend>
            <div className="flex flex-wrap gap-2">{children}</div>
            <InputError message={error} />
        </fieldset>
    );
}

function Chip({
    selected,
    onClick,
    testId,
    children,
}: {
    selected: boolean;
    onClick: () => void;
    testId?: string;
    children: ReactNode;
}) {
    return (
        <button
            type="button"
            aria-pressed={selected}
            onClick={onClick}
            data-testid={testId}
            className={cn(
                'inline-flex h-8 items-center rounded-full border px-3 text-sm transition-colors',
                selected
                    ? 'border-violet-500 bg-violet-600 text-white'
                    : 'border-border text-foreground hover:bg-accent',
            )}
        >
            {children}
        </button>
    );
}
