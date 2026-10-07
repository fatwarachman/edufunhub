import { Button } from '@/components/ui/button';
import { useTranslations } from '@/hooks/use-translations';
import { cn } from '@/lib/utils';
import { DoorOpen, OctagonX, Timer, X } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Leave control of a running room game (see docs/multiplayer.md).
 *
 * Players get a plain "Leave" button. The host picks between leaving alone
 * (the game goes on and another player becomes host) and stopping the game
 * for everyone (the game ends now, every player sees the result and keeps
 * the points earned so far).
 */
export function RoomLeaveControl({
    isHost,
    onLeave,
    onStop,
    disabled,
    className,
    testId = 'room-leave-game',
}: {
    isHost: boolean;
    onLeave: () => void;
    onStop: () => void;
    disabled?: boolean;
    className?: string;
    testId?: string;
}) {
    const { t } = useTranslations();
    const [open, setOpen] = useState(false);

    return (
        <>
            <Button
                variant="ghost"
                onClick={() => (isHost ? setOpen(true) : onLeave())}
                disabled={disabled}
                data-testid={testId}
                className={cn(
                    'min-h-11 self-center text-xs font-bold text-slate-600',
                    className,
                )}
            >
                <DoorOpen className="size-4" aria-hidden="true" />
                {t(isHost ? 'room.hostExit.button' : 'room.leave')}
            </Button>
            {open && (
                <HostExitDialog
                    onClose={() => setOpen(false)}
                    onLeave={() => {
                        setOpen(false);
                        onLeave();
                    }}
                    onStop={() => {
                        setOpen(false);
                        onStop();
                    }}
                />
            )}
        </>
    );
}

export function HostExitDialog({
    onClose,
    onLeave,
    onStop,
}: {
    onClose: () => void;
    onLeave: () => void;
    onStop: () => void;
}) {
    const { t } = useTranslations();
    const titleId = useId();

    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onClose();
            }
        };
        window.addEventListener('keydown', onKey);

        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    return createPortal(
        <div
            className="fixed inset-0 z-[70] flex items-end justify-center bg-[#1f2a44]/60 p-3 backdrop-blur-sm sm:items-center"
            onClick={onClose}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                onClick={(event) => event.stopPropagation()}
                className="relative w-full max-w-md rounded-3xl border-[3px] border-[#1f2a44] bg-[#FFFDF7] p-5 text-[#1f2a44] shadow-[6px_6px_0px_#1f2a44]"
                data-testid="host-exit-dialog"
            >
                <button
                    type="button"
                    onClick={onClose}
                    aria-label={t('room.hostExit.cancel')}
                    className="absolute top-3 right-3 inline-flex size-11 items-center justify-center rounded-full text-slate-600 hover:bg-[#1f2a44]/5"
                >
                    <X className="size-5" aria-hidden="true" />
                </button>
                <h2
                    id={titleId}
                    className="pr-10 font-display text-xl font-black text-balance"
                >
                    {t('room.hostExit.title')}
                </h2>
                <p className="mt-1 text-sm font-bold text-slate-600">
                    {t('room.hostExit.intro')}
                </p>
                <div className="mt-4 flex flex-col gap-3">
                    <ExitOption
                        icon={DoorOpen}
                        title={t('room.hostExit.leaveTitle')}
                        hint={t('room.hostExit.leaveHint')}
                        onClick={onLeave}
                        testId="host-exit-leave"
                    />
                    <ExitOption
                        icon={OctagonX}
                        title={t('room.hostExit.stopTitle')}
                        hint={t('room.hostExit.stopHint')}
                        onClick={onStop}
                        danger
                        testId="host-exit-stop"
                    />
                </div>
                <Button
                    variant="outline"
                    onClick={onClose}
                    className="mt-4 min-h-11 w-full rounded-xl border-2 border-[#1f2a44] bg-white font-black text-[#1f2a44]"
                    data-testid="host-exit-cancel"
                >
                    {t('room.hostExit.cancel')}
                </Button>
            </div>
        </div>,
        document.body,
    );
}

function ExitOption({
    icon: Icon,
    title,
    hint,
    onClick,
    danger,
    testId,
}: {
    icon: typeof DoorOpen;
    title: string;
    hint: string;
    onClick: () => void;
    danger?: boolean;
    testId: string;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            data-testid={testId}
            className={cn(
                'flex min-h-16 w-full items-start gap-3 rounded-2xl border-2 px-4 py-3 text-left transition-colors focus-visible:ring-2 focus-visible:ring-[#1f2a44] focus-visible:outline-none',
                danger
                    ? 'border-[#AD1457] bg-[#FFEBF0] text-[#AD1457] hover:bg-[#FFD9E3]'
                    : 'border-[#1f2a44] bg-white hover:bg-[#FFF9E6]',
            )}
        >
            <Icon className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
            <span className="min-w-0">
                <span className="block font-display text-base font-black">
                    {title}
                </span>
                <span
                    className={cn(
                        'block text-xs font-bold',
                        danger ? 'text-[#8C0F45]' : 'text-slate-600',
                    )}
                >
                    {hint}
                </span>
            </span>
        </button>
    );
}

/**
 * Host setting of a room game: how long players have to answer each
 * question. 0 keeps the game's default (which may follow the grade).
 */
export function AnswerTimePicker({
    value,
    options,
    disabled,
    onChange,
    defaultHint,
}: {
    value: number;
    options: number[];
    disabled?: boolean;
    onChange: (seconds: number) => void;
    /** Label of the default choice (e.g. "Auto (by grade)"). */
    defaultHint?: string;
}) {
    const { t } = useTranslations();

    return (
        <fieldset
            className="text-left"
            data-testid="answer-time"
            data-seconds={value}
        >
            <legend className="mb-2 flex items-center gap-1.5 text-xs font-black text-slate-500 uppercase">
                <Timer className="size-3.5" aria-hidden="true" />
                {t('room.answerTime.label')}
            </legend>
            <div className="grid grid-cols-3 gap-2">
                {options.map((seconds) => {
                    const selected = value === seconds;
                    return (
                        <button
                            key={seconds}
                            type="button"
                            disabled={disabled}
                            aria-pressed={selected}
                            onClick={() => onChange(seconds)}
                            data-testid={`answer-time-${seconds}`}
                            className={cn(
                                'flex min-h-12 min-w-0 flex-col items-center justify-center rounded-2xl border-2 border-[#1f2a44] px-2 py-1.5 text-center font-display leading-tight font-black transition-colors disabled:cursor-default',
                                seconds === 0 && 'col-span-3',
                                selected
                                    ? 'bg-[#1f2a44] text-white shadow-[3px_3px_0px_#FF9E44]'
                                    : 'bg-white text-[#1f2a44] enabled:hover:bg-[#FFF9E6] disabled:opacity-60',
                            )}
                        >
                            {seconds === 0 ? (
                                <span className="text-sm">
                                    {defaultHint ?? t('room.answerTime.auto')}
                                </span>
                            ) : (
                                <>
                                    <span className="text-lg">{seconds}</span>
                                    <span className="text-[10px] font-bold">
                                        {t('room.answerTime.secondsShort')}
                                    </span>
                                </>
                            )}
                        </button>
                    );
                })}
            </div>
            <p className="mt-2 text-xs font-bold text-slate-500">
                {t('room.answerTime.hint')}
            </p>
        </fieldset>
    );
}
