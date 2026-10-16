import {
    EmptyState,
    formatNumber,
    formatPercent,
    gameLabel,
    Panel,
    QUESTION_LEVEL_LABELS,
} from '@/components/admin/game-stats';
import {
    MASTERY_METHOD,
    MasteryBreakdown,
    MasteryRate,
    type MasteryBucket,
    type SubjectSummary,
} from '@/components/admin/subject-analysis';
import { ResponsiveTable } from '@/components/responsive-table';
import AdminLayout from '@/layouts/admin-layout';
import { adminLocale, tr } from '@/lib/admin-i18n';
import { masteryInsight } from '@/lib/mastery-insight';
import { Head, Link } from '@inertiajs/react';
import { ArrowLeft, BookMarked, Info, Trophy } from 'lucide-react';
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

interface Analysis {
    summary: Omit<MasteryBucket, 'label'> & { questions: number };
    byGrade: MasteryBucket[];
    byLevel: MasteryBucket[];
    byGame: MasteryBucket[];
    topGrades: MasteryBucket[];
    minAnswers: number;
    byLevelCounts: { label: string | null; questions: number }[];
    conclusion: {
        total_answered: number;
        success_rate: number | null;
        top_grade: string | null;
        top_grade_rate: number | null;
        grade_count: number;
        warnings: string[];
    };
    weakestQuestions: {
        id: number;
        prompt: string;
        prompt_en: string | null;
        answered: number;
        correct: number;
        success_rate: number | null;
    }[];
}

const WARN_LABELS: Record<string, { id: string; en: string }> = {
    low_mastery: {
        id: 'Tingkat penguasaan masih rendah (<50%). Perbanyak latihan dan evaluasi soal yang sulit.',
        en: 'Mastery rate below 50%. Increase practice and review difficult questions.',
    },
    weak_questions: {
        id: 'Ada beberapa soal dengan tingkat kebenaran sangat rendah. Tinjau ulang soal-soal tersebut.',
        en: 'Several questions with extremely low correct rates. Review those questions.',
    },
    narrow_grade: {
        id: 'Data hanya mencakup sedikit kelas. Bandingkan dengan kelas lain untuk wawasan lebih luas.',
        en: 'Data covers only a few grades. Compare across more grades for broader insight.',
    },
};

export default function SubjectAnalysisDetail({
    subject,
    analysis,
    indexUrl,
}: {
    subject: Pick<
        SubjectSummary,
        'id' | 'key' | 'name_id' | 'name_en' | 'detail_url'
    >;
    analysis: Analysis;
    indexUrl: string;
}) {
    const name = adminLocale().startsWith('id')
        ? subject.name_id
        : subject.name_en || subject.name_id;
    const gradeLabel = (grade: string | null) =>
        grade === null || grade === 'unknown'
            ? tr('Unknown')
            : tr('Grade {0}', [grade]);
    const insight = masteryInsight(
        analysis.summary.answered,
        analysis.summary.correct,
    );
    const insightMsg: Record<string, { id: string; en: string }> = {
        empty: {
            id: 'Subject belum memiliki jawaban tercatat.',
            en: 'No recorded answers yet for this subject.',
        },
        limited: {
            id: 'Data masih sedikit (<10 jawaban). Kesimpulan belum dapat diandalkan.',
            en: 'Limited data (<10 answers). Conclusions may not be reliable yet.',
        },
        strong: {
            id: 'Pemain umumnya menguasai subject ini dengan baik. Pertahankan!',
            en: 'Players generally master this subject well. Keep it up!',
        },
        developing: {
            id: 'Penguasaan cukup, masih ada ruang peningkatan.',
            en: 'Moderate mastery — room for improvement remains.',
        },
        priority: {
            id: 'Subject ini perlu perhatian khusus. Tingkat penguasaan di bawah 50%.',
            en: 'This subject needs attention. Mastery rate below 50%.',
        },
    };
    const warnMsg = (w: string) =>
        (adminLocale().startsWith('id')
            ? WARN_LABELS[w]?.id
            : WARN_LABELS[w]?.en) ?? w;
    const insightText = adminLocale().startsWith('id')
        ? insightMsg[insight]?.id
        : insightMsg[insight]?.en;

    return (
        <AdminLayout>
            <Head title={`${name} · ${tr('Subject Analysis')}`} />
            <div
                className="flex flex-col gap-6"
                data-testid="subject-analysis-detail"
            >
                <div className="flex flex-col items-start gap-2">
                    <Link
                        href={indexUrl}
                        className="inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
                    >
                        <ArrowLeft className="size-4" aria-hidden="true" />
                        {tr('Subject Analysis')}
                    </Link>
                    <h1 className="text-2xl font-bold text-foreground">
                        {name}
                    </h1>
                    <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
                        {tr(MASTERY_METHOD)}
                    </p>
                </div>

                <section
                    className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm"
                    aria-label={tr('Conclusion')}
                >
                    <div className="flex items-center gap-2">
                        <Info
                            className="size-5 shrink-0 text-muted-foreground"
                            aria-hidden="true"
                        />
                        <h2 className="font-semibold text-foreground">
                            {tr('Conclusion')}
                        </h2>
                    </div>
                    <p className="text-sm">{insightText}</p>
                    {analysis.conclusion.top_grade && (
                        <p className="text-sm text-muted-foreground">
                            {tr('Best performing grade: {0} ({1} mastery)', [
                                gradeLabel(analysis.conclusion.top_grade),
                                formatPercent(
                                    analysis.conclusion.top_grade_rate,
                                ),
                            ])}
                        </p>
                    )}
                    {analysis.conclusion.warnings.length > 0 && (
                        <ul className="flex flex-col gap-2">
                            {analysis.conclusion.warnings.map((w) => (
                                <li
                                    key={w}
                                    className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-200"
                                >
                                    <span
                                        aria-hidden="true"
                                        className="mt-0.5 shrink-0"
                                    >
                                        ⚠
                                    </span>
                                    <span>{warnMsg(w)}</span>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>

                <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                    {[
                        [
                            'Mastery rate',
                            formatPercent(analysis.summary.success_rate),
                        ],
                        [
                            'Recorded answers',
                            formatNumber(analysis.summary.answered),
                        ],
                        ['Players', formatNumber(analysis.summary.players)],
                        ['Questions', formatNumber(analysis.summary.questions)],
                    ].map(([label, value]) => (
                        <div
                            key={label}
                            className="flex min-w-0 flex-col gap-2 rounded-2xl border border-border bg-card p-5 shadow-sm"
                        >
                            <dt className="text-sm text-muted-foreground">
                                {tr(label)}
                            </dt>
                            <dd className="text-2xl font-bold tabular-nums">
                                {value}
                            </dd>
                        </div>
                    ))}
                </dl>

                <div className="grid gap-6 lg:grid-cols-[1fr_auto]">
                    <Panel
                        title="Question level distribution"
                        description="Number of questions per difficulty level"
                        icon={BookMarked}
                    >
                        {analysis.byLevelCounts.length === 0 ? (
                            <EmptyState
                                icon={BookMarked}
                                title="No questions"
                            />
                        ) : (
                            <>
                                <div className="flex items-center justify-center">
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
                                                data={analysis.byLevelCounts}
                                                dataKey="questions"
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
                                                {analysis.byLevelCounts.map(
                                                    (entry, i) => (
                                                        <Cell
                                                            key={i}
                                                            fill={
                                                                PIE[
                                                                    i %
                                                                        PIE.length
                                                                ]
                                                            }
                                                            aria-label={tr(
                                                                QUESTION_LEVEL_LABELS[
                                                                    Number(
                                                                        entry.label,
                                                                    )
                                                                ] ?? 'Unknown',
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
                                                    tr(
                                                        QUESTION_LEVEL_LABELS[
                                                            Number(name)
                                                        ] ?? 'Unknown',
                                                    ),
                                                ]}
                                            />
                                        </PieChart>
                                    </ResponsiveContainer>
                                </div>
                                <div className="flex flex-col gap-1.5 text-sm">
                                    {(() => {
                                        const total =
                                            analysis.byLevelCounts.reduce(
                                                (s, r) => s + r.questions,
                                                0,
                                            );
                                        return analysis.byLevelCounts.map(
                                            (entry, i) => {
                                                const pct =
                                                    total > 0
                                                        ? (
                                                              (entry.questions /
                                                                  total) *
                                                              100
                                                          ).toFixed(1)
                                                        : '0.0';
                                                return (
                                                    <div
                                                        key={i}
                                                        className="flex min-w-0 items-center gap-2"
                                                    >
                                                        <span
                                                            className="inline-block size-3 shrink-0 rounded-sm"
                                                            style={{
                                                                background:
                                                                    PIE[
                                                                        i %
                                                                            PIE.length
                                                                    ],
                                                            }}
                                                        />
                                                        <span className="text-muted-foreground">
                                                            {tr(
                                                                QUESTION_LEVEL_LABELS[
                                                                    Number(
                                                                        entry.label,
                                                                    )
                                                                ] ?? 'Unknown',
                                                            )}
                                                        </span>
                                                        <span className="font-medium text-foreground tabular-nums">
                                                            {pct}%
                                                        </span>
                                                    </div>
                                                );
                                            },
                                        );
                                    })()}
                                </div>
                            </>
                        )}
                    </Panel>
                    <Panel
                        title="Highest mastery grades"
                        icon={Trophy}
                        description={tr(
                            'Grades need at least {0} recorded answers to qualify.',
                            [analysis.minAnswers],
                        )}
                    >
                        {analysis.topGrades.length ? (
                            <ul className="flex flex-col gap-3">
                                {analysis.topGrades.map((grade) => (
                                    <li
                                        key={grade.label}
                                        className="flex flex-col gap-2 rounded-xl border border-border bg-muted/30 p-4"
                                    >
                                        <span className="font-semibold">
                                            {gradeLabel(grade.label)}
                                        </span>
                                        <MasteryRate
                                            rate={grade.success_rate}
                                        />
                                        <span className="text-xs text-muted-foreground">
                                            {tr('{0} answers · {1} players', [
                                                formatNumber(grade.answered),
                                                formatNumber(grade.players),
                                            ])}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <EmptyState
                                icon={Trophy}
                                title="Not enough data to rank grades"
                            />
                        )}
                    </Panel>
                </div>

                <MasteryBreakdown
                    title="Mastery by grade"
                    rows={analysis.byGrade}
                    label={gradeLabel}
                />

                <div className="grid gap-6 xl:grid-cols-2">
                    <MasteryBreakdown
                        title="Mastery by question level"
                        rows={analysis.byLevel}
                        label={(level) =>
                            tr(
                                QUESTION_LEVEL_LABELS[Number(level)] ??
                                    'Unknown',
                            )
                        }
                    />
                    <MasteryBreakdown
                        title="Mastery by game"
                        rows={analysis.byGame}
                        label={(game) => tr(gameLabel(game))}
                    />
                </div>

                <Panel
                    title="Questions needing attention"
                    description="Up to ten questions with the lowest correct-answer rate. Check sample size before drawing conclusions."
                    icon={BookMarked}
                >
                    {analysis.weakestQuestions.length === 0 ? (
                        <EmptyState
                            icon={BookMarked}
                            title="No recorded answers yet"
                        />
                    ) : (
                        <ResponsiveTable
                            rows={analysis.weakestQuestions}
                            rowKey={(row) => row.id}
                            columns={[
                                {
                                    key: 'prompt',
                                    header: tr('Question'),
                                    primary: true,
                                    cell: (row) => (
                                        <span className="block max-w-xl break-words whitespace-normal">
                                            {adminLocale().startsWith('id')
                                                ? row.prompt
                                                : row.prompt_en || row.prompt}
                                        </span>
                                    ),
                                },
                                {
                                    key: 'rate',
                                    header: tr('Mastery rate'),
                                    summary: true,
                                    cell: (row) => (
                                        <MasteryRate rate={row.success_rate} />
                                    ),
                                },
                                {
                                    key: 'answered',
                                    header: tr('Recorded answers'),
                                    align: 'right',
                                    cell: (row) => formatNumber(row.answered),
                                },
                                {
                                    key: 'correct',
                                    header: tr('Correct'),
                                    align: 'right',
                                    cell: (row) => formatNumber(row.correct),
                                },
                            ]}
                        />
                    )}
                </Panel>
            </div>
        </AdminLayout>
    );
}
