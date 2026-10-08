import { useTranslations } from '@/hooks/use-translations';
import { QUESTION_LEVELS } from '@/lib/question-levels';
import { cn } from '@/lib/utils';

/**
 * Question level choice (easy / medium / expert) for the player. Harder
 * levels pay more points per correct answer, shown as x1 / x2 / x3.
 */
export function QuestionLevelPicker({
    value,
    onChange,
    disabled,
}: {
    value: number;
    onChange: (level: number) => void;
    disabled?: boolean;
}) {
    const { t } = useTranslations();

    return (
        <fieldset
            className="flex flex-col gap-2"
            data-testid="question-level-picker"
        >
            <legend className="mb-1 text-sm font-semibold">
                {t('questionLevel.label')}
            </legend>
            <div className="grid grid-cols-3 gap-2">
                {QUESTION_LEVELS.map((level) => {
                    const selected = level.value === value;

                    return (
                        <label
                            key={level.value}
                            className={cn(
                                'flex min-h-16 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-xl border-2 border-[#151b2e] px-2 py-2 text-center has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-[#6c5ce7]/40',
                                selected
                                    ? 'shadow-[2px_2px_0_#151b2e]'
                                    : 'bg-white hover:bg-[#fff9e6]',
                                disabled && 'cursor-not-allowed opacity-60',
                            )}
                            style={
                                selected
                                    ? { background: level.tone }
                                    : undefined
                            }
                            data-testid={`question-level-${level.value}`}
                        >
                            <input
                                type="radio"
                                name="question_level"
                                value={level.value}
                                checked={selected}
                                disabled={disabled}
                                onChange={() => onChange(level.value)}
                                className="sr-only"
                            />
                            <span className="text-sm font-bold">
                                {t(`questionLevel.levels.${level.key}`)}
                            </span>
                            <span className="text-xs font-semibold tabular-nums">
                                {t('questionLevel.multiplier', {
                                    times: level.multiplier,
                                })}
                            </span>
                        </label>
                    );
                })}
            </div>
            <p className="text-xs text-muted-foreground">
                {t('questionLevel.note')}
            </p>
        </fieldset>
    );
}
