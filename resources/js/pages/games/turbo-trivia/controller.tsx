import AdSlot from '@/components/ads/ad-slot';
import GameAdStrip from '@/components/ads/game-ad-strip';
import { ConnectionBadge, RoomError } from '@/components/multiplayer/room';
import { PlayerAvatar } from '@/components/player-avatar';
import { HowToPlay } from '@/components/turbo-trivia/how-to-play';
import {
    ACCENT,
    ITEM_STYLE,
    Panel,
    Podium,
    TurboShell,
    useQuestionLeft,
    useTurboAudio,
} from '@/components/turbo-trivia/shared';
import { Button } from '@/components/ui/button';
import { useTranslations } from '@/hooks/use-translations';
import {
    type TurboEffect,
    type TurboItem,
    type TurboState,
    useTurboTrivia,
} from '@/hooks/use-turbo-trivia';
import { useAdMoments } from '@/lib/ads';
import { type CharacterLook } from '@/lib/character/draw-character';
import { cn } from '@/lib/utils';
import { router } from '@inertiajs/react';
import {
    Coins,
    DoorOpen,
    Flag,
    Gauge,
    LogIn,
    Package,
    Trophy,
    WifiOff,
} from 'lucide-react';
import {
    type FormEvent,
    useCallback,
    useEffect,
    useRef,
    useState,
} from 'react';
import '../../../../css/turbo-trivia.css';

interface ControllerProps {
    player: {
        id: number;
        name: string;
        grade: number | null;
        character: CharacterLook | null;
    };
    points: number;
    serviceReady: boolean;
    wsUrl: string | null;
    pin: string | null;
}

const LETTERS = ['A', 'B', 'C', 'D'];
const OPTION_TONES = ['#e11d48', '#2563eb', '#a16207', '#15803d'];
const MAX_ITEMS = 2;

type Toast = { id: number; tone: 'good' | 'bad' | 'info'; text: string };

function vibrate(pattern: number | number[]) {
    if ('vibrate' in navigator) {
        navigator.vibrate?.(pattern);
    }
}

/** Student phone controller: trivia card, speedometer, item buttons. */
export default function TurboTriviaController({
    player,
    points,
    serviceReady,
    wsUrl,
    pin,
}: ControllerProps) {
    const { t, i18n } = useTranslations();
    const { play, muted, toggleMuted } = useTurboAudio();
    const [failure, setFailure] = useState<{
        code: string;
        qid?: number;
    } | null>(null);
    const [toast, setToast] = useState<Toast | null>(null);
    const [hitFlash, setHitFlash] = useState(0);
    const tRef = useRef(t);
    const playRef = useRef(play);
    useEffect(() => {
        tRef.current = t;
        playRef.current = play;
    }, [t, play]);

    const show = useCallback((tone: Toast['tone'], text: string) => {
        setToast({ id: Date.now(), tone, text });
    }, []);
    useEffect(() => {
        if (!toast) {
            return;
        }
        const id = setTimeout(() => setToast(null), 2200);
        return () => clearTimeout(id);
    }, [toast]);

    const onEvent = useCallback(
        (msg: Record<string, unknown>) => {
            const tr = tRef.current;
            const sound = playRef.current;
            switch (msg.t) {
                case 'answer_result':
                    if (msg.correct) {
                        sound('nitro');
                        vibrate(60);
                        show('good', tr('turboTrivia.controller.nitro'));
                    } else {
                        sound('slip');
                        vibrate([120, 60, 120]);
                        show('bad', tr('turboTrivia.controller.stutter'));
                    }
                    break;
                case 'item_gained':
                    sound('item');
                    vibrate([30, 40, 30]);
                    show(
                        'info',
                        tr('turboTrivia.controller.newItem', {
                            item: tr(`turboTrivia.items.${msg.item}`),
                        }),
                    );
                    break;
                case 'hit':
                    if (msg.blocked) {
                        sound('shield');
                        vibrate(40);
                        show('info', tr('turboTrivia.controller.blocked'));
                    } else {
                        sound(
                            msg.item === 'MISSILE'
                                ? 'explode'
                                : msg.item === 'LIGHTNING'
                                  ? 'zap'
                                  : 'slip',
                        );
                        vibrate([200, 80, 200]);
                        setHitFlash(Date.now());
                        show(
                            'bad',
                            tr(`turboTrivia.controller.hit.${msg.item}`),
                        );
                    }
                    break;
                case 'finished':
                    sound('finish');
                    vibrate([80, 60, 80, 60, 200]);
                    break;
            }
        },
        [show],
    );
    const qidRef = useRef<number | undefined>(undefined);
    const onError = useCallback(
        (code: string) => setFailure({ code, qid: qidRef.current }),
        [],
    );
    const setError = useCallback(
        (code: string | null) =>
            setFailure(code ? { code, qid: qidRef.current } : null),
        [],
    );
    const { state, status, send } = useTurboTrivia(
        serviceReady ? wsUrl : null,
        'player',
        i18n.language,
        onError,
        onEvent,
    );
    useEffect(() => {
        qidRef.current = state.quiz?.qid;
    }, [state.quiz?.qid]);
    // A refused answer (e.g. too_early) belongs to its question only.
    const error =
        failure && failure.qid === state.quiz?.qid ? failure.code : null;
    const online = status === 'online';
    const act = (msg: Record<string, unknown>): boolean => {
        setError(null);
        const ok = send(msg);
        if (!ok) {
            setError('unknown');
        }
        return ok;
    };
    const join = useCallback(
        (code: string) =>
            send({
                t: 'join_room',
                room_code: code,
                player_id: player.id,
                avatar: player.character ?? null,
            }),
        [send, player.id, player.character],
    );

    // Invite link / QR: join once connected.
    const joined = useRef(false);
    useEffect(() => {
        if (!online || joined.current || !pin) {
            return;
        }
        joined.current = true;
        if (state.pin !== pin) {
            join(pin);
        }
    }, [online, pin, state.pin, join]);

    // Keep the room PIN in the address bar so a reload rejoins.
    useEffect(() => {
        const path = state.pin
            ? `/play/turbo-trivia/${state.pin}`
            : '/play/turbo-trivia';
        if (window.location.pathname !== path) {
            window.history.replaceState(window.history.state, '', path);
        }
    }, [state.pin]);

    useAdMoments(
        state.phase === 'RACE'
            ? 'playing'
            : state.phase === 'GAME_OVER'
              ? 'done'
              : 'idle',
        { muted, won: state.result?.won ?? false },
    );

    let body;
    if (!serviceReady || status === 'offline') {
        body = (
            <Panel className="flex flex-col items-center gap-3 text-center font-bold">
                <WifiOff className="size-10" aria-hidden="true" />
                {t('mini.unavailable')}
            </Panel>
        );
    } else if (state.phase === 'NONE' || !state.pin) {
        body = (
            <JoinPanel
                name={player.name}
                status={status}
                error={error}
                initialPin={pin ?? ''}
                closed={state.closed}
                onJoin={(code) => {
                    setError(null);
                    if (!join(code)) {
                        setError('unknown');
                    }
                }}
            />
        );
    } else if (state.phase === 'LOBBY') {
        body = (
            <Panel
                className="flex flex-col items-center gap-4 text-center"
                data-testid="tt-waiting"
            >
                <ConnectionBadge status={status} />
                <span className="size-28">
                    <PlayerAvatar
                        character={player.character}
                        seat={player.id}
                        walking
                    />
                </span>
                <p className="font-display text-xl font-black">{player.name}</p>
                <span className="rounded-xl border-2 border-[#1f2a44] bg-[#FFFDE6] px-3 py-1.5 font-display text-sm font-black tracking-widest">
                    PIN {state.pin}
                </span>
                <p className="text-sm font-bold text-slate-700">
                    {t('turboTrivia.controller.waitingStart')}
                </p>
                <p className="rounded-2xl border-2 border-dashed border-[#1f2a44] px-3 py-2 text-xs font-bold text-slate-600">
                    {t('turboTrivia.rules')}
                </p>
                <RoomError code={error} />
                <LeaveButton onLeave={() => act({ t: 'leave_room' })} />
            </Panel>
        );
    } else if (state.phase === 'GAME_OVER') {
        body = <ResultPanel state={state} />;
    } else {
        body = (
            <RacePad
                state={state}
                error={error}
                act={act}
                hitFlash={hitFlash}
            />
        );
    }

    return (
        <TurboShell
            title={t('turboTrivia.title')}
            testId="turbo-trivia-controller"
            role="player"
            phase={state.phase}
            muted={muted}
            onToggleMuted={toggleMuted}
            extra={
                <span
                    className="hidden min-h-11 items-center gap-1.5 rounded-xl border-2 border-[#1f2a44] bg-[#ffd93d] px-3 text-sm font-black sm:inline-flex"
                    data-testid="tt-total-points"
                >
                    <Coins className="size-4" aria-hidden="true" />
                    {t('mini.points', {
                        count:
                            points +
                            (state.phase === 'GAME_OVER'
                                ? (state.result?.points ?? 0)
                                : 0),
                    })}
                </span>
            }
        >
            <GameAdStrip />
            {toast && (
                <div
                    key={toast.id}
                    role="status"
                    className={cn(
                        'fixed inset-x-3 top-20 z-40 mx-auto max-w-md rounded-2xl border-3 border-[#1f2a44] px-4 py-3 text-center font-display text-lg font-black shadow-[4px_4px_0px_#1f2a44]',
                        toast.tone === 'good' && 'bg-[#bbf7d0]',
                        toast.tone === 'bad' && 'bg-[#fecdd3]',
                        toast.tone === 'info' && 'bg-[#e0f2fe]',
                    )}
                    data-testid="tt-toast"
                    data-tone={toast.tone}
                >
                    {toast.text}
                </div>
            )}
            {body}
            {(state.phase === 'NONE' || state.phase === 'LOBBY') && (
                <HowToPlay className="mx-auto w-full max-w-xl" />
            )}
        </TurboShell>
    );
}

type Act = (msg: Record<string, unknown>) => boolean;

function JoinPanel({
    name,
    status,
    error,
    initialPin,
    closed,
    onJoin,
}: {
    name: string;
    status: ReturnType<typeof useTurboTrivia>['status'];
    error: string | null;
    initialPin: string;
    closed?: string;
    onJoin: (pin: string) => void;
}) {
    const { t } = useTranslations();
    const [value, setValue] = useState(initialPin);
    const online = status === 'online';
    const submit = (event: FormEvent) => {
        event.preventDefault();
        if (value.length === 6) {
            onJoin(value);
        }
    };
    return (
        <Panel className="flex flex-col items-center gap-4 text-center">
            <ConnectionBadge status={status} />
            <p className="text-sm font-bold text-slate-700">
                {t('turboTrivia.controller.playerIntro', { name })}
            </p>
            <form
                onSubmit={submit}
                className="flex w-full max-w-sm items-end gap-2 text-left"
            >
                <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs font-black">
                    {t('turboTrivia.controller.pinLabel')}
                    <input
                        value={value}
                        onChange={(e) =>
                            setValue(
                                e.target.value.replace(/\D/g, '').slice(0, 6),
                            )
                        }
                        inputMode="numeric"
                        autoComplete="off"
                        maxLength={6}
                        placeholder={t('turboTrivia.controller.pinPlaceholder')}
                        data-testid="tt-pin-input"
                        className="min-h-14 rounded-xl border-2 border-[#1f2a44] bg-white px-3.5 text-center font-display text-2xl tracking-[0.3em] outline-none focus-visible:ring-4 focus-visible:ring-[#e11d48]/40"
                    />
                </label>
                <Button
                    type="submit"
                    disabled={!online || value.length !== 6}
                    data-testid="tt-join"
                    className="min-h-14 shrink-0 rounded-xl border-2 border-[#1f2a44] bg-[#1f2a44] px-4 font-display font-black text-white shadow-[3px_3px_0px_#e11d48] disabled:opacity-50"
                >
                    <LogIn className="size-4" />
                    {t('turboTrivia.controller.join')}
                </Button>
            </form>
            {closed && closed !== 'idle' && (
                <p className="text-xs font-bold text-slate-600">
                    {t('turboTrivia.arena.roomClosed')}
                </p>
            )}
            <RoomError code={error} />
            <button
                type="button"
                onClick={() => router.visit('/games/turbo-trivia')}
                className="min-h-11 rounded-xl px-3 text-xs font-black text-slate-600 underline-offset-4 hover:underline"
            >
                {t('turboTrivia.switchRole')}
            </button>
        </Panel>
    );
}

function LeaveButton({ onLeave }: { onLeave: () => void }) {
    const { t } = useTranslations();
    return (
        <Button
            variant="outline"
            onClick={onLeave}
            data-testid="tt-leave"
            className="min-h-11 rounded-2xl border-2 border-[#1f2a44] bg-white px-4 font-black text-[#1f2a44]"
        >
            <DoorOpen className="size-4" />
            {t('turboTrivia.controller.leave')}
        </Button>
    );
}

const EFFECT_TONE: Record<TurboEffect, string> = {
    NITRO: '#f97316',
    STUTTER: '#64748b',
    SPIN: '#a16207',
    STAGGER: '#b91c1c',
    SHRINK: '#6d28d9',
    SHIELD: '#0369a1',
};

function RacePad({
    state,
    error,
    act,
    hitFlash,
}: {
    state: TurboState;
    error: string | null;
    act: Act;
    hitFlash: number;
}) {
    const { t } = useTranslations();
    const you = state.you;
    const quiz = state.quiz;
    const left = useQuestionLeft(state);
    const [picked, setPicked] = useState<{
        qid: number;
        choice: number;
    } | null>(null);
    const counting = state.phase === 'COUNTDOWN';
    const speed = you?.speed ?? 0;
    const lap = you?.lap ?? 1;
    const answered = Boolean(you?.answered) || picked?.qid === quiz?.qid;
    const myChoice = picked?.qid === quiz?.qid ? picked?.choice : you?.choice;
    // Release the optimistic lock when the referee refused the answer.
    const locked =
        answered && !(error && picked?.qid === quiz?.qid && !you?.answered);

    return (
        <div
            className={cn(
                'flex flex-col gap-3',
                hitFlash > 0 && 'tt-screen-hit',
            )}
            key={hitFlash}
            data-testid="tt-pad"
        >
            <Panel className="grid grid-cols-3 gap-2 !p-3 text-center">
                <Stat
                    label={t('turboTrivia.controller.position')}
                    value={`${you?.rank ?? '–'}/${you?.of ?? state.players.length}`}
                    icon={Trophy}
                    testId="tt-rank"
                />
                <Stat
                    label={t('turboTrivia.controller.speed')}
                    value={t('turboTrivia.controller.speedValue', { speed })}
                    icon={Gauge}
                    testId="tt-speed"
                    tone={
                        speed >= 100
                            ? '#f97316'
                            : speed === 0
                              ? '#b91c1c'
                              : undefined
                    }
                />
                <Stat
                    label={t('turboTrivia.controller.lap')}
                    value={`${Math.min(lap, state.laps)}/${state.laps}`}
                    icon={Flag}
                    testId="tt-my-lap"
                />
                <div
                    className="col-span-3 h-2.5 overflow-hidden rounded-full border-2 border-[#1f2a44] bg-slate-100"
                    aria-hidden="true"
                >
                    <div
                        className="h-full transition-[width] duration-300 ease-out"
                        style={{
                            width: `${(Math.min(120, speed) / 120) * 100}%`,
                            background: speed >= 100 ? '#f97316' : ACCENT,
                        }}
                    />
                </div>
                {(you?.fx.length ?? 0) > 0 && (
                    <div
                        className="col-span-3 flex flex-wrap justify-center gap-1.5"
                        data-testid="tt-effects"
                    >
                        {you!.fx.map((fx) => (
                            <span
                                key={fx}
                                className="rounded-full px-2.5 py-1 text-xs font-black text-white"
                                style={{ background: EFFECT_TONE[fx] }}
                            >
                                {t(`turboTrivia.effects.${fx}`)}
                            </span>
                        ))}
                    </div>
                )}
            </Panel>

            {counting ? (
                <Panel className="flex flex-col items-center gap-3 text-center">
                    <p className="tt-countdown font-display text-4xl font-black">
                        {t('turboTrivia.countdown')}
                    </p>
                    <AdSlot
                        placement="arena.loading"
                        className="w-full max-w-xs"
                    />
                </Panel>
            ) : you?.finished ? (
                <Panel
                    className="flex flex-col items-center gap-2 text-center"
                    data-testid="tt-finished"
                >
                    <Flag className="size-10" aria-hidden="true" />
                    <p className="font-display text-2xl font-black">
                        {t('turboTrivia.controller.finished', {
                            place: you.rank,
                        })}
                    </p>
                    <p className="text-sm font-bold text-slate-600">
                        {t('turboTrivia.controller.finishedWait')}
                    </p>
                </Panel>
            ) : quiz && quiz.stage !== 'DONE' ? (
                <Panel
                    className="flex flex-col gap-3 !p-4"
                    data-testid="tt-card"
                    data-stage={quiz.stage}
                >
                    <div className="flex items-center justify-between gap-2 text-xs font-black text-slate-600">
                        <span>
                            {t('turboTrivia.race.question', {
                                number: quiz.number,
                                total: state.total,
                            })}
                        </span>
                        <span
                            className="tabular-nums"
                            data-testid="tt-time-left"
                        >
                            {quiz.stage === 'QUESTION'
                                ? t('turboTrivia.race.secondsLeft', {
                                      seconds: Math.ceil(left / 1000),
                                  })
                                : t('turboTrivia.controller.timeUp')}
                        </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                        <div
                            className="h-full rounded-full bg-[#e11d48] transition-[width] duration-200 ease-linear"
                            style={{
                                width: `${quiz.stage === 'QUESTION' && quiz.time_limit > 0 ? (left / quiz.time_limit) * 100 : 0}%`,
                            }}
                        />
                    </div>
                    <p
                        className="font-display text-xl leading-snug font-black sm:text-2xl"
                        data-testid="tt-prompt"
                    >
                        {quiz.question.text}
                    </p>
                    <div className="grid grid-cols-1 gap-2 min-[400px]:grid-cols-2">
                        {quiz.options.map((option, i) => {
                            const reveal = quiz.stage === 'REVEAL';
                            const correct = reveal && quiz.correct_index === i;
                            const mine = myChoice === i;
                            const dimmed =
                                (locked || reveal) && !mine && !correct;
                            return (
                                <button
                                    key={i}
                                    type="button"
                                    disabled={
                                        locked || quiz.stage !== 'QUESTION'
                                    }
                                    onClick={() => {
                                        setPicked({ qid: quiz.qid, choice: i });
                                        act({
                                            t: 'submit_answer',
                                            qid: quiz.qid,
                                            choice_index: i,
                                        });
                                    }}
                                    aria-label={t(
                                        'turboTrivia.controller.answerLabel',
                                        {
                                            letter: LETTERS[i],
                                            text: option,
                                        },
                                    )}
                                    data-testid={`tt-option-${i}`}
                                    data-correct={correct ? 'true' : undefined}
                                    data-mine={mine ? 'true' : undefined}
                                    className={cn(
                                        'tt-pad flex min-h-16 min-w-0 items-center gap-2 rounded-2xl border-3 border-[#1f2a44] px-3 py-2 text-left font-bold text-white shadow-[3px_3px_0px_#1f2a44] disabled:cursor-default',
                                        dimmed &&
                                            'border-[#1f2a44]/40 !bg-slate-100 text-slate-700 shadow-none',
                                        mine &&
                                            'ring-4 ring-[#facc15] ring-inset',
                                        reveal &&
                                            correct &&
                                            'ring-4 ring-[#86efac] ring-inset',
                                    )}
                                    style={
                                        dimmed
                                            ? undefined
                                            : { background: OPTION_TONES[i] }
                                    }
                                >
                                    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white font-display font-black text-[#1f2a44]">
                                        {LETTERS[i]}
                                    </span>
                                    <span className="min-w-0 break-words">
                                        {option}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                    {quiz.stage === 'REVEAL' &&
                        quiz.correct_index !== undefined && (
                            <p className="rounded-xl border-2 border-[#1f2a44] bg-[#dcfce7] px-3 py-2 text-sm font-bold">
                                {t('turboTrivia.controller.correctWas', {
                                    answer: quiz.options[quiz.correct_index],
                                })}
                            </p>
                        )}
                    {locked && quiz.stage === 'QUESTION' && (
                        <p className="text-center text-sm font-bold text-slate-600">
                            {t('turboTrivia.controller.waitNext')}
                        </p>
                    )}
                </Panel>
            ) : (
                <Panel className="text-center font-display text-lg font-black">
                    {t('turboTrivia.controller.sprint')}
                </Panel>
            )}

            <ItemBar
                items={you?.items ?? []}
                disabled={counting || Boolean(you?.finished)}
                onUse={(item) => {
                    vibrate(50);
                    act({ t: 'use_item', item });
                }}
            />
            <RoomError code={error} />
        </div>
    );
}

function Stat({
    label,
    value,
    icon: Icon,
    testId,
    tone,
}: {
    label: string;
    value: string;
    icon: typeof Trophy;
    testId: string;
    tone?: string;
}) {
    return (
        <div className="flex min-w-0 flex-col items-center gap-0.5">
            <span className="flex items-center gap-1 text-[11px] font-black text-slate-600 uppercase">
                <Icon className="size-3.5" aria-hidden="true" />
                {label}
            </span>
            <span
                className="font-display text-lg leading-tight font-black tabular-nums sm:text-xl"
                style={tone ? { color: tone } : undefined}
                data-testid={testId}
            >
                {value}
            </span>
        </div>
    );
}

function ItemBar({
    items,
    disabled,
    onUse,
}: {
    items: TurboItem[];
    disabled: boolean;
    onUse: (item: TurboItem) => void;
}) {
    const { t } = useTranslations();
    const slots = Array.from({ length: MAX_ITEMS }, (_, i) => items[i] ?? null);
    return (
        <Panel
            className="sticky bottom-2 z-20 flex flex-col gap-2 !p-3"
            data-testid="tt-items"
        >
            <h2 className="flex items-center gap-1.5 text-xs font-black text-slate-600 uppercase">
                <Package className="size-4" aria-hidden="true" />
                {t('turboTrivia.controller.yourItems')}
            </h2>
            <div className="grid grid-cols-2 gap-2">
                {slots.map((item, i) => {
                    if (!item) {
                        return (
                            <div
                                key={`empty-${i}`}
                                className="grid min-h-14 place-items-center rounded-2xl border-2 border-dashed border-[#1f2a44]/40 px-2 text-center text-xs font-bold text-slate-600"
                            >
                                {t('turboTrivia.controller.emptySlot')}
                            </div>
                        );
                    }
                    const { icon: Icon, tone } = ITEM_STYLE[item];
                    return (
                        <button
                            key={`${item}-${i}`}
                            type="button"
                            disabled={disabled}
                            onClick={() => onUse(item)}
                            aria-label={t('turboTrivia.controller.useItem', {
                                item: t(`turboTrivia.items.${item}`),
                                help: t(`turboTrivia.itemHelp.${item}`),
                            })}
                            data-testid={`tt-item-${item}`}
                            className="tt-pad flex min-h-14 min-w-0 flex-col items-center justify-center gap-0.5 rounded-2xl border-3 border-[#1f2a44] px-2 py-2 text-white shadow-[3px_3px_0px_#1f2a44] disabled:opacity-50"
                            style={{ background: tone }}
                        >
                            <Icon className="size-7" aria-hidden="true" />
                            <span className="font-display text-sm leading-tight font-black">
                                {t(`turboTrivia.items.${item}`)}
                            </span>
                            <span className="text-[11px] leading-tight font-bold text-white/90">
                                {t(`turboTrivia.itemHelp.${item}`)}
                            </span>
                        </button>
                    );
                })}
            </div>
            {items.length === 0 && (
                <p className="text-center text-xs font-bold text-slate-600">
                    {t('turboTrivia.controller.noItems')}
                </p>
            )}
        </Panel>
    );
}

function ResultPanel({ state }: { state: TurboState }) {
    const { t } = useTranslations();
    const result = state.result;
    return (
        <Panel className="flex flex-col gap-4">
            {result && (
                <div
                    className="flex flex-col items-center gap-1 text-center"
                    data-testid="tt-result"
                >
                    <p className="font-display text-2xl font-black">
                        {result.won
                            ? t('turboTrivia.result.youWon')
                            : t('turboTrivia.result.yourRank', {
                                  rank: result.rank,
                                  total: result.total,
                              })}
                    </p>
                    <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-[#1f2a44] bg-[#ffd93d] px-3 py-1 font-display font-black">
                        <Coins className="size-4" aria-hidden="true" />
                        {t('turboTrivia.result.earned', {
                            points: result.points,
                        })}
                    </span>
                </div>
            )}
            <Podium state={state} youId={result?.user_id} />
            <AdSlot
                placement="arena.result"
                className="mx-auto w-full max-w-md"
            />
        </Panel>
    );
}
