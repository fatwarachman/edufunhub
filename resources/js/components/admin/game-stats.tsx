import { ResponsiveTable } from '@/components/responsive-table';
import { tr } from '@/lib/admin-i18n';
import { cn } from '@/lib/utils';
import { usePage } from '@inertiajs/react';
import { type ReactNode } from 'react';

export const GAME_LABELS: Record<string, string> = {
    'flag-quest': 'Flag Quest',
    'sky-quiz': 'Sky Quiz',
    'snakes-and-ladders': 'Snakes & Ladders',
    'quiz-duel': 'Class Quiz Duel',
    'knowledge-train': 'Knowledge Train',
    crossword: 'Crossword',
    'market-math': 'Market Math',
    'number-garden': 'Number & Letter Garden',
    'explore-indonesia': 'Explore Indonesia',
    'mini-lab': 'Mini Lab',
    'floor-drop': 'Floor Drop',
    'economy-heist': 'Economy Heist',
    'order-rush': 'Order Rush TKJ',
    'port-sorter': 'Port Sorter',
    'turbo-trivia': 'Turbo Trivia',
};

/**
 * Admin subject labels (every subject, hidden ones too) from the shared
 * `subjectLabels` prop, so subjects added in /admin/subjects show by name.
 */
export function useSubjectLabel(): (
    subject: string | null | undefined,
) => string {
    const labels =
        usePage<{ subjectLabels?: Record<string, string> }>().props
            .subjectLabels ?? {};
    return (subject) => (subject ? (labels[subject] ?? subject) : '');
}

export const LEVEL_LABELS: Record<string, string> = {
    sd: 'Elementary (SD, grade 1–6)',
    smp: 'Junior high (SMP, grade 7–9)',
    sma: 'Senior high (SMA, grade 10–12)',
    unknown: 'Unknown',
};

export const BAND_LABELS: Record<number, string> = {
    0: 'Grade 1–3',
    1: 'Grade 4–6',
    2: 'Grade 7–9',
    3: 'Grade 10–12',
};

export function gameLabel(key: string): string {
    return GAME_LABELS[key] ?? key;
}

export function formatNumber(value: number | null | undefined): string {
    return (value ?? 0).toLocaleString();
}

export function formatPercent(value: number | null | undefined): string {
    return value === null || value === undefined ? '—' : `${value}%`;
}

export function formatDuration(seconds: number | null | undefined): string {
    if (seconds === null || seconds === undefined) return '—';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export function formatDateTime(value: string | null | undefined): string {
    if (!value) return '—';
    return new Date(value).toLocaleString(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

/** Colour scale for success/accuracy rates. */
export function rateTone(value: number | null | undefined): string {
    if (value === null || value === undefined) return 'text-muted-foreground';
    if (value >= 70) return 'text-green-600 dark:text-green-400';
    if (value >= 40) return 'text-amber-600 dark:text-amber-400';
    return 'text-red-600 dark:text-red-400';
}

export function StatTile({
    label,
    value,
    hint,
    icon: Icon,
    color,
}: {
    label: string;
    value: ReactNode;
    hint?: ReactNode;
    icon: React.ElementType;
    color: string;
}) {
    return (
        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div
                className={cn(
                    'flex size-10 items-center justify-center rounded-xl text-white shadow-sm',
                    color,
                )}
            >
                <Icon className="size-5" />
            </div>
            <div className="flex flex-col gap-0.5">
                <p className="text-2xl font-bold text-foreground tabular-nums">
                    {value}
                </p>
                <p className="text-sm text-muted-foreground">{tr(label)}</p>
                {hint && (
                    <p className="text-xs text-muted-foreground/80">
                        {tr(hint)}
                    </p>
                )}
            </div>
        </div>
    );
}

export function Panel({
    title,
    description,
    icon: Icon,
    actions,
    children,
    className,
}: {
    title: string;
    description?: string;
    icon?: React.ElementType;
    actions?: ReactNode;
    children: ReactNode;
    className?: string;
}) {
    return (
        <section
            className={cn(
                'flex min-w-0 flex-col rounded-2xl border border-border bg-card shadow-sm',
                className,
            )}
        >
            <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
                <div className="flex min-w-0 flex-col gap-0.5">
                    <h3 className="flex items-center gap-2 font-semibold text-foreground">
                        {Icon && (
                            <Icon className="size-4 shrink-0 text-muted-foreground" />
                        )}
                        {tr(title)}
                    </h3>
                    {description && (
                        <p className="text-xs text-muted-foreground">
                            {tr(description)}
                        </p>
                    )}
                </div>
                {actions}
            </header>
            <div className="min-w-0 p-5">{children}</div>
        </section>
    );
}

export function EmptyState({
    icon: Icon,
    title,
    description,
}: {
    icon: React.ElementType;
    title: string;
    description?: string;
}) {
    return (
        <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
            <Icon className="size-8 text-muted-foreground/40" />
            <p className="text-sm font-medium text-muted-foreground">
                {tr(title)}
            </p>
            {description && (
                <p className="max-w-sm text-xs text-muted-foreground/70">
                    {tr(description)}
                </p>
            )}
        </div>
    );
}

export interface Bucket {
    label: string;
    plays: number;
    players: number;
    avg_points: number;
    accuracy: number | null;
    success_rate: number | null;
}

/** Table of grouped stats with an inline bar for share of plays. */
export function BucketTable({
    rows,
    labelHeader,
    labelFor = (label) => label,
}: {
    rows: Bucket[];
    labelHeader: string;
    labelFor?: (label: string) => string;
}) {
    const max = Math.max(1, ...rows.map((row) => row.plays));
    const visible = rows.filter(
        (row) => row.plays > 0 || row.label !== 'unknown',
    );

    return (
        <ResponsiveTable
            rows={visible}
            rowKey={(row) => row.label}
            columns={[
                {
                    key: 'label',
                    header: labelHeader,
                    primary: true,
                    cellClassName:
                        'font-medium whitespace-nowrap text-foreground',
                    cell: (row) => labelFor(row.label),
                },
                {
                    key: 'plays',
                    header: tr('Plays'),
                    summary: true,
                    cell: (row) => (
                        <span className="flex items-center gap-2">
                            <span className="h-2 w-24 shrink-0 overflow-hidden rounded-full bg-muted">
                                <span
                                    className="block h-full rounded-full bg-primary"
                                    style={{
                                        width: `${(row.plays / max) * 100}%`,
                                    }}
                                />
                            </span>
                            <span className="text-foreground tabular-nums">
                                {formatNumber(row.plays)}
                            </span>
                        </span>
                    ),
                },
                {
                    key: 'players',
                    header: tr('Players'),
                    align: 'right',
                    headerClassName: 'whitespace-normal',
                    cellClassName: 'text-foreground tabular-nums',
                    cell: (row) => formatNumber(row.players),
                },
                {
                    key: 'avg_points',
                    header: tr('Avg points'),
                    align: 'right',
                    headerClassName: 'whitespace-normal',
                    cellClassName: 'text-foreground tabular-nums',
                    cell: (row) => row.avg_points,
                },
                {
                    key: 'accuracy',
                    header: tr('Accuracy'),
                    align: 'right',
                    headerClassName: 'whitespace-normal',
                    cell: (row) => (
                        <span
                            className={cn(
                                'font-medium tabular-nums',
                                rateTone(row.accuracy),
                            )}
                        >
                            {formatPercent(row.accuracy)}
                        </span>
                    ),
                },
                {
                    key: 'success',
                    header: tr('Success'),
                    align: 'right',
                    headerClassName: 'whitespace-normal',
                    cell: (row) => (
                        <span
                            className={cn(
                                'font-medium tabular-nums',
                                rateTone(row.success_rate),
                            )}
                        >
                            {formatPercent(row.success_rate)}
                        </span>
                    ),
                },
            ]}
        />
    );
}

export const fieldClass =
    'h-9 rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
