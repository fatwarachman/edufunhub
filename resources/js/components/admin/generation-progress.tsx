import { ConfirmDialog } from '@/components/admin/admin-kit';
import { formatDateTime, useSubjectLabel } from '@/components/admin/game-stats';
import { tr } from '@/lib/admin-i18n';
import { cn } from '@/lib/utils';
import { Link, router } from '@inertiajs/react';
import {
    ChevronDown,
    CircleAlert,
    CircleCheck,
    CircleSlash,
    Clock,
    Loader2,
    Square,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

/**
 * Progress of AI question generation requests, shared by the generate page
 * and the question bank (so a running request shows up again when an admin
 * comes back to the question pages).
 */
export type ItemStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled';

export interface GenerationItem {
    subject: string;
    grade: number;
    status: ItemStatus;
    created: number;
    skipped: number;
    target: number;
    error: string | null;
}

export interface Generation {
    id: number;
    model: string;
    subjects: string[];
    grades: number[];
    per_combination: number;
    activate: boolean;
    status: 'queued' | 'running' | 'done' | 'failed' | 'cancelled';
    total_jobs: number;
    done_jobs: number;
    created_count: number;
    skipped_count: number;
    error: string | null;
    cancelled_at: string | null;
    requested_by: string | null;
    created_at: string | null;
    finished_at: string | null;
    items?: GenerationItem[];
}

export const gradeLabel = (grade: number) =>
    grade === 0 ? tr('TK') : tr('Grade {0}', [grade]);

export function isLiveGeneration(g: Generation): boolean {
    return g.status === 'queued' || g.status === 'running';
}

/**
 * Reloads the given Inertia props every few seconds while a request is
 * still generating; `onSettled` runs once when the last one finished.
 */
export function useGenerationPolling(
    generations: Generation[],
    only: string[],
    onSettled?: () => void,
) {
    const running = generations.some(isLiveGeneration);
    const wasRunning = useRef(running);
    const props = only.join(',');

    useEffect(() => {
        if (wasRunning.current && !running) {
            onSettled?.();
        }
        wasRunning.current = running;
    }, [running, onSettled]);

    useEffect(() => {
        if (!running) {
            return;
        }
        const id = setInterval(
            () => router.reload({ only: props.split(',') }),
            4000,
        );
        return () => clearInterval(id);
    }, [running, props]);

    return running;
}

export function GenerationRow({ generation: g }: { generation: Generation }) {
    const subjectLabel = useSubjectLabel();
    const [confirming, setConfirming] = useState(false);
    const [stopping, setStopping] = useState(false);
    const progress =
        g.total_jobs > 0 ? Math.round((g.done_jobs / g.total_jobs) * 100) : 0;
    const live = g.status === 'queued' || g.status === 'running';
    const stopRequested = live && g.cancelled_at !== null;
    const stop = () =>
        router.post(
            `/admin/questions/generate/${g.id}/cancel`,
            {},
            {
                preserveScroll: true,
                onStart: () => setStopping(true),
                onFinish: () => {
                    setStopping(false);
                    setConfirming(false);
                },
            },
        );
    return (
        <li
            className="flex flex-col gap-2 py-3"
            data-testid={`generation-${g.id}`}
            data-status={g.status}
        >
            <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                    {live ? (
                        <Loader2 className="size-4 animate-spin text-violet-500" />
                    ) : g.status === 'failed' ? (
                        <CircleAlert className="size-4 text-destructive" />
                    ) : g.status === 'cancelled' ? (
                        <CircleSlash className="size-4 text-amber-500" />
                    ) : (
                        <CircleCheck className="size-4 text-emerald-500" />
                    )}
                    {g.created_count} {tr('created')}
                    {g.skipped_count > 0 && (
                        <span className="text-xs font-normal text-muted-foreground">
                            · {g.skipped_count}{' '}
                            {tr('rejected (invalid or duplicate)')}
                        </span>
                    )}
                </span>
                <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>
                        {formatDateTime(g.created_at)} · {g.requested_by ?? '—'}{' '}
                        · <span className="font-mono">{g.model}</span>
                    </span>
                    {live && !stopRequested && (
                        <button
                            type="button"
                            onClick={() => setConfirming(true)}
                            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-red-300 bg-red-50 px-3 text-xs font-medium text-red-700 hover:bg-red-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none dark:border-red-900 dark:bg-red-950/40 dark:text-red-200 dark:hover:bg-red-950/70"
                            data-testid={`generation-${g.id}-stop`}
                        >
                            <Square
                                className="size-3.5 fill-current"
                                aria-hidden
                            />
                            {tr('Stop')}
                        </button>
                    )}
                </span>
            </div>
            {stopRequested && (
                <p
                    className="flex items-center gap-2 text-xs font-medium text-amber-700 dark:text-amber-300"
                    data-testid={`generation-${g.id}-stopping`}
                >
                    <Loader2
                        className="size-3.5 animate-spin motion-reduce:animate-none"
                        aria-hidden
                    />
                    {tr(
                        'Stopping: finishing the questions in progress, the rest will not start.',
                    )}
                </p>
            )}
            {g.status === 'cancelled' && (
                <p
                    className="text-xs font-medium text-amber-700 dark:text-amber-300"
                    data-testid={`generation-${g.id}-stopped`}
                >
                    {tr(
                        'Stopped by an admin. Questions already created are kept.',
                    )}
                </p>
            )}
            <ConfirmDialog
                open={confirming}
                title="Stop question generation?"
                message="Questions already created stay in the bank. Subjects and grades still in progress finish their current batch; the ones not started yet are skipped."
                confirmLabel={tr('Stop generating')}
                processing={stopping}
                onClose={() => setConfirming(false)}
                onConfirm={stop}
            />
            <p className="text-xs text-muted-foreground">
                {g.subjects.map((subject) => subjectLabel(subject)).join(', ')}{' '}
                · {g.grades.map(gradeLabel).join(', ')} · {g.per_combination}{' '}
                {tr('each ·')}{' '}
                {g.activate ? 'active' : tr('inactive for review')}
            </p>
            {live && (
                <div
                    className="h-1.5 overflow-hidden rounded-full bg-muted"
                    role="progressbar"
                    aria-valuenow={progress}
                    aria-valuemin={0}
                    aria-valuemax={100}
                >
                    <div
                        className="h-full rounded-full bg-violet-500 transition-[width]"
                        style={{ width: `${Math.max(4, progress)}%` }}
                    />
                </div>
            )}
            {(g.items?.length ?? 0) > 0 && (
                <SubjectProgress
                    generationId={g.id}
                    items={g.items ?? []}
                    live={live}
                />
            )}
            {g.error && (
                <p className="text-xs break-words text-destructive">
                    {g.error}
                </p>
            )}
            {g.created_count > 0 && !live && (
                <Link
                    href="/admin/questions?source=ai"
                    className="self-start link text-xs"
                >
                    {tr('Review AI questions')}
                </Link>
            )}
        </li>
    );
}

const STATUS_STYLE: Record<
    ItemStatus,
    { label: string; chip: string; bar: string; icon: string }
> = {
    queued: {
        label: 'In queue',
        chip: 'border-border bg-muted/60 text-muted-foreground',
        bar: 'bg-muted-foreground/40',
        icon: 'text-muted-foreground',
    },
    running: {
        label: 'Generating',
        chip: 'border-violet-300 bg-violet-50 text-violet-800 dark:border-violet-800 dark:bg-violet-950/50 dark:text-violet-200',
        bar: 'bg-violet-500',
        icon: 'text-violet-500',
    },
    done: {
        label: 'Done',
        chip: 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200',
        bar: 'bg-emerald-500',
        icon: 'text-emerald-500',
    },
    failed: {
        label: 'Failed',
        chip: 'border-red-300 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200',
        bar: 'bg-red-500',
        icon: 'text-destructive',
    },
    cancelled: {
        label: 'Stopped',
        chip: 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200',
        bar: 'bg-amber-500',
        icon: 'text-amber-500',
    },
};

function StatusIcon({
    status,
    className,
}: {
    status: ItemStatus;
    className?: string;
}) {
    const iconClass = cn(
        'size-3.5 shrink-0',
        STATUS_STYLE[status].icon,
        className,
    );
    if (status === 'running') {
        return (
            <Loader2
                className={cn(
                    iconClass,
                    'animate-spin motion-reduce:animate-none',
                )}
                aria-hidden
            />
        );
    }
    if (status === 'done') {
        return <CircleCheck className={iconClass} aria-hidden />;
    }
    if (status === 'failed') {
        return <CircleAlert className={iconClass} aria-hidden />;
    }
    if (status === 'cancelled') {
        return <CircleSlash className={iconClass} aria-hidden />;
    }
    return <Clock className={iconClass} aria-hidden />;
}

/** Status of a subject from the statuses of its grades. */
function subjectStatus(items: GenerationItem[]): ItemStatus {
    if (items.some((item) => item.status === 'running')) {
        return 'running';
    }
    if (items.every((item) => item.status === 'done')) {
        return 'done';
    }
    if (items.some((item) => item.status === 'queued')) {
        return items.some((item) => item.status !== 'queued')
            ? 'running'
            : 'queued';
    }
    if (items.some((item) => item.status === 'cancelled')) {
        return 'cancelled';
    }
    return 'failed';
}

export function SubjectProgress({
    generationId,
    items,
    live,
}: {
    generationId: number;
    items: GenerationItem[];
    live: boolean;
}) {
    const subjectLabel = useSubjectLabel();
    const [toggled, setToggled] = useState<boolean | null>(null);
    const open = toggled ?? live;
    const panelId = `generation-${generationId}-subjects`;

    const groups = items.reduce<Map<string, GenerationItem[]>>(
        (map, item) =>
            map.set(item.subject, [...(map.get(item.subject) ?? []), item]),
        new Map(),
    );
    const finished = items.filter(
        (item) =>
            item.status === 'done' ||
            item.status === 'failed' ||
            item.status === 'cancelled',
    ).length;
    const running = items.filter((item) => item.status === 'running');
    const now = running
        .slice(0, 3)
        .map(
            (item) =>
                `${subjectLabel(item.subject)} ${item.grade === 0 ? gradeLabel(item.grade) : gradeLabel(item.grade).toLowerCase()}`,
        )
        .join(', ');

    return (
        <div
            className="flex flex-col gap-2"
            data-testid={`generation-${generationId}-progress`}
        >
            {live && (
                <p
                    className="flex min-w-0 items-start gap-2 text-sm font-medium text-violet-700 dark:text-violet-300"
                    aria-live="polite"
                    data-testid="generation-now"
                >
                    {running.length > 0 ? (
                        <StatusIcon
                            status="running"
                            className="mt-0.5 size-4"
                        />
                    ) : (
                        <StatusIcon status="queued" className="mt-0.5 size-4" />
                    )}
                    <span className="min-w-0 break-words">
                        {running.length > 0
                            ? tr('Generating now: {0}', [
                                  running.length > 3
                                      ? `${now} ${tr('+{0} more', [running.length - 3])}`
                                      : now,
                              ])
                            : tr('Waiting for a queue worker…')}
                    </span>
                </p>
            )}
            <button
                type="button"
                onClick={() => setToggled(!open)}
                aria-expanded={open}
                aria-controls={panelId}
                className="inline-flex min-h-9 items-center gap-1.5 self-start rounded-md px-1 text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                data-testid={`generation-${generationId}-toggle`}
            >
                <ChevronDown
                    className={cn(
                        'size-4 transition-transform duration-300 motion-reduce:transition-none',
                        open ? 'rotate-180' : '',
                    )}
                    aria-hidden
                />
                {tr('Progress per subject')} ·{' '}
                {tr('{0} of {1} done', [finished, items.length])}
            </button>
            <div
                id={panelId}
                className={cn(
                    'grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none',
                    open
                        ? 'grid-rows-[1fr] opacity-100'
                        : 'grid-rows-[0fr] opacity-0',
                )}
                aria-hidden={!open}
                inert={!open}
            >
                <div className="min-h-0 overflow-hidden">
                    <ul
                        className="grid gap-2 lg:grid-cols-2"
                        data-testid={`generation-${generationId}-subjects`}
                    >
                        {[...groups.entries()].map(([subject, grades]) => (
                            <SubjectGroup
                                key={subject}
                                label={subjectLabel(subject)}
                                items={grades}
                            />
                        ))}
                    </ul>
                </div>
            </div>
        </div>
    );
}

function SubjectGroup({
    label,
    items,
}: {
    label: string;
    items: GenerationItem[];
}) {
    const status = subjectStatus(items);
    const created = items.reduce((sum, item) => sum + item.created, 0);
    const target = items.reduce((sum, item) => sum + item.target, 0);
    const percent =
        target > 0 ? Math.min(100, Math.round((created / target) * 100)) : 0;
    return (
        <li
            className="flex min-w-0 flex-col gap-2 rounded-lg border border-border bg-background/60 p-2.5"
            data-status={status}
            data-testid="generation-subject"
        >
            <div className="flex min-w-0 items-center gap-2">
                <StatusIcon status={status} className="size-4" />
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                    {label}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    {tr('{0}/{1} created', [created, target])}
                </span>
            </div>
            <div
                className="h-1.5 overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-label={label}
                aria-valuenow={percent}
                aria-valuemin={0}
                aria-valuemax={100}
            >
                <div
                    className={cn(
                        'h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none',
                        STATUS_STYLE[status].bar,
                    )}
                    style={{ width: `${percent}%` }}
                />
            </div>
            <ul className="flex flex-wrap gap-1.5">
                {items.map((item) => (
                    <li
                        key={item.grade}
                        className={cn(
                            'inline-flex h-6 max-w-full items-center gap-1 rounded-full border px-2 text-xs tabular-nums',
                            STATUS_STYLE[item.status].chip,
                        )}
                        title={
                            item.error ?? tr(STATUS_STYLE[item.status].label)
                        }
                        data-status={item.status}
                        data-testid="generation-grade"
                    >
                        <StatusIcon status={item.status} />
                        <span className="sr-only">
                            {tr(STATUS_STYLE[item.status].label)}:
                        </span>
                        <span className="whitespace-nowrap">
                            {gradeLabel(item.grade)} · {item.created}/
                            {item.target}
                        </span>
                    </li>
                ))}
            </ul>
        </li>
    );
}
