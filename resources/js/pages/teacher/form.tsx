import InputError from '@/components/input-error';
import { BackButton } from '@/components/site-nav';
import { teacherFieldClass, Toggle } from '@/components/teacher/teacher-ui';
import { useTranslations } from '@/hooks/use-translations';
import PlayerLayout from '@/layouts/player-layout';
import { GRADE_LEVELS, gradeLabel } from '@/lib/grade';
import { useSubjectName } from '@/lib/subjects';
import { Link, useForm } from '@inertiajs/react';
import { CircleCheck, Loader2, Plus, X } from 'lucide-react';
import { type FormEvent, type ReactNode } from 'react';

interface Option {
    id: string;
    en: string;
}

interface QuestionData {
    id: number;
    type: 'choice' | 'true_false';
    subject: string;
    prompt_id: string;
    prompt_en: string | null;
    options: { id: string; en?: string }[] | null;
    answer: number;
    hint_id: string | null;
    hint_en: string | null;
    games: string[];
    grades: number[];
    is_active: boolean;
}

interface TeacherFormProps {
    question: QuestionData | null;
    games: string[];
    choiceOnlyGames: string[];
    subjects: string[];
    grades: number[];
}

const MIN_OPTIONS = 3;
const MAX_OPTIONS = 6;
const blankOption = (): Option => ({ id: '', en: '' });

export default function TeacherQuestionForm({
    question,
    games,
    choiceOnlyGames,
    subjects,
}: TeacherFormProps) {
    const { t } = useTranslations();
    const subjectName = useSubjectName();
    const editing = question !== null;
    const form = useForm({
        type: question?.type ?? ('choice' as 'choice' | 'true_false'),
        grades: question?.grades ?? ([] as number[]),
        subject: question?.subject ?? subjects[0],
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
    });
    const { data, setData, errors, processing } = form;
    const isChoice = data.type === 'choice';
    const errorFor = (key: string): string | undefined =>
        (errors as Record<string, string>)[key];

    const submit = (event: FormEvent) => {
        event.preventDefault();
        if (editing) {
            form.put(`/teacher/questions/${question.id}`);
        } else {
            form.post('/teacher/questions');
        }
    };

    const setType = (type: 'choice' | 'true_false') => {
        setData((current) => ({
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

    const toggleGrade = (grade: number) => {
        setData((current) => ({
            ...current,
            grades: current.grades.includes(grade)
                ? current.grades.filter((g) => g !== grade)
                : [...current.grades, grade].sort((a, b) => a - b),
        }));
    };

    const toggleLevel = (levelGrades: number[]) => {
        setData((current) => {
            const allSelected = levelGrades.every((g) =>
                current.grades.includes(g),
            );
            return {
                ...current,
                grades: allSelected
                    ? current.grades.filter((g) => !levelGrades.includes(g))
                    : [...new Set([...current.grades, ...levelGrades])].sort(
                          (a, b) => a - b,
                      ),
            };
        });
    };

    const updateOption = (
        index: number,
        field: keyof Option,
        value: string,
    ) => {
        setData((current) => ({
            ...current,
            options: current.options.map((option, i) =>
                i === index ? { ...option, [field]: value } : option,
            ),
        }));
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
        setData((current) => ({
            ...current,
            games: current.games.includes(game)
                ? current.games.filter((g) => g !== game)
                : [...current.games, game],
        }));
    };

    return (
        <PlayerLayout
            title={
                editing
                    ? t('teacher.form.editTitle')
                    : t('teacher.form.createTitle')
            }
        >
            <form
                onSubmit={submit}
                className="flex w-full flex-col gap-6"
                noValidate
            >
                <div className="flex flex-col items-start gap-3">
                    <BackButton
                        href="/teacher/questions"
                        label={t('teacher.form.back')}
                    />
                    <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
                        {editing
                            ? t('teacher.form.editTitle')
                            : t('teacher.form.createTitle')}
                    </h1>
                </div>

                <Section
                    title={t('teacher.form.placement')}
                    description={t('teacher.form.placementNote')}
                >
                    <fieldset className="flex flex-col gap-3">
                        <legend className="mb-2 text-sm font-bold">
                            {t('teacher.form.grades')}
                        </legend>
                        <div
                            className="grid gap-3 md:grid-cols-2"
                            data-testid="teacher-grade-picker"
                        >
                            {GRADE_LEVELS.map((level) => {
                                const all = level.grades.every((g) =>
                                    data.grades.includes(g),
                                );
                                return (
                                    <div
                                        key={level.key}
                                        className="flex flex-col gap-2 rounded-xl border-2 border-[#151b2e] bg-[#faf7ef] p-3"
                                    >
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="text-sm font-bold">
                                                {t(
                                                    `teacher.levels.${level.key}`,
                                                )}
                                            </span>
                                            {level.grades.length > 1 && (
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        toggleLevel(
                                                            level.grades,
                                                        )
                                                    }
                                                    aria-pressed={all}
                                                    className="min-h-9 rounded-lg px-2 text-xs font-bold text-[#6c5ce7] underline-offset-2 hover:underline"
                                                >
                                                    {t(
                                                        'teacher.form.selectLevel',
                                                        {
                                                            level: t(
                                                                `teacher.levels.${level.key}`,
                                                            ),
                                                        },
                                                    )}
                                                </button>
                                            )}
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            {level.grades.map((grade) => (
                                                <Toggle
                                                    key={grade}
                                                    pressed={data.grades.includes(
                                                        grade,
                                                    )}
                                                    onClick={() =>
                                                        toggleGrade(grade)
                                                    }
                                                    testId={`teacher-grade-${grade}`}
                                                >
                                                    {gradeLabel(t, grade)}
                                                </Toggle>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        <InputError
                            message={errors.grades ?? errorFor('grades.0')}
                        />
                    </fieldset>

                    <div className="grid gap-4 sm:grid-cols-2">
                        <Field
                            label={t('teacher.form.subject')}
                            htmlFor="subject"
                            error={errors.subject}
                        >
                            <select
                                id="subject"
                                value={data.subject}
                                onChange={(e) =>
                                    setData('subject', e.target.value)
                                }
                                className={teacherFieldClass}
                            >
                                {subjects.map((subject) => (
                                    <option key={subject} value={subject}>
                                        {subjectName(subject)}
                                    </option>
                                ))}
                            </select>
                        </Field>
                        <Field
                            label={t('teacher.form.type')}
                            error={errors.type}
                        >
                            <div className="flex flex-wrap gap-2" role="group">
                                <Toggle
                                    pressed={data.type === 'choice'}
                                    onClick={() => setType('choice')}
                                    testId="teacher-type-choice"
                                >
                                    {t('teacher.form.choice')}
                                </Toggle>
                                <Toggle
                                    pressed={data.type === 'true_false'}
                                    onClick={() => setType('true_false')}
                                    testId="teacher-type-true-false"
                                >
                                    {t('teacher.form.trueFalse')}
                                </Toggle>
                            </div>
                        </Field>
                    </div>

                    <Field
                        label={t('teacher.form.games')}
                        error={errors.games ?? errorFor('games.0')}
                    >
                        <div className="flex flex-wrap gap-2">
                            {games.map((game) => (
                                <Toggle
                                    key={game}
                                    pressed={data.games.includes(game)}
                                    onClick={() => toggleGame(game)}
                                    disabled={
                                        choiceOnlyGames.includes(game) &&
                                        !isChoice
                                    }
                                    testId={`teacher-game-${game}`}
                                >
                                    {t(`teacher.games.${game}`)}
                                </Toggle>
                            ))}
                        </div>
                        {!isChoice && (
                            <p className="text-xs text-muted-foreground">
                                {t('teacher.form.skyChoiceOnly', {
                                    games: choiceOnlyGames
                                        .map((game) =>
                                            t(`teacher.games.${game}`),
                                        )
                                        .join(', '),
                                })}
                            </p>
                        )}
                    </Field>
                </Section>

                <Section
                    title={t('teacher.form.question')}
                    description={t('teacher.form.questionNote')}
                >
                    <div className="grid gap-4 md:grid-cols-2">
                        <Field
                            label={t('teacher.form.promptId')}
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
                                className={`${teacherFieldClass} py-2.5 font-medium`}
                                required
                            />
                        </Field>
                        <Field
                            label={t('teacher.form.promptEn')}
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
                                className={`${teacherFieldClass} py-2.5 font-medium`}
                            />
                        </Field>
                    </div>
                </Section>

                <Section
                    title={t('teacher.form.answer')}
                    description={
                        isChoice
                            ? t('teacher.form.answerChoiceNote')
                            : t('teacher.form.answerTrueFalseNote')
                    }
                >
                    {isChoice ? (
                        <div className="flex flex-col gap-2">
                            {data.options.map((option, index) => {
                                const number = index + 1;
                                const correct = data.answer === index;
                                return (
                                    <div
                                        key={index}
                                        className={`grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-xl border-2 p-2 sm:grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)_auto] ${
                                            correct
                                                ? 'border-[#1aab8a] bg-[#dff7ea]'
                                                : 'border-[#151b2e] bg-white'
                                        }`}
                                    >
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setData('answer', index)
                                            }
                                            aria-pressed={correct}
                                            aria-label={t(
                                                'teacher.form.markCorrect',
                                                { number },
                                            )}
                                            className={`grid size-11 place-items-center rounded-full border-2 ${
                                                correct
                                                    ? 'border-[#1aab8a] bg-[#1aab8a] text-white'
                                                    : 'border-[#151b2e] text-muted-foreground hover:text-[#151b2e]'
                                            }`}
                                        >
                                            <CircleCheck className="size-5" />
                                        </button>
                                        <input
                                            aria-label={t(
                                                'teacher.form.option',
                                                {
                                                    number,
                                                },
                                            )}
                                            value={option.id}
                                            onChange={(e) =>
                                                updateOption(
                                                    index,
                                                    'id',
                                                    e.target.value,
                                                )
                                            }
                                            placeholder={t(
                                                'teacher.form.option',
                                                { number },
                                            )}
                                            className={teacherFieldClass}
                                        />
                                        <input
                                            aria-label={`${t('teacher.form.option', { number })} — ${t('teacher.form.optionEn')}`}
                                            value={option.en}
                                            onChange={(e) =>
                                                updateOption(
                                                    index,
                                                    'en',
                                                    e.target.value,
                                                )
                                            }
                                            placeholder={t(
                                                'teacher.form.optionEn',
                                            )}
                                            className={`${teacherFieldClass} col-span-2 col-start-2 font-medium sm:col-span-1 sm:col-start-auto`}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => removeOption(index)}
                                            disabled={
                                                data.options.length <=
                                                MIN_OPTIONS
                                            }
                                            aria-label={t(
                                                'teacher.form.removeOption',
                                                { number },
                                            )}
                                            className="col-start-3 row-start-1 grid size-11 place-items-center rounded-xl text-muted-foreground hover:bg-[#ffe1e6] hover:text-[#b23a52] disabled:opacity-30 sm:col-start-auto"
                                        >
                                            <X className="size-5" />
                                        </button>
                                    </div>
                                );
                            })}
                            {data.options.length < MAX_OPTIONS && (
                                <button
                                    type="button"
                                    onClick={() =>
                                        setData('options', [
                                            ...data.options,
                                            blankOption(),
                                        ])
                                    }
                                    className="inline-flex min-h-11 w-fit items-center gap-2 rounded-xl px-3 text-sm font-bold text-[#6c5ce7] hover:bg-[#efeaff]"
                                >
                                    <Plus className="size-4" />
                                    {t('teacher.form.addOption')}
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
                        <div className="flex flex-wrap gap-2">
                            {[1, 0].map((value) => (
                                <Toggle
                                    key={value}
                                    pressed={data.answer === value}
                                    onClick={() => setData('answer', value)}
                                    testId={`teacher-answer-${value}`}
                                >
                                    {value === 1
                                        ? t('teacher.form.true')
                                        : t('teacher.form.false')}
                                </Toggle>
                            ))}
                            <InputError message={errors.answer} />
                        </div>
                    )}
                    {isChoice && (
                        <div className="grid gap-4 md:grid-cols-2">
                            <Field
                                label={t('teacher.form.hintId')}
                                htmlFor="hint_id"
                                error={errors.hint_id}
                            >
                                <input
                                    id="hint_id"
                                    value={data.hint_id}
                                    onChange={(e) =>
                                        setData('hint_id', e.target.value)
                                    }
                                    className={`${teacherFieldClass} font-medium`}
                                />
                            </Field>
                            <Field
                                label={t('teacher.form.hintEn')}
                                htmlFor="hint_en"
                                error={errors.hint_en}
                            >
                                <input
                                    id="hint_en"
                                    value={data.hint_en}
                                    onChange={(e) =>
                                        setData('hint_en', e.target.value)
                                    }
                                    className={`${teacherFieldClass} font-medium`}
                                />
                            </Field>
                        </div>
                    )}
                </Section>

                <div className="flex flex-wrap items-center justify-between gap-3">
                    <label className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold">
                        <input
                            type="checkbox"
                            className="size-5 accent-[#6c5ce7]"
                            checked={data.is_active}
                            onChange={(e) =>
                                setData('is_active', e.target.checked)
                            }
                        />
                        {t('teacher.form.active')}
                    </label>
                    <div className="flex items-center gap-2">
                        <Link href="/teacher/questions" className="edu-nav-btn">
                            {t('teacher.form.cancel')}
                        </Link>
                        <button
                            type="submit"
                            disabled={processing}
                            className="inline-flex items-center gap-2 px-5 font-bold disabled:opacity-50"
                            data-testid="teacher-submit"
                        >
                            {processing && (
                                <Loader2 className="size-4 animate-spin" />
                            )}
                            {processing
                                ? t('teacher.form.saving')
                                : editing
                                  ? t('teacher.form.save')
                                  : t('teacher.form.create')}
                        </button>
                    </div>
                </div>
            </form>
        </PlayerLayout>
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
                <label htmlFor={htmlFor} className="text-sm font-bold">
                    {label}
                </label>
            ) : (
                <span className="text-sm font-bold">{label}</span>
            )}
            {children}
            <InputError message={error} />
        </div>
    );
}
