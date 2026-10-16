import { UserAvatar } from '@/components/admin/dashboard-kit';
import {
    EmptyState,
    formatNumber,
    gameLabel,
    Panel,
} from '@/components/admin/game-stats';
import { phaseLabel } from '@/components/admin/match-history';
import {
    OptionContent,
    optionImage,
    type OptionMediaData,
    QuestionMedia,
    type QuestionMediaData,
} from '@/components/question-media';
import { useVisibleInterval } from '@/hooks/use-visible-interval';
import AdminLayout from '@/layouts/admin-layout';
import { adminLocale, tr } from '@/lib/admin-i18n';
import { Head, Link } from '@inertiajs/react';
import {
    ArrowLeft,
    Eye,
    HelpCircle,
    RefreshCw,
    Trophy,
    Users,
} from 'lucide-react';
import { type ReactNode, useState } from 'react';

type Snapshot = Record<string, unknown>;

interface Props {
    game: string;
    pin: string;
    room: Snapshot | null;
    stateUrl: string;
}

interface Standing {
    key: string;
    name: string;
    userId: number | null;
    score: number | null;
    detail: string | null;
    online: boolean | null;
    left: boolean;
}

interface LiveQuestion {
    text: string;
    media: QuestionMediaData | null;
    options: string[];
    optionMedia: OptionMediaData[] | null;
    correct: number | null;
}

const POLL_MS = 2000;

const asArray = (value: unknown): Snapshot[] =>
    Array.isArray(value)
        ? (value.filter(
              (item) => item && typeof item === 'object',
          ) as Snapshot[])
        : [];
const asNumber = (value: unknown): number | null =>
    typeof value === 'number' && Number.isFinite(value) ? value : null;
const asString = (value: unknown): string =>
    typeof value === 'string' ? value : '';

/** First numeric field a game uses as its score (points, gold, coins, laps…). */
function scoreOf(row: Snapshot): {
    score: number | null;
    detail: string | null;
} {
    for (const [field, label] of [
        ['score', null],
        ['points', null],
        ['gold', 'gold'],
        ['coins', 'coins'],
        ['served', 'served'],
        ['position', 'square'],
        ['lives', 'lives'],
        ['lap', 'lap'],
        ['correct', 'correct'],
    ] as const) {
        const value = asNumber(row[field]);
        if (value !== null) {
            return { score: value, detail: label };
        }
    }
    return { score: null, detail: null };
}

/** Players and their scores from whichever list the game sends. */
function standingsOf(room: Snapshot): Standing[] {
    const ranked =
        asArray(room.ranking).length > 0
            ? asArray(room.ranking)
            : asArray(room.leaderboard).length > 0
              ? asArray(room.leaderboard)
              : asArray(room.karts);
    const roster =
        asArray(room.players).length > 0
            ? asArray(room.players)
            : asArray(room.roster);
    const byId = new Map<number, Snapshot>();
    roster.forEach((row) => {
        const id = asNumber(row.user_id);
        if (id !== null) byId.set(id, row);
    });
    const rows = ranked.length > 0 ? ranked : roster;

    return rows.map((row, index) => {
        const id = asNumber(row.user_id);
        const base = id !== null ? byId.get(id) : undefined;
        const merged = { ...base, ...row };
        const { score, detail } = scoreOf(merged);
        return {
            key: `${id ?? 'seat'}-${index}`,
            name:
                asString(merged.name) ||
                asString(merged.username) ||
                tr('Player {0}', [index + 1]),
            userId: id,
            score,
            detail,
            online: typeof merged.online === 'boolean' ? merged.online : null,
            left: merged.left === true,
        };
    });
}

/** Current question from the game's state (question/quiz shapes). */
function questionOf(room: Snapshot): LiveQuestion | null {
    const quiz = (
        room.quiz && typeof room.quiz === 'object' ? room.quiz : null
    ) as Snapshot | null;
    const question = (quiz?.question ?? room.question) as Snapshot | undefined;
    if (!question || typeof question !== 'object') {
        return null;
    }
    const options = (quiz?.options ??
        question.options ??
        room.options) as unknown;
    const optionMedia = (quiz?.option_media ??
        question.option_media ??
        room.option_media) as OptionMediaData[] | null | undefined;
    const reveal = room.reveal as Snapshot | undefined;
    const correct =
        asNumber(quiz?.correct_index) ?? asNumber(reveal?.answer) ?? null;
    const text = asString(question.text) || asString(question.prompt);
    if (!text) {
        return null;
    }
    return {
        text,
        media: (question.media as QuestionMediaData | null) ?? null,
        options: Array.isArray(options)
            ? options.map((option) => String(option))
            : [],
        optionMedia: optionMedia ?? null,
        correct,
    };
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="min-w-0 rounded-xl border border-border bg-muted/30 px-3 py-2">
            <p className="truncate text-xs text-muted-foreground">{label}</p>
            <p className="truncate font-semibold text-foreground">{children}</p>
        </div>
    );
}

export default function LiveMatch({
    game,
    pin,
    room: initialRoom,
    stateUrl,
}: Props) {
    const [room, setRoom] = useState<Snapshot | null>(initialRoom);
    const [updatedAt, setUpdatedAt] = useState(() => Date.now());
    const [failed, setFailed] = useState(false);

    useVisibleInterval(
        async () => {
            try {
                const response = await fetch(stateUrl, {
                    headers: {
                        Accept: 'application/json',
                        'X-Requested-With': 'XMLHttpRequest',
                    },
                    credentials: 'same-origin',
                });
                if (!response.ok) {
                    setFailed(true);
                    return response.status === 401 || response.status === 403
                        ? false
                        : undefined;
                }
                const json = (await response.json()) as {
                    room: Snapshot | null;
                };
                setRoom(json.room);
                setFailed(false);
                setUpdatedAt(Date.now());
                return json.room === null ? false : undefined;
            } catch {
                setFailed(true);
            }
        },
        POLL_MS,
        room !== null,
    );

    const standings = room ? standingsOf(room) : [];
    const question = room ? questionOf(room) : null;
    const remaining = room
        ? (asNumber(room.remaining_ms) ??
          asNumber((room.quiz as Snapshot | undefined)?.remaining_ms))
        : null;
    const round = room
        ? (asNumber(room.round) ??
          asNumber(room.number) ??
          asNumber(room.asked))
        : null;
    const subject = room ? asString(room.subject) : '';

    return (
        <AdminLayout title="Watch live match">
            <Head title={tr('Watch live match')} />
            <div
                className="flex min-w-0 flex-col gap-6"
                data-testid="live-match"
            >
                <div className="flex flex-wrap items-end justify-between gap-4">
                    <div className="min-w-0">
                        <Link
                            href="/admin/matches"
                            className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                        >
                            <ArrowLeft className="size-4" aria-hidden="true" />
                            {tr('Match History')}
                        </Link>
                        <h1 className="flex flex-wrap items-center gap-2 text-2xl font-bold text-foreground">
                            {gameLabel(game)}
                            <span className="rounded-full bg-muted px-2.5 py-0.5 font-mono text-sm text-muted-foreground">
                                PIN {pin}
                            </span>
                        </h1>
                        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                            <Eye className="size-4" aria-hidden="true" />
                            {tr(
                                'Spectator mode: you only watch. Players do not see you and nothing you do affects the match.',
                            )}
                        </p>
                    </div>
                    {room && (
                        <span
                            className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300"
                            data-testid="live-match-status"
                        >
                            <span
                                className="size-2 animate-pulse rounded-full bg-emerald-500"
                                aria-hidden="true"
                            />
                            {failed
                                ? tr('Reconnecting…')
                                : tr('Live · updates every {0} s', [
                                      POLL_MS / 1000,
                                  ])}
                        </span>
                    )}
                </div>

                {!room ? (
                    <Panel title={tr('Match not available')} icon={Eye}>
                        <EmptyState
                            icon={Eye}
                            title={tr(
                                'This match has ended or is no longer available',
                            )}
                            description={tr(
                                'Go back to the match list to see the rooms that are live now.',
                            )}
                        />
                    </Panel>
                ) : (
                    <>
                        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                            <Fact label={tr('Phase')}>
                                {phaseLabel(room.phase)}
                            </Fact>
                            <Fact label={tr('Players')}>
                                {formatNumber(
                                    standings.filter((row) => !row.left).length,
                                )}
                            </Fact>
                            <Fact label={tr('Round')}>
                                {round !== null ? formatNumber(round) : '—'}
                            </Fact>
                            <Fact label={tr('Time left')}>
                                {remaining !== null
                                    ? `${Math.ceil(remaining / 1000)} s`
                                    : '—'}
                            </Fact>
                        </div>

                        <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
                            <Panel
                                title={tr('Current question')}
                                icon={HelpCircle}
                                className="xl:col-span-3"
                            >
                                {question ? (
                                    <div
                                        className="flex flex-col gap-4"
                                        data-testid="live-match-question"
                                    >
                                        {subject && subject !== 'mix' && (
                                            <p className="text-xs font-semibold text-muted-foreground uppercase">
                                                {subject}
                                            </p>
                                        )}
                                        <QuestionMedia
                                            media={question.media}
                                            size="sm"
                                        />
                                        <p className="text-lg font-semibold text-foreground">
                                            {question.text}
                                        </p>
                                        {question.options.length > 0 && (
                                            <ol className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                                {question.options.map(
                                                    (option, index) => (
                                                        <li
                                                            key={`${option}-${index}`}
                                                            className={
                                                                question.correct ===
                                                                index
                                                                    ? 'flex items-center gap-2 rounded-lg border-2 border-emerald-500 bg-emerald-500/10 p-2 text-sm text-foreground'
                                                                    : 'flex items-center gap-2 rounded-lg border border-border p-2 text-sm text-foreground'
                                                            }
                                                        >
                                                            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-muted text-xs font-bold">
                                                                {String.fromCharCode(
                                                                    65 + index,
                                                                )}
                                                            </span>
                                                            <OptionContent
                                                                text={option}
                                                                image={optionImage(
                                                                    question.optionMedia,
                                                                    index,
                                                                )}
                                                                size="sm"
                                                            />
                                                        </li>
                                                    ),
                                                )}
                                            </ol>
                                        )}
                                    </div>
                                ) : (
                                    <p className="py-6 text-center text-sm text-muted-foreground">
                                        {tr('No question on screen right now.')}
                                    </p>
                                )}
                            </Panel>

                            <Panel
                                title={tr('Standings')}
                                icon={Trophy}
                                className="xl:col-span-2"
                            >
                                {standings.length === 0 ? (
                                    <EmptyState
                                        icon={Users}
                                        title={tr('No players yet')}
                                    />
                                ) : (
                                    <ol
                                        className="flex flex-col gap-2"
                                        data-testid="live-match-standings"
                                    >
                                        {standings.map((row, index) => (
                                            <li
                                                key={row.key}
                                                className="flex min-w-0 items-center gap-3 rounded-lg border border-border p-2"
                                            >
                                                <span className="w-6 shrink-0 text-center text-sm font-bold text-muted-foreground tabular-nums">
                                                    {index + 1}
                                                </span>
                                                <UserAvatar
                                                    name={row.name}
                                                    userId={row.userId}
                                                    className="size-8"
                                                />
                                                <div className="min-w-0 flex-1">
                                                    {row.userId ? (
                                                        <Link
                                                            href={`/admin/users/${row.userId}`}
                                                            className="block truncate font-medium text-foreground hover:underline"
                                                        >
                                                            {row.name}
                                                        </Link>
                                                    ) : (
                                                        <p className="truncate font-medium text-foreground">
                                                            {row.name}
                                                        </p>
                                                    )}
                                                    <p className="text-xs text-muted-foreground">
                                                        {row.left
                                                            ? tr(
                                                                  'Left the room',
                                                              )
                                                            : row.online ===
                                                                false
                                                              ? tr('Offline')
                                                              : tr('Online')}
                                                    </p>
                                                </div>
                                                {row.score !== null && (
                                                    <span className="shrink-0 text-right">
                                                        <span className="block font-display text-lg font-bold text-foreground tabular-nums">
                                                            {formatNumber(
                                                                row.score,
                                                            )}
                                                        </span>
                                                        {row.detail && (
                                                            <span className="block text-[11px] text-muted-foreground">
                                                                {tr(row.detail)}
                                                            </span>
                                                        )}
                                                    </span>
                                                )}
                                            </li>
                                        ))}
                                    </ol>
                                )}
                            </Panel>
                        </div>
                        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <RefreshCw className="size-3" aria-hidden="true" />
                            {tr('Last update: {0}', [
                                new Date(updatedAt).toLocaleTimeString(
                                    adminLocale(),
                                ),
                            ])}
                        </p>
                    </>
                )}
            </div>
        </AdminLayout>
    );
}
