import {
    type AbilityAssessment,
    type AbilityComparisonData,
    type ComparisonSubject,
} from '@/components/admin/ability-assessment';
import { formatDateTime, useSubjectLabel } from '@/components/admin/game-stats';
import {
    type ResponsiveColumn,
    ResponsiveTable,
} from '@/components/responsive-table';
import { adminLocale, tr } from '@/lib/admin-i18n';
import { cn } from '@/lib/utils';
import {
    ArrowDownRight,
    ArrowRight,
    ArrowUpRight,
    GitCompareArrows,
    History,
    Plus,
} from 'lucide-react';
import { useId, useMemo, useState } from 'react';

const STATUS_TONE: Record<AbilityAssessment['status'], string> = {
    pending: 'bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300',
    done: 'bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-300',
    failed: 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300',
};

const STATUS_LABEL: Record<AbilityAssessment['status'], string> = {
    pending: 'Running',
    done: 'Done',
    failed: 'Failed',
};

const DELTA_TONE: Record<string, string> = {
    up: 'border-green-200 bg-green-50 text-green-700 dark:border-green-900 dark:bg-green-950/40 dark:text-green-300',
    down: 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300',
    same: 'border-border bg-muted text-muted-foreground',
    new: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300',
    gone: 'border-border bg-muted text-muted-foreground',
};

function formatScore(value: number | null | undefined): string {
    if (value === null || value === undefined) return '—';
    return value.toLocaleString(adminLocale(), { maximumFractionDigits: 1 });
}

function scoresOf(item: AbilityAssessment): Record<string, number> {
    const scores: Record<string, number> = {};
    for (const [key, value] of Object.entries(
        item.result?.subject_scores ?? {},
    )) {
        if (typeof value === 'number' && Number.isFinite(value)) {
            scores[key] = Math.max(0, Math.min(100, Math.round(value)));
        }
    }
    return scores;
}

function averageOf(scores: Record<string, number>): number | null {
    const values = Object.values(scores);
    if (values.length === 0) return null;
    return (
        Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) /
        10
    );
}

function direction(delta: number | null): string {
    if (delta === null || delta === 0) return 'same';
    return delta > 0 ? 'up' : 'down';
}

function missing(left: string[], right: string[]): string[] {
    const other = new Set(right.map((item) => item.trim().toLowerCase()));
    return left.filter(
        (item) => item.trim() !== '' && !other.has(item.trim().toLowerCase()),
    );
}

/**
 * Same rules as App\Services\AbilityComparison, for pairs the admin picks
 * (the default latest-vs-previous pair comes from the server).
 */
export function compareAssessments(
    current: AbilityAssessment,
    previous: AbilityAssessment,
): AbilityComparisonData {
    const now = scoresOf(current);
    const before = scoresOf(previous);
    const keys = Array.from(
        new Set([...Object.keys(now), ...Object.keys(before)]),
    );
    const subjects: ComparisonSubject[] = keys
        .map((subject) => {
            const currentScore = now[subject] ?? null;
            const previousScore = before[subject] ?? null;
            const delta =
                currentScore !== null && previousScore !== null
                    ? currentScore - previousScore
                    : null;
            return {
                subject,
                previous: previousScore,
                current: currentScore,
                delta,
                direction:
                    previousScore === null
                        ? 'new'
                        : currentScore === null
                          ? 'gone'
                          : direction(delta),
            };
        })
        .sort(
            (a, b) =>
                (b.delta === null ? -1 : Math.abs(b.delta)) -
                    (a.delta === null ? -1 : Math.abs(a.delta)) ||
                a.subject.localeCompare(b.subject),
        );
    const currentAverage = averageOf(now);
    const previousAverage = averageOf(before);
    const averageDelta =
        currentAverage !== null && previousAverage !== null
            ? Math.round((currentAverage - previousAverage) * 10) / 10
            : null;

    return {
        previous: {
            id: previous.id,
            date: previous.created_at,
            average: previousAverage,
        },
        current: {
            id: current.id,
            date: current.created_at,
            average: currentAverage,
        },
        average_delta: averageDelta,
        direction: direction(averageDelta),
        subjects,
        improved: subjects.filter((row) => row.direction === 'up').length,
        declined: subjects.filter((row) => row.direction === 'down').length,
        unchanged: subjects.filter((row) => row.direction === 'same').length,
        strengths_gained: missing(
            current.result?.strengths ?? [],
            previous.result?.strengths ?? [],
        ),
        strengths_lost: missing(
            previous.result?.strengths ?? [],
            current.result?.strengths ?? [],
        ),
        weaknesses_new: missing(
            current.result?.weaknesses ?? [],
            previous.result?.weaknesses ?? [],
        ),
        weaknesses_resolved: missing(
            previous.result?.weaknesses ?? [],
            current.result?.weaknesses ?? [],
        ),
    };
}

export function DeltaChip({
    delta,
    dir,
    testId,
}: {
    delta: number | null;
    dir: string;
    testId?: string;
}) {
    const Icon =
        dir === 'up'
            ? ArrowUpRight
            : dir === 'down'
              ? ArrowDownRight
              : dir === 'new'
                ? Plus
                : ArrowRight;
    const label =
        dir === 'new'
            ? tr('New')
            : dir === 'gone'
              ? tr('Not scored')
              : `${delta !== null && delta > 0 ? '+' : ''}${formatScore(delta ?? 0)}`;

    return (
        <span
            className={cn(
                'inline-flex items-center gap-0.5 rounded-full border px-2 py-0.5 text-xs font-semibold whitespace-nowrap tabular-nums',
                DELTA_TONE[dir] ?? DELTA_TONE.same,
            )}
            data-testid={testId}
            data-direction={dir}
        >
            <Icon className="size-3 shrink-0" aria-hidden />
            {label}
        </span>
    );
}

/** Tiny line of one subject's score across the finished analyses (oldest left). */
function Sparkline({ values, label }: { values: number[]; label: string }) {
    if (values.length < 2) {
        return <span className="text-xs text-muted-foreground">—</span>;
    }
    const width = 72;
    const height = 22;
    const step = width / (values.length - 1);
    const points = values
        .map(
            (value, index) =>
                `${(index * step).toFixed(1)},${(height - 2 - (value / 100) * (height - 4)).toFixed(1)}`,
        )
        .join(' ');
    const last = values[values.length - 1];
    const first = values[0];

    return (
        <svg
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label={`${label}: ${values.join(' → ')}`}
            className={cn(
                'shrink-0',
                last > first
                    ? 'text-green-600 dark:text-green-400'
                    : last < first
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-muted-foreground',
            )}
            data-testid="ability-sparkline"
        >
            <polyline
                points={points}
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
            />
        </svg>
    );
}

function ChangeList({
    title,
    items,
    tone,
}: {
    title: string;
    items: string[];
    tone: string;
}) {
    if (items.length === 0) return null;
    return (
        <div className="flex min-w-0 flex-col gap-1.5">
            <p className="text-xs font-semibold text-muted-foreground">
                {tr(title)}
            </p>
            <ul className="flex flex-wrap gap-1.5">
                {items.map((item, index) => (
                    <li
                        key={index}
                        className={cn(
                            'rounded-lg border px-2 py-0.5 text-xs [overflow-wrap:anywhere]',
                            tone,
                        )}
                    >
                        {item}
                    </li>
                ))}
            </ul>
        </div>
    );
}

/**
 * Every analysis of the player (newest first) with its average score, and a
 * comparison of any two finished ones: subject deltas, a sparkline of each
 * subject over time and strengths/weaknesses that changed.
 */
export function AbilityHistory({
    items,
    total,
    comparison,
    viewedId,
    onView,
}: {
    items: AbilityAssessment[];
    total: number;
    comparison: AbilityComparisonData | null;
    viewedId: number | null;
    onView: (id: number) => void;
}) {
    const subjectLabel = useSubjectLabel();
    const finished = useMemo(
        () => items.filter((item) => item.status === 'done' && item.result),
        [items],
    );
    const [currentId, setCurrentId] = useState<number | null>(null);
    const [previousId, setPreviousId] = useState<number | null>(null);
    const currentSelectId = useId();
    const previousSelectId = useId();

    const current =
        finished.find((item) => item.id === currentId) ?? finished[0] ?? null;
    const previous =
        finished.find((item) => item.id === previousId) ??
        finished.find((item) => item.id !== current?.id) ??
        null;

    const isDefaultPair =
        comparison !== null &&
        current?.id === comparison.current.id &&
        previous?.id === comparison.previous.id;
    const shown: AbilityComparisonData | null =
        current && previous && current.id !== previous.id
            ? isDefaultPair
                ? comparison
                : compareAssessments(current, previous)
            : null;

    const chronological = [...finished].reverse();
    const series = (subject: string): number[] =>
        chronological
            .map((item) => scoresOf(item)[subject])
            .filter((value): value is number => value !== undefined);

    const historyColumns: ResponsiveColumn<AbilityAssessment>[] = [
        {
            key: 'date',
            header: tr('Date'),
            primary: true,
            cell: (row) => (
                <span className="flex flex-wrap items-center gap-1.5">
                    <span className="font-medium text-foreground">
                        {formatDateTime(row.created_at)}
                    </span>
                    {row.id === viewedId && (
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                            {tr('Shown')}
                        </span>
                    )}
                </span>
            ),
        },
        {
            key: 'status',
            header: tr('Status'),
            summary: true,
            cell: (row) => (
                <span
                    className={cn(
                        'rounded-full px-2 py-0.5 text-[11px] font-semibold',
                        STATUS_TONE[row.status],
                    )}
                >
                    {tr(STATUS_LABEL[row.status])}
                </span>
            ),
        },
        {
            key: 'average',
            header: tr('Average score'),
            align: 'right',
            summary: true,
            cell: (row) => (
                <span className="font-semibold text-foreground tabular-nums">
                    {row.status === 'done' ? formatScore(row.average) : '—'}
                </span>
            ),
        },
        {
            key: 'by',
            header: tr('Requested by'),
            cell: (row) => (
                <span className="[overflow-wrap:anywhere] text-muted-foreground">
                    {row.requested_by ?? '—'}
                </span>
            ),
        },
        {
            key: 'note',
            header: tr('Note'),
            cell: (row) => (
                <span className="text-xs [overflow-wrap:anywhere] text-muted-foreground">
                    {row.status === 'failed'
                        ? (row.error ?? tr('Unknown error'))
                        : row.status === 'pending'
                          ? tr('Still running.')
                          : tr('{0} subjects', [
                                Object.keys(row.result?.subject_scores ?? {})
                                    .length,
                            ])}
                </span>
            ),
        },
    ];

    const compareColumns: ResponsiveColumn<ComparisonSubject>[] = [
        {
            key: 'subject',
            header: tr('Subject'),
            primary: true,
            cell: (row) => (
                <span className="font-medium text-foreground">
                    {subjectLabel(row.subject)}
                </span>
            ),
        },
        {
            key: 'delta',
            header: tr('Change'),
            summary: true,
            cell: (row) => (
                <DeltaChip
                    delta={row.delta}
                    dir={row.direction}
                    testId="ability-compare-delta"
                />
            ),
        },
        {
            key: 'previous',
            header: tr('Before'),
            align: 'right',
            cell: (row) => (
                <span className="text-muted-foreground tabular-nums">
                    {formatScore(row.previous)}
                </span>
            ),
        },
        {
            key: 'current',
            header: tr('After'),
            align: 'right',
            cell: (row) => (
                <span className="font-semibold text-foreground tabular-nums">
                    {formatScore(row.current)}
                </span>
            ),
        },
        {
            key: 'trend',
            header: tr('Over time'),
            cell: (row) => (
                <Sparkline
                    values={series(row.subject)}
                    label={subjectLabel(row.subject)}
                />
            ),
        },
    ];

    const selectClass =
        'h-9 w-full min-w-0 rounded-lg border border-input bg-background px-2.5 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';
    const optionLabel = (item: AbilityAssessment) =>
        `${formatDateTime(item.created_at)} · ${tr('avg {0}', [formatScore(item.average)])}`;

    return (
        <div className="flex min-w-0 flex-col gap-5">
            <section
                className="flex min-w-0 flex-col gap-3"
                data-testid="ability-compare"
                aria-labelledby={`${currentSelectId}-title`}
            >
                <h4
                    id={`${currentSelectId}-title`}
                    className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase"
                >
                    <GitCompareArrows className="size-3.5 shrink-0" />
                    {tr('Compare analyses')}
                </h4>
                {finished.length < 2 ? (
                    <p
                        className="rounded-xl border border-dashed border-border px-3.5 py-3 text-sm text-muted-foreground"
                        data-testid="ability-compare-empty"
                    >
                        {tr(
                            'A comparison appears once this player has at least two finished analyses.',
                        )}
                    </p>
                ) : (
                    <>
                        <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
                            <label
                                htmlFor={previousSelectId}
                                className="flex min-w-0 flex-col gap-1 text-xs font-medium text-muted-foreground"
                            >
                                {tr('Earlier analysis')}
                                <select
                                    id={previousSelectId}
                                    className={selectClass}
                                    value={previous?.id ?? ''}
                                    onChange={(event) =>
                                        setPreviousId(
                                            Number(event.target.value),
                                        )
                                    }
                                    data-testid="ability-compare-previous"
                                >
                                    {finished.map((item) => (
                                        <option
                                            key={item.id}
                                            value={item.id}
                                            disabled={item.id === current?.id}
                                        >
                                            {optionLabel(item)}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <label
                                htmlFor={currentSelectId}
                                className="flex min-w-0 flex-col gap-1 text-xs font-medium text-muted-foreground"
                            >
                                {tr('Later analysis')}
                                <select
                                    id={currentSelectId}
                                    className={selectClass}
                                    value={current?.id ?? ''}
                                    onChange={(event) =>
                                        setCurrentId(Number(event.target.value))
                                    }
                                    data-testid="ability-compare-current"
                                >
                                    {finished.map((item) => (
                                        <option
                                            key={item.id}
                                            value={item.id}
                                            disabled={item.id === previous?.id}
                                        >
                                            {optionLabel(item)}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        </div>

                        {shown && (
                            <>
                                <div
                                    className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-muted/30 px-3.5 py-2.5 text-sm"
                                    data-testid="ability-compare-summary"
                                >
                                    <span className="text-muted-foreground">
                                        {tr('Average score')}
                                    </span>
                                    <span className="font-semibold text-foreground tabular-nums">
                                        {formatScore(shown.previous.average)} →{' '}
                                        {formatScore(shown.current.average)}
                                    </span>
                                    <DeltaChip
                                        delta={shown.average_delta}
                                        dir={shown.direction}
                                    />
                                    <span className="text-xs text-muted-foreground">
                                        {tr(
                                            '{0} up · {1} down · {2} unchanged',
                                            [
                                                shown.improved,
                                                shown.declined,
                                                shown.unchanged,
                                            ],
                                        )}
                                    </span>
                                </div>
                                <ResponsiveTable
                                    rows={shown.subjects}
                                    columns={compareColumns}
                                    rowKey={(row) => row.subject}
                                    caption={tr('Subject score changes')}
                                    testId="ability-compare-table"
                                    empty={
                                        <p className="text-sm text-muted-foreground">
                                            {tr('No subject data yet')}
                                        </p>
                                    }
                                />
                                <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
                                    <ChangeList
                                        title="New strengths"
                                        items={shown.strengths_gained}
                                        tone="border-green-200 bg-green-50 text-green-800 dark:border-green-900 dark:bg-green-950/40 dark:text-green-200"
                                    />
                                    <ChangeList
                                        title="Strengths no longer listed"
                                        items={shown.strengths_lost}
                                        tone="border-border bg-muted text-muted-foreground"
                                    />
                                    <ChangeList
                                        title="Weaknesses resolved"
                                        items={shown.weaknesses_resolved}
                                        tone="border-green-200 bg-green-50 text-green-800 dark:border-green-900 dark:bg-green-950/40 dark:text-green-200"
                                    />
                                    <ChangeList
                                        title="New weaknesses"
                                        items={shown.weaknesses_new}
                                        tone="border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
                                    />
                                </div>
                            </>
                        )}
                    </>
                )}
            </section>

            <section
                className="flex min-w-0 flex-col gap-2"
                data-testid="ability-history"
            >
                <h4 className="flex flex-wrap items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    <History className="size-3.5 shrink-0" />
                    {tr('Analysis history')}
                    <span className="font-normal tracking-normal normal-case">
                        {total > items.length
                            ? tr('latest {0} of {1}', [items.length, total])
                            : tr('{0} in total', [total])}
                    </span>
                </h4>
                <p className="text-xs text-muted-foreground">
                    {tr(
                        'Every run is kept. Select a finished analysis to show its full result above.',
                    )}
                </p>
                <ResponsiveTable
                    rows={items}
                    columns={historyColumns}
                    rowKey={(row) => row.id}
                    caption={tr('Analysis history')}
                    testId="ability-history-table"
                    onRowClick={(row) => {
                        if (row.status === 'done' && row.result) {
                            onView(row.id);
                        }
                    }}
                    rowAriaLabel={(row) =>
                        tr('Show the analysis of {0}', [
                            formatDateTime(row.created_at),
                        ])
                    }
                    rowClassName={(row) =>
                        row.id === viewedId ? 'bg-primary/5' : undefined
                    }
                />
            </section>
        </div>
    );
}
