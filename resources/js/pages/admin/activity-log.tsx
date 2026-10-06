import { tr } from '@/lib/admin-i18n';
import AdminLayout from '@/layouts/admin-layout';
import { cn } from '@/lib/utils';
import { type ActivityLog, type PaginatedData, type PaginationLink } from '@/types/admin';
import { type User } from '@/types';
import { Head, Link, router } from '@inertiajs/react';
import {
    Activity,
    Calendar,
    ChevronLeft,
    ChevronRight,
    Search,
    User as UserIcon,
    X,
} from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';

interface ActivityLogProps {
    logs: PaginatedData<ActivityLog>;
    users: User[];
    filters: {
        search?: string;
        user_id?: string;
        event?: string;
        date_from?: string;
        date_to?: string;
    };
    eventTypes: string[];
}

function Pagination({ links, from, to, total }: { links: PaginationLink[]; from: number | null; to: number | null; total: number }) {
    if (total <= 0) return null;
    const prev = links.find((l) => l.label.includes('Previous'));
    const next = links.find((l) => l.label.includes('Next'));
    return (
        <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">
                {from && to ? (
                    <>{tr("Showing")} <span className="font-medium text-foreground">{from}</span> {tr("to")} <span className="font-medium text-foreground">{to}</span> {tr("of")} <span className="font-medium text-foreground">{total}</span></>
                ) : tr("No results")}
            </p>
            <div className="flex items-center gap-1">
                {prev?.url && <Link href={prev.url} className="rounded-lg p-2 text-muted-foreground hover:bg-accent" preserveScroll><ChevronLeft className="size-4" /></Link>}
                {next?.url && <Link href={next.url} className="rounded-lg p-2 text-muted-foreground hover:bg-accent" preserveScroll><ChevronRight className="size-4" /></Link>}
            </div>
        </div>
    );
}

export default function ActivityLogPage({ logs, users, filters, eventTypes }: ActivityLogProps) {
    const [search, setSearch] = useState(filters.search ?? '');
    const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    const updateFilters = useCallback(
        (params: Record<string, string | undefined>) => {
            const query = {
                search: params.search ?? filters.search,
                user_id: params.user_id ?? filters.user_id,
                event: params.event ?? filters.event,
                date_from: params.date_from ?? filters.date_from,
                date_to: params.date_to ?? filters.date_to,
            };
            const cleaned = Object.fromEntries(
                Object.entries(query).filter(([, v]) => v !== undefined && v !== ''),
            );
            router.get('/admin/activity-log', cleaned, {
                preserveState: true,
                preserveScroll: true,
            });
        },
        [filters],
    );

    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            updateFilters({ search });
        }, 400);
        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search]);

    const clearFilters = () => {
        setSearch('');
        router.get('/admin/activity-log', {}, { preserveState: true, preserveScroll: true });
    };

    const hasFilters = filters.search || filters.user_id || filters.event || filters.date_from || filters.date_to;

    const formatDate = (str: string) =>
        new Date(str).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });

    const initials = (name: string) =>
        name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();

    return (
        <>
            <Head title={tr("Activity Log")} />

            <div className="space-y-4">
                <div>
                    <h2 className="font-display text-2xl font-bold text-foreground">{tr("Activity Log")}</h2>
                    <p className="text-sm text-muted-foreground">{tr("System-wide activity audit trail")}</p>
                </div>

                {/* Filters */}
                <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm sm:flex-row sm:flex-wrap sm:items-center">
                    <div className="relative flex-1 sm:max-w-xs">
                        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder={tr("Search activity…")}
                            className="h-9 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        />
                    </div>

                    <select
                        value={filters.user_id ?? ''}
                        onChange={(e) => updateFilters({ user_id: e.target.value || undefined })}
                        className="h-9 rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        <option value="">{tr("All users")}</option>
                        {users.map((u) => (
                            <option key={u.id} value={u.id.toString()}>{u.name}</option>
                        ))}
                    </select>

                    <select
                        value={filters.event ?? ''}
                        onChange={(e) => updateFilters({ event: e.target.value || undefined })}
                        className="h-9 rounded-lg border border-input bg-background px-3 text-sm capitalize text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        <option value="">{tr("All events")}</option>
                        {eventTypes.map((ev) => (
                            <option key={ev} value={ev}>{ev}</option>
                        ))}
                    </select>

                    <div className="flex items-center gap-2">
                        <div className="relative">
                            <Calendar className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                            <input
                                type="date"
                                value={filters.date_from ?? ''}
                                onChange={(e) => updateFilters({ date_from: e.target.value || undefined })}
                                className="h-9 rounded-lg border border-input bg-background pl-9 pr-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                aria-label={tr("From date")}
                            />
                        </div>
                        <span className="text-muted-foreground">–</span>
                        <input
                            type="date"
                            value={filters.date_to ?? ''}
                            onChange={(e) => updateFilters({ date_to: e.target.value || undefined })}
                            className="h-9 rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            aria-label={tr("To date")}
                        />
                    </div>

                    {hasFilters && (
                        <button
                            onClick={clearFilters}
                            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                        >
                            <X className="size-3.5" />
                            {tr("Clear")}
                        </button>
                    )}
                </div>

                {/* Desktop table */}
                <div className="hidden rounded-2xl border border-border bg-card shadow-sm md:block">
                    {logs.data.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 text-center">
                            <Activity className="mb-3 size-10 text-muted-foreground/30" />
                            <p className="text-sm font-medium text-muted-foreground">{tr("No activity found")}</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-border">
                                        <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">{tr("User")}</th>
                                        <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">{tr("Event")}</th>
                                        <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">{tr("Description")}</th>
                                        <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">{tr("Date")}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border">
                                    {logs.data.map((log) => (
                                        <tr key={log.id} className="hover:bg-muted/30">
                                            <td className="px-5 py-3">
                                                {log.causer ? (
                                                    <div className="flex items-center gap-2">
                                                        <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                                                            {initials(log.causer.name)}
                                                        </div>
                                                        <span className="font-medium text-foreground">{log.causer.name}</span>
                                                    </div>
                                                ) : (
                                                    <span className="flex items-center gap-2 text-muted-foreground">
                                                        <UserIcon className="size-4" /> {tr("System")}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-5 py-3">
                                                {log.event && (
                                                    <span className={cn(
                                                        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize',
                                                        log.event === 'created' && 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
                                                        log.event === 'updated' && 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
                                                        log.event === 'deleted' && 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
                                                        !['created', 'updated', 'deleted'].includes(log.event) && 'bg-secondary text-secondary-foreground',
                                                    )}>
                                                        {log.event}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="max-w-sm px-5 py-3 text-muted-foreground">
                                                <p className="truncate">{tr(log.description)}</p>
                                            </td>
                                            <td className="px-5 py-3 whitespace-nowrap text-muted-foreground">
                                                {formatDate(log.created_at)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* Mobile card layout */}
                <div className="flex flex-col gap-3 md:hidden">
                    {logs.data.length === 0 ? (
                        <div className="flex flex-col items-center justify-center rounded-2xl border border-border bg-card py-16 text-center">
                            <Activity className="mb-3 size-10 text-muted-foreground/30" />
                            <p className="text-sm font-medium text-muted-foreground">{tr("No activity found")}</p>
                        </div>
                    ) : (
                        logs.data.map((log) => (
                            <div key={log.id} className="rounded-xl border border-border bg-card p-4 shadow-sm">
                                <div className="flex items-start justify-between">
                                    <div className="flex items-center gap-2">
                                        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                                            {log.causer ? initials(log.causer.name) : <UserIcon className="size-3.5" />}
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium text-foreground">
                                                {log.causer?.name ?? tr("System")}
                                            </p>
                                            <p className="text-xs text-muted-foreground">{formatDate(log.created_at)}</p>
                                        </div>
                                    </div>
                                    {log.event && (
                                        <span className={cn(
                                            'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize',
                                            log.event === 'created' && 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
                                            log.event === 'updated' && 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
                                            log.event === 'deleted' && 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
                                            !['created', 'updated', 'deleted'].includes(log.event) && 'bg-secondary text-secondary-foreground',
                                        )}>
                                            {log.event}
                                        </span>
                                    )}
                                </div>
                                <p className="mt-2 text-sm text-muted-foreground">{tr(log.description)}</p>
                            </div>
                        ))
                    )}
                </div>

                <Pagination links={logs.links} from={logs.from} to={logs.to} total={logs.total} />
            </div>
        </>
    );
}

ActivityLogPage.layout = (page: ReactNode) => (
    <AdminLayout title={tr("Activity Log")}>{page}</AdminLayout>
);
