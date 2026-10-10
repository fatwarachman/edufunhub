import AdSlot from '@/components/ads/ad-slot';
import GameAdStrip from '@/components/ads/game-ad-strip';
import { BoardCanvas, PiecePreview } from '@/components/block-battle/board';
import { HowToPlay } from '@/components/block-battle/how-to-play';
import {
    BlockShell,
    finaleScore,
    FortressBoard,
    gameClock,
    LETTERS,
    MODE_STYLE,
    MonsterBar,
    OPTION_TONES,
    Panel,
    Podium,
    StrengthMeter,
    useBlockAudio,
    useNow,
    useQuestionLeft,
    useRemaining,
    vibrate,
} from '@/components/block-battle/shared';
import { GameFinale, podiumStandings } from '@/components/game-finale';
import { RoomLeaveControl } from '@/components/multiplayer/host-controls';
import {
    ConnectionBadge,
    GamePinForm,
    RoomError,
} from '@/components/multiplayer/room';
import { PlayerAvatar } from '@/components/player-avatar';
import { QuestionMedia } from '@/components/question-media';
import {
    type BBAction,
    type BBBoard,
    type BBReward,
    type BBState,
    useBlockBattle,
} from '@/hooks/use-block-battle';
import { useTranslations } from '@/hooks/use-translations';
import { useAdMoments } from '@/lib/ads';
import { type CharacterLook } from '@/lib/character/draw-character';
import { cn } from '@/lib/utils';
import { router } from '@inertiajs/react';
import {
    ArrowDown,
    ArrowLeft,
    ArrowRight,
    ChevronsDown,
    Coins,
    Eye,
    Hammer,
    RotateCw,
    Skull,
    Swords,
    Timer,
    TriangleAlert,
    WifiOff,
} from 'lucide-react';
import {
    type PointerEvent as ReactPointerEvent,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import '../../../../css/block-battle.css';

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

type Toast = { id: number; tone: 'good' | 'bad' | 'info'; text: string };
type Act = (msg: Record<string, unknown>) => boolean;

/** Student phone controller: own board, quiz, rewards, touch controls. */
export default function BlockBattleController({
    player,
    points,
    serviceReady,
    wsUrl,
    pin,
}: ControllerProps) {
    const { t, i18n } = useTranslations();
    const { play, muted, toggleMuted } = useBlockAudio();
    const [error, setError] = useState<string | null>(null);
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
                        sound('correct');
                        vibrate(50);
                    } else {
                        sound('wrong');
                        vibrate([120, 60, 120]);
                    }
                    break;
                case 'reward_result':
                    sound('reward');
                    show(
                        'good',
                        msg.reward === 'ATTACK'
                            ? tr('blockBattle.rewards.attackSent', {
                                  name:
                                      (msg.target as { name?: string })?.name ??
                                      '',
                                  lines: (msg.lines as number) ?? 2,
                              })
                            : tr('blockBattle.rewards.ipieceReady'),
                    );
                    break;
                case 'attack':
                    // Only the victim feels it; the sender heard `reward`/clear.
                    if ((msg.to as { id?: number })?.id === player.id) {
                        sound('garbage');
                        vibrate([160, 60, 160]);
                        setHitFlash(Date.now());
                        show(
                            'bad',
                            tr('blockBattle.events.attackedBy', {
                                name: (msg.from as { name?: string })?.name,
                                lines: msg.lines,
                            }),
                        );
                    }
                    break;
                case 'ko':
                    if ((msg.user as { id?: number })?.id === player.id) {
                        sound('ko');
                        vibrate([300, 100, 300]);
                    } else if ((msg.by as { id?: number })?.id === player.id) {
                        sound('reward');
                        show(
                            'good',
                            tr('blockBattle.events.youKo', {
                                name: (msg.user as { name?: string })?.name,
                            }),
                        );
                    }
                    break;
                case 'word':
                    sound('explode');
                    vibrate(60);
                    show(
                        'good',
                        tr('blockBattle.events.yourWord', {
                            word: msg.word,
                            points: msg.points,
                            combo: msg.combo,
                        }),
                    );
                    break;
                case 'your_turn':
                    sound('turn');
                    vibrate([80, 40, 80]);
                    show('info', tr('blockBattle.controller.yourTurn'));
                    break;
                case 'monster_hit':
                    sound('monster');
                    break;
                case 'podium_result':
                    sound('win');
                    break;
            }
        },
        [show, player.id],
    );
    const onError = useCallback((code: string) => setError(code), []);
    const { state, status, send, choose } = useBlockBattle(
        serviceReady ? wsUrl : null,
        'player',
        i18n.language,
        onError,
        onEvent,
    );
    const online = status === 'online';
    const act: Act = useCallback(
        (msg) => {
            setError(null);
            const ok = send(msg);
            if (!ok) {
                setError('unknown');
            }
            return ok;
        },
        [send],
    );
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
            ? `/play/block-battle/${state.pin}`
            : '/play/block-battle';
        if (window.location.pathname !== path) {
            window.history.replaceState(window.history.state, '', path);
        }
    }, [state.pin]);

    // Board sounds: cleared lines and incoming garbage.
    const lines = state.board?.lines ?? 0;
    const lastLines = useRef(lines);
    useEffect(() => {
        const gained = lines - lastLines.current;
        lastLines.current = lines;
        if (gained >= 4) {
            playRef.current('tetris');
            vibrate(80);
        } else if (gained > 0) {
            playRef.current('clear');
        }
    }, [lines]);

    const won =
        state.mode === 'FORTRESS'
            ? (state.team?.won ?? false)
            : (state.result?.won ?? false);
    useAdMoments(
        state.phase === 'PLAYING'
            ? 'playing'
            : state.phase === 'GAME_OVER'
              ? 'done'
              : 'idle',
        { muted, won },
    );

    const playing = state.phase === 'PLAYING' || state.phase === 'COUNTDOWN';
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
        const ModeIcon = MODE_STYLE[state.mode].icon;
        body = (
            <Panel
                className="flex flex-col items-center gap-4 text-center"
                data-testid="bb-waiting"
            >
                <ConnectionBadge status={status} />
                <span className="size-28">
                    <PlayerAvatar
                        character={player.character}
                        seat={player.id}
                        userId={player.id}
                        walking
                    />
                </span>
                <p className="font-display text-xl font-black">{player.name}</p>
                <div className="flex flex-wrap justify-center gap-2">
                    <span className="rounded-xl border-2 border-[#1f2a44] bg-[#FFFDE6] px-3 py-1.5 font-display text-sm font-black tracking-widest">
                        PIN {state.pin}
                    </span>
                    <span
                        className="inline-flex items-center gap-1.5 rounded-xl border-2 border-[#1f2a44] px-3 py-1.5 text-sm font-black text-white"
                        style={{ background: MODE_STYLE[state.mode].tone }}
                        data-testid="bb-lobby-mode"
                    >
                        <ModeIcon className="size-4" aria-hidden="true" />
                        {t(`blockBattle.modes.${state.mode}.title`)}
                    </span>
                </div>
                <p className="text-sm font-bold text-slate-700">
                    {t(`blockBattle.modes.${state.mode}.desc`)}
                </p>
                <p className="text-sm font-bold text-slate-700">
                    {t('blockBattle.controller.waitingStart')}
                </p>
                <RoomError code={error} />
                <RoomLeaveControl
                    isHost={false}
                    onLeave={() => act({ t: 'leave_room' })}
                    onStop={() => act({ t: 'leave_room' })}
                    testId="bb-leave"
                />
            </Panel>
        );
    } else if (state.phase === 'GAME_OVER') {
        body = <ResultPanel state={state} />;
    } else if (state.mode === 'FORTRESS') {
        body = (
            <FortressPad
                state={state}
                youId={player.id}
                error={error}
                act={act}
                choose={choose}
                play={play}
            />
        );
    } else {
        body = (
            <PlayPad
                state={state}
                error={error}
                act={act}
                choose={choose}
                play={play}
                hitFlash={hitFlash}
            />
        );
    }

    return (
        <BlockShell
            title={t('blockBattle.title')}
            testId="bb-controller"
            role="player"
            phase={state.phase}
            muted={muted}
            onToggleMuted={toggleMuted}
            compact={playing}
            wide={playing}
            extra={
                <span
                    className="hidden min-h-11 items-center gap-1.5 rounded-xl border-2 border-[#1f2a44] bg-[#ffd93d] px-3 text-sm font-black sm:inline-flex"
                    data-testid="bb-total-points"
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
                        'pointer-events-none fixed inset-x-3 top-16 z-40 mx-auto max-w-md rounded-2xl border-3 border-[#1f2a44] px-4 py-2 text-center font-display text-base font-black shadow-[4px_4px_0px_#1f2a44]',
                        toast.tone === 'good' && 'bg-[#bbf7d0]',
                        toast.tone === 'bad' && 'bg-[#fecdd3]',
                        toast.tone === 'info' && 'bg-[#e0f2fe]',
                    )}
                    data-testid="bb-toast"
                    data-tone={toast.tone}
                >
                    {toast.text}
                </div>
            )}
            {body}
            {(state.phase === 'NONE' || state.phase === 'LOBBY') && (
                <HowToPlay className="mx-auto w-full max-w-xl" />
            )}
            <GameFinale
                game="block-battle"
                done={state.phase === 'GAME_OVER'}
                matchKey={state.pin}
                won={won}
                points={state.result?.points}
                title={
                    state.mode === 'FORTRESS' && state.team
                        ? t(
                              state.team.won
                                  ? 'blockBattle.result.teamWon'
                                  : 'blockBattle.result.teamLost',
                          )
                        : state.podium?.[0] && !won
                          ? t('blockBattle.result.winner', {
                                name: state.podium[0].name,
                            })
                          : undefined
                }
                standings={podiumStandings(
                    state.ranking,
                    player.id,
                    (row) => finaleScore(t, state.mode, row),
                    (row) =>
                        `${t('blockBattle.result.correct')} ${row.correct} · ${t('blockBattle.result.accuracy')} ${row.accuracy}%`,
                )}
            />
        </BlockShell>
    );
}

function JoinPanel({
    name,
    status,
    error,
    initialPin,
    closed,
    onJoin,
}: {
    name: string;
    status: ReturnType<typeof useBlockBattle>['status'];
    error: string | null;
    initialPin: string;
    closed?: string;
    onJoin: (pin: string) => void;
}) {
    const { t } = useTranslations();
    const online = status === 'online';
    return (
        <Panel className="flex flex-col items-center gap-4 text-center">
            <ConnectionBadge status={status} />
            <p className="text-sm font-bold text-slate-700">
                {t('blockBattle.controller.playerIntro', { name })}
            </p>
            <div className="w-full max-w-sm">
                <GamePinForm
                    game="block-battle"
                    online={online}
                    onJoin={onJoin}
                    initialPin={initialPin}
                />
            </div>
            {closed && closed !== 'idle' && (
                <p className="text-xs font-bold text-slate-600">
                    {t('blockBattle.arena.roomClosed')}
                </p>
            )}
            <RoomError code={error} />
            <button
                type="button"
                onClick={() => router.visit('/games/block-battle')}
                className="min-h-11 rounded-xl px-3 text-xs font-black text-slate-600 underline-offset-4 hover:underline"
            >
                {t('blockBattle.switchRole')}
            </button>
        </Panel>
    );
}

type Play = ReturnType<typeof useBlockAudio>['play'];

/** Keys of the desktop keyboard. */
const KEY_ACTIONS: Record<string, BBAction> = {
    ArrowLeft: 'left',
    ArrowRight: 'right',
    ArrowDown: 'soft',
    ArrowUp: 'rotate',
    x: 'rotate',
    X: 'rotate',
    z: 'rotate_ccw',
    Z: 'rotate_ccw',
    ' ': 'hard',
};

/**
 * Sends one `input` per action (the server drops extras above 30/s) and
 * plays the local tick sound. Returns `null` while input is not allowed.
 */
function useInput(act: Act, play: Play, enabled: boolean) {
    const enabledRef = useRef(enabled);
    useEffect(() => {
        enabledRef.current = enabled;
    }, [enabled]);
    return useCallback(
        (action: BBAction) => {
            if (!enabledRef.current) {
                return;
            }
            act({ t: 'input', action });
            if (action === 'hard') {
                play('drop');
                vibrate(25);
            } else if (action === 'rotate' || action === 'rotate_ccw') {
                play('rotate');
            } else {
                play('move');
            }
        },
        [act, play],
    );
}

/** Keyboard controls (arrows, space, Z/X) and 1-4 for answers. */
function useKeyboard(
    input: (action: BBAction) => void,
    answer: (index: number) => void,
) {
    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            const target = event.target as HTMLElement | null;
            if (
                target &&
                (target.tagName === 'INPUT' ||
                    target.tagName === 'TEXTAREA' ||
                    target.isContentEditable)
            ) {
                return;
            }
            if (event.metaKey || event.ctrlKey || event.altKey) {
                return;
            }
            const action = KEY_ACTIONS[event.key];
            if (action) {
                event.preventDefault();
                if (
                    event.repeat &&
                    (action === 'hard' || action.startsWith('rotate'))
                ) {
                    return;
                }
                input(action);
                return;
            }
            if (/^[1-4]$/.test(event.key) && !event.repeat) {
                answer(Number(event.key) - 1);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [input, answer]);
}

/**
 * Swipe gestures on the board: horizontal drag moves one column per cell
 * width, a slow downward drag soft-drops per cell, a fast downward flick
 * hard-drops and a tap rotates.
 */
function useSwipe(input: (action: BBAction) => void, cols: number) {
    const gesture = useRef<{
        id: number;
        x: number;
        y: number;
        lastX: number;
        lastY: number;
        at: number;
        moved: boolean;
        width: number;
    } | null>(null);

    const onPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
        if (event.pointerType === 'mouse' && event.button !== 0) {
            return;
        }
        const width = event.currentTarget.clientWidth / cols;
        gesture.current = {
            id: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            lastX: event.clientX,
            lastY: event.clientY,
            at: performance.now(),
            moved: false,
            width: Math.max(12, width),
        };
        event.currentTarget.setPointerCapture?.(event.pointerId);
    };
    const onPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
        const g = gesture.current;
        if (!g || g.id !== event.pointerId) {
            return;
        }
        const step = g.width;
        while (event.clientX - g.lastX >= step) {
            g.lastX += step;
            g.moved = true;
            input('right');
        }
        while (g.lastX - event.clientX >= step) {
            g.lastX -= step;
            g.moved = true;
            input('left');
        }
        const elapsed = performance.now() - g.at;
        const dy = event.clientY - g.y;
        // Slow downward drag: soft drop one row per cell height.
        if (elapsed > 180 && event.clientY - g.lastY >= step) {
            g.lastY += step;
            g.moved = true;
            input('soft');
        }
        if (Math.abs(dy) > step * 0.6) {
            g.moved = true;
        }
    };
    const onPointerUp = (event: ReactPointerEvent<HTMLElement>) => {
        const g = gesture.current;
        gesture.current = null;
        if (!g || g.id !== event.pointerId) {
            return;
        }
        const elapsed = performance.now() - g.at;
        const dx = event.clientX - g.x;
        const dy = event.clientY - g.y;
        if (
            dy > g.width * 2 &&
            dy / Math.max(1, elapsed) > 0.6 &&
            dy > Math.abs(dx) * 1.5
        ) {
            input('hard');
        } else if (
            !g.moved &&
            elapsed < 300 &&
            Math.hypot(dx, dy) < g.width * 0.6
        ) {
            input('rotate');
        }
    };
    return {
        onPointerDown,
        onPointerMove,
        onPointerUp,
        onPointerCancel: () => {
            gesture.current = null;
        },
    };
}

/** Hold-to-repeat pad button (left/right/down). */
function PadButton({
    action,
    label,
    input,
    disabled,
    repeat,
    className,
    children,
    testId,
}: {
    action: BBAction;
    label: string;
    input: (action: BBAction) => void;
    disabled?: boolean;
    repeat?: boolean;
    className?: string;
    children: React.ReactNode;
    testId: string;
}) {
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const stop = () => {
        if (timer.current) {
            clearTimeout(timer.current);
            timer.current = null;
        }
    };
    useEffect(() => stop, []);
    return (
        <button
            type="button"
            disabled={disabled}
            aria-label={label}
            title={label}
            data-testid={testId}
            onPointerDown={(event) => {
                event.preventDefault();
                input(action);
                if (!repeat) {
                    return;
                }
                stop();
                const tick = (delay: number) => {
                    timer.current = setTimeout(() => {
                        input(action);
                        tick(60);
                    }, delay);
                };
                tick(170);
            }}
            onPointerUp={stop}
            onPointerLeave={stop}
            onPointerCancel={stop}
            onContextMenu={(event) => event.preventDefault()}
            onKeyDown={(event) => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    input(action);
                }
            }}
            className={cn(
                'bb-pad grid min-h-14 min-w-0 place-items-center rounded-2xl border-3 border-[#1f2a44] bg-white text-[#1f2a44] shadow-[3px_3px_0px_#1f2a44] disabled:opacity-40',
                className,
            )}
        >
            {children}
        </button>
    );
}

function Controls({
    input,
    disabled,
}: {
    input: (action: BBAction) => void;
    disabled: boolean;
}) {
    const { t } = useTranslations();
    return (
        <div
            className="grid shrink-0 grid-cols-5 gap-1.5"
            data-testid="bb-controls"
        >
            <PadButton
                action="left"
                label={t('blockBattle.controller.left')}
                input={input}
                disabled={disabled}
                repeat
                testId="bb-btn-left"
            >
                <ArrowLeft className="size-7" aria-hidden="true" />
            </PadButton>
            <PadButton
                action="rotate"
                label={t('blockBattle.controller.rotate')}
                input={input}
                disabled={disabled}
                testId="bb-btn-rotate"
            >
                <RotateCw className="size-7" aria-hidden="true" />
            </PadButton>
            <PadButton
                action="right"
                label={t('blockBattle.controller.right')}
                input={input}
                disabled={disabled}
                repeat
                testId="bb-btn-right"
            >
                <ArrowRight className="size-7" aria-hidden="true" />
            </PadButton>
            <PadButton
                action="soft"
                label={t('blockBattle.controller.soft')}
                input={input}
                disabled={disabled}
                repeat
                testId="bb-btn-soft"
            >
                <ArrowDown className="size-7" aria-hidden="true" />
            </PadButton>
            <PadButton
                action="hard"
                label={t('blockBattle.controller.hard')}
                input={input}
                disabled={disabled}
                className="!bg-[#ca8a04] !text-white"
                testId="bb-btn-hard"
            >
                <span className="flex flex-col items-center leading-none">
                    <ChevronsDown className="size-6" aria-hidden="true" />
                    <span className="text-[10px] font-black uppercase">
                        {t('blockBattle.controller.hardShort')}
                    </span>
                </span>
            </PadButton>
        </div>
    );
}

/** Quiz panel with 4 colour answer buttons (compact on phones). */
function QuizPanel({
    state,
    act,
    choose,
}: {
    state: BBState;
    act: Act;
    choose: (choice: number) => void;
}) {
    const { t } = useTranslations();
    const question = state.question;
    const answer =
        state.answer?.qid === question?.qid ? state.answer : undefined;
    const left = useQuestionLeft(state);
    if (!question) {
        return (
            <Panel
                className="shrink-0 !p-3 text-center text-sm font-bold text-slate-600"
                data-testid="bb-quiz"
                data-stage="WAIT"
            >
                {t('blockBattle.controller.waitQuestion')}
            </Panel>
        );
    }
    const locked = state.choice !== undefined || Boolean(answer);
    const share =
        question.time_limit_ms > 0 ? left / question.time_limit_ms : 0;
    return (
        <Panel
            className="flex shrink-0 flex-col gap-2 !rounded-2xl !p-2.5 sm:!p-3"
            data-testid="bb-quiz"
            data-stage={answer ? 'REVEAL' : 'QUESTION'}
            data-qid={question.qid}
        >
            <div className="flex items-start gap-2">
                <p
                    className="min-w-0 flex-1 font-display text-base leading-snug font-black [overflow-wrap:anywhere] sm:text-lg"
                    data-testid="bb-question"
                >
                    {question.text}
                </p>
                <span className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-[#1f2a44] px-2 py-0.5 text-xs font-black text-white tabular-nums">
                    <Timer className="size-3.5" aria-hidden="true" />
                    {answer ? '–' : Math.ceil(left / 1000)}
                </span>
            </div>
            <QuestionMedia media={question.media} size="sm" />
            <div className="h-1.5 overflow-hidden rounded-full bg-slate-200">
                <div
                    className="h-full rounded-full bg-[#ca8a04] transition-[width] duration-200 ease-linear"
                    style={{ width: `${answer ? 0 : share * 100}%` }}
                />
            </div>
            <div className="grid grid-cols-2 gap-1.5">
                {question.options.map((option, i) => {
                    const correct = answer?.correct_index === i;
                    const mine = state.choice === i;
                    const dimmed = (locked || answer) && !mine && !correct;
                    return (
                        <button
                            key={i}
                            type="button"
                            disabled={locked}
                            onClick={() => {
                                choose(i);
                                act({
                                    t: 'submit_answer',
                                    qid: question.qid,
                                    choice_index: i,
                                });
                            }}
                            aria-label={t(
                                'blockBattle.controller.answerLabel',
                                {
                                    letter: LETTERS[i],
                                    text: option,
                                },
                            )}
                            data-testid={`bb-answer-${i}`}
                            data-correct={correct ? 'true' : undefined}
                            data-mine={mine ? 'true' : undefined}
                            className={cn(
                                'bb-pad flex min-h-11 min-w-0 items-center gap-1.5 rounded-xl border-2 border-[#1f2a44] px-2 py-1 text-left text-sm leading-tight font-bold text-white disabled:cursor-default',
                                dimmed &&
                                    'border-[#1f2a44]/40 !bg-slate-100 text-slate-700',
                                mine && 'ring-3 ring-[#facc15] ring-inset',
                                correct && 'ring-3 ring-[#86efac] ring-inset',
                            )}
                            style={
                                dimmed
                                    ? undefined
                                    : { background: OPTION_TONES[i] }
                            }
                        >
                            <span className="grid size-6 shrink-0 place-items-center rounded-md bg-white font-display text-xs font-black text-[#1f2a44]">
                                {LETTERS[i]}
                            </span>
                            <span className="min-w-0 [overflow-wrap:anywhere]">
                                {option}
                            </span>
                        </button>
                    );
                })}
            </div>
            {answer && (
                <p
                    className={cn(
                        'rounded-lg border-2 border-[#1f2a44] px-2 py-1 text-center text-xs font-black',
                        answer.correct ? 'bg-[#dcfce7]' : 'bg-[#fee2e2]',
                    )}
                    data-testid="bb-answer-result"
                    data-correct={answer.correct ? 'true' : 'false'}
                >
                    {answer.correct
                        ? t(
                              state.mode === 'FORTRESS'
                                  ? 'blockBattle.controller.correctFortress'
                                  : state.mode === 'WORDS'
                                    ? 'blockBattle.controller.correctWords'
                                    : 'blockBattle.controller.correct',
                          )
                        : t(
                              state.mode === 'FORTRESS'
                                  ? 'blockBattle.controller.wrongFortress'
                                  : 'blockBattle.controller.wrong',
                              {
                                  answer:
                                      question.options[answer.correct_index] ??
                                      '',
                              },
                          )}
                </p>
            )}
        </Panel>
    );
}

/** BATTLE reward choice: next piece I or attack, with a countdown. */
function RewardModal({
    until,
    act,
    play,
}: {
    until: number;
    act: Act;
    play: Play;
}) {
    const { t } = useTranslations();
    const now = useNow(true, 100);
    const [claimed, setClaimed] = useState(false);
    const left = Math.max(0, until - now);
    if (claimed || left <= 0) {
        return null;
    }
    const pick = (reward: BBReward) => {
        setClaimed(true);
        play('reward');
        vibrate(40);
        act({ t: 'claim_reward', reward });
    };
    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-[#1f2a44]/55 p-3 backdrop-blur-[2px]"
            data-testid="bb-reward"
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="bb-reward-title"
                className="bb-pop max-h-[calc(100dvh-1.5rem)] w-full max-w-md overflow-y-auto rounded-3xl border-3 border-[#1f2a44] bg-[#FFFDF7] p-4 shadow-[6px_6px_0px_#1f2a44]"
            >
                <div className="flex items-center justify-between gap-2">
                    <h2
                        id="bb-reward-title"
                        className="font-display text-xl font-black"
                    >
                        {t('blockBattle.rewards.title')}
                    </h2>
                    <span
                        className="rounded-xl bg-[#1f2a44] px-2.5 py-1 font-display text-lg font-black text-white tabular-nums"
                        data-testid="bb-reward-left"
                    >
                        {Math.ceil(left / 1000)}
                    </span>
                </div>
                <p className="mt-1 text-xs font-bold text-slate-600">
                    {t('blockBattle.rewards.hint')}
                </p>
                <div className="mt-3 grid grid-cols-2 gap-3">
                    <button
                        type="button"
                        onClick={() => pick('I_PIECE')}
                        data-testid="bb-reward-ipiece"
                        className="bb-pad flex min-h-32 flex-col items-center justify-center gap-2 rounded-2xl border-3 border-[#1f2a44] bg-[#06b6d4] p-3 text-white shadow-[3px_3px_0px_#1f2a44]"
                    >
                        <PiecePreview type="I" cell={18} />
                        <span className="font-display text-lg leading-tight font-black">
                            {t('blockBattle.rewards.I_PIECE')}
                        </span>
                        <span className="text-[11px] leading-tight font-bold">
                            {t('blockBattle.rewards.I_PIECE_help')}
                        </span>
                    </button>
                    <button
                        type="button"
                        onClick={() => pick('ATTACK')}
                        data-testid="bb-reward-attack"
                        className="bb-pad flex min-h-32 flex-col items-center justify-center gap-2 rounded-2xl border-3 border-[#1f2a44] bg-[#dc2626] p-3 text-white shadow-[3px_3px_0px_#1f2a44]"
                    >
                        <Swords className="size-9" aria-hidden="true" />
                        <span className="font-display text-lg leading-tight font-black">
                            {t('blockBattle.rewards.ATTACK')}
                        </span>
                        <span className="text-[11px] leading-tight font-bold">
                            {t('blockBattle.rewards.ATTACK_help')}
                        </span>
                    </button>
                </div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-200">
                    <div
                        className="h-full bg-[#dc2626] transition-[width] duration-100 ease-linear"
                        style={{
                            width: `${Math.min(100, (left / 6000) * 100)}%`,
                        }}
                    />
                </div>
                <p className="mt-1 text-center text-[11px] font-bold text-slate-600">
                    {t('blockBattle.rewards.auto')}
                </p>
            </div>
        </div>
    );
}

function FxBadges({ board }: { board?: BBBoard }) {
    const { t } = useTranslations();
    if (!board || board.fx.length === 0) {
        return null;
    }
    return (
        <div className="flex flex-col gap-1" data-testid="bb-fx">
            {board.fx.map((fx) => (
                <span
                    key={fx}
                    className={cn(
                        'flex items-center justify-center gap-0.5 rounded-lg px-1 py-0.5 text-center text-[10px] leading-tight font-black text-white',
                        fx === 'EXPOSED' ? 'bg-[#dc2626]' : 'bg-[#7c3aed]',
                    )}
                    data-fx={fx}
                >
                    {fx === 'EXPOSED' ? (
                        <Eye className="size-3 shrink-0" aria-hidden="true" />
                    ) : (
                        <TriangleAlert
                            className="size-3 shrink-0"
                            aria-hidden="true"
                        />
                    )}
                    {t(`blockBattle.fx.${fx}`)}
                </span>
            ))}
        </div>
    );
}

function PlayPad({
    state,
    error,
    act,
    choose,
    play,
    hitFlash,
}: {
    state: BBState;
    error: string | null;
    act: Act;
    choose: (choice: number) => void;
    play: Play;
    hitFlash: number;
}) {
    const { t } = useTranslations();
    const board = state.board;
    const counting = state.phase === 'COUNTDOWN';
    const alive = (board?.alive ?? true) && (state.you?.alive ?? true);
    const input = useInput(act, play, !counting && alive);
    const swipe = useSwipe(input, 10);
    const remaining = useRemaining(state);
    const answer = useCallback(
        (index: number) => {
            const q = state.question;
            if (
                !q ||
                state.choice !== undefined ||
                state.answer?.qid === q.qid
            ) {
                return;
            }
            choose(index);
            act({ t: 'submit_answer', qid: q.qid, choice_index: index });
        },
        [state.question, state.choice, state.answer, choose, act],
    );
    useKeyboard(input, answer);
    const paint = useMemo(
        () => ({
            cols: 10,
            rows: 20,
            cells: board?.cells ?? '.'.repeat(200),
            glyphs: board?.glyphs,
            piece: board?.piece ?? null,
            ghost: board?.ghost ?? [],
            dim: !alive,
        }),
        [board, alive],
    );
    const penalty = board?.fx.includes('PENALTY');
    const penaltyMs = board?.fx_ms.PENALTY;
    const rank = board?.rank || state.you?.rank || 0;

    return (
        <div
            className="bb-play flex flex-col gap-2 lg:mx-auto lg:w-full lg:max-w-5xl lg:flex-row lg:items-stretch"
            data-testid="bb-pad"
        >
            <div className="flex min-h-0 flex-1 flex-col gap-2 lg:flex-none">
                <div className="flex shrink-0 items-center justify-between gap-2 text-xs font-black">
                    <span className="inline-flex items-center gap-1 rounded-lg border-2 border-[#1f2a44] bg-white px-2 py-0.5 tabular-nums">
                        <Timer className="size-3.5" aria-hidden="true" />
                        {gameClock(remaining)}
                    </span>
                    {board?.target && (
                        <span
                            className="min-w-0 truncate rounded-lg border-2 border-[#1f2a44] bg-[#ede9fe] px-2 py-0.5"
                            data-testid="bb-target"
                        >
                            {t(
                                board.target.kind === 'math'
                                    ? 'blockBattle.controller.targetMath'
                                    : 'blockBattle.controller.targetWord',
                                { text: board.target.text },
                            )}
                        </span>
                    )}
                    <span
                        className="rounded-lg border-2 border-[#1f2a44] bg-white px-2 py-0.5 tabular-nums"
                        data-testid="bb-stats"
                    >
                        {state.mode === 'WORDS'
                            ? t('blockBattle.controller.scoreShort', {
                                  score: board?.score ?? 0,
                              })
                            : t('blockBattle.controller.linesShort', {
                                  count: board?.lines ?? 0,
                              })}
                        {board && board.combo > 1 && ` · x${board.combo}`}
                    </span>
                </div>
                <div className="flex min-h-0 flex-1 justify-center gap-2">
                    <div
                        className={cn(
                            'relative flex h-full min-h-0 justify-center',
                            hitFlash > 0 && 'bb-board-hit',
                        )}
                        key={hitFlash}
                    >
                        <BoardCanvas
                            paint={paint}
                            className={cn(
                                'bb-touch h-full max-h-full max-w-full rounded-xl border-3 border-[#1f2a44]',
                                penalty && 'bb-board--penalty',
                                board?.fx.includes('EXPOSED') &&
                                    'bb-board--exposed',
                            )}
                            testId="bb-board"
                            label={t('blockBattle.controller.board')}
                            data-lines={board?.lines ?? 0}
                            data-piece={board?.piece?.type ?? ''}
                            data-alive={alive ? 'true' : 'false'}
                            {...swipe}
                        >
                            {penalty && (
                                <span
                                    className="bb-penalty-banner pointer-events-none absolute inset-x-1 top-1 rounded-lg bg-[#7c3aed] px-2 py-1 text-center text-xs font-black text-white"
                                    data-testid="bb-penalty"
                                >
                                    {t('blockBattle.controller.penalty', {
                                        seconds: Math.ceil(
                                            (penaltyMs ?? 0) / 1000,
                                        ),
                                    })}
                                </span>
                            )}
                            {!alive && (
                                <span
                                    className="absolute inset-0 grid place-items-center p-2"
                                    data-testid="bb-knocked-out"
                                >
                                    <span className="flex flex-col items-center gap-1 rounded-2xl border-3 border-[#1f2a44] bg-white px-3 py-2 text-center">
                                        <Skull
                                            className="size-8 text-[#dc2626]"
                                            aria-hidden="true"
                                        />
                                        <span className="font-display text-lg font-black">
                                            {t('blockBattle.controller.ko', {
                                                rank,
                                            })}
                                        </span>
                                        <span className="text-xs font-bold text-slate-600">
                                            {t('blockBattle.controller.koWait')}
                                        </span>
                                    </span>
                                </span>
                            )}
                            {counting && (
                                <span className="absolute inset-0 grid place-items-center bg-[#1f2a44]/60">
                                    <span className="bb-countdown font-display text-4xl font-black text-white">
                                        {t('blockBattle.countdown')}
                                    </span>
                                </span>
                            )}
                        </BoardCanvas>
                    </div>
                    <div className="flex w-14 shrink-0 flex-col gap-2 sm:w-16">
                        <span className="text-[10px] font-black text-slate-600 uppercase">
                            {t('blockBattle.controller.next')}
                        </span>
                        <div
                            className="flex flex-col items-center gap-2 rounded-xl border-2 border-[#1f2a44] bg-white p-1.5"
                            data-testid="bb-next"
                        >
                            {(board?.next ?? []).slice(0, 3).map((n, i) => (
                                <PiecePreview
                                    key={i}
                                    type={n.type}
                                    glyphs={n.glyphs}
                                    cell={i === 0 ? 11 : 8}
                                />
                            ))}
                        </div>
                        {state.mode === 'BATTLE' && (
                            <div
                                className="flex min-h-16 flex-1 flex-col items-center gap-1"
                                data-testid="bb-pending"
                                data-pending={board?.pending ?? 0}
                            >
                                <span className="text-[10px] font-black text-slate-600 uppercase">
                                    {t('blockBattle.controller.pending')}
                                </span>
                                <span className="relative w-4 flex-1 overflow-hidden rounded-full border-2 border-[#1f2a44] bg-white">
                                    <span
                                        className="absolute inset-x-0 bottom-0 bg-[#6b7280] transition-[height] duration-200"
                                        style={{
                                            height: `${Math.min(1, (board?.pending ?? 0) / 12) * 100}%`,
                                        }}
                                    />
                                </span>
                                <span className="font-display text-sm font-black tabular-nums">
                                    {board?.pending ?? 0}
                                </span>
                            </div>
                        )}
                        <FxBadges board={board} />
                    </div>
                </div>
            </div>
            <div className="flex shrink-0 flex-col gap-2 lg:w-96 lg:justify-end">
                <QuizPanel state={state} act={act} choose={choose} />
                <RoomError code={error} />
                <Controls input={input} disabled={counting || !alive} />
                <p className="hidden text-center text-xs font-bold text-slate-600 lg:block">
                    {t('blockBattle.controller.keyboardHint')}
                </p>
            </div>
            {state.rewardUntil && alive && (
                <RewardModal
                    key={state.rewardUntil}
                    until={state.rewardUntil}
                    act={act}
                    play={play}
                />
            )}
        </div>
    );
}

function FortressPad({
    state,
    youId,
    error,
    act,
    choose,
    play,
}: {
    state: BBState;
    youId: number;
    error: string | null;
    act: Act;
    choose: (choice: number) => void;
    play: Play;
}) {
    const { t } = useTranslations();
    const fortress = state.fortress;
    const now = useNow(true, 200);
    const myTurn = fortress?.turn?.user.id === youId;
    const turnLeft =
        myTurn && state.turnUntil ? Math.max(0, state.turnUntil - now) : 0;
    const input = useInput(act, play, myTurn);
    const swipe = useSwipe(input, fortress?.cols ?? 12);
    const answer = useCallback(
        (index: number) => {
            const q = state.question;
            if (
                !q ||
                state.choice !== undefined ||
                state.answer?.qid === q.qid
            ) {
                return;
            }
            choose(index);
            act({ t: 'submit_answer', qid: q.qid, choice_index: index });
        },
        [state.question, state.choice, state.answer, choose, act],
    );
    useKeyboard(input, answer);
    const position = fortress?.queue.findIndex((q) => q.id === youId) ?? -1;

    return (
        <div
            className="bb-play flex flex-col gap-2 lg:mx-auto lg:w-full lg:max-w-5xl lg:flex-row"
            data-testid="bb-pad"
            data-turn={myTurn ? 'true' : 'false'}
        >
            <div className="flex min-h-0 flex-1 flex-col gap-2">
                {fortress && (
                    <div className="grid shrink-0 grid-cols-2 gap-2 rounded-2xl border-2 border-[#1f2a44] bg-white p-2">
                        <MonsterBar fortress={fortress} />
                        <StrengthMeter fortress={fortress} />
                    </div>
                )}
                <div
                    className={cn(
                        'shrink-0 rounded-xl border-2 border-[#1f2a44] px-3 py-1.5 text-center text-sm font-black',
                        myTurn ? 'bb-turn bg-[#fef08a]' : 'bg-white',
                    )}
                    data-testid="bb-turn-status"
                >
                    {myTurn ? (
                        <span className="flex items-center justify-center gap-1.5">
                            <Hammer className="size-4" aria-hidden="true" />
                            {t('blockBattle.controller.yourTurnLeft', {
                                seconds: Math.ceil(turnLeft / 1000),
                            })}
                        </span>
                    ) : position >= 0 ? (
                        t('blockBattle.controller.queuePosition', {
                            position: position + 1,
                        })
                    ) : fortress?.turn ? (
                        t('blockBattle.controller.building', {
                            name: fortress.turn.user.name,
                        })
                    ) : (
                        t('blockBattle.controller.answerToBuild')
                    )}
                </div>
                <div className="flex min-h-0 flex-1 justify-center">
                    {fortress ? (
                        <div
                            className="flex h-full min-h-0 justify-center"
                            {...swipe}
                        >
                            <FortressBoard
                                fortress={fortress}
                                className={cn(
                                    'bb-touch h-full max-h-full max-w-full',
                                    myTurn && 'ring-4 ring-[#facc15]',
                                )}
                            />
                        </div>
                    ) : (
                        <p className="self-center text-sm font-bold text-slate-600">
                            {t('blockBattle.fortress.building')}
                        </p>
                    )}
                </div>
            </div>
            <div className="flex shrink-0 flex-col gap-2 lg:w-96 lg:justify-end">
                <QuizPanel state={state} act={act} choose={choose} />
                <RoomError code={error} />
                <Controls input={input} disabled={!myTurn} />
            </div>
        </div>
    );
}

function ResultPanel({ state }: { state: BBState }) {
    const { t } = useTranslations();
    const result = state.result;
    return (
        <Panel className="flex flex-col gap-4">
            {result && (
                <div
                    className="flex flex-col items-center gap-1 text-center"
                    data-testid="bb-result"
                >
                    <p className="font-display text-2xl font-black">
                        {state.mode === 'FORTRESS'
                            ? t(
                                  state.team?.won
                                      ? 'blockBattle.result.teamWon'
                                      : 'blockBattle.result.teamLost',
                              )
                            : result.won
                              ? t('blockBattle.result.youWon')
                              : t('blockBattle.result.yourRank', {
                                    rank: result.rank,
                                    total: state.ranking?.length ?? 0,
                                })}
                    </p>
                    <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-[#1f2a44] bg-[#ffd93d] px-3 py-1 font-display font-black">
                        <Coins className="size-4" aria-hidden="true" />
                        {t('blockBattle.result.earned', {
                            points: result.points,
                        })}
                    </span>
                </div>
            )}
            <Podium state={state} youId={state.you?.user_id} />
            <AdSlot
                placement="arena.result"
                className="mx-auto w-full max-w-md"
            />
        </Panel>
    );
}
