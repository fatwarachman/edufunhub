import { Joystick, type StickVector } from '@/components/games/joystick';
import { type EduKartState } from '@/hooks/use-edu-kart';
import { useTranslations } from '@/hooks/use-translations';
import {
    type Controls,
    emptyControls,
    Interpolator,
    Predictor,
    pressDrift,
    toInput,
} from '@/lib/edu-kart/netcode';
import {
    FX_BACKFIRE,
    FX_TURBO,
    MAX_FRUIT,
    TURBO_WINDOW,
    vehicleById,
} from '@/lib/edu-kart/physics';
import {
    type GateQuestion,
    type ItemKind,
    type RaceEvent,
    type RaceFrame,
    type RacerInfo,
} from '@/lib/edu-kart/protocol';
import {
    type EduKartSceneApi,
    type SceneGate,
    type SceneKart,
} from '@/lib/edu-kart/scene-types';
import { type Track } from '@/lib/edu-kart/track';
import { cn } from '@/lib/utils';
import {
    Bomb,
    ChevronsUp,
    Flame,
    Rocket,
    Shield,
    Star,
    Zap,
} from 'lucide-react';
import {
    type ReactNode,
    useCallback,
    useEffect,
    useRef,
    useState,
} from 'react';

/** Coarse HUD values (React re-renders at most ~8x per second). */
export interface Hud {
    lap: number;
    laps: number;
    rank: number;
    racers: number;
    fruit: number;
    item: ItemKind | '';
    juiced: boolean;
    speed: number;
    charge: number;
    drifting: boolean;
    stage: number;
    lights: number | null;
    finished: boolean;
    finishMs: number;
    ms: number;
    tnt: boolean;
    shield: boolean;
    question: GateQuestion | null;
    /** Metres until the answer boxes (null when no question). */
    toGate: number | null;
    aim: number;
}

export interface Feedback {
    id: string;
    correct: boolean;
    answer?: string;
    hint?: string;
    item?: ItemKind | '';
    at: number;
}

const ITEM_ICONS: Record<ItemKind, typeof Rocket> = {
    rocket: Rocket,
    tnt: Bomb,
    nos: Flame,
    shield: Shield,
};

const SEND_INTERVAL = 33;

function emptyHud(laps: number): Hud {
    return {
        lap: 1,
        laps,
        rank: 1,
        racers: 1,
        fruit: 0,
        item: '',
        juiced: false,
        speed: 0,
        charge: 0,
        drifting: false,
        stage: 0,
        lights: 3,
        finished: false,
        finishMs: 0,
        ms: -3000,
        tnt: false,
        shield: false,
        question: null,
        toGate: null,
        aim: -1,
    };
}

function reducedMotion(): boolean {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function coarsePointer(): boolean {
    return window.matchMedia('(pointer: coarse)').matches;
}

export function formatRaceTime(ms: number): string {
    const total = Math.max(0, Math.floor(ms));
    const m = Math.floor(total / 60000);
    const s = Math.floor((total % 60000) / 1000);
    const cs = Math.floor((total % 1000) / 10);
    return `${m}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

/**
 * The live race: one requestAnimationFrame loop that reads controls,
 * predicts the own kart, interpolates the others, sends inputs ~30/s and
 * renders the three.js scene. HUD numbers go through React at ~8 Hz.
 */
export function RaceArena({
    state,
    track,
    send,
    online,
    onFrame,
    onEvent,
    muted,
}: {
    state: EduKartState;
    track: Track;
    send: (msg: Record<string, unknown>) => boolean;
    online: boolean;
    onFrame: (fn: ((frame: RaceFrame) => void) | null) => void;
    onEvent: (event: RaceEvent, you: number) => void;
    muted: boolean;
}) {
    const { t } = useTranslations();
    const host = useRef<HTMLDivElement>(null);
    const scene = useRef<EduKartSceneApi | null>(null);
    const [sceneError, setSceneError] = useState(false);
    const [loading, setLoading] = useState(true);
    const stick = useRef<StickVector>({ x: 0, y: 0 });
    const keys = useRef(new Set<string>());
    const controls = useRef<Controls>(emptyControls());
    const touchGas = useRef(false);
    const touchBrake = useRef(false);
    const touchDrift = useRef(false);
    const seq = useRef(0);
    const lastSent = useRef<string>('');
    const lastSendAt = useRef(0);
    const latest = useRef<RaceFrame | null>(null);
    const latestAt = useRef(0);
    const interp = useRef(new Interpolator());
    const predictor = useRef<Predictor | null>(null);
    const racersRef = useRef<RacerInfo[]>(state.race?.racers ?? []);
    const [hud, setHud] = useState<Hud>(() => emptyHud(state.laps));
    const [feedback, setFeedback] = useState<Feedback | null>(null);
    const answered = useRef(new Map<string, SceneGate['result']>());
    const lastGate = useRef<GateQuestion | null>(null);
    const onEventRef = useRef(onEvent);
    const mutedRef = useRef(muted);

    useEffect(() => {
        onEventRef.current = onEvent;
        mutedRef.current = muted;
    }, [onEvent, muted]);

    const you =
        state.race?.racers.find((r) => r.seat === state.you)?.racer ?? -1;
    const youRef = useRef(you);
    const myVehicle = state.race?.racers.find((r) => r.racer === you)?.vehicle;

    useEffect(() => {
        youRef.current = you;
        racersRef.current = state.race?.racers ?? [];
        scene.current?.setRacers(racersRef.current);
    }, [you, state.race?.racers]);

    useEffect(() => {
        const p = new Predictor(track, vehicleById(myVehicle ?? 'classic'));
        predictor.current = p;
        interp.current.reset();
        return () => {
            predictor.current = null;
        };
    }, [track, myVehicle]);

    // Server frames: reconcile own kart, buffer others, forward events.
    useEffect(() => {
        onFrame((frame) => {
            const now = performance.now();
            latest.current = frame;
            latestAt.current = now;
            interp.current.push(frame, now);
            const me = frame.racers.find((r) => r.racer === frame.you);
            if (me && predictor.current) {
                predictor.current.reconcile(me, frame.ack, frame.ms < 0);
                const c = controls.current;
                // Keep counters ahead of what the referee has consumed.
                c.hop = Math.max(c.hop, me.last_hop);
                c.turbo = Math.max(c.turbo, me.last_turbo);
                c.fire = Math.max(c.fire, me.last_fire);
            }
            for (const event of frame.events) {
                scene.current?.effect(event);
                onEventRef.current(event, frame.you);
                if (
                    event.k === 'answer' &&
                    event.racer === frame.you &&
                    !answered.current.has(event.gate)
                ) {
                    answered.current.set(event.gate, {
                        choice: event.choice,
                        correct: event.correct,
                        answer: null,
                    });
                    setFeedback({
                        id: event.gate,
                        correct: event.correct,
                        answer: event.answer,
                        hint: event.hint,
                        item: event.item,
                        at: now,
                    });
                }
            }
        });
        return () => onFrame(null);
    }, [onFrame]);

    // Feedback toast fades after 3.5 s.
    useEffect(() => {
        if (!feedback) {
            return;
        }
        const timer = setTimeout(() => setFeedback(null), 3500);
        return () => clearTimeout(timer);
    }, [feedback]);

    // Load the 3D scene lazily (three.js stays out of other pages).
    useEffect(() => {
        let cancelled = false;
        let made: EduKartSceneApi | null = null;
        import('@/lib/edu-kart/scene')
            .then(({ createEduKartScene }) => {
                if (cancelled || !host.current) {
                    return;
                }
                const created = createEduKartScene(host.current, track, {
                    coarse: coarsePointer(),
                    reducedMotion: reducedMotion(),
                });
                created.setRacers(racersRef.current);
                made = created;
                scene.current = created;
                setLoading(false);
            })
            .catch(() => {
                if (!cancelled) {
                    setSceneError(true);
                    setLoading(false);
                }
            });
        return () => {
            cancelled = true;
            made?.dispose();
            scene.current = null;
        };
    }, [track]);

    const fire = useCallback(() => {
        const c = controls.current;
        c.fire += 1;
        const item = latest.current?.racers.find(
            (r) => r.racer === latest.current?.you,
        )?.item;
        if (item) {
            scene.current?.localFire(item);
        }
    }, []);

    const drift = useCallback((down: boolean) => {
        const c = controls.current;
        if (down) {
            const drifting = predictor.current?.kart.drifting ?? false;
            controls.current = pressDrift(c, drifting);
        } else {
            c.drift = false;
        }
    }, []);

    // Keyboard: arrows/WASD steer + gas/brake, Space/Shift drift+turbo, E/Ctrl item.
    useEffect(() => {
        const typing = (target: EventTarget | null) =>
            target instanceof HTMLElement &&
            (target.isContentEditable ||
                ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
        const down = (event: KeyboardEvent) => {
            if (typing(event.target)) {
                return;
            }
            const key = event.key.toLowerCase();
            const handled = [
                'arrowup',
                'arrowdown',
                'arrowleft',
                'arrowright',
                'w',
                'a',
                's',
                'd',
                ' ',
                'shift',
                'e',
                'control',
                'f',
            ];
            if (!handled.includes(key)) {
                return;
            }
            event.preventDefault();
            if (event.repeat) {
                return;
            }
            keys.current.add(key);
            if (key === ' ' || key === 'shift') {
                drift(true);
            }
            if (key === 'e' || key === 'control' || key === 'f') {
                fire();
            }
        };
        const up = (event: KeyboardEvent) => {
            const key = event.key.toLowerCase();
            keys.current.delete(key);
            if (
                (key === ' ' || key === 'shift') &&
                !keys.current.has(' ') &&
                !keys.current.has('shift') &&
                !touchDrift.current
            ) {
                drift(false);
            }
        };
        const blur = () => {
            keys.current.clear();
            controls.current.drift = false;
        };
        window.addEventListener('keydown', down);
        window.addEventListener('keyup', up);
        window.addEventListener('blur', blur);
        return () => {
            window.removeEventListener('keydown', down);
            window.removeEventListener('keyup', up);
            window.removeEventListener('blur', blur);
        };
    }, [drift, fire]);

    // Main loop.
    useEffect(() => {
        let raf = 0;
        let last = performance.now();
        let hudAt = 0;
        const started = last;
        const loop = (now: number) => {
            raf = requestAnimationFrame(loop);
            const elapsed = Math.min(0.1, (now - last) / 1000);
            last = now;
            const frame = latest.current;
            const k = keys.current;
            const c = controls.current;
            const keySteer =
                (k.has('arrowright') || k.has('d') ? 1 : 0) -
                (k.has('arrowleft') || k.has('a') ? 1 : 0);
            const stickX = stick.current.x;
            c.steer =
                keySteer !== 0
                    ? keySteer
                    : Math.abs(stickX) > 0.12
                      ? stickX
                      : 0;
            const gas =
                k.has('arrowup') ||
                k.has('w') ||
                touchGas.current ||
                stick.current.y < -0.55;
            const brake =
                k.has('arrowdown') ||
                k.has('s') ||
                touchBrake.current ||
                stick.current.y > 0.55;
            c.throttle = brake ? -1 : gas ? 1 : 0;

            const p = predictor.current;
            const racing = Boolean(frame && frame.you >= 0);
            const countdown = !frame || frame.ms < 0;

            // Send inputs first (on change immediately, otherwise ~30/s as
            // keep-alive), so the steps predicted below carry the seq of the
            // message that delivers their input and `ack` matches exactly.
            if (online && racing) {
                const input = toInput(c, seq.current + 1);
                const signature = JSON.stringify({ ...input, seq: 0 });
                if (
                    signature !== lastSent.current ||
                    now - lastSendAt.current > SEND_INTERVAL
                ) {
                    if (send({ t: 'input', ...input })) {
                        seq.current += 1;
                        lastSent.current = signature;
                        lastSendAt.current = now;
                    }
                }
            }
            if (p && racing) {
                p.advance(
                    elapsed,
                    seq.current,
                    toInput(c, seq.current),
                    countdown,
                );
            }

            const sc = scene.current;
            if (!frame || !sc) {
                return;
            }
            const you = frame.you;
            const karts: SceneKart[] = [];
            let mine: SceneKart | null = null;
            for (const info of racersRef.current) {
                const live =
                    info.racer === you && p?.started
                        ? null
                        : interp.current.sample(info.racer, now);
                const server = frame.racers.find((r) => r.racer === info.racer);
                if (!server) {
                    continue;
                }
                const own = info.racer === you && p?.started ? p.view() : null;
                const src = own ?? live ?? server;
                const kart: SceneKart = {
                    racer: info.racer,
                    p: src.p,
                    d: src.d,
                    y: src.y,
                    psi: src.psi,
                    v: src.v,
                    drifting: src.drifting,
                    drift_dir: src.drift_dir,
                    charge: src.charge,
                    boosting: src.boost > 0,
                    stunned: src.stun > 0,
                    shield: server.shield_ms > 0,
                    tnt: server.tnt_ms > 0,
                    juiced: server.juiced,
                    finished: server.finish_ms > 0,
                };
                karts.push(kart);
                if (info.racer === you) {
                    mine = kart;
                }
            }
            const q = frame.question;
            if (q && q.id !== lastGate.current?.id) {
                lastGate.current = q;
            }
            const n = q ? q.options.length : 0;
            const aim = q && mine ? track.laneAt(n, mine.d) : -1;
            const gate: SceneGate | null = q
                ? {
                      id: q.id,
                      at: q.at,
                      zone: q.zone,
                      kind: q.kind,
                      labels: q.options.map((option, i) =>
                          q.kind === 'tf'
                              ? t(
                                    option === 'true'
                                        ? 'eduKart.true'
                                        : 'eduKart.false',
                                )
                              : `${String.fromCharCode(65 + i)}. ${option}`,
                      ),
                      aim,
                      result: answered.current.get(q.id) ?? null,
                  }
                : null;
            const clientMs = frame.ms + (now - latestAt.current);
            const lights =
                clientMs < 0
                    ? Math.max(1, Math.min(3, Math.ceil(-clientMs / 1000)))
                    : clientMs < 800
                      ? 0
                      : null;
            sc.render({
                time: (now - started) / 1000,
                you,
                karts,
                projectiles: frame.projectiles,
                hazards: frame.hazards,
                gate,
                taken: frame.taken,
                lights,
            });

            if (now - hudAt > 120) {
                hudAt = now;
                const server = frame.racers.find((r) => r.racer === you);
                const own = p?.started ? p.kart : null;
                setHud({
                    lap: Math.min(state.laps, server?.lap ?? 1),
                    laps: state.laps,
                    rank: server?.rank ?? 1,
                    racers: frame.racers.length,
                    fruit: own?.fruit ?? server?.fruit ?? 0,
                    item: server?.item ?? '',
                    juiced: server?.juiced ?? false,
                    speed: Math.round(Math.abs(own?.v ?? server?.v ?? 0) * 3.6),
                    charge: own?.charge ?? 0,
                    drifting: own?.drifting ?? false,
                    stage: own?.stage ?? 0,
                    lights,
                    finished: (server?.finish_ms ?? 0) > 0,
                    finishMs: server?.finish_ms ?? 0,
                    ms: Math.max(0, frame.ms),
                    tnt: (server?.tnt_ms ?? 0) > 0,
                    shield: (server?.shield_ms ?? 0) > 0,
                    question: q,
                    toGate:
                        q && mine
                            ? Math.max(0, Math.round(q.at - mine.p))
                            : null,
                    aim,
                });
                const fx = own?.fx ?? 0;
                if (!mutedRef.current && fx & (FX_TURBO | FX_BACKFIRE)) {
                    navigator.vibrate?.(fx & FX_TURBO ? 25 : 60);
                }
            }
        };
        raf = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(raf);
    }, [online, send, state.laps, t, track]);

    const ItemIcon = hud.item ? ITEM_ICONS[hud.item] : null;
    const chargeReady = hud.drifting && hud.charge >= TURBO_WINDOW;

    return (
        <section
            className="ek-arena"
            data-testid="ek-arena"
            data-lap={hud.lap}
            data-rank={hud.rank}
            aria-label={t('eduKart.arenaLabel')}
        >
            <div ref={host} className="ek-canvas" data-testid="ek-canvas" />
            {loading && (
                <div className="ek-loading" role="status">
                    {t('eduKart.loading')}
                </div>
            )}
            {sceneError && (
                <div className="ek-loading" role="alert">
                    {t('eduKart.noWebgl')}
                </div>
            )}

            <div className="ek-hud-top">
                <HudChip label={t('eduKart.hud.lap')}>
                    <span data-testid="ek-lap">
                        {hud.lap}/{hud.laps}
                    </span>
                </HudChip>
                <HudChip label={t('eduKart.hud.position')}>
                    <span data-testid="ek-rank">
                        {hud.rank}
                        <small>/{hud.racers}</small>
                    </span>
                </HudChip>
                <HudChip label={t('eduKart.hud.time')}>
                    <span>
                        {formatRaceTime(hud.finished ? hud.finishMs : hud.ms)}
                    </span>
                </HudChip>
                <div
                    className={cn('ek-item', hud.juiced && 'is-juiced')}
                    data-testid="ek-item"
                    data-item={hud.item || 'none'}
                    aria-label={
                        hud.item
                            ? t(`eduKart.items.${hud.item}.name`)
                            : t('eduKart.hud.noItem')
                    }
                >
                    {ItemIcon ? (
                        <ItemIcon className="size-7" aria-hidden="true" />
                    ) : (
                        <span aria-hidden="true">?</span>
                    )}
                </div>
                <div
                    className={cn(
                        'ek-fruit',
                        hud.fruit >= MAX_FRUIT && 'is-juiced',
                    )}
                    data-testid="ek-fruit"
                >
                    <Star className="size-4" aria-hidden="true" />
                    <span>{hud.fruit}</span>
                    <span className="sr-only">{t('eduKart.hud.stars')}</span>
                </div>
            </div>

            {hud.question && (
                <QuestionPanel
                    question={hud.question}
                    toGate={hud.toGate}
                    aim={hud.aim}
                />
            )}

            {feedback && (
                <div
                    className="ek-feedback"
                    data-correct={feedback.correct}
                    data-testid="ek-feedback"
                    role="status"
                >
                    <strong>
                        {t(
                            feedback.correct
                                ? 'eduKart.correct'
                                : 'eduKart.wrong',
                        )}
                    </strong>
                    {feedback.item && (
                        <span>
                            {t('eduKart.gotItem', {
                                item: t(`eduKart.items.${feedback.item}.name`),
                            })}
                        </span>
                    )}
                    {!feedback.correct && feedback.answer && (
                        <span>
                            {t('eduKart.rightAnswer', {
                                answer:
                                    feedback.answer === 'true'
                                        ? t('eduKart.true')
                                        : feedback.answer === 'false'
                                          ? t('eduKart.false')
                                          : feedback.answer,
                            })}
                        </span>
                    )}
                    {!feedback.correct && feedback.hint && (
                        <em>{feedback.hint}</em>
                    )}
                </div>
            )}

            {hud.lights !== null && (
                <div
                    className="ek-lights"
                    aria-live="assertive"
                    data-testid="ek-countdown"
                >
                    {hud.lights === 0 ? t('eduKart.go') : hud.lights}
                </div>
            )}
            {hud.tnt && (
                <div className="ek-alert" role="alert">
                    {t('eduKart.tntShake')}
                </div>
            )}
            {hud.finished && (
                <div
                    className="ek-finish"
                    role="status"
                    data-testid="ek-finished"
                >
                    {t('eduKart.finishedRank', { rank: hud.rank })}
                </div>
            )}

            <div className="ek-speed" aria-hidden="true">
                <div className="ek-speed-value">
                    {hud.speed}
                    <small>km/h</small>
                </div>
                <div className="ek-turbo-meter" data-ready={chargeReady}>
                    <span
                        style={{
                            width: `${Math.min(100, (hud.charge / 1.35) * 100)}%`,
                        }}
                    />
                    <i style={{ left: `${(TURBO_WINDOW / 1.35) * 100}%` }} />
                </div>
                <div className="ek-stage">
                    {[1, 2, 3].map((s) => (
                        <b key={s} data-on={hud.stage >= s} />
                    ))}
                </div>
            </div>

            <div className="ek-touch" data-testid="ek-touch">
                <Joystick
                    vector={stick}
                    label={t('eduKart.controls.steer')}
                    size={128}
                    className="ek-stick"
                />
                <div className="ek-buttons">
                    <TouchButton
                        testid="ek-btn-item"
                        label={t('eduKart.controls.item')}
                        tone="item"
                        disabled={!hud.item}
                        onDown={fire}
                    >
                        {ItemIcon ? (
                            <ItemIcon aria-hidden="true" />
                        ) : (
                            <Rocket aria-hidden="true" />
                        )}
                    </TouchButton>
                    <TouchButton
                        testid="ek-btn-drift"
                        label={t('eduKart.controls.drift')}
                        tone={chargeReady ? 'ready' : 'drift'}
                        onDown={() => {
                            touchDrift.current = true;
                            drift(true);
                        }}
                        onUp={() => {
                            touchDrift.current = false;
                            if (
                                !keys.current.has(' ') &&
                                !keys.current.has('shift')
                            ) {
                                drift(false);
                            }
                        }}
                    >
                        <Zap aria-hidden="true" />
                    </TouchButton>
                    <TouchButton
                        testid="ek-btn-brake"
                        label={t('eduKart.controls.brake')}
                        tone="brake"
                        onDown={() => {
                            touchBrake.current = true;
                        }}
                        onUp={() => {
                            touchBrake.current = false;
                        }}
                    >
                        <ChevronsUp className="rotate-180" aria-hidden="true" />
                    </TouchButton>
                    <TouchButton
                        testid="ek-btn-gas"
                        label={t('eduKart.controls.gas')}
                        tone="gas"
                        onDown={() => {
                            touchGas.current = true;
                        }}
                        onUp={() => {
                            touchGas.current = false;
                        }}
                    >
                        <ChevronsUp aria-hidden="true" />
                    </TouchButton>
                </div>
            </div>
            <p className="ek-keys">{t('eduKart.controls.keyboard')}</p>
        </section>
    );
}

function HudChip({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="ek-chip">
            <span className="ek-chip-label">{label}</span>
            <span className="ek-chip-value">{children}</span>
        </div>
    );
}

function TouchButton({
    label,
    tone,
    testid,
    disabled,
    onDown,
    onUp,
    children,
}: {
    label: string;
    tone: 'gas' | 'brake' | 'drift' | 'ready' | 'item';
    testid: string;
    disabled?: boolean;
    onDown: () => void;
    onUp?: () => void;
    children: ReactNode;
}) {
    const active = useRef<number | null>(null);
    const release = () => {
        if (active.current !== null) {
            active.current = null;
            onUp?.();
        }
    };
    return (
        <button
            type="button"
            className="ek-btn"
            data-tone={tone}
            data-testid={testid}
            aria-label={label}
            disabled={disabled}
            onPointerDown={(event) => {
                event.preventDefault();
                event.currentTarget.setPointerCapture(event.pointerId);
                active.current = event.pointerId;
                onDown();
            }}
            onPointerUp={release}
            onPointerCancel={release}
            onLostPointerCapture={release}
            onContextMenu={(event) => event.preventDefault()}
        >
            {children}
        </button>
    );
}

function QuestionPanel({
    question,
    toGate,
    aim,
}: {
    question: GateQuestion;
    toGate: number | null;
    aim: number;
}) {
    const { t } = useTranslations();
    return (
        <div
            className="ek-question"
            data-testid="ek-question"
            data-kind={question.kind}
            role="status"
        >
            <div className="ek-question-head">
                <span>
                    {t(
                        question.kind === 'tf'
                            ? 'eduKart.trueFalse'
                            : 'eduKart.multipleChoice',
                    )}
                </span>
                {toGate !== null && (
                    <span data-testid="ek-to-gate">
                        {t('eduKart.toGate', { meters: toGate })}
                    </span>
                )}
            </div>
            <p className="ek-question-text">{question.text}</p>
            <ol className="ek-options" data-count={question.options.length}>
                {question.options.map((option, i) => (
                    <li key={i} data-aim={aim === i} data-lane={i}>
                        <b>
                            {question.kind === 'tf'
                                ? i === 0
                                    ? 'B'
                                    : 'S'
                                : String.fromCharCode(65 + i)}
                        </b>
                        <span>
                            {question.kind === 'tf'
                                ? t(
                                      option === 'true'
                                          ? 'eduKart.true'
                                          : 'eduKart.false',
                                  )
                                : option}
                        </span>
                    </li>
                ))}
            </ol>
            <p className="ek-question-help">{t('eduKart.hitToAnswer')}</p>
        </div>
    );
}
