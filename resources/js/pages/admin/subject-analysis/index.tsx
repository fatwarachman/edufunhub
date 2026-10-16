import {
    EmptyState,
    fieldClass,
    formatNumber,
    Panel,
    useSubjectLabel,
} from '@/components/admin/game-stats';
import {
    MASTERY_METHOD,
    MasteryRate,
    type SubjectSummary,
} from '@/components/admin/subject-analysis';
import { ResponsiveTable } from '@/components/responsive-table';
import AdminLayout from '@/layouts/admin-layout';
import { adminLocale, tr } from '@/lib/admin-i18n';
import { Head, Link } from '@inertiajs/react';
import { BookMarked, PieChartIcon } from 'lucide-react';
import { useState } from 'react';
import {
    Cell,
    Pie,
    PieChart,
    Tooltip as RechartsTooltip,
    ResponsiveContainer,
} from 'recharts';

const PIE = [
    '#6366f1',
    '#fb923c',
    '#34d399',
    '#fbbf24',
    '#f472b6',
    '#38bdf8',
    '#a78bfa',
    '#fb7185',
    '#a3e635',
    '#818cf8',
];

function PieLegend({ data }: { data: { label: string; answered: number }[] }) {
    const labelName = useSubjectLabel();
    const total = data.reduce((s, r) => s + r.answered, 0);
    return (
        <div className="flex flex-col gap-1.5 text-sm">
            {data.map((entry, i) => {
                const pct =
                    total > 0
                        ? ((entry.answered / total) * 100).toFixed(1)
                        : '0.0';
                return (
                    <div
                        key={entry.label}
                        className="flex min-w-0 items-center gap-2"
                    >
                        <span
                            className="inline-block size-3 shrink-0 rounded-sm"
                            style={{ background: PIE[i % PIE.length] }}
                        />
                        <span className="text-muted-foreground">
                            {labelName(entry.label)}
                        </span>
                        <span className="font-medium text-foreground tabular-nums">
                            {pct}%
                        </span>
                    </div>
                );
            })}
        </div>
    );
}

export default function SubjectAnalysis({
    subjects,
    totalsBySubject: totalsRaw,
}: {
    subjects: SubjectSummary[];
    totalsBySubject: {
        label: string;
        answered: number;
        correct: number;
        players: number;
    }[];
}) {
    const [search, setSearch] = useState('');
    const name = (subject: SubjectSummary) =>
        adminLocale().startsWith('id')
            ? subject.name_id
            : subject.name_en || subject.name_id;
    const rows = subjects.filter((subject) =>
        `${subject.name_id} ${subject.name_en ?? ''}`
            .toLocaleLowerCase()
            .includes(search.toLocaleLowerCase()),
    );
    const totalsBySubject = totalsRaw.sort((a, b) => b.answered - a.answered);
    const labelName = useSubjectLabel();
    return (
        <AdminLayout title="Subject Analysis">
            <Head title={tr('Subject Analysis')} />
            <div className="flex flex-col gap-6" data-testid="subject-analysis">
                <div className="flex flex-col gap-2">
                    <h1 className="text-2xl font-bold text-foreground">
                        {tr('Subject Analysis')}
                    </h1>
                    <p className="max-w-2xl text-sm text-muted-foreground">
                        {tr(
                            'Explore subject mastery and compare learning outcomes by grade.',
                        )}
                    </p>
                </div>
                <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
                    <Panel
                        title="Subject mastery"
                        description="All-time recorded answers. Select a subject to explore its analysis."
                        icon={BookMarked}
                    >
                        <div className="flex flex-col gap-4">
                            <label className="flex max-w-sm flex-col gap-2 text-sm font-medium">
                                {tr('Search subjects')}
                                <input
                                    type="search"
                                    value={search}
                                    onChange={(event) =>
                                        setSearch(event.target.value)
                                    }
                                    className={fieldClass}
                                />
                            </label>
                            {rows.length === 0 ? (
                                <EmptyState
                                    icon={BookMarked}
                                    title="No subjects found"
                                />
                            ) : (
                                <ResponsiveTable
                                    rows={rows}
                                    rowKey={(row) => row.id}
                                    columns={[
                                        {
                                            key: 'name',
                                            header: tr('Subject'),
                                            primary: true,
                                            cell: (row) => (
                                                <Link
                                                    href={row.detail_url}
                                                    className="inline-flex min-h-11 items-center font-semibold text-primary underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                                                >
                                                    {name(row)}
                                                </Link>
                                            ),
                                        },
                                        {
                                            key: 'rate',
                                            header: tr('Mastery rate'),
                                            summary: true,
                                            cell: (row) => (
                                                <MasteryRate
                                                    rate={row.success_rate}
                                                />
                                            ),
                                        },
                                        {
                                            key: 'questions',
                                            header: tr('Questions'),
                                            align: 'right',
                                            cell: (row) =>
                                                formatNumber(row.questions),
                                        },
                                        {
                                            key: 'answered',
                                            header: tr('Recorded answers'),
                                            align: 'right',
                                            cell: (row) =>
                                                formatNumber(row.answered),
                                        },
                                        {
                                            key: 'players',
                                            header: tr('Players'),
                                            align: 'right',
                                            cell: (row) =>
                                                formatNumber(row.players),
                                        },
                                    ]}
                                />
                            )}
                        </div>
                    </Panel>
                    <Panel
                        title="Share of answered questions per subject"
                        description="Relative proportion of recorded answers per subject (answered questions)"
                        icon={PieChartIcon}
                    >
                        {totalsBySubject.length === 0 ? (
                            <EmptyState
                                icon={PieChartIcon}
                                title="No recorded answers"
                            />
                        ) : (
                            <>
                                <div className="flex min-w-0 items-center justify-center">
                                    <ResponsiveContainer
                                        width="100%"
                                        height={280}
                                    >
                                        <PieChart
                                            margin={{
                                                top: 16,
                                                right: 16,
                                                bottom: 16,
                                                left: 16,
                                            }}
                                        >
                                            <Pie
                                                data={totalsBySubject}
                                                dataKey="answered"
                                                nameKey="label"
                                                cx="50%"
                                                cy="50%"
                                                innerRadius="32%"
                                                outerRadius="55%"
                                                paddingAngle={2}
                                                activeShape={{
                                                    stroke: 'var(--ring)',
                                                    strokeWidth: 2,
                                                }}
                                                label={(entry) => {
                                                    const pct = (
                                                        (entry.percent ?? 0) *
                                                        100
                                                    ).toFixed(1);
                                                    return Number(pct) >= 4
                                                        ? `${pct}%`
                                                        : '';
                                                }}
                                                labelLine={false}
                                            >
                                                {totalsBySubject.map(
                                                    (entry, i) => (
                                                        <Cell
                                                            key={entry.label}
                                                            fill={
                                                                PIE[
                                                                    i %
                                                                        PIE.length
                                                                ]
                                                            }
                                                            aria-label={labelName(
                                                                entry.label,
                                                            )}
                                                        />
                                                    ),
                                                )}
                                            </Pie>
                                            <RechartsTooltip
                                                contentStyle={{
                                                    background:
                                                        'var(--popover)',
                                                    border: '1px solid var(--border)',
                                                    borderRadius: 8,
                                                    fontSize: 13,
                                                }}
                                                formatter={(value, name) => [
                                                    formatNumber(Number(value)),
                                                    labelName(String(name)),
                                                ]}
                                            />
                                        </PieChart>
                                    </ResponsiveContainer>
                                </div>
                                <PieLegend data={totalsBySubject} />
                            </>
                        )}
                    </Panel>
                </div>
                <p className="max-w-3xl text-xs leading-relaxed text-muted-foreground">
                    {tr(MASTERY_METHOD)}
                </p>
            </div>
        </AdminLayout>
    );
}
