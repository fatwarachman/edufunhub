import { EditableCardHeader, ReadOnlyFields } from '@/components/editable-card';
import InputError from '@/components/input-error';
import { QuestionLevelPicker } from '@/components/question-level-picker';
import { useTranslations } from '@/hooks/use-translations';
import { GRADE_LEVELS, gradeLabel, hasGrade } from '@/lib/grade';
import { questionLevelKey } from '@/lib/question-levels';
import { useForm } from '@inertiajs/react';
import { GraduationCap } from 'lucide-react';
import { useState } from 'react';

/**
 * School grade + question level (profile page). Read-only until the player
 * taps Edit; a missing grade opens the form straight away.
 */
export function GradeCard({
    grade,
    questionLevel,
}: {
    grade: number | null;
    questionLevel: number;
}) {
    const { t } = useTranslations();
    const form = useForm<{ grade: string; question_level: number }>({
        grade: hasGrade(grade) ? String(grade) : '',
        question_level: questionLevel,
    });
    const complete = hasGrade(grade);
    const [editing, setEditing] = useState(!complete);
    const [saved, setSaved] = useState(false);

    return (
        <section
            id="grade"
            className="auth-card flex scroll-mt-6 flex-col gap-3 !p-4 sm:!p-5"
            data-testid="grade-card"
        >
            <EditableCardHeader
                icon={<GraduationCap className="size-5" aria-hidden />}
                title={t('player.gradeAndLevel')}
                editing={editing}
                canCancel={complete}
                onEdit={() => {
                    setSaved(false);
                    setEditing(true);
                }}
                onCancel={() => {
                    form.reset();
                    form.clearErrors();
                    setEditing(false);
                }}
                testId="grade-card"
            />
            <p className="text-sm text-muted-foreground">
                {t('player.gradeNote')}
            </p>
            {saved && !editing && (
                <p
                    role="status"
                    className="text-sm font-semibold text-[#116a56]"
                >
                    {t('player.gradeSaved')}
                </p>
            )}
            {!editing ? (
                <ReadOnlyFields
                    testId="grade-card-view"
                    rows={[
                        {
                            label: t('profile.info.grade'),
                            value: hasGrade(grade) ? gradeLabel(t, grade) : '—',
                            testId: 'grade-card-view-grade',
                        },
                        {
                            label: t('questionLevel.label'),
                            value: t(
                                `questionLevel.levels.${questionLevelKey(questionLevel)}`,
                            ),
                            testId: 'grade-card-view-level',
                        },
                    ]}
                />
            ) : (
                <form
                    className="flex flex-col gap-3"
                    data-testid="grade-card-form"
                    onSubmit={(event) => {
                        event.preventDefault();
                        form.patch('/grade', {
                            preserveScroll: true,
                            onSuccess: () => {
                                form.setDefaults();
                                setSaved(true);
                                setEditing(false);
                            },
                        });
                    }}
                >
                    <label htmlFor="grade-select" className="sr-only">
                        {t('player.grade')}
                    </label>
                    <select
                        id="grade-select"
                        name="grade"
                        value={form.data.grade}
                        onChange={(event) =>
                            form.setData('grade', event.target.value)
                        }
                        className="min-h-11 w-full rounded-xl border-2 border-[#151b2e] bg-white px-3.5 font-semibold"
                    >
                        <option value="" disabled>
                            {t('player.gradePlaceholder')}
                        </option>
                        {GRADE_LEVELS.map((band) => (
                            <optgroup
                                key={band.key}
                                label={t(`player.gradeBands.${band.key}`)}
                            >
                                {band.grades.map((value) => (
                                    <option key={value} value={value}>
                                        {gradeLabel(t, value)}
                                    </option>
                                ))}
                            </optgroup>
                        ))}
                    </select>
                    <InputError message={form.errors.grade} />
                    <QuestionLevelPicker
                        value={form.data.question_level}
                        onChange={(level) =>
                            form.setData('question_level', level)
                        }
                    />
                    <InputError message={form.errors.question_level} />
                    <button
                        type="submit"
                        disabled={form.processing || form.data.grade === ''}
                        className="px-5 py-2.5 font-bold disabled:opacity-50"
                        data-testid="grade-card-save"
                    >
                        {t('player.gradeSave')}
                    </button>
                </form>
            )}
        </section>
    );
}
