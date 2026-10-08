import AdSlot from '@/components/ads/ad-slot';
import GameAdStrip from '@/components/ads/game-ad-strip';
import { BrandLink } from '@/components/brand-link';
import { DigitalClock } from '@/components/digital-clock';
import { GameFinale } from '@/components/game-finale';
import {
    type GameSubject,
    rememberedSubject,
    SubjectFallbackNote,
    SubjectPicker,
} from '@/components/multiplayer/subject-picker';
import { PlayerAvatar } from '@/components/player-avatar';
import { BackButton, NavButton, SiteNav } from '@/components/site-nav';
import { useMyUserId } from '@/hooks/use-chat-socket';
import { useGameAudio } from '@/hooks/use-game-audio';
import {
    type TrainState,
    useTrainConnection,
} from '@/hooks/use-train-connection';
import { useTranslations } from '@/hooks/use-translations';
import { useAdMoments } from '@/lib/ads';
import { type CharacterLook } from '@/lib/character/draw-character';
import { hasGrade, KINDERGARTEN } from '@/lib/grade';
import { cn } from '@/lib/utils';
import { Head } from '@inertiajs/react';
import {
    ChevronLeft,
    ChevronRight,
    Coins,
    GraduationCap,
    Heart,
    Loader2,
    Pause,
    Play,
    RotateCcw,
    TrainFront,
    Trophy,
    Volume2,
    VolumeX,
    Wifi,
    WifiOff,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import '../../../css/knowledge-train.css';

interface TrainPlayer {
    name: string;
    grade: number | null;
    color: string;
    accessory: string;
    character?: CharacterLook;
}

interface KnowledgeTrainProps {
    player: TrainPlayer;
    points: number;
    serviceReady: boolean;
    wsUrl: string | null;
}

const WIDTH = 720;
const HEIGHT = 540;
const HORIZON = 120;
const TRAIN_Y = 440;
const LANES = 3;
const SIGN_COLORS = ['#bceaf2', '#ffd93d', '#ffd6e0'];
const WAGON_COLORS = ['#ff9e44', '#00c9a7', '#845ec2', '#4d8fac', '#ff6584'];

/** Lane centre x at a given screen y (rails converge toward the horizon). */
function laneX(lane: number, y: number): number {
    const t = (y - HORIZON) / (TRAIN_Y - HORIZON);
    const spread = 60 + t * 170;
    return WIDTH / 2 + (lane - 1) * spread;
}

/** Perspective scale at a given screen y. */
function depth(y: number): number {
    return 0.3 + ((y - HORIZON) / (TRAIN_Y - HORIZON)) * 0.7;
}

interface Run {
    lane: number;
    trainX: number;
    questionId: string | null;
    receivedAt: number;
    delay: number;
    approach: number;
    elapsedAtReceive: number;
    sent: boolean;
    sleepers: number;
    flash: { kind: 'correct' | 'wrong'; life: number } | null;
}

/** Shrinks the signboard font as the question gets longer so it always wraps fully. */
function questionSize(text: string): string {
    if (text.length > 160) return 'text-sm sm:text-base';
    if (text.length > 110) return 'text-base sm:text-lg';
    if (text.length > 60) return 'text-lg sm:text-xl';
    return 'text-xl sm:text-2xl';
}

function wrapText(
    ctx: CanvasRenderingContext2D,
    text: string,
    maxWidth: number,
): string[] {
    const words = text.split(' ');
    const lines: string[] = [];
    let line = '';
    for (const word of words) {
        const test = line ? `${line} ${word}` : word;
        if (ctx.measureText(test).width > maxWidth && line) {
            lines.push(line);
            line = word;
        } else {
            line = test;
        }
    }
    if (line) lines.push(line);
    return lines.slice(0, 3);
}

export default function KnowledgeTrain({
    player,
    points,
    serviceReady,
    wsUrl,
}: KnowledgeTrainProps) {
    const { t, i18n } = useTranslations();
    const myId = useMyUserId();
    const [subject, setSubject] = useState<GameSubject>(() =>
        typeof window === 'undefined' ? 'mix' : rememberedSubject(),
    );
    const { play, muted, toggleMuted } = useGameAudio();
    const canvas = useRef<HTMLCanvasElement | null>(null);
    const [state, setState] = useState<TrainState | null>(null);
    const [message, setMessage] = useState('');
    const [earned, setEarned] = useState(0);
    const stateRef = useRef<TrainState | null>(null);
    const run = useRef<Run>({
        lane: 1,
        trainX: laneX(1, TRAIN_Y),
        questionId: null,
        receivedAt: 0,
        delay: 0,
        approach: 9000,
        elapsedAtReceive: 0,
        sent: false,
        sleepers: 0,
        flash: null,
    });
    const reported = useRef<string | null>(null);
    const sendRef = useRef<(msg: Record<string, unknown>) => boolean>(
        () => false,
    );
    const playRef = useRef(play);

    useEffect(() => {
        playRef.current = play;
    }, [play]);

    const handlers = useMemo(
        () => ({
            onState: (next: TrainState) => {
                const r = run.current;
                const q = next.question;
                if (q && q.id !== r.questionId) {
                    r.questionId = q.id;
                    r.receivedAt = performance.now();
                    r.delay = q.delay;
                    r.approach = q.approach_ms;
                    r.elapsedAtReceive = q.elapsed_ms;
                    r.sent = false;
                }
                if (next.feedback) {
                    const good = next.feedback.kind === 'correct';
                    r.flash = { kind: good ? 'correct' : 'wrong', life: 0.8 };
                    playRef.current(good ? 'correct' : 'wrong');
                    const answer = next.feedback.text;
                    setMessage(
                        good
                            ? t('train.feedback.correct', {
                                  score: next.feedback.score,
                              })
                            : t(`train.feedback.${next.feedback.kind}`, {
                                  answer,
                              }),
                    );
                }
                stateRef.current = next;
                setState(next);
            },
            onError: (code: string) => {
                if (code === 'too_early') {
                    run.current.sent = false;
                    return;
                }
                setMessage(t('train.errors.generic'));
            },
        }),
        [t],
    );

    const connection = useTrainConnection(
        serviceReady && hasGrade(player.grade) ? wsUrl : null,
        i18n.language,
        handlers,
    );

    useEffect(() => {
        sendRef.current = connection.send;
    }, [connection.send]);

    const phase = state?.phase ?? 'ready';
    const paused = Boolean(state?.paused);
    const playing = phase === 'question' && !paused;
    useAdMoments(
        phase === 'done' ? 'done' : phase === 'question' ? 'playing' : 'idle',
        { muted, won: state?.result?.passed ?? false },
    );

    useEffect(() => {
        if (phase !== 'done' || !state?.result) {
            return;
        }
        const key = `${state.result.seconds}-${state.result.correct}-${state.score}`;
        if (reported.current === key) {
            return;
        }
        reported.current = key;
        setEarned((value) => value + state.result!.points);
    }, [phase, state?.result, state?.score]);

    const move = useCallback((delta: number) => {
        const r = run.current;
        r.lane = Math.max(0, Math.min(LANES - 1, r.lane + delta));
        playRef.current('step');
    }, []);

    const setLane = useCallback((lane: number) => {
        run.current.lane = Math.max(0, Math.min(LANES - 1, lane));
        playRef.current('step');
    }, []);

    const togglePause = useCallback(() => {
        const current = stateRef.current;
        if (!current || current.phase !== 'question') return;
        sendRef.current({ t: current.paused ? 'resume' : 'pause' });
    }, []);

    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'ArrowLeft' || event.key === 'a') {
                event.preventDefault();
                move(-1);
            } else if (event.key === 'ArrowRight' || event.key === 'd') {
                event.preventDefault();
                move(1);
            } else if (event.key === 'p' || event.key === 'P') {
                togglePause();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [move, togglePause]);

    useEffect(() => {
        const onHide = () => {
            if (document.hidden && stateRef.current?.phase === 'question') {
                sendRef.current({ t: 'pause' });
            }
        };
        document.addEventListener('visibilitychange', onHide);
        return () => document.removeEventListener('visibilitychange', onHide);
    }, []);

    useEffect(() => {
        const element = canvas.current;
        const ctx = element?.getContext('2d');
        if (!element || !ctx) return;
        let frame = 0;
        let last = performance.now();

        const draw = (now: number) => {
            const dt = Math.min(0.05, (now - last) / 1000);
            last = now;
            const r = run.current;
            const st = stateRef.current;
            const q = st?.phase === 'question' ? st.question : undefined;
            const running = Boolean(q) && !st?.paused;

            const targetX = laneX(r.lane, TRAIN_Y);
            r.trainX += (targetX - r.trainX) * Math.min(1, dt * 12);
            if (running) r.sleepers = (r.sleepers + dt * 1.6) % 1;
            if (r.flash) {
                r.flash.life -= dt;
                if (r.flash.life <= 0) r.flash = null;
            }

            let progress = 0;
            if (q) {
                const since = st?.paused ? 0 : now - r.receivedAt;
                const travelled =
                    r.elapsedAtReceive + Math.max(0, since - r.delay);
                progress = Math.min(1, travelled / r.approach);
                if (running && progress >= 1 && !r.sent && since >= r.delay) {
                    r.sent = true;
                    sendRef.current({ t: 'pass', option: r.lane });
                }
            }

            // Sky and ground
            const sky = ctx.createLinearGradient(0, 0, 0, HORIZON);
            sky.addColorStop(0, '#9fd8ef');
            sky.addColorStop(1, '#dff3fb');
            ctx.fillStyle = sky;
            ctx.fillRect(0, 0, WIDTH, HORIZON);
            ctx.fillStyle = '#a8e0a0';
            ctx.fillRect(0, HORIZON, WIDTH, HEIGHT - HORIZON);
            ctx.fillStyle = '#86c97e';
            for (let i = 0; i < 6; i++) {
                ctx.beginPath();
                ctx.arc(80 + i * 120, HORIZON + 4, 40, Math.PI, 0);
                ctx.fill();
            }

            // Rails
            for (let lane = 0; lane < LANES; lane++) {
                for (let s = 0; s < 14; s++) {
                    const y =
                        HORIZON +
                        ((s + r.sleepers) / 14) ** 1.6 * (HEIGHT - HORIZON);
                    const w = 46 * depth(y);
                    ctx.fillStyle = '#8a6a4a';
                    ctx.fillRect(laneX(lane, y) - w, y, w * 2, 4 * depth(y));
                }
                ctx.strokeStyle = '#5b6b7a';
                ctx.lineWidth = 3;
                for (const side of [-1, 1]) {
                    ctx.beginPath();
                    ctx.moveTo(laneX(lane, HORIZON) + side * 10, HORIZON);
                    ctx.lineTo(laneX(lane, HEIGHT) + side * 38, HEIGHT);
                    ctx.stroke();
                }
            }

            // Answer signs
            if (q) {
                const y = HORIZON + progress * (TRAIN_Y - 60 - HORIZON);
                const scale = depth(y);
                q.options.forEach((text, lane) => {
                    const x = laneX(lane, y);
                    const w = 190 * scale;
                    const h = 92 * scale;
                    ctx.fillStyle = '#20364a';
                    ctx.fillRect(x - 3 * scale, y, 6 * scale, h * 0.9);
                    ctx.fillStyle = SIGN_COLORS[lane];
                    ctx.strokeStyle = '#20364a';
                    ctx.lineWidth = 3 * scale;
                    ctx.beginPath();
                    ctx.roundRect(x - w / 2, y - h, w, h, 12 * scale);
                    ctx.fill();
                    ctx.stroke();
                    ctx.fillStyle = '#20364a';
                    ctx.font = `bold ${Math.round(22 * scale)}px system-ui, sans-serif`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    const lines = wrapText(ctx, text, w - 16 * scale);
                    lines.forEach((line, i) => {
                        ctx.fillText(
                            line,
                            x,
                            y -
                                h / 2 +
                                (i - (lines.length - 1) / 2) * 24 * scale,
                        );
                    });
                });
            }

            // Wagons trail behind, then the locomotive
            const wagons = Math.min(st?.wagons ?? 0, 6);
            for (let i = wagons; i >= 1; i--) {
                const y = TRAIN_Y + 34 + i * 26;
                if (y > HEIGHT + 30) continue;
                const s = depth(Math.min(y, HEIGHT));
                ctx.fillStyle = WAGON_COLORS[(i - 1) % WAGON_COLORS.length];
                ctx.strokeStyle = '#20364a';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.roundRect(r.trainX - 44 * s, y - 20, 88 * s, 34, 6);
                ctx.fill();
                ctx.stroke();
            }
            ctx.fillStyle = '#ff6584';
            ctx.strokeStyle = '#20364a';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.roundRect(r.trainX - 46, TRAIN_Y - 30, 92, 70, 10);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.roundRect(r.trainX - 32, TRAIN_Y - 20, 64, 26, 6);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = '#20364a';
            ctx.fillRect(r.trainX - 12, TRAIN_Y - 52, 24, 24);
            ctx.fillStyle = '#ffd93d';
            for (const side of [-1, 1]) {
                ctx.beginPath();
                ctx.arc(r.trainX + side * 26, TRAIN_Y + 22, 8, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
            }

            if (r.flash) {
                ctx.fillStyle =
                    r.flash.kind === 'correct'
                        ? `rgba(0, 201, 167, ${r.flash.life * 0.35})`
                        : `rgba(255, 101, 132, ${r.flash.life * 0.4})`;
                ctx.fillRect(0, 0, WIDTH, HEIGHT);
            }

            frame = requestAnimationFrame(draw);
        };
        frame = requestAnimationFrame(draw);
        return () => cancelAnimationFrame(frame);
    }, []);

    const touchStart = useRef<number | null>(null);
    const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
        touchStart.current = event.clientX;
    };
    const onPointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
        const start = touchStart.current;
        touchStart.current = null;
        if (start === null || !canvas.current) return;
        const delta = event.clientX - start;
        if (Math.abs(delta) > 30) {
            move(delta > 0 ? 1 : -1);
            return;
        }
        const rect = canvas.current.getBoundingClientRect();
        const x = ((event.clientX - rect.left) / rect.width) * WIDTH;
        setLane(x < WIDTH / 3 ? 0 : x < (WIDTH * 2) / 3 ? 1 : 2);
    };

    const gradeLabel = hasGrade(player.grade)
        ? player.grade === KINDERGARTEN
            ? t('player.kindergarten')
            : t('train.grade', { grade: player.grade })
        : t('train.noGrade');
    const online = connection.status === 'online';
    const total = state?.total ?? 10;
    const lives = state?.lives ?? 3;
    const maxLives = state?.max ?? 3;
    const showOverlay = !playing;

    return (
        <div
            className="kt-page flex h-dvh flex-col overflow-hidden bg-[#eef9f1] text-[#20364a]"
            data-testid="train-page"
        >
            <Head title={`${t('train.title')} — EduFunHub`} />
            <header className="kt-header sticky top-0 z-50 flex shrink-0 items-center justify-between gap-2 border-b-2 border-[#20364a] bg-white px-3 py-3 sm:gap-3 sm:px-4">
                <div className="edu-game-brand flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
                    <BackButton
                        href="/portal"
                        label={t('nav.backToPortal')}
                        iconOnly
                    />
                    <BrandLink variant="mark" />
                    <h1 className="flex min-w-0 items-center gap-2 font-display text-lg font-bold sm:text-xl">
                        <TrainFront className="size-6 shrink-0" />
                        <span className="truncate">{t('train.title')}</span>
                    </h1>
                    <DigitalClock className="edu-clock--game" />
                </div>
                <SiteNav compact className="shrink-0" />
            </header>

            <main
                className="kt-main flex min-h-0 w-full flex-1 flex-col gap-2 overflow-y-auto p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:gap-3 sm:p-4 lg:px-8"
                data-testid="train-main"
            >
                <GameAdStrip className="shrink-0" />
                <div className="kt-bars flex shrink-0 flex-col gap-2 sm:gap-3">
                    <div className="kt-toolbar flex shrink-0 flex-wrap items-center gap-2 text-sm font-bold">
                        <span
                            className="inline-flex min-h-11 min-w-0 items-center gap-2 rounded-xl border-2 border-[#20364a] bg-white px-3"
                            data-testid="train-player"
                        >
                            <span className="-my-1 size-9 shrink-0">
                                <PlayerAvatar
                                    character={player.character}
                                    userId={myId}
                                />
                            </span>
                            <span className="truncate">
                                {player.name} • {gradeLabel}
                            </span>
                        </span>
                        <span className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl border-2 border-[#20364a] bg-[#ffd93d] px-3 whitespace-nowrap">
                            <Coins className="size-4" />
                            {t('train.points', { count: points + earned })}
                        </span>
                        {connection.status && (
                            <span
                                className={cn(
                                    'inline-flex min-h-11 items-center gap-1.5 rounded-xl border-2 border-[#20364a] px-3 text-xs',
                                    online ? 'bg-[#c9f5e5]' : 'bg-[#ffe1e1]',
                                )}
                                data-testid="train-connection"
                                data-status={connection.status}
                            >
                                {online ? (
                                    <Wifi className="size-4" />
                                ) : (
                                    <WifiOff className="size-4" />
                                )}
                                <span className="sr-only sm:not-sr-only">
                                    {t(`train.connection.${connection.status}`)}
                                </span>
                            </span>
                        )}
                        <div className="ml-auto flex gap-2">
                            {phase === 'question' && (
                                <button
                                    type="button"
                                    onClick={togglePause}
                                    className="inline-flex size-11 items-center justify-center rounded-xl border-2 border-[#20364a] bg-white"
                                    aria-label={t(
                                        paused ? 'train.resume' : 'train.pause',
                                    )}
                                    data-testid="train-pause"
                                >
                                    {paused ? (
                                        <Play className="size-5" />
                                    ) : (
                                        <Pause className="size-5" />
                                    )}
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={toggleMuted}
                                className="inline-flex size-11 items-center justify-center rounded-xl border-2 border-[#20364a] bg-white"
                                aria-label={t(
                                    muted ? 'sky.unmute' : 'sky.mute',
                                )}
                            >
                                {muted ? (
                                    <VolumeX className="size-5" />
                                ) : (
                                    <Volume2 className="size-5" />
                                )}
                            </button>
                        </div>
                    </div>

                    <div
                        className="kt-hud grid shrink-0 grid-cols-4 gap-1.5 text-xs font-bold sm:gap-2 sm:text-sm"
                        data-testid="train-hud"
                    >
                        <Stat>
                            {t('train.round', {
                                round: Math.min(
                                    (state?.round ?? 0) +
                                        (phase === 'question' ? 1 : 0),
                                    total,
                                ),
                                total,
                            })}
                        </Stat>
                        <Stat>
                            {t('train.score', { score: state?.score ?? 0 })}
                        </Stat>
                        <Stat>
                            <span className="flex items-center gap-0.5">
                                {Array.from({ length: maxLives }, (_, i) => (
                                    <Heart
                                        key={i}
                                        className={cn(
                                            'size-4',
                                            i < lives
                                                ? 'fill-[#ff6584] text-[#ff6584]'
                                                : 'text-[#20364a]/30',
                                        )}
                                    />
                                ))}
                            </span>
                            <span className="sr-only">
                                {t('train.lives', { lives, max: maxLives })}
                            </span>
                        </Stat>
                        <Stat>
                            {t('train.wagons', { count: state?.wagons ?? 0 })}
                            {(state?.streak ?? 0) > 1 && (
                                <span className="text-[#ff6584]">
                                    {' '}
                                    ·{' '}
                                    {t('train.streak', {
                                        count: state?.streak,
                                    })}
                                </span>
                            )}
                        </Stat>
                    </div>
                </div>

                {state?.phase === 'question' && state.subject_fallback && (
                    <SubjectFallbackNote subject={state.subject} />
                )}
                <div
                    className="flex min-h-[220px] flex-1 flex-col items-center gap-0"
                    data-testid="train-stage"
                >
                    <div
                        className="kt-board relative z-10 w-full max-w-3xl shrink-0 px-1"
                        data-testid="train-question"
                        aria-live="polite"
                        aria-atomic="true"
                    >
                        <div className="kt-board__frame rounded-2xl border-2 border-[#20364a] p-1.5 shadow-[3px_4px_0_#20364a]">
                            <div className="rounded-xl border-2 border-[#5a3d22]/40 bg-[#fff4d6] px-3 py-2 text-center sm:px-4 sm:py-2.5">
                                <p
                                    className={cn(
                                        'font-display leading-snug font-bold text-balance break-words',
                                        questionSize(
                                            state?.question?.text ??
                                                t('train.hint'),
                                        ),
                                    )}
                                    data-testid="train-question-text"
                                >
                                    {state?.question?.text ?? t('train.hint')}
                                </p>
                                {message && (
                                    <p
                                        className="mt-0.5 text-xs font-bold text-[#4d6b80] sm:text-sm"
                                        data-testid="train-message"
                                    >
                                        {message}
                                    </p>
                                )}
                            </div>
                        </div>
                        <span
                            className="kt-board__post left-[18%]"
                            aria-hidden
                        />
                        <span
                            className="kt-board__post right-[18%]"
                            aria-hidden
                        />
                    </div>

                    <div
                        className="[container-type:size] mt-3 flex min-h-0 w-full flex-1 items-start justify-center max-sm:[container-type:inline-size] max-sm:flex-none"
                        data-testid="train-canvas-box"
                    >
                        <div
                            className="relative aspect-[4/3] w-[min(100cqw,calc(100cqh*4/3))] overflow-hidden rounded-3xl border-2 border-[#20364a] shadow-[4px_4px_0_#20364a]"
                            data-testid="train-canvas-frame"
                        >
                            <canvas
                                ref={canvas}
                                width={WIDTH}
                                height={HEIGHT}
                                className="block size-full touch-none select-none"
                                aria-label={t('train.canvasLabel')}
                                onPointerDown={onPointerDown}
                                onPointerUp={onPointerUp}
                                data-testid="train-canvas"
                            />
                            {state?.question && playing && (
                                <ul
                                    className="pointer-events-none absolute inset-x-1.5 top-1.5 z-10 grid grid-cols-3 gap-1 sm:inset-x-3 sm:top-3 sm:gap-2"
                                    data-testid="train-options"
                                >
                                    {state.question.options.map(
                                        (text, lane) => (
                                            <li key={lane} className="min-w-0">
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        setLane(lane)
                                                    }
                                                    className="pointer-events-auto flex min-h-9 w-full items-center justify-center rounded-xl border-2 border-[#20364a] px-1 py-1 text-center text-xs leading-tight font-bold break-words text-[#20364a] shadow-[2px_2px_0_#20364a] sm:text-sm md:text-base"
                                                    style={{
                                                        backgroundColor:
                                                            SIGN_COLORS[lane],
                                                    }}
                                                    aria-label={t(
                                                        'train.laneLabel',
                                                        {
                                                            lane: lane + 1,
                                                            text,
                                                        },
                                                    )}
                                                    data-testid={`train-option-${lane}`}
                                                >
                                                    {text}
                                                </button>
                                            </li>
                                        ),
                                    )}
                                </ul>
                            )}
                            {showOverlay && (
                                <Overlay
                                    state={state}
                                    player={player}
                                    online={online}
                                    serviceReady={serviceReady}
                                    status={connection.status}
                                    onStart={() => {
                                        setMessage('');
                                        connection.send({
                                            t: 'start',
                                            subject,
                                        });
                                    }}
                                    onResume={togglePause}
                                    subject={subject}
                                    onSubject={setSubject}
                                />
                            )}
                        </div>
                    </div>
                    <div className="kt-arrows mt-2 grid w-full shrink-0 grid-cols-2 gap-3 sm:hidden">
                        <button
                            type="button"
                            onClick={() => move(-1)}
                            className="inline-flex min-h-12 items-center justify-center rounded-2xl border-2 border-[#20364a] bg-white"
                            aria-label={t('train.left')}
                        >
                            <ChevronLeft className="size-8" />
                        </button>
                        <button
                            type="button"
                            onClick={() => move(1)}
                            className="inline-flex min-h-12 items-center justify-center rounded-2xl border-2 border-[#20364a] bg-white"
                            aria-label={t('train.right')}
                        >
                            <ChevronRight className="size-8" />
                        </button>
                    </div>
                </div>
            </main>
            <GameFinale
                game="knowledge-train"
                done={phase === 'done' && Boolean(state?.result)}
                matchKey={
                    state?.result
                        ? `${state.result.seconds}-${state.result.correct}-${state.score}`
                        : null
                }
                won={state?.result?.passed ?? false}
                points={state?.result?.points}
            />
        </div>
    );
}

function Stat({ children }: { children: React.ReactNode }) {
    return (
        <span className="kt-stat flex min-h-10 min-w-0 items-center justify-center gap-1 rounded-xl border-2 border-[#20364a] bg-white px-1.5 text-center sm:min-h-11 sm:px-3">
            {children}
        </span>
    );
}

function Overlay({
    state,
    player,
    online,
    serviceReady,
    status,
    onStart,
    onResume,
    subject,
    onSubject,
}: {
    state: TrainState | null;
    player: TrainPlayer;
    online: boolean;
    serviceReady: boolean;
    status: string | null;
    onStart: () => void;
    onResume: () => void;
    subject: GameSubject;
    onSubject: (subject: GameSubject) => void;
}) {
    const { t } = useTranslations();
    const phase = state?.phase ?? 'ready';
    const result = state?.result;
    const total = state?.total ?? 10;

    let body: React.ReactNode;
    if (!hasGrade(player.grade)) {
        body = (
            <>
                <p className="font-bold">{t('train.overlay.needGrade')}</p>
                <NavButton
                    href="/portal"
                    icon={GraduationCap}
                    label={t('train.overlay.setGrade')}
                />
            </>
        );
    } else if (!serviceReady || status === 'offline') {
        body = (
            <>
                <WifiOff className="size-10" />
                <p className="font-bold">{t('train.overlay.unavailable')}</p>
            </>
        );
    } else if (phase === 'question' && state?.paused) {
        body = (
            <>
                <h2 className="font-display text-2xl font-bold">
                    {t('train.overlay.pausedTitle')}
                </h2>
                <StartButton onClick={onResume} testId="train-resume">
                    <Play className="size-5" />
                    {t('train.resume')}
                </StartButton>
            </>
        );
    } else if (phase === 'done' && result) {
        body = (
            <>
                <Trophy
                    className={cn(
                        'size-12',
                        result.passed ? 'text-[#f5a623]' : 'text-[#20364a]/40',
                    )}
                />
                <h2
                    className="font-display text-2xl font-bold"
                    data-testid="train-result"
                    data-reason={result.reason}
                >
                    {result.passed
                        ? t('train.overlay.congratsTitle', {
                              name: player.name,
                          })
                        : result.reason === 'lives'
                          ? t('train.overlay.crashedTitle')
                          : t('train.overlay.doneTitle')}
                </h2>
                <p className="font-bold">
                    {t('train.result.summary', {
                        correct: result.correct,
                        total,
                        wagons: result.wagons,
                        score: state?.score ?? 0,
                    })}
                </p>
                <p className="rounded-xl bg-[#ffd93d] px-3 py-1.5 text-sm font-bold">
                    {result.points > 0
                        ? t('train.result.earned', { points: result.points })
                        : t('train.result.noPoints')}
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                    <SubjectPicker
                        value={subject}
                        onChange={onSubject}
                        compact
                        className="w-full max-w-lg"
                    />
                    <StartButton onClick={onStart} testId="train-again">
                        <RotateCcw className="size-5" />
                        {t('train.playAgain')}
                    </StartButton>
                    <NavButton href="/portal" label={t('nav.backToPortal')} />
                </div>
                <AdSlot placement="arena.result" className="w-full max-w-md" />
            </>
        );
    } else {
        body = (
            <>
                <TrainFront className="size-12 text-[#ff6584]" />
                <h2 className="font-display text-2xl font-bold">
                    {t('train.overlay.readyTitle', { name: player.name })}
                </h2>
                <p className="max-w-md text-sm">
                    {t('train.overlay.rules', { rounds: total })}
                </p>
                <SubjectPicker
                    value={subject}
                    onChange={onSubject}
                    compact
                    className="w-full max-w-lg"
                />
                <StartButton
                    onClick={onStart}
                    disabled={!online}
                    testId="train-start"
                >
                    {online ? (
                        <TrainFront className="size-5" />
                    ) : (
                        <Loader2 className="size-5 animate-spin" />
                    )}
                    {t('train.start')}
                </StartButton>
            </>
        );
    }

    return (
        <div
            className="fixed inset-x-0 top-[70px] bottom-0 z-40 flex flex-col items-center justify-center gap-3 overflow-y-auto bg-white/95 p-4 text-center backdrop-blur-sm sm:absolute sm:inset-0 sm:z-auto sm:bg-white/85"
            data-testid="train-overlay"
            data-phase={phase}
        >
            {body}
        </div>
    );
}

function StartButton({
    children,
    onClick,
    disabled,
    testId,
}: {
    children: React.ReactNode;
    onClick: () => void;
    disabled?: boolean;
    testId?: string;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            data-testid={testId}
            className="inline-flex min-h-12 items-center gap-2 rounded-2xl border-2 border-[#20364a] bg-[#00c9a7] px-6 font-display text-lg font-bold text-white shadow-[3px_3px_0_#20364a] transition-transform hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60"
        >
            {children}
        </button>
    );
}
