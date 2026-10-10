import { useAdminBreadcrumbs } from '@/components/admin/admin-breadcrumbs';
import {
    chartEvents,
    chartTooltipStyle,
    GameDot,
    UserAvatar,
} from '@/components/admin/dashboard-kit';
import {
    BAND_LABELS,
    EmptyState,
    formatDateTime,
    formatDuration,
    formatNumber,
    formatPercent,
    gameLabel,
    Panel,
    QUESTION_LEVEL_LABELS,
    rateTone,
    useSubjectLabel,
} from '@/components/admin/game-stats';
import { MatchCard, type MatchRow } from '@/components/admin/match-history';
import { ResponsiveTable } from '@/components/responsive-table';
import AdminLayout from '@/layouts/admin-layout';
import { tr } from '@/lib/admin-i18n';
import { cn } from '@/lib/utils';
import { Head, Link } from '@inertiajs/react';
import {
    BookOpenCheck,
    ChevronLeft,
    ChevronRight,
    CircleCheck,
    CircleX,
    Clock,
    Coins,
    Flame,
    Gauge,
    Layers,
    ListChecks,
    Swords,
    Target,
    TrendingUp,
} from 'lucide-react';
import { type ReactNode } from 'react';
import {
    Bar,
    BarChart,
    CartesianGrid,
    Legend,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';

interface QuestionRow {
    number: number;
    id: number | null;
    key: string | null;
    subject: string | null;
    type: string | null;
    level: number;
    band: number | null;
    prompt: { id: string | null; en: string | null };
    options: { id: string; en: string }[];
    answer: number | null;
    choice: number | null;
    correct: boolean;
}

interface Props {
    user: {
        id: number;
        name: string;
        avatar_url: string | null;
        nickname: string | null;
    };
    play: {
        id: number;
        game_key: string;
        game_name: string;
        mission: string | null;
        grade: number | null;
        age: number | null;
        school_name: string | null;
        points: number;
        correct: number | null;
        wrong: number | null;
        accuracy: number | null;
        duration_seconds: number | null;
        played_at: string;
        event_id: string;
    };
    summary: {
        answered: number | null;
        recorded_questions: number;
        subjects: number;
        seconds_per_question: number | null;
        points_per_minute: number | null;
        best_streak: number | null;
        passed: boolean | null;
    };
    subjects: {
        subject: string;
        answered: number;
        correct: number;
        wrong: number;
        accuracy: number | null;
    }[];
    levels: {
        level: number;
        answered: number;
        correct: number;
        accuracy: number | null;
    }[];
    questions: QuestionRow[];
    comparison: {
        plays: number;
        avg_points: number | null;
        best_points: number | null;
        avg_accuracy: number | null;
        avg_duration: number | null;
        rank: number;
        attempt: number;
    };
    match: MatchRow | null;
    sequence: {
        set_key: string;
        category: string;
        attempts: number;
        solved: number;
        wrong: number;
        total_ms: number;
    }[];
    neighbours: { previous: number | null; next: number | null };
}

/** Admin detail of one game a user played: questions, subjects, statistics. */
export default function UserPlayDetail(props: Props) {
    const { user, play, summary, comparison } = props;
    const subjectLabel = useSubjectLabel();
    const userUrl = `/admin/users/${user.id}`;
    const displayName = user.nickname || user.name;

    useAdminBreadcrumbs([
        { title: displayName, href: `${userUrl}?tab=games` },
        { title: tr('Game history'), href: `${userUrl}?tab=games` },
        {
            title: `${gameLabel(play.game_key)} · ${formatDateTime(play.played_at)}`,
        },
    ]);

    const subjectChart = props.subjects.map((row) => ({
        ...row,
        label: subjectLabel(row.subject) || tr('Unknown'),
    }));

    return (
        <>
            <Head
                title={tr('{0} · Game details', [gameLabel(play.game_key)])}
            />
            <div className="flex flex-col gap-6" data-testid="user-play-detail">
                <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm md:flex-row md:items-center md:justify-between">
                    <div className="flex min-w-0 items-center gap-4">
                        <UserAvatar
                            name={user.name}
                            src={user.avatar_url}
                            userId={user.id}
                            className="size-14 text-base"
                        />
                        <div className="flex min-w-0 flex-col gap-1">
                            <h1 className="flex flex-wrap items-center gap-2 font-display text-xl font-bold text-foreground sm:text-2xl">
                                <GameDot game={play.game_key} />
                                {summary.passed !== null && (
                                    <span
                                        className={cn(
                                            'rounded-full px-2 py-0.5 text-xs font-semibold',
                                            summary.passed
                                                ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                                                : 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
                                        )}
                                        data-testid="play-pass-badge"
                                    >
                                        {summary.passed
                                            ? tr('Passed')
                                            : tr('Below pass mark')}
                                    </span>
                                )}
                            </h1>
                            <p className="text-sm text-muted-foreground">
                                <Link
                                    href={userUrl}
                                    className="font-medium text-foreground hover:underline"
                                >
                                    {displayName}
                                </Link>{' '}
                                · {formatDateTime(play.played_at)}
                                {play.mission && (
                                    <>
                                        {' '}
                                        · {tr('Mission')}{' '}
                                        <span className="capitalize">
                                            {play.mission}
                                        </span>
                                    </>
                                )}
                                {play.grade !== null && (
                                    <> · {tr('Grade {0}', [play.grade])}</>
                                )}
                            </p>
                            {play.school_name && (
                                <p className="truncate text-xs text-muted-foreground">
                                    {play.school_name}
                                </p>
                            )}
                        </div>
                    </div>
                    <nav
                        className="flex shrink-0 gap-2"
                        aria-label={tr('Other games of this user')}
                    >
                        <NeighbourLink
                            href={
                                props.neighbours.previous
                                    ? `${userUrl}/plays/${props.neighbours.previous}`
                                    : null
                            }
                            label={tr('Previous game')}
                            testId="play-previous"
                        >
                            <ChevronLeft className="size-4" />
                            {tr('Previous')}
                        </NeighbourLink>
                        <NeighbourLink
                            href={
                                props.neighbours.next
                                    ? `${userUrl}/plays/${props.neighbours.next}`
                                    : null
                            }
                            label={tr('Next game')}
                            testId="play-next"
                        >
                            {tr('Next')}
                            <ChevronRight className="size-4" />
                        </NeighbourLink>
                    </nav>
                </section>

                <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                    <Metric
                        icon={Coins}
                        label={tr('Points')}
                        value={`+${formatNumber(play.points)}`}
                        hint={
                            comparison.avg_points !== null
                                ? tr('Average {0}', [comparison.avg_points])
                                : undefined
                        }
                        testId="play-points"
                    />
                    <Metric
                        icon={Target}
                        label={tr('Accuracy')}
                        value={
                            <span className={rateTone(play.accuracy)}>
                                {formatPercent(play.accuracy)}
                            </span>
                        }
                        hint={
                            comparison.avg_accuracy !== null
                                ? tr('Average {0}', [
                                      formatPercent(comparison.avg_accuracy),
                                  ])
                                : undefined
                        }
                        testId="play-accuracy"
                    />
                    <Metric
                        icon={ListChecks}
                        label={tr('Correct / wrong')}
                        value={
                            play.correct === null ? (
                                '—'
                            ) : (
                                <span className="inline-flex items-center gap-2">
                                    <span className="inline-flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400">
                                        <CircleCheck className="size-4" />
                                        {play.correct}
                                    </span>
                                    <span className="inline-flex items-center gap-0.5 text-red-600 dark:text-red-400">
                                        <CircleX className="size-4" />
                                        {play.wrong}
                                    </span>
                                </span>
                            )
                        }
                        hint={
                            summary.answered !== null
                                ? tr('{0} answered', [summary.answered])
                                : undefined
                        }
                        testId="play-correct"
                    />
                    <Metric
                        icon={Clock}
                        label={tr('Duration')}
                        value={formatDuration(play.duration_seconds)}
                        hint={
                            summary.seconds_per_question !== null
                                ? tr('{0}s per question', [
                                      summary.seconds_per_question,
                                  ])
                                : undefined
                        }
                    />
                    <Metric
                        icon={Flame}
                        label={tr('Streak')}
                        value={summary.best_streak ?? '—'}
                        hint={tr('Correct answers in a row')}
                    />
                    <Metric
                        icon={TrendingUp}
                        label={tr('Rank')}
                        value={`#${comparison.rank}`}
                        hint={tr('Attempt {0} of {1}', [
                            comparison.attempt,
                            comparison.plays,
                        ])}
                    />
                </div>

                <div className="grid gap-6 xl:grid-cols-3">
                    <Panel
                        title="Questions by subject"
                        description="Which subjects the questions of this game came from."
                        icon={BookOpenCheck}
                        className="xl:col-span-2"
                    >
                        {subjectChart.length === 0 ? (
                            <EmptyState
                                icon={BookOpenCheck}
                                title="No question details recorded"
                                description="This game does not record individual questions, or the play is older than question tracking."
                            />
                        ) : (
                            <div className="flex flex-col gap-5">
                                {summary.answered !== null &&
                                    summary.recorded_questions <
                                        summary.answered && (
                                        <p
                                            className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground"
                                            data-testid="play-recorded-note"
                                        >
                                            {tr(
                                                '{0} of {1} answers came from the question bank and are listed here; the rest were generated in the game.',
                                                [
                                                    summary.recorded_questions,
                                                    summary.answered,
                                                ],
                                            )}
                                        </p>
                                    )}
                                <div
                                    className="h-56 w-full"
                                    data-testid="play-subject-chart"
                                >
                                    <ResponsiveContainer
                                        width="100%"
                                        height="100%"
                                    >
                                        <BarChart
                                            {...chartEvents}
                                            data={subjectChart}
                                            layout="vertical"
                                            margin={{ left: 8, right: 16 }}
                                        >
                                            <CartesianGrid
                                                horizontal={false}
                                                stroke="var(--border)"
                                                strokeDasharray="3 3"
                                            />
                                            <XAxis
                                                type="number"
                                                allowDecimals={false}
                                                tick={{
                                                    fill: 'var(--foreground)',
                                                    fontSize: 12,
                                                }}
                                            />
                                            <YAxis
                                                type="category"
                                                dataKey="label"
                                                width={110}
                                                tick={{
                                                    fill: 'var(--foreground)',
                                                    fontSize: 12,
                                                }}
                                            />
                                            <Tooltip
                                                contentStyle={chartTooltipStyle}
                                                cursor={{
                                                    fill: 'var(--muted)',
                                                }}
                                            />
                                            <Legend
                                                iconType="circle"
                                                wrapperStyle={{ fontSize: 12 }}
                                            />
                                            <Bar
                                                dataKey="correct"
                                                name={tr('Correct')}
                                                stackId="a"
                                                fill="#10b981"
                                            />
                                            <Bar
                                                dataKey="wrong"
                                                name={tr('Wrong')}
                                                stackId="a"
                                                fill="#ef4444"
                                                radius={[0, 6, 6, 0]}
                                            />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                                <ResponsiveTable
                                    testId="play-subjects-table"
                                    rows={props.subjects}
                                    rowKey={(row) => row.subject}
                                    columns={[
                                        {
                                            key: 'subject',
                                            header: tr('Subject'),
                                            primary: true,
                                            cell: (row) => (
                                                <span className="font-medium text-foreground">
                                                    {subjectLabel(
                                                        row.subject,
                                                    ) || tr('Unknown')}
                                                </span>
                                            ),
                                        },
                                        {
                                            key: 'answered',
                                            header: tr('Questions'),
                                            align: 'right',
                                            cellClassName: 'tabular-nums',
                                            cell: (row) => row.answered,
                                        },
                                        {
                                            key: 'correct',
                                            header: tr('Correct'),
                                            align: 'right',
                                            cellClassName:
                                                'tabular-nums text-emerald-600 dark:text-emerald-400',
                                            cell: (row) => row.correct,
                                        },
                                        {
                                            key: 'wrong',
                                            header: tr('Wrong'),
                                            align: 'right',
                                            cellClassName: 'tabular-nums',
                                            cell: (row) => (
                                                <span
                                                    className={
                                                        row.wrong > 0
                                                            ? 'text-red-600 dark:text-red-400'
                                                            : 'text-muted-foreground'
                                                    }
                                                >
                                                    {row.wrong}
                                                </span>
                                            ),
                                        },
                                        {
                                            key: 'accuracy',
                                            header: tr('Accuracy'),
                                            align: 'right',
                                            summary: true,
                                            cellClassName:
                                                'font-medium tabular-nums',
                                            cell: (row) => (
                                                <span
                                                    className={rateTone(
                                                        row.accuracy,
                                                    )}
                                                >
                                                    {formatPercent(
                                                        row.accuracy,
                                                    )}
                                                </span>
                                            ),
                                        },
                                    ]}
                                />
                            </div>
                        )}
                    </Panel>

                    <div className="flex flex-col gap-6">
                        <Panel
                            title="Question levels"
                            description="Easy, medium and expert questions in this game."
                            icon={Layers}
                        >
                            {props.levels.length === 0 ? (
                                <p className="text-sm text-muted-foreground">
                                    {tr('No question details recorded')}
                                </p>
                            ) : (
                                <ul
                                    className="flex flex-col gap-3"
                                    data-testid="play-levels"
                                >
                                    {[1, 2, 3].map((value) => {
                                        const level = props.levels.find(
                                            (row) => row.level === value,
                                        ) ?? {
                                            level: value,
                                            answered: 0,
                                            correct: 0,
                                            accuracy: null,
                                        };
                                        return (
                                            <li
                                                key={level.level}
                                                className="flex flex-col gap-1.5"
                                            >
                                                <div className="flex items-center justify-between gap-2 text-sm">
                                                    <span className="font-medium text-foreground">
                                                        {tr(
                                                            QUESTION_LEVEL_LABELS[
                                                                level.level
                                                            ] ?? 'Easy',
                                                        )}
                                                    </span>
                                                    <span className="text-muted-foreground tabular-nums">
                                                        {level.correct}/
                                                        {level.answered} ·{' '}
                                                        <span
                                                            className={rateTone(
                                                                level.accuracy,
                                                            )}
                                                        >
                                                            {formatPercent(
                                                                level.accuracy,
                                                            )}
                                                        </span>
                                                    </span>
                                                </div>
                                                <div className="h-2 overflow-hidden rounded-full bg-muted">
                                                    <div
                                                        className="h-full rounded-full bg-emerald-500"
                                                        style={{
                                                            width: `${level.accuracy ?? 0}%`,
                                                        }}
                                                    />
                                                </div>
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                        </Panel>
                        <Panel title="Compared with other plays" icon={Gauge}>
                            <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2 text-sm">
                                <Row label={tr('Plays of this game')}>
                                    {formatNumber(comparison.plays)}
                                </Row>
                                <Row label={tr('Average points')}>
                                    {comparison.avg_points ?? '—'}
                                </Row>
                                <Row label={tr('Best points')}>
                                    {comparison.best_points ?? '—'}
                                </Row>
                                <Row label={tr('Average accuracy')}>
                                    {formatPercent(comparison.avg_accuracy)}
                                </Row>
                                <Row label={tr('Average duration')}>
                                    {formatDuration(comparison.avg_duration)}
                                </Row>
                                <Row label={tr('Points per minute')}>
                                    {summary.points_per_minute ?? '—'}
                                </Row>
                            </dl>
                        </Panel>
                    </div>
                </div>

                {props.match && (
                    <Panel title="Match" icon={Swords}>
                        <MatchCard match={props.match} />
                    </Panel>
                )}

                {props.sequence.length > 0 && (
                    <Panel title="Sequence sets" icon={Layers}>
                        <ResponsiveTable
                            rows={props.sequence}
                            rowKey={(row, index) => `${row.set_key}-${index}`}
                            columns={[
                                {
                                    key: 'set',
                                    header: tr('Set'),
                                    primary: true,
                                    cell: (row) => row.set_key,
                                },
                                {
                                    key: 'category',
                                    header: tr('Category'),
                                    cell: (row) => row.category,
                                },
                                {
                                    key: 'solved',
                                    header: tr('Solved'),
                                    align: 'right',
                                    cell: (row) =>
                                        `${row.solved}/${row.attempts}`,
                                },
                                {
                                    key: 'time',
                                    header: tr('Time'),
                                    align: 'right',
                                    cell: (row) =>
                                        formatDuration(
                                            Math.round(row.total_ms / 1000),
                                        ),
                                },
                            ]}
                        />
                    </Panel>
                )}

                <Panel
                    title="Questions in this game"
                    description="Every recorded question in the order it was answered."
                    icon={ListChecks}
                >
                    {props.questions.length === 0 ? (
                        <EmptyState
                            icon={ListChecks}
                            title="No question details recorded"
                            description="This game does not record individual questions, or the play is older than question tracking."
                        />
                    ) : (
                        <ol
                            className="flex flex-col divide-y divide-border"
                            data-testid="play-questions"
                        >
                            {props.questions.map((question) => (
                                <QuestionItem
                                    key={question.number}
                                    question={question}
                                    subject={
                                        subjectLabel(question.subject) ||
                                        tr('Unknown')
                                    }
                                />
                            ))}
                        </ol>
                    )}
                </Panel>
            </div>
        </>
    );
}

function NeighbourLink({
    href,
    label,
    testId,
    children,
}: {
    href: string | null;
    label: string;
    testId: string;
    children: ReactNode;
}) {
    const className =
        'inline-flex h-9 items-center gap-1 rounded-lg border border-border px-3 text-sm font-medium';
    return href ? (
        <Link
            href={href}
            aria-label={label}
            className={cn(
                className,
                'text-foreground hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
            )}
            data-testid={testId}
        >
            {children}
        </Link>
    ) : (
        <span
            className={cn(className, 'text-muted-foreground opacity-50')}
            aria-disabled="true"
        >
            {children}
        </span>
    );
}

function Metric({
    icon: Icon,
    label,
    value,
    hint,
    testId,
}: {
    icon: React.ElementType;
    label: string;
    value: ReactNode;
    hint?: string;
    testId?: string;
}) {
    return (
        <div
            className="flex min-w-0 flex-col gap-1.5 rounded-2xl border border-border bg-card p-4 shadow-sm"
            data-testid={testId}
        >
            <span className="flex items-start gap-1.5 text-xs leading-tight font-semibold tracking-wide text-muted-foreground uppercase">
                <Icon className="mt-px size-3.5 shrink-0" />
                <span className="min-w-0 break-words">{label}</span>
            </span>
            <span className="font-display text-2xl leading-none font-bold text-foreground tabular-nums">
                {value}
            </span>
            {hint && (
                <span className="text-xs leading-snug text-muted-foreground">
                    {hint}
                </span>
            )}
        </div>
    );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
    return (
        <>
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="text-right font-medium text-foreground tabular-nums">
                {children}
            </dd>
        </>
    );
}

function QuestionItem({
    question,
    subject,
}: {
    question: QuestionRow;
    subject: string;
}) {
    const prompt = question.prompt.id || question.prompt.en || '—';
    const answerText = (index: number | null): string | null => {
        if (index === null) {
            return null;
        }
        if (question.type === 'true_false') {
            return index === 1 ? tr('True') : tr('False');
        }
        const option = question.options[index];
        return option ? option.id || option.en : null;
    };
    const right = answerText(question.answer);
    const picked = answerText(question.choice);

    return (
        <li
            className="flex gap-3 py-3 first:pt-0 last:pb-0"
            data-testid="play-question"
            data-correct={question.correct}
        >
            <span
                className={cn(
                    'mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                    question.correct
                        ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                        : 'bg-red-500/15 text-red-700 dark:text-red-300',
                )}
                aria-label={question.correct ? tr('Correct') : tr('Wrong')}
            >
                {question.number}
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary">
                        {subject}
                    </span>
                    <span className="rounded-full border border-border px-2 py-0.5 text-muted-foreground">
                        {tr(QUESTION_LEVEL_LABELS[question.level] ?? 'Easy')}
                    </span>
                    {question.band !== null && BAND_LABELS[question.band] && (
                        <span className="rounded-full border border-border px-2 py-0.5 text-muted-foreground">
                            {tr(BAND_LABELS[question.band])}
                        </span>
                    )}
                    {question.correct ? (
                        <span className="inline-flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400">
                            <CircleCheck className="size-3.5" />
                            {tr('Correct')}
                        </span>
                    ) : (
                        <span className="inline-flex items-center gap-1 font-medium text-red-600 dark:text-red-400">
                            <CircleX className="size-3.5" />
                            {tr('Wrong')}
                        </span>
                    )}
                </div>
                <p className="text-sm font-medium break-words text-foreground">
                    {question.id ? (
                        <Link
                            href={`/admin/questions/${question.id}`}
                            className="hover:underline"
                        >
                            {prompt}
                        </Link>
                    ) : (
                        prompt
                    )}
                </p>
                {(right || picked) && (
                    <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        {right && (
                            <span>
                                {tr('Answer key')}:{' '}
                                <span className="font-medium text-foreground">
                                    {right}
                                </span>
                            </span>
                        )}
                        {picked && (
                            <span>
                                {tr('Player chose')}:{' '}
                                <span
                                    className={cn(
                                        'font-medium',
                                        question.correct
                                            ? 'text-emerald-600 dark:text-emerald-400'
                                            : 'text-red-600 dark:text-red-400',
                                    )}
                                >
                                    {picked}
                                </span>
                            </span>
                        )}
                    </p>
                )}
            </div>
        </li>
    );
}

UserPlayDetail.layout = (page: ReactNode) => (
    <AdminLayout title={tr('Game details')}>{page}</AdminLayout>
);
