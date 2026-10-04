import { cn } from '@/lib/utils';
import { type SharedData } from '@/types';
import { Link, usePage } from '@inertiajs/react';
import {
    ChevronLeft,
    ChevronRight,
    CircleAlert,
    CircleCheck,
    Loader2,
    Sparkles,
} from 'lucide-react';
import { type ReactNode, useEffect } from 'react';

export interface PageLink {
    url: string | null;
    label: string;
    active: boolean;
}

export interface Paginated<T> {
    data: T[];
    links: PageLink[];
    from: number | null;
    to: number | null;
    total: number;
}

/** Success / error banner from the session flash and validation errors. */
export function FlashMessages({ errors }: { errors?: Record<string, string> }) {
    const { flash } = usePage<SharedData>().props;
    const messages = [
        flash?.success && { tone: 'success' as const, text: flash.success },
        flash?.error && { tone: 'error' as const, text: flash.error },
        ...Object.values(errors ?? {}).map((text) => ({
            tone: 'error' as const,
            text,
        })),
    ].filter(Boolean) as { tone: 'success' | 'error'; text: string }[];

    if (messages.length === 0) {
        return null;
    }

    return (
        <div className="flex flex-col gap-2">
            {messages.map(({ tone, text }) => (
                <div
                    key={tone + text}
                    role={tone === 'error' ? 'alert' : 'status'}
                    className={cn(
                        'flex items-start gap-2 rounded-2xl border px-4 py-3 text-sm',
                        tone === 'success'
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200'
                            : 'border-red-200 bg-red-50 text-red-900 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200',
                    )}
                >
                    {tone === 'success' ? (
                        <CircleCheck className="mt-0.5 size-4 shrink-0" />
                    ) : (
                        <CircleAlert className="mt-0.5 size-4 shrink-0" />
                    )}
                    {text}
                </div>
            ))}
        </div>
    );
}

/** Modal confirmation with Esc / outside-click to dismiss. */
export function ConfirmDialog({
    open,
    title,
    message,
    confirmLabel,
    tone = 'danger',
    processing,
    onClose,
    onConfirm,
}: {
    open: boolean;
    title: string;
    message: ReactNode;
    confirmLabel: string;
    tone?: 'danger' | 'primary';
    processing: boolean;
    onClose: () => void;
    onConfirm: () => void;
}) {
    useEffect(() => {
        if (!open) {
            return;
        }
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape' && !processing) {
                onClose();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, processing, onClose]);

    if (!open) {
        return null;
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
                className="fixed inset-0 bg-black/50"
                onClick={() => !processing && onClose()}
            />
            <div
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="confirm-title"
                className="relative z-10 w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl dark:border-white/15 dark:shadow-[0_0_24px_rgba(255,255,255,0.06)]"
            >
                <h3
                    id="confirm-title"
                    className="text-lg font-semibold text-foreground"
                >
                    {title}
                </h3>
                <div className="mt-2 text-sm text-muted-foreground">
                    {message}
                </div>
                <div className="mt-6 flex items-center justify-end gap-3">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={processing}
                        className="h-9 rounded-lg px-4 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        disabled={processing}
                        className={cn(
                            'flex h-9 items-center gap-2 rounded-lg px-4 text-sm font-medium focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50',
                            tone === 'danger'
                                ? 'bg-destructive text-white hover:bg-destructive/90'
                                : 'bg-primary text-primary-foreground hover:bg-primary/90',
                        )}
                    >
                        {processing && (
                            <Loader2 className="size-4 animate-spin" />
                        )}
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}

/** Previous / next pagination with a result range. */
export function SimplePagination({
    links,
    from,
    to,
    total,
}: Pick<Paginated<unknown>, 'links' | 'from' | 'to' | 'total'>) {
    if (total <= 0) {
        return null;
    }
    const prev = links.find((link) => link.label.includes('Previous'));
    const next = links.find((link) => link.label.includes('Next'));
    const button =
        'inline-flex h-9 items-center gap-1 rounded-lg border border-border px-3 text-sm font-medium';

    return (
        <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground tabular-nums">
                {from}–{to} of {total}
            </p>
            <div className="flex items-center gap-2">
                {prev?.url ? (
                    <Link
                        href={prev.url}
                        preserveScroll
                        className={cn(button, 'hover:bg-muted')}
                    >
                        <ChevronLeft className="size-4" />
                        Prev
                    </Link>
                ) : (
                    <span className={cn(button, 'opacity-40')}>
                        <ChevronLeft className="size-4" />
                        Prev
                    </span>
                )}
                {next?.url ? (
                    <Link
                        href={next.url}
                        preserveScroll
                        className={cn(button, 'hover:bg-muted')}
                    >
                        Next
                        <ChevronRight className="size-4" />
                    </Link>
                ) : (
                    <span className={cn(button, 'opacity-40')}>
                        Next
                        <ChevronRight className="size-4" />
                    </span>
                )}
            </div>
        </div>
    );
}

/** Small active / inactive status pill. */
export function StatusPill({ active }: { active: boolean }) {
    return (
        <span
            className={cn(
                'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap',
                active
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                    : 'bg-muted text-muted-foreground',
            )}
        >
            {active ? 'Active' : 'Hidden'}
        </span>
    );
}

/** Flag for questions written by the AI generator. */
export function AiBadge({ className }: { className?: string }) {
    return (
        <span
            className={cn(
                'inline-flex items-center gap-1 rounded-full border border-violet-300 bg-violet-50 px-1.5 py-0.5 align-middle text-[11px] leading-none font-semibold text-violet-700 dark:border-violet-800 dark:bg-violet-950/50 dark:text-violet-300',
                className,
            )}
        >
            <Sparkles className="size-3" />
            AI
        </span>
    );
}
