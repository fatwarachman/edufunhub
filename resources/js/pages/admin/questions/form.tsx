import {
    BAND_LABELS,
    QUESTION_LEVEL_LABELS,
    fieldClass,
    formatNumber,
    formatPercent,
    gameLabel,
    rateTone,
    useSubjectLabel,
} from '@/components/admin/game-stats';
import InputError from '@/components/input-error';
import AdminLayout from '@/layouts/admin-layout';
import { tr } from '@/lib/admin-i18n';
import { cn } from '@/lib/utils';
import { Head, Link, useForm } from '@inertiajs/react';
import { ArrowLeft, CircleCheck, Loader2, Plus, X } from 'lucide-react';
import { type FormEventHandler, type ReactNode } from 'react';

interface Option {
    id: string;
    en: string;
}

interface QuestionData {
    id: number;
    key: string;
    type: 'choice' | 'true_false';
    band: number;
    level: number;
    subject: string;
    prompt_id: string;
    prompt_en: string | null;
    options: { id: string; en?: string }[] | null;
    answer: number;
    hint_id: string | null;
    hint_en: string | null;
    games: string[];
    is_active: boolean;
    points: number | null;
    times_answered: number;
    success_rate: number | null;
}

interface FormProps {
    question: QuestionData | null;
    defaultSubject?: string | null;
    games: string[];
    choiceOnlyGames: string[];
    subjects: string[];
    bands: { value: number; min: number; max: number }[];
    levels: { value: number; multiplier: number }[];
    perCorrect: number;
    maxPoints: number;
}

const MIN_OPTIONS = 3;
const MAX_OPTIONS = 6;
const blankOption = (): Option => ({ id: '', en: '' });

export default function QuestionForm({
    question,
    defaultSubject,
    games,
    choiceOnlyGames,
    subjects,
    bands,
    levels,
    perCorrect,
    maxPoints,
}: FormProps) {
    const subjectLabel = useSubjectLabel();
    const editing = question !== null;
    const backHref = `/admin/questions?subject=${question?.subject ?? defaultSubject ?? 'all'}`;
    const form = useForm({
        type: question?.type ?? 'choice',
        band: question?.band ?? 0,
        level: question?.level ?? 1,
        subject: question?.subject ?? defaultSubject ?? subjects[0],
        prompt_id: question?.prompt_id ?? '',
        prompt_en: question?.prompt_en ?? '',
        options: (question?.options?.map((option) => ({
            id: option.id,
            en: option.en ?? '',
        })) ?? [
            blankOption(),
            blankOption(),
            blankOption(),
            blankOption(),
        ]) as Option[],
        answer: question?.answer ?? 0,
        hint_id: question?.hint_id ?? '',
        hint_en: question?.hint_en ?? '',
        games: question?.games ?? [...games],
        is_active: question?.is_active ?? true,
        bonus: (question?.points ?? 0) > 0,
        points: question?.points ?? perCorrect * 2,
    });
    const { data, setData, errors, processing } = form;
    const isChoice = data.type === 'choice';
    const errorFor = (key: string): string | undefined =>
        (errors as Record<string, string>)[key];

    const submit: FormEventHandler = (event) => {
        event.preventDefault();
        form.transform(({ bonus, points, ...rest }) => ({
            ...rest,
            points: bonus ? points : null,
        }));
        if (editing) {
            form.put(`/admin/questions/${question.id}`);
        } else {
            form.post('/admin/questions');
        }
    };

    const setType = (type: 'choice' | 'true_false') => {
        form.setData((current) => ({
            ...current,
            type,
            answer: type === 'true_false' ? 1 : 0,
            games:
                type === 'true_false'
                    ? current.games.filter(
                          (game) => !choiceOnlyGames.includes(game),
                      )
                    : current.games,
            options:
                current.options.length >= MIN_OPTIONS
                    ? current.options
                    : [blankOption(), blankOption(), blankOption()],
        }));
    };

    const updateOption = (
        index: number,
        field: keyof Option,
        value: string,
    ) => {
        setData(
            'options',
            data.options.map((option, i) =>
                i === index ? { ...option, [field]: value } : option,
            ),
        );
    };

    const removeOption = (index: number) => {
        setData((current) => ({
            ...current,
            options: current.options.filter((_, i) => i !== index),
            answer:
                current.answer === index
                    ? 0
                    : current.answer > index
                      ? current.answer - 1
                      : current.answer,
        }));
    };

    const toggleGame = (game: string) => {
        setData(
            'games',
            data.games.includes(game)
                ? data.games.filter((g) => g !== game)
                : [...data.games, game],
        );
    };

    return (
        <>
            <Head title={editing ? tr('Edit question') : tr('Add question')} />
            <form
                onSubmit={submit}
                className="flex w-full flex-col gap-6"
                noValidate
            >
                <div className="flex flex-col gap-2">
                    <Link
                        href={backHref}
                        className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
                    >
                        <ArrowLeft className="size-4" />
                        {tr('Question bank')}
                        {(question?.subject ?? defaultSubject) &&
                            ` · ${subjectLabel(question?.subject ?? defaultSubject ?? '')}`}
                    </Link>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-3">
                            <h2 className="font-display text-2xl font-bold text-foreground">
                                {editing
                                    ? tr('Edit question')
                                    : tr('Add question')}
                            </h2>
                            <span className="rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">
                                {subjectLabel(data.subject)}
                                {' · '}
                                {tr(BAND_LABELS[data.band])}
                                {' · '}
                                {tr(
                                    QUESTION_LEVEL_LABELS[data.level] ?? 'Easy',
                                )}
                            </span>
                        </div>
                        {editing && (
                            <div className="flex items-center gap-4 text-sm">
                                <span className="font-mono text-xs text-muted-foreground">
                                    {question.key}
                                </span>
                                <span className="text-muted-foreground">
                                    {formatNumber(question.times_answered)}{' '}
                                    {tr('answers ·')}{' '}
                                    <span
                                        className={cn(
                                            'font-semibold',
                                            rateTone(question.success_rate),
                                        )}
                                    >
                                        {formatPercent(question.success_rate)}{' '}
                                        {tr('correct')}
                                    </span>
                                </span>
                            </div>
                        )}
                    </div>
                </div>

                <Section
                    title={tr('Placement')}
                    description={tr(
                        'Which players and games receive this question.',
                    )}
                >
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        <Field label={tr('Question type')} error={errors.type}>
                            <div
                                className="inline-flex rounded-lg border border-input p-1"
                                role="group"
                            >
                                {(['choice', 'true_false'] as const).map(
                                    (type) => (
                                        <button
                                            key={type}
                                            type="button"
                                            aria-pressed={data.type === type}
                                            onClick={() => setType(type)}
                                            className={cn(
                                                'flex-1 rounded-md px-3 py-1.5 text-sm font-medium',
                                                data.type === type
                                                    ? 'bg-primary text-primary-foreground'
                                                    : 'text-muted-foreground hover:text-foreground',
                                            )}
                                        >
                                            {type === 'choice'
                                                ? tr('Multiple choice')
                                                : tr('True / false')}
                                        </button>
                                    ),
                                )}
                            </div>
                        </Field>
                        <Field
                            label={tr('Grade band')}
                            htmlFor="band"
                            error={errors.band}
                        >
                            <select
                                id="band"
                                value={data.band}
                                onChange={(e) =>
                                    setData('band', Number(e.target.value))
                                }
                                className={cn(fieldClass, 'w-full')}
                            >
                                {bands.map((band) => (
                                    <option key={band.value} value={band.value}>
                                        {tr(BAND_LABELS[band.value])}
                                    </option>
                                ))}
                            </select>
                        </Field>
                        <Field
                            label={tr('Question level')}
                            htmlFor="level"
                            error={errorFor('level')}
                        >
                            <select
                                id="level"
                                value={data.level}
                                onChange={(e) =>
                                    setData('level', Number(e.target.value))
                                }
                                className={cn(fieldClass, 'w-full')}
                                data-testid="question-level"
                            >
                                {levels.map((level) => (
                                    <option
                                        key={level.value}
                                        value={level.value}
                                    >
                                        {tr(QUESTION_LEVEL_LABELS[level.value])}{' '}
                                        (×{level.multiplier})
                                    </option>
                                ))}
                            </select>
                        </Field>
                        <Field
                            label={tr('Subject')}
                            htmlFor="subject"
                            error={errors.subject}
                        >
                            <select
                                id="subject"
                                value={data.subject}
                                onChange={(e) =>
                                    setData('subject', e.target.value)
                                }
                                className={cn(fieldClass, 'w-full')}
                            >
                                {subjects.map((subject) => (
                                    <option key={subject} value={subject}>
                                        {subjectLabel(subject)}
                                    </option>
                                ))}
                            </select>
                        </Field>
                    </div>
                    <Field
                        label={tr('Distribute to games')}
                        error={errors.games ?? errorFor('games.0')}
                    >
                        <div className="flex flex-wrap gap-2">
                            {games.map((game) => {
                                const disabled =
                                    choiceOnlyGames.includes(game) && !isChoice;
                                const checked = data.games.includes(game);
                                return (
                                    <label
                                        key={game}
                                        className={cn(
                                            'inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm',
                                            checked
                                                ? 'border-primary bg-primary/10 text-foreground'
                                                : 'border-input text-muted-foreground',
                                            disabled &&
                                                'cursor-not-allowed opacity-50',
                                        )}
                                    >
                                        <input
                                            type="checkbox"
                                            className="size-4 accent-[var(--primary)]"
                                            checked={checked}
                                            disabled={disabled}
                                            onChange={() => toggleGame(game)}
                                        />
                                        {gameLabel(game)}
                                    </label>
                                );
                            })}
                        </div>
                        {!isChoice && (
                            <p className="text-xs text-muted-foreground">
                                {choiceOnlyGames.map(gameLabel).join(', ')}{' '}
                                {tr('only use multiple choice questions.')}
                            </p>
                        )}
                    </Field>
                </Section>

                <Section
                    title={tr('Question')}
                    description={tr(
                        'Indonesian is shown by default; English is used when the player chooses English.',
                    )}
                >
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <Field
                            label={tr('Question (Indonesian)')}
                            htmlFor="prompt_id"
                            error={errors.prompt_id}
                        >
                            <textarea
                                id="prompt_id"
                                rows={3}
                                value={data.prompt_id}
                                onChange={(e) =>
                                    setData('prompt_id', e.target.value)
                                }
                                className={cn(fieldClass, 'h-auto w-full py-2')}
                                required
                            />
                        </Field>
                        <Field
                            label={tr('Question (English)')}
                            htmlFor="prompt_en"
                            error={errors.prompt_en}
                        >
                            <textarea
                                id="prompt_en"
                                rows={3}
                                value={data.prompt_en}
                                onChange={(e) =>
                                    setData('prompt_en', e.target.value)
                                }
                                className={cn(fieldClass, 'h-auto w-full py-2')}
                            />
                        </Field>
                    </div>
                </Section>

                <Section
                    title={tr('Answer')}
                    description={
                        isChoice
                            ? tr(
                                  'Add 3–6 options and mark the correct one. Options are shuffled in game.',
                              )
                            : tr('Is the statement true or false?')
                    }
                >
                    {isChoice ? (
                        <div className="flex flex-col gap-2">
                            {data.options.map((option, index) => (
                                <div
                                    key={index}
                                    className={cn(
                                        'grid grid-cols-[auto_1fr_auto] items-center gap-2 rounded-xl border p-2 sm:grid-cols-[auto_1fr_1fr_auto]',
                                        data.answer === index
                                            ? 'border-green-500/60 bg-green-500/5'
                                            : 'border-border',
                                    )}
                                >
                                    <button
                                        type="button"
                                        onClick={() => setData('answer', index)}
                                        aria-pressed={data.answer === index}
                                        aria-label={tr(
                                            'Mark option {0} as correct',
                                            [index + 1],
                                        )}
                                        className={cn(
                                            'flex size-8 items-center justify-center rounded-full border',
                                            data.answer === index
                                                ? 'border-green-500 bg-green-500 text-white'
                                                : 'border-input text-muted-foreground hover:text-foreground',
                                        )}
                                    >
                                        <CircleCheck className="size-4" />
                                    </button>
                                    <input
                                        aria-label={tr(
                                            'Option {0} (Indonesian)',
                                            [index + 1],
                                        )}
                                        value={option.id}
                                        onChange={(e) =>
                                            updateOption(
                                                index,
                                                'id',
                                                e.target.value,
                                            )
                                        }
                                        placeholder={tr('Option {0}', [
                                            index + 1,
                                        ])}
                                        className={cn(fieldClass, 'w-full')}
                                    />
                                    <input
                                        aria-label={tr('Option {0} (English)', [
                                            index + 1,
                                        ])}
                                        value={option.en}
                                        onChange={(e) =>
                                            updateOption(
                                                index,
                                                'en',
                                                e.target.value,
                                            )
                                        }
                                        placeholder={tr('English (optional)')}
                                        className={cn(
                                            fieldClass,
                                            'col-span-2 col-start-2 w-full sm:col-span-1 sm:col-start-auto',
                                        )}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => removeOption(index)}
                                        disabled={
                                            data.options.length <= MIN_OPTIONS
                                        }
                                        aria-label={tr('Remove option {0}', [
                                            index + 1,
                                        ])}
                                        className="col-start-3 row-start-1 flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-destructive disabled:opacity-30 sm:col-start-auto"
                                    >
                                        <X className="size-4" />
                                    </button>
                                </div>
                            ))}
                            {data.options.length < MAX_OPTIONS && (
                                <button
                                    type="button"
                                    onClick={() =>
                                        setData('options', [
                                            ...data.options,
                                            blankOption(),
                                        ])
                                    }
                                    className="inline-flex w-fit items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-primary hover:bg-primary/10"
                                >
                                    <Plus className="size-4" />
                                    {tr('Add option')}
                                </button>
                            )}
                            <InputError
                                message={
                                    errors.options ??
                                    errors.answer ??
                                    errorFor('options.0.id')
                                }
                            />
                        </div>
                    ) : (
                        <div className="flex gap-2">
                            {[1, 0].map((value) => (
                                <button
                                    key={value}
                                    type="button"
                                    aria-pressed={data.answer === value}
                                    onClick={() => setData('answer', value)}
                                    className={cn(
                                        'rounded-lg border px-5 py-2 text-sm font-medium',
                                        data.answer === value
                                            ? 'border-green-500 bg-green-500 text-white'
                                            : 'border-input text-muted-foreground hover:text-foreground',
                                    )}
                                >
                                    {value === 1 ? tr('True') : tr('False')}
                                </button>
                            ))}
                            <InputError message={errors.answer} />
                        </div>
                    )}
                    {isChoice && (
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                            <Field
                                label={tr('Hint after answering (Indonesian)')}
                                htmlFor="hint_id"
                                error={errors.hint_id}
                            >
                                <input
                                    id="hint_id"
                                    value={data.hint_id}
                                    onChange={(e) =>
                                        setData('hint_id', e.target.value)
                                    }
                                    className={cn(fieldClass, 'w-full')}
                                />
                            </Field>
                            <Field
                                label={tr('Hint (English)')}
                                htmlFor="hint_en"
                                error={errors.hint_en}
                            >
                                <input
                                    id="hint_en"
                                    value={data.hint_en}
                                    onChange={(e) =>
                                        setData('hint_en', e.target.value)
                                    }
                                    className={cn(fieldClass, 'w-full')}
                                />
                            </Field>
                        </div>
                    )}
                </Section>

                <Section
                    title={tr('Points')}
                    description={tr(
                        'A correct answer earns {0} points (Point Rules). Mark special questions as bonus to award more.',
                        [perCorrect],
                    )}
                >
                    <div className="flex flex-wrap items-center gap-4">
                        <label className="inline-flex items-center gap-2 text-sm text-foreground">
                            <input
                                type="checkbox"
                                className="size-4 accent-[var(--primary)]"
                                checked={data.bonus}
                                onChange={(e) =>
                                    setData('bonus', e.target.checked)
                                }
                                data-testid="question-bonus"
                            />
                            {tr('Bonus question')}
                        </label>
                        {data.bonus && (
                            <label className="inline-flex items-center gap-2 text-sm text-foreground">
                                <input
                                    type="number"
                                    min={1}
                                    max={maxPoints}
                                    value={data.points}
                                    onChange={(e) =>
                                        setData(
                                            'points',
                                            Number(e.target.value),
                                        )
                                    }
                                    className="h-9 w-24 rounded-lg border border-input bg-background px-3 text-sm text-foreground tabular-nums focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                                    aria-label={tr('Bonus points')}
                                    data-testid="question-points"
                                />
                                {tr('points (1–')}
                                {maxPoints})
                            </label>
                        )}
                    </div>
                    <InputError message={errorFor('points')} />
                </Section>

                <div className="flex flex-wrap items-center justify-between gap-3">
                    <label className="inline-flex items-center gap-2 text-sm text-foreground">
                        <input
                            type="checkbox"
                            className="size-4 accent-[var(--primary)]"
                            checked={data.is_active}
                            onChange={(e) =>
                                setData('is_active', e.target.checked)
                            }
                        />
                        {tr('Active (served to players)')}
                    </label>
                    <div className="flex items-center gap-2">
                        <Link
                            href={backHref}
                            className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
                        >
                            {tr('Cancel')}
                        </Link>
                        <button
                            type="submit"
                            disabled={processing}
                            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow hover:bg-primary/90 disabled:opacity-50"
                        >
                            {processing && (
                                <Loader2 className="size-4 animate-spin" />
                            )}
                            {editing
                                ? tr('Save changes')
                                : tr('Create question')}
                        </button>
                    </div>
                </div>
            </form>
        </>
    );
}

function Section({
    title,
    description,
    children,
}: {
    title: string;
    description?: string;
    children: ReactNode;
}) {
    return (
        <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="flex flex-col gap-0.5">
                <h3 className="font-semibold text-foreground">{tr(title)}</h3>
                {description && (
                    <p className="text-xs text-muted-foreground">
                        {tr(description)}
                    </p>
                )}
            </div>
            {children}
        </section>
    );
}

function Field({
    label,
    htmlFor,
    error,
    children,
}: {
    label: string;
    htmlFor?: string;
    error?: string;
    children: ReactNode;
}) {
    return (
        <div className="flex flex-col gap-1.5">
            {htmlFor ? (
                <label
                    htmlFor={htmlFor}
                    className="text-sm font-medium text-foreground"
                >
                    {tr(label)}
                </label>
            ) : (
                <span className="text-sm font-medium text-foreground">
                    {tr(label)}
                </span>
            )}
            {children}
            <InputError message={error} />
        </div>
    );
}

QuestionForm.layout = (page: ReactNode) => (
    <AdminLayout title={tr('Question Bank')}>{page}</AdminLayout>
);
