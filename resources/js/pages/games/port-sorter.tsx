import AdSlot from '@/components/ads/ad-slot';
import GameAdStrip from '@/components/ads/game-ad-strip';
import { BrandLink } from '@/components/brand-link';
import { DigitalClock } from '@/components/digital-clock';
import { GameFinale } from '@/components/game-finale';
import { PlayerAvatar } from '@/components/player-avatar';
import { BackButton, NavButton, SiteNav } from '@/components/site-nav';
import { useMyUserId } from '@/hooks/use-chat-socket';
import { useGameAudio } from '@/hooks/use-game-audio';
import {
    type PortSorterState,
    type SorterBin,
    type SorterSetSummary,
    usePortSorterConnection,
} from '@/hooks/use-port-sorter';
import { useTranslations } from '@/hooks/use-translations';
import { useAdMoments } from '@/lib/ads';
import { type CharacterLook } from '@/lib/character/draw-character';
import { cn } from '@/lib/utils';
import { Head } from '@inertiajs/react';
import {
    ChevronLeft,
    ChevronRight,
    Coins,
    Gauge,
    Heart,
    Loader2,
    Network,
    Pause,
    Play,
    RotateCcw,
    Trophy,
    Volume2,
    VolumeX,
    Wifi,
    WifiOff,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

interface SorterPlayer {
    name: string;
    grade: number | null;
    color: string;
    accessory: string;
    character?: CharacterLook;
}

interface PortSorterProps {
    player: SorterPlayer;
    points: number;
    serviceReady: boolean;
    wsUrl: string | null;
}

const WIDTH = 720;
const HEIGHT = 600;
const TOP = 30;
const GROUND = 470;
const PACKET_H = 78;
const INK = '#20364a';
const NO_BINS: SorterBin[] = [];

/** Column count of the active set (bins come from the admin Sorter Bank). */
function columnCount(bins: SorterBin[]): number {
    return Math.max(2, bins.length);
}

function columnX(column: number, columns: number): number {
    const width = WIDTH / columns;
    return width * column + width / 2;
}

/** Light lane tint of a bin colour (#rrggbb + alpha). */
function soft(color: string): string {
    return /^#[0-9a-f]{6}$/i.test(color) ? `${color}26` : '#e2e8f0';
}

/** Smallest bin font in canvas px (about 10 CSS px on a 390px phone). */
const MIN_BIN_FONT = 20;

/**
 * Splits a bin name into at most two lines (at "/" or a space) and picks the
 * largest font that fits the bin width. Below MIN_BIN_FONT the text keeps that
 * size and fillText's maxWidth condenses it instead of shrinking further.
 */
function fitBinName(
    ctx: CanvasRenderingContext2D,
    name: string,
    width: number,
): { lines: string[]; size: number } {
    let lines = [name];
    const cut =
        name.indexOf('/') > 0 ? name.indexOf('/') + 1 : name.lastIndexOf(' ');
    for (let size = 26; size >= MIN_BIN_FONT; size -= 1) {
        ctx.font = `900 ${size}px system-ui, sans-serif`;
        if (ctx.measureText(name).width <= width) {
            return { lines: [name], size };
        }
        if (cut > 0) {
            lines = [name.slice(0, cut).trim(), name.slice(cut).trim()];
            if (lines.every((line) => ctx.measureText(line).width <= width)) {
                return { lines, size };
            }
        }
    }
    return { lines: cut > 0 ? lines : [name], size: MIN_BIN_FONT };
}

interface Run {
    column: number;
    packetX: number;
    packetId: string | null;
    label: string;
    receivedAt: number;
    delay: number;
    fall: number;
    elapsedAtReceive: number;
    sent: boolean;
    retryAt: number;
    landed: {
        column: number;
        answer: number;
        label: string;
        kind: 'correct' | 'wrong' | 'missed';
        life: number;
    } | null;
    levelUp: { level: number; life: number } | null;
    pulse: number;
    boostActive: boolean;
    boostedElapsed: number;
}

export default function PortSorter({
    player,
    points,
    serviceReady,
    wsUrl,
}: PortSorterProps) {
    const { t, i18n } = useTranslations();
    const myId = useMyUserId();
    const { play, muted, toggleMuted } = useGameAudio();
    const canvas = useRef<HTMLCanvasElement | null>(null);
    const [state, setState] = useState<PortSorterState | null>(null);
    const [message, setMessage] = useState('');
    const [earned, setEarned] = useState(0);
    const stateRef = useRef<PortSorterState | null>(null);
    const run = useRef<Run>({
        column: 1,
        packetX: columnX(1, 4),
        packetId: null,
        label: '',
        receivedAt: 0,
        delay: 0,
        fall: 6500,
        elapsedAtReceive: 0,
        sent: false,
        retryAt: 0,
        landed: null,
        levelUp: null,
        pulse: 0,
        boostActive: false,
        boostedElapsed: 0,
    });
    const reported = useRef<string | null>(null);
    const caption = useRef('');
    const sendRef = useRef<(msg: Record<string, unknown>) => boolean>(
        () => false,
    );
    const playRef = useRef(play);

    useEffect(() => {
        playRef.current = play;
    }, [play]);

    useEffect(() => {
        caption.current = t('portSorter.packetCaption');
    }, [t]);

    const handlers = useMemo(
        () => ({
            onState: (next: PortSorterState) => {
                const r = run.current;
                const fb = next.feedback;
                if (fb) {
                    r.landed = {
                        column: fb.bin >= 0 ? fb.bin : r.column,
                        answer: fb.answer,
                        label: fb.label,
                        kind: fb.kind,
                        life: 0.9,
                    };
                    if (fb.level_up) {
                        r.levelUp = { level: fb.level_up, life: 1.6 };
                    }
                    playRef.current(
                        fb.kind === 'correct' ? 'correct' : 'wrong',
                    );
                    const bin = next.bins[fb.answer]?.name ?? '';
                    const item = fb.hint
                        ? `${fb.label} (${fb.hint})`
                        : fb.label;
                    setMessage(
                        fb.kind === 'correct'
                            ? t('portSorter.feedback.correct', {
                                  item,
                                  bin,
                                  score: fb.score,
                              })
                            : t(`portSorter.feedback.${fb.kind}`, {
                                  item,
                                  bin,
                              }),
                    );
                }
                const packet = next.packet;
                if (packet) {
                    // Every snapshot re-syncs the fall clock with the referee
                    // (pause, resume and reconnect keep the same packet id).
                    if (packet.id !== r.packetId) {
                        r.packetId = packet.id;
                        r.label = packet.label;
                        r.sent = false;
                        r.column = packet.column;
                        r.boostActive = false;
                        r.boostedElapsed = 0;
                        r.packetX = columnX(
                            packet.column,
                            columnCount(next.bins),
                        );
                    }
                    r.receivedAt = performance.now();
                    r.delay = packet.delay;
                    r.fall = packet.fall_ms;
                    r.elapsedAtReceive = packet.elapsed_ms;
                }
                if (next.phase === 'ready') {
                    setMessage('');
                }
                stateRef.current = next;
                setState(next);
            },
            onError: (code: string) => {
                if (code === 'too_early') {
                    run.current.sent = false;
                    run.current.retryAt = performance.now() + 150;
                    return;
                }
                if (code === 'stale_packet' || code === 'wrong_phase') {
                    return;
                }
                setMessage(t('portSorter.errors.generic'));
            },
        }),
        [t],
    );

    const connection = usePortSorterConnection(
        serviceReady ? wsUrl : null,
        i18n.language,
        handlers,
    );

    useEffect(() => {
        sendRef.current = connection.send;
    }, [connection.send]);

    const phase = state?.phase ?? 'ready';
    const paused = Boolean(state?.paused);
    const playing = phase === 'falling' && !paused;
    useAdMoments(
        phase === 'done' ? 'done' : phase === 'falling' ? 'playing' : 'idle',
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

    /** The falling packet can still be steered (not landed, not paused). */
    const steerable = () => {
        const st = stateRef.current;
        return Boolean(
            st?.phase === 'falling' && !st.paused && !run.current.sent,
        );
    };

    const setColumn = useCallback((column: number) => {
        if (!steerable()) return;
        const columns = columnCount(stateRef.current?.bins ?? NO_BINS);
        const next = Math.max(0, Math.min(columns - 1, column));
        if (next !== run.current.column) {
            run.current.column = next;
            playRef.current('step');
        }
    }, []);

    const move = useCallback(
        (delta: number) => setColumn(run.current.column + delta),
        [setColumn],
    );

    const togglePause = useCallback(() => {
        const current = stateRef.current;
        if (!current || current.phase !== 'falling') return;
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
            } else if (/^[1-9]$/.test(event.key)) {
                setColumn(Number(event.key) - 1);
            } else if (event.key === 'p' || event.key === 'P') {
                togglePause();
            } else if (event.key === 'ArrowDown' || event.key === 's') {
                event.preventDefault();
                if (steerable()) {
                    run.current.boostActive = true;
                }
            }
        };
        const onKeyUp = (event: KeyboardEvent) => {
            if (event.key === 'ArrowDown' || event.key === 's') {
                run.current.boostActive = false;
            }
        };
        window.addEventListener('keydown', onKey);
        window.addEventListener('keyup', onKeyUp);
        return () => {
            window.removeEventListener('keydown', onKey);
            window.removeEventListener('keyup', onKeyUp);
        };
    }, [move, setColumn, togglePause]);

    useEffect(() => {
        const onHide = () => {
            if (document.hidden && stateRef.current?.phase === 'falling') {
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
        // Number-key hints only help keyboard players.
        const showKeys = window.matchMedia('(pointer: fine)').matches;

        const draw = (now: number) => {
            const dt = Math.min(0.05, (now - last) / 1000);
            last = now;
            const r = run.current;
            const st = stateRef.current;
            const packet = st?.phase === 'falling' ? st.packet : undefined;
            const running = Boolean(packet) && !st?.paused;
            const bins = st?.bins ?? NO_BINS;
            const columns = columnCount(bins);
            const columnWidth = WIDTH / columns;
            const packetWidth = Math.min(150, columnWidth - 14);
            r.pulse = (r.pulse + dt) % 2;

            const targetX = columnX(r.column, columns);
            r.packetX += (targetX - r.packetX) * Math.min(1, dt * 16);
            if (r.landed) {
                r.landed.life -= dt;
                if (r.landed.life <= 0) r.landed = null;
            }
            if (r.levelUp) {
                r.levelUp.life -= dt;
                if (r.levelUp.life <= 0) r.levelUp = null;
            }

            let progress = 0;
            let waiting = false;
            if (packet) {
                const since = st?.paused ? 0 : now - r.receivedAt;
                waiting = since < r.delay && r.elapsedAtReceive === 0;
                // Boost: hold ArrowDown/s to accelerate fall 3× (extra 2× dt per frame).
                if (r.boostActive && running && !waiting && !r.sent) {
                    r.boostedElapsed += dt * 2 * 1000;
                }
                const travelled =
                    r.elapsedAtReceive +
                    Math.max(0, since - r.delay) +
                    r.boostedElapsed;
                progress = Math.min(1, travelled / r.fall);
                if (progress >= 1) {
                    r.boostActive = false;
                }
                if (
                    running &&
                    progress >= 1 &&
                    !r.sent &&
                    !waiting &&
                    now >= r.retryAt
                ) {
                    r.sent = true;
                    sendRef.current({
                        t: r.boostedElapsed > 0 ? 'drop' : 'land',
                        packet: r.packetId,
                        option: r.column,
                    });
                }
            }
            element.dataset.column = String(r.column);
            element.dataset.packet = packet
                ? `${packet.id}:${packet.label}`
                : '';
            element.dataset.columns = String(bins.length);
            element.dataset.progress = progress.toFixed(2);

            // Server-room backdrop with a light grid.
            ctx.fillStyle = '#eef6fb';
            ctx.fillRect(0, 0, WIDTH, HEIGHT);
            ctx.strokeStyle = 'rgba(32, 54, 74, 0.06)';
            ctx.lineWidth = 1;
            for (let x = 0; x <= WIDTH; x += 24) {
                ctx.beginPath();
                ctx.moveTo(x, 0);
                ctx.lineTo(x, HEIGHT);
                ctx.stroke();
            }
            for (let y = 0; y <= HEIGHT; y += 24) {
                ctx.beginPath();
                ctx.moveTo(0, y);
                ctx.lineTo(WIDTH, y);
                ctx.stroke();
            }

            // Lanes: the packet's current lane is highlighted.
            for (let c = 0; c < bins.length; c++) {
                const active = Boolean(packet) && c === r.column;
                ctx.fillStyle = active
                    ? soft(bins[c].color)
                    : 'rgba(255,255,255,0.35)';
                ctx.fillRect(c * columnWidth + 4, 0, columnWidth - 8, GROUND);
                if (c > 0) {
                    ctx.setLineDash([8, 10]);
                    ctx.strokeStyle = 'rgba(32, 54, 74, 0.18)';
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.moveTo(c * columnWidth, 0);
                    ctx.lineTo(c * columnWidth, GROUND);
                    ctx.stroke();
                    ctx.setLineDash([]);
                }
            }

            // Bins.
            const binTop = GROUND + 8;
            const inset = columns > 4 ? 8 : 10;
            for (let c = 0; c < bins.length; c++) {
                const x = c * columnWidth + inset;
                const w = columnWidth - inset * 2;
                const h = HEIGHT - binTop - 10;
                let fill = bins[c].color;
                const landed = r.landed;
                if (landed) {
                    if (c === landed.answer) {
                        fill = '#10b981';
                    } else if (
                        c === landed.column &&
                        landed.kind !== 'correct'
                    ) {
                        fill = '#ef4444';
                    }
                }
                ctx.fillStyle = fill;
                ctx.strokeStyle = INK;
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.moveTo(x - 4, binTop);
                ctx.lineTo(x + w + 4, binTop);
                ctx.lineTo(x + w - 8, binTop + h);
                ctx.lineTo(x + 8, binTop + h);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
                ctx.fillStyle = '#ffffff';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                // Long names ("SSH/REMOTE") wrap at the slash or a space and
                // shrink only as much as the bin width needs.
                const { lines, size } = fitBinName(ctx, bins[c].name, w - 16);
                ctx.font = `900 ${size}px system-ui, sans-serif`;
                const lineHeight = size + 3;
                const top = binTop + 44 - ((lines.length - 1) * lineHeight) / 2;
                lines.forEach((line, i) => {
                    ctx.fillText(
                        line,
                        columnX(c, columns),
                        top + i * lineHeight,
                        w - 12,
                    );
                });
                if (showKeys && bins.length <= 9) {
                    ctx.font = '800 18px system-ui, sans-serif';
                    ctx.fillText(
                        `${c + 1}`,
                        columnX(c, columns),
                        binTop + h - 16,
                    );
                }
            }
            ctx.fillStyle = INK;
            ctx.fillRect(0, GROUND, WIDTH, 4);

            // Falling packet.
            if (packet || r.landed) {
                const y = packet
                    ? TOP + progress * (GROUND - PACKET_H - TOP)
                    : GROUND - PACKET_H;
                const label = r.landed && !packet ? r.landed.label : r.label;
                const sinking = r.landed && (!packet || waiting);
                if (!(packet && waiting && !r.landed)) {
                    const x = sinking
                        ? columnX(r.landed!.column, columns)
                        : r.packetX;
                    const drop = sinking ? (0.9 - r.landed!.life) * 90 : 0;
                    const alpha = sinking
                        ? Math.max(0, r.landed!.life / 0.9)
                        : 1;
                    ctx.save();
                    ctx.globalAlpha = alpha;
                    drawPacket(
                        ctx,
                        x,
                        (sinking ? GROUND - PACKET_H : y) + drop,
                        label,
                        packetWidth,
                        caption.current,
                    );
                    ctx.restore();
                }
            }

            // Speed level banner.
            if (r.levelUp) {
                ctx.save();
                ctx.globalAlpha = Math.min(1, r.levelUp.life);
                ctx.fillStyle = '#ffd93d';
                ctx.strokeStyle = INK;
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.roundRect(WIDTH / 2 - 170, 170, 340, 64, 16);
                ctx.fill();
                ctx.stroke();
                ctx.fillStyle = INK;
                ctx.font = '900 28px system-ui, sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(
                    `⚡ LEVEL ${r.levelUp.level}`,
                    WIDTH / 2,
                    202,
                    320,
                );
                ctx.restore();
            }

            // Boost indicator: shown while ArrowDown/s is held.
            if (r.boostActive && running) {
                const blink = Math.floor(now / 180) % 2 === 0;
                if (blink) {
                    ctx.save();
                    ctx.fillStyle = '#fbbf24';
                    ctx.strokeStyle = INK;
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.roundRect(WIDTH - 130, 8, 118, 34, 10);
                    ctx.fill();
                    ctx.stroke();
                    ctx.fillStyle = INK;
                    ctx.font = '800 18px system-ui, sans-serif';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText('⚡ BOOST', WIDTH - 71, 25, 110);
                    ctx.restore();
                }
            }

            frame = requestAnimationFrame(draw);
        };
        frame = requestAnimationFrame(draw);
        return () => cancelAnimationFrame(frame);
    }, []);

    // Swipe/drag: the packet follows the finger column by column; a short tap
    // picks the tapped column.
    const drag = useRef<{ x: number; column: number; moved: boolean } | null>(
        null,
    );
    const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
        drag.current = {
            x: event.clientX,
            column: run.current.column,
            moved: false,
        };
        event.currentTarget.setPointerCapture?.(event.pointerId);
    };
    const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
        const start = drag.current;
        if (!start || !canvas.current) return;
        const rect = canvas.current.getBoundingClientRect();
        const columnPx =
            rect.width / columnCount(stateRef.current?.bins ?? NO_BINS);
        const dx = event.clientX - start.x;
        if (Math.abs(dx) > 12) start.moved = true;
        if (start.moved) {
            setColumn(start.column + Math.round(dx / (columnPx * 0.7)));
        }
    };
    const onPointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
        const start = drag.current;
        drag.current = null;
        if (!start || start.moved || !canvas.current) return;
        const rect = canvas.current.getBoundingClientRect();
        const columns = columnCount(stateRef.current?.bins ?? NO_BINS);
        setColumn(
            Math.floor(((event.clientX - rect.left) / rect.width) * columns),
        );
    };

    const online = connection.status === 'online';
    const total = state?.total ?? 30;
    const lives = state?.lives ?? 3;
    const maxLives = state?.max ?? 3;
    const showOverlay = !playing;

    return (
        <div className="min-h-dvh bg-[#e9f6f4] text-[#20364a]">
            <Head title={`${t('portSorter.title')} — EduFunHub`} />
            <header className="sticky top-0 z-50 flex items-center justify-between gap-2 border-b-2 border-[#20364a] bg-white px-3 py-3 sm:gap-3 sm:px-4">
                <div className="edu-game-brand flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
                    <BackButton
                        href="/portal"
                        label={t('nav.backToPortal')}
                        iconOnly
                    />
                    <BrandLink variant="mark" />
                    <h1 className="flex min-w-0 items-center gap-2 font-display text-lg font-bold sm:text-xl">
                        <Network className="size-6 shrink-0" />
                        <span className="truncate">
                            {t('portSorter.title')}
                        </span>
                    </h1>
                    <DigitalClock className="edu-clock--game" />
                </div>
                <SiteNav compact className="shrink-0" />
            </header>

            <main className="mx-auto flex w-full max-w-5xl flex-col gap-3 p-3 sm:p-5">
                <GameAdStrip />
                <div className="flex flex-wrap items-center gap-2 text-sm font-bold">
                    <span
                        className="inline-flex min-h-11 min-w-0 items-center gap-2 rounded-xl border-2 border-[#20364a] bg-white px-3"
                        data-testid="port-player"
                    >
                        <span className="-my-1 size-9 shrink-0">
                            <PlayerAvatar
                                character={player.character}
                                userId={myId}
                            />
                        </span>
                        <span className="truncate">{player.name}</span>
                    </span>
                    <span className="inline-flex min-h-11 items-center gap-2 rounded-xl border-2 border-[#20364a] bg-[#ffd93d] px-3">
                        <Coins className="size-4" />
                        {t('portSorter.points', { count: points + earned })}
                    </span>
                    {connection.status && (
                        <span
                            className={cn(
                                'inline-flex min-h-11 items-center gap-1.5 rounded-xl border-2 border-[#20364a] px-3 text-xs',
                                online ? 'bg-[#c9f5e5]' : 'bg-[#ffe1e1]',
                            )}
                            data-testid="port-connection"
                            data-status={connection.status}
                        >
                            {online ? (
                                <Wifi className="size-4" />
                            ) : (
                                <WifiOff className="size-4" />
                            )}
                            <span className="sr-only sm:not-sr-only">
                                {t(
                                    `portSorter.connection.${connection.status}`,
                                )}
                            </span>
                        </span>
                    )}
                    <div className="ml-auto flex gap-2">
                        {phase === 'falling' && (
                            <button
                                type="button"
                                onClick={togglePause}
                                className="inline-flex size-11 items-center justify-center rounded-xl border-2 border-[#20364a] bg-white"
                                aria-label={t(
                                    paused
                                        ? 'portSorter.resume'
                                        : 'portSorter.pause',
                                )}
                                data-testid="port-pause"
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
                                muted ? 'portSorter.unmute' : 'portSorter.mute',
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
                    className="grid grid-cols-2 gap-2 text-sm font-bold sm:grid-cols-4"
                    data-testid="port-hud"
                >
                    <Stat>
                        {t('portSorter.round', {
                            round: Math.min(
                                (state?.round ?? 0) +
                                    (phase === 'falling' ? 1 : 0),
                                total,
                            ),
                            total,
                        })}
                    </Stat>
                    <Stat>
                        {t('portSorter.score', { score: state?.score ?? 0 })}
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
                            {t('portSorter.lives', { lives, max: maxLives })}
                        </span>
                    </Stat>
                    <Stat>
                        <Gauge className="size-4 shrink-0" />
                        {t('portSorter.level', {
                            level: state?.level ?? 1,
                            max: state?.levels ?? 6,
                        })}
                        {(state?.streak ?? 0) > 1 && (
                            <span className="text-[#ff6584]">
                                {' '}
                                ·{' '}
                                {t('portSorter.streak', {
                                    count: state?.streak,
                                })}
                            </span>
                        )}
                    </Stat>
                </div>

                <div
                    className="min-h-14 rounded-2xl border-2 border-[#20364a] bg-white px-4 py-3 text-center"
                    data-testid="port-message"
                    aria-live="polite"
                >
                    <p className="font-display text-base leading-snug font-bold sm:text-lg">
                        {message || t('portSorter.hint')}
                    </p>
                </div>

                <div className="relative mx-auto w-full max-w-[calc((100dvh-6rem)*1.2)] overflow-hidden rounded-3xl border-2 border-[#20364a] shadow-[4px_4px_0_#20364a]">
                    <canvas
                        ref={canvas}
                        width={WIDTH}
                        height={HEIGHT}
                        className="block aspect-[6/5] w-full touch-none select-none"
                        aria-label={t('portSorter.canvasLabel')}
                        onPointerDown={onPointerDown}
                        onPointerMove={onPointerMove}
                        onPointerUp={onPointerUp}
                        onPointerCancel={() => {
                            drag.current = null;
                        }}
                        data-testid="port-canvas"
                    />
                    {state?.packet && playing && (
                        <p className="sr-only">
                            {t('portSorter.packetLabel', {
                                label: state.packet.label,
                            })}{' '}
                            {state.bins
                                .map(
                                    (bin, index) => `${index + 1}: ${bin.name}`,
                                )
                                .join(', ')}
                        </p>
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
                                    value: state?.set.key ?? '',
                                });
                            }}
                            onChoose={(key) =>
                                connection.send({ t: 'choose', value: key })
                            }
                            onResume={togglePause}
                        />
                    )}
                </div>

                <div className="grid grid-cols-2 gap-3 sm:hidden">
                    <button
                        type="button"
                        onClick={() => move(-1)}
                        className="inline-flex min-h-14 items-center justify-center rounded-2xl border-2 border-[#20364a] bg-white"
                        aria-label={t('portSorter.left')}
                    >
                        <ChevronLeft className="size-8" />
                    </button>
                    <button
                        type="button"
                        onClick={() => move(1)}
                        className="inline-flex min-h-14 items-center justify-center rounded-2xl border-2 border-[#20364a] bg-white"
                        aria-label={t('portSorter.right')}
                    >
                        <ChevronRight className="size-8" />
                    </button>
                </div>
                <p
                    className="hidden text-center text-xs text-[#4d6b80] sm:block"
                    aria-hidden="true"
                >
                    ←/A · →/D · 1–9 · P={t('portSorter.pause')} ·{' '}
                    {t('portSorter.boostHint')}
                </p>
            </main>
            <GameFinale
                game="port-sorter"
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

function drawPacket(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    label: string,
    width: number,
    caption: string,
) {
    const left = x - width / 2;
    ctx.fillStyle = 'rgba(32, 54, 74, 0.2)';
    ctx.beginPath();
    ctx.roundRect(left + 5, y + 6, width, PACKET_H, 14);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(left, y, width, PACKET_H, 14);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.roundRect(left, y, width, 24, [14, 14, 0, 0]);
    ctx.fill();
    ctx.fillStyle = '#ccfbf1';
    ctx.font = '800 16px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(caption, x, y + 12, width - 12);
    ctx.fillStyle = INK;
    let size = 38;
    ctx.font = `900 ${size}px system-ui, sans-serif`;
    while (size > 20 && ctx.measureText(label).width > width - 14) {
        size -= 2;
        ctx.font = `900 ${size}px system-ui, sans-serif`;
    }
    // Long labels on narrow lanes condense horizontally instead of spilling.
    ctx.fillText(label, x, y + 24 + (PACKET_H - 24) / 2 + 1, width - 14);
}

function Stat({ children }: { children: React.ReactNode }) {
    return (
        <span className="flex min-h-11 items-center justify-center gap-1 rounded-xl border-2 border-[#20364a] bg-white px-3 text-center">
            {children}
        </span>
    );
}

function Legend({
    legend,
    bins,
}: {
    legend: NonNullable<PortSorterState['legend']>;
    bins: SorterBin[];
}) {
    return (
        <div
            className={cn(
                'grid w-full max-w-3xl grid-cols-2 gap-2 text-left',
                bins.length >= 3 && 'sm:grid-cols-3',
                bins.length === 4 && 'lg:grid-cols-4',
                bins.length >= 5 && 'lg:grid-cols-3',
            )}
            data-testid="port-legend"
        >
            {bins.map((bin, index) => (
                <div
                    key={bin.key}
                    className="rounded-xl border-2 border-[#20364a] bg-white p-2"
                >
                    <p
                        className="mb-1 truncate rounded-lg px-2 py-0.5 text-center text-xs font-black text-white"
                        style={{ background: bin.color }}
                    >
                        {bin.name}
                    </p>
                    <ul className="flex max-h-32 flex-col gap-0.5 overflow-y-auto text-xs">
                        {legend
                            .filter((entry) => entry.bin === index)
                            .map((entry) => (
                                <li
                                    key={entry.label}
                                    className="flex justify-between gap-2"
                                >
                                    <span className="font-black tabular-nums">
                                        {entry.label}
                                    </span>
                                    <span className="truncate text-[#4d6b80]">
                                        {entry.hint}
                                    </span>
                                </li>
                            ))}
                    </ul>
                </div>
            ))}
        </div>
    );
}

function SetPicker({
    sets,
    value,
    onChange,
}: {
    sets: SorterSetSummary[];
    value: string;
    onChange: (key: string) => void;
}) {
    const { t } = useTranslations();
    if (sets.length < 2) {
        return null;
    }

    return (
        <div
            className="flex w-full max-w-3xl flex-col gap-1.5"
            role="radiogroup"
            aria-label={t('portSorter.overlay.pickTopic')}
            data-testid="port-sets"
        >
            <p className="text-xs font-black tracking-wide text-[#4d6b80] uppercase">
                {t('portSorter.overlay.pickTopic')}
            </p>
            <div className="flex flex-wrap justify-center gap-2">
                {sets.map((set) => {
                    const active = set.key === value;
                    return (
                        <button
                            key={set.key}
                            type="button"
                            role="radio"
                            aria-checked={active}
                            onClick={() => onChange(set.key)}
                            data-testid={`port-set-${set.key}`}
                            className={cn(
                                'flex min-h-11 max-w-full flex-col items-start gap-1 rounded-xl border-2 border-[#20364a] px-3 py-1.5 text-left transition-transform hover:-translate-y-0.5',
                                active
                                    ? 'bg-[#0d9488] text-white shadow-[3px_3px_0_#20364a]'
                                    : 'bg-white',
                            )}
                        >
                            <span className="text-sm font-black">
                                {set.title}
                            </span>
                            <span className="flex flex-wrap gap-1">
                                {set.bins.map((bin) => (
                                    <span
                                        key={bin.key}
                                        className="rounded px-1.5 text-[11px] font-bold text-white ring-1 ring-white/40"
                                        style={{ background: bin.color }}
                                    >
                                        {bin.name}
                                    </span>
                                ))}
                            </span>
                        </button>
                    );
                })}
            </div>
        </div>
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
    onChoose,
}: {
    state: PortSorterState | null;
    player: SorterPlayer;
    online: boolean;
    serviceReady: boolean;
    status: string | null;
    onStart: () => void;
    onResume: () => void;
    onChoose: (key: string) => void;
}) {
    const { t } = useTranslations();
    const phase = state?.phase ?? 'ready';
    const result = state?.result;
    const total = state?.total ?? 30;
    const bins = state?.bins ?? NO_BINS;
    const picker = state?.sets ? (
        <SetPicker
            sets={state.sets}
            value={state.set.key}
            onChange={onChoose}
        />
    ) : null;

    let body: React.ReactNode;
    if (!serviceReady || status === 'offline') {
        body = (
            <>
                <WifiOff className="size-10" />
                <p className="font-bold">
                    {t('portSorter.overlay.unavailable')}
                </p>
            </>
        );
    } else if (phase === 'falling' && state?.paused) {
        body = (
            <>
                <h2 className="font-display text-2xl font-bold">
                    {t('portSorter.overlay.pausedTitle')}
                </h2>
                <StartButton onClick={onResume} testId="port-resume">
                    <Play className="size-5" />
                    {t('portSorter.resume')}
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
                    data-testid="port-result"
                    data-reason={result.reason}
                >
                    {result.passed
                        ? t('portSorter.overlay.congratsTitle', {
                              name: player.name,
                          })
                        : result.reason === 'lives'
                          ? t('portSorter.overlay.crashedTitle')
                          : t('portSorter.overlay.doneTitle')}
                </h2>
                <p className="font-bold">
                    {t('portSorter.result.summary', {
                        correct: result.correct,
                        total,
                        streak: result.best_streak,
                        score: state?.score ?? 0,
                    })}
                </p>
                <p className="rounded-xl bg-[#ffd93d] px-3 py-1.5 text-sm font-bold">
                    {result.points > 0
                        ? t('portSorter.result.earned', {
                              points: result.points,
                          })
                        : t('portSorter.result.noPoints')}
                </p>
                {result.missed.length > 0 && (
                    <div
                        className="w-full max-w-md rounded-xl border-2 border-[#20364a] bg-white p-3 text-left text-sm"
                        data-testid="port-missed"
                    >
                        <p className="mb-1 font-black">
                            {t('portSorter.result.review')}
                        </p>
                        <ul className="flex flex-col gap-1">
                            {result.missed.map((entry) => (
                                <li
                                    key={entry.label}
                                    className="flex items-center justify-between gap-2"
                                >
                                    <span className="min-w-0 truncate">
                                        <span className="font-black tabular-nums">
                                            {entry.label}
                                        </span>{' '}
                                        <span className="text-[#4d6b80]">
                                            {entry.hint}
                                        </span>
                                    </span>
                                    <span
                                        className="shrink-0 rounded-md px-2 py-0.5 text-xs font-black text-white"
                                        style={{
                                            background: bins[entry.bin]?.color,
                                        }}
                                    >
                                        {bins[entry.bin]?.name}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
                {picker}
                <div className="flex flex-wrap justify-center gap-2">
                    <StartButton onClick={onStart} testId="port-again">
                        <RotateCcw className="size-5" />
                        {t('portSorter.playAgain')}
                    </StartButton>
                    <NavButton href="/portal" label={t('nav.backToPortal')} />
                </div>
                <AdSlot placement="arena.result" className="w-full max-w-md" />
            </>
        );
    } else {
        body = (
            <>
                <Network className="size-12 text-[#0d9488]" />
                <h2 className="font-display text-2xl font-bold">
                    {t('portSorter.overlay.readyTitle', { name: player.name })}
                </h2>
                <p className="max-w-lg text-sm">
                    {t('portSorter.overlay.rules', {
                        packets: total,
                        bins: bins.length,
                    })}
                </p>
                {picker}
                {state?.set.description && (
                    <p
                        className="max-w-lg text-sm font-bold"
                        data-testid="port-set-description"
                    >
                        {state.set.description}
                    </p>
                )}
                {state?.legend && <Legend legend={state.legend} bins={bins} />}
                <StartButton
                    onClick={onStart}
                    disabled={!online}
                    testId="port-start"
                >
                    {online ? (
                        <Network className="size-5" />
                    ) : (
                        <Loader2 className="size-5 animate-spin" />
                    )}
                    {t('portSorter.start')}
                </StartButton>
            </>
        );
    }

    return (
        <div
            className="fixed inset-x-0 top-[70px] bottom-0 z-40 flex flex-col items-center justify-center gap-3 overflow-y-auto bg-white/95 p-4 text-center backdrop-blur-sm sm:absolute sm:inset-0 sm:z-auto sm:bg-white/90"
            data-testid="port-overlay"
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
            className="inline-flex min-h-12 items-center gap-2 rounded-2xl border-2 border-[#20364a] bg-[#0d9488] px-6 font-display text-lg font-bold text-white shadow-[3px_3px_0_#20364a] transition-transform hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60"
        >
            {children}
        </button>
    );
}
