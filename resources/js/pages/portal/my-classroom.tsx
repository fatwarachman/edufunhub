import { AiPoints, STUDENT_SECTIONS } from '@/components/classroom/ai-points';
import {
    AccuracyBar,
    actionButtonClass,
    EmptyBox,
    MasteryBadge,
    StatusPill,
    useClassroomFormat,
    useGameCatalog,
    useLocalized,
} from '@/components/classroom/classroom-ui';
import type {
    MyClassroomDetail,
    MyClassroomQuestion,
} from '@/components/classroom/types';
import { useTranslations } from '@/hooks/use-translations';
import PlayerLayout from '@/layouts/player-layout';
import { useSubjectName } from '@/lib/subjects';
import { cn } from '@/lib/utils';
import { Link } from '@inertiajs/react';
import {
    ArrowLeft,
    BrainCircuit,
    CheckCircle2,
    CircleHelp,
    CircleX,
    DoorOpen,
    FileText,
    Gamepad2,
    Lock,
    Percent,
    Search,
    Star,
    Trophy,
    Users,
} from 'lucide-react';
import { createElement, useDeferredValue, useMemo, useState } from 'react';

interface Props {
    detail: MyClassroomDetail;
}

type Tab = 'summary' | 'games' | 'questions' | 'analysis';
type QuestionFilter = 'all' | 'wrong' | 'correct' | 'unanswered';

const TABS: { key: Tab; icon: typeof Star }[] = [
    { key: 'summary', icon: Star },
    { key: 'games', icon: Gamepad2 },
    { key: 'questions', icon: CircleHelp },
    { key: 'analysis', icon: BrainCircuit },
];

const CARD = 'auth-card flex min-w-0 flex-col gap-4 !p-4 sm:!p-5';

/** One joined classroom from the student's side: score, games, questions, analysis. */
export default function MyClassroom({ detail }: Props) {
    const { t } = useTranslations();
    const [tab, setTab] = useState<Tab>('summary');
    const { classroom } = detail;

    return (
        <PlayerLayout title={classroom.name}>
            <div className="flex flex-col items-start gap-3">
                <Link
                    href="/my-classrooms"
                    className={actionButtonClass}
                    data-testid="my-classroom-back"
                >
                    <ArrowLeft className="size-4" aria-hidden="true" />
                    {t('classroom.mine.back')}
                </Link>
                <div className="flex w-full flex-wrap items-end justify-between gap-3">
                    <div className="flex min-w-0 flex-col gap-1.5">
                        <h1 className="text-3xl font-bold tracking-tight break-words md:text-4xl">
                            {classroom.name}
                        </h1>
                        <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-muted-foreground">
                            <span className="flex items-center gap-1">
                                <Users className="size-4" aria-hidden />
                                {classroom.teacher_name}
                            </span>
                            <StatusPill status={classroom.status} />
                            <MasteryBadge mastery={detail.mastery} />
                        </div>
                    </div>
                    {classroom.status === 'active' && !detail.left && (
                        <Link
                            href={`/portal/classrooms/${classroom.pin}`}
                            className={actionButtonClass}
                            data-testid="my-classroom-open"
                        >
                            <DoorOpen className="size-4" aria-hidden="true" />
                            {t('classroom.mine.openRoom')}
                        </Link>
                    )}
                </div>
            </div>

            <div
                className="grid grid-cols-4 gap-1 rounded-2xl border-2 border-[#1f2a44] bg-white p-1 shadow-[3px_3px_0_#1f2a44]"
                role="tablist"
                aria-label={t('classroom.mine.tabs')}
            >
                {TABS.map(({ key, icon: Icon }) => (
                    <button
                        key={key}
                        type="button"
                        role="tab"
                        id={`my-classroom-tab-${key}`}
                        aria-selected={tab === key}
                        aria-controls={`my-classroom-panel-${key}`}
                        onClick={() => setTab(key)}
                        className={cn(
                            'flex min-h-11 min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1.5 text-xs font-bold sm:flex-row sm:gap-1.5 sm:text-sm',
                            tab === key
                                ? 'bg-[#1f2a44] text-white'
                                : 'hover:bg-[#FFFDE6]',
                        )}
                        data-testid={`my-classroom-tab-${key}`}
                    >
                        <Icon className="size-4 shrink-0" aria-hidden="true" />
                        <span className="max-w-full truncate">
                            {t(`classroom.mine.tab.${key}`)}
                        </span>
                    </button>
                ))}
            </div>

            <div
                role="tabpanel"
                id={`my-classroom-panel-${tab}`}
                aria-labelledby={`my-classroom-tab-${tab}`}
                className="flex flex-col gap-4"
            >
                {tab === 'summary' && <SummaryPanel detail={detail} />}
                {tab === 'games' && <GamesPanel detail={detail} />}
                {tab === 'questions' && <QuestionsPanel detail={detail} />}
                {tab === 'analysis' && <AnalysisPanel detail={detail} />}
            </div>
        </PlayerLayout>
    );
}

function SummaryPanel({ detail }: Props) {
    const { t } = useTranslations();
    const format = useClassroomFormat();
    const { totals } = detail;

    return (
        <>
            <section
                className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4"
                data-testid="my-classroom-kpis"
            >
                <Kpi
                    icon={Star}
                    accent="#ffd93d"
                    label={t('classroom.report.points')}
                    value={format.number(totals.points)}
                />
                <Kpi
                    icon={Trophy}
                    accent="#fff4cc"
                    label={t('classroom.report.rank')}
                    value={
                        totals.rank
                            ? `#${format.number(totals.rank)}/${format.number(totals.members)}`
                            : '–'
                    }
                />
                <Kpi
                    icon={Percent}
                    accent="#dff7ea"
                    label={t('classroom.report.accuracy')}
                    value={format.percent(totals.accuracy)}
                />
                <Kpi
                    icon={Gamepad2}
                    accent="#efeaff"
                    label={t('classroom.report.plays')}
                    value={format.number(totals.plays)}
                />
            </section>

            <section className={CARD}>
                <div className="grid grid-cols-3 gap-2 text-center">
                    <MiniStat
                        label={t('classroom.mine.answered')}
                        value={format.number(totals.answered)}
                    />
                    <MiniStat
                        label={t('classroom.show.reportCorrect')}
                        value={format.number(totals.correct)}
                        tone="good"
                    />
                    <MiniStat
                        label={t('classroom.mine.wrong')}
                        value={format.number(totals.wrong)}
                        tone="bad"
                    />
                </div>
                <div className="flex flex-col gap-1">
                    <p className="text-sm font-bold">
                        {t('classroom.report.accuracyVsClass')}
                    </p>
                    <AccuracyBar
                        value={totals.accuracy}
                        compare={detail.class_accuracy}
                        label={t('classroom.report.accuracyCompare')}
                    />
                    {detail.class_accuracy !== null && (
                        <p className="text-xs text-muted-foreground">
                            {t('classroom.report.classAvg')}:{' '}
                            {format.percent(detail.class_accuracy)}
                        </p>
                    )}
                </div>
            </section>

            {detail.classroom.description && (
                <section className={CARD}>
                    <p className="text-sm whitespace-pre-line">
                        {detail.classroom.description}
                    </p>
                </section>
            )}
        </>
    );
}

function GamesPanel({ detail }: Props) {
    const { t } = useTranslations();
    const format = useClassroomFormat();
    const catalog = useGameCatalog();
    const played = new Map(detail.games.map((g) => [g.game_key, g]));
    const keys = [
        ...detail.classroom.games,
        ...detail.games
            .map((g) => g.game_key)
            .filter((key) => !detail.classroom.games.includes(key)),
    ];

    return (
        <>
            <section className={CARD} data-testid="my-classroom-games">
                <h2 className="flex items-center gap-2 text-lg font-bold">
                    <Gamepad2 className="size-5" aria-hidden="true" />
                    {t('classroom.report.perGame')}
                </h2>
                {keys.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                        {t('classroom.mine.noGames')}
                    </p>
                ) : (
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {keys.map((key) => {
                            const g = played.get(key);
                            const maxPlays =
                                g?.max_plays ??
                                detail.play_limits?.[key] ??
                                null;
                            return (
                                <div
                                    key={key}
                                    className="flex flex-col gap-2 rounded-xl border-2 border-[#1f2a44] bg-white p-3"
                                    data-testid={`my-classroom-game-${key}`}
                                >
                                    <div className="flex items-center gap-2">
                                        <span
                                            className="grid size-9 shrink-0 place-items-center rounded-lg border-2 border-[#1f2a44]"
                                            style={{
                                                background: catalog.accent(key),
                                            }}
                                        >
                                            {createElement(catalog.icon(key), {
                                                className: 'size-4 text-white',
                                                'aria-hidden': true,
                                            })}
                                        </span>
                                        <p className="min-w-0 flex-1 text-sm leading-tight font-bold break-words">
                                            {catalog.title(key)}
                                        </p>
                                        {maxPlays !== null && (
                                            <span
                                                className={`shrink-0 rounded-full border-2 border-[#1f2a44] px-2 py-0.5 text-[11px] font-bold tabular-nums ${(g?.plays ?? 0) >= maxPlays ? 'bg-[#ffe1e6]' : 'bg-[#fff0cf]'}`}
                                                data-testid={`my-classroom-play-limit-${key}`}
                                            >
                                                {t(
                                                    'classroom.mine.playsOfMax',
                                                    {
                                                        plays: g?.plays ?? 0,
                                                        max: maxPlays,
                                                    },
                                                )}
                                            </span>
                                        )}
                                    </div>
                                    {g ? (
                                        <>
                                            <div className="grid grid-cols-3 gap-1 text-center">
                                                <MiniStat
                                                    label={t(
                                                        'classroom.report.plays',
                                                    )}
                                                    value={format.number(
                                                        g.plays,
                                                    )}
                                                />
                                                <MiniStat
                                                    label={t(
                                                        'classroom.report.accuracy',
                                                    )}
                                                    value={format.percent(
                                                        g.accuracy,
                                                    )}
                                                />
                                                <MiniStat
                                                    label={t(
                                                        'classroom.report.points',
                                                    )}
                                                    value={format.number(
                                                        g.points,
                                                    )}
                                                />
                                            </div>
                                            <AccuracyBar
                                                value={g.accuracy ?? null}
                                            />
                                        </>
                                    ) : (
                                        <p className="text-xs font-semibold text-muted-foreground">
                                            {t('classroom.mine.notPlayed')}
                                        </p>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </section>

            <section className={CARD} data-testid="my-classroom-history">
                <h2 className="flex items-center gap-2 text-lg font-bold">
                    <FileText className="size-5" aria-hidden="true" />
                    {t('classroom.mine.history')}
                </h2>
                {detail.recent_plays.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                        {t('classroom.mine.noHistory')}
                    </p>
                ) : (
                    <ul className="flex flex-col divide-y-2 divide-[#1f2a44]/10">
                        {detail.recent_plays.map((play) => (
                            <li
                                key={play.id}
                                className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm"
                            >
                                <span className="min-w-0 flex-1 font-bold break-words">
                                    {catalog.title(play.game_key)}
                                </span>
                                <span className="flex items-center gap-1 text-xs font-bold text-[#0f7a55]">
                                    <CheckCircle2 className="size-3.5" />
                                    {format.number(play.correct)}
                                </span>
                                <span className="flex items-center gap-1 text-xs font-bold text-[#b23a52]">
                                    <CircleX className="size-3.5" />
                                    {format.number(play.wrong)}
                                </span>
                                <span className="rounded-full border-2 border-[#1f2a44] bg-[#ffd93d] px-2 py-0.5 text-xs font-bold tabular-nums">
                                    +{format.number(play.points)}
                                </span>
                                <span className="w-full text-xs text-muted-foreground sm:w-auto">
                                    {format.dateTime(play.played_at)}
                                </span>
                            </li>
                        ))}
                    </ul>
                )}
            </section>
        </>
    );
}

function QuestionsPanel({ detail }: Props) {
    const { t } = useTranslations();
    const format = useClassroomFormat();
    const [filter, setFilter] = useState<QuestionFilter>('all');
    const [search, setSearch] = useState('');
    const query = useDeferredValue(search.trim().toLowerCase());
    const localized = useLocalized();
    const { questions } = detail;

    const visible = useMemo(
        () =>
            questions.items.filter((q) => {
                const state =
                    q.mine.answered === 0
                        ? 'unanswered'
                        : q.mine.wrong > 0
                          ? 'wrong'
                          : 'correct';
                return (
                    (filter === 'all' || filter === state) &&
                    (query === '' ||
                        localized.prompt(q).toLowerCase().includes(query))
                );
            }),
        [questions.items, filter, query, localized],
    );

    const filters: QuestionFilter[] = detail.answers_revealed
        ? ['all', 'wrong', 'correct', 'unanswered']
        : ['all', 'wrong', 'correct'];

    return (
        <section className={CARD} data-testid="my-classroom-questions">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 text-lg font-bold">
                    <CircleHelp className="size-5" aria-hidden="true" />
                    {t('classroom.mine.questionsTitle')}
                </h2>
                <span className="text-xs font-bold text-muted-foreground">
                    {t('classroom.mine.questionsCount', {
                        answered: format.number(questions.answered),
                        total: format.number(questions.total),
                    })}
                </span>
            </div>

            <p
                className={cn(
                    'flex items-start gap-2 rounded-xl border-2 p-3 text-xs font-semibold',
                    detail.answers_revealed
                        ? 'border-[#0f7a55]/40 bg-[#dff7ea]'
                        : 'border-[#1f2a44]/20 bg-[#FFFDE6]',
                )}
                data-testid="my-classroom-answers-note"
            >
                {detail.answers_revealed ? (
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
                ) : (
                    <Lock className="mt-0.5 size-4 shrink-0" />
                )}
                {detail.answers_revealed
                    ? t('classroom.mine.answersRevealed')
                    : t('classroom.mine.answersLocked', {
                          count: questions.hidden,
                      })}
            </p>

            {questions.items.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                    {t('classroom.mine.noQuestions')}
                </p>
            ) : (
                <>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <label className="relative min-w-0 flex-1">
                            <span className="sr-only">
                                {t('classroom.mine.searchQuestion')}
                            </span>
                            <Search
                                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                                aria-hidden="true"
                            />
                            <input
                                type="search"
                                value={search}
                                onChange={(event) =>
                                    setSearch(event.target.value)
                                }
                                placeholder={t('classroom.mine.searchQuestion')}
                                className="h-11 w-full rounded-xl border-2 border-[#1f2a44] bg-white pr-3 pl-9 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-[#1f2a44]/40"
                                data-testid="my-classroom-question-search"
                            />
                        </label>
                        <div
                            className="flex flex-wrap gap-1.5"
                            role="group"
                            aria-label={t('classroom.mine.filterQuestions')}
                        >
                            {filters.map((key) => (
                                <button
                                    key={key}
                                    type="button"
                                    onClick={() => setFilter(key)}
                                    aria-pressed={filter === key}
                                    className={cn(
                                        'h-11 rounded-xl border-2 border-[#1f2a44] px-3 text-sm font-bold',
                                        filter === key
                                            ? 'bg-[#1f2a44] text-white'
                                            : 'bg-white hover:bg-[#FFFDE6]',
                                    )}
                                    data-testid={`my-classroom-qfilter-${key}`}
                                >
                                    {t(`classroom.mine.qfilter.${key}`)}
                                </button>
                            ))}
                        </div>
                    </div>
                    {visible.length === 0 ? (
                        <p className="rounded-xl border-2 border-dashed border-[#1f2a44]/30 p-6 text-center text-sm font-semibold text-muted-foreground">
                            {t('classroom.mine.noMatch')}
                        </p>
                    ) : (
                        <ol className="flex flex-col gap-3">
                            {visible.map((q) => (
                                <QuestionCard
                                    key={q.id}
                                    question={q}
                                    revealed={detail.answers_revealed}
                                />
                            ))}
                        </ol>
                    )}
                </>
            )}
        </section>
    );
}

function QuestionCard({
    question,
    revealed,
}: {
    question: MyClassroomQuestion;
    revealed: boolean;
}) {
    const { t, i18n } = useTranslations();
    const english = i18n.language?.startsWith('en');
    const localized = useLocalized();
    const subjectName = useSubjectName();
    const { mine } = question;
    const options =
        question.type === 'true_false'
            ? [
                  { id: t('teacher.form.false'), en: null },
                  { id: t('teacher.form.true'), en: null },
              ]
            : question.options;
    const hint = english
        ? question.hint_en || question.hint_id
        : question.hint_id;
    const status =
        mine.answered === 0
            ? 'unanswered'
            : mine.wrong > 0
              ? 'wrong'
              : 'correct';

    return (
        <li
            className="flex flex-col gap-3 rounded-xl border-2 border-[#1f2a44] bg-white p-3 sm:p-4"
            data-testid={`my-classroom-question-${question.id}`}
        >
            <div className="flex flex-wrap items-center gap-1.5 text-xs font-bold">
                <span className="rounded-full border-2 border-[#1f2a44] bg-[#dbeafe] px-2 py-0.5">
                    {subjectName(question.subject)}
                </span>
                {question.topic && (
                    <span className="rounded-full border-2 border-[#1f2a44]/30 px-2 py-0.5">
                        {localized.topic(question.topic)}
                    </span>
                )}
                <span
                    className={cn(
                        'ml-auto rounded-full border-2 px-2 py-0.5',
                        status === 'correct' &&
                            'border-[#0f7a55] bg-[#dff7ea] text-[#0f7a55]',
                        status === 'wrong' &&
                            'border-[#b23a52] bg-[#ffe1e6] text-[#b23a52]',
                        status === 'unanswered' &&
                            'border-[#1f2a44]/30 text-muted-foreground',
                    )}
                >
                    {t(`classroom.mine.qstatus.${status}`, {
                        correct: mine.correct,
                        wrong: mine.wrong,
                    })}
                </span>
            </div>
            <p className="text-sm leading-relaxed font-semibold break-words">
                {localized.prompt(question)}
            </p>
            {options.length > 0 && (
                <ul className="grid gap-1.5 sm:grid-cols-2">
                    {options.map((option, index) => {
                        const isAnswer = revealed && question.answer === index;
                        const isMine = mine.last_choice === index;
                        const text =
                            english && option.en ? option.en : option.id;
                        return (
                            <li
                                key={index}
                                className={cn(
                                    'flex items-start gap-2 rounded-lg border-2 px-2.5 py-2 text-sm break-words',
                                    isAnswer
                                        ? 'border-[#0f7a55] bg-[#dff7ea]'
                                        : isMine && mine.last_correct === false
                                          ? 'border-[#b23a52] bg-[#ffe1e6]'
                                          : 'border-[#1f2a44]/15 bg-[#FFFDF7]',
                                )}
                            >
                                <span className="font-bold">
                                    {String.fromCharCode(65 + index)}.
                                </span>
                                <span className="min-w-0 flex-1">{text}</span>
                                {isAnswer && (
                                    <CheckCircle2
                                        className="size-4 shrink-0 text-[#0f7a55]"
                                        aria-label={t(
                                            'classroom.report.correctAnswer',
                                        )}
                                    />
                                )}
                                {isMine && (
                                    <span className="shrink-0 rounded-full bg-[#1f2a44] px-2 py-0.5 text-[11px] leading-none font-bold text-white">
                                        {t('classroom.mine.yourChoice')}
                                    </span>
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}
            {revealed && hint && (
                <p className="rounded-lg border-2 border-dashed border-[#1f2a44]/30 bg-[#FFFDE6] p-2.5 text-xs leading-relaxed font-semibold">
                    {hint}
                </p>
            )}
        </li>
    );
}

function AnalysisPanel({ detail }: Props) {
    const { t } = useTranslations();
    const format = useClassroomFormat();
    const subjectName = useSubjectName();
    const localized = useLocalized();
    const strongest = [...detail.subjects]
        .filter((s) => s.accuracy !== null && s.answered >= 3)
        .sort((a, b) => (b.accuracy ?? 0) - (a.accuracy ?? 0));
    const weakTopics = detail.topics
        .filter((topic) => topic.accuracy !== null && topic.accuracy < 70)
        .slice(0, 5);

    if (detail.totals.answered === 0) {
        return (
            <EmptyBox
                icon={BrainCircuit}
                title={t('classroom.mine.noDataTitle')}
                hint={t('classroom.mine.noDataHint')}
            />
        );
    }

    return (
        <>
            <section className={CARD} data-testid="my-classroom-self">
                <h2 className="flex items-center gap-2 text-lg font-bold">
                    <BrainCircuit className="size-5" aria-hidden="true" />
                    {t('classroom.mine.selfTitle')}
                </h2>
                <ul className="flex flex-col gap-2 text-sm">
                    <li className="flex items-start gap-2">
                        <MasteryBadge mastery={detail.mastery} />
                        <span className="pt-0.5">
                            {t(`classroom.mine.self.${detail.mastery}`, {
                                accuracy: format.percent(
                                    detail.totals.accuracy,
                                ),
                            })}
                        </span>
                    </li>
                    {detail.class_accuracy !== null &&
                        detail.totals.accuracy !== null && (
                            <li>
                                {t(
                                    Math.abs(
                                        detail.totals.accuracy -
                                            detail.class_accuracy,
                                    ) < 0.5
                                        ? 'classroom.mine.self.sameAsClass'
                                        : detail.totals.accuracy >
                                            detail.class_accuracy
                                          ? 'classroom.mine.self.aboveClass'
                                          : 'classroom.mine.self.belowClass',
                                    {
                                        diff: format.percent(
                                            Math.abs(
                                                detail.totals.accuracy -
                                                    detail.class_accuracy,
                                            ),
                                        ),
                                    },
                                )}
                            </li>
                        )}
                    {strongest[0] && (
                        <li>
                            {t('classroom.mine.self.strongest', {
                                subject: subjectName(strongest[0].key),
                                accuracy: format.percent(strongest[0].accuracy),
                            })}
                        </li>
                    )}
                    {strongest.length > 1 && (
                        <li>
                            {t('classroom.mine.self.weakest', {
                                subject: subjectName(
                                    strongest[strongest.length - 1].key,
                                ),
                                accuracy: format.percent(
                                    strongest[strongest.length - 1].accuracy,
                                ),
                            })}
                        </li>
                    )}
                </ul>
            </section>

            {detail.subjects.length > 0 && (
                <section className={CARD} data-testid="my-classroom-subjects">
                    <h2 className="text-lg font-bold">
                        {t('classroom.report.perSubject')}
                    </h2>
                    <div className="flex flex-col gap-3">
                        {detail.subjects.map((s) => (
                            <div key={s.key} className="flex flex-col gap-1">
                                <div className="flex items-baseline justify-between gap-2 text-sm">
                                    <span className="font-bold">
                                        {subjectName(s.key)}
                                    </span>
                                    <span className="text-xs text-muted-foreground tabular-nums">
                                        {format.percent(s.accuracy)}
                                    </span>
                                </div>
                                <AccuracyBar
                                    value={s.accuracy ?? null}
                                    compare={s.class_accuracy ?? null}
                                />
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {weakTopics.length > 0 && (
                <section className={CARD} data-testid="my-classroom-topics">
                    <h2 className="text-lg font-bold">
                        {t('classroom.mine.focusTopics')}
                    </h2>
                    <div className="flex flex-col gap-3">
                        {weakTopics.map((topic) => (
                            <div
                                key={topic.name_id}
                                className="flex flex-col gap-1"
                            >
                                <div className="flex items-baseline justify-between gap-2 text-sm">
                                    <span className="font-bold">
                                        {localized.topic(topic)}
                                    </span>
                                    <span className="text-xs text-muted-foreground tabular-nums">
                                        {format.percent(topic.accuracy)}
                                    </span>
                                </div>
                                <AccuracyBar value={topic.accuracy ?? null} />
                            </div>
                        ))}
                    </div>
                </section>
            )}

            <section className={CARD} data-testid="my-classroom-ai">
                <h2 className="flex items-center gap-2 text-lg font-bold">
                    <Trophy className="size-5" aria-hidden="true" />
                    {t('classroom.report.aiFeedback')}
                </h2>
                {detail.ai_feedback ? (
                    <AiPoints
                        sections={detail.ai_feedback}
                        order={STUDENT_SECTIONS}
                        testId="my-classroom-ai-points"
                    />
                ) : (
                    <p className="text-sm text-muted-foreground">
                        {t('classroom.mine.aiPending')}
                    </p>
                )}
                {detail.teacher_note && (
                    <div className="rounded-xl border-2 border-[#1f2a44] bg-[#FFFDE6] p-3">
                        <p className="text-xs font-bold">
                            {t('classroom.report.teacherNote')}
                        </p>
                        <p className="text-sm whitespace-pre-line">
                            {detail.teacher_note}
                        </p>
                    </div>
                )}
                {detail.report_url && (
                    <Link
                        href={detail.report_url}
                        className={cn(actionButtonClass, 'self-start')}
                        data-testid="my-classroom-report-link"
                    >
                        <FileText className="size-4" aria-hidden="true" />
                        {t('classroom.mine.fullReport')}
                    </Link>
                )}
            </section>
        </>
    );
}

function MiniStat({
    label,
    value,
    tone,
}: {
    label: string;
    value: string;
    tone?: 'good' | 'bad';
}) {
    return (
        <div className="flex min-w-0 flex-col rounded-xl border-2 border-[#1f2a44]/15 bg-[#FFFDF7] px-1 py-1.5">
            <span
                className={cn(
                    'truncate text-base font-bold tabular-nums',
                    tone === 'good' && 'text-[#0f7a55]',
                    tone === 'bad' && 'text-[#b23a52]',
                )}
            >
                {value}
            </span>
            <span className="truncate text-[10px] font-semibold text-[#1f2a44]/70 min-[360px]:text-xs">
                {label}
            </span>
        </div>
    );
}

function Kpi({
    icon: Icon,
    label,
    value,
    accent,
}: {
    icon: typeof Star;
    label: string;
    value: string;
    accent: string;
}) {
    return (
        <div className="flex min-w-0 items-center gap-2 rounded-2xl border-2 border-[#1f2a44] bg-white p-2.5 shadow-[3px_3px_0_#1f2a44] sm:gap-3 sm:p-4">
            <span
                className="grid size-9 shrink-0 place-items-center rounded-xl border-2 border-[#1f2a44] sm:size-11"
                style={{ background: accent }}
            >
                <Icon className="size-4 sm:size-5" aria-hidden="true" />
            </span>
            <div className="flex min-w-0 flex-col">
                <p className="truncate text-xl leading-tight font-bold tabular-nums sm:text-2xl">
                    {value}
                </p>
                <p className="truncate text-xs font-bold text-muted-foreground">
                    {label}
                </p>
            </div>
        </div>
    );
}
