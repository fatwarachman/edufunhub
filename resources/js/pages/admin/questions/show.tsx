import {
    axisTick,
    chartTooltipStyle,
    GameDot,
    KpiCard,
    timeAgo,
    UserAvatar,
} from '@/components/admin/dashboard-kit';
import {
    BAND_LABELS,
    EmptyState,
    formatDateTime,
    formatNumber,
    formatPercent,
    gameLabel,
    Panel,
    rateTone,
    useSubjectLabel,
} from '@/components/admin/game-stats';
import { ResponsiveTable } from '@/components/responsive-table';
import AdminLayout from '@/layouts/admin-layout';
import { tr } from '@/lib/admin-i18n';
import { cn } from '@/lib/utils';
import { Head, Link } from '@inertiajs/react';
import {
    ArrowLeft,
    Brain,
    Cake,
    ChartBarBig,
    CircleAlert,
    CircleCheck,
    CircleX,
    Gamepad2,
    GraduationCap,
    History,
    Hourglass,
    Lightbulb,
    ListChecks,
    Pencil,
    Repeat,
    School,
    Sparkles,
    Target,
    TriangleAlert,
    UserPen,
    UsersRound,
} from 'lucide-react';
import { type ElementType, type ReactNode, useMemo, useState } from 'react';
import {
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    Pie,
    PieChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';

interface Bucket {
    label: string;
    answered: number;
    correct: number;
    wrong: number;
    players: number;
    success_rate: number | null;
    assigned?: boolean;
}

interface PlayerRow {
    user_id: number;
    name: string;
    account_name: string | null;
    grade: number | null;
    school_name: string | null;
    attempts: number;
    correct: number;
    wrong: number;
    first_correct: boolean;
    last_correct: boolean;
    last_answered_at: string | null;
}

interface ChoiceStat {
    index: number;
    text: string | null;
    text_en: string | null;
    is_correct: boolean;
    count: number;
    percent: number | null;
}

type UnderstandingLevel =
    | 'understood'
    | 'partial'
    | 'misconception'
    | 'not_understood'
    | 'insufficient';

interface Understanding {
    level: UnderstandingLevel;
    reason: string;
    recorded: number;
    correct_rate: number | null;
    top_wrong: { index: number; count: number; percent: number | null } | null;
    min_recorded: number;
}

interface Props {
    question: {
        id: number;
        key: string;
        type: 'choice' | 'true_false';
        band: number;
        subject: string;
        prompt_id: string;
        prompt_en: string | null;
        options: { id: string; en?: string }[] | null;
        answer: number;
        hint_id: string | null;
        hint_en: string | null;
        games: string[];
        is_active: boolean;
        source: string;
        created_at: string | null;
        updated_at: string | null;
        author: {
            id: number;
            name: string;
            email: string;
            roles: string[];
        } | null;
        editor: { id: number; name: string } | null;
    };
    stats: {
        summary: {
            answered: number;
            correct: number;
            wrong: number;
            success_rate: number | null;
            players: number;
            first_try_rate: number | null;
            mastered_players: number;
            first_answered_at: string | null;
            last_answered_at: string | null;
            difficulty: 'easy' | 'medium' | 'hard' | null;
        };
        byGame: Bucket[];
        byGrade: Bucket[];
        byAge: Bucket[];
        bySchool: Bucket[];
        daily: { date: string; correct: number; wrong: number }[];
        players: PlayerRow[];
        recent: {
            id: number;
            user_id: number;
            game_key: string;
            correct: boolean;
            answered_at: string | null;
        }[];
        siblings: {
            subject_rate: number | null;
            band_rate: number | null;
            rank: number | null;
            of: number;
        };
        choices: ChoiceStat[];
        choice_totals: { recorded: number; unrecorded: number };
        understanding: Understanding;
    };
    bands: { value: number; min: number; max: number }[];
}

const SOURCE_LABELS: Record<string, string> = {
    system: 'Built-in bank',
    admin: 'Admin panel',
    teacher: 'Teacher upload',
    import: 'Bulk import',
};

const DIFFICULTY: Record<string, { label: string; className: string }> = {
    easy: {
        label: 'Easy',
        className:
            'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
    },
    medium: {
        label: 'Medium',
        className:
            'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
    },
    hard: {
        label: 'Hard',
        className:
            'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300',
    },
};

const CORRECT_COLOR = 'var(--color-bubble-green)';
const WRONG_COLOR = 'var(--color-bubble-pink)';

type PlayerFilter = 'all' | 'correct' | 'wrong';

export default function QuestionShow({ question, stats }: Props) {
    const subjectLabel = useSubjectLabel();
    const { summary } = stats;
    const [filter, setFilter] = useState<PlayerFilter>('all');
    const options =
        question.type === 'true_false'
            ? [
                  { id: 'Benar', en: 'True' },
                  { id: 'Salah', en: 'False' },
              ]
            : (question.options ?? []);
    const correctIndex =
        question.type === 'true_false'
            ? question.answer === 1
                ? 0
                : 1
            : question.answer;
    const players = useMemo(
        () =>
            stats.players.filter((p) =>
                filter === 'all'
                    ? true
                    : filter === 'correct'
                      ? p.last_correct
                      : !p.last_correct,
            ),
        [stats.players, filter],
    );
    const correctPlayers = stats.players.filter((p) => p.last_correct).length;
    const difficulty = summary.difficulty
        ? DIFFICULTY[summary.difficulty]
        : null;

    return (
        <>
            <Head title={tr('Question {0}', [question.key])} />
            <div className="flex flex-col gap-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <Link
                        href={`/admin/questions?subject=${question.subject}`}
                        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
                    >
                        <ArrowLeft className="size-4" />
                        {tr('Question bank ·')} {subjectLabel(question.subject)}
                    </Link>
                    <Link
                        href={`/admin/questions/${question.id}/edit`}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                        <Pencil className="size-4" />
                        {tr('Edit question')}
                    </Link>
                </div>

                {/* Question card */}
                <section className="grid grid-cols-1 gap-6 rounded-3xl border border-border bg-card p-6 shadow-sm lg:grid-cols-[1fr_320px]">
                    <div className="flex min-w-0 flex-col gap-4">
                        <div className="flex flex-wrap items-center gap-1.5 text-xs">
                            <Chip className="bg-primary/10 text-primary">
                                {subjectLabel(question.subject)}
                            </Chip>
                            <Chip className="bg-secondary text-secondary-foreground">
                                {tr(BAND_LABELS[question.band])}
                            </Chip>
                            <Chip className="bg-secondary text-secondary-foreground">
                                {question.type === 'choice'
                                    ? tr('Multiple choice')
                                    : tr('True / false')}
                            </Chip>
                            {difficulty && (
                                <Chip className={difficulty.className}>
                                    {tr(difficulty.label)}
                                </Chip>
                            )}
                            {question.is_active ? (
                                <Chip className="gap-1 bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                                    <CircleCheck
                                        className="size-3"
                                        aria-hidden
                                    />
                                    {tr('Active')}
                                </Chip>
                            ) : (
                                <Chip className="bg-muted text-muted-foreground">
                                    {tr('Inactive')}
                                </Chip>
                            )}
                            <span className="font-mono text-muted-foreground">
                                {question.key}
                            </span>
                        </div>
                        <div className="flex flex-col gap-1">
                            <h2 className="font-display text-2xl leading-snug font-bold text-foreground">
                                {question.prompt_id}
                            </h2>
                            {question.prompt_en && (
                                <p className="text-sm text-muted-foreground italic">
                                    {question.prompt_en}
                                </p>
                            )}
                        </div>
                        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            {options.map((option, index) => {
                                const isCorrect = index === correctIndex;
                                return (
                                    <li
                                        key={index}
                                        className={cn(
                                            'flex items-start gap-3 rounded-xl border px-3 py-2.5 text-sm',
                                            isCorrect
                                                ? 'border-emerald-500/50 bg-emerald-500/10'
                                                : 'border-border',
                                        )}
                                    >
                                        <span
                                            className={cn(
                                                'flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                                                isCorrect
                                                    ? 'bg-emerald-500 text-white'
                                                    : 'bg-muted text-muted-foreground',
                                            )}
                                        >
                                            {isCorrect ? (
                                                <CircleCheck className="size-4" />
                                            ) : (
                                                String.fromCharCode(65 + index)
                                            )}
                                        </span>
                                        <span className="flex min-w-0 flex-col">
                                            <span className="font-medium text-foreground">
                                                {option.id}
                                            </span>
                                            {option.en &&
                                                option.en !== option.id && (
                                                    <span className="text-xs text-muted-foreground">
                                                        {option.en}
                                                    </span>
                                                )}
                                        </span>
                                    </li>
                                );
                            })}
                        </ul>
                        {(question.hint_id || question.hint_en) && (
                            <p className="flex items-start gap-2 rounded-xl bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-200">
                                <Lightbulb className="mt-0.5 size-4 shrink-0" />
                                <span>
                                    {question.hint_id}
                                    {question.hint_en && (
                                        <span className="block text-xs opacity-80">
                                            {question.hint_en}
                                        </span>
                                    )}
                                </span>
                            </p>
                        )}
                    </div>

                    <aside className="flex flex-col gap-4 rounded-2xl bg-muted/40 p-4">
                        <div className="flex flex-col gap-2">
                            <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                                {tr('Author')}
                            </span>
                            {question.author ? (
                                <Link
                                    href={`/admin/users/${question.author.id}`}
                                    className="flex items-center gap-3 rounded-xl hover:bg-background/60"
                                >
                                    <UserAvatar name={question.author.name} />
                                    <span className="flex min-w-0 flex-col">
                                        <span className="truncate text-sm font-medium text-foreground">
                                            {question.author.name}
                                        </span>
                                        <span className="truncate text-xs text-muted-foreground">
                                            {question.author.roles.join(', ') ||
                                                question.author.email}
                                        </span>
                                    </span>
                                </Link>
                            ) : (
                                <span className="flex items-center gap-3">
                                    <span className="flex size-9 items-center justify-center rounded-full bg-primary/15 text-primary">
                                        <Sparkles className="size-4" />
                                    </span>
                                    <span className="flex flex-col">
                                        <span className="text-sm font-medium text-foreground">
                                            {question.source === 'system'
                                                ? tr('EduFunHub')
                                                : tr('Unknown author')}
                                        </span>
                                        <span className="text-xs text-muted-foreground">
                                            {question.source === 'system'
                                                ? tr('Built-in question bank')
                                                : tr('Author was not recorded')}
                                        </span>
                                    </span>
                                </span>
                            )}
                        </div>
                        <dl className="flex flex-col gap-2 border-t border-border pt-3 text-sm">
                            <Meta
                                icon={UserPen}
                                label={tr('Source')}
                                value={
                                    SOURCE_LABELS[question.source] ??
                                    question.source
                                }
                            />
                            <Meta
                                icon={History}
                                label={tr('Created')}
                                value={formatDateTime(question.created_at)}
                            />
                            <Meta
                                icon={Pencil}
                                label={tr('Last edited')}
                                value={`${formatDateTime(question.updated_at)}${question.editor ? ` · ${question.editor.name}` : ''}`}
                            />
                        </dl>
                        <div className="flex flex-col gap-2 border-t border-border pt-3">
                            <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                                {tr('Used in')}
                            </span>
                            <div className="flex flex-wrap gap-1.5">
                                {question.games.map((game) => (
                                    <Link
                                        key={game}
                                        href={`/admin/games/${game}`}
                                        className="rounded-full border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground hover:border-primary"
                                    >
                                        <GameDot game={game} />
                                    </Link>
                                ))}
                            </div>
                        </div>
                    </aside>
                </section>

                {/* KPIs */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <KpiCard
                        label={tr('Correct answers')}
                        value={
                            <span className={rateTone(summary.success_rate)}>
                                {formatPercent(summary.success_rate)}
                            </span>
                        }
                        icon={Target}
                        accent="var(--color-bubble-green)"
                        footer={
                            <RatioBar
                                correct={summary.correct}
                                wrong={summary.wrong}
                            />
                        }
                    />
                    <KpiCard
                        label={tr('Times answered')}
                        value={formatNumber(summary.answered)}
                        icon={ListChecks}
                        accent="var(--color-bubble-blue)"
                        footer={
                            <span className="text-xs text-muted-foreground">
                                {summary.last_answered_at
                                    ? tr('Last answered {0}', [
                                          timeAgo(summary.last_answered_at),
                                      ])
                                    : tr('Not answered yet')}
                            </span>
                        }
                    />
                    <KpiCard
                        label={tr('Players')}
                        value={formatNumber(summary.players)}
                        icon={UsersRound}
                        accent="var(--color-bubble-orange)"
                        footer={
                            <span className="text-xs text-muted-foreground">
                                {formatNumber(summary.mastered_players)}{' '}
                                {tr('got it right on their latest try')}
                            </span>
                        }
                    />
                    <KpiCard
                        label={tr('Right on first try')}
                        value={
                            <span className={rateTone(summary.first_try_rate)}>
                                {formatPercent(summary.first_try_rate)}
                            </span>
                        }
                        icon={Repeat}
                        accent="var(--color-bubble-purple)"
                        footer={
                            <span className="text-xs text-muted-foreground">
                                {stats.siblings.rank
                                    ? tr('#{0} hardest of {1} in {2}', [
                                          stats.siblings.rank,
                                          stats.siblings.of,
                                          BAND_LABELS[question.band],
                                      ])
                                    : tr('Subject avg {0}', [
                                          formatPercent(
                                              stats.siblings.subject_rate,
                                          ),
                                      ])}
                            </span>
                        }
                    />
                </div>

                <ChoiceStats
                    type={question.type}
                    choices={stats.choices}
                    totals={stats.choice_totals}
                    understanding={stats.understanding}
                />

                {summary.answered === 0 ? (
                    <Panel title={tr('No answers yet')} icon={ListChecks}>
                        <EmptyState
                            icon={ListChecks}
                            title={tr('Nobody has answered this question yet')}
                            description={tr(
                                'Statistics appear after signed-in players see it in Flag Quest or Sky Quiz.',
                            )}
                        />
                    </Panel>
                ) : (
                    <>
                        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                            <Panel title={tr('Correct vs wrong')} icon={Target}>
                                <div className="relative h-52">
                                    <ResponsiveContainer
                                        width="100%"
                                        height="100%"
                                    >
                                        <PieChart>
                                            <Pie
                                                data={[
                                                    {
                                                        name: 'Correct',
                                                        value: summary.correct,
                                                    },
                                                    {
                                                        name: 'Wrong',
                                                        value: summary.wrong,
                                                    },
                                                ]}
                                                dataKey="value"
                                                innerRadius="62%"
                                                outerRadius="90%"
                                                paddingAngle={2}
                                                stroke="none"
                                            >
                                                <Cell fill={CORRECT_COLOR} />
                                                <Cell fill={WRONG_COLOR} />
                                            </Pie>
                                            <Tooltip
                                                contentStyle={chartTooltipStyle}
                                            />
                                        </PieChart>
                                    </ResponsiveContainer>
                                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                                        <span className="font-display text-3xl font-bold text-foreground">
                                            {formatPercent(
                                                summary.success_rate,
                                            )}
                                        </span>
                                        <span className="text-xs text-muted-foreground">
                                            {tr('correct')}
                                        </span>
                                    </div>
                                </div>
                                <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                                    <Legend
                                        color={CORRECT_COLOR}
                                        label={tr('Correct')}
                                        value={summary.correct}
                                    />
                                    <Legend
                                        color={WRONG_COLOR}
                                        label={tr('Wrong')}
                                        value={summary.wrong}
                                    />
                                </div>
                            </Panel>
                            <Panel
                                title={tr('Answers · last 30 days')}
                                icon={History}
                                className="xl:col-span-2"
                            >
                                <div className="h-64">
                                    <ResponsiveContainer
                                        width="100%"
                                        height="100%"
                                    >
                                        <BarChart
                                            data={stats.daily}
                                            margin={{
                                                left: -20,
                                                right: 8,
                                                top: 8,
                                            }}
                                        >
                                            <CartesianGrid
                                                strokeDasharray="3 3"
                                                stroke="var(--border)"
                                                vertical={false}
                                            />
                                            <XAxis
                                                dataKey="date"
                                                tick={axisTick}
                                                tickFormatter={(v: string) =>
                                                    new Date(
                                                        v,
                                                    ).toLocaleDateString(
                                                        undefined,
                                                        {
                                                            day: 'numeric',
                                                            month: 'short',
                                                        },
                                                    )
                                                }
                                                minTickGap={24}
                                                axisLine={false}
                                                tickLine={false}
                                            />
                                            <YAxis
                                                allowDecimals={false}
                                                domain={[
                                                    0,
                                                    (max: number) =>
                                                        Math.max(
                                                            4,
                                                            Math.ceil(
                                                                max * 1.2,
                                                            ),
                                                        ),
                                                ]}
                                                tick={axisTick}
                                                axisLine={false}
                                                tickLine={false}
                                            />
                                            <Tooltip
                                                contentStyle={chartTooltipStyle}
                                                cursor={{
                                                    fill: 'var(--muted)',
                                                }}
                                            />
                                            <Bar
                                                dataKey="correct"
                                                name="Correct"
                                                stackId="a"
                                                fill={CORRECT_COLOR}
                                            />
                                            <Bar
                                                dataKey="wrong"
                                                name="Wrong"
                                                stackId="a"
                                                fill={WRONG_COLOR}
                                                radius={[4, 4, 0, 0]}
                                            />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </Panel>
                        </div>

                        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                            <Panel
                                title={tr('By game')}
                                description={tr(
                                    'Where this question was answered',
                                )}
                                icon={Gamepad2}
                            >
                                <BucketBars
                                    rows={stats.byGame}
                                    labelFor={(label) => gameLabel(label)}
                                    showAssigned
                                />
                            </Panel>
                            <Panel
                                title={tr('By grade')}
                                description={tr('Player grade when answering')}
                                icon={GraduationCap}
                            >
                                <BucketBars
                                    rows={stats.byGrade}
                                    labelFor={(label) =>
                                        tr('Grade {0}', [label])
                                    }
                                />
                            </Panel>
                            <Panel title={tr('By age')} icon={Cake}>
                                <BucketBars
                                    rows={stats.byAge}
                                    labelFor={(label) =>
                                        tr('{0} years', [label])
                                    }
                                />
                            </Panel>
                            <Panel
                                title={tr('By school')}
                                description={tr('Top 10 schools by answers')}
                                icon={School}
                            >
                                <BucketBars
                                    rows={stats.bySchool}
                                    labelFor={(label) => label}
                                />
                            </Panel>
                        </div>

                        <section className="flex flex-col rounded-2xl border border-border bg-card shadow-sm">
                            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
                                <div className="flex flex-col">
                                    <h3 className="flex items-center gap-2 font-semibold text-foreground">
                                        <UsersRound className="size-4 text-muted-foreground" />
                                        {tr('Who answered')}
                                    </h3>
                                    <p className="text-xs text-muted-foreground">
                                        {tr(
                                            "Result is based on each player's latest attempt",
                                        )}
                                    </p>
                                </div>
                                <div
                                    className="inline-flex rounded-lg border border-border bg-background p-1"
                                    role="group"
                                    aria-label={tr('Filter players')}
                                >
                                    {(
                                        [
                                            {
                                                key: 'all',
                                                label: `All (${stats.players.length})`,
                                            },
                                            {
                                                key: 'correct',
                                                label: `Correct (${correctPlayers})`,
                                            },
                                            {
                                                key: 'wrong',
                                                label: `Wrong (${stats.players.length - correctPlayers})`,
                                            },
                                        ] as {
                                            key: PlayerFilter;
                                            label: string;
                                        }[]
                                    ).map((item) => (
                                        <button
                                            key={item.key}
                                            type="button"
                                            aria-pressed={filter === item.key}
                                            onClick={() => setFilter(item.key)}
                                            className={cn(
                                                'rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                                                filter === item.key
                                                    ? 'bg-muted text-foreground'
                                                    : 'text-muted-foreground hover:text-foreground',
                                            )}
                                        >
                                            {tr(item.label)}
                                        </button>
                                    ))}
                                </div>
                            </header>
                            <div className="min-w-0 p-5">
                                <ResponsiveTable
                                    testId="question-players-table"
                                    rows={players}
                                    rowKey={(player) => player.user_id}
                                    empty={
                                        <EmptyState
                                            icon={UsersRound}
                                            title={tr(
                                                'No players in this group',
                                            )}
                                        />
                                    }
                                    columns={[
                                        {
                                            key: 'player',
                                            header: tr('Player'),
                                            primary: true,
                                            cell: (player) => (
                                                <Link
                                                    href={`/admin/users/${player.user_id}`}
                                                    className="flex items-center gap-2 font-medium text-foreground hover:text-primary hover:underline"
                                                >
                                                    <UserAvatar
                                                        name={player.name}
                                                        className="size-7 text-[10px]"
                                                    />
                                                    <span className="flex flex-col">
                                                        {player.name}
                                                        {player.account_name &&
                                                            player.account_name !==
                                                                player.name && (
                                                                <span className="text-xs font-normal text-muted-foreground">
                                                                    {
                                                                        player.account_name
                                                                    }
                                                                </span>
                                                            )}
                                                    </span>
                                                </Link>
                                            ),
                                        },
                                        {
                                            key: 'grade',
                                            header: tr('Grade · school'),
                                            cellClassName:
                                                'max-w-56 truncate text-muted-foreground',
                                            cell: (player) =>
                                                [
                                                    player.grade
                                                        ? `Grade ${player.grade}`
                                                        : null,
                                                    player.school_name,
                                                ]
                                                    .filter(Boolean)
                                                    .join(' · ') || '—',
                                        },
                                        {
                                            key: 'latest',
                                            header: tr('Latest'),
                                            align: 'center',
                                            summary: true,
                                            cell: (player) => (
                                                <Outcome
                                                    correct={
                                                        player.last_correct
                                                    }
                                                />
                                            ),
                                        },
                                        {
                                            key: 'first',
                                            header: tr('First try'),
                                            align: 'center',
                                            cell: (player) => (
                                                <Outcome
                                                    correct={
                                                        player.first_correct
                                                    }
                                                    subtle
                                                />
                                            ),
                                        },
                                        {
                                            key: 'attempts',
                                            header: tr('Attempts'),
                                            align: 'right',
                                            cellClassName:
                                                'text-foreground tabular-nums',
                                            cell: (player) => (
                                                <span className="whitespace-nowrap">
                                                    {player.attempts}
                                                    <span className="ml-1 text-xs text-muted-foreground">
                                                        ({player.correct}✓{' '}
                                                        {player.wrong}✗)
                                                    </span>
                                                </span>
                                            ),
                                        },
                                        {
                                            key: 'last',
                                            header: tr('Last answered'),
                                            align: 'right',
                                            cellClassName:
                                                'whitespace-nowrap text-muted-foreground',
                                            cell: (player) =>
                                                timeAgo(
                                                    player.last_answered_at,
                                                ),
                                        },
                                    ]}
                                />
                            </div>
                        </section>
                    </>
                )}
            </div>
        </>
    );
}

function Chip({
    children,
    className,
}: {
    children: ReactNode;
    className: string;
}) {
    return (
        <span
            className={cn(
                'inline-flex items-center rounded-full px-2 py-0.5 font-medium',
                className,
            )}
        >
            {children}
        </span>
    );
}

function Meta({
    icon: Icon,
    label,
    value,
}: {
    icon: React.ElementType;
    label: string;
    value: ReactNode;
}) {
    return (
        <div className="flex items-start gap-2">
            <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <dt className="shrink-0 text-muted-foreground">{tr(label)}</dt>
            <dd className="ml-auto min-w-0 text-right font-medium break-words text-foreground">
                {value}
            </dd>
        </div>
    );
}

function Legend({
    color,
    label,
    value,
}: {
    color: string;
    label: string;
    value: number;
}) {
    return (
        <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2">
            <span
                className="size-2.5 rounded-full"
                style={{ background: color }}
            />
            <span className="text-muted-foreground">{tr(label)}</span>
            <span className="ml-auto font-semibold text-foreground tabular-nums">
                {formatNumber(value)}
            </span>
        </div>
    );
}

function RatioBar({ correct, wrong }: { correct: number; wrong: number }) {
    const total = correct + wrong;
    if (total === 0)
        return (
            <span className="text-xs text-muted-foreground">
                {tr('No answers yet')}
            </span>
        );

    return (
        <div className="flex w-full flex-col gap-1">
            <div className="flex h-2 overflow-hidden rounded-full bg-muted">
                <span
                    style={{
                        width: `${(correct / total) * 100}%`,
                        background: CORRECT_COLOR,
                    }}
                />
                <span
                    style={{
                        width: `${(wrong / total) * 100}%`,
                        background: WRONG_COLOR,
                    }}
                />
            </div>
            <span className="text-xs text-muted-foreground">
                {formatNumber(correct)} {tr('correct ·')} {formatNumber(wrong)}{' '}
                {tr('wrong')}
            </span>
        </div>
    );
}

function Outcome({
    correct,
    subtle = false,
}: {
    correct: boolean;
    subtle?: boolean;
}) {
    const Icon = correct ? CircleCheck : CircleX;

    return (
        <span
            className={cn(
                'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold',
                correct
                    ? 'text-emerald-700 dark:text-emerald-300'
                    : 'text-red-700 dark:text-red-300',
                !subtle && (correct ? 'bg-emerald-500/10' : 'bg-red-500/10'),
            )}
        >
            <Icon className="size-3.5" />
            {correct ? tr('Correct') : tr('Wrong')}
        </span>
    );
}

function BucketBars({
    rows,
    labelFor,
    showAssigned = false,
}: {
    rows: Bucket[];
    labelFor: (label: string) => string;
    showAssigned?: boolean;
}) {
    if (
        rows.length === 0 ||
        rows.every((row) => row.answered === 0 && !row.assigned)
    ) {
        return (
            <p className="py-6 text-center text-sm text-muted-foreground">
                {tr('No data yet')}
            </p>
        );
    }
    const max = Math.max(1, ...rows.map((row) => row.answered));

    return (
        <ul className="flex flex-col gap-3">
            {rows.map((row) => (
                <li key={row.label} className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between gap-2 text-sm">
                        <span className="flex min-w-0 items-center gap-2">
                            <span className="truncate font-medium text-foreground">
                                {labelFor(row.label)}
                            </span>
                            {showAssigned && row.assigned === false && (
                                <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                                    {tr('not assigned')}
                                </span>
                            )}
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                            {formatNumber(row.answered)} {tr('answers ·')}{' '}
                            {row.players} {tr('players ·')}{' '}
                            <span
                                className={cn(
                                    'font-semibold',
                                    rateTone(row.success_rate),
                                )}
                            >
                                {formatPercent(row.success_rate)}
                            </span>
                        </span>
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                        <div
                            className="flex h-full overflow-hidden rounded-full"
                            style={{
                                width: `${Math.max((row.answered / max) * 100, 2)}%`,
                            }}
                        >
                            <span
                                style={{
                                    width: `${row.answered ? (row.correct / row.answered) * 100 : 0}%`,
                                    background: CORRECT_COLOR,
                                }}
                            />
                            <span
                                style={{
                                    width: `${row.answered ? (row.wrong / row.answered) * 100 : 0}%`,
                                    background: WRONG_COLOR,
                                }}
                            />
                        </div>
                    </div>
                </li>
            ))}
        </ul>
    );
}

QuestionShow.layout = (page: ReactNode) => (
    <AdminLayout title={tr('Question Statistics')}>{page}</AdminLayout>
);

const UNDERSTANDING: Record<
    UnderstandingLevel,
    {
        icon: ElementType;
        title: string;
        explanation: string;
        tip: string;
        className: string;
        iconClassName: string;
    }
> = {
    understood: {
        icon: CircleCheck,
        title: 'Players understand this question',
        explanation:
            'Most players ({0}) pick the correct answer, so the concept is well understood.',
        tip: 'Keep it as a warm-up or raise the level for a bigger challenge.',
        className:
            'border-emerald-500/40 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10',
        iconClassName: 'text-emerald-600 dark:text-emerald-400',
    },
    partial: {
        icon: Brain,
        title: 'Players partly understand this question',
        explanation:
            'Only {0} answer correctly and the wrong answers are spread out, so the concept is not yet solid.',
        tip: 'Repeat the concept with a short example and let players try a similar question again.',
        className:
            'border-sky-500/40 bg-sky-50 dark:border-sky-500/30 dark:bg-sky-500/10',
        iconClassName: 'text-sky-600 dark:text-sky-400',
    },
    misconception: {
        icon: TriangleAlert,
        title: 'Possible misconception',
        explanation:
            'Many players ({0}) choose the same wrong answer {1}. They likely share the same wrong idea.',
        tip: 'Explain why option {0} is wrong and contrast it with the correct answer.',
        className:
            'border-amber-500/40 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10',
        iconClassName: 'text-amber-600 dark:text-amber-400',
    },
    not_understood: {
        icon: CircleAlert,
        title: 'Players do not understand this question yet',
        explanation:
            'Only {0} answer correctly. Most players are guessing or have not learned this material.',
        tip: 'Reteach the basic concept, then check whether the question wording is clear for this grade.',
        className:
            'border-red-500/40 bg-red-50 dark:border-red-500/30 dark:bg-red-500/10',
        iconClassName: 'text-red-600 dark:text-red-400',
    },
    insufficient: {
        icon: Hourglass,
        title: 'Not enough data yet',
        explanation:
            'Only {0} answers have a recorded choice. The analysis needs at least {1}.',
        tip: 'Use this question in more games to get a reliable picture.',
        className: 'border-border bg-muted/40',
        iconClassName: 'text-muted-foreground',
    },
};

function choiceLetter(type: Props['question']['type'], index: number): string {
    if (type === 'true_false') {
        return index === 1 ? tr('True') : tr('False');
    }
    return String.fromCharCode(65 + index);
}

function ChoiceStats({
    type,
    choices,
    totals,
    understanding,
}: {
    type: Props['question']['type'];
    choices: ChoiceStat[];
    totals: { recorded: number; unrecorded: number };
    understanding: Understanding;
}) {
    const rows =
        type === 'true_false'
            ? [...choices].sort((a, b) => b.index - a.index)
            : choices;
    const topWrong = understanding.top_wrong?.index ?? null;

    return (
        <div data-testid="question-choice-stats">
            <Panel
                title={tr('Answer distribution')}
                description={tr(
                    'How often each option was picked by players (EduFunHub analysis).',
                )}
                icon={ChartBarBig}
            >
                {totals.recorded === 0 ? (
                    <EmptyState
                        icon={ChartBarBig}
                        title={tr('No recorded choices yet')}
                        description={tr(
                            'Choices are recorded for answers given after this feature was enabled.',
                        )}
                    />
                ) : (
                    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_340px]">
                        <div className="flex min-w-0 flex-col gap-3">
                            <ul className="flex flex-col gap-3">
                                {rows.map((choice) => {
                                    const isTopWrong =
                                        !choice.is_correct &&
                                        choice.index === topWrong &&
                                        understanding.level !== 'insufficient';
                                    return (
                                        <li
                                            key={choice.index}
                                            data-choice={choice.index}
                                            data-correct={choice.is_correct}
                                            className="flex min-w-0 flex-col gap-1.5"
                                        >
                                            <div className="flex min-w-0 items-start justify-between gap-3 text-sm">
                                                <span className="flex min-w-0 items-start gap-2">
                                                    <span
                                                        className={cn(
                                                            'flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full px-1.5 text-xs font-bold',
                                                            choice.is_correct
                                                                ? 'bg-emerald-500 text-white'
                                                                : isTopWrong
                                                                  ? 'bg-amber-500 text-white'
                                                                  : 'bg-muted text-muted-foreground',
                                                        )}
                                                    >
                                                        {choice.is_correct ? (
                                                            <CircleCheck
                                                                className="size-4"
                                                                aria-label={tr(
                                                                    'Correct answer',
                                                                )}
                                                            />
                                                        ) : type ===
                                                          'true_false' ? (
                                                            choiceLetter(
                                                                type,
                                                                choice.index,
                                                            ).charAt(0)
                                                        ) : (
                                                            choiceLetter(
                                                                type,
                                                                choice.index,
                                                            )
                                                        )}
                                                    </span>
                                                    <span className="min-w-0 font-medium break-words text-foreground">
                                                        {type === 'true_false'
                                                            ? choiceLetter(
                                                                  type,
                                                                  choice.index,
                                                              )
                                                            : choice.text}
                                                        {choice.is_correct && (
                                                            <span className="ml-1.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300">
                                                                {tr(
                                                                    'Correct answer',
                                                                )}
                                                            </span>
                                                        )}
                                                    </span>
                                                </span>
                                                <span className="shrink-0 text-right text-xs text-muted-foreground tabular-nums">
                                                    <span className="font-semibold text-foreground">
                                                        {formatPercent(
                                                            choice.percent,
                                                        )}
                                                    </span>{' '}
                                                    ·{' '}
                                                    {formatNumber(choice.count)}
                                                </span>
                                            </div>
                                            <div
                                                className="h-2.5 w-full overflow-hidden rounded-full bg-muted"
                                                role="progressbar"
                                                aria-valuemin={0}
                                                aria-valuemax={100}
                                                aria-valuenow={
                                                    choice.percent ?? 0
                                                }
                                            >
                                                <div
                                                    className={cn(
                                                        'h-full rounded-full',
                                                        choice.is_correct
                                                            ? 'bg-emerald-500 dark:bg-emerald-400'
                                                            : isTopWrong
                                                              ? 'bg-amber-500 dark:bg-amber-400'
                                                              : 'bg-slate-400 dark:bg-slate-500',
                                                    )}
                                                    style={{
                                                        width: `${choice.percent ?? 0}%`,
                                                    }}
                                                />
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                            <p className="text-xs text-muted-foreground">
                                {tr(
                                    'Based on {0} answers with a recorded choice.',
                                    [formatNumber(totals.recorded)],
                                )}
                                {totals.unrecorded > 0 &&
                                    ` ${tr('{0} older answers were recorded before choices were tracked and are not included.', [formatNumber(totals.unrecorded)])}`}
                            </p>
                        </div>
                        <UnderstandingCard
                            type={type}
                            understanding={understanding}
                        />
                    </div>
                )}
            </Panel>
        </div>
    );
}

function UnderstandingCard({
    type,
    understanding,
}: {
    type: Props['question']['type'];
    understanding: Understanding;
}) {
    const meta = UNDERSTANDING[understanding.level];
    const wrongLabel = understanding.top_wrong
        ? choiceLetter(type, understanding.top_wrong.index)
        : '';
    const explanation =
        understanding.level === 'insufficient'
            ? tr(meta.explanation, [
                  understanding.recorded,
                  understanding.min_recorded,
              ])
            : understanding.level === 'misconception'
              ? tr(meta.explanation, [
                    formatPercent(understanding.top_wrong?.percent),
                    wrongLabel,
                ])
              : tr(meta.explanation, [
                    formatPercent(understanding.correct_rate),
                ]);
    const tip =
        understanding.level === 'misconception'
            ? tr(meta.tip, [wrongLabel])
            : tr(meta.tip);

    return (
        <aside
            data-testid="question-understanding"
            data-level={understanding.level}
            className={cn(
                'flex min-w-0 flex-col gap-3 rounded-2xl border p-4',
                meta.className,
            )}
        >
            <div className="flex items-start gap-3">
                <meta.icon
                    className={cn('mt-0.5 size-6 shrink-0', meta.iconClassName)}
                    aria-hidden
                />
                <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                        {tr('Understanding analysis')}
                    </span>
                    <h4 className="font-semibold text-foreground">
                        {tr(meta.title)}
                    </h4>
                </div>
            </div>
            <p className="text-sm text-foreground/90">{explanation}</p>
            <p className="flex items-start gap-2 rounded-xl bg-background/70 px-3 py-2 text-sm text-foreground dark:bg-background/40">
                <Lightbulb
                    className="mt-0.5 size-4 shrink-0 text-amber-500"
                    aria-hidden
                />
                <span>
                    <span className="font-semibold">
                        {tr('Teaching tip')}:{' '}
                    </span>
                    {tip}
                </span>
            </p>
            <p className="text-xs text-muted-foreground">
                {tr(
                    'EduFunHub analysis result based on recorded answer choices.',
                )}
            </p>
        </aside>
    );
}
