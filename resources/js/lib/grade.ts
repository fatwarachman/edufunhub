import { type TFunction } from 'i18next';

/** Grade 0 is kindergarten (TK); 1-12 are school grades. */
export const KINDERGARTEN = 0;

export const ALL_GRADES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

/** School levels used to group grades in pickers and statistics. */
export const GRADE_LEVELS: {
    key: 'tk' | 'sd' | 'smp' | 'sma';
    grades: number[];
}[] = [
    { key: 'tk', grades: [0] },
    { key: 'sd', grades: [1, 2, 3, 4, 5, 6] },
    { key: 'smp', grades: [7, 8, 9] },
    { key: 'sma', grades: [10, 11, 12] },
];

export function hasGrade(grade: number | null | undefined): grade is number {
    return grade !== null && grade !== undefined;
}

/** Localised grade label: "TK" for kindergarten, otherwise "Kelas N" / "Grade N". */
export function gradeLabel(t: TFunction, grade: number): string {
    return grade === KINDERGARTEN
        ? t('player.kindergarten')
        : t('player.gradeOption', { grade });
}

/** Short grade label for tight spaces: "TK" or the number. */
export function gradeShortLabel(t: TFunction, grade: number): string {
    return grade === KINDERGARTEN
        ? t('player.kindergartenShort')
        : String(grade);
}
