import { ActivityDetailDialog } from '@/components/admin/activity-detail-dialog';
import {
    type ActivityCauser,
    type ActivityProperties,
    type ActivitySubject,
    ActivityEventBadge,
    activityHeadline,
    eventLabel,
} from '@/components/admin/activity-entry';
import { ResponsiveTable } from '@/components/responsive-table';
import AdminLayout from '@/layouts/admin-layout';
import { adminLocale, tr } from '@/lib/admin-i18n';
import { cn } from '@/lib/utils';
import { type User } from '@/types';
import { type PaginatedData, type PaginationLink } from '@/types/admin';
import { Head, Link, router } from '@inertiajs/react';
import {
    Activity,
    Calendar,
    ChevronLeft,
    ChevronRight,
    Cog,
    Search,
    X,
} from 'lucide-react';
import {
    type ReactNode,
    useCallback,
    useEffect,
    useRef,
    useState,
} from 'react';

type Scope = 'users' | 'admin' | 'system';

interface ActivityRow {
    id: number;
    log_name: string;
    description: string;
    event: string | null;
    scope: Scope;
    causer: ActivityCauser | null;
    subject: ActivitySubject | null;
    changed_fields: string[];
    properties: ActivityProperties;
    created_at: string;
}

interface ActivityLogProps {
    logs: PaginatedData<ActivityRow>;
    users: User[];
    filters: {
        search?: string;
        user_id?: string;
        event?: string;
        scope?: Scope;
        date_from?: string;
        date_to?: string;
    };
    eventTypes: string[];
    scopes: Scope[];
}

const SCOPE_LABEL: Record<Scope, string> = {
    users: 'User activity',
    admin: 'Admin activity',
    system: 'System',
};

const SCOPE_TONE: Record<Scope, string> = {
    users: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
    admin: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
    system: 'bg-muted text-muted-foreground',
};

function Pagination({
    links,
    from,
    to,
    total,
}: {
    links: PaginationLink[];
    from: number | null;
    to: number | null;
    total: number;
}) {
    if (total <= 0) return null;
    const prev = links.find((l) => l.label.includes('Previous'));
    const next = links.find((l) => l.label.includes('Next'));
    return (
        <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">
                {from && to ? (
                    <>
                        {tr('Showing')}{' '}
                        <span className="font-medium text-foreground">
                            {from}
                        </span>{' '}
                        {tr('to')}{' '}
                        <span className="font-medium text-foreground">
                            {to}
                        </span>{' '}
                        {tr('of')}{' '}
                        <span className="font-medium text-foreground">
                            {total}
                        </span>
                    </>
                ) : (
                    tr('No results')
                )}
            </p>
            <div className="flex items-center gap-1">
                {prev?.url && (
                    <Link
                        href={prev.url}
                        className="rounded-lg p-2 text-muted-foreground hover:bg-accent"
                        preserveScroll
                        aria-label={tr('Previous')}
                    >
                        <ChevronLeft className="size-4" />
                    </Link>
                )}
                {next?.url && (
                    <Link
                        href={next.url}
                        className="rounded-lg p-2 text-muted-foreground hover:bg-accent"
                        preserveScroll
                        aria-label={tr('Next')}
                    >
                        <ChevronRight className="size-4" />
                    </Link>
                )}
            </div>
        </div>
    );
}

function initials(name: string): string {
    return name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .slice(0, 2)
        .toUpperCase();
}

function Actor({ log, compact }: { log: ActivityRow; compact?: boolean }) {
    if (!log.causer) {
        return (
            <span className="flex items-center gap-2 text-muted-foreground">
                <span
                    className={cn(
                        'flex shrink-0 items-center justify-center rounded-full bg-muted',
                        compact ? 'size-8' : 'size-7',
                    )}
                >
                    <Cog className="size-3.5" />
                </span>
                {tr('System')}
            </span>
        );
    }

    const avatar = (label: string) => (
        <span
            className={cn(
                'flex shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground',
                compact ? 'size-8' : 'size-7',
            )}
        >
            {label}
        </span>
    );

    if (log.causer.id === null || log.causer.name === null) {
        return (
            <span className="flex min-w-0 items-center gap-2 text-muted-foreground">
                {avatar('?')}
                <span className="truncate">
                    {tr('Deleted account #{0}', [log.causer.deleted_id])}
                </span>
            </span>
        );
    }

    return (
        <Link
            href={`/admin/users/${log.causer.id}`}
            className="flex min-w-0 items-center gap-2 hover:underline"
        >
            {avatar(initials(log.causer.name))}
            <span className="truncate font-medium text-foreground">
                {log.causer.name}
            </span>
        </Link>
    );
}

/** Summary line: the action, the record by name and the changed fields. */
function describe(log: ActivityRow): string {
    return activityHeadline(log);
}

function fromLink(event: { target: EventTarget }): boolean {
    return (
        event.target instanceof Element && event.target.closest('a') !== null
    );
}

function ScopeBadge({ scope }: { scope: Scope }) {
    return (
        <span
            className={cn(
                'inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap',
                SCOPE_TONE[scope],
            )}
        >
            {tr(SCOPE_LABEL[scope])}
        </span>
    );
}

export default function ActivityLogPage({
    logs,
    users,
    filters,
    eventTypes,
    scopes,
}: ActivityLogProps) {
    const [search, setSearch] = useState(filters.search ?? '');
    const [openId, setOpenId] = useState<number | null>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(
        undefined,
    );

    const updateFilters = useCallback(
        (params: Record<string, string | undefined>) => {
            const query = {
                search: filters.search,
                user_id: filters.user_id,
                event: filters.event,
                scope: filters.scope,
                date_from: filters.date_from,
                date_to: filters.date_to,
                ...params,
            };
            const cleaned = Object.fromEntries(
                Object.entries(query).filter(
                    ([, v]) => v !== undefined && v !== '',
                ),
            );
            router.get('/admin/activity-log', cleaned, {
                preserveState: true,
                preserveScroll: true,
            });
        },
        [filters],
    );

    useEffect(() => {
        if ((filters.search ?? '') === search) {
            return;
        }
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            updateFilters({ search: search || undefined });
        }, 400);
        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search]);

    const clearFilters = () => {
        setSearch('');
        router.get(
            '/admin/activity-log',
            {},
            { preserveState: true, preserveScroll: true },
        );
    };

    const hasFilters =
        filters.search ||
        filters.user_id ||
        filters.event ||
        filters.scope ||
        filters.date_from ||
        filters.date_to;

    const formatDate = (str: string) =>
        new Date(str).toLocaleString(adminLocale(), {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });

    const selectClass =
        'h-9 rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';

    return (
        <>
            <Head title={tr('Activity Log')} />

            <div className="space-y-4">
                <div>
                    <h2 className="font-display text-2xl font-bold text-foreground">
                        {tr('Activity Log')}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                        {tr(
                            'What users do in the app (sign in, play, earn badges) plus admin and system changes',
                        )}
                    </p>
                </div>

                <div
                    className="flex flex-wrap gap-2"
                    role="tablist"
                    data-testid="activity-scopes"
                >
                    {[undefined, ...scopes].map((scope) => {
                        const active = (filters.scope ?? undefined) === scope;
                        return (
                            <button
                                key={scope ?? 'all'}
                                type="button"
                                role="tab"
                                aria-selected={active}
                                data-testid={`activity-scope-${scope ?? 'all'}`}
                                onClick={() => updateFilters({ scope })}
                                className={cn(
                                    'inline-flex h-9 items-center rounded-full border px-3.5 text-sm font-medium transition-colors',
                                    active
                                        ? 'border-primary bg-primary text-primary-foreground'
                                        : 'border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground',
                                )}
                            >
                                {scope ? tr(SCOPE_LABEL[scope]) : tr('All')}
                            </button>
                        );
                    })}
                </div>

                <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm sm:flex-row sm:flex-wrap sm:items-center">
                    <div className="relative flex-1 sm:max-w-xs">
                        <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder={tr('Search activity…')}
                            className="h-9 w-full rounded-lg border border-input bg-background pr-3 pl-9 text-sm text-foreground placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                        />
                    </div>

                    <select
                        value={filters.user_id ?? ''}
                        onChange={(e) =>
                            updateFilters({
                                user_id: e.target.value || undefined,
                            })
                        }
                        className={selectClass}
                        aria-label={tr('All users')}
                    >
                        <option value="">{tr('All users')}</option>
                        {users.map((u) => (
                            <option key={u.id} value={u.id.toString()}>
                                {u.name}
                            </option>
                        ))}
                    </select>

                    <select
                        value={filters.event ?? ''}
                        onChange={(e) =>
                            updateFilters({
                                event: e.target.value || undefined,
                            })
                        }
                        className={selectClass}
                        aria-label={tr('All events')}
                        data-testid="activity-event-filter"
                    >
                        <option value="">{tr('All events')}</option>
                        {eventTypes.map((ev) => (
                            <option key={ev} value={ev}>
                                {eventLabel(ev)}
                            </option>
                        ))}
                    </select>

                    <div className="flex min-w-0 items-center gap-2">
                        <div className="relative min-w-0 flex-1">
                            <Calendar className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                            <input
                                type="date"
                                value={filters.date_from ?? ''}
                                onChange={(e) =>
                                    updateFilters({
                                        date_from: e.target.value || undefined,
                                    })
                                }
                                className="h-9 w-full rounded-lg border border-input bg-background pr-3 pl-9 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                                aria-label={tr('From date')}
                            />
                        </div>
                        <span className="text-muted-foreground">–</span>
                        <input
                            type="date"
                            value={filters.date_to ?? ''}
                            onChange={(e) =>
                                updateFilters({
                                    date_to: e.target.value || undefined,
                                })
                            }
                            className="h-9 min-w-0 flex-1 rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                            aria-label={tr('To date')}
                        />
                    </div>

                    {hasFilters && (
                        <button
                            type="button"
                            onClick={clearFilters}
                            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                        >
                            <X className="size-3.5" />
                            {tr('Clear')}
                        </button>
                    )}
                </div>

                {logs.data.length === 0 ? (
                    <div className="flex flex-col items-center justify-center rounded-2xl border border-border bg-card py-16 text-center shadow-sm">
                        <Activity className="mb-3 size-10 text-muted-foreground/30" />
                        <p className="text-sm font-medium text-muted-foreground">
                            {tr('No activity found')}
                        </p>
                    </div>
                ) : (
                    <div className="rounded-2xl border border-border bg-card shadow-sm has-[[data-layout=accordion]]:border-0 has-[[data-layout=accordion]]:bg-transparent has-[[data-layout=accordion]]:shadow-none">
                        <ResponsiveTable
                            testId="activity-table"
                            className="[&>ul]:bg-card"
                            rows={logs.data}
                            rowKey={(log) => log.id}
                            onRowClick={(log) => setOpenId(log.id)}
                            rowAriaLabel={(log) =>
                                tr('Show details: {0}', [`#${log.id}`])
                            }
                            columns={[
                                {
                                    key: 'user',
                                    header: tr('User'),
                                    primary: true,
                                    cellClassName: 'max-w-56',
                                    cell: (log) => (
                                        <span
                                            className="flex max-w-full min-w-0 flex-col items-start gap-1 [&>*]:max-w-full"
                                            data-testid="activity-row"
                                            data-scope={log.scope}
                                            data-id={log.id}
                                            onClick={(event) =>
                                                fromLink(event) &&
                                                event.stopPropagation()
                                            }
                                            onKeyDown={(event) =>
                                                fromLink(event) &&
                                                event.stopPropagation()
                                            }
                                        >
                                            <Actor log={log} />
                                            <ScopeBadge scope={log.scope} />
                                        </span>
                                    ),
                                },
                                {
                                    key: 'event',
                                    header: tr('Event'),
                                    summary: true,
                                    cell: (log) => (
                                        <ActivityEventBadge event={log.event} />
                                    ),
                                },
                                {
                                    key: 'description',
                                    header: tr('Description'),
                                    cellClassName:
                                        'max-w-md text-muted-foreground',
                                    cell: (log) => (
                                        <p className="text-left [table_&]:line-clamp-2">
                                            {describe(log)}
                                        </p>
                                    ),
                                },
                                {
                                    key: 'date',
                                    header: tr('Date'),
                                    summary: true,
                                    cellClassName:
                                        'whitespace-nowrap text-muted-foreground',
                                    cell: (log) => formatDate(log.created_at),
                                },
                            ]}
                        />
                    </div>
                )}

                <Pagination
                    links={logs.links}
                    from={logs.from}
                    to={logs.to}
                    total={logs.total}
                />
            </div>

            <ActivityDetailDialog
                activityId={openId}
                onClose={() => setOpenId(null)}
            />
        </>
    );
}

ActivityLogPage.layout = (page: ReactNode) => (
    <AdminLayout title={tr('Activity Log')}>{page}</AdminLayout>
);
