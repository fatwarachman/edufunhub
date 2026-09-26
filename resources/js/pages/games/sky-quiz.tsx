import { useGameAudio } from '@/hooks/use-game-audio';
import {
    answerOutcome,
    hitBox,
    shuffledQuestions,
    type SkyQuestion,
} from '@/lib/sky-quiz';
import { Head, Link } from '@inertiajs/react';
import {
    ArrowLeft,
    Crosshair,
    Pause,
    Plane,
    Play,
    RotateCcw,
    Volume2,
    VolumeX,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

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
interface Flight {
    running: boolean;
    paused: boolean;
    ended: boolean;
    x: number;
    y: number;
    targetX: number;
    targetY: number;
    score: number;
    lives: number;
    round: number;
    questions: SkyQuestion[];
    targets: Target[];
    shots: Shot[];
    enemies: Enemy[];
    particles: Particle[];
    time: number;
    cooldown: number;
    spawn: number;
    next: number;
    invincible: number;
    feedback: string;
}
const WIDTH = 900;
const HEIGHT = 600;
function newFlight(grade: number): Flight {
    return {
        running: false,
        paused: false,
        ended: false,
        x: 450,
        y: 510,
        targetX: 450,
        targetY: 510,
        score: 0,
        lives: 5,
        round: 0,
        questions: shuffledQuestions(grade),
        targets: [],
        shots: [],
        enemies: [],
        particles: [],
        time: 0,
        cooldown: 0,
        spawn: 2,
        next: 0,
        invincible: 0,
        feedback: '',
    };
}
function jet(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    time: number,
) {
    ctx.save();
    ctx.translate(x, y);
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

export default function SkyQuiz() {
    const canvas = useRef<HTMLCanvasElement>(null);
    const flight = useRef<Flight | null>(null);
    const keys = useRef(new Set<string>());
    const firing = useRef(false);
    const audio = useGameAudio();
    const playSound = useRef(audio.play);
    const [grade, setGrade] = useState(1);
    const [screen, setScreen] = useState<
        'ready' | 'playing' | 'paused' | 'ended'
    >('ready');
    const [hud, setHud] = useState({
        score: 0,
        lives: 5,
        round: 1,
        total: 8,
        text: 'Pilih kelas, lalu mulai terbang.',
        subject: 'Misi pengetahuan',
        feedback: '',
    });

    const publish = (s: Flight) => {
        const displayRound = s.next > 0 ? Math.max(0, s.round - 1) : s.round;
        const q = s.questions[Math.min(displayRound, s.questions.length - 1)];
        setHud({
            score: s.score,
            lives: s.lives,
            round: Math.min(s.round + 1, s.questions.length),
            total: s.questions.length,
            text: q.text,
            subject: q.subject,
            feedback: s.feedback,
        });
    };
    const start = () => {
        const s = newFlight(grade);
        s.running = true;
        flight.current = s;
        keys.current.clear();
        firing.current = false;
        setScreen('playing');
        publish(s);
        audio.play('correct');
        canvas.current?.focus();
    };
    const pause = () => {
        const s = flight.current;
        if (!s?.running) return;
        s.paused = !s.paused;
        keys.current.clear();
        firing.current = false;
        setScreen(s.paused ? 'paused' : 'playing');
        if (!s.paused) canvas.current?.focus();
    };

    useEffect(() => {
        const element = canvas.current;
        if (!element) return;
        const ctx = element.getContext('2d');
        if (!ctx) return;
        let frame = 0;
        let last = 0;
        let lastHud = 0;
        const resize = () => {
            const scale = Math.min(window.devicePixelRatio || 1, 2);
            element.width = WIDTH * scale;
            element.height = HEIGHT * scale;
            ctx.setTransform(scale, 0, 0, scale, 0, 0);
        };
        resize();
        const keydown = (event: KeyboardEvent) => {
            if (!flight.current?.running || flight.current.paused) return;
            if (
                [
                    'ArrowUp',
                    'ArrowDown',
                    'ArrowLeft',
                    'ArrowRight',
                    ' ',
                    'w',
                    'a',
                    's',
                    'd',
                ].includes(event.key)
            ) {
                event.preventDefault();
                keys.current.add(event.key);
            }
        };
        const keyup = (event: KeyboardEvent) => keys.current.delete(event.key);
        const blur = () => {
            keys.current.clear();
            firing.current = false;
            if (flight.current?.running) {
                flight.current.paused = true;
                setScreen('paused');
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
        const burst = (s: Flight, x: number, y: number) => {
            for (let i = 0; i < 12; i++)
                s.particles.push({
                    x,
                    y,
                    vx: (Math.random() - 0.5) * 180,
                    vy: (Math.random() - 0.5) * 180,
                    life: 0.5,
                });
        };
        const end = (s: Flight) => {
            s.running = false;
            s.ended = true;
            keys.current.clear();
            firing.current = false;
            setScreen('ended');
            publish(s);
        };
        const resolve = (s: Flight, target: Target, shot: boolean) => {
            const q = s.questions[s.round];
            const correct = target.option === q.answer;
            const outcome = answerOutcome(correct, shot);
            s.score += outcome.points;
            s.lives = Math.max(0, s.lives - outcome.damage);
            target.alive = false;
            burst(s, target.x, target.y);
            s.feedback = shot
                ? correct
                    ? `Itu jawaban benar: ${q.options[q.answer]}. Jangan ditembak!`
                    : 'Jawaban salah disingkirkan! +20 poin'
                : correct
                  ? 'Tepat! +100 poin. Terbang terus!'
                  : `Belum tepat. Jawaban: ${q.options[q.answer]}`;
            playSound.current(
                correct && !shot
                    ? 'correct'
                    : outcome.damage
                      ? 'wrong'
                      : 'shoot',
            );
            if (outcome.resolve) {
                s.targets = [];
                s.next = 2.2;
                s.round++;
            }
            if (!s.lives) end(s);
            publish(s);
        };
        const draw = (timestamp: number) => {
            const dt = Math.min((timestamp - (last || timestamp)) / 1000, 0.04);
            last = timestamp;
            const s = flight.current;
            const time = s?.time ?? timestamp / 1000;
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
            if (s?.running && !s.paused) {
                s.time += dt;
                s.cooldown -= dt;
                s.invincible -= dt;
                s.spawn -= dt;
                s.next -= dt;
                let dx = 0;
                let dy = 0;
                if (keys.current.has('ArrowLeft') || keys.current.has('a'))
                    dx--;
                if (keys.current.has('ArrowRight') || keys.current.has('d'))
                    dx++;
                if (keys.current.has('ArrowUp') || keys.current.has('w')) dy--;
                if (keys.current.has('ArrowDown') || keys.current.has('s'))
                    dy++;
                if (dx || dy) {
                    const length = Math.hypot(dx, dy);
                    s.targetX = s.x + (dx / length) * 380 * dt;
                    s.targetY = s.y + (dy / length) * 380 * dt;
                    s.x = s.targetX;
                    s.y = s.targetY;
                } else {
                    s.x += (s.targetX - s.x) * (1 - Math.exp(-12 * dt));
                    s.y += (s.targetY - s.y) * (1 - Math.exp(-12 * dt));
                }
                s.x = Math.max(48, Math.min(WIDTH - 48, s.x));
                s.y = Math.max(60, Math.min(HEIGHT - 45, s.y));
                if (
                    (keys.current.has(' ') || firing.current) &&
                    s.cooldown <= 0
                ) {
                    s.shots.push({ x: s.x, y: s.y - 42 });
                    s.cooldown = 0.22;
                    playSound.current('shoot');
                }
                if (!s.targets.length && s.next <= 0) {
                    if (s.round >= s.questions.length) end(s);
                    else {
                        s.targets = s.questions[s.round].options.map(
                            (_, option) => ({
                                x: 170 + option * 280,
                                y: -40,
                                option,
                                alive: true,
                            }),
                        );
                        s.enemies = [];
                        s.feedback = '';
                        publish(s);
                    }
                }
                if (s.spawn <= 0 && s.targets.length) {
                    s.enemies.push({
                        x: 55 + Math.random() * 790,
                        y: -30,
                        kind: Math.random() > 0.5 ? 'drone' : 'rock',
                    });
                    s.spawn = 2.5;
                }
                for (const bullet of s.shots) bullet.y -= 540 * dt;
                for (const enemy of s.enemies) enemy.y += 85 * dt;
                for (const target of [...s.targets]) {
                    if (
                        !target.alive ||
                        !s.targets.includes(target) ||
                        !s.running
                    )
                        continue;
                    target.y += 35 * dt;
                    target.x += Math.sin(s.time * 1.3 + target.option) * 7 * dt;
                    for (const bullet of s.shots) {
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
                            resolve(s, target, true);
                            break;
                        }
                    }
                    if (
                        target.alive &&
                        s.targets.includes(target) &&
                        hitBox(s.x, s.y, target.x, target.y, 230, 80)
                    )
                        resolve(s, target, false);
                }
                if (
                    s.targets.length &&
                    s.targets.every((t) => !t.alive || t.y > HEIGHT + 40)
                ) {
                    s.feedback = `Jawaban terlewat: ${s.questions[s.round].options[s.questions[s.round].answer]}`;
                    s.lives--;
                    s.round++;
                    s.targets = [];
                    s.next = 2.2;
                    playSound.current('wrong');
                    if (!s.lives) end(s);
                    publish(s);
                }
                for (const enemy of s.enemies) {
                    for (const bullet of s.shots)
                        if (
                            bullet.y > -50 &&
                            hitBox(bullet.x, bullet.y, enemy.x, enemy.y, 54, 48)
                        ) {
                            bullet.y = -100;
                            burst(s, enemy.x, enemy.y);
                            enemy.y = HEIGHT + 100;
                            s.score += 10;
                        }
                    if (
                        s.invincible <= 0 &&
                        hitBox(s.x, s.y, enemy.x, enemy.y, 65, 65)
                    ) {
                        burst(s, enemy.x, enemy.y);
                        enemy.y = HEIGHT + 100;
                        s.lives--;
                        s.invincible = 1.5;
                        playSound.current('wrong');
                        s.feedback =
                            'Terkena rintangan. Hindari atau tembak drone!';
                        if (!s.lives) end(s);
                    }
                }
                s.shots = s.shots.filter((b) => b.y > -50);
                s.enemies = s.enemies.filter((e) => e.y < HEIGHT + 60);
                for (const p of s.particles) {
                    p.life -= dt;
                    p.x += p.vx * dt;
                    p.y += p.vy * dt;
                }
                s.particles = s.particles.filter((p) => p.life > 0);
                if (timestamp - lastHud > 150) {
                    publish(s);
                    lastHud = timestamp;
                }
            }
            if (s) {
                for (const t of s.targets)
                    if (t.alive) {
                        ctx.fillStyle = '#fff9e6';
                        ctx.strokeStyle = '#20364a';
                        ctx.lineWidth = 3;
                        ctx.beginPath();
                        ctx.roundRect(t.x - 105, t.y - 26, 210, 52, 14);
                        ctx.fill();
                        ctx.stroke();
                        ctx.fillStyle = '#20364a';
                        ctx.font = 'bold 18px system-ui';
                        ctx.textAlign = 'center';
                        ctx.fillText(
                            s.questions[s.round]?.options[t.option] ?? '',
                            t.x,
                            t.y + 6,
                            195,
                        );
                    }
                for (const e of s.enemies) {
                    ctx.fillStyle = e.kind === 'drone' ? '#ef6688' : '#73869a';
                    ctx.strokeStyle = '#263e52';
                    ctx.lineWidth = 3;
                    ctx.beginPath();
                    if (e.kind === 'rock')
                        ctx.arc(e.x, e.y, 21, 0, Math.PI * 2);
                    else {
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
                for (const b of s.shots) ctx.fillRect(b.x - 3, b.y, 6, 20);
                for (const p of s.particles) {
                    ctx.globalAlpha = Math.max(0, p.life * 2);
                    ctx.fillStyle = '#ffde80';
                    ctx.fillRect(p.x, p.y, 6, 6);
                }
                ctx.globalAlpha = 1;
                if (s.invincible > 0)
                    ctx.globalAlpha = 0.55 + Math.sin(time * 30) * 0.3;
                jet(ctx, s.x, s.y, time);
                ctx.globalAlpha = 1;
            } else jet(ctx, 450, 420 + Math.sin(time) * 8, time);
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

    return (
        <div className="min-h-dvh bg-[#eef5f7] text-[#20364a]">
            <Head title="Sukhoi Sky Quiz — EduFunHub" />
            <header className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-[#20364a] bg-white px-4 py-3">
                <Link
                    href="/gamelist"
                    className="flex items-center gap-2 font-bold"
                >
                    <ArrowLeft className="size-5" /> Arena Game
                </Link>
                <h1 className="flex items-center gap-2 font-display text-xl font-bold">
                    <Plane className="size-6" /> Sukhoi Sky Quiz
                </h1>
                <span className="rounded-full bg-[#fff176] px-3 py-1 text-xs font-black">
                    100% GRATIS • DEMO
                </span>
            </header>
            <main className="mx-auto flex max-w-6xl flex-col gap-3 p-3 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <label className="flex items-center gap-2 text-sm font-bold">
                        Jenjang
                        <select
                            aria-label="Pilih kelas"
                            disabled={
                                screen === 'playing' || screen === 'paused'
                            }
                            value={grade}
                            onChange={(e) => setGrade(Number(e.target.value))}
                            className="rounded-xl border-2 border-[#20364a] bg-white px-3 py-2"
                        >
                            {[1, 2, 3, 4].map((n) => (
                                <option key={n} value={n}>
                                    Kelas {n} SD
                                </option>
                            ))}
                        </select>
                    </label>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={audio.toggleMuted}
                            aria-label={
                                audio.muted ? 'Aktifkan suara' : 'Matikan suara'
                            }
                            className="rounded-xl border-2 bg-white p-2"
                        >
                            {audio.muted ? <VolumeX /> : <Volume2 />}
                        </button>
                        <button
                            onClick={pause}
                            disabled={
                                screen !== 'playing' && screen !== 'paused'
                            }
                            className="flex items-center gap-2 rounded-xl border-2 bg-white px-3 py-2 font-bold"
                        >
                            <Pause className="size-4" /> Jeda
                        </button>
                    </div>
                </div>
                <div
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border-2 border-[#20364a] bg-white p-3 text-sm font-bold"
                    aria-live="polite"
                >
                    <span>Skor {hud.score}</span>
                    <span>Perisai {hud.lives}/5</span>
                    <span>
                        Misi {hud.round}/{hud.total}
                    </span>
                </div>
                <div className="rounded-xl border-2 border-[#20364a] bg-[#fff9e6] px-4 py-3">
                    <span className="text-xs font-bold text-[#845ec2]">
                        {hud.subject} • Kelas {grade} SD
                    </span>
                    <p
                        className="font-display text-lg font-bold sm:text-xl"
                        data-testid="sky-question"
                    >
                        {hud.text}
                    </p>
                    <p className="min-h-5 text-xs font-bold" role="status">
                        {hud.feedback ||
                            'Sentuh jawaban BENAR dengan jet. Tembak jawaban SALAH dan drone.'}
                    </p>
                </div>
                <div className="relative mx-auto w-full max-w-[min(100%,calc((100dvh-300px)*1.5))] overflow-hidden rounded-2xl border-3 border-[#20364a] bg-[#174568] shadow-[5px_5px_0_#20364a]">
                    <canvas
                        ref={canvas}
                        tabIndex={0}
                        data-testid="sky-canvas"
                        aria-label="Arena Sukhoi. Panah atau WASD untuk terbang, spasi untuk menembak. Pada layar sentuh, geser pesawat dan tahan tombol tembak."
                        className="block aspect-[3/2] w-full touch-none outline-none focus-visible:ring-4 focus-visible:ring-amber-300"
                        onPointerDown={(e) => {
                            e.currentTarget.setPointerCapture(e.pointerId);
                            e.currentTarget.focus();
                        }}
                        onPointerMove={(e) => {
                            const s = flight.current;
                            if (
                                !s?.running ||
                                s.paused ||
                                (e.pointerType !== 'mouse' && !e.buttons)
                            )
                                return;
                            const rect =
                                e.currentTarget.getBoundingClientRect();
                            s.targetX =
                                ((e.clientX - rect.left) / rect.width) * WIDTH;
                            s.targetY =
                                ((e.clientY - rect.top) / rect.height) * HEIGHT;
                        }}
                    >
                        Gunakan browser yang mendukung Canvas untuk bermain.
                    </canvas>
                    {screen !== 'playing' && (
                        <div className="absolute inset-0 flex items-center justify-center bg-[#12283e]/70 p-4 backdrop-blur-sm">
                            <div className="flex max-h-full max-w-sm flex-col gap-2 overflow-y-auto rounded-2xl border-2 border-[#20364a] bg-white p-3 text-center shadow-lg sm:gap-3 sm:p-5">
                                <Plane className="mx-auto hidden size-9 text-[#287899] sm:block" />
                                <h2 className="font-display text-xl font-bold">
                                    {screen === 'ready'
                                        ? 'Pilot cilik, siap terbang?'
                                        : screen === 'paused'
                                          ? 'Penerbangan dijeda'
                                          : hud.lives > 0
                                            ? 'Misi selesai!'
                                            : 'Perisai habis'}
                                </h2>
                                <p className="text-sm">
                                    {screen === 'ended'
                                        ? `Skor akhir: ${hud.score}. Ayo coba lagi!`
                                        : 'Jet bergaya Sukhoi Su-27. Ambil jawaban benar; singkirkan jawaban salah dan rintangan dengan tembakan.'}
                                </p>
                                <button
                                    onClick={
                                        screen === 'paused' ? pause : start
                                    }
                                    className="flex items-center justify-center gap-2 rounded-xl bg-[#fff176] px-4 py-3 font-black text-[#20364a]"
                                >
                                    {screen === 'ended' ? (
                                        <RotateCcw className="size-5" />
                                    ) : (
                                        <Play className="size-5" />
                                    )}
                                    {screen === 'paused'
                                        ? 'Lanjutkan'
                                        : screen === 'ended'
                                          ? 'Main lagi'
                                          : 'Mulai terbang'}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="max-w-xl text-xs font-semibold">
                        Panah/WASD atau geser kursor/jari untuk terbang. Spasi
                        atau tahan Tembak. Menembak jawaban benar mengurangi
                        perisai. Delapan misi acak per kelas; poin demo tidak
                        masuk akun.
                    </p>
                    <button
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
                        className="flex min-h-12 touch-none items-center gap-2 rounded-xl border-2 border-[#20364a] bg-[#ff9e44] px-6 py-3 font-black disabled:opacity-50"
                    >
                        <Crosshair className="size-5" /> Tembak
                    </button>
                </div>
            </main>
        </div>
    );
}
