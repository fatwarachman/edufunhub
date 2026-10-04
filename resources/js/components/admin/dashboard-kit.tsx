import { formatNumber, gameLabel } from '@/components/admin/game-stats';
import { cn } from '@/lib/utils';
import { Link } from '@inertiajs/react';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { type ReactNode } from 'react';
import { Area, AreaChart, ResponsiveContainer } from 'recharts';

export const LEVEL_SHORT: Record<string, string> = {
    sd: 'SD',
    smp: 'SMP',
    sma: 'SMA',
    unknown: 'Unknown',
};

export const LEVEL_COLORS: Record<string, string> = {
    sd: 'var(--color-bubble-blue)',
    smp: 'var(--color-bubble-green)',
    sma: 'var(--color-bubble-purple)',
    unknown: 'var(--muted-foreground)',
};

export const GAME_COLORS: Record<string, string> = {
    'flag-quest': 'var(--color-bubble-green)',
    'sky-quiz': 'var(--color-bubble-blue)',
    'snakes-and-ladders': 'var(--color-bubble-orange)',
};

export const chartTooltipStyle = {
    background: 'var(--popover)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    color: 'var(--popover-foreground)',
    fontSize: 12,
    boxShadow: '0 8px 24px rgb(0 0 0 / 0.12)',
};

export const axisTick = { fill: 'var(--muted-foreground)', fontSize: 11 };

export function timeAgo(value: string | null | undefined): string {
    if (!value) return '—';
    const mins = Math.floor((Date.now() - new Date(value).getTime()) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 30) return `${days}d ago`;
    return new Date(value).toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    });
}

export function initials(name: string | null | undefined): string {
    return (name ?? '?')
        .split(' ')
        .filter(Boolean)
        .map((part) => part[0])
        .join('')
        .slice(0, 2)
        .toUpperCase();
}

/** Percentage change versus the previous period. */
export function Delta({
    value,
    suffix = 'vs prev. 7d',
}: {
    value: number | null | undefined;
    suffix?: string;
}) {
    if (value === null || value === undefined) {
        return (
            <span className="text-xs text-muted-foreground">
                No comparison yet
            </span>
        );
    }
    const Icon = value > 0 ? ArrowUpRight : value < 0 ? ArrowDownRight : Minus;

    return (
        <span className="inline-flex items-center gap-1 text-xs">
            <span
                className={cn(
                    'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-semibold tabular-nums',
                    value > 0 &&
                        'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
                    value < 0 && 'bg-red-500/10 text-red-700 dark:text-red-300',
                    value === 0 && 'bg-muted text-muted-foreground',
                )}
            >
                <Icon className="size-3" />
                {Math.abs(value)}%
            </span>
            <span className="text-muted-foreground">{suffix}</span>
        </span>
    );
}

export function Sparkline({
    data,
    dataKey,
    color,
}: {
    data: Record<string, number | string>[];
    dataKey: string;
    color: string;
}) {
    const id = `spark-${dataKey}-${color.replace(/[^a-z0-9]/gi, '')}`;

    return (
        <div className="h-12 w-full" aria-hidden="true">
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                    data={data}
                    margin={{ top: 4, right: 0, bottom: 0, left: 0 }}
                >
                    <defs>
                        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
                            <stop
                                offset="0%"
                                stopColor={color}
                                stopOpacity={0.35}
                            />
                            <stop
                                offset="100%"
                                stopColor={color}
                                stopOpacity={0}
                            />
                        </linearGradient>
                    </defs>
                    <Area
                        type="monotone"
                        dataKey={dataKey}
                        stroke={color}
                        strokeWidth={2}
                        fill={`url(#${id})`}
                        isAnimationActive={false}
                    />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
}

export function KpiCard({
    label,
    value,
    icon: Icon,
    accent,
    footer,
    spark,
    href,
}: {
    label: string;
    value: ReactNode;
    icon: React.ElementType;
    accent: string;
    footer?: ReactNode;
    spark?: { data: Record<string, number | string>[]; dataKey: string };
    href?: string;
}) {
    const body = (
        <>
            <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-col gap-1">
                    <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                        {label}
                    </span>
                    <span className="font-display text-3xl leading-none font-bold text-foreground tabular-nums">
                        {value}
                    </span>
                </div>
                <span
                    className="flex size-10 shrink-0 items-center justify-center rounded-xl"
                    style={{
                        background: `color-mix(in oklab, ${accent} 16%, transparent)`,
                        color: accent,
                    }}
                >
                    <Icon className="size-5" />
                </span>
            </div>
            {spark && (
                <Sparkline
                    data={spark.data}
                    dataKey={spark.dataKey}
                    color={accent}
                />
            )}
            {footer && (
                <div className="mt-auto flex min-h-6 items-center">
                    {footer}
                </div>
            )}
        </>
    );
    const classes =
        'group relative flex min-w-0 flex-col gap-3 overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-sm transition-all';

    return href ? (
        <Link
            href={href}
            className={cn(
                classes,
                'hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
            )}
        >
            {body}
        </Link>
    ) : (
        <div className={classes}>{body}</div>
    );
}

/** Horizontal share bars for small categorical breakdowns. */
export function ShareBars({
    rows,
    total,
    emptyLabel = 'No data yet',
}: {
    rows: {
        key: string;
        label: ReactNode;
        value: number;
        color: string;
        hint?: ReactNode;
    }[];
    total?: number;
    emptyLabel?: string;
}) {
    const sum = total ?? rows.reduce((acc, row) => acc + row.value, 0);
    if (sum === 0) {
        return (
            <p className="py-6 text-center text-sm text-muted-foreground">
                {emptyLabel}
            </p>
        );
    }

    return (
        <div className="flex flex-col gap-3">
            <div
                className="flex h-3 w-full overflow-hidden rounded-full bg-muted"
                aria-hidden="true"
            >
                {rows.map((row) =>
                    row.value > 0 ? (
                        <span
                            key={row.key}
                            className="h-full"
                            style={{
                                width: `${(row.value / sum) * 100}%`,
                                background: row.color,
                            }}
                        />
                    ) : null,
                )}
            </div>
            <ul className="flex flex-col gap-2">
                {rows.map((row) => (
                    <li
                        key={row.key}
                        className="flex items-center gap-2 text-sm"
                    >
                        <span
                            className="size-2.5 shrink-0 rounded-full"
                            style={{ background: row.color }}
                        />
                        <span className="min-w-0 flex-1 truncate text-foreground">
                            {row.label}
                        </span>
                        {row.hint && (
                            <span className="text-xs text-muted-foreground">
                                {row.hint}
                            </span>
                        )}
                        <span className="font-semibold text-foreground tabular-nums">
                            {formatNumber(row.value)}
                        </span>
                        <span className="w-11 text-right text-xs text-muted-foreground tabular-nums">
                            {Math.round((row.value / sum) * 100)}%
                        </span>
                    </li>
                ))}
            </ul>
        </div>
    );
}

export function UserAvatar({
    name,
    src,
    className,
}: {
    name: string | null | undefined;
    src?: string | null;
    className?: string;
}) {
    return (
        <span
            className={cn(
                'flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/15 text-xs font-bold text-primary',
                className,
            )}
        >
            {src ? (
                <img src={src} alt="" className="size-full object-cover" />
            ) : (
                initials(name)
            )}
        </span>
    );
}

export function GameDot({ game }: { game: string }) {
    return (
        <span className="inline-flex items-center gap-1.5">
            <span
                className="size-2 shrink-0 rounded-full"
                style={{ background: GAME_COLORS[game] ?? 'var(--primary)' }}
            />
            {gameLabel(game)}
        </span>
    );
}

export function SectionHeading({
    title,
    description,
    actions,
}: {
    title: string;
    description?: string;
    actions?: ReactNode;
}) {
    return (
        <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="flex flex-col gap-0.5">
                <h3 className="font-display text-lg font-bold text-foreground">
                    {title}
                </h3>
                {description && (
                    <p className="text-sm text-muted-foreground">
                        {description}
                    </p>
                )}
            </div>
            {actions}
        </div>
    );
}
