import { Joystick, type StickVector } from '@/components/games/joystick';
import {
    type GameSubject,
    rememberedSubject,
    SubjectFallbackNote,
    SubjectPicker,
} from '@/components/multiplayer/subject-picker';
import {
    BackButton,
    NavButton,
    SiteNav,
    useGameBackHref,
} from '@/components/site-nav';
import { useGameAudio } from '@/hooks/use-game-audio';
import {
    type SkyServerState,
    useSkyConnection,
} from '@/hooks/use-sky-connection';
import { useTranslations } from '@/hooks/use-translations';
import { hasGrade, KINDERGARTEN } from '@/lib/grade';
import {
    createLocalReferee,
    hasPassed,
    hitBox,
    SKY_RULES,
    type SkyRoundState,
} from '@/lib/sky-quiz';
import { type SharedData } from '@/types';
import { Head, router, usePage } from '@inertiajs/react';
import {
    Coins,
    Crosshair,
    GraduationCap,
    PartyPopper,
    Pause,
    Plane,
    Play,
    RotateCcw,
    Shield,
    Trophy,
    Volume2,
    VolumeX,
    Wifi,
    WifiOff,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

interface SkyPlayer {
    name: string;
    grade: number | null;
    color: string;
    accessory: string;
}

interface SkyQuizProps {
    player: SkyPlayer | null;
    points: number;
    serviceReady: boolean;
    wsUrl: string | null;
}

interface Target {
    x: number;
    y: number;
    option: number;
    alive: boolean;
}
interface Shot {
    x: number;
    y: number;
}
interface Enemy {
    x: number;
    y: number;
    kind: 'drone' | 'rock';
}
interface Particle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    life: number;
}
interface Arena {
    x: number;
    y: number;
    targetX: number;
    targetY: number;
    questionId: string | null;
    options: string[];
    targets: Target[];
    spawnAt: number;
    shots: Shot[];
    enemies: Enemy[];
    particles: Particle[];
    time: number;
    cooldown: number;
    spawn: number;
    invincible: number;
    speed: number;
    awaiting: boolean;
    missSent: boolean;
    /** Current bank angle (radians); eases toward the horizontal velocity. */
    bank: number;
    lastX: number;
    /** Screen shake strength (px) and its decay. */
    shake: number;
    /** Red flash after a wrong answer (seconds left). */
    wrongFlash: number;
    /** Orange flash after crashing into a meteor (seconds left). */
    crashFlash: number;
    marks: Mark[];
    debris: Debris[];
    confetti: Confetti[];
}
interface Mark {
    x: number;
    y: number;
    kind: 'wrong' | 'correct';
    life: number;
}
interface Debris {
    x: number;
    y: number;
    vx: number;
    vy: number;
    spin: number;
    angle: number;
    size: number;
    life: number;
}
interface Confetti {
    x: number;
    y: number;
    vx: number;
    vy: number;
    angle: number;
    spin: number;
    color: string;
}

type Screen = 'ready' | 'playing' | 'paused' | 'ended';

const WIDTH = 900;
const HEIGHT = 600;
const GUEST_GRADES = [1, 2, 3, 4];

function newArena(): Arena {
    return {
        x: 450,
        y: 510,
        targetX: 450,
        targetY: 510,
        questionId: null,
        options: [],
        targets: [],
        spawnAt: 0,
        shots: [],
        enemies: [],
        particles: [],
        time: 0,
        cooldown: 0,
        spawn: 2,
        invincible: 0,
        speed: 32,
        awaiting: false,
        missSent: false,
        bank: 0,
        lastX: 450,
        shake: 0,
        wrongFlash: 0,
        crashFlash: 0,
        marks: [],
        debris: [],
        confetti: [],
    };
}

const CONFETTI_COLORS = ['#ffd93d', '#ff6584', '#00c9a7', '#6c5ce7', '#ff9e44'];
const MAX_BANK = 0.42;

function spawnConfetti(a: Arena) {
    a.confetti = Array.from({ length: 140 }, () => ({
        x: Math.random() * WIDTH,
        y: -20 - Math.random() * HEIGHT * 0.6,
        vx: (Math.random() - 0.5) * 120,
        vy: 90 + Math.random() * 160,
        angle: Math.random() * Math.PI,
        spin: (Math.random() - 0.5) * 10,
        color: CONFETTI_COLORS[
            Math.floor(Math.random() * CONFETTI_COLORS.length)
        ],
    }));
}

function meteor(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    time: number,
) {
    const tail = ctx.createLinearGradient(x, y - 70, x, y);
    tail.addColorStop(0, 'rgba(255,158,68,0)');
    tail.addColorStop(1, 'rgba(255,120,40,0.75)');
    ctx.fillStyle = tail;
    ctx.beginPath();
    ctx.moveTo(x - 16, y - 6);
    ctx.lineTo(x + Math.sin(time * 20) * 3, y - 72);
    ctx.lineTo(x + 16, y - 6);
    ctx.fill();
    ctx.fillStyle = '#7a6a5d';
    ctx.strokeStyle = '#3b2f2a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = 0; i < 9; i++) {
        const angle = (i / 9) * Math.PI * 2;
        const radius = 21 + ((i * 7) % 5) - 2;
        const px = x + Math.cos(angle) * radius;
        const py = y + Math.sin(angle) * radius;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#5a4c42';
    for (const [cx, cy, r] of [
        [-7, -5, 5],
        [6, 4, 4],
        [5, -9, 3],
    ]) {
        ctx.beginPath();
        ctx.arc(x + cx, y + cy, r, 0, Math.PI * 2);
        ctx.fill();
    }
}

function jet(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    time: number,
    bank = 0,
) {
    ctx.save();
    ctx.translate(x, y);
    // Bank into the turn: roll the airframe and foreshorten the wings.
    ctx.rotate(bank * 0.55);
    ctx.scale(1 - Math.abs(bank) * 0.35, 1);
    for (const offset of [-10, 10]) {
        ctx.fillStyle = '#ffae42';
        ctx.beginPath();
        ctx.moveTo(offset - 5, 27);
        ctx.lineTo(offset, 45 + Math.sin(time * 35) * 8);
        ctx.lineTo(offset + 5, 27);
        ctx.fill();
    }
    ctx.fillStyle = '#acc4d2';
    ctx.strokeStyle = '#233b50';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -44);
    ctx.lineTo(9, -17);
    ctx.lineTo(16, -6);
    ctx.lineTo(45, 19);
    ctx.lineTo(43, 25);
    ctx.lineTo(15, 18);
    ctx.lineTo(16, 30);
    ctx.lineTo(24, 35);
    ctx.lineTo(9, 35);
    ctx.lineTo(5, 23);
    ctx.lineTo(-5, 23);
    ctx.lineTo(-9, 35);
    ctx.lineTo(-24, 35);
    ctx.lineTo(-16, 30);
    ctx.lineTo(-15, 18);
    ctx.lineTo(-43, 25);
    ctx.lineTo(-45, 19);
    ctx.lineTo(-16, -6);
    ctx.lineTo(-9, -17);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#355e76';
    ctx.fillRect(-14, 12, 7, 20);
    ctx.fillRect(7, 12, 7, 20);
    ctx.fillStyle = '#61def3';
    ctx.beginPath();
    ctx.ellipse(0, -16, 5, 14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = '#f7f9fc';
    ctx.beginPath();
    ctx.moveTo(-32, 18);
    ctx.lineTo(-15, 10);
    ctx.moveTo(32, 18);
    ctx.lineTo(15, 10);
    ctx.stroke();
    ctx.restore();
}

export default function SkyQuiz({
    player,
    points,
    serviceReady,
    wsUrl,
}: SkyQuizProps) {
    const { t, i18n } = useTranslations();
    const [subjectChoice, setSubjectChoice] = useState<GameSubject>(() =>
        typeof window === 'undefined' ? 'mix' : rememberedSubject(),
    );
    const { locale } = usePage<SharedData>().props;
    const signedIn = player !== null;
    const backHref = useGameBackHref();
    const online = signedIn && serviceReady && Boolean(wsUrl);
    const canvas = useRef<HTMLCanvasElement>(null);
    const arena = useRef<Arena>(newArena());
    const keys = useRef(new Set<string>());
    const firing = useRef(false);
    const stick = useRef<StickVector>({ x: 0, y: 0 });
    const screenRef = useRef<Screen>('ready');
    const audio = useGameAudio();
    const playSound = useRef(audio.play);
    const [guestGrade, setGuestGrade] = useState(1);
    const grade = signedIn ? player.grade : guestGrade;
    const local = useMemo(() => createLocalReferee(guestGrade), [guestGrade]);
    const [screen, setScreenState] = useState<Screen>('ready');
    const [round, setRound] = useState<SkyRoundState | null>(null);
    const [message, setMessage] = useState('');
    const [subjectFallback, setSubjectFallback] = useState<string | null>(null);
    /** Question shown in the card; switches only when the next round becomes playable. */
    const [shown, setShown] = useState<SkyRoundState['question'] | null>(null);
    const shownTimer = useRef<number | undefined>(undefined);
    const [earned, setEarned] = useState<number | null>(null);
    const resultRef = useRef<HTMLElement>(null);
    /** Account points when the flight ended; used to confirm the server total includes the award. */
    const [pointsBase, setPointsBase] = useState<number | null>(null);
    const pointsRef = useRef(points);
    useEffect(() => {
        pointsRef.current = points;
    }, [points]);

    useEffect(() => {
        playSound.current = audio.play;
    }, [audio.play]);

    useEffect(() => {
        if (locale && i18n.language !== locale) {
            void i18n.changeLanguage(locale);
        }
    }, [locale, i18n]);

    const setScreen = useCallback((next: Screen) => {
        screenRef.current = next;
        setScreenState(next);
    }, []);

    const feedbackText = useCallback(
        (fb: SkyRoundState['feedback']): string => {
            if (!fb) return '';
            return t(`sky.feedback.${fb.kind}`, {
                answer: fb.answer ?? '',
                score: fb.score ?? 0,
            });
        },
        [t],
    );

    /** Apply a referee snapshot (server or local) to the arena and HUD. */
    const apply = useCallback(
        (state: SkyRoundState) => {
            const a = arena.current;
            a.awaiting = false;
            a.speed = state.speed || a.speed;
            setRound(state);
            if (state.feedback) {
                setMessage(feedbackText(state.feedback));
                const kind = state.feedback.kind;
                playSound.current(
                    kind === 'correct'
                        ? 'correct'
                        : kind === 'removed'
                          ? 'shoot'
                          : 'wrong',
                );
                if (kind === 'crash') {
                    a.invincible = 1.5;
                    a.crashFlash = 0.45;
                    a.shake = Math.max(a.shake, 16);
                }
                if (
                    kind === 'wrong_touch' ||
                    kind === 'shot_correct' ||
                    kind === 'missed'
                ) {
                    a.wrongFlash = 0.8;
                    a.shake = Math.max(a.shake, 9);
                    a.marks.push({
                        x: kind === 'missed' ? WIDTH / 2 : a.x,
                        y: kind === 'missed' ? HEIGHT / 2 : a.y - 70,
                        kind: 'wrong',
                        life: 0.9,
                    });
                }
                if (kind === 'correct') {
                    a.marks.push({
                        x: a.x,
                        y: a.y - 70,
                        kind: 'correct',
                        life: 0.9,
                    });
                }
                if (kind === 'removed' && state.feedback.option !== undefined) {
                    const target = a.targets.find(
                        (tg) => tg.option === state.feedback?.option,
                    );
                    if (target) target.alive = false;
                }
            }
            if (state.phase === 'done') {
                a.targets = [];
                a.questionId = null;
                keys.current.clear();
                firing.current = false;
                setEarned(state.result?.points ?? 0);
                setPointsBase(pointsRef.current);
                if (state.result?.passed) {
                    spawnConfetti(a);
                    playSound.current('correct');
                }
                setScreen('ended');
                return;
            }
            const q = state.question;
            if (q && q.id !== a.questionId) {
                window.clearTimeout(shownTimer.current);
                shownTimer.current = window.setTimeout(
                    () => setShown(q),
                    q.delay,
                );
                a.questionId = q.id;
                a.options = q.options;
                a.targets = [];
                a.missSent = false;
                a.spawnAt = a.time + q.delay / 1000;
                a.enemies = [];
            }
            if (q) {
                for (const target of a.targets) {
                    if (q.removed.includes(target.option)) target.alive = false;
                }
            }
        },
        [feedbackText, setScreen],
    );

    const connection = useSkyConnection(online ? wsUrl : null, locale ?? 'id', {
        onState: (state: SkyServerState) => {
            setSubjectFallback(
                state.subject_fallback ? (state.subject ?? null) : null,
            );
            if (state.phase === 'question' && screenRef.current === 'ready') {
                // Resumed flight after a reload: keep it paused until the player resumes.
                setScreen('paused');
                if (!state.paused) connection.send({ t: 'pause' });
            }
            if (state.phase === 'ready') {
                setRound(state);
                return;
            }
            apply(state);
        },
        onScore: (score) => setRound((r) => (r ? { ...r, score } : r)),
        onError: (code) => {
            arena.current.awaiting = false;
            if (code !== 'too_early' && code !== 'wrong_phase') {
                setMessage(t('sky.errors.generic'));
            }
        },
    });

    const sendOnline = useCallback(
        (msg: Record<string, unknown>) => {
            if (!connection.send(msg)) {
                arena.current.awaiting = false;
                setMessage(t('sky.errors.offline'));
            }
        },
        [connection, t],
    );

    const referee = useMemo(
        () => ({
            start: () => {
                if (online) sendOnline({ t: 'start', subject: subjectChoice });
                else apply(local.start());
            },
            touch: (option: number) => {
                if (online) sendOnline({ t: 'touch', option });
                else {
                    const s = local.touch(option);
                    if (s) apply(s);
                }
            },
            shoot: (option: number) => {
                if (online) sendOnline({ t: 'shoot', option });
                else {
                    const s = local.shoot(option);
                    if (s) apply(s);
                }
            },
            miss: () => {
                if (online) sendOnline({ t: 'miss' });
                else {
                    const s = local.miss();
                    if (s) apply(s);
                }
            },
            crash: () => {
                if (online) sendOnline({ t: 'crash' });
                else {
                    const s = local.crash();
                    if (s) apply(s);
                }
            },
            drone: () => {
                if (online) sendOnline({ t: 'drone' });
                else {
                    const score = local.drone();
                    if (score !== null)
                        setRound((r) => (r ? { ...r, score } : r));
                }
            },
            pause: (paused: boolean) => {
                if (online) sendOnline({ t: paused ? 'pause' : 'resume' });
            },
        }),
        [online, sendOnline, local, apply, subjectChoice],
    );
    const refereeRef = useRef(referee);
    useEffect(() => {
        refereeRef.current = referee;
    }, [referee]);

    const expectedPoints =
        online && pointsBase !== null && earned !== null
            ? pointsBase + earned
            : null;
    const synced = expectedPoints === null || points >= expectedPoints;
    const [syncAttempts, setSyncAttempts] = useState(0);
    useEffect(() => {
        if (synced || syncAttempts >= 6) return;
        const timer = window.setTimeout(() => {
            router.reload({
                only: ['points'],
                onFinish: () => setSyncAttempts((n) => n + 1),
            });
        }, 1000);
        return () => window.clearTimeout(timer);
    }, [synced, syncAttempts]);

    useEffect(() => {
        if (screen === 'ended') {
            resultRef.current?.scrollIntoView({
                behavior: 'smooth',
                block: 'center',
            });
        }
    }, [screen]);

    const ready = online ? connection.status === 'online' : true;
    const needsGrade =
        signedIn &&
        (player.grade === null || connection.status === 'grade_required');

    const start = () => {
        if (!ready || needsGrade) return;
        const a = newArena();
        a.awaiting = true;
        arena.current = a;
        keys.current.clear();
        firing.current = false;
        setEarned(null);
        setShown(null);
        setPointsBase(null);
        setSyncAttempts(0);
        setMessage('');
        setScreen('playing');
        referee.start();
        playSound.current('correct');
        canvas.current?.focus();
    };
    const togglePause = () => {
        if (screenRef.current === 'playing') {
            keys.current.clear();
            firing.current = false;
            referee.pause(true);
            setScreen('paused');
        } else if (screenRef.current === 'paused') {
            referee.pause(false);
            setScreen('playing');
            canvas.current?.focus();
        }
    };

    useEffect(() => {
        const element = canvas.current;
        if (!element) return;
        const ctx = element.getContext('2d');
        if (!ctx) return;
        let frame = 0;
        let last = 0;
        const resize = () => {
            const scale = Math.min(window.devicePixelRatio || 1, 2);
            element.width = WIDTH * scale;
            element.height = HEIGHT * scale;
            ctx.setTransform(scale, 0, 0, scale, 0, 0);
        };
        resize();
        const movementKeys = [
            'ArrowUp',
            'ArrowDown',
            'ArrowLeft',
            'ArrowRight',
            ' ',
            'w',
            'a',
            's',
            'd',
        ];
        const keydown = (event: KeyboardEvent) => {
            if (screenRef.current !== 'playing') return;
            if (event.key === 'p' || event.key === 'Escape') {
                event.preventDefault();
                document
                    .querySelector<HTMLButtonElement>('[data-testid=sky-pause]')
                    ?.click();
                return;
            }
            if (movementKeys.includes(event.key)) {
                event.preventDefault();
                keys.current.add(event.key);
            }
        };
        const keyup = (event: KeyboardEvent) => keys.current.delete(event.key);
        const blur = () => {
            keys.current.clear();
            firing.current = false;
            stick.current = { x: 0, y: 0 };
            if (screenRef.current === 'playing') {
                refereeRef.current.pause(true);
                screenRef.current = 'paused';
                setScreenState('paused');
            }
        };
        const visibility = () => {
            if (document.hidden) blur();
        };
        window.addEventListener('keydown', keydown);
        window.addEventListener('keyup', keyup);
        window.addEventListener('blur', blur);
        document.addEventListener('visibilitychange', visibility);
        window.addEventListener('resize', resize);
        const burst = (a: Arena, x: number, y: number) => {
            for (let i = 0; i < 12; i++)
                a.particles.push({
                    x,
                    y,
                    vx: (Math.random() - 0.5) * 180,
                    vy: (Math.random() - 0.5) * 180,
                    life: 0.5,
                });
        };
        const draw = (timestamp: number) => {
            const dt = Math.min((timestamp - (last || timestamp)) / 1000, 0.04);
            last = timestamp;
            const a = arena.current;
            const active = screenRef.current === 'playing';
            const time = a.time || timestamp / 1000;
            ctx.clearRect(0, 0, WIDTH, HEIGHT);
            const sky = ctx.createLinearGradient(0, 0, 0, HEIGHT);
            sky.addColorStop(0, '#174568');
            sky.addColorStop(1, '#77c9d6');
            ctx.fillStyle = sky;
            ctx.fillRect(0, 0, WIDTH, HEIGHT);
            ctx.fillStyle = '#ffffff18';
            for (let i = 0; i < 12; i++) {
                const y = ((i * 101 + time * (18 + (i % 3) * 8)) % 760) - 80;
                const x = (i * 197) % WIDTH;
                ctx.beginPath();
                ctx.ellipse(x, y, 90, 22, -0.15, 0, Math.PI * 2);
                ctx.fill();
            }
            if (active) {
                a.time += dt;
                a.cooldown -= dt;
                a.invincible -= dt;
                a.spawn -= dt;
                let dx = 0;
                let dy = 0;
                if (keys.current.has('ArrowLeft') || keys.current.has('a'))
                    dx--;
                if (keys.current.has('ArrowRight') || keys.current.has('d'))
                    dx++;
                if (keys.current.has('ArrowUp') || keys.current.has('w')) dy--;
                if (keys.current.has('ArrowDown') || keys.current.has('s'))
                    dy++;
                const pad = stick.current;
                if (pad.x || pad.y) {
                    // Analog: speed follows how far the stick is pushed.
                    a.x += pad.x * 400 * dt;
                    a.y += pad.y * 400 * dt;
                    a.targetX = a.x;
                    a.targetY = a.y;
                } else if (dx || dy) {
                    const length = Math.hypot(dx, dy);
                    a.x += (dx / length) * 380 * dt;
                    a.y += (dy / length) * 380 * dt;
                    a.targetX = a.x;
                    a.targetY = a.y;
                } else {
                    a.x += (a.targetX - a.x) * (1 - Math.exp(-12 * dt));
                    a.y += (a.targetY - a.y) * (1 - Math.exp(-12 * dt));
                }
                a.x = Math.max(48, Math.min(WIDTH - 48, a.x));
                a.y = Math.max(60, Math.min(HEIGHT - 45, a.y));
                const vx = dt > 0 ? (a.x - a.lastX) / dt : 0;
                a.lastX = a.x;
                const targetBank = Math.max(
                    -MAX_BANK,
                    Math.min(MAX_BANK, vx / 900),
                );
                a.bank += (targetBank - a.bank) * (1 - Math.exp(-10 * dt));
                if (
                    (keys.current.has(' ') || firing.current) &&
                    a.cooldown <= 0
                ) {
                    a.shots.push({ x: a.x, y: a.y - 42 });
                    a.cooldown = 0.22;
                    playSound.current('shoot');
                }
                if (a.questionId && !a.targets.length && a.time >= a.spawnAt) {
                    a.targets = a.options.map((_, option) => ({
                        x: 170 + option * 280,
                        y: -40,
                        option,
                        alive: true,
                    }));
                }
                if (a.spawn <= 0 && a.targets.length) {
                    a.enemies.push({
                        x: 55 + Math.random() * 790,
                        y: -30,
                        kind: Math.random() > 0.5 ? 'drone' : 'rock',
                    });
                    a.spawn = 2.5;
                }
                for (const bullet of a.shots) bullet.y -= 540 * dt;
                for (const enemy of a.enemies) enemy.y += 85 * dt;
                if (!a.awaiting) {
                    for (const target of a.targets) {
                        if (!target.alive) continue;
                        target.y += a.speed * dt;
                        target.x +=
                            Math.sin(a.time * 1.3 + target.option) * 7 * dt;
                        for (const bullet of a.shots) {
                            if (
                                bullet.y > -50 &&
                                hitBox(
                                    bullet.x,
                                    bullet.y,
                                    target.x,
                                    target.y,
                                    210,
                                    52,
                                )
                            ) {
                                bullet.y = -100;
                                target.alive = false;
                                burst(a, target.x, target.y);
                                a.awaiting = true;
                                refereeRef.current.shoot(target.option);
                                break;
                            }
                        }
                        if (
                            target.alive &&
                            !a.awaiting &&
                            hitBox(a.x, a.y, target.x, target.y, 230, 80)
                        ) {
                            target.alive = false;
                            burst(a, target.x, target.y);
                            a.awaiting = true;
                            refereeRef.current.touch(target.option);
                        }
                        if (a.awaiting) break;
                    }
                    if (
                        !a.awaiting &&
                        !a.missSent &&
                        a.targets.length &&
                        a.targets.every((tg) => !tg.alive || tg.y > HEIGHT + 40)
                    ) {
                        a.missSent = true;
                        a.awaiting = true;
                        refereeRef.current.miss();
                    }
                }
                for (const enemy of a.enemies) {
                    for (const bullet of a.shots)
                        if (
                            bullet.y > -50 &&
                            hitBox(bullet.x, bullet.y, enemy.x, enemy.y, 54, 48)
                        ) {
                            bullet.y = -100;
                            burst(a, enemy.x, enemy.y);
                            enemy.y = HEIGHT + 100;
                            if (enemy.kind === 'drone')
                                refereeRef.current.drone();
                        }
                    if (
                        a.invincible <= 0 &&
                        hitBox(a.x, a.y, enemy.x, enemy.y, 65, 65)
                    ) {
                        burst(a, enemy.x, enemy.y);
                        for (let i = 0; i < 10; i++) {
                            a.debris.push({
                                x: enemy.x,
                                y: enemy.y,
                                vx: (Math.random() - 0.5) * 320,
                                vy: (Math.random() - 0.8) * 260,
                                spin: (Math.random() - 0.5) * 12,
                                angle: Math.random() * Math.PI,
                                size: 4 + Math.random() * 7,
                                life: 0.9,
                            });
                        }
                        enemy.y = HEIGHT + 100;
                        a.invincible = 1.5;
                        a.crashFlash = 0.45;
                        a.shake = Math.max(a.shake, 16);
                        refereeRef.current.crash();
                    }
                }
                a.shots = a.shots.filter((b) => b.y > -50);
                a.enemies = a.enemies.filter((e) => e.y < HEIGHT + 60);
                for (const p of a.particles) {
                    p.life -= dt;
                    p.x += p.vx * dt;
                    p.y += p.vy * dt;
                }
                a.particles = a.particles.filter((p) => p.life > 0);
            }
            // Effects keep animating outside active play (e.g. end screen confetti).
            a.shake = Math.max(0, a.shake - 40 * dt);
            a.wrongFlash = Math.max(0, a.wrongFlash - dt);
            a.crashFlash = Math.max(0, a.crashFlash - dt);
            for (const d of a.debris) {
                d.life -= dt;
                d.x += d.vx * dt;
                d.y += d.vy * dt;
                d.vy += 420 * dt;
                d.angle += d.spin * dt;
            }
            a.debris = a.debris.filter((d) => d.life > 0);
            for (const m of a.marks) m.life -= dt;
            a.marks = a.marks.filter((m) => m.life > 0);
            for (const c of a.confetti) {
                c.x += c.vx * dt;
                c.y += c.vy * dt;
                c.angle += c.spin * dt;
            }
            a.confetti = a.confetti.filter((c) => c.y < HEIGHT + 20);
            ctx.save();
            if (a.shake > 0) {
                ctx.translate(
                    (Math.random() - 0.5) * a.shake,
                    (Math.random() - 0.5) * a.shake,
                );
            }
            if (screenRef.current !== 'ready') {
                for (const tg of a.targets)
                    if (tg.alive) {
                        ctx.fillStyle = '#fff9e6';
                        ctx.strokeStyle = '#20364a';
                        ctx.lineWidth = 3;
                        ctx.beginPath();
                        ctx.roundRect(tg.x - 105, tg.y - 26, 210, 52, 14);
                        ctx.fill();
                        ctx.stroke();
                        ctx.fillStyle = '#20364a';
                        ctx.font = 'bold 18px system-ui';
                        ctx.textAlign = 'center';
                        ctx.fillText(
                            a.options[tg.option] ?? '',
                            tg.x,
                            tg.y + 6,
                            195,
                        );
                    }
                for (const e of a.enemies) {
                    if (e.kind === 'rock') {
                        meteor(ctx, e.x, e.y, time);
                        continue;
                    }
                    ctx.fillStyle = '#ef6688';
                    ctx.strokeStyle = '#263e52';
                    ctx.lineWidth = 3;
                    ctx.beginPath();
                    {
                        ctx.moveTo(e.x, e.y + 24);
                        ctx.lineTo(e.x - 28, e.y - 10);
                        ctx.lineTo(e.x, e.y - 2);
                        ctx.lineTo(e.x + 28, e.y - 10);
                        ctx.closePath();
                    }
                    ctx.fill();
                    ctx.stroke();
                }
                ctx.fillStyle = '#fff176';
                for (const b of a.shots) ctx.fillRect(b.x - 3, b.y, 6, 20);
                for (const p of a.particles) {
                    ctx.globalAlpha = Math.max(0, p.life * 2);
                    ctx.fillStyle = '#ffde80';
                    ctx.fillRect(p.x, p.y, 6, 6);
                }
                ctx.globalAlpha = 1;
                if (a.invincible > 0)
                    ctx.globalAlpha = 0.55 + Math.sin(time * 30) * 0.3;
                jet(ctx, a.x, a.y, time, a.bank);
                ctx.globalAlpha = 1;
                for (const d of a.debris) {
                    ctx.save();
                    ctx.globalAlpha = Math.max(0, d.life);
                    ctx.translate(d.x, d.y);
                    ctx.rotate(d.angle);
                    ctx.fillStyle = '#6b5a4e';
                    ctx.fillRect(-d.size / 2, -d.size / 2, d.size, d.size);
                    ctx.restore();
                }
                for (const m of a.marks) {
                    const alpha = Math.min(1, m.life * 2);
                    const lift = (0.9 - m.life) * 40;
                    ctx.save();
                    ctx.globalAlpha = alpha;
                    ctx.translate(m.x, m.y - lift);
                    ctx.lineWidth = 9;
                    ctx.lineCap = 'round';
                    ctx.strokeStyle =
                        m.kind === 'wrong' ? '#e02b2b' : '#11a37f';
                    ctx.beginPath();
                    if (m.kind === 'wrong') {
                        ctx.moveTo(-18, -18);
                        ctx.lineTo(18, 18);
                        ctx.moveTo(18, -18);
                        ctx.lineTo(-18, 18);
                    } else {
                        ctx.moveTo(-18, 0);
                        ctx.lineTo(-5, 14);
                        ctx.lineTo(20, -14);
                    }
                    ctx.stroke();
                    ctx.restore();
                }
            } else
                jet(
                    ctx,
                    450,
                    420 + Math.sin(time) * 8,
                    time,
                    Math.sin(time * 0.8) * 0.2,
                );
            ctx.restore();
            if (a.wrongFlash > 0) {
                ctx.fillStyle = `rgba(224,43,43,${(a.wrongFlash / 0.8) * 0.38})`;
                ctx.fillRect(0, 0, WIDTH, HEIGHT);
                ctx.strokeStyle = `rgba(224,43,43,${a.wrongFlash / 0.8})`;
                ctx.lineWidth = 14;
                ctx.strokeRect(0, 0, WIDTH, HEIGHT);
            }
            if (a.crashFlash > 0) {
                const glow = ctx.createRadialGradient(
                    a.x,
                    a.y,
                    10,
                    a.x,
                    a.y,
                    260,
                );
                glow.addColorStop(0, `rgba(255,180,60,${a.crashFlash * 1.6})`);
                glow.addColorStop(1, 'rgba(255,90,30,0)');
                ctx.fillStyle = glow;
                ctx.fillRect(0, 0, WIDTH, HEIGHT);
            }
            for (const c of a.confetti) {
                ctx.save();
                ctx.translate(c.x, c.y);
                ctx.rotate(c.angle);
                ctx.fillStyle = c.color;
                ctx.fillRect(-5, -3, 10, 6);
                ctx.restore();
            }
            element.dataset.bank = a.bank.toFixed(2);
            element.dataset.effects = [
                a.wrongFlash > 0 && 'wrong',
                a.crashFlash > 0 && 'crash',
                a.confetti.length > 0 && 'confetti',
            ]
                .filter(Boolean)
                .join(',');
            element.dataset.targets = a.targets
                .filter((tg) => tg.alive)
                .map(
                    (tg) =>
                        `${tg.option}:${Math.round(tg.x)}:${Math.round(tg.y)}`,
                )
                .join(',');
            element.dataset.jet = `${Math.round(a.x)}:${Math.round(a.y)}`;
            element.dataset.options = a.options.join('|');
            frame = requestAnimationFrame(draw);
        };
        frame = requestAnimationFrame(draw);
        return () => {
            cancelAnimationFrame(frame);
            window.removeEventListener('keydown', keydown);
            window.removeEventListener('keyup', keyup);
            window.removeEventListener('blur', blur);
            window.removeEventListener('resize', resize);
            document.removeEventListener('visibilitychange', visibility);
        };
    }, []);

    const shields = round?.shields ?? SKY_RULES.shields;
    const maxShields = round?.max ?? SKY_RULES.shields;
    const total = round?.total ?? SKY_RULES.rounds;
    const currentRound =
        round?.phase === 'done'
            ? Math.min(round.round, total)
            : Math.min((round?.round ?? 0) + 1, total);
    const question = shown ?? round?.question;
    const subject = question
        ? t(`flagQuest.subjects.${question.subject}`, {
              defaultValue: question.subject,
          })
        : t('sky.mission');
    const totalPoints = Math.max(points, expectedPoints ?? points);
    const history = round?.history ?? [];
    const answered = Math.min(history.length, total);
    const progressPercent = Math.round((answered / total) * 100);
    const result = round?.result;
    const correctCount = result?.correct ?? round?.correct ?? 0;
    const percent = result?.percent ?? Math.floor((correctCount * 100) / total);
    const passed = result?.passed ?? hasPassed(correctCount, total);
    const shieldsOut =
        result?.reason === 'shields' || (screen === 'ended' && shields === 0);

    const overlayTitle =
        screen === 'ready'
            ? t('sky.overlay.readyTitle', {
                  name: player?.name ?? t('sky.pilot'),
              })
            : screen === 'paused'
              ? t('sky.overlay.pausedTitle')
              : passed
                ? t('sky.overlay.congratsTitle', {
                      name: player?.name ?? t('sky.pilot'),
                  })
                : shieldsOut
                  ? t('sky.overlay.crashedTitle')
                  : t('sky.overlay.doneTitle');

    return (
        <div className="min-h-dvh bg-[#eef5f7] text-[#20364a]">
            <Head title={`${t('sky.title')} — EduFunHub`} />
            <header className="flex items-center justify-between gap-2 border-b-2 border-[#20364a] bg-white px-3 py-3 sm:gap-3 sm:px-4">
                <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
                    <BackButton
                        href={backHref}
                        label={t(
                            signedIn ? 'nav.backToPortal' : 'nav.backToGames',
                        )}
                        iconOnly
                    />
                    <h1 className="flex min-w-0 items-center gap-2 font-display text-lg font-bold sm:text-xl">
                        <Plane className="size-6 shrink-0" />
                        <span className="truncate">{t('sky.title')}</span>
                    </h1>
                </div>
                <SiteNav compact className="shrink-0" />
            </header>
            <main className="mx-auto flex max-w-6xl flex-col gap-3 p-3 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm font-bold">
                        {signedIn ? (
                            <>
                                <span
                                    className="inline-flex min-h-11 items-center gap-2 rounded-xl border-2 border-[#20364a] bg-white px-3"
                                    data-testid="sky-player"
                                >
                                    <GraduationCap className="size-4" />
                                    <span className="truncate">
                                        {player.name} •{' '}
                                        {hasGrade(player.grade)
                                            ? player.grade === KINDERGARTEN
                                                ? t('player.kindergarten')
                                                : t('sky.grade', {
                                                      grade: player.grade,
                                                  })
                                            : t('sky.noGrade')}
                                    </span>
                                </span>
                                <span
                                    className="inline-flex min-h-11 items-center gap-2 rounded-xl border-2 border-[#20364a] bg-[#ffd93d] px-3"
                                    data-testid="sky-points"
                                >
                                    <Coins className="size-4" />
                                    {t('sky.points', { count: totalPoints })}
                                </span>
                                <span
                                    className={`inline-flex min-h-11 items-center gap-1.5 rounded-xl border-2 border-[#20364a] px-3 text-xs ${connection.status === 'online' ? 'bg-[#c9f5e5]' : 'bg-[#ffe1e1]'}`}
                                    data-testid="sky-connection"
                                    data-status={connection.status ?? 'none'}
                                >
                                    {connection.status === 'online' ? (
                                        <Wifi className="size-4" />
                                    ) : (
                                        <WifiOff className="size-4" />
                                    )}
                                    <span className="sr-only sm:not-sr-only">
                                        {t(
                                            `sky.connection.${connection.status ?? 'offline'}`,
                                        )}
                                    </span>
                                </span>
                            </>
                        ) : (
                            <label className="flex items-center gap-2">
                                {t('sky.gradeLabel')}
                                <select
                                    aria-label={t('sky.gradeLabel')}
                                    disabled={
                                        screen === 'playing' ||
                                        screen === 'paused'
                                    }
                                    value={guestGrade}
                                    onChange={(e) =>
                                        setGuestGrade(Number(e.target.value))
                                    }
                                    className="min-h-11 rounded-xl border-2 border-[#20364a] bg-white px-3"
                                    data-testid="sky-guest-grade"
                                >
                                    {GUEST_GRADES.map((n) => (
                                        <option key={n} value={n}>
                                            {t('sky.grade', { grade: n })}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        )}
                    </div>
                    <div className="flex items-center gap-1.5">
                        <button
                            type="button"
                            onClick={audio.toggleMuted}
                            aria-pressed={!audio.muted}
                            aria-label={t(
                                audio.muted ? 'sky.unmute' : 'sky.mute',
                            )}
                            title={t(audio.muted ? 'sky.unmute' : 'sky.mute')}
                            className="edu-nav-btn edu-nav-btn--icon"
                        >
                            {audio.muted ? (
                                <VolumeX aria-hidden="true" />
                            ) : (
                                <Volume2 aria-hidden="true" />
                            )}
                        </button>
                        <button
                            type="button"
                            onClick={togglePause}
                            disabled={
                                screen !== 'playing' && screen !== 'paused'
                            }
                            hidden={screen === 'ended'}
                            className="edu-nav-btn disabled:opacity-50"
                            data-testid="sky-pause"
                        >
                            {screen === 'paused' ? (
                                <Play aria-hidden="true" />
                            ) : (
                                <Pause aria-hidden="true" />
                            )}
                            <span>
                                {t(
                                    screen === 'paused'
                                        ? 'sky.resume'
                                        : 'sky.pause',
                                )}
                            </span>
                        </button>
                    </div>
                </div>
                <div
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border-2 border-[#20364a] bg-white p-3 text-sm font-bold"
                    aria-live="polite"
                    data-testid="sky-hud"
                >
                    <span data-testid="sky-score">
                        {t('sky.score', { score: round?.score ?? 0 })}
                    </span>
                    <span
                        className="inline-flex items-center gap-1"
                        data-testid="sky-shields"
                    >
                        <Shield className="size-4" />
                        {t('sky.shields', { shields, max: maxShields })}
                    </span>
                    <span data-testid="sky-round">
                        {t('sky.round', { round: currentRound, total })}
                    </span>
                </div>
                <div
                    className="flex flex-col gap-1.5 rounded-xl border-2 border-[#20364a] bg-white p-3"
                    data-testid="sky-progress"
                >
                    <div className="flex items-center justify-between gap-2 text-xs font-bold">
                        <span id="sky-progress-label">
                            {t('sky.progress', { done: answered, total })}
                        </span>
                        <span className="tabular-nums">
                            {t('sky.progressCorrect', {
                                correct: correctCount,
                            })}
                        </span>
                    </div>
                    <div
                        role="progressbar"
                        aria-labelledby="sky-progress-label"
                        aria-valuemin={0}
                        aria-valuemax={total}
                        aria-valuenow={answered}
                        className="relative h-4 overflow-hidden rounded-full border-2 border-[#20364a] bg-[#e7eef2]"
                    >
                        <div
                            className="absolute inset-y-0 left-0 bg-[repeating-linear-gradient(45deg,#6c5ce7_0_8px,#8577ef_8px_16px)] transition-[width] duration-500"
                            style={{ width: `${progressPercent}%` }}
                        />
                    </div>
                    <ol className="flex gap-1" aria-hidden="true">
                        {Array.from({ length: total }, (_, i) => (
                            <li
                                key={i}
                                className={`h-2 flex-1 rounded-full ${
                                    i < history.length
                                        ? history[i]
                                            ? 'bg-[#11a37f]'
                                            : 'bg-[#e02b2b]'
                                        : i === history.length &&
                                            screen !== 'ended'
                                          ? 'bg-[#ffd93d]'
                                          : 'bg-[#d5dee4]'
                                }`}
                                data-state={
                                    i < history.length
                                        ? history[i]
                                            ? 'correct'
                                            : 'wrong'
                                        : 'pending'
                                }
                            />
                        ))}
                    </ol>
                </div>
                <div className="rounded-xl border-2 border-[#20364a] bg-[#fff9e6] px-4 py-3">
                    <span className="text-xs font-bold text-[#845ec2]">
                        {subject}
                        {hasGrade(grade)
                            ? ` • ${grade === KINDERGARTEN ? t('player.kindergarten') : t('sky.grade', { grade })}`
                            : ''}
                    </span>
                    {subjectFallback && screen !== 'ended' && (
                        <SubjectFallbackNote
                            subject={subjectFallback}
                            className="my-1"
                        />
                    )}
                    <p
                        className="font-display text-lg font-bold sm:text-xl"
                        data-testid="sky-question"
                    >
                        {screen === 'ended'
                            ? t(passed ? 'sky.finishedPassed' : 'sky.finished')
                            : (question?.text ?? t('sky.intro'))}
                    </p>
                    <p
                        className="min-h-5 text-xs font-bold"
                        role="status"
                        data-testid="sky-feedback"
                    >
                        {message || t('sky.hint')}
                    </p>
                </div>
                <div className="relative mx-auto w-full max-w-[min(100%,calc((100dvh-300px)*1.5))] overflow-hidden rounded-2xl border-3 border-[#20364a] bg-[#174568] shadow-[5px_5px_0_#20364a] [@media(max-height:500px)_and_(orientation:landscape)]:max-w-[min(100%,calc(90dvh*1.5))]">
                    <canvas
                        ref={canvas}
                        tabIndex={0}
                        data-testid="sky-canvas"
                        aria-label={t('sky.canvasLabel')}
                        className="block aspect-[3/2] w-full touch-none outline-none focus-visible:ring-4 focus-visible:ring-amber-300"
                        onPointerDown={(e) => {
                            e.currentTarget.setPointerCapture(e.pointerId);
                            e.currentTarget.focus();
                        }}
                        onPointerMove={(e) => {
                            if (
                                screenRef.current !== 'playing' ||
                                (e.pointerType !== 'mouse' && !e.buttons)
                            )
                                return;
                            const rect =
                                e.currentTarget.getBoundingClientRect();
                            arena.current.targetX =
                                ((e.clientX - rect.left) / rect.width) * WIDTH;
                            arena.current.targetY =
                                ((e.clientY - rect.top) / rect.height) * HEIGHT;
                        }}
                    >
                        {t('sky.noCanvas')}
                    </canvas>
                    {screen !== 'playing' && screen !== 'ended' && (
                        <div className="fixed inset-x-0 top-[70px] bottom-0 z-40 flex items-center justify-center bg-[#12283e]/70 p-3 backdrop-blur-sm sm:absolute sm:inset-0 sm:z-auto sm:p-4">
                            <div
                                className="flex max-h-full max-w-md flex-col gap-2 overflow-y-auto rounded-2xl border-2 border-[#20364a] bg-white p-3 text-center shadow-lg sm:gap-3 sm:p-5"
                                data-testid="sky-intro"
                            >
                                <Plane className="mx-auto hidden size-9 text-[#287899] sm:block" />
                                <h2 className="font-display text-xl font-bold">
                                    {overlayTitle}
                                </h2>
                                {needsGrade ? (
                                    <p className="text-sm">
                                        {t('sky.overlay.needGrade')}
                                    </p>
                                ) : (
                                    <p className="text-sm">
                                        {online
                                            ? t('sky.overlay.onlineRules', {
                                                  rounds: SKY_RULES.rounds,
                                                  grade: player?.grade ?? '',
                                              })
                                            : signedIn
                                              ? t('sky.overlay.unavailable')
                                              : t('sky.overlay.guestRules')}
                                    </p>
                                )}
                                {online &&
                                    !needsGrade &&
                                    screen === 'ready' && (
                                        <SubjectPicker
                                            value={subjectChoice}
                                            onChange={setSubjectChoice}
                                        />
                                    )}
                                {needsGrade ? (
                                    <NavButton
                                        href="/dashboard#grade"
                                        icon={GraduationCap}
                                        label={t('sky.setGrade')}
                                        variant="primary"
                                        block
                                    />
                                ) : (
                                    <button
                                        type="button"
                                        onClick={
                                            screen === 'paused'
                                                ? togglePause
                                                : start
                                        }
                                        disabled={
                                            !ready || (signedIn && !online)
                                        }
                                        className="flex min-h-11 items-center justify-center gap-2 rounded-xl border-2 border-[#20364a] bg-[#fff176] px-4 py-3 font-black text-[#20364a] disabled:opacity-60"
                                        data-testid="sky-start"
                                    >
                                        <Play className="size-5" />
                                        {screen === 'paused'
                                            ? t('sky.resume')
                                            : !ready
                                              ? t('sky.connecting')
                                              : t('sky.start')}
                                    </button>
                                )}
                                {!signedIn && (
                                    <NavButton
                                        href="/login"
                                        icon={Trophy}
                                        label={t('sky.loginForPoints')}
                                        block
                                    />
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {screen === 'ended' && (
                    <section
                        ref={resultRef}
                        className={`flex flex-col items-center gap-3 rounded-2xl border-3 border-[#20364a] p-4 text-center shadow-[5px_5px_0_#20364a] sm:p-6 ${passed ? 'bg-[#fff6d6]' : 'bg-white'}`}
                        data-testid="sky-overlay"
                        aria-live="polite"
                    >
                        <h2 className="font-display text-2xl font-bold">
                            {overlayTitle}
                        </h2>

                        <div
                            className="flex flex-col gap-2 text-sm"
                            data-testid="sky-result"
                            data-passed={passed ? 'true' : 'false'}
                            data-reason={shieldsOut ? 'shields' : 'finished'}
                        >
                            {passed && (
                                <p
                                    className="sky-congrats inline-flex items-center justify-center gap-2 font-display text-3xl font-black text-[#f5a623]"
                                    data-testid="sky-congrats"
                                >
                                    <PartyPopper className="size-8" />
                                    {t('sky.result.congrats')}
                                </p>
                            )}
                            <p className="text-2xl font-black tabular-nums">
                                {t('sky.result.percent', {
                                    percent,
                                })}
                            </p>
                            <p>
                                {t('sky.result.summary', {
                                    score: round?.score ?? 0,
                                    correct: correctCount,
                                    total,
                                })}
                            </p>
                            {shieldsOut && (
                                <p
                                    className="rounded-xl border-2 border-[#e02b2b] bg-[#ffe9e9] px-3 py-2 text-left text-xs font-semibold"
                                    data-testid="sky-shields-note"
                                >
                                    {t('sky.result.shieldsExplained', {
                                        max: maxShields,
                                        done: answered,
                                        total,
                                    })}
                                </p>
                            )}
                            {!passed && (
                                <p className="text-xs">
                                    {t('sky.result.passHint', {
                                        percent: SKY_RULES.passPercent,
                                    })}
                                </p>
                            )}
                            {online ? (
                                <div
                                    className="flex flex-col gap-0.5 rounded-xl border-2 border-[#20364a] bg-[#fff9e6] px-3 py-2"
                                    data-testid="sky-earned"
                                    data-synced={synced ? 'true' : 'false'}
                                >
                                    <p className="inline-flex items-center justify-center gap-1 font-bold text-[#116a56]">
                                        <Trophy className="size-4" />
                                        {earned
                                            ? t('sky.result.earned', {
                                                  points: earned,
                                              })
                                            : t('sky.result.noPoints')}
                                    </p>
                                    <p className="text-xs font-semibold">
                                        {synced
                                            ? t('sky.result.accountTotal', {
                                                  points: totalPoints,
                                              })
                                            : t('sky.result.syncing')}
                                    </p>
                                </div>
                            ) : (
                                <p className="text-xs">
                                    {t('sky.result.demo')}
                                </p>
                            )}
                        </div>
                        <div className="flex w-full max-w-sm flex-col gap-2">
                            <button
                                type="button"
                                onClick={start}
                                disabled={!ready || (signedIn && !online)}
                                className="flex min-h-11 items-center justify-center gap-2 rounded-xl border-2 border-[#20364a] bg-[#fff176] px-4 py-3 font-black text-[#20364a] disabled:opacity-60"
                                data-testid="sky-start"
                            >
                                <RotateCcw className="size-5" />
                                {t('sky.playAgain')}
                            </button>
                            {signedIn ? (
                                <NavButton
                                    href="/portal"
                                    icon={Trophy}
                                    label={t('nav.backToPortal')}
                                    block
                                />
                            ) : (
                                <NavButton
                                    href="/login"
                                    icon={Trophy}
                                    label={t('sky.loginForPoints')}
                                    block
                                />
                            )}
                        </div>
                    </section>
                )}
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <Joystick
                        vector={stick}
                        disabled={screen !== 'playing'}
                        label={t('sky.joystick')}
                    />
                    <p className="max-w-xl flex-1 text-xs font-semibold">
                        <span className="[@media(pointer:coarse)]:hidden">
                            {t(
                                online
                                    ? 'sky.footer.online'
                                    : 'sky.footer.guest',
                            )}
                        </span>
                        <span className="hidden [@media(pointer:coarse)]:inline">
                            {t('sky.joystickHint')}
                        </span>
                    </p>
                    <button
                        type="button"
                        disabled={screen !== 'playing'}
                        onPointerDown={(e) => {
                            e.currentTarget.setPointerCapture(e.pointerId);
                            firing.current = true;
                        }}
                        onPointerUp={() => {
                            firing.current = false;
                        }}
                        onPointerCancel={() => {
                            firing.current = false;
                        }}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ')
                                firing.current = true;
                        }}
                        onKeyUp={() => {
                            firing.current = false;
                        }}
                        onBlur={() => {
                            firing.current = false;
                        }}
                        className="ml-auto flex size-[132px] shrink-0 touch-none flex-col items-center justify-center gap-1 rounded-full border-[3px] border-[#20364a] bg-[#ff9e44] font-black shadow-[3px_3px_0px_#20364a] select-none active:translate-y-0.5 active:shadow-[1px_1px_0px_#20364a] disabled:opacity-50"
                        data-testid="sky-fire"
                    >
                        <Crosshair className="size-8" />
                        <span>{t('sky.fire')}</span>
                    </button>
                </div>
            </main>
        </div>
    );
}
