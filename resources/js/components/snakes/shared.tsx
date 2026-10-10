import { PlayerAvatar } from '@/components/player-avatar';
import {
    QuestionMedia,
    type QuestionMediaData,
} from '@/components/question-media';
import { useTranslations } from '@/hooks/use-translations';
import { type CharacterLook } from '@/lib/character/draw-character';
import { cn } from '@/lib/utils';
import {
    CheckCircle2,
    Clock,
    Dice1,
    Dice2,
    Dice3,
    Dice4,
    Dice5,
    Dice6,
    DoorOpen,
    Flag,
    Sparkles,
    Timer,
    XCircle,
} from 'lucide-react';

const DICE_ICONS = [Dice1, Dice2, Dice3, Dice4, Dice5, Dice6];

export function DiceFace({
    value,
    className,
}: {
    value: number;
    className?: string;
}) {
    const Icon = DICE_ICONS[Math.min(Math.max(value, 1), 6) - 1];
    return <Icon className={className} />;
}

/** Full-screen dice roll overlay. */
export function DiceDialog({
    name,
    value,
    rolling,
}: {
    name: string;
    value: number;
    rolling: boolean;
}) {
    const { t } = useTranslations();
    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
            data-testid="snakes-dice-dialog"
        >
            <div className="flex w-full max-w-sm animate-in flex-col items-center justify-center rounded-3xl border-4 border-[#1f2a44] bg-[#FFF9E6] p-8 text-center shadow-[10px_10px_0px_#1f2a44] duration-200 zoom-in-75">
                <div className="inline-flex items-center gap-1.5 rounded-full border-2 border-[#1f2a44] bg-[#FFF176] px-3 py-1 text-xs font-black text-[#1f2a44]">
                    <Sparkles className="h-3.5 w-3.5 text-[#FF9E44]" />
                    {t('snakes.dice.rollingTitle', { name })}
                </div>
                <div className="my-6">
                    <div
                        className={cn(
                            'flex h-32 w-32 items-center justify-center rounded-3xl border-4 border-[#1f2a44] shadow-[8px_8px_0px_#1f2a44] transition-all duration-100',
                            rolling
                                ? 'scale-110 rotate-12 animate-pulse bg-[#FFF176]'
                                : 'scale-105 bg-[#00C9A7]',
                        )}
                    >
                        <DiceFace
                            value={value}
                            className="h-20 w-20 stroke-[2.5] text-[#1f2a44]"
                        />
                    </div>
                </div>
                <div className="font-display text-3xl font-black text-[#1f2a44]">
                    {rolling
                        ? t('snakes.dice.rolling')
                        : t('snakes.dice.result', { value })}
                </div>
                <p className="mt-2 text-xs font-bold text-slate-600">
                    {rolling
                        ? t('snakes.dice.rollingHint')
                        : t('snakes.dice.openingQuestion')}
                </p>
            </div>
        </div>
    );
}

export interface QuestionView {
    subject: string;
    level?: string;
    text: string;
    media?: QuestionMediaData | null;
    options: string[];
}

/**
 * Question overlay shared by local and online play. `answer` is the revealed
 * correct option (null while answering). Spectators see the question but
 * cannot answer.
 */
export function QuestionDialog({
    name,
    skinIndex,
    character,
    question,
    dice,
    target,
    choice,
    answer,
    outcome,
    hint,
    secondsLeft,
    canAnswer,
    onAnswer,
}: {
    name: string;
    skinIndex: number;
    character?: CharacterLook | null;
    question: QuestionView;
    dice: number;
    target: number;
    choice: number | null;
    answer: number | null;
    outcome: 'correct' | 'wrong' | 'timeout' | null;
    hint?: string;
    secondsLeft?: number;
    canAnswer: boolean;
    onAnswer: (option: number) => void;
}) {
    const { t } = useTranslations();
    const revealed = answer !== null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
            data-testid="snakes-question-dialog"
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="snakes-question-text"
                className="relative max-h-[90dvh] w-full max-w-lg animate-in overflow-y-auto rounded-3xl border-4 border-[#1f2a44] bg-[#FFF9E6] p-5 shadow-[10px_10px_0px_#1f2a44] duration-200 zoom-in-95 fade-in sm:p-8"
            >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-[#1f2a44]/15 pb-4">
                    <div className="flex min-w-0 items-center gap-2">
                        <div className="size-10 shrink-0">
                            <PlayerAvatar
                                character={character}
                                seat={skinIndex}
                            />
                        </div>
                        <span className="truncate font-display text-sm font-black text-[#1f2a44]">
                            {t('snakes.question.turnOf', { name })}
                        </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border-2 border-[#1f2a44] bg-[#00C9A7] px-3 py-0.5 text-xs font-black text-[#1f2a44]">
                            {question.subject}
                        </span>
                        <span className="rounded-full border-2 border-[#1f2a44] bg-[#FFF176] px-2.5 py-0.5 text-xs font-black text-[#1f2a44]">
                            {t('snakes.question.advance', { count: dice })}
                        </span>
                    </div>
                </div>

                <div className="my-5 rounded-2xl border-3 border-[#1f2a44] bg-white p-5 text-center shadow-[4px_4px_0px_#1f2a44]">
                    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] font-black tracking-wider text-[#845EC2] uppercase">
                        {question.level && (
                            <span>
                                {t('snakes.question.level', {
                                    level: question.level,
                                })}
                            </span>
                        )}
                        <span>
                            {t('snakes.question.target', { square: target })}
                        </span>
                    </div>
                    <QuestionMedia
                        media={question.media}
                        size="sm"
                        className="mt-2"
                    />
                    <h3
                        id="snakes-question-text"
                        className="mt-2 font-display text-base leading-snug font-black text-[#1f2a44] sm:text-xl"
                        data-testid="snakes-question-text"
                    >
                        {question.text}
                    </h3>
                    {secondsLeft !== undefined && !revealed && (
                        <p className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-slate-600">
                            <Timer className="size-3.5" />
                            {t('snakes.question.timeLeft', {
                                seconds: secondsLeft,
                            })}
                        </p>
                    )}
                </div>

                <div className="flex flex-col gap-2.5">
                    {question.options.map((option, index) => {
                        const isAnswer = revealed && index === answer;
                        const isWrongChoice =
                            revealed && index === choice && index !== answer;
                        return (
                            <button
                                key={index}
                                type="button"
                                disabled={!canAnswer || revealed}
                                onClick={() => onAnswer(index)}
                                data-testid={`snakes-option-${index}`}
                                className={cn(
                                    'flex min-h-12 w-full items-center justify-between gap-2 rounded-2xl border-2 border-[#1f2a44] p-3.5 text-left text-sm font-bold text-[#1f2a44] shadow-[2px_2px_0px_#1f2a44] transition-all enabled:cursor-pointer',
                                    isAnswer
                                        ? 'border-3 bg-[#00C9A7] font-black'
                                        : isWrongChoice
                                          ? 'border-3 bg-[#FF6584] font-black text-white'
                                          : 'bg-white enabled:hover:bg-[#FFFDE6]',
                                    !canAnswer &&
                                        !revealed &&
                                        'cursor-default opacity-80',
                                )}
                            >
                                <span>{option}</span>
                                {isAnswer && (
                                    <CheckCircle2 className="h-5 w-5 shrink-0" />
                                )}
                                {isWrongChoice && (
                                    <XCircle className="h-5 w-5 shrink-0" />
                                )}
                            </button>
                        );
                    })}
                </div>

                {!canAnswer && !revealed && (
                    <p
                        className="mt-4 text-center text-xs font-bold text-slate-600"
                        data-testid="snakes-spectating"
                    >
                        {t('snakes.question.spectating', { name })}
                    </p>
                )}

                {outcome && (
                    <div
                        className={cn(
                            'mt-5 animate-in rounded-2xl border-3 border-[#1f2a44] p-4 text-sm font-bold shadow-[3px_3px_0px_#1f2a44] fade-in slide-in-from-bottom-2',
                            outcome === 'correct'
                                ? 'bg-[#E8FAF6] text-[#00695C]'
                                : 'bg-[#FFEBF0] text-[#AD1457]',
                        )}
                        data-testid="snakes-feedback"
                        data-outcome={outcome}
                    >
                        {outcome === 'correct'
                            ? t('snakes.question.correct', {
                                  count: dice,
                                  square: target,
                              })
                            : t(
                                  outcome === 'timeout'
                                      ? 'snakes.question.timeout'
                                      : 'snakes.question.wrong',
                              )}
                        {hint && (
                            <p className="mt-1 text-xs text-slate-700">
                                {hint}
                            </p>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

export interface ArenaPlayer {
    id: number;
    /** Account id (online dot); absent for local seats. */
    userId?: number;
    name: string;
    position: number;
    score: number;
    skinIndex: number;
    character?: CharacterLook | null;
    badges?: string[];
    muted?: boolean;
}

/** Scoreboard listing every player on the board. */
export function PlayerList({
    players,
    turnId,
}: {
    players: ArenaPlayer[];
    turnId: number | null;
}) {
    const { t } = useTranslations();
    return (
        <div className="flex flex-col gap-2.5" data-testid="snakes-players">
            <span className="text-xs font-black text-slate-500 uppercase">
                {t('snakes.players.inArena')}
            </span>
            {players.map((p) => {
                const isTurn = p.id === turnId;
                return (
                    <div
                        key={p.id}
                        className={cn(
                            'flex items-center justify-between gap-2 rounded-2xl border-2 border-[#1f2a44] p-2.5 transition-all',
                            isTurn
                                ? 'bg-[#FFFDE6] shadow-[3px_3px_0px_#1f2a44] sm:translate-x-1'
                                : 'bg-white',
                            p.muted && 'opacity-60',
                        )}
                        data-testid={`snakes-player-${p.id}`}
                        data-turn={isTurn}
                    >
                        <div className="flex min-w-0 items-center gap-2.5">
                            <div className="size-10 shrink-0">
                                <PlayerAvatar
                                    character={p.character}
                                    seat={p.skinIndex}
                                    userId={p.userId}
                                />
                            </div>
                            <div className="min-w-0">
                                <div className="truncate text-xs font-black text-[#1f2a44]">
                                    {p.name}
                                </div>
                                {p.badges?.length ? (
                                    <div className="flex flex-wrap gap-1 text-[10px] font-bold text-slate-500">
                                        {p.badges.map((badge) => (
                                            <span
                                                key={badge}
                                                className="rounded border border-[#1f2a44]/30 bg-white px-1"
                                            >
                                                {badge}
                                            </span>
                                        ))}
                                    </div>
                                ) : null}
                            </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5 text-xs font-bold">
                            <span className="rounded-lg border border-[#1f2a44] bg-white px-2 py-0.5">
                                {t('snakes.players.square', {
                                    square: p.position,
                                })}
                            </span>
                            <span className="rounded-lg bg-[#FF9E44]/20 px-2 py-0.5 text-[#1f2a44]">
                                {t('snakes.players.points', {
                                    points: p.score,
                                })}
                            </span>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

/** Recent moves. */
export function MoveLog({ entries }: { entries: string[] }) {
    const { t } = useTranslations();
    return (
        <div className="flex min-h-0 flex-col rounded-3xl border-3 border-[#1f2a44] bg-white p-4 shadow-[4px_4px_0px_#1f2a44] sm:p-5 lg:flex-1">
            <span className="text-xs font-black text-slate-500 uppercase">
                {t('snakes.log.title')}
            </span>
            <div
                className="mt-2 flex min-h-0 flex-col gap-1.5 overflow-y-auto"
                data-testid="snakes-log"
            >
                {entries.map((entry, index) => (
                    <div
                        key={`${index}-${entry}`}
                        className="rounded-lg border border-[#1f2a44]/10 bg-[#FFFDE6] px-3 py-1.5 text-xs font-semibold text-slate-700"
                    >
                        {entry}
                    </div>
                ))}
            </div>
        </div>
    );
}

/** Board legend under the board. */
export function BoardLegend() {
    const { t } = useTranslations();
    return (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-4 border-t-2 border-[#1f2a44]/15 pt-3 text-xs font-bold text-slate-700">
            <div className="flex items-center gap-1.5">
                <span className="inline-block h-3.5 w-3.5 rounded border border-[#1f2a44] bg-[#dcb783]" />
                <span>{t('snakes.legend.ladder')}</span>
            </div>
            <div className="flex items-center gap-1.5">
                <span className="inline-block h-3.5 w-3.5 rounded border border-[#1f2a44] bg-[#e76866]" />
                <span>{t('snakes.legend.snake')}</span>
            </div>
            <div className="flex items-center gap-1.5">
                <span className="inline-block h-3.5 w-3.5 rounded border border-[#1f2a44] bg-[#FFF176]" />
                <span>{t('snakes.legend.finish')}</span>
            </div>
        </div>
    );
}

/**
 * Game length picked by the host before the room starts: a number of
 * minutes, or "until someone finishes" (0). Everyone else sees the choice.
 */
export function DurationPicker({
    value,
    options,
    finishBonus,
    disabled,
    onChange,
}: {
    value: number;
    options: number[];
    finishBonus: number;
    disabled?: boolean;
    onChange: (minutes: number) => void;
}) {
    const { t } = useTranslations();
    return (
        <fieldset
            className="text-left"
            data-testid="snakes-duration"
            data-minutes={value}
        >
            <legend className="mb-2 flex items-center gap-1.5 text-xs font-black text-slate-500 uppercase">
                <Clock className="size-3.5" aria-hidden="true" />
                {t('snakes.duration.label')}
            </legend>
            <div className="grid grid-cols-3 gap-2">
                {options.map((minutes) => {
                    const selected = value === minutes;
                    return (
                        <button
                            key={minutes}
                            type="button"
                            disabled={disabled}
                            aria-pressed={selected}
                            onClick={() => onChange(minutes)}
                            data-testid={`snakes-duration-${minutes}`}
                            className={cn(
                                'flex min-h-12 min-w-0 flex-col items-center justify-center rounded-2xl border-2 border-[#1f2a44] px-2 py-1.5 text-center font-display leading-tight font-black transition-colors disabled:cursor-default',
                                minutes === 0 && 'col-span-3',
                                selected
                                    ? 'bg-[#1f2a44] text-white shadow-[3px_3px_0px_#FF9E44]'
                                    : 'bg-white text-[#1f2a44] enabled:hover:bg-[#FFF9E6] disabled:opacity-60',
                            )}
                        >
                            {minutes === 0 ? (
                                <span className="flex items-center gap-1.5 text-sm">
                                    <Flag
                                        className="size-4 shrink-0"
                                        aria-hidden="true"
                                    />
                                    {t('snakes.duration.untilFinish')}
                                </span>
                            ) : (
                                <>
                                    <span className="text-lg">{minutes}</span>
                                    <span className="text-[10px] font-bold">
                                        {t('snakes.duration.minutesShort')}
                                    </span>
                                </>
                            )}
                        </button>
                    );
                })}
            </div>
            <p className="mt-2 text-xs font-bold text-slate-600">
                {value === 0
                    ? t('snakes.duration.hintUntilFinish')
                    : t('snakes.duration.hintTimed', { count: value })}
            </p>
            <p className="mt-1 inline-flex items-center gap-1 rounded-full border border-[#1f2a44] bg-[#ffd93d] px-2 py-0.5 text-[11px] font-black text-[#1f2a44]">
                <Sparkles className="size-3" aria-hidden="true" />
                {t('snakes.finishBonus.rule', { points: finishBonus })}
            </p>
            {disabled && (
                <p className="mt-2 text-xs font-bold text-slate-500">
                    {t('snakes.duration.host')}
                </p>
            )}
        </fieldset>
    );
}

/** mm:ss for the remaining time of a timed game. */
export function formatClock(ms: number): string {
    const total = Math.max(0, Math.ceil(ms / 1000));
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Confirmation before leaving a running game. Points already earned stay on
 * the account (the referee reports them when the player leaves).
 */
export function LeaveGameDialog({
    open,
    onCancel,
    onConfirm,
}: {
    open: boolean;
    onCancel: () => void;
    onConfirm: () => void;
}) {
    const { t } = useTranslations();
    if (!open) {
        return null;
    }
    return (
        <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
            data-testid="snakes-leave-dialog"
            onClick={onCancel}
            onKeyDown={(event) => event.key === 'Escape' && onCancel()}
        >
            <div
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="snakes-leave-title"
                aria-describedby="snakes-leave-body"
                onClick={(event) => event.stopPropagation()}
                className="w-full max-w-sm animate-in rounded-3xl border-4 border-[#1f2a44] bg-[#FFF9E6] p-6 text-center text-[#1f2a44] shadow-[8px_8px_0px_#1f2a44] duration-200 zoom-in-95 fade-in"
            >
                <DoorOpen className="mx-auto size-10 text-[#FF6584]" />
                <h2
                    id="snakes-leave-title"
                    className="mt-2 font-display text-xl font-black"
                >
                    {t('snakes.leave.title')}
                </h2>
                <p
                    id="snakes-leave-body"
                    className="mt-2 text-sm font-bold text-slate-700"
                >
                    {t('snakes.leave.body')}
                </p>
                <div className="mt-5 grid grid-cols-2 gap-2">
                    <button
                        type="button"
                        autoFocus
                        onClick={onCancel}
                        className="min-h-11 rounded-xl border-2 border-[#1f2a44] bg-white px-3 text-sm font-black"
                        data-testid="snakes-leave-cancel"
                    >
                        {t('snakes.leave.cancel')}
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        className="min-h-11 rounded-xl border-2 border-[#1f2a44] bg-[#FF6584] px-3 text-sm font-black text-white shadow-[2px_2px_0px_#1f2a44]"
                        data-testid="snakes-leave-confirm"
                    >
                        {t('snakes.leave.confirm')}
                    </button>
                </div>
            </div>
        </div>
    );
}
