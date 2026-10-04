import SnakesChallenge from '@/components/flag-quest/snakes-challenge';
import { useTranslations } from '@/hooks/use-translations';
import { type CharacterLook } from '@/lib/character/draw-character';
import type { ChallengeState } from '@/lib/flag-quest/world';
import { CheckCircle2, LogOut, Timer, XCircle } from 'lucide-react';
import { type FormEvent, useEffect, useRef, useState } from 'react';

interface Props {
    challenge: ChallengeState;
    look: CharacterLook;
    onAnswer: (value: string) => void;
    onRoll: () => void;
    onLeave: () => void;
    onSound?: (sound: 'dice' | 'step' | 'correct' | 'wrong') => void;
}

function useCountdown(
    challenge: ChallengeState,
    field: 'deadline_ms' | 'ends_ms',
): number | null {
    const [now, setNow] = useState(() => performance.now());
    useEffect(() => {
        const id = setInterval(() => setNow(performance.now()), 200);
        return () => clearInterval(id);
    }, []);
    const base = challenge[field];
    if (base === undefined || challenge.phase === 'done') {
        return null;
    }
    return Math.max(0, Math.ceil((base - (now - challenge.receivedAt)) / 1000));
}

export default function ChallengeDialog({
    challenge,
    look,
    onAnswer,
    onRoll,
    onLeave,
    onSound,
}: Props) {
    const { t } = useTranslations();
    const perStep = useCountdown(challenge, 'deadline_ms');
    const overall = useCountdown(challenge, 'ends_ms');
    const [pendingFor, setPendingFor] = useState<number | null>(null);
    const pending = pendingFor === challenge.receivedAt;
    const [sprintValue, setSprintValue] = useState('');
    const sprintInput = useRef<HTMLInputElement>(null);
    const titleId = 'fq-challenge-title';

    useEffect(() => {
        if (
            challenge.kind === 'math_sprint' &&
            challenge.phase === 'question'
        ) {
            sprintInput.current?.focus();
        }
    }, [challenge.kind, challenge.phase]);

    const submit = (value: string) => {
        if (pending || challenge.phase !== 'question') {
            return;
        }
        setPendingFor(challenge.receivedAt);
        onAnswer(value);
    };

    const onSprintSubmit = (event: FormEvent) => {
        event.preventDefault();
        if (sprintValue.trim() !== '') {
            submit(sprintValue.trim());
        }
    };

    const fb = challenge.feedback;
    const progress =
        challenge.kind === 'math_sprint' || challenge.kind === 'snakes_ladders'
            ? t('flagQuest.challenge.progressTarget', {
                  correct: challenge.correct,
                  needed: challenge.needed,
              })
            : t('flagQuest.challenge.progress', {
                  step: Math.min(challenge.step + 1, challenge.total),
                  total: challenge.total,
                  needed: challenge.needed,
              });

    const questionView = challenge.question ? (
        <section className="flex flex-col gap-3">
            <p className="text-xs font-bold text-[#6c5ce7] uppercase">
                {t(`flagQuest.subjects.${challenge.question.subject}`, {
                    defaultValue: challenge.question.subject,
                })}
            </p>
            <p className="text-lg leading-snug font-bold break-words sm:text-xl">
                {challenge.question.prompt}
            </p>
            {challenge.kind === 'true_false' ? (
                <div className="grid grid-cols-2 gap-3">
                    <button
                        type="button"
                        disabled={pending}
                        onClick={() => submit('true')}
                        className="fq-answer !bg-[#dff7ea]"
                    >
                        <CheckCircle2 className="size-5 shrink-0" />
                        {t('flagQuest.challenge.true')}
                    </button>
                    <button
                        type="button"
                        disabled={pending}
                        onClick={() => submit('false')}
                        className="fq-answer !bg-[#ffe3e8]"
                    >
                        <XCircle className="size-5 shrink-0" />
                        {t('flagQuest.challenge.false')}
                    </button>
                </div>
            ) : challenge.kind === 'math_sprint' ? (
                <form onSubmit={onSprintSubmit} className="flex gap-2">
                    <label htmlFor="fq-sprint" className="sr-only">
                        {t('flagQuest.challenge.yourAnswer')}
                    </label>
                    <input
                        id="fq-sprint"
                        ref={sprintInput}
                        inputMode="numeric"
                        pattern="-?[0-9]*"
                        autoComplete="off"
                        maxLength={8}
                        value={sprintValue}
                        onChange={(e) =>
                            setSprintValue(
                                e.target.value.replace(/[^0-9-]/g, ''),
                            )
                        }
                        className="min-h-12 w-full min-w-0 rounded-xl border-2 border-[#151b2e] bg-white px-3.5 text-lg font-bold tabular-nums"
                        placeholder={t('flagQuest.challenge.yourAnswer')}
                    />
                    <button
                        type="submit"
                        disabled={pending || sprintValue === ''}
                        className="fq-primary shrink-0 px-5"
                    >
                        {t('flagQuest.challenge.submit')}
                    </button>
                </form>
            ) : (
                <div className="grid gap-2.5 sm:grid-cols-2">
                    {challenge.question.options.map((option, index) => (
                        <button
                            key={`${index}-${option}`}
                            type="button"
                            disabled={pending}
                            onClick={() => submit(String(index))}
                            className="fq-answer"
                        >
                            <span className="grid size-7 shrink-0 place-items-center rounded-lg border-2 border-[#151b2e] bg-[#ffd93d] text-sm">
                                {String.fromCharCode(65 + index)}
                            </span>
                            <span className="min-w-0 break-words">
                                {option}
                            </span>
                        </button>
                    ))}
                </div>
            )}
        </section>
    ) : null;

    const doneView = (
        <div className="flex flex-col items-center gap-3 py-2 text-center">
            {challenge.passed ? (
                <CheckCircle2 className="size-12 text-[#1aab8a]" />
            ) : (
                <XCircle className="size-12 text-[#e85d75]" />
            )}
            <p className="text-xl font-bold">
                {challenge.passed
                    ? t('flagQuest.challenge.passed')
                    : t('flagQuest.challenge.failed')}
            </p>
            <p className="text-sm text-muted-foreground">
                {challenge.passed
                    ? t('flagQuest.challenge.passedNote')
                    : t('flagQuest.challenge.failedNote')}
            </p>
            <button
                type="button"
                onClick={onLeave}
                className="fq-primary min-h-11 px-6"
                autoFocus
            >
                {challenge.passed
                    ? t('flagQuest.challenge.continue')
                    : t('flagQuest.challenge.back')}
            </button>
        </div>
    );

    return (
        <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-[#151b2e]/55 p-2 pb-[max(8px,env(safe-area-inset-bottom))] backdrop-blur-[2px] sm:items-center sm:p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
        >
            <div className="fq-card flex max-h-[calc(100dvh-1rem)] w-full max-w-xl flex-col overflow-hidden sm:max-h-[calc(100dvh-2rem)]">
                <header className="flex items-start justify-between gap-3 border-b-[3px] border-[#151b2e] px-4 py-3 sm:px-5">
                    <div className="min-w-0">
                        <p className="text-xs font-bold tracking-wide text-[#6c5ce7] uppercase">
                            {t('flagQuest.challenge.station', {
                                number: challenge.checkpoint + 1,
                            })}
                        </p>
                        <h2
                            id={titleId}
                            className="text-lg leading-tight font-bold sm:text-xl"
                        >
                            {t(`flagQuest.kinds.${challenge.kind}.title`)}
                        </h2>
                        <p className="text-xs text-[#3d4357] sm:text-sm [@media(max-height:500px)_and_(orientation:landscape)]:line-clamp-1">
                            {t(`flagQuest.kinds.${challenge.kind}.rule`, {
                                needed: challenge.needed,
                            })}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onLeave}
                        className="fq-icon-btn shrink-0"
                        aria-label={
                            challenge.phase === 'done'
                                ? t('flagQuest.challenge.close')
                                : t('flagQuest.challenge.leave')
                        }
                        title={
                            challenge.phase === 'done'
                                ? t('flagQuest.challenge.close')
                                : t('flagQuest.challenge.leave')
                        }
                    >
                        <LogOut className="size-4" />
                    </button>
                </header>

                <div className="flex flex-col gap-4 overflow-y-auto px-4 py-4 sm:px-5">
                    <div className="flex flex-wrap items-center gap-2 text-xs font-bold sm:text-sm">
                        <span className="fq-pill">{progress}</span>
                        <span className="fq-pill !bg-[#dff7ea] text-[#116a56]">
                            <CheckCircle2 className="size-3.5" />
                            {challenge.correct}
                        </span>
                        <span className="fq-pill !bg-[#ffe3e8] text-[#b8394f]">
                            <XCircle className="size-3.5" />
                            {challenge.wrong}
                        </span>
                        {(overall ?? perStep) !== null && (
                            <span
                                className={`fq-pill ml-auto tabular-nums ${(overall ?? perStep)! <= 5 ? '!bg-[#ffe3e8] text-[#b8394f]' : ''}`}
                                aria-live="off"
                            >
                                <Timer className="size-3.5" />
                                {t('flagQuest.challenge.seconds', {
                                    count: overall ?? perStep ?? 0,
                                })}
                            </span>
                        )}
                    </div>

                    {fb && (
                        <div
                            role="status"
                            className={`rounded-xl border-2 border-[#151b2e] px-3 py-2 text-sm font-semibold ${fb.correct ? 'bg-[#dff7ea] text-[#0d5a48]' : 'bg-[#ffe3e8] text-[#8f2438]'}`}
                        >
                            {fb.correct
                                ? t('flagQuest.challenge.correct')
                                : fb.timeout
                                  ? t('flagQuest.challenge.timeout', {
                                        answer: displayAnswer(fb.answer, t),
                                    })
                                  : t('flagQuest.challenge.wrong', {
                                        answer: displayAnswer(fb.answer, t),
                                    })}
                            {fb.hint && !fb.correct && (
                                <span className="mt-0.5 block text-xs font-normal">
                                    {fb.hint}
                                </span>
                            )}
                        </div>
                    )}

                    {challenge.kind === 'snakes_ladders' && challenge.board ? (
                        <SnakesChallenge
                            challenge={challenge}
                            look={look}
                            onRoll={onRoll}
                            onSound={onSound}
                            question={questionView}
                            done={doneView}
                        />
                    ) : (
                        <>
                            {challenge.phase === 'question' && questionView}
                            {challenge.phase === 'done' && doneView}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

function displayAnswer(answer: string, t: (k: string) => string): string {
    if (answer === 'true') {
        return t('flagQuest.challenge.true');
    }
    if (answer === 'false') {
        return t('flagQuest.challenge.false');
    }
    return answer;
}
