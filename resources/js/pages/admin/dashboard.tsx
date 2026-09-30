import AdminLayout from '@/layouts/admin-layout';
import { type DashboardStats, type ActivityLog } from '@/types/admin';
import { Head, Link } from '@inertiajs/react';
import {
    Activity,
    ArrowUpRight,
    KeyRound,
    Lock,
    Plus,
    ShieldCheck,
    TrendingUp,
    UserCheck,
    Users,
} from 'lucide-react';
import { type ReactNode } from 'react';

interface DashboardProps {
    stats: DashboardStats;
    recentActivity: ActivityLog[];
}

function StatCard({
    label,
    value,
    icon: Icon,
    trend,
    color,
    href,
}: {
    label: string;
    value: number;
    icon: React.ElementType;
    trend?: number;
    color: string;
    href: string;
}) {
    return (
        <Link
            href={href}
            className="group flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
            <div className="flex items-start justify-between">
                <div
                    className={`flex size-10 items-center justify-center rounded-xl ${color} text-white shadow-sm`}
                >
                    <Icon className="size-5" />
                </div>
                <ArrowUpRight className="size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
            </div>
            <div>
                <p className="text-3xl font-bold text-foreground tabular-nums">
                    {value.toLocaleString()}
                </p>
                <p className="mt-0.5 text-sm text-muted-foreground">{label}</p>
            </div>
            {trend !== undefined && (
                <div className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                    <TrendingUp className="size-3" />
                    <span>+{trend}% this month</span>
                </div>
            )}
        </Link>
    );
}

function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
}

function getInitialsFromName(name: string): string {
    return name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .slice(0, 2)
        .toUpperCase();
}

function ActivityItem({ log }: { log: ActivityLog }) {
    const causerName = log.causer?.name ?? 'System';
    const initials = getInitialsFromName(causerName);

    return (
        <li className="flex items-start gap-3 py-3">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                {initials}
            </div>
            <div className="min-w-0 flex-1">
                <p className="text-sm text-foreground">
                    <span className="font-medium">{causerName}</span>{' '}
                    <span className="text-muted-foreground">{log.description}</span>
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">{timeAgo(log.created_at)}</p>
            </div>
        </li>
    );
}

export default function Dashboard({ stats, recentActivity }: DashboardProps) {
    const statCards = [
        {
            label: 'Total Users',
            value: stats.total_users,
            icon: Users,
            trend: stats.users_trend,
            color: 'bg-bubble-blue',
            href: '/admin/users',
        },
        {
            label: 'Active Users (30d)',
            value: stats.active_users,
            icon: UserCheck,
            trend: stats.active_trend,
            color: 'bg-bubble-green',
            href: '/admin/users',
        },
        {
            label: 'Total Roles',
            value: stats.total_roles,
            icon: ShieldCheck,
            color: 'bg-bubble-purple',
            href: '/admin/roles',
        },
        {
            label: 'Total Permissions',
            value: stats.total_permissions,
            icon: Lock,
            color: 'bg-bubble-orange',
            href: '/admin/permissions',
        },
    ];

    return (
        <>
            <Head title="Admin Dashboard" />

            <div className="space-y-6">
                {/* Page header */}
                <div>
                    <h2 className="font-display text-2xl font-bold text-foreground">Dashboard</h2>
                    <p className="text-sm text-muted-foreground">
                        System overview and quick actions
                    </p>
                </div>

                {/* Stats grid */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    {statCards.map((card) => (
                        <StatCard key={card.label} {...card} />
                    ))}
                </div>

                {/* Lower section */}
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                    {/* Recent activity */}
                    <div className="lg:col-span-2">
                        <div className="rounded-2xl border border-border bg-card shadow-sm">
                            <div className="flex items-center justify-between border-b border-border px-5 py-4">
                                <div className="flex items-center gap-2">
                                    <Activity className="size-4 text-muted-foreground" />
                                    <h3 className="font-semibold text-foreground">
                                        Recent Activity
                                    </h3>
                                </div>
                                <Link
                                    href="/admin/activity-log"
                                    className="text-xs text-primary hover:underline"
                                >
                                    View all
                                </Link>
                            </div>

                            <div className="px-5">
                                {recentActivity.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-12 text-center">
                                        <Activity className="mb-2 size-8 text-muted-foreground/40" />
                                        <p className="text-sm text-muted-foreground">
                                            No recent activity
                                        </p>
                                    </div>
                                ) : (
                                    <ul className="divide-y divide-border">
                                        {recentActivity.map((log) => (
                                            <ActivityItem key={log.id} log={log} />
                                        ))}
                                    </ul>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Quick actions */}
                    <div>
                        <div className="rounded-2xl border border-border bg-card shadow-sm">
                            <div className="border-b border-border px-5 py-4">
                                <h3 className="font-semibold text-foreground">Quick Actions</h3>
                            </div>
                            <div className="flex flex-col gap-2 p-5">
                                {[
                                    {
                                        label: 'Add new user',
                                        href: '/admin/users/create',
                                        icon: Users,
                                        color: 'bg-bubble-blue/10 text-bubble-blue hover:bg-bubble-blue/20',
                                    },
                                    {
                                        label: 'Create role',
                                        href: '/admin/roles/create',
                                        icon: ShieldCheck,
                                        color: 'bg-bubble-purple/10 text-bubble-purple hover:bg-bubble-purple/20',
                                    },
                                    {
                                        label: 'View permissions',
                                        href: '/admin/permissions',
                                        icon: KeyRound,
                                        color: 'bg-bubble-orange/10 text-bubble-orange hover:bg-bubble-orange/20',
                                    },
                                    {
                                        label: 'Activity log',
                                        href: '/admin/activity-log',
                                        icon: Activity,
                                        color: 'bg-bubble-green/10 text-bubble-green hover:bg-bubble-green/20',
                                    },
                                ].map((action) => (
                                    <Link
                                        key={action.href}
                                        href={action.href}
                                        className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${action.color}`}
                                    >
                                        <Plus className="size-4 shrink-0" />
                                        {action.label}
                                    </Link>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}

Dashboard.layout = (page: ReactNode) => (
    <AdminLayout title="Dashboard">{page}</AdminLayout>
);
