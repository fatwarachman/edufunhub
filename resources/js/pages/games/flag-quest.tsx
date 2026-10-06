import AdSlot from '@/components/ads/ad-slot';
import ChallengeDialog from '@/components/flag-quest/challenge-dialog';
import {
    type GameSubject,
    rememberedSubject,
    SubjectPicker,
} from '@/components/multiplayer/subject-picker';
import { OnlineDot } from '@/components/online-dot';
import PlayerCharacter from '@/components/player-character';
import { BackButton, NavButton } from '@/components/site-nav';
import { useFlagQuestConnection } from '@/hooks/use-flag-quest-connection';
import { useGameAudio } from '@/hooks/use-game-audio';
import { useTranslations } from '@/hooks/use-translations';
import { AdMoment, useAdMoments } from '@/lib/ads';
import { type CharacterLook } from '@/lib/character/draw-character';
import {
    drawMinimap,
    FlagQuestRenderer,
    KIND_COLOR,
} from '@/lib/flag-quest/renderer';
import {
    findNearby,
    moveWithCollision,
    type NearbyTarget,
    type Point,
    screenToWorldDir,
    type WorldData,
} from '@/lib/flag-quest/world';
import { hasGrade, KINDERGARTEN } from '@/lib/grade';
import { type SharedData } from '@/types';
import { Head, usePage } from '@inertiajs/react';
import {
    CheckCircle2,
    Coins,
    Flag,
    Footprints,
    GraduationCap,
    Hand,
    Lock,
    Map as MapIcon,
    RotateCw,
    Trophy,
    Volume2,
    VolumeX,
    Wifi,
    WifiOff,
} from 'lucide-react';
import type React from 'react';
import {
    type PointerEvent as ReactPointerEvent,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import '../../../css/flag-quest.css';

interface Props {
    player: {
        name: string;
        grade: number | null;
        color: string;
        accessory: string;
    };
    character: CharacterLook;
    points: number;
    serviceReady: boolean;
    wsUrl: string;
}

interface Runtime {
    pos: Point;
    facing: number;
    walking: boolean;
    rotation: number;
    camera: Point;
    keys: Set<string>;
    joystick: Point;
    run: boolean;
    lastSent: number;
    lastSentPos: Point;
    zoom: number;
}

const MOVE_KEYS: Record<string, [number, number]> = {
    KeyW: [0, -1],
    ArrowUp: [0, -1],
    KeyS: [0, 1],
    ArrowDown: [0, 1],
    KeyA: [-1, 0],
    ArrowLeft: [-1, 0],
    KeyD: [1, 0],
    ArrowRight: [1, 0],
};

export default function FlagQuest({
    player,
    character,
    points,
    serviceReady,
    wsUrl,
}: Props) {
    const { t, i18n } = useTranslations();
    const [subject, setSubject] = useState<GameSubject>(() =>
        typeof window === 'undefined' ? 'mix' : rememberedSubject(),
    );
    const { locale, auth } = usePage<SharedData>().props;
    const lang = i18n.language === 'en' ? 'en' : 'id';
    const { play, muted, toggleMuted } = useGameAudio();

    useEffect(() => {
        if (locale && i18n.language !== locale) {
            void i18n.changeLanguage(locale);
        }
    }, [locale, i18n]);

    const runtime = useRef<Runtime>({
        pos: { x: 0, y: 0 },
        facing: 0,
        walking: false,
        rotation: 0,
        camera: { x: 0, y: 0 },
        keys: new Set(),
        joystick: { x: 0, y: 0 },
        run: false,
        lastSent: 0,
        lastSentPos: { x: 0, y: 0 },
        zoom: 1,
    });
    const onCorrection = useCallback((p: Point) => {
        const r = runtime.current;
        const jump = Math.hypot(r.pos.x - p.x, r.pos.y - p.y);
        r.pos = { ...p };
        r.lastSentPos = { ...p };
        if (jump > 6 || (r.camera.x === 0 && r.camera.y === 0)) {
            r.camera = { ...p };
        }
    }, []);
    const [toast, setToast] = useState<{ text: string; id: number } | null>(
        null,
    );
    const showToast = useCallback((text: string) => {
        setToast({ text, id: Date.now() });
    }, []);
    const tRef = useRef(t);
    const playRef = useRef(play);
    useEffect(() => {
        tRef.current = t;
        playRef.current = play;
    }, [t, play]);

    const renderer = useMemo(() => new FlagQuestRenderer(), []);
    const clearedCount = useRef(0);
    const onEvent = useCallback(
        (msg: Record<string, unknown>) => {
            const tr = tRef.current;
            const sound = playRef.current;
            const countCleared = (cps: unknown) =>
                Array.isArray(cps)
                    ? (cps as { cleared: boolean }[]).filter((c) => c.cleared)
                          .length
                    : clearedCount.current;
            switch (msg.t) {
                case 'welcome': {
                    const w = msg.world as WorldData;
                    renderer.invalidate();
                    clearedCount.current = countCleared(w.checkpoints);
                    showToast(
                        tr('flagQuest.toast.welcome', {
                            mission: tr(`flagQuest.missions.${w.mission}.name`),
                        }),
                    );
                    break;
                }
                case 'challenge': {
                    const fb = msg.feedback as { correct: boolean } | undefined;
                    if (fb) {
                        sound(fb.correct ? 'correct' : 'wrong');
                    }
                    break;
                }
                case 'gates': {
                    const total = (msg.checkpoints as unknown[]).length;
                    const now = countCleared(msg.checkpoints);
                    if (now > clearedCount.current) {
                        showToast(
                            now === total
                                ? tr('flagQuest.toast.allGates')
                                : tr('flagQuest.toast.gateOpen', {
                                      count: now,
                                  }),
                        );
                    }
                    clearedCount.current = now;
                    break;
                }
                case 'complete':
                    sound('correct');
                    break;
                case 'error':
                    sound('wrong');
                    showToast(
                        tr(`flagQuest.notice.${String(msg.code)}`, {
                            seconds: Math.ceil(
                                ((msg.retry_ms as number | undefined) ?? 0) /
                                    1000,
                            ),
                            defaultValue: tr('flagQuest.notice.generic'),
                        }),
                    );
                    break;
            }
        },
        [renderer, showToast],
    );
    const handlers = useMemo(
        () => ({ onCorrection, onEvent }),
        [onCorrection, onEvent],
    );
    const conn = useFlagQuestConnection(
        wsUrl,
        lang,
        serviceReady && player.grade !== null,
        handlers,
    );
    const { world, challenge, complete, raising, send } = conn;
    const blocked = challenge !== null || complete !== null;
    useAdMoments(complete ? 'done' : world ? 'playing' : 'idle', {
        muted,
        won: false,
    });

    const worldRef = useRef<WorldData | null>(null);
    const blockedRef = useRef(blocked);
    const raisingRef = useRef(raising);
    const completeRef = useRef(complete);
    useEffect(() => {
        worldRef.current = world;
        blockedRef.current = blocked;
        raisingRef.current = raising;
        completeRef.current = complete;
    }, [world, blocked, raising, complete]);

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const rootRef = useRef<HTMLDivElement>(null);
    const miniRef = useRef<HTMLCanvasElement>(null);
    const [nearby, setNearby] = useState<NearbyTarget>(null);
    const nearbyRef = useRef<NearbyTarget>(null);
    const [showMap, setShowMap] = useState(true);
    const [runToggle, setRunToggle] = useState(false);
    const [touchUi, setTouchUi] = useState(false);
    const [wide, setWide] = useState(
        () =>
            typeof window !== 'undefined' &&
            window.matchMedia('(min-width: 768px) and (min-height: 560px)')
                .matches,
    );
    const [missionPicker, setMissionPicker] = useState(false);
    const [showSteps, setShowSteps] = useState(true);

    useEffect(() => {
        const mq = window.matchMedia('(pointer: coarse)');
        const update = () =>
            setTouchUi(mq.matches || navigator.maxTouchPoints > 0);
        mq.addEventListener('change', update);
        const wq = window.matchMedia(
            '(min-width: 768px) and (min-height: 560px)',
        );
        const updateWide = () => setWide(wq.matches);
        wq.addEventListener('change', updateWide);
        const raf = requestAnimationFrame(update);
        return () => {
            cancelAnimationFrame(raf);
            mq.removeEventListener('change', update);
            wq.removeEventListener('change', updateWide);
        };
    }, []);

    useEffect(() => {
        runtime.current.run = runToggle;
    }, [runToggle]);

    useEffect(() => {
        if (!toast) {
            return;
        }
        const id = setTimeout(() => setToast(null), 3200);
        return () => clearTimeout(id);
    }, [toast]);

    const cleared = world?.checkpoints.filter((c) => c.cleared).length ?? 0;

    const interact = useCallback(() => {
        if (blockedRef.current) {
            return;
        }
        const target = nearbyRef.current;
        if (!target) {
            showToast(t('flagQuest.notice.nothing_nearby'));
            return;
        }
        play('step');
        send({ t: 'interact' });
    }, [play, send, showToast, t]);

    const rotate = useCallback((dir: number) => {
        runtime.current.rotation = (runtime.current.rotation + dir + 4) % 4;
    }, []);

    // Keyboard.
    useEffect(() => {
        const isTyping = (e: KeyboardEvent) =>
            e.target instanceof HTMLInputElement ||
            e.target instanceof HTMLTextAreaElement;
        const down = (e: KeyboardEvent) => {
            if (isTyping(e)) {
                return;
            }
            if (MOVE_KEYS[e.code]) {
                runtime.current.keys.add(e.code);
                if (e.code.startsWith('Arrow')) {
                    e.preventDefault();
                }
            }
            if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
                runtime.current.keys.add('Shift');
            }
            if (e.repeat) {
                return;
            }
            if (e.code === 'KeyE' || e.code === 'Space') {
                e.preventDefault();
                interact();
            } else if (e.code === 'KeyQ') {
                rotate(-1);
            } else if (e.code === 'KeyR') {
                rotate(1);
            } else if (e.code === 'KeyM') {
                setShowMap((v) => !v);
            } else if (e.code === 'Equal' || e.code === 'NumpadAdd') {
                runtime.current.zoom = Math.min(
                    1.8,
                    runtime.current.zoom + 0.15,
                );
            } else if (e.code === 'Minus' || e.code === 'NumpadSubtract') {
                runtime.current.zoom = Math.max(
                    0.55,
                    runtime.current.zoom - 0.15,
                );
            }
        };
        const up = (e: KeyboardEvent) => {
            runtime.current.keys.delete(e.code);
            if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
                runtime.current.keys.delete('Shift');
            }
        };
        const blur = () => runtime.current.keys.clear();
        window.addEventListener('keydown', down);
        window.addEventListener('keyup', up);
        window.addEventListener('blur', blur);
        return () => {
            window.removeEventListener('keydown', down);
            window.removeEventListener('keyup', up);
            window.removeEventListener('blur', blur);
        };
    }, [interact, rotate]);

    // Game loop.
    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx) {
            return;
        }
        let frame = 0;
        let last = performance.now();
        let hudTimer = 0;
        let size = { w: 0, h: 0, dpr: 1 };
        const resize = () => {
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            const w = canvas.clientWidth;
            const h = canvas.clientHeight;
            canvas.width = Math.round(w * dpr);
            canvas.height = Math.round(h * dpr);
            size = { w, h, dpr };
            const base = Math.min(w, h);
            runtime.current.zoom = base < 500 ? 0.72 : base < 800 ? 0.88 : 1;
        };
        resize();
        const ro = new ResizeObserver(resize);
        ro.observe(canvas);

        const tick = (now: number) => {
            frame = requestAnimationFrame(tick);
            const dt = Math.min((now - last) / 1000, 0.05);
            last = now;
            const r = runtime.current;
            const w = worldRef.current;
            if (!w) {
                ctx.setTransform(1, 0, 0, 1, 0, 0);
                ctx.fillStyle = '#4aa9dd';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                return;
            }
            let sx = 0;
            let sy = 0;
            for (const code of r.keys) {
                const v = MOVE_KEYS[code];
                if (v) {
                    sx += v[0];
                    sy += v[1];
                }
            }
            sx += r.joystick.x;
            sy += r.joystick.y;
            const mag = Math.min(Math.hypot(sx, sy), 1);
            r.walking = false;
            if (mag > 0.12 && !blockedRef.current) {
                const dir = screenToWorldDir(sx, sy, r.rotation);
                const running = r.keys.has('Shift') || r.run;
                const speed =
                    (running ? 6.6 : 4.2) *
                    (r.joystick.x || r.joystick.y ? Math.max(mag, 0.45) : 1);
                const next = moveWithCollision(
                    w,
                    r.pos,
                    dir.x,
                    dir.y,
                    speed * dt,
                );
                if (next.x !== r.pos.x || next.y !== r.pos.y) {
                    r.walking = true;
                    r.facing = Math.atan2(sy, sx);
                }
                r.pos = next;
            }
            const follow = 1 - Math.exp(-dt * 6);
            r.camera = {
                x: r.camera.x + (r.pos.x - r.camera.x) * follow,
                y: r.camera.y + (r.pos.y - r.camera.y) * follow,
            };

            if (
                now - r.lastSent > 100 &&
                (r.pos.x !== r.lastSentPos.x || r.pos.y !== r.lastSentPos.y)
            ) {
                r.lastSent = now;
                r.lastSentPos = { ...r.pos };
                send({
                    t: 'move',
                    x: Number(r.pos.x.toFixed(3)),
                    y: Number(r.pos.y.toFixed(3)),
                });
            }

            const rs = raisingRef.current;
            const target = findNearby(w, r.pos);
            if (hudTimer <= now) {
                hudTimer = now + 150;
                const root = rootRef.current;
                if (root) {
                    root.dataset.px = r.pos.x.toFixed(2);
                    root.dataset.py = r.pos.y.toFixed(2);
                    root.dataset.rotation = String(r.rotation);
                }
                const prev = nearbyRef.current;
                const same =
                    (prev === null && target === null) ||
                    (prev?.type === 'flag' && target?.type === 'flag') ||
                    (prev?.type === 'station' &&
                        target?.type === 'station' &&
                        prev.checkpoint.id === target.checkpoint.id &&
                        prev.checkpoint.cleared === target.checkpoint.cleared);
                if (!same) {
                    nearbyRef.current = target;
                    setNearby(target);
                }
            }

            renderer.render(ctx, size.w, size.h, size.dpr, {
                world: w,
                player: r.pos,
                facing: r.facing,
                walking: r.walking,
                time: now,
                rotation: r.rotation,
                camera: r.camera,
                zoom: r.zoom,
                viewOffsetY: size.w < 768 ? Math.min(size.h * 0.08, 70) : 0,
                look: {
                    ...character,
                    name: player.name,
                    grade: player.grade ?? 1,
                },
                activeStation: null,
                nearStation:
                    target?.type === 'station' ? target.checkpoint.id : null,
                raiseProgress: rs
                    ? Math.min((now - rs.startedAt) / rs.duration, 1)
                    : 0,
                completed: completeRef.current !== null,
                gradeLabel:
                    player.grade === KINDERGARTEN
                        ? t('player.kindergartenShort')
                        : t('flagQuest.gradeShort', {
                              grade: player.grade ?? '-',
                          }),
            });

            const mini = miniRef.current;
            const mctx = mini?.getContext('2d');
            if (mini && mctx) {
                const dpr = size.dpr;
                const mw = mini.clientWidth;
                const mh = mini.clientHeight;
                if (mini.width !== Math.round(mw * dpr)) {
                    mini.width = Math.round(mw * dpr);
                    mini.height = Math.round(mh * dpr);
                }
                mctx.setTransform(dpr, 0, 0, dpr, 0, 0);
                const dir = screenToWorldDir(
                    Math.cos(r.facing),
                    Math.sin(r.facing),
                    r.rotation,
                );
                drawMinimap(
                    mctx,
                    { w: mw, h: mh },
                    w,
                    r.pos,
                    Math.atan2(dir.y, dir.x),
                    now,
                );
            }
        };
        frame = requestAnimationFrame(tick);
        return () => {
            cancelAnimationFrame(frame);
            ro.disconnect();
        };
    }, [renderer, send, player, character, t]);

    // Joystick.
    const joyBase = useRef<HTMLDivElement>(null);
    const [knob, setKnob] = useState({ x: 0, y: 0 });
    const joyPointer = useRef<number | null>(null);
    const updateJoy = (e: ReactPointerEvent<HTMLDivElement>) => {
        const el = joyBase.current;
        if (!el) {
            return;
        }
        const rect = el.getBoundingClientRect();
        const max = rect.width / 2 - 14;
        let dx = e.clientX - (rect.left + rect.width / 2);
        let dy = e.clientY - (rect.top + rect.height / 2);
        const len = Math.hypot(dx, dy);
        if (len > max) {
            dx = (dx / len) * max;
            dy = (dy / len) * max;
        }
        setKnob({ x: dx, y: dy });
        runtime.current.joystick = { x: dx / max, y: dy / max };
    };
    const endJoy = () => {
        joyPointer.current = null;
        setKnob({ x: 0, y: 0 });
        runtime.current.joystick = { x: 0, y: 0 };
    };

    const gradeLabel = hasGrade(player.grade)
        ? player.grade === KINDERGARTEN
            ? t('player.kindergarten')
            : t('flagQuest.grade', { grade: player.grade })
        : t('flagQuest.noGrade');
    const missions = conn.welcome?.missions ?? [];
    const allCleared = world ? cleared === world.checkpoints.length : false;
    const objective = !world
        ? ''
        : complete
          ? t('flagQuest.objective.done')
          : allCleared
            ? t('flagQuest.objective.flag')
            : t('flagQuest.objective.gate', {
                  number: cleared + 1,
                  game: t(
                      `flagQuest.kinds.${world.checkpoints[cleared]?.kind ?? 'quick_quiz'}.title`,
                  ),
              });

    const interactLabel =
        nearby?.type === 'station'
            ? t('flagQuest.prompt.station', {
                  game: t(`flagQuest.kinds.${nearby.checkpoint.kind}.title`),
              })
            : nearby?.type === 'flag'
              ? allCleared
                  ? t('flagQuest.prompt.raise')
                  : t('flagQuest.prompt.locked')
              : null;

    return (
        <div className="fq-root" ref={rootRef}>
            <Head title={t('flagQuest.title')}>
                <meta
                    name="viewport"
                    content="width=device-width, initial-scale=1, viewport-fit=cover"
                    head-key="viewport"
                />
                <link
                    href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&family=DM+Sans:wght@400;500;600;700&display=swap"
                    rel="stylesheet"
                />
            </Head>
            <canvas
                ref={canvasRef}
                className="fq-canvas"
                aria-label={t('flagQuest.canvasLabel')}
                role="img"
            />

            {/* Player panel */}
            <div className="fq-safe-top fq-safe-left absolute flex max-w-[calc(100vw-20px)] flex-col gap-2 sm:max-w-[330px]">
                <div className="fq-card flex items-center gap-2.5 p-2 sm:gap-3 sm:p-2.5">
                    <div className="relative size-12 shrink-0 sm:size-14">
                        <div className="size-full overflow-hidden rounded-xl border-[2.5px] border-[#151b2e] bg-[#ffb35c]">
                            <PlayerCharacter
                                character={character}
                                backdrop={false}
                                className="size-full"
                            />
                        </div>
                        <OnlineDot userId={auth?.user?.id} />
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <div className="flex min-w-0 items-center gap-1.5">
                            <p
                                className="truncate text-base leading-tight font-bold"
                                data-testid="fq-player-name"
                            >
                                {player.name}
                            </p>
                            <span className="shrink-0 rounded-full border-2 border-[#151b2e] bg-[#6c5ce7] px-1.5 text-[10px] leading-4 font-bold text-white">
                                {gradeLabel}
                            </span>
                        </div>
                        <div
                            className="h-2.5 overflow-hidden rounded-full border-2 border-[#151b2e] bg-white"
                            role="progressbar"
                            aria-valuemin={0}
                            aria-valuemax={world?.checkpoints.length ?? 3}
                            aria-valuenow={cleared}
                            aria-label={t('flagQuest.hud.progress')}
                            title={t('flagQuest.hud.progress')}
                        >
                            <div
                                className="h-full bg-[repeating-linear-gradient(45deg,#6c5ce7_0_6px,#8577ef_6px_12px)] transition-[width] duration-500"
                                style={{
                                    width: `${world ? (cleared / world.checkpoints.length) * 100 : 0}%`,
                                }}
                            />
                        </div>
                        <div className="flex flex-wrap gap-1 text-[11px]">
                            <span
                                className="fq-pill !min-h-5 !px-1.5"
                                title={t('flagQuest.hud.points')}
                            >
                                <Coins className="size-3 text-[#c77f0c]" />
                                {points}
                            </span>
                            <span
                                className="fq-pill !min-h-5 !px-1.5"
                                title={t('flagQuest.hud.correct')}
                            >
                                <CheckCircle2 className="size-3 text-[#1aab8a]" />
                                {conn.stats.correct}
                            </span>
                            <span
                                className="fq-pill !min-h-5 !px-1.5"
                                title={t('flagQuest.hud.gates')}
                            >
                                <Lock className="size-3 text-[#e85d75]" />
                                {cleared}/{world?.checkpoints.length ?? 3}
                            </span>
                        </div>
                    </div>
                </div>
                <div className="flex gap-1.5">
                    <BackButton
                        href="/portal"
                        label={t('nav.backToPortal')}
                        iconOnly
                    />
                    <button
                        type="button"
                        className="fq-icon-btn"
                        onClick={toggleMuted}
                        aria-pressed={muted}
                        aria-label={t(
                            muted
                                ? 'flagQuest.hud.unmute'
                                : 'flagQuest.hud.mute',
                        )}
                        title={t(
                            muted
                                ? 'flagQuest.hud.unmute'
                                : 'flagQuest.hud.mute',
                        )}
                    >
                        {muted ? (
                            <VolumeX className="size-4" />
                        ) : (
                            <Volume2 className="size-4" />
                        )}
                    </button>
                    <button
                        type="button"
                        className="fq-icon-btn"
                        onClick={() => setShowMap((v) => !v)}
                        aria-pressed={showMap}
                        aria-label={t('flagQuest.hud.map')}
                        title={`${t('flagQuest.hud.map')} (M)`}
                    >
                        <MapIcon className="size-4" />
                    </button>
                    <button
                        type="button"
                        className="fq-icon-btn"
                        onClick={() => setMissionPicker(true)}
                        aria-label={t('flagQuest.hud.missions')}
                        title={t('flagQuest.hud.missions')}
                        disabled={!world}
                    >
                        <Trophy className="size-4" />
                    </button>
                </div>
            </div>

            {/* Right column: mission, objective and minimap (tablet/desktop) */}
            {world && wide && (
                <div className="fq-safe-top fq-safe-right absolute flex w-[230px] flex-col gap-2 lg:w-[250px]">
                    <div className="fq-card flex flex-col gap-2 p-3">
                        <div className="flex items-center justify-between gap-2 text-sm font-bold">
                            <span className="flex min-w-0 items-center gap-1.5">
                                <Flag className="size-4 shrink-0 text-[#e02b2b]" />
                                <span className="truncate">
                                    {t(
                                        `flagQuest.missions.${world.mission}.name`,
                                    )}
                                </span>
                            </span>
                            <span className="flex items-center gap-1">
                                <ConnectionBadge status={conn.status} compact />
                                <button
                                    type="button"
                                    className="grid size-6 place-items-center rounded-md border-2 border-[#151b2e] bg-white text-xs"
                                    aria-expanded={showSteps}
                                    aria-label={t(
                                        showSteps
                                            ? 'flagQuest.hud.collapse'
                                            : 'flagQuest.hud.expand',
                                    )}
                                    title={t(
                                        showSteps
                                            ? 'flagQuest.hud.collapse'
                                            : 'flagQuest.hud.expand',
                                    )}
                                    onClick={() => setShowSteps((v) => !v)}
                                >
                                    {showSteps ? '−' : '+'}
                                </button>
                            </span>
                        </div>
                        <p className="text-xs font-bold text-[#6c5ce7] uppercase">
                            {t('flagQuest.objective.label')}
                        </p>
                        <p
                            className="text-sm leading-snug font-bold"
                            data-testid="fq-objective"
                        >
                            {objective}
                        </p>
                        <ol
                            className={`flex-col gap-1.5 ${showSteps ? 'flex' : 'hidden'}`}
                        >
                            {world.checkpoints.map((cp) => (
                                <li
                                    key={cp.id}
                                    className="flex items-center gap-2 text-xs font-semibold"
                                >
                                    <span
                                        className="grid size-5 shrink-0 place-items-center rounded-full border-2 border-[#151b2e] text-[10px] text-white"
                                        style={{
                                            background: cp.cleared
                                                ? '#27b36a'
                                                : KIND_COLOR[cp.kind],
                                        }}
                                    >
                                        {cp.cleared ? '✓' : cp.id + 1}
                                    </span>
                                    <span
                                        className={
                                            cp.cleared
                                                ? 'line-through opacity-60'
                                                : ''
                                        }
                                    >
                                        {t(`flagQuest.kinds.${cp.kind}.title`)}
                                    </span>
                                </li>
                            ))}
                            <li className="flex items-center gap-2 text-xs font-semibold">
                                <span className="grid size-5 shrink-0 place-items-center rounded-full border-2 border-[#151b2e] bg-white">
                                    <Flag className="size-3 text-[#e02b2b]" />
                                </span>
                                <span
                                    className={
                                        complete
                                            ? 'line-through opacity-60'
                                            : ''
                                    }
                                >
                                    {t('flagQuest.objective.raiseStep')}
                                </span>
                            </li>
                        </ol>
                    </div>
                    {showMap && wide && <Minimap canvasRef={miniRef} large />}
                </div>
            )}

            {/* Phone: compact objective bar + small minimap */}
            {world && !wide && (
                <div className="fq-compact-hud absolute right-2.5 left-2.5 flex flex-col items-end gap-2">
                    <div className="fq-card flex w-full items-center gap-2 px-2.5 py-1.5 text-xs font-bold">
                        <Flag className="size-3.5 shrink-0 text-[#e02b2b]" />
                        <span
                            className="min-w-0 flex-1 truncate"
                            data-testid="fq-objective-compact"
                        >
                            {objective}
                        </span>
                        <span className="shrink-0 tabular-nums">
                            {cleared}/{world.checkpoints.length}
                        </span>
                        <ConnectionBadge status={conn.status} compact />
                    </div>
                    {showMap && !wide && <Minimap canvasRef={miniRef} />}
                </div>
            )}

            {/* Toast */}
            {toast && (
                <div
                    className="pointer-events-none absolute left-1/2 z-30 w-max max-w-[calc(100vw-24px)] -translate-x-1/2 max-md:bottom-[180px] md:top-[max(14px,env(safe-area-inset-top))]"
                    role="status"
                    aria-live="polite"
                >
                    <div
                        className="fq-card fq-toast-enter px-4 py-2 text-center text-sm font-bold"
                        key={toast.id}
                    >
                        {toast.text}
                    </div>
                </div>
            )}

            {/* Interact prompt */}
            {interactLabel && !blocked && (
                <div className="fq-interact-prompt absolute left-1/2 z-20 -translate-x-1/2">
                    <button
                        type="button"
                        onClick={interact}
                        className="fq-card flex min-h-11 items-center gap-2 px-3 py-2 text-sm font-bold"
                        data-testid="fq-interact-prompt"
                    >
                        {!touchUi && <span className="fq-kbd">E</span>}
                        {touchUi && <Hand className="size-4" />}
                        {interactLabel}
                    </button>
                </div>
            )}

            {/* Desktop key hints */}
            {!touchUi && (
                <div
                    className="fq-safe-bottom fq-safe-left absolute hidden max-w-[calc(100vw-300px)] flex-wrap gap-x-3 gap-y-1.5 rounded-xl bg-[#151b2e]/90 px-3 py-2 text-[11px] font-bold text-white shadow-[3px_3px_0_rgba(0,0,0,0.25)] lg:flex"
                    aria-label={t('flagQuest.keys.label')}
                >
                    {[
                        ['W A S D', t('flagQuest.keys.move')],
                        ['Shift', t('flagQuest.keys.run')],
                        ['E', t('flagQuest.keys.interact')],
                        ['Q R', t('flagQuest.keys.rotate')],
                        ['M', t('flagQuest.keys.map')],
                        ['+ −', t('flagQuest.keys.zoom')],
                    ].map(([k, label]) => (
                        <span key={k} className="flex items-center gap-1.5">
                            <span className="fq-kbd">{k}</span>
                            {label}
                        </span>
                    ))}
                </div>
            )}

            {/* Touch controls */}
            {touchUi && world && (
                <>
                    <div
                        className="fq-safe-bottom fq-safe-left absolute"
                        data-testid="fq-joystick"
                    >
                        <div
                            ref={joyBase}
                            className="fq-joystick"
                            role="application"
                            aria-label={t('flagQuest.touch.joystick')}
                            onPointerDown={(e) => {
                                joyPointer.current = e.pointerId;
                                e.currentTarget.setPointerCapture(e.pointerId);
                                updateJoy(e);
                            }}
                            onPointerMove={(e) => {
                                if (joyPointer.current === e.pointerId) {
                                    updateJoy(e);
                                }
                            }}
                            onPointerUp={endJoy}
                            onPointerCancel={endJoy}
                        >
                            <div
                                className="fq-joystick-knob"
                                style={{
                                    transform: `translate(${knob.x}px, ${knob.y}px)`,
                                }}
                            />
                        </div>
                    </div>
                    <div className="fq-safe-bottom fq-safe-right absolute flex items-end gap-3">
                        <div className="flex flex-col items-center gap-2.5">
                            <button
                                type="button"
                                className="fq-action !size-12"
                                onClick={() => rotate(1)}
                                aria-label={t('flagQuest.keys.rotate')}
                                title={t('flagQuest.keys.rotate')}
                            >
                                <RotateCw className="size-5" />
                            </button>
                            <button
                                type="button"
                                className="fq-action !size-14"
                                aria-pressed={runToggle}
                                onClick={() => setRunToggle((v) => !v)}
                                aria-label={t('flagQuest.keys.run')}
                                title={t('flagQuest.keys.run')}
                            >
                                <Footprints className="size-6" />
                            </button>
                        </div>
                        <button
                            type="button"
                            className="fq-action !size-[78px]"
                            data-highlight={interactLabel !== null}
                            onClick={interact}
                            aria-label={t('flagQuest.keys.interact')}
                            data-testid="fq-action"
                        >
                            <Hand className="size-7" />
                        </button>
                    </div>
                </>
            )}

            {/* Blocking states */}
            {(!serviceReady ||
                player.grade === null ||
                conn.status === 'grade_required' ||
                conn.status === 'offline' ||
                !world) && (
                <div className="absolute inset-0 z-40 grid place-items-center bg-[#4aa9dd] p-4">
                    <div className="fq-card flex w-full max-w-md flex-col items-center gap-3 p-6 text-center">
                        <Flag className="size-10 text-[#e02b2b]" />
                        <h1 className="text-2xl font-bold">
                            {t('flagQuest.title')}
                        </h1>
                        {player.grade === null ||
                        conn.status === 'grade_required' ? (
                            <>
                                <p>{t('flagQuest.state.gradeRequired')}</p>
                                <NavButton
                                    href="/dashboard#grade"
                                    icon={GraduationCap}
                                    label={t('flagQuest.state.setGrade')}
                                    variant="primary"
                                />
                            </>
                        ) : !serviceReady ? (
                            <p data-testid="fq-state">
                                {t('flagQuest.state.unavailable')}
                            </p>
                        ) : conn.status === 'offline' ? (
                            <>
                                <p data-testid="fq-state">
                                    {t('flagQuest.state.offline')}
                                </p>
                                <button
                                    type="button"
                                    onClick={conn.retry}
                                    className="fq-primary min-h-11 px-5"
                                >
                                    {t('flagQuest.state.retry')}
                                </button>
                            </>
                        ) : (
                            <p className="animate-pulse" data-testid="fq-state">
                                {t(
                                    conn.status === 'reconnecting'
                                        ? 'flagQuest.state.reconnecting'
                                        : 'flagQuest.state.connecting',
                                )}
                            </p>
                        )}
                        <BackButton
                            href="/portal"
                            label={t('nav.backToPortal')}
                        />
                    </div>
                </div>
            )}

            {world && conn.status === 'reconnecting' && (
                <div className="absolute bottom-1/2 left-1/2 z-30 -translate-x-1/2">
                    <div className="fq-card flex items-center gap-2 px-4 py-2 text-sm font-bold">
                        <WifiOff className="size-4" />
                        {t('flagQuest.state.reconnecting')}
                    </div>
                </div>
            )}

            {challenge && (
                <ChallengeDialog
                    key={challenge.checkpoint}
                    challenge={challenge}
                    look={character}
                    onSound={play}
                    onAnswer={(value) => send({ t: 'answer', value })}
                    onRoll={() => send({ t: 'roll' })}
                    onLeave={() => send({ t: 'leave' })}
                />
            )}

            {raising && !complete && (
                <div className="absolute top-1/3 left-1/2 z-30 -translate-x-1/2">
                    <div className="fq-card px-4 py-2 text-sm font-bold">
                        {t('flagQuest.prompt.raising')}
                    </div>
                </div>
            )}

            {complete && (
                <div
                    className="fixed inset-0 z-50 grid place-items-center bg-[#151b2e]/45 p-3"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="fq-complete-title"
                >
                    <div className="fq-card flex w-full max-w-md flex-col items-center gap-3 p-5 text-center sm:p-6">
                        <Trophy className="size-12 text-[#f5a623]" />
                        <h2
                            id="fq-complete-title"
                            className="text-2xl font-bold"
                        >
                            {t('flagQuest.complete.title')}
                        </h2>
                        <p>
                            {t('flagQuest.complete.body', {
                                mission: t(
                                    `flagQuest.missions.${complete.mission}.name`,
                                ),
                            })}
                        </p>
                        <div className="grid w-full grid-cols-3 gap-2">
                            <Stat
                                label={t('flagQuest.complete.points')}
                                value={`+${complete.points}`}
                            />
                            <Stat
                                label={t('flagQuest.complete.correct')}
                                value={String(complete.correct)}
                            />
                            <Stat
                                label={t('flagQuest.complete.time')}
                                value={formatTime(complete.seconds)}
                            />
                        </div>
                        {complete.flawless && (
                            <p className="fq-pill !bg-[#ffd93d]">
                                {t('flagQuest.complete.flawless')}
                            </p>
                        )}
                        <p className="text-xs text-muted-foreground">
                            {t('flagQuest.complete.saved')}
                        </p>
                        <AdMoment moment="win" muted={muted} />
                        <AdSlot placement="arena.result" className="w-full" />
                        <div className="flex w-full flex-col gap-2 sm:flex-row">
                            <button
                                type="button"
                                className="fq-primary min-h-11 flex-1"
                                onClick={() => setMissionPicker(true)}
                            >
                                {t('flagQuest.complete.next')}
                            </button>
                            <NavButton
                                href="/portal"
                                icon={Trophy}
                                label={t('nav.backToPortal')}
                                className="flex-1"
                            />
                        </div>
                    </div>
                </div>
            )}

            {missionPicker && (
                <div
                    className="fixed inset-0 z-[60] grid place-items-center bg-[#151b2e]/45 p-3"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="fq-missions-title"
                    onClick={(e) =>
                        e.target === e.currentTarget && setMissionPicker(false)
                    }
                    onKeyDown={(e) =>
                        e.key === 'Escape' && setMissionPicker(false)
                    }
                >
                    <div className="fq-card flex max-h-[calc(100dvh-24px)] w-full max-w-lg flex-col gap-3 overflow-y-auto p-4 sm:p-5">
                        <h2
                            id="fq-missions-title"
                            className="text-xl font-bold"
                        >
                            {t('flagQuest.hud.missions')}
                        </h2>
                        <p className="text-sm text-muted-foreground">
                            {t('flagQuest.missionsNote')}
                        </p>
                        <SubjectPicker
                            value={subject}
                            onChange={setSubject}
                            compact
                        />
                        {missions.map((m) => (
                            <button
                                key={m.id}
                                type="button"
                                className={`fq-answer flex-col !items-start ${world?.mission === m.id ? '!bg-[#fff4cc]' : ''}`}
                                onClick={() => {
                                    send({
                                        t: 'mission',
                                        mission: m.id,
                                        subject,
                                    });
                                    conn.clearComplete();
                                    setMissionPicker(false);
                                }}
                            >
                                <span className="flex w-full items-center justify-between gap-2">
                                    <span>
                                        {t(`flagQuest.missions.${m.id}.name`)}
                                    </span>
                                    <span
                                        className="text-[#f5a623]"
                                        aria-label={t('flagQuest.difficulty', {
                                            level: m.difficulty,
                                        })}
                                    >
                                        {'★'.repeat(m.difficulty)}
                                        <span className="text-[#151b2e]/20">
                                            {'★'.repeat(3 - m.difficulty)}
                                        </span>
                                    </span>
                                </span>
                                <span className="text-xs font-normal">
                                    {t(
                                        `flagQuest.missions.${m.id}.description`,
                                    )}
                                </span>
                                <span className="flex flex-wrap gap-1">
                                    {m.kinds.map((k, i) => (
                                        <span
                                            key={i}
                                            className="fq-pill !min-h-5 !text-[10px] text-white"
                                            style={{
                                                background: KIND_COLOR[k],
                                            }}
                                        >
                                            {t(`flagQuest.kinds.${k}.title`)}
                                        </span>
                                    ))}
                                </span>
                            </button>
                        ))}
                        <button
                            type="button"
                            className="fq-icon-btn !h-11 !w-full font-bold"
                            onClick={() => setMissionPicker(false)}
                        >
                            {t('flagQuest.challenge.close')}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

function ConnectionBadge({
    status,
    compact = false,
}: {
    status: string;
    compact?: boolean;
}) {
    const { t } = useTranslations();
    const online = status === 'online';
    return (
        <span
            className={`flex shrink-0 items-center gap-1 ${online ? 'text-[#1aab8a]' : 'text-[#e85d75]'}`}
            data-testid="fq-connection"
        >
            {online ? (
                <Wifi className="size-3.5" />
            ) : (
                <WifiOff className="size-3.5" />
            )}
            {!compact && t(`flagQuest.connection.${status}`)}
            {compact && (
                <span className="sr-only">
                    {t(`flagQuest.connection.${status}`)}
                </span>
            )}
        </span>
    );
}

function Minimap({
    canvasRef,
    large = false,
}: {
    canvasRef: React.RefObject<HTMLCanvasElement | null>;
    large?: boolean;
}) {
    const { t } = useTranslations();
    return (
        <div className="fq-card overflow-hidden p-1.5">
            <p className="flex items-center gap-1 px-1 pb-1 text-[11px] font-bold">
                <MapIcon className="size-3" />
                {t('flagQuest.hud.map')}
            </p>
            <canvas
                ref={canvasRef}
                className={`block rounded-lg border-2 border-[#151b2e] ${large ? 'aspect-[76/48] w-full' : 'h-[70px] w-[110px]'}`}
                aria-hidden="true"
            />
        </div>
    );
}

function Stat({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-xl border-2 border-[#151b2e] bg-white p-2">
            <p className="text-lg font-bold tabular-nums">{value}</p>
            <p className="text-[11px] font-semibold">{label}</p>
        </div>
    );
}

function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
}
