import { SimplePagination } from '@/components/admin/admin-kit';
import { timeAgo } from '@/components/admin/dashboard-kit';
import { EmptyState, formatDateTime } from '@/components/admin/game-stats';
import {
    WhatsAppEventChip,
    WhatsAppLogDialog,
    type WhatsAppLogEntry,
    WhatsAppRecipient,
    type WhatsAppStatus,
    WhatsAppStatusBadge,
} from '@/components/admin/whatsapp-log';
import { ResponsiveTable } from '@/components/responsive-table';
import { WhatsAppIcon } from '@/components/whatsapp-share-button';
import AdminLayout from '@/layouts/admin-layout';
import { tr } from '@/lib/admin-i18n';
import { cn } from '@/lib/utils';
import { type PaginatedData } from '@/types/admin';
import { Head, Link, router } from '@inertiajs/react';
import { Calendar, Inbox, Search, Settings2, X } from 'lucide-react';
import { type ReactNode, useEffect, useRef, useState } from 'react';

interface Filters {
    search?: string;
    status?: WhatsAppStatus;
    event?: string;
    date_from?: string;
    date_to?: string;
}

interface Props {
    messages: PaginatedData<WhatsAppLogEntry>;
    filters: Filters;
    events: { value: string; label: string }[];
    totals: Record<'all' | WhatsAppStatus, number>;
    successRate: number | null;
}

const STATUS_TABS: { key: WhatsAppStatus | undefined; label: string }[] = [
    { key: undefined, label: 'All' },
    { key: 'sent', label: 'Sent' },
    { key: 'queued', label: 'Queued' },
    { key: 'failed', label: 'Failed' },
    { key: 'skipped', label: 'Skipped' },
];

const fieldClass =
    'h-9 rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';

export default function WhatsAppLogPage({
    messages,
    filters,
    events,
    totals,
    successRate,
}: Props) {
    const [search, setSearch] = useState(filters.search ?? '');
    const [openId, setOpenId] = useState<number | null>(null);
    const debounce = useRef<ReturnType<typeof setTimeout> | undefined>(
        undefined,
    );

    const apply = (changes: Partial<Filters>) => {
        const query = Object.fromEntries(
            Object.entries({ ...filters, ...changes }).filter(
                ([, value]) => value !== undefined && value !== '',
            ),
        );
        router.get('/admin/whatsapp/log', query, {
            preserveState: true,
            preserveScroll: true,
            replace: true,
        });
    };

    useEffect(() => {
        if ((filters.search ?? '') === search) {
            return;
        }
        clearTimeout(debounce.current);
        debounce.current = setTimeout(
            () => apply({ search: search || undefined }),
            400,
        );

        return () => clearTimeout(debounce.current);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search]);

    const hasFilters = Boolean(
        filters.search ||
        filters.status ||
        filters.event ||
        filters.date_from ||
        filters.date_to,
    );

    return (
        <>
            <Head title={tr('WhatsApp Log')} />
            <div className="flex w-full flex-col gap-5">
                <div className="flex flex-wrap items-end justify-between gap-3">
                    <div className="min-w-0">
                        <h1 className="flex items-center gap-2 font-display text-2xl font-bold text-foreground">
                            <WhatsAppIcon className="size-6 text-[#25d366]" />
                            {tr('WhatsApp Log')}
                        </h1>
                        <p className="max-w-2xl text-sm text-muted-foreground">
                            {tr(
                                'Every WhatsApp message the app sent or tried to send. Click a row for the full details.',
                            )}
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        {successRate !== null && (
                            <span
                                className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-sm text-muted-foreground"
                                data-testid="wa-log-success-rate"
                            >
                                {tr('Success rate (7 days)')}
                                <span className="font-semibold text-foreground tabular-nums">
                                    {successRate}%
                                </span>
                            </span>
                        )}
                        <Link
                            href="/admin/whatsapp"
                            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-sm font-medium text-foreground hover:bg-accent"
                        >
                            <Settings2 className="size-4" />
                            {tr('WhatsApp settings')}
                        </Link>
                    </div>
                </div>

                <div
                    className="flex flex-wrap gap-2"
                    role="tablist"
                    aria-label={tr('Status')}
                    data-testid="wa-log-tabs"
                >
                    {STATUS_TABS.map(({ key, label }) => {
                        const active = filters.status === key;
                        const count = totals[key ?? 'all'];
                        return (
                            <button
                                key={key ?? 'all'}
                                type="button"
                                role="tab"
                                aria-selected={active}
                                onClick={() => apply({ status: key })}
                                className={cn(
                                    'inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition-colors',
                                    active
                                        ? 'border-primary bg-primary text-primary-foreground'
                                        : 'border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground',
                                )}
                                data-testid={`wa-log-tab-${key ?? 'all'}`}
                            >
                                {tr(label)}
                                <span
                                    className={cn(
                                        'rounded-full px-1.5 text-xs tabular-nums',
                                        active
                                            ? 'bg-primary-foreground/20'
                                            : 'bg-muted',
                                    )}
                                >
                                    {count}
                                </span>
                            </button>
                        );
                    })}
                </div>

                <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm sm:flex-row sm:flex-wrap sm:items-center">
                    <div className="relative min-w-0 flex-1 sm:max-w-xs">
                        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                        <input
                            type="search"
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            placeholder={tr('Search name, number or text…')}
                            aria-label={tr('Search name, number or text…')}
                            className={cn(fieldClass, 'w-full pl-9')}
                            data-testid="wa-log-search"
                        />
                    </div>
                    <select
                        value={filters.event ?? ''}
                        onChange={(event) =>
                            apply({ event: event.target.value || undefined })
                        }
                        className={fieldClass}
                        aria-label={tr('All events')}
                        data-testid="wa-log-event"
                    >
                        <option value="">{tr('All events')}</option>
                        {events.map((event) => (
                            <option key={event.value} value={event.value}>
                                {tr(event.label)}
                            </option>
                        ))}
                    </select>
                    <div className="flex min-w-0 items-center gap-2">
                        <div className="relative min-w-0 flex-1">
                            <Calendar className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                            <input
                                type="date"
                                value={filters.date_from ?? ''}
                                max={filters.date_to}
                                onChange={(event) =>
                                    apply({
                                        date_from:
                                            event.target.value || undefined,
                                    })
                                }
                                className={cn(fieldClass, 'w-full pl-9')}
                                aria-label={tr('From date')}
                            />
                        </div>
                        <span className="text-muted-foreground">–</span>
                        <input
                            type="date"
                            value={filters.date_to ?? ''}
                            min={filters.date_from}
                            onChange={(event) =>
                                apply({
                                    date_to: event.target.value || undefined,
                                })
                            }
                            className={cn(fieldClass, 'min-w-0 flex-1')}
                            aria-label={tr('To date')}
                        />
                    </div>
                    {hasFilters && (
                        <button
                            type="button"
                            onClick={() => {
                                setSearch('');
                                router.get(
                                    '/admin/whatsapp/log',
                                    {},
                                    { preserveScroll: true, replace: true },
                                );
                            }}
                            className="inline-flex h-9 items-center gap-1 rounded-lg px-2 text-sm text-muted-foreground hover:text-foreground"
                            data-testid="wa-log-clear"
                        >
                            <X className="size-3.5" />
                            {tr('Clear')}
                        </button>
                    )}
                </div>

                {messages.data.length === 0 ? (
                    <div
                        className="rounded-2xl border border-border bg-card shadow-sm"
                        data-testid="wa-log-empty"
                    >
                        <EmptyState
                            icon={Inbox}
                            title={
                                hasFilters
                                    ? 'No messages match these filters.'
                                    : 'No WhatsApp messages yet.'
                            }
                        />
                    </div>
                ) : (
                    <div className="rounded-2xl border border-border bg-card shadow-sm has-[[data-layout=accordion]]:border-0 has-[[data-layout=accordion]]:bg-transparent has-[[data-layout=accordion]]:shadow-none">
                        <ResponsiveTable
                            testId="wa-log-table"
                            className="[&>ul]:bg-card"
                            rows={messages.data}
                            rowKey={(entry) => entry.id}
                            onRowClick={(entry) => setOpenId(entry.id)}
                            rowAriaLabel={(entry) =>
                                tr('Show details: {0}', [`#${entry.id}`])
                            }
                            columns={[
                                {
                                    key: 'recipient',
                                    header: tr('Recipient'),
                                    primary: true,
                                    cellClassName: 'max-w-60',
                                    cell: (entry) => (
                                        <span
                                            data-testid="wa-log-row"
                                            data-id={entry.id}
                                        >
                                            <WhatsAppRecipient entry={entry} />
                                        </span>
                                    ),
                                },
                                {
                                    key: 'status',
                                    header: tr('Status'),
                                    summary: true,
                                    cell: (entry) => (
                                        <WhatsAppStatusBadge
                                            status={entry.status}
                                        />
                                    ),
                                },
                                {
                                    key: 'event',
                                    header: tr('Event'),
                                    summary: true,
                                    cellClassName: 'max-w-44',
                                    cell: (entry) => (
                                        <WhatsAppEventChip entry={entry} />
                                    ),
                                },
                                {
                                    key: 'message',
                                    header: tr('Message'),
                                    cellClassName:
                                        'max-w-md text-muted-foreground',
                                    cell: (entry) => (
                                        <MessagePreview entry={entry} />
                                    ),
                                },
                                {
                                    key: 'date',
                                    header: tr('Date'),
                                    summary: true,
                                    cellClassName:
                                        'whitespace-nowrap text-muted-foreground',
                                    cell: (entry) => (
                                        <time
                                            dateTime={
                                                entry.created_at ?? undefined
                                            }
                                            title={formatDateTime(
                                                entry.created_at,
                                            )}
                                            className="tabular-nums"
                                        >
                                            {timeAgo(entry.created_at)}
                                        </time>
                                    ),
                                },
                            ]}
                        />
                    </div>
                )}

                <SimplePagination
                    links={messages.links}
                    from={messages.from}
                    to={messages.to}
                    total={messages.total}
                />
            </div>

            <WhatsAppLogDialog
                messageId={openId}
                onClose={() => setOpenId(null)}
            />
        </>
    );
}

function MessagePreview({ entry }: { entry: WhatsAppLogEntry }) {
    return (
        <span className="flex min-w-0 flex-col gap-0.5 text-left">
            <span className="[table_&]:line-clamp-2">{entry.body}</span>
            {entry.error && (
                <span
                    className={cn(
                        'text-xs [table_&]:line-clamp-1',
                        entry.status === 'skipped'
                            ? 'text-muted-foreground'
                            : 'text-red-600 dark:text-red-400',
                    )}
                >
                    {entry.error}
                </span>
            )}
        </span>
    );
}

WhatsAppLogPage.layout = (page: ReactNode) => (
    <AdminLayout title={tr('WhatsApp Log')}>{page}</AdminLayout>
);
