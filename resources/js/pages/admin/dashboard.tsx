import { Button } from '@/components/ui/button';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import AdminLayout from '@/layouts/admin-layout';
import { Head, Link, router } from '@inertiajs/react';
import {
    ArrowDownRight,
    ArrowUpRight,
    Boxes,
    Gamepad2,
    Shield,
    Sparkles,
    Trophy,
    Users,
} from 'lucide-react';
import {
    Area,
    AreaChart,
    CartesianGrid,
    Cell,
    Legend,
    Pie,
    PieChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';

interface Metrics {
    total_users: number;
    total_roles: number;
    total_permissions: number;
    total_superadmins: number;
    new_users_30d: number;
    user_growth_percent: number;
}

interface DailyStat {
    date: string;
    count: number;
}

interface RoleDistItem {
    role: string;
    count: number;
}

interface Sparklines {
    new_users: number[];
}

interface AdminDashboardProps {
    metrics: Metrics;
    sparklines: Sparklines;
    dailySignups: DailyStat[];
    roleDistribution: RoleDistItem[];
    recent_users: {
        id: number;
        name: string;
        email: string;
        created_at: string;
    }[];
}

function Sparkline({
    data,
    color = '#ff9e44',
}: {
    data: number[];
    color?: string;
}) {
    if (data.length < 2) return null;

    const width = 80;
    const height = 24;
    const max = Math.max(...data, 1);
    const points = data
        .map((v, i) => {
            const x = (i / (data.length - 1)) * width;
            const y = height - (v / max) * height;
            return `${x},${y}`;
        })
        .join(' ');

    return (
        <svg width={width} height={height} className="opacity-70">
            <polyline
                points={points}
                fill="none"
                stroke={color}
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}

function GrowthBadge({ value }: { value: number }) {
    const isPositive = value >= 0;

    const healthyClass = 'text-emerald-600 dark:text-emerald-400';
    const unhealthyClass = 'text-red-600 dark:text-red-400';

    const colorClass = isPositive ? healthyClass : unhealthyClass;

    return (
        <span
            className={`inline-flex items-center gap-0.5 text-xs font-medium ${colorClass}`}
        >
            {isPositive ? (
                <ArrowUpRight className="h-3 w-3" />
            ) : (
                <ArrowDownRight className="h-3 w-3" />
            )}
            {Math.abs(value)}%
        </span>
    );
}

const COLORS = ['#ff9e44', '#845ec2', '#00c9a7', '#4d8fac', '#ff6584'];

const tooltipStyle = {
    backgroundColor: 'var(--popover)',
    border: '1px solid var(--border)',
    borderRadius: '10px',
    color: 'var(--popover-foreground)',
} as const;

export default function AdminDashboard({
    metrics,
    sparklines,
    dailySignups,
    roleDistribution,
    recent_users,
}: AdminDashboardProps) {
    const avatarColor = (name: string) => {
        const colors = [
            'bg-bubble-orange/20 text-bubble-orange',
            'bg-bubble-purple/20 text-bubble-purple',
            'bg-bubble-green/20 text-bubble-green',
            'bg-bubble-blue/20 text-bubble-blue',
            'bg-bubble-pink/20 text-bubble-pink',
        ];
        let hash = 0;
        for (let i = 0; i < name.length; i++) {
            hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
        }
        return colors[hash % colors.length];
    };

    const initials = (name: string) =>
        name
            .split(' ')
            .map((n) => n[0])
            .slice(0, 2)
            .join('')
            .toUpperCase();

    const metricCardClass =
        'rounded-2xl border-0 shadow-sm transition-shadow hover:shadow-md';

    return (
        <AdminLayout>
            <Head title="Admin Dashboard" />
            <div className="flex h-full flex-1 flex-col gap-6 p-4 md:p-6 lg:p-8">
                {/* Header */}
                <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                        <div className="mb-1 inline-flex items-center gap-1.5 rounded-full bg-bubble-yellow/40 px-2.5 py-0.5 text-[11px] font-semibold text-foreground/70">
                            <Sparkles className="h-3 w-3 text-bubble-orange" />
                            EduFunHub Admin
                        </div>
                        <h2 className="font-display text-2xl font-bold tracking-tight text-foreground">
                            Pusat Kendali Pulau Ilmu 🎮
                        </h2>
                        <p className="text-sm text-muted-foreground">
                            Kelola pemain, role, dan permission platform.
                        </p>
                    </div>
                    <Button variant="outline" size="sm" asChild>
                        <Link href="/admin/users">
                            <Users className="mr-1.5 h-3.5 w-3.5" />
                            Kelola User
                        </Link>
                    </Button>
                </div>

                {/* Top Metric Cards */}
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    {/* Total Users */}
                    <Card className={metricCardClass}>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground">
                                Total Pemain
                            </CardTitle>
                            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-bubble-blue/15">
                                <Users className="h-4 w-4 text-bubble-blue" />
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="font-display text-2xl font-bold text-foreground">
                                {metrics.total_users}
                            </div>
                            <div className="mt-2 flex items-center justify-between">
                                <p className="text-xs text-muted-foreground">
                                    <GrowthBadge
                                        value={metrics.user_growth_percent}
                                    />{' '}
                                    dari 30 hari lalu
                                </p>
                                <Sparkline
                                    data={sparklines.new_users}
                                    color="#4d8fac"
                                />
                            </div>
                        </CardContent>
                    </Card>

                    {/* Superadmins */}
                    <Card className={metricCardClass}>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground">
                                Superadmin
                            </CardTitle>
                            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-bubble-pink/15">
                                <Shield className="h-4 w-4 text-bubble-pink" />
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="font-display text-2xl font-bold text-foreground">
                                {metrics.total_superadmins}
                            </div>
                            <div className="mt-2">
                                <p className="text-xs text-muted-foreground">
                                    Akses penuh ke admin panel
                                </p>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Roles */}
                    <Card className={metricCardClass}>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground">
                                Role Aktif
                            </CardTitle>
                            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-bubble-green/15">
                                <Gamepad2 className="h-4 w-4 text-bubble-green" />
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="font-display text-2xl font-bold text-foreground">
                                {metrics.total_roles}
                            </div>
                            <div className="mt-2">
                                <p className="text-xs text-muted-foreground">
                                    Kelompok permission untuk user
                                </p>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Permissions */}
                    <Card className={metricCardClass}>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground">
                                Permission
                            </CardTitle>
                            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-bubble-orange/15">
                                <Boxes className="h-4 w-4 text-bubble-orange" />
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="font-display text-2xl font-bold text-foreground">
                                {metrics.total_permissions}
                            </div>
                            <div className="mt-2">
                                <p className="text-xs text-muted-foreground">
                                    Dari {metrics.new_users_30d} pemain baru 30
                                    hari
                                </p>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Charts Row */}
                <div className="grid gap-4 md:grid-cols-7">
                    {/* Growth Chart */}
                    <Card className="rounded-2xl border-0 shadow-sm md:col-span-4">
                        <CardHeader>
                            <CardTitle className="font-display text-lg">
                                Pemain Baru
                            </CardTitle>
                            <CardDescription>
                                Registrasi per hari (14 hari terakhir)
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="pl-0">
                            <div className="h-[300px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart
                                        data={dailySignups.map((d) => ({
                                            ...d,
                                            users: d.count,
                                        }))}
                                        margin={{
                                            top: 10,
                                            right: 30,
                                            left: 0,
                                            bottom: 0,
                                        }}
                                    >
                                        <defs>
                                            <linearGradient
                                                id="colorUsers"
                                                x1="0"
                                                y1="0"
                                                x2="0"
                                                y2="1"
                                            >
                                                <stop
                                                    offset="5%"
                                                    stopColor="#ff9e44"
                                                    stopOpacity={0.3}
                                                />
                                                <stop
                                                    offset="95%"
                                                    stopColor="#ff9e44"
                                                    stopOpacity={0}
                                                />
                                            </linearGradient>
                                        </defs>
                                        <XAxis
                                            dataKey="date"
                                            stroke="var(--muted-foreground)"
                                            fontSize={12}
                                            tickLine={false}
                                            axisLine={false}
                                            dy={10}
                                        />
                                        <YAxis
                                            stroke="var(--muted-foreground)"
                                            fontSize={12}
                                            tickLine={false}
                                            axisLine={false}
                                            allowDecimals={false}
                                        />
                                        <CartesianGrid
                                            strokeDasharray="3 3"
                                            vertical={false}
                                            stroke="var(--border)"
                                            strokeOpacity={0.6}
                                        />
                                        <Tooltip contentStyle={tooltipStyle} />
                                        <Area
                                            type="monotone"
                                            dataKey="users"
                                            name="Pemain Baru"
                                            stroke="#ff9e44"
                                            strokeWidth={2}
                                            fillOpacity={1}
                                            fill="url(#colorUsers)"
                                        />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Role Distribution */}
                    <Card className="rounded-2xl border-0 shadow-sm md:col-span-3">
                        <CardHeader>
                            <CardTitle className="font-display text-lg">
                                Distribusi Role
                            </CardTitle>
                            <CardDescription>
                                Jumlah user per role
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="flex h-[300px] items-center justify-center">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={roleDistribution}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={60}
                                            outerRadius={100}
                                            paddingAngle={2}
                                            dataKey="count"
                                            nameKey="role"
                                        >
                                            {roleDistribution.map(
                                                (entry, index) => (
                                                    <Cell
                                                        key={`cell-${index}`}
                                                        fill={
                                                            COLORS[
                                                                index %
                                                                    COLORS.length
                                                            ]
                                                        }
                                                    />
                                                ),
                                            )}
                                        </Pie>
                                        <Tooltip
                                            contentStyle={tooltipStyle}
                                            formatter={
                                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                                (value: any) => [
                                                    `${value} Users`,
                                                ]
                                            }
                                        />
                                        <Legend
                                            layout="horizontal"
                                            verticalAlign="bottom"
                                            align="center"
                                        />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Recent Users */}
                <div>
                    <div className="mb-4 flex items-center justify-between">
                        <h3 className="flex items-center gap-2 font-display text-lg font-semibold tracking-tight">
                            <Trophy className="h-4 w-4 text-bubble-orange" />
                            Pemain Terbaru
                        </h3>
                        <Button variant="outline" size="sm" asChild>
                            <Link href="/admin/users">Lihat Semua →</Link>
                        </Button>
                    </div>
                    <div className="overflow-hidden rounded-2xl border bg-card text-card-foreground shadow-sm">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-muted/50 text-xs text-muted-foreground uppercase">
                                <tr>
                                    <th className="px-6 py-3 font-medium">
                                        Pemain
                                    </th>
                                    <th className="px-6 py-3 font-medium">
                                        Email
                                    </th>
                                    <th className="px-6 py-3 font-medium">
                                        Bergabung
                                    </th>
                                    <th className="px-6 py-3 text-right font-medium">
                                        Aksi
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {recent_users.length === 0 ? (
                                    <tr>
                                        <td
                                            colSpan={4}
                                            className="px-6 py-8 text-center text-muted-foreground"
                                        >
                                            Belum ada pemain.
                                        </td>
                                    </tr>
                                ) : (
                                    recent_users.map((user) => (
                                        <tr
                                            key={user.id}
                                            className="transition-colors hover:bg-muted/50"
                                        >
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div
                                                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-xs font-bold ${avatarColor(
                                                            user.name,
                                                        )}`}
                                                    >
                                                        {initials(user.name)}
                                                    </div>
                                                    <span className="font-medium">
                                                        {user.name}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-muted-foreground">
                                                {user.email}
                                            </td>
                                            <td className="px-6 py-4 text-muted-foreground">
                                                {new Date(
                                                    user.created_at,
                                                ).toLocaleDateString()}
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <Button
                                                    size="sm"
                                                    variant="secondary"
                                                    onClick={() =>
                                                        router.post(
                                                            `/admin/impersonate/${user.id}`,
                                                        )
                                                    }
                                                >
                                                    Impersonate
                                                </Button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </AdminLayout>
    );
}
