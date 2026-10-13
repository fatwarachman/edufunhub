import {
    actionButtonClass,
    dangerButtonClass,
    useGameCatalog,
} from '@/components/classroom/classroom-ui';
import {
    QuestionPickerDialog,
    QuestionSummary,
} from '@/components/classroom/question-picker';
import {
    type ClassroomFormData,
    type ClassroomLimits,
    type QuestionPick,
    type Topic,
} from '@/components/classroom/types';
import InputError from '@/components/input-error';
import { BackButton } from '@/components/site-nav';
import { TeacherTabs } from '@/components/teacher/teacher-tabs';
import { teacherFieldClass, Toggle } from '@/components/teacher/teacher-ui';
import { useTranslations } from '@/hooks/use-translations';
import PlayerLayout from '@/layouts/player-layout';
import { cn } from '@/lib/utils';
import { Link, useForm } from '@inertiajs/react';
import {
    ArrowDown,
    ArrowUp,
    Check,
    CopyPlus,
    ListChecks,
    Loader2,
    Shuffle,
    Trash2,
} from 'lucide-react';
import { type FormEvent, type ReactNode, useState } from 'react';

interface ClassroomFormProps {
    classroom: ClassroomFormData | null;
    games: string[];
    choiceOnlyGames: string[];
    subjects: string[];
    topics: Topic[];
    grades: number[];
    limits: ClassroomLimits;
}

interface GameDraft {
    game_key: string;
    questions: QuestionPick[];
}

const DURATION_PRESETS = [15, 30, 45, 60, 90, 120, 1440];

/** `YYYY-MM-DDTHH:mm` in the browser's time zone (datetime-local value). */
function toLocalInput(value: string | Date): string {
    const date = typeof value === 'string' ? new Date(value) : value;
    if (Number.isNaN(date.getTime())) {
        return '';
    }
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function ClassroomForm({
    classroom,
    games,
    choiceOnlyGames,
    subjects,
    topics,
    grades,
    limits,
}: ClassroomFormProps) {
    const { t } = useTranslations();
    const catalog = useGameCatalog();
    const editing = classroom !== null;
    const startLocked = editing && classroom.status !== 'scheduled';
    const initialDuration = classroom?.duration_minutes ?? 60;

    const form = useForm({
        name: classroom?.name ?? '',
        description: classroom?.description ?? '',
        start_now: !editing,
        starts_at: classroom
            ? toLocalInput(classroom.starts_at)
            : toLocalInput(new Date(Date.now() + 60 * 60 * 1000)),
        duration_minutes: initialDuration,
        max_members: classroom?.max_members ?? Math.min(100, limits.maxMembers),
        games: (classroom?.games ?? []).map((game) => ({
            game_key: game.game_key,
            questions: game.questions,
        })) as GameDraft[],
    });
    const { data, setData, errors, processing } = form;
    const errorFor = (key: string): string | undefined =>
        (errors as Record<string, string>)[key];
    const [customDuration, setCustomDuration] = useState(
        !DURATION_PRESETS.includes(initialDuration),
    );
    const [pickerFor, setPickerFor] = useState<string | null>(null);

    const submit = (event: FormEvent) => {
        event.preventDefault();
        form.transform((values) => {
            const startsAt = values.start_now
                ? new Date().toISOString()
                : new Date(values.starts_at).toISOString();
            return {
                name: values.name.trim(),
                description: values.description.trim() || null,
                starts_at: startsAt,
                duration_minutes: Number(values.duration_minutes),
                max_members: Number(values.max_members),
                games: values.games.map((game) => ({
                    game_key: game.game_key,
                    question_ids: game.questions.map((question) => question.id),
                })),
            };
        });
        if (editing) {
            form.put(`/teacher/classrooms/${classroom.id}`, {
                preserveScroll: true,
            });
        } else {
            form.post('/teacher/classrooms', { preserveScroll: true });
        }
    };

    const selectedKeys = data.games.map((game) => game.game_key);
    const isChoiceOnly = (key: string) => choiceOnlyGames.includes(key);

    const toggleGame = (key: string) => {
        setData((current) => ({
            ...current,
            games: current.games.some((game) => game.game_key === key)
                ? current.games.filter((game) => game.game_key !== key)
                : current.games.length >= limits.maxGames
                  ? current.games
                  : [...current.games, { game_key: key, questions: [] }],
        }));
    };

    const setQuestions = (key: string, questions: QuestionPick[]) => {
        setData((current) => ({
            ...current,
            games: current.games.map((game) =>
                game.game_key === key
                    ? {
                          ...game,
                          questions: questions.slice(
                              0,
                              limits.maxQuestionsPerGame,
                          ),
                      }
                    : game,
            ),
        }));
    };

    const moveQuestion = (key: string, index: number, delta: number) => {
        const game = data.games.find((item) => item.game_key === key);
        if (!game) return;
        const target = index + delta;
        if (target < 0 || target >= game.questions.length) return;
        const next = [...game.questions];
        [next[index], next[target]] = [next[target], next[index]];
        setQuestions(key, next);
    };

    const copyFrom = (target: string, source: string) => {
        const from = data.games.find((game) => game.game_key === source);
        if (!from) return;
        setQuestions(
            target,
            from.questions.filter(
                (question) =>
                    !(isChoiceOnly(target) && question.type === 'true_false'),
            ),
        );
    };

    const pickerGame = data.games.find((game) => game.game_key === pickerFor);
    const title = editing
        ? t('classroom.form.editTitle')
        : t('classroom.form.createTitle');

    return (
        <PlayerLayout title={title}>
            <form
                onSubmit={submit}
                className="flex w-full flex-col gap-6"
                noValidate
                data-testid="classroom-form"
            >
                <div className="flex flex-col items-start gap-3">
                    <BackButton
                        href={
                            editing
                                ? `/teacher/classrooms/${classroom.id}`
                                : '/teacher/classrooms'
                        }
                        label={t('classroom.common.back')}
                    />
                    <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
                        {title}
                    </h1>
                    <p className="max-w-2xl text-muted-foreground">
                        {t('classroom.form.intro')}
                    </p>
                </div>

                <TeacherTabs active="classrooms" />

                <Section title={t('classroom.form.basics')}>
                    <Field
                        label={t('classroom.form.name')}
                        htmlFor="classroom-name"
                        error={errorFor('name')}
                    >
                        <input
                            id="classroom-name"
                            value={data.name}
                            maxLength={120}
                            onChange={(event) =>
                                setData('name', event.target.value)
                            }
                            placeholder={t('classroom.form.namePlaceholder')}
                            className={teacherFieldClass}
                            required
                            data-testid="classroom-name"
                        />
                    </Field>
                    <Field
                        label={t('classroom.form.description')}
                        htmlFor="classroom-description"
                        error={errorFor('description')}
                        hint={t('classroom.form.optional')}
                    >
                        <textarea
                            id="classroom-description"
                            value={data.description}
                            maxLength={1000}
                            rows={3}
                            onChange={(event) =>
                                setData('description', event.target.value)
                            }
                            placeholder={t(
                                'classroom.form.descriptionPlaceholder',
                            )}
                            className={`${teacherFieldClass} py-2.5`}
                            data-testid="classroom-description"
                        />
                    </Field>
                    <Field
                        label={t('classroom.form.maxMembers')}
                        htmlFor="classroom-max-members"
                        error={errorFor('max_members')}
                        hint={t('classroom.form.maxMembersHint', {
                            max: limits.maxMembers,
                        })}
                    >
                        <input
                            id="classroom-max-members"
                            type="number"
                            inputMode="numeric"
                            min={1}
                            max={limits.maxMembers}
                            value={data.max_members}
                            onChange={(event) =>
                                setData(
                                    'max_members',
                                    Number(event.target.value),
                                )
                            }
                            className={`${teacherFieldClass} max-w-40`}
                            data-testid="classroom-max-members"
                        />
                    </Field>
                </Section>

                <Section
                    title={t('classroom.form.schedule')}
                    description={t('classroom.form.scheduleNote')}
                >
                    {startLocked ? (
                        <p className="rounded-xl border-2 border-[#1f2a44] bg-[#fff4cc] px-3 py-2 text-sm font-bold">
                            {t('classroom.form.startLocked')}
                        </p>
                    ) : (
                        <div className="flex flex-col gap-3">
                            <div className="flex flex-wrap gap-2">
                                {!editing && (
                                    <Toggle
                                        pressed={data.start_now}
                                        onClick={() =>
                                            setData('start_now', true)
                                        }
                                        testId="classroom-start-now"
                                    >
                                        {t('classroom.form.startNow')}
                                    </Toggle>
                                )}
                                {!editing && (
                                    <Toggle
                                        pressed={!data.start_now}
                                        onClick={() =>
                                            setData('start_now', false)
                                        }
                                        testId="classroom-start-later"
                                    >
                                        {t('classroom.form.startLater')}
                                    </Toggle>
                                )}
                            </div>
                            {(editing || !data.start_now) && (
                                <Field
                                    label={t('classroom.form.startsAt')}
                                    htmlFor="classroom-starts-at"
                                    error={errorFor('starts_at')}
                                >
                                    <input
                                        id="classroom-starts-at"
                                        type="datetime-local"
                                        value={data.starts_at}
                                        onChange={(event) =>
                                            setData(
                                                'starts_at',
                                                event.target.value,
                                            )
                                        }
                                        className={`${teacherFieldClass} max-w-72`}
                                        data-testid="classroom-starts-at"
                                    />
                                </Field>
                            )}
                            {!editing && data.start_now && (
                                <InputError message={errorFor('starts_at')} />
                            )}
                        </div>
                    )}

                    <fieldset className="flex flex-col gap-2">
                        <legend className="mb-2 text-sm font-bold">
                            {t('classroom.form.duration')}
                        </legend>
                        <div
                            className="flex flex-wrap gap-2"
                            data-testid="classroom-duration"
                        >
                            {DURATION_PRESETS.map((minutes) => (
                                <Toggle
                                    key={minutes}
                                    pressed={
                                        !customDuration &&
                                        data.duration_minutes === minutes
                                    }
                                    onClick={() => {
                                        setCustomDuration(false);
                                        setData('duration_minutes', minutes);
                                    }}
                                    testId={`classroom-duration-${minutes}`}
                                >
                                    {minutes >= 1440
                                        ? t('classroom.form.days', {
                                              count: minutes / 1440,
                                          })
                                        : t('classroom.form.minutes', {
                                              count: minutes,
                                          })}
                                </Toggle>
                            ))}
                            <Toggle
                                pressed={customDuration}
                                onClick={() => setCustomDuration(true)}
                                testId="classroom-duration-custom"
                            >
                                {t('classroom.form.custom')}
                            </Toggle>
                        </div>
                        {customDuration && (
                            <label className="flex flex-wrap items-center gap-2 text-sm font-bold">
                                <input
                                    type="number"
                                    inputMode="numeric"
                                    min={limits.minDuration}
                                    max={limits.maxDuration}
                                    value={data.duration_minutes}
                                    onChange={(event) =>
                                        setData(
                                            'duration_minutes',
                                            Number(event.target.value),
                                        )
                                    }
                                    className={`${teacherFieldClass} max-w-32`}
                                    data-testid="classroom-duration-input"
                                />
                                {t('classroom.form.customUnit', {
                                    min: limits.minDuration,
                                    max: limits.maxDuration,
                                })}
                            </label>
                        )}
                        <InputError message={errorFor('duration_minutes')} />
                    </fieldset>
                </Section>

                <Section
                    title={t('classroom.form.games')}
                    description={t('classroom.form.gamesNote', {
                        max: limits.maxGames,
                    })}
                >
                    <div
                        className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3"
                        data-testid="classroom-game-picker"
                    >
                        {games.map((key) => {
                            const Icon = catalog.icon(key);
                            const picked = selectedKeys.includes(key);
                            const blocked =
                                !picked && data.games.length >= limits.maxGames;
                            return (
                                <button
                                    key={key}
                                    type="button"
                                    aria-pressed={picked}
                                    disabled={blocked}
                                    onClick={() => toggleGame(key)}
                                    className={cn(
                                        'flex min-h-12 min-w-0 items-center gap-3 rounded-xl border-2 border-[#1f2a44] px-3 py-2 text-left text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-40',
                                        picked
                                            ? 'bg-[#1f2a44] text-white'
                                            : 'bg-white hover:bg-[#fff0cf]',
                                    )}
                                    data-testid={`classroom-game-${key}`}
                                >
                                    <span
                                        className="grid size-8 shrink-0 place-items-center rounded-lg border-2 border-[#1f2a44]"
                                        style={{
                                            background: catalog.accent(key),
                                        }}
                                    >
                                        <Icon
                                            className="size-4 text-white"
                                            aria-hidden="true"
                                        />
                                    </span>
                                    <span className="min-w-0 flex-1 truncate">
                                        {catalog.title(key)}
                                    </span>
                                    {picked && (
                                        <Check
                                            className="size-4 shrink-0"
                                            aria-hidden="true"
                                        />
                                    )}
                                </button>
                            );
                        })}
                    </div>
                    <InputError message={errorFor('games')} />
                </Section>

                {data.games.map((game, gameIndex) => (
                    <GameQuestions
                        key={game.game_key}
                        game={game}
                        gameIndex={gameIndex}
                        others={data.games.filter(
                            (other) =>
                                other.game_key !== game.game_key &&
                                other.questions.length > 0,
                        )}
                        choiceOnly={isChoiceOnly(game.game_key)}
                        max={limits.maxQuestionsPerGame}
                        errorFor={errorFor}
                        onOpenPicker={() => setPickerFor(game.game_key)}
                        onAuto={() => setQuestions(game.game_key, [])}
                        onMove={(index, delta) =>
                            moveQuestion(game.game_key, index, delta)
                        }
                        onRemove={(index) =>
                            setQuestions(
                                game.game_key,
                                game.questions.filter((_, i) => i !== index),
                            )
                        }
                        onCopyFrom={(source) => copyFrom(game.game_key, source)}
                    />
                ))}

                <div className="flex flex-wrap items-center justify-end gap-2">
                    <Link
                        href={
                            editing
                                ? `/teacher/classrooms/${classroom.id}`
                                : '/teacher/classrooms'
                        }
                        className="edu-nav-btn"
                    >
                        {t('classroom.common.cancel')}
                    </Link>
                    <button
                        type="submit"
                        disabled={processing || data.games.length === 0}
                        className="inline-flex items-center gap-2 px-5 font-bold disabled:opacity-50"
                        data-testid="classroom-submit"
                    >
                        {processing && (
                            <Loader2
                                className="size-4 animate-spin motion-reduce:animate-none"
                                aria-hidden="true"
                            />
                        )}
                        {processing
                            ? t('classroom.form.saving')
                            : editing
                              ? t('classroom.form.save')
                              : t('classroom.form.create')}
                    </button>
                </div>
            </form>

            {pickerGame && (
                <QuestionPickerDialog
                    open
                    onClose={() => setPickerFor(null)}
                    game={pickerGame.game_key}
                    gameTitle={catalog.title(pickerGame.game_key)}
                    selected={pickerGame.questions}
                    onApply={(picks) =>
                        setQuestions(pickerGame.game_key, picks)
                    }
                    max={limits.maxQuestionsPerGame}
                    subjects={subjects}
                    topics={topics}
                    grades={grades}
                />
            )}
        </PlayerLayout>
    );
}

function GameQuestions({
    game,
    gameIndex,
    others,
    choiceOnly,
    max,
    errorFor,
    onOpenPicker,
    onAuto,
    onMove,
    onRemove,
    onCopyFrom,
}: {
    game: GameDraft;
    gameIndex: number;
    others: GameDraft[];
    choiceOnly: boolean;
    max: number;
    errorFor: (key: string) => string | undefined;
    onOpenPicker: () => void;
    onAuto: () => void;
    onMove: (index: number, delta: number) => void;
    onRemove: (index: number) => void;
    onCopyFrom: (source: string) => void;
}) {
    const { t } = useTranslations();
    const catalog = useGameCatalog();
    const Icon = catalog.icon(game.game_key);
    const auto = game.questions.length === 0;
    const questionErrors = Object.entries({} as Record<string, string>).concat(
        [
            `games.${gameIndex}.question_ids`,
            `games.${gameIndex}.game_key`,
            ...game.questions.map(
                (_, index) => `games.${gameIndex}.question_ids.${index}`,
            ),
        ]
            .map((key) => [key, errorFor(key)] as [string, string | undefined])
            .filter((entry): entry is [string, string] => Boolean(entry[1])),
    );

    return (
        <section
            className="auth-card flex min-w-0 flex-col gap-4 !p-5"
            data-testid={`classroom-questions-${game.game_key}`}
        >
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="flex min-w-0 items-center gap-2 text-lg font-bold">
                    <span
                        className="grid size-9 shrink-0 place-items-center rounded-xl border-2 border-[#1f2a44]"
                        style={{ background: catalog.accent(game.game_key) }}
                    >
                        <Icon
                            className="size-4 text-white"
                            aria-hidden="true"
                        />
                    </span>
                    <span className="min-w-0 truncate">
                        {t('classroom.form.questionsFor', {
                            game: catalog.title(game.game_key),
                        })}
                    </span>
                </h2>
                <span className="text-sm font-bold text-slate-600 tabular-nums">
                    {auto
                        ? t('classroom.form.autoShort')
                        : t('classroom.form.pickedCount', {
                              count: game.questions.length,
                              max,
                          })}
                </span>
            </div>

            <div className="flex flex-wrap gap-2">
                <Toggle
                    pressed={auto}
                    onClick={onAuto}
                    testId={`classroom-auto-${game.game_key}`}
                >
                    <Shuffle className="size-4" aria-hidden="true" />
                    {t('classroom.form.auto')}
                </Toggle>
                <button
                    type="button"
                    onClick={onOpenPicker}
                    className={actionButtonClass}
                    data-testid={`classroom-pick-${game.game_key}`}
                >
                    <ListChecks className="size-4" aria-hidden="true" />
                    {auto
                        ? t('classroom.form.pick')
                        : t('classroom.form.pickMore')}
                </button>
                {others.length > 0 && (
                    <label className="flex min-w-0 items-center gap-2">
                        <CopyPlus
                            className="size-4 shrink-0"
                            aria-hidden="true"
                        />
                        <span className="sr-only">
                            {t('classroom.form.copyFrom')}
                        </span>
                        <select
                            value=""
                            onChange={(event) => {
                                if (event.target.value) {
                                    onCopyFrom(event.target.value);
                                }
                            }}
                            className={`${teacherFieldClass} max-w-64`}
                            data-testid={`classroom-copy-${game.game_key}`}
                        >
                            <option value="">
                                {t('classroom.form.copyFrom')}
                            </option>
                            {others.map((other) => (
                                <option
                                    key={other.game_key}
                                    value={other.game_key}
                                >
                                    {t('classroom.form.copyFromGame', {
                                        game: catalog.title(other.game_key),
                                        count: other.questions.length,
                                    })}
                                </option>
                            ))}
                        </select>
                    </label>
                )}
            </div>

            {choiceOnly && (
                <p className="text-xs font-semibold text-slate-600">
                    {t('classroom.form.choiceOnly')}
                </p>
            )}

            {auto ? (
                <p className="rounded-xl border-2 border-dashed border-[#151b2e]/30 px-4 py-4 text-sm font-semibold text-slate-700">
                    {t('classroom.form.autoHint')}
                </p>
            ) : (
                <ol
                    className="flex flex-col gap-2"
                    data-testid={`classroom-picked-${game.game_key}`}
                >
                    {game.questions.map((question, index) => (
                        <li
                            key={question.id}
                            className="flex min-w-0 flex-col gap-2 rounded-xl border-2 border-[#1f2a44] bg-white p-3 sm:flex-row sm:items-start"
                        >
                            <span className="flex min-w-0 flex-1 items-start gap-2">
                                <span className="grid size-7 shrink-0 place-items-center rounded-lg border-2 border-[#1f2a44] bg-[#ffd93d] text-xs font-black tabular-nums">
                                    {index + 1}
                                </span>
                                <QuestionSummary question={question} />
                            </span>
                            <span className="flex shrink-0 gap-1.5 self-end sm:self-start">
                                <button
                                    type="button"
                                    onClick={() => onMove(index, -1)}
                                    disabled={index === 0}
                                    className={`${actionButtonClass} size-11 !px-0`}
                                    aria-label={t('classroom.form.moveUp')}
                                >
                                    <ArrowUp
                                        className="size-4"
                                        aria-hidden="true"
                                    />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => onMove(index, 1)}
                                    disabled={
                                        index === game.questions.length - 1
                                    }
                                    className={`${actionButtonClass} size-11 !px-0`}
                                    aria-label={t('classroom.form.moveDown')}
                                >
                                    <ArrowDown
                                        className="size-4"
                                        aria-hidden="true"
                                    />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => onRemove(index)}
                                    className={`${dangerButtonClass} size-11 !px-0`}
                                    aria-label={t('classroom.form.remove')}
                                    data-testid="classroom-remove-question"
                                >
                                    <Trash2
                                        className="size-4"
                                        aria-hidden="true"
                                    />
                                </button>
                            </span>
                        </li>
                    ))}
                </ol>
            )}

            {questionErrors.map(([key, message]) => (
                <InputError key={key} message={message} />
            ))}
        </section>
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
        <section className="auth-card flex flex-col gap-5 !p-5">
            <div className="flex flex-col gap-1">
                <h2 className="text-lg font-bold">{title}</h2>
                {description && (
                    <p className="text-sm text-muted-foreground">
                        {description}
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
    hint,
    children,
}: {
    label: string;
    htmlFor?: string;
    error?: string;
    hint?: string;
    children: ReactNode;
}) {
    return (
        <div className="flex flex-col gap-1.5">
            <label htmlFor={htmlFor} className="text-sm font-bold">
                {label}
                {hint && (
                    <span className="ml-2 text-xs font-semibold text-muted-foreground">
                        {hint}
                    </span>
                )}
            </label>
            {children}
            <InputError message={error} />
        </div>
    );
}
