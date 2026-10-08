import { useTranslations } from '@/hooks/use-translations';
import { SubjectIcon, useSubjectName, useSubjects } from '@/lib/subjects';
import {
    ArrowDownRight,
    ArrowRight,
    ArrowUpRight,
    CalendarClock,
    Plus,
    TrendingUp,
} from 'lucide-react';

export interface AbilityProgressSubject {
    subject: string;
    previous: number | null;
    current: number | null;
    delta: number | null;
    direction: string;
}

/** The shown analysis compared with the player's previous one. */
export interface AbilityProgress {
    previous_date: string | null;
    previous_average: number | null;
    current_average: number | null;
    average_delta: number | null;
    direction: string;
    subjects: AbilityProgressSubject[];
    strengths_gained: string[];
    weaknesses_resolved: string[];
    text: string;
}

export interface AbilityHistoryPoint {
    date: string | null;
    average: number | null;
    current: boolean;
}

const INK = 'border-[#151b2e]';

const CHIP: Record<string, string> = {
    up: 'bg-[#d8f8dc] text-[#14532d]',
    down: 'bg-[#ffe0e0] text-[#7f1d1d]',
    same: 'bg-[#eceff4] text-[#151b2e]',
    new: 'bg-[#cfe6ff] text-[#151b2e]',
    gone: 'bg-[#eceff4] text-[#151b2e]',
};

function useNumber() {
    const { i18n } = useTranslations();
    return (value: number | null | undefined): string =>
        value === null || value === undefined
            ? '—'
            : value.toLocaleString(i18n.language, {
                  maximumFractionDigits: 1,
              });
}

function Chip({
    delta,
    direction,
}: {
    delta: number | null;
    direction: string;
}) {
    const { t } = useTranslations();
    const number = useNumber();
    const Icon =
        direction === 'up'
            ? ArrowUpRight
            : direction === 'down'
              ? ArrowDownRight
              : direction === 'new'
                ? Plus
                : ArrowRight;
    const label =
        direction === 'new'
            ? t('abilityPage.progress.new')
            : direction === 'gone'
              ? t('abilityPage.progress.notScored')
              : direction === 'same'
                ? t('abilityPage.progress.same')
                : `${delta !== null && delta > 0 ? '+' : ''}${number(delta)}`;

    return (
        <span
            className={`inline-flex shrink-0 items-center gap-0.5 rounded-full border-2 ${INK} px-2 py-0.5 text-xs font-bold whitespace-nowrap tabular-nums ${CHIP[direction] ?? CHIP.same}`}
            data-testid="ability-progress-chip"
            data-direction={direction}
        >
            <Icon className="size-3 shrink-0" aria-hidden />
            {label}
        </span>
    );
}

/**
 * "Perkembangan" section of the analysis page: the shown analysis against the
 * player's previous one (subject deltas and a short text) and a compact list
 * of earlier analyses. Only rendered for the owner of the analysis.
 */
export function AbilityProgressSection({
    progress,
    history,
}: {
    progress: AbilityProgress | null;
    history: AbilityHistoryPoint[];
}) {
    const { t, i18n } = useTranslations();
    const subjectName = useSubjectName();
    const subjects = useSubjects();
    const number = useNumber();
    const formatDate = (value: string | null) =>
        value
            ? new Intl.DateTimeFormat(i18n.language, {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
              }).format(new Date(value))
            : '—';

    return (
        <section
            className="auth-card flex min-w-0 flex-col gap-4 !p-4 sm:!p-5"
            aria-labelledby="ability-progress-title"
            data-testid="ability-progress"
        >
            <h2
                id="ability-progress-title"
                className="flex min-w-0 items-center gap-2 text-lg font-bold sm:text-xl"
            >
                <span
                    className={`grid size-8 shrink-0 place-items-center rounded-xl border-2 ${INK} bg-[#d8f8dc]`}
                >
                    <TrendingUp className="size-4" aria-hidden />
                </span>
                {t('abilityPage.progress.title')}
            </h2>

            {progress === null ? (
                <p
                    className="text-sm text-[#151b2e]/80"
                    data-testid="ability-progress-empty"
                >
                    {t('abilityPage.progress.empty')}
                </p>
            ) : (
                <>
                    <div
                        className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border-2 ${INK} bg-white px-3 py-2.5`}
                        data-testid="ability-progress-average"
                    >
                        <span className="text-sm font-bold">
                            {t('abilityPage.progress.average')}
                        </span>
                        <span className="text-sm font-bold tabular-nums">
                            {number(progress.previous_average)} →{' '}
                            {number(progress.current_average)}
                        </span>
                        <Chip
                            delta={progress.average_delta}
                            direction={progress.direction}
                        />
                        <span className="text-xs text-[#151b2e]/70">
                            {t('abilityPage.progress.since', {
                                date: formatDate(progress.previous_date),
                            })}
                        </span>
                    </div>

                    {progress.text !== '' && (
                        <p className="text-sm leading-relaxed [overflow-wrap:anywhere]">
                            {progress.text}
                        </p>
                    )}

                    {progress.subjects.length > 0 && (
                        <ul
                            className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2"
                            data-testid="ability-progress-subjects"
                        >
                            {progress.subjects.map((row) => {
                                const info = subjects.find(
                                    (item) => item.key === row.subject,
                                );
                                return (
                                    <li
                                        key={row.subject}
                                        className={`flex min-w-0 items-center justify-between gap-2 rounded-xl border-2 ${INK} bg-white px-3 py-2 text-sm`}
                                    >
                                        <span className="flex min-w-0 items-center gap-1.5 font-bold">
                                            <SubjectIcon
                                                icon={info?.icon}
                                                className="size-4 shrink-0"
                                            />
                                            <span className="truncate">
                                                {subjectName(row.subject)}
                                            </span>
                                        </span>
                                        <span className="flex shrink-0 items-center gap-2">
                                            <span className="text-xs text-[#151b2e]/70 tabular-nums">
                                                {number(row.previous)} →{' '}
                                                <strong className="text-[#151b2e]">
                                                    {number(row.current)}
                                                </strong>
                                            </span>
                                            <Chip
                                                delta={row.delta}
                                                direction={row.direction}
                                            />
                                        </span>
                                    </li>
                                );
                            })}
                        </ul>
                    )}

                    {(progress.strengths_gained.length > 0 ||
                        progress.weaknesses_resolved.length > 0) && (
                        <div className="flex flex-col gap-1.5">
                            <h3 className="text-xs font-bold tracking-wide text-[#151b2e]/80 uppercase">
                                {t('abilityPage.progress.gained')}
                            </h3>
                            <ul className="flex flex-wrap gap-1.5">
                                {[
                                    ...progress.strengths_gained,
                                    ...progress.weaknesses_resolved,
                                ].map((item, index) => (
                                    <li
                                        key={index}
                                        className={`rounded-xl border-2 ${INK} bg-[#e9fbe9] px-2.5 py-1 text-xs [overflow-wrap:anywhere]`}
                                    >
                                        {item}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </>
            )}

            {history.length > 1 && (
                <div className="flex flex-col gap-2">
                    <h3 className="flex items-center gap-1.5 text-xs font-bold tracking-wide text-[#151b2e]/80 uppercase">
                        <CalendarClock
                            className="size-3.5 shrink-0"
                            aria-hidden
                        />
                        {t('abilityPage.progress.history')}
                    </h3>
                    <ol
                        className="flex min-w-0 flex-col gap-1.5"
                        data-testid="ability-progress-history"
                    >
                        {history.map((point, index) => (
                            <li
                                key={`${point.date}-${index}`}
                                className={`flex min-w-0 items-center gap-3 rounded-xl border-2 ${INK} px-3 py-1.5 text-sm ${point.current ? 'bg-[#fff4d6]' : 'bg-white'}`}
                            >
                                <span className="min-w-0 flex-1 truncate font-bold">
                                    {formatDate(point.date)}
                                    {point.current && (
                                        <span className="ml-2 text-xs font-semibold text-[#151b2e]/70">
                                            {t('abilityPage.progress.shown')}
                                        </span>
                                    )}
                                </span>
                                <span
                                    className={`h-2.5 w-16 shrink-0 overflow-hidden rounded-full border-2 ${INK} bg-white sm:w-28`}
                                    aria-hidden
                                >
                                    <span
                                        className="block h-full bg-[#7cc4ff]"
                                        style={{
                                            width: `${Math.max(0, Math.min(100, point.average ?? 0))}%`,
                                        }}
                                    />
                                </span>
                                <span className="w-12 shrink-0 text-right font-bold tabular-nums">
                                    {number(point.average)}
                                </span>
                            </li>
                        ))}
                    </ol>
                    <p className="text-xs text-[#151b2e]/70">
                        {t('abilityPage.progress.historyNote')}
                    </p>
                </div>
            )}
        </section>
    );
}
