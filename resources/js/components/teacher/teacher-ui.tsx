import { useTranslations } from '@/hooks/use-translations';
import { gradeShortLabel } from '@/lib/grade';
import { type SharedData } from '@/types';
import { usePage } from '@inertiajs/react';
import { CircleCheck, type LucideIcon } from 'lucide-react';
import { type ReactNode, useMemo } from 'react';

export interface UsageStats {
    answered: number;
    correct: number;
    wrong: number;
    success_rate: number | null;
    players: number;
    compensation: number;
}

/** Number and rupiah formatters bound to the active language. */
export function useTeacherFormat() {
    const { i18n } = useTranslations();
    return useMemo(() => {
        const locale = i18n.language === 'en' ? 'en-US' : 'id-ID';
        const number = new Intl.NumberFormat(locale);
        const money = new Intl.NumberFormat(locale, {
            style: 'currency',
            currency: 'IDR',
            maximumFractionDigits: 0,
        });
        return {
            number: (value: number) => number.format(value),
            money: (value: number) => money.format(value),
            percent: (value: number | null) =>
                value === null ? '—' : `${number.format(value)}%`,
        };
    }, [i18n.language]);
}

export function StatCard({
    icon: Icon,
    label,
    value,
    hint,
    accent,
    testId,
}: {
    icon: LucideIcon;
    label: string;
    value: ReactNode;
    hint?: ReactNode;
    accent: string;
    testId?: string;
}) {
    return (
        <div
            className="auth-card flex min-w-0 flex-col gap-3 !p-5"
            data-testid={testId}
        >
            <span
                className="grid size-11 place-items-center rounded-xl border-2 border-[#151b2e] text-[#151b2e]"
                style={{ background: accent }}
            >
                <Icon className="size-5" aria-hidden="true" />
            </span>
            <div className="flex min-w-0 flex-col gap-0.5">
                <p className="truncate text-2xl font-bold tabular-nums md:text-3xl">
                    {value}
                </p>
                <p className="text-sm font-bold">{label}</p>
                {hint && (
                    <p className="text-xs text-muted-foreground">{hint}</p>
                )}
            </div>
        </div>
    );
}

/** Correct/wrong split bar. */
export function OutcomeBar({
    correct,
    wrong,
}: {
    correct: number;
    wrong: number;
}) {
    const total = correct + wrong;
    const share = total > 0 ? (correct / total) * 100 : 0;
    return (
        <div
            className="flex h-3 w-full overflow-hidden rounded-full border-2 border-[#151b2e] bg-white"
            aria-hidden="true"
        >
            {total > 0 && (
                <>
                    <span
                        className="h-full bg-[#1aab8a]"
                        style={{ width: `${share}%` }}
                    />
                    <span
                        className="h-full bg-[#e85d75]"
                        style={{ width: `${100 - share}%` }}
                    />
                </>
            )}
        </div>
    );
}

export function GradeChips({ grades }: { grades: number[] }) {
    const { t } = useTranslations();
    if (grades.length === 0) {
        return <span className="text-xs text-muted-foreground">—</span>;
    }
    return (
        <span className="flex flex-wrap gap-1">
            {grades.map((grade) => (
                <span
                    key={grade}
                    className="inline-flex min-w-7 items-center justify-center rounded-md border-2 border-[#151b2e] bg-[#efeaff] px-1.5 text-xs font-bold"
                >
                    {gradeShortLabel(t, grade)}
                </span>
            ))}
        </span>
    );
}

export function SuccessNotice() {
    const { flash } = usePage<SharedData>().props;
    if (!flash?.success) {
        return null;
    }
    return (
        <p
            role="status"
            className="flex items-center gap-2 rounded-2xl border-[3px] border-[#151b2e] bg-[#dff7ea] px-4 py-3 font-semibold text-[#0d5a48]"
            data-testid="teacher-flash"
        >
            <CircleCheck className="size-5 shrink-0" aria-hidden="true" />
            {flash.success}
        </p>
    );
}

export const teacherFieldClass =
    'min-h-11 w-full rounded-xl border-2 border-[#151b2e] bg-white px-3.5 text-sm font-semibold text-[#151b2e] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#6c5ce7]';

export function Toggle({
    pressed,
    onClick,
    children,
    disabled,
    testId,
    label,
}: {
    pressed: boolean;
    onClick: () => void;
    children: ReactNode;
    disabled?: boolean;
    testId?: string;
    label?: string;
}) {
    return (
        <button
            type="button"
            aria-pressed={pressed}
            aria-label={label}
            onClick={onClick}
            disabled={disabled}
            data-testid={testId}
            className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border-2 border-[#151b2e] px-3.5 text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                pressed
                    ? 'bg-[#151b2e] text-white'
                    : 'bg-white hover:bg-[#fff0cf]'
            }`}
        >
            {children}
        </button>
    );
}
