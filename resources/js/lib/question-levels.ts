/** Question levels within a grade; harder levels pay more per answer. */
export const QUESTION_LEVELS = [
    { value: 1, key: 'easy', multiplier: 1, tone: '#dff7ea' },
    { value: 2, key: 'medium', multiplier: 2, tone: '#fff4cc' },
    { value: 3, key: 'expert', multiplier: 3, tone: '#ffe1e6' },
] as const;

export type QuestionLevelKey = (typeof QUESTION_LEVELS)[number]['key'];

/** Locale key of a level value (unknown values are easy). */
export function questionLevelKey(
    value: number | null | undefined,
): QuestionLevelKey {
    return (
        QUESTION_LEVELS.find((level) => level.value === value) ??
        QUESTION_LEVELS[0]
    ).key;
}
