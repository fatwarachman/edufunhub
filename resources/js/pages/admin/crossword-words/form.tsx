import { Panel, fieldClass } from '@/components/admin/game-stats';
import InputError from '@/components/input-error';
import AdminLayout from '@/layouts/admin-layout';
import { tr } from '@/lib/admin-i18n';
import { Head, Link, useForm } from '@inertiajs/react';
import { ArrowLeft, Grid3x3, Loader2 } from 'lucide-react';
import { type FormEvent, type ReactNode } from 'react';

interface LevelStat {
    level: number;
    size: number;
    words_per_grid: number;
    minimum: number;
    active: number;
}

interface Props {
    word: {
        id: number;
        level: number;
        answer: string;
        clue_id: string;
        clue_en: string | null;
        is_active: boolean;
        times_used: number;
        solve_rate: number | null;
    } | null;
    defaultLevel: number;
    levels: LevelStat[];
}

const MAX_LENGTH = 15;

export default function CrosswordWordForm({
    word,
    defaultLevel,
    levels,
}: Props) {
    const form = useForm({
        level: word?.level ?? defaultLevel,
        answer: word?.answer ?? '',
        clue_id: word?.clue_id ?? '',
        clue_en: word?.clue_en ?? '',
        is_active: word?.is_active ?? true,
    });
    const { data, setData, errors, processing } = form;
    const cleaned = data.answer.toUpperCase().replace(/[^A-Z]/g, '');
    const level = levels.find((l) => l.level === Number(data.level));

    const submit = (event: FormEvent) => {
        event.preventDefault();
        if (word) {
            form.put(`/admin/games/crossword/words/${word.id}`);
        } else {
            form.post('/admin/games/crossword/words');
        }
    };

    return (
        <AdminLayout>
            <Head
                title={word ? tr('Edit {0}', [word.answer]) : tr('New word')}
            />
            <div className="flex w-full flex-col gap-6">
                <div>
                    <Link
                        href={`/admin/games/crossword/words?level=${data.level}`}
                        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
                    >
                        <ArrowLeft className="size-4" />
                        {tr('Crossword word bank')}
                    </Link>
                    <h1 className="mt-2 text-2xl font-bold text-foreground">
                        {word ? tr('Edit {0}', [word.answer]) : tr('New word')}
                    </h1>
                    {word && (
                        <p className="text-sm text-muted-foreground">
                            {tr('Used in')} {word.times_used} {tr('grids')}
                        </p>
                    )}
                </div>

                <Panel title={tr('Word and clue')} icon={Grid3x3}>
                    <form
                        onSubmit={submit}
                        className="flex flex-col gap-5"
                        data-testid="word-form"
                    >
                        <div className="grid gap-5 sm:grid-cols-[160px_minmax(0,1fr)]">
                            <Field label={tr('Level')} error={errors.level}>
                                <select
                                    value={data.level}
                                    onChange={(event) =>
                                        setData(
                                            'level',
                                            Number(event.target.value),
                                        )
                                    }
                                    className={fieldClass}
                                    name="level"
                                >
                                    {levels.map((l) => (
                                        <option key={l.level} value={l.level}>
                                            {tr('Level')} {l.level} ({l.size}×
                                            {l.size})
                                        </option>
                                    ))}
                                </select>
                            </Field>
                            <Field
                                label={tr('Answer (letters A–Z, no spaces)')}
                                error={errors.answer}
                            >
                                <input
                                    value={data.answer}
                                    onChange={(event) =>
                                        setData('answer', event.target.value)
                                    }
                                    className={`${fieldClass} font-mono tracking-wider uppercase`}
                                    name="answer"
                                    maxLength={30}
                                    required
                                />
                                {cleaned && (
                                    <p className="text-xs text-muted-foreground">
                                        {tr('Saved as')}{' '}
                                        <span className="font-mono font-semibold text-foreground">
                                            {cleaned}
                                        </span>{' '}
                                        · {cleaned.length}/{MAX_LENGTH}{' '}
                                        {tr('letters')}
                                        {level &&
                                            cleaned.length > level.size &&
                                            tr(
                                                ' · longer than the level {0} grid ({1}), it will rarely fit',
                                                [level.level, level.size],
                                            )}
                                    </p>
                                )}
                            </Field>
                        </div>
                        <Field
                            label={tr('Clue (Indonesian)')}
                            error={errors.clue_id}
                        >
                            <textarea
                                value={data.clue_id}
                                onChange={(event) =>
                                    setData('clue_id', event.target.value)
                                }
                                rows={2}
                                maxLength={160}
                                className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                                name="clue_id"
                                required
                            />
                        </Field>
                        <Field
                            label={tr('Clue (English)')}
                            error={errors.clue_en}
                        >
                            <textarea
                                value={data.clue_en}
                                onChange={(event) =>
                                    setData('clue_en', event.target.value)
                                }
                                rows={2}
                                maxLength={160}
                                className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                                name="clue_en"
                            />
                        </Field>
                        <label className="flex items-center gap-2 text-sm text-foreground">
                            <input
                                type="checkbox"
                                checked={data.is_active}
                                onChange={(event) =>
                                    setData('is_active', event.target.checked)
                                }
                                className="size-4 rounded border-input"
                            />
                            {tr('Active (used in new grids)')}
                        </label>
                        <InputError
                            message={tr(
                                (errors as Record<string, string>).word,
                            )}
                        />
                        <div className="flex justify-end gap-3 border-t border-border pt-5">
                            <Link
                                href={`/admin/games/crossword/words?level=${data.level}`}
                                className="inline-flex h-9 items-center rounded-lg px-4 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                            >
                                {tr('Cancel')}
                            </Link>
                            <button
                                type="submit"
                                disabled={processing}
                                className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                            >
                                {processing && (
                                    <Loader2 className="size-4 animate-spin" />
                                )}
                                {word ? tr('Save changes') : tr('Add word')}
                            </button>
                        </div>
                    </form>
                </Panel>
            </div>
        </AdminLayout>
    );
}

function Field({
    label,
    error,
    children,
}: {
    label: string;
    error?: string;
    children: ReactNode;
}) {
    return (
        <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-foreground">
                {tr(label)}
            </span>
            {children}
            <InputError message={error} />
        </div>
    );
}
