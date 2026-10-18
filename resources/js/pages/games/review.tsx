import {
    QuestionMedia,
    type QuestionMediaData,
} from '@/components/question-media';
import { NavButton } from '@/components/site-nav';
import { useTranslations } from '@/hooks/use-translations';
import PlayerLayout from '@/layouts/player-layout';
import { questionLevelKey } from '@/lib/question-levels';
import { useSubjectName } from '@/lib/subjects';
import { cn } from '@/lib/utils';
import { Head, router, usePoll } from '@inertiajs/react';
import {
    CheckCircle2,
    Clock,
    Coins,
    Gamepad2,
    ListChecks,
    Loader2,
    Trophy,
    XCircle,
} from 'lucide-react';

interface Text {
    id: string | null;
    en: string | null;
}

interface ReviewOption {
    id: string;
    en: string;
    media: { kind: string; src: string } | null;
}

interface ReviewQuestion {
    number: number;
    subject: string | null;
    type: 'choice' | 'true_false' | null;
    level: number;
    prompt: Text;
    hint: Text;
    media: QuestionMediaData | null;
    options: ReviewOption[];
    answer: number | null;
    choice: number | null;
    correct: boolean;
}

interface ReviewPlay {
    id: number;
    game_key: string;
    game_name: string;
    points: number;
    correct: number | null;
    wrong: number | null;
    accuracy: number | null;
    duration_seconds: number | null;
    played_at: string;
    rank: number | null;
}

/**
 * The player's own question-by-question review of a finished game, opened
 * from the result screen ("Analyse questions & answers").
 */
export default function GameReview({
    play,
    questions,
    pending = false,
}: {
    play: ReviewPlay | null;
    questions: ReviewQuestion[];
    /** The game service has not recorded this match yet; the page polls. */
    pending?: boolean;
}) {
    const { t, i18n } = useTranslations();
    const english = i18n.language?.startsWith('en');
    const pick = (text: { id: string | null; en: string | null }) =>
        (english ? text.en || text.id : text.id || text.en) ?? '';

    return (
        <PlayerLayout title={t('gameReview.title')}>
            <Head>
                <meta name="robots" content="noindex, nofollow" />
            </Head>
            {pending || !play ? (
                <PendingReview />
            ) : (
                <>
                    <ReviewSummary play={play} />
                    <section
                        className="auth-card flex min-w-0 flex-col gap-3 !p-4 sm:!p-6"
                        aria-labelledby="game-review-list"
                    >
                        <h2
                            id="game-review-list"
                            className="flex items-center gap-2 text-lg font-bold"
                        >
                            <ListChecks className="size-5" aria-hidden />
                            {t('gameReview.listTitle', {
                                count: questions.length,
                            })}
                        </h2>
                        {questions.length === 0 ? (
                            <p
                                className="text-sm text-[#151b2e]/80"
                                data-testid="game-review-empty"
                            >
                                {t('gameReview.empty')}
                            </p>
                        ) : (
                            <ol className="flex flex-col gap-3">
                                {questions.map((question) => (
                                    <ReviewItem
                                        key={question.number}
                                        question={question}
                                        pick={pick}
                                    />
                                ))}
                            </ol>
                        )}
                    </section>
                </>
            )}
        </PlayerLayout>
    );
}

function PendingReview() {
    const { t } = useTranslations();
    // The result reaches Laravel a moment after the race; reload until the
    // controller redirects to the play.
    usePoll(2000);
    return (
        <section
            className="auth-card flex min-w-0 flex-col items-center gap-3 !p-6 text-center sm:!p-8"
            data-testid="game-review-pending"
            role="status"
        >
            <Loader2 className="size-8 animate-spin" aria-hidden />
            <p className="font-bold">{t('gameReview.pending')}</p>
            <button
                type="button"
                onClick={() => router.reload()}
                className="min-h-11 rounded-xl border-2 border-[#1f2a44] bg-white px-4 text-sm font-black hover:bg-[#FFF176]"
            >
                {t('gameReview.refresh')}
            </button>
        </section>
    );
}

function ReviewSummary({ play }: { play: ReviewPlay }) {
    const { t, i18n } = useTranslations();
    const answered = (play.correct ?? 0) + (play.wrong ?? 0);
    const minutes = Math.floor((play.duration_seconds ?? 0) / 60);
    const seconds = (play.duration_seconds ?? 0) % 60;
    const date = new Date(play.played_at).toLocaleString(i18n.language, {
        dateStyle: 'medium',
        timeStyle: 'short',
    });
    const tiles = [
        {
            key: 'correct',
            icon: CheckCircle2,
            value: `${play.correct ?? 0}/${answered}`,
            label: t('gameReview.correct'),
            tone: 'bg-[#c9f5e5]',
        },
        {
            key: 'accuracy',
            icon: ListChecks,
            value: play.accuracy === null ? '—' : `${play.accuracy}%`,
            label: t('gameReview.accuracy'),
            tone: 'bg-[#e0f2fe]',
        },
        {
            key: 'points',
            icon: Coins,
            value: String(play.points),
            label: t('gameReview.points'),
            tone: 'bg-[#FFD93D]',
        },
        {
            key: 'rank',
            icon: play.rank ? Trophy : Clock,
            value: play.rank
                ? `#${play.rank}`
                : `${minutes}:${String(seconds).padStart(2, '0')}`,
            label: play.rank ? t('gameReview.rank') : t('gameReview.time'),
            tone: 'bg-[#ffe1e1]',
        },
    ];
    return (
        <section
            className="auth-card flex min-w-0 flex-col gap-3 !bg-[#fff4d6] !p-4 sm:!p-6"
            aria-labelledby="game-review-title"
            data-testid="game-review-summary"
        >
            <h1
                id="game-review-title"
                className="flex min-w-0 items-center gap-2 text-2xl font-bold tracking-tight break-words sm:text-3xl"
            >
                <Gamepad2 className="size-7 shrink-0" aria-hidden />
                <span className="min-w-0">
                    {t('gameReview.heading', { game: play.game_name })}
                </span>
            </h1>
            <p className="text-sm text-[#151b2e]/80">{date}</p>
            <div
                className="grid grid-cols-2 gap-2 lg:grid-cols-4"
                data-testid="game-review-stats"
            >
                {tiles.map(({ key, icon: Icon, value, label, tone }) => (
                    <div
                        key={key}
                        className="flex min-w-0 items-center gap-2 rounded-2xl border-2 border-[#1f2a44] bg-white p-2.5 sm:p-3"
                    >
                        <span
                            className={cn(
                                'flex size-9 shrink-0 items-center justify-center rounded-xl border-2 border-[#1f2a44]',
                                tone,
                            )}
                        >
                            <Icon className="size-5" aria-hidden />
                        </span>
                        <span className="flex min-w-0 flex-col">
                            <span className="text-xl font-black">{value}</span>
                            <span className="truncate text-xs font-bold text-[#151b2e]/80">
                                {label}
                            </span>
                        </span>
                    </div>
                ))}
            </div>
            <div className="flex flex-wrap gap-2">
                <NavButton
                    href={`/games/${play.game_key}`}
                    icon={Gamepad2}
                    label={t('gameReview.playAgain')}
                    variant="primary"
                />
                <NavButton
                    href="/dashboard"
                    icon={ListChecks}
                    label={t('gameReview.history')}
                />
            </div>
        </section>
    );
}

function ReviewItem({
    question,
    pick,
}: {
    question: ReviewQuestion;
    pick: (text: { id: string | null; en: string | null }) => string;
}) {
    const { t } = useTranslations();
    const subjectName = useSubjectName();
    const trueFalse = question.type === 'true_false';
    const options: { label: string; media: ReviewOption['media'] }[] = trueFalse
        ? [
              { label: t('gameReview.true'), media: null },
              { label: t('gameReview.false'), media: null },
          ]
        : question.options.map((option) => ({
              label: pick(option),
              media: option.media,
          }));
    // True/false answers are stored as 1 = true, 0 = false.
    const indexOf = (value: number | null) =>
        value === null ? null : trueFalse ? (value === 1 ? 0 : 1) : value;
    const right = indexOf(question.answer);
    const chosen = indexOf(question.choice);
    const hint = pick(question.hint);

    return (
        <li
            className={cn(
                'flex min-w-0 gap-3 rounded-2xl border-2 border-[#1f2a44] p-3 sm:p-4',
                question.correct ? 'bg-[#effcf6]' : 'bg-[#fff1f1]',
            )}
            data-testid="game-review-question"
            data-correct={question.correct}
        >
            <span
                className={cn(
                    'flex size-9 shrink-0 items-center justify-center rounded-xl border-2 border-[#1f2a44] font-black',
                    question.correct ? 'bg-[#c9f5e5]' : 'bg-[#ffc9c9]',
                )}
                aria-label={t(
                    question.correct
                        ? 'gameReview.correct'
                        : 'gameReview.wrong',
                )}
            >
                {question.number}
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-2">
                <div className="flex flex-wrap items-center gap-1.5 text-xs font-bold">
                    {question.subject && (
                        <span className="rounded-full border-2 border-[#1f2a44] bg-white px-2 py-0.5">
                            {subjectName(question.subject)}
                        </span>
                    )}
                    <span className="rounded-full border-2 border-[#1f2a44]/30 bg-white px-2 py-0.5">
                        {t(
                            `questionLevel.levels.${questionLevelKey(question.level)}`,
                        )}
                    </span>
                    <span
                        className={cn(
                            'inline-flex items-center gap-1',
                            question.correct
                                ? 'text-emerald-700'
                                : 'text-red-700',
                        )}
                    >
                        {question.correct ? (
                            <CheckCircle2 className="size-4" aria-hidden />
                        ) : (
                            <XCircle className="size-4" aria-hidden />
                        )}
                        {t(
                            question.correct
                                ? 'gameReview.statusRight'
                                : 'gameReview.statusWrong',
                        )}
                    </span>
                </div>
                <QuestionMedia media={question.media} size="sm" />
                <p className="font-bold break-words whitespace-pre-line">
                    {pick(question.prompt) || '—'}
                </p>
                <ul className="grid gap-1.5 sm:grid-cols-2">
                    {options.map((option, index) => {
                        const isRight = index === right;
                        const isChosen = index === chosen;
                        return (
                            <li
                                key={index}
                                className={cn(
                                    'flex min-w-0 items-center gap-2 rounded-xl border-2 px-2.5 py-1.5 text-sm',
                                    isRight
                                        ? 'border-emerald-600 bg-[#c9f5e5] font-bold'
                                        : isChosen
                                          ? 'border-red-600 bg-[#ffc9c9] font-bold'
                                          : 'border-[#1f2a44]/20 bg-white',
                                )}
                                data-testid="game-review-option"
                                data-right={isRight}
                                data-chosen={isChosen}
                            >
                                {option.media && (
                                    <img
                                        src={option.media.src}
                                        alt=""
                                        className="size-10 shrink-0 rounded-lg object-cover"
                                        loading="lazy"
                                    />
                                )}
                                <span className="min-w-0 flex-1 break-words">
                                    {trueFalse
                                        ? option.label
                                        : `${String.fromCharCode(65 + index)}. ${option.label}`}
                                </span>
                                {isChosen && (
                                    <span
                                        className={cn(
                                            'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-black text-white',
                                            isRight
                                                ? 'bg-emerald-700'
                                                : 'bg-red-700',
                                        )}
                                    >
                                        {t('gameReview.yourAnswer')}
                                    </span>
                                )}
                                {isRight && !isChosen && (
                                    <span className="shrink-0 rounded-full bg-emerald-700 px-2 py-0.5 text-[11px] font-black text-white">
                                        {t('gameReview.rightAnswer')}
                                    </span>
                                )}
                            </li>
                        );
                    })}
                </ul>
                {chosen === null && (
                    <p className="text-sm font-bold text-red-700">
                        {t('gameReview.noAnswer')}
                    </p>
                )}
                {!question.correct && hint && (
                    <p className="rounded-xl bg-white/70 px-3 py-2 text-sm">
                        <b>{t('gameReview.hint')}:</b> {hint}
                    </p>
                )}
            </div>
        </li>
    );
}
