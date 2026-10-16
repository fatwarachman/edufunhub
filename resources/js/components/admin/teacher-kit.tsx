import { adminLocale, tr } from '@/lib/admin-i18n';

export interface SubjectOption {
    key: string;
    name_id: string;
    name_en: string | null;
}

export interface TeacherSubjects {
    all: boolean;
    keys: string[];
}

const rupiahFormat = new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
});

export const rupiah = (value: number): string => rupiahFormat.format(value);

export function subjectName(
    subjects: SubjectOption[],
    key: string | null | undefined,
): string {
    if (!key) return tr('All subjects');
    const subject = subjects.find((item) => item.key === key);
    if (!subject) return key;
    return adminLocale() === 'id-ID'
        ? subject.name_id
        : subject.name_en || subject.name_id;
}

export function SubjectChips({
    subjects,
    assigned,
    limit,
}: {
    subjects: SubjectOption[];
    assigned: TeacherSubjects;
    limit?: number;
}) {
    if (assigned.all) {
        return (
            <span
                className="inline-flex w-fit self-start rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium whitespace-nowrap text-primary"
                data-testid="teacher-subjects-all"
            >
                {tr('All subjects')}
            </span>
        );
    }
    const shown = limit ? assigned.keys.slice(0, limit) : assigned.keys;
    const rest = assigned.keys.length - shown.length;
    return (
        <span className="flex w-fit max-w-full flex-wrap gap-1 self-start">
            {shown.map((key) => (
                <span
                    key={key}
                    className="inline-flex rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-foreground"
                >
                    {subjectName(subjects, key)}
                </span>
            ))}
            {rest > 0 && (
                <span className="inline-flex rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    +{rest}
                </span>
            )}
        </span>
    );
}
