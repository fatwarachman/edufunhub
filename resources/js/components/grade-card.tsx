import InputError from '@/components/input-error';
import { QuestionLevelPicker } from '@/components/question-level-picker';
import { useTranslations } from '@/hooks/use-translations';
import { GRADE_LEVELS, gradeLabel, hasGrade } from '@/lib/grade';
import { useForm } from '@inertiajs/react';
import { GraduationCap } from 'lucide-react';

/** School grade + question level form (profile page). */
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
    return (
        <section
            id="grade"
            className="auth-card flex scroll-mt-6 flex-col gap-3 !p-4 sm:!p-5"
        >
            <h2 className="flex items-center gap-2 text-xl font-bold">
                <GraduationCap className="size-5" aria-hidden />
                {t('player.gradeAndLevel')}
            </h2>
            <p className="text-sm text-muted-foreground">
                {t('player.gradeNote')}
            </p>
            <form
                className="flex flex-col gap-3"
                onSubmit={(event) => {
                    event.preventDefault();
                    form.patch('/grade', { preserveScroll: true });
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
                    onChange={(level) => form.setData('question_level', level)}
                />
                <InputError message={form.errors.question_level} />
                {form.recentlySuccessful && (
                    <p
                        role="status"
                        className="text-sm font-semibold text-[#116a56]"
                    >
                        {t('player.gradeSaved')}
                    </p>
                )}
                <button
                    type="submit"
                    disabled={form.processing || form.data.grade === ''}
                    className="px-5 py-2.5 font-bold disabled:opacity-50"
                >
                    {t('player.gradeSave')}
                </button>
            </form>
        </section>
    );
}
