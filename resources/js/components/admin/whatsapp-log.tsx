import { timeAgo } from '@/components/admin/dashboard-kit';
import { formatDateTime } from '@/components/admin/game-stats';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { WhatsAppIcon } from '@/components/whatsapp-share-button';
import { tr } from '@/lib/admin-i18n';
import http from '@/lib/http';
import { cn } from '@/lib/utils';
import { Link, router } from '@inertiajs/react';
import {
    AlertCircle,
    CircleAlert,
    CircleCheck,
    CircleSlash,
    Clock,
    Copy,
    Loader2,
    RotateCcw,
    UserRound,
} from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';

export type WhatsAppStatus = 'queued' | 'sent' | 'failed' | 'skipped';

/** One log entry as sent by the server (number already masked). */
export interface WhatsAppLogEntry {
    id: number;
    event: string;
    event_label: string;
    phone: string;
    user: { id: number; name: string; email: string } | null;
    body: string;
    status: WhatsAppStatus;
    error: string | null;
    provider_message_id: string | null;
    created_at: string | null;
    updated_at: string | null;
    sent_at: string | null;
}

const STATUS_STYLE: Record<
    WhatsAppStatus,
    { tone: string; label: string; icon: typeof Clock }
> = {
    queued: {
        tone: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
        label: 'Queued',
        icon: Clock,
    },
    sent: {
        tone: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
        label: 'Sent',
        icon: CircleCheck,
    },
    failed: {
        tone: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
        label: 'Failed',
        icon: CircleAlert,
    },
    skipped: {
        tone: 'bg-slate-200 text-slate-700 dark:bg-slate-700/60 dark:text-slate-200',
        label: 'Skipped',
        icon: CircleSlash,
    },
};

export function WhatsAppStatusBadge({ status }: { status: WhatsAppStatus }) {
    const { tone, label, icon: Icon } = STATUS_STYLE[status];

    return (
        <span
            className={cn(
                'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap',
                tone,
            )}
            data-testid="wa-status-badge"
            data-status={status}
        >
            <Icon className="size-3.5" aria-hidden />
            {tr(label)}
        </span>
    );
}

export function WhatsAppEventChip({ entry }: { entry: WhatsAppLogEntry }) {
    return (
        <span
            className="inline-flex max-w-full items-center truncate rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground"
            title={entry.event}
        >
            {tr(entry.event_label)}
        </span>
    );
}

/** Recipient name (links to the user page) with the masked number. */
export function WhatsAppRecipient({ entry }: { entry: WhatsAppLogEntry }) {
    return (
        <span className="flex min-w-0 flex-col">
            <span className="truncate font-medium text-foreground">
                {entry.user?.name ?? tr('Unknown recipient')}
            </span>
            <span className="font-mono text-xs text-muted-foreground">
                {entry.phone}
            </span>
        </span>
    );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="grid gap-1 py-2.5 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-3">
            <dt className="text-xs font-medium text-muted-foreground">
                {tr(label)}
            </dt>
            <dd className="min-w-0 text-sm [overflow-wrap:anywhere] text-foreground">
                {children}
            </dd>
        </div>
    );
}

function Timestamp({ value }: { value: string | null }) {
    if (!value) {
        return <span className="text-muted-foreground">—</span>;
    }

    return (
        <span className="tabular-nums">
            {formatDateTime(value)}{' '}
            <span className="text-xs text-muted-foreground">
                ({timeAgo(value)})
            </span>
        </span>
    );
}

/**
 * Detail modal of one WhatsApp log entry, loaded on open from
 * GET /admin/whatsapp/log/{id}. Failed messages can be sent again.
 */
export function WhatsAppLogDialog({
    messageId,
    onClose,
}: {
    messageId: number | null;
    onClose: () => void;
}) {
    const [detail, setDetail] = useState<WhatsAppLogEntry | null>(null);
    const [failedId, setFailedId] = useState<number | null>(null);
    const [retrying, setRetrying] = useState(false);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (messageId === null) {
            return;
        }
        let active = true;
        http.get<WhatsAppLogEntry>(`/admin/whatsapp/log/${messageId}`).then(
            ({ data, response }) => {
                if (!active) {
                    return;
                }
                if (response.ok && data) {
                    setDetail(data);
                } else {
                    setFailedId(messageId);
                }
            },
            () => active && setFailedId(messageId),
        );

        return () => {
            active = false;
        };
    }, [messageId]);

    const ready = detail !== null && detail.id === messageId;
    const failed = !ready && failedId === messageId;

    const copyBody = async () => {
        if (!ready) {
            return;
        }
        try {
            await navigator.clipboard.writeText(detail.body);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
        } catch {
            setCopied(false);
        }
    };

    const retry = () => {
        if (!ready) {
            return;
        }
        router.post(
            `/admin/whatsapp/messages/${detail.id}/retry`,
            {},
            {
                preserveScroll: true,
                onStart: () => setRetrying(true),
                onFinish: () => setRetrying(false),
                onSuccess: () => onClose(),
            },
        );
    };

    return (
        <Dialog
            open={messageId !== null}
            onOpenChange={(open) => !open && onClose()}
        >
            <DialogContent
                className="max-h-[calc(100dvh-2rem)] overflow-y-auto p-4 outline-none sm:max-w-2xl sm:p-6 dark:border-white/15 dark:shadow-[0_0_24px_rgba(255,255,255,0.06)]"
                data-testid="wa-log-dialog"
                onOpenAutoFocus={(event) => {
                    event.preventDefault();
                    (event.currentTarget as HTMLElement).focus();
                }}
            >
                <DialogHeader className="pr-6 text-left">
                    <div className="flex flex-wrap items-center gap-2">
                        {ready && (
                            <WhatsAppStatusBadge status={detail.status} />
                        )}
                        <span className="text-xs text-muted-foreground">
                            {tr('Message details')}
                            {messageId !== null && ` #${messageId}`}
                        </span>
                    </div>
                    <DialogTitle className="flex items-center gap-2 text-base leading-snug">
                        <WhatsAppIcon className="size-5 shrink-0 text-[#25d366]" />
                        {ready ? tr(detail.event_label) : tr('Loading…')}
                    </DialogTitle>
                    <DialogDescription className="sr-only">
                        {tr(
                            'Recipient, message text, delivery status and timestamps',
                        )}
                    </DialogDescription>
                </DialogHeader>

                {ready ? (
                    <div className="flex min-w-0 flex-col gap-4">
                        {detail.error && (
                            <div
                                role={
                                    detail.status === 'skipped'
                                        ? 'status'
                                        : 'alert'
                                }
                                className={cn(
                                    'flex items-start gap-2 rounded-xl border px-3 py-2.5 text-sm',
                                    detail.status === 'skipped'
                                        ? 'border-slate-300 bg-slate-50 text-slate-800 dark:border-slate-600 dark:bg-slate-800/60 dark:text-slate-100'
                                        : 'border-red-200 bg-red-50 text-red-900 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200',
                                )}
                                data-testid="wa-log-dialog-error"
                            >
                                {detail.status === 'skipped' ? (
                                    <CircleSlash className="mt-0.5 size-4 shrink-0" />
                                ) : (
                                    <CircleAlert className="mt-0.5 size-4 shrink-0" />
                                )}
                                <span className="[overflow-wrap:anywhere]">
                                    {detail.error}
                                </span>
                            </div>
                        )}

                        <dl className="divide-y divide-border rounded-xl border border-border px-4 dark:border-white/15">
                            <Row label="Recipient">
                                {detail.user ? (
                                    <Link
                                        href={`/admin/users/${detail.user.id}`}
                                        className="inline-flex min-w-0 items-center gap-1.5 font-medium hover:underline"
                                    >
                                        <UserRound className="size-4 shrink-0 text-muted-foreground" />
                                        <span className="truncate">
                                            {detail.user.name}
                                        </span>
                                    </Link>
                                ) : (
                                    <span className="text-muted-foreground">
                                        {tr('Unknown recipient')}
                                    </span>
                                )}
                                {detail.user && (
                                    <span className="block text-xs text-muted-foreground">
                                        {detail.user.email}
                                    </span>
                                )}
                            </Row>
                            <Row label="WhatsApp number">
                                <span className="font-mono">
                                    {detail.phone}
                                </span>
                            </Row>
                            <Row label="Event">
                                {tr(detail.event_label)}{' '}
                                <span className="font-mono text-xs text-muted-foreground">
                                    ({detail.event})
                                </span>
                            </Row>
                            <Row label="Created">
                                <Timestamp value={detail.created_at} />
                            </Row>
                            <Row label="Sent">
                                <Timestamp value={detail.sent_at} />
                            </Row>
                            <Row label="Updated">
                                <Timestamp value={detail.updated_at} />
                            </Row>
                            <Row label="Provider message ID">
                                <span className="font-mono text-xs">
                                    {detail.provider_message_id ?? '—'}
                                </span>
                            </Row>
                        </dl>

                        <div className="flex flex-col gap-2">
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-medium text-muted-foreground">
                                    {tr('Message')}
                                </span>
                                <button
                                    type="button"
                                    onClick={copyBody}
                                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-medium text-foreground hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none dark:border-white/15"
                                    data-testid="wa-log-dialog-copy"
                                >
                                    <Copy className="size-3.5" />
                                    {copied ? tr('Copied') : tr('Copy')}
                                </button>
                            </div>
                            <div className="rounded-2xl rounded-tl-sm border border-emerald-200 bg-[#e7fbe4] p-3.5 text-sm [overflow-wrap:anywhere] whitespace-pre-wrap text-[#111b21] dark:border-emerald-900/60 dark:bg-[#0b3b2e] dark:text-emerald-50">
                                <span data-testid="wa-log-dialog-body">
                                    {detail.body}
                                </span>
                            </div>
                        </div>

                        {detail.status === 'failed' && (
                            <div className="flex justify-end border-t border-border pt-4 dark:border-white/15">
                                <button
                                    type="button"
                                    onClick={retry}
                                    disabled={retrying}
                                    className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50"
                                    data-testid="wa-log-dialog-retry"
                                >
                                    {retrying ? (
                                        <Loader2 className="size-4 animate-spin" />
                                    ) : (
                                        <RotateCcw className="size-4" />
                                    )}
                                    {tr('Retry')}
                                </button>
                            </div>
                        )}
                    </div>
                ) : failed ? (
                    <p className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
                        <AlertCircle className="size-4" />
                        {tr('Could not load the details. Try again.')}
                    </p>
                ) : (
                    <div
                        className="flex items-center justify-center py-10 text-muted-foreground"
                        role="status"
                        aria-label={tr('Loading…')}
                    >
                        <Loader2 className="size-5 animate-spin" />
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
