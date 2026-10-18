import { useTranslations } from '@/hooks/use-translations';
import {
    ChevronLeft,
    ChevronRight,
    Download,
    Pause,
    Play,
    RotateCcw,
} from 'lucide-react';
import { useEffect, useState, useSyncExternalStore } from 'react';

export const SCENES = [
    'room',
    'drive',
    'drift',
    'question',
    'weapons',
    'finish',
] as const;
export type SceneKey = (typeof SCENES)[number];
export const SCENE_MS = 6500;
export const TUTORIAL_BASE = '/tutorials/cara-bermain-edu-kart';

/** Tutorial file base for the UI language (English files end in `-en`). */
export function tutorialBase(language: string | undefined): string {
    return language?.startsWith('en') ? `${TUTORIAL_BASE}-en` : TUTORIAL_BASE;
}

function subscribeMotion(callback: () => void) {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    query.addEventListener('change', callback);
    return () => query.removeEventListener('change', callback);
}
const reducedMotion = () =>
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const INK = '#1f2a44';

/** Top-down kart in SVG (scene art, no text). */
function Kart({
    x,
    y,
    color,
    angle = 0,
}: {
    x: number;
    y: number;
    color: string;
    angle?: number;
}) {
    return (
        <g transform={`translate(${x} ${y}) rotate(${angle})`}>
            <rect x={-13} y={-20} width={6} height={10} rx={2} fill={INK} />
            <rect x={7} y={-20} width={6} height={10} rx={2} fill={INK} />
            <rect x={-13} y={8} width={6} height={11} rx={2} fill={INK} />
            <rect x={7} y={8} width={6} height={11} rx={2} fill={INK} />
            <rect
                x={-9}
                y={-22}
                width={18}
                height={42}
                rx={7}
                fill={color}
                stroke={INK}
                strokeWidth={2.5}
            />
            <circle
                cx={0}
                cy={2}
                r={6}
                fill="#fde68a"
                stroke={INK}
                strokeWidth={2}
            />
        </g>
    );
}

function Road({ children }: { children?: React.ReactNode }) {
    return (
        <svg
            viewBox="0 0 320 180"
            className="h-auto w-full"
            role="img"
            aria-hidden="true"
        >
            <rect width={320} height={180} fill="#86efac" />
            <rect x={70} width={180} height={180} fill="#64748b" />
            {[0, 1, 2, 3, 4, 5].map((i) => (
                <rect
                    key={i}
                    x={157}
                    y={i * 34 + 4}
                    width={6}
                    height={18}
                    fill="#f8fafc"
                />
            ))}
            {Array.from({ length: 9 }).map((_, i) => (
                <g key={i}>
                    <rect
                        x={64}
                        y={i * 20}
                        width={6}
                        height={10}
                        fill="#ef4444"
                    />
                    <rect
                        x={64}
                        y={i * 20 + 10}
                        width={6}
                        height={10}
                        fill="#f8fafc"
                    />
                    <rect
                        x={250}
                        y={i * 20}
                        width={6}
                        height={10}
                        fill="#ef4444"
                    />
                    <rect
                        x={250}
                        y={i * 20 + 10}
                        width={6}
                        height={10}
                        fill="#f8fafc"
                    />
                </g>
            ))}
            {children}
        </svg>
    );
}

function Box({
    x,
    w,
    color,
    label,
}: {
    x: number;
    w: number;
    color: string;
    label: string;
}) {
    return (
        <g>
            <rect
                x={x + 2}
                y={30}
                width={w - 4}
                height={30}
                rx={5}
                fill={color}
                stroke={INK}
                strokeWidth={2.5}
            />
            <text
                x={x + w / 2}
                y={50}
                textAnchor="middle"
                fontSize={13}
                fontWeight={900}
                fill="white"
            >
                {label}
            </text>
        </g>
    );
}

function SceneArt({ scene }: { scene: SceneKey }) {
    const { t } = useTranslations();
    switch (scene) {
        case 'room':
            return (
                <svg
                    viewBox="0 0 320 180"
                    className="h-auto w-full"
                    role="img"
                    aria-hidden="true"
                >
                    <rect width={320} height={180} fill="#fff4e6" />
                    <rect
                        x={20}
                        y={20}
                        width={130}
                        height={60}
                        rx={12}
                        fill="white"
                        stroke={INK}
                        strokeWidth={3}
                    />
                    <text
                        x={85}
                        y={47}
                        textAnchor="middle"
                        fontSize={11}
                        fontWeight={800}
                        fill="#475569"
                    >
                        PIN
                    </text>
                    <text
                        x={85}
                        y={68}
                        textAnchor="middle"
                        fontSize={20}
                        fontWeight={900}
                        fill={INK}
                    >
                        482 913
                    </text>
                    {['#fb923c', '#f43f5e', '#22d3ee', '#84cc16'].map(
                        (c, i) => (
                            <g
                                key={c}
                                transform={`translate(${190 + (i % 2) * 60} ${40 + Math.floor(i / 2) * 70})`}
                            >
                                <rect
                                    x={-26}
                                    y={-24}
                                    width={52}
                                    height={50}
                                    rx={10}
                                    fill="white"
                                    stroke={INK}
                                    strokeWidth={2.5}
                                />
                                <Kart x={0} y={2} color={c} />
                            </g>
                        ),
                    )}
                    {['#bbf7d0', '#bae6fd', '#fecdd3'].map((c, i) => (
                        <rect
                            key={c}
                            x={20 + i * 45}
                            y={100}
                            width={40}
                            height={56}
                            rx={8}
                            fill={c}
                            stroke={INK}
                            strokeWidth={2.5}
                        />
                    ))}
                </svg>
            );
        case 'drive':
            return (
                <Road>
                    <Kart x={160} y={120} color="#fb923c" />
                    <Kart x={120} y={60} color="#22d3ee" />
                    <circle
                        cx={200}
                        cy={40}
                        r={8}
                        fill="#facc15"
                        stroke={INK}
                        strokeWidth={2}
                    />
                    <circle
                        cx={200}
                        cy={20}
                        r={8}
                        fill="#facc15"
                        stroke={INK}
                        strokeWidth={2}
                    />
                    <rect
                        x={170}
                        y={140}
                        width={40}
                        height={20}
                        rx={4}
                        fill="#4ade80"
                        stroke={INK}
                        strokeWidth={2}
                    />
                </Road>
            );
        case 'drift':
            return (
                <Road>
                    <Kart x={170} y={100} color="#a855f7" angle={-28} />
                    <circle
                        cx={186}
                        cy={128}
                        r={9}
                        fill="#1f2937"
                        opacity={0.75}
                    />
                    <circle
                        cx={194}
                        cy={142}
                        r={11}
                        fill="#1f2937"
                        opacity={0.6}
                    />
                    <rect
                        x={196}
                        y={20}
                        width={110}
                        height={16}
                        rx={8}
                        fill="white"
                        stroke={INK}
                        strokeWidth={2}
                    />
                    <rect
                        x={198}
                        y={22}
                        width={84}
                        height={12}
                        rx={6}
                        fill="#ef4444"
                    />
                </Road>
            );
        case 'question':
            return (
                <Road>
                    <Box x={70} w={45} color="#2563eb" label="A" />
                    <Box x={115} w={45} color="#e11d48" label="B" />
                    <Box x={160} w={45} color="#ca8a04" label="C" />
                    <Box x={205} w={45} color="#16a34a" label="D" />
                    <Kart x={137} y={130} color="#fb923c" />
                    <path
                        d="M137 108 L137 68"
                        stroke={INK}
                        strokeWidth={3}
                        strokeDasharray="5 4"
                        markerEnd="url(#arrow)"
                    />
                    <defs>
                        <marker
                            id="arrow"
                            markerWidth={8}
                            markerHeight={8}
                            refX={4}
                            refY={4}
                            orient="auto"
                        >
                            <path d="M0 0 L8 4 L0 8 z" fill={INK} />
                        </marker>
                    </defs>
                </Road>
            );
        case 'weapons':
            return (
                <Road>
                    <Kart x={130} y={140} color="#fb923c" />
                    <path
                        d="M130 112 L150 70"
                        stroke="#ef4444"
                        strokeWidth={4}
                    />
                    <rect
                        x={144}
                        y={56}
                        width={10}
                        height={20}
                        rx={4}
                        fill="#ef4444"
                        stroke={INK}
                        strokeWidth={2}
                    />
                    <Kart x={170} y={40} color="#22d3ee" />
                    <rect
                        x={200}
                        y={110}
                        width={24}
                        height={24}
                        rx={3}
                        fill="#b45309"
                        stroke={INK}
                        strokeWidth={2.5}
                    />
                    <text
                        x={212}
                        y={127}
                        textAnchor="middle"
                        fontSize={8}
                        fontWeight={900}
                        fill="white"
                    >
                        TNT
                    </text>
                    <circle
                        cx={100}
                        cy={70}
                        r={18}
                        fill="#93c5fd"
                        opacity={0.5}
                        stroke="#2563eb"
                        strokeWidth={2}
                    />
                </Road>
            );
        default:
            return (
                <svg
                    viewBox="0 0 320 180"
                    className="h-auto w-full"
                    role="img"
                    aria-hidden="true"
                >
                    <rect width={320} height={180} fill="#fde68a" />
                    {Array.from({ length: 16 }).map((_, i) => (
                        <rect
                            key={i}
                            x={(i % 8) * 40}
                            y={Math.floor(i / 8) * 12 + 20}
                            width={20}
                            height={12}
                            fill={(i + Math.floor(i / 8)) % 2 ? INK : 'white'}
                        />
                    ))}
                    <rect
                        x={130}
                        y={95}
                        width={60}
                        height={60}
                        fill="#facc15"
                        stroke={INK}
                        strokeWidth={3}
                    />
                    <rect
                        x={70}
                        y={115}
                        width={60}
                        height={40}
                        fill="#e5e7eb"
                        stroke={INK}
                        strokeWidth={3}
                    />
                    <rect
                        x={190}
                        y={125}
                        width={60}
                        height={30}
                        fill="#fdba74"
                        stroke={INK}
                        strokeWidth={3}
                    />
                    <text
                        x={160}
                        y={132}
                        textAnchor="middle"
                        fontSize={26}
                        fontWeight={900}
                        fill={INK}
                    >
                        1
                    </text>
                    <text
                        x={160}
                        y={84}
                        textAnchor="middle"
                        fontSize={12}
                        fontWeight={900}
                        fill={INK}
                    >
                        {t('eduKart.howTo.demoPoints')}
                    </text>
                </svg>
            );
    }
}

export default function HowToPlayEduKart() {
    const { t, i18n } = useTranslations();
    const base = tutorialBase(i18n.language);
    const reduced = useSyncExternalStore(
        subscribeMotion,
        reducedMotion,
        () => true,
    );
    const [scene, setScene] = useState(0);
    const [cycle, setCycle] = useState(0);
    const [playing, setPlaying] = useState(true);
    const autoplay = playing && !reduced;
    useEffect(() => {
        if (!autoplay) {
            return;
        }
        const timer = setTimeout(() => {
            if (scene === SCENES.length - 1) {
                setPlaying(false);
            } else {
                setScene((value) => value + 1);
            }
        }, SCENE_MS);
        return () => clearTimeout(timer);
    }, [scene, cycle, autoplay]);
    const choose = (index: number) => {
        setScene(Math.max(0, Math.min(SCENES.length - 1, index)));
        setCycle((value) => value + 1);
        setPlaying(false);
    };
    const key = SCENES[scene];
    const navButton =
        'grid size-11 place-items-center rounded-xl border-2 border-[#1f2a44] bg-white shadow-[2px_2px_0_#1f2a44] disabled:opacity-40';

    return (
        <section
            className="flex flex-col gap-3 rounded-3xl border-3 border-[#1f2a44] bg-white p-4 shadow-[5px_5px_0px_#1f2a44] sm:p-6"
            data-testid="ek-howto"
            data-scene={scene}
            aria-label={t('eduKart.howTo.title')}
            onKeyDown={(event) => {
                if (event.key === 'ArrowRight') {
                    event.preventDefault();
                    choose(scene + 1);
                }
                if (event.key === 'ArrowLeft') {
                    event.preventDefault();
                    choose(scene - 1);
                }
            }}
        >
            <header className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-display text-xl font-black">
                    {t('eduKart.howTo.title')}
                </h2>
                <span className="text-xs font-bold text-slate-600">
                    {t('eduKart.howTo.step', {
                        step: scene + 1,
                        total: SCENES.length,
                    })}
                </span>
            </header>
            <video
                key={base}
                className="aspect-video w-full rounded-2xl border-2 border-[#1f2a44] bg-[#1f2a44] object-cover"
                data-testid="ek-howto-video"
                src={`${base}.mp4`}
                poster={`${base}.jpg`}
                controls
                muted
                playsInline
                preload="metadata"
                aria-label={t('eduKart.howTo.videoLabel')}
            />
            <div className="grid gap-4 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] md:items-center">
                <div
                    key={`${key}-${cycle}`}
                    className="overflow-hidden rounded-2xl border-2 border-[#1f2a44]"
                >
                    <SceneArt scene={key} />
                </div>
                <div aria-live={autoplay ? 'off' : 'polite'}>
                    <h3 className="font-display text-lg font-black">
                        {t(`eduKart.howTo.scenes.${key}.title`)}
                    </h3>
                    <p className="mt-1 text-sm font-semibold text-slate-700">
                        {t(`eduKart.howTo.scenes.${key}.body`)}
                    </p>
                </div>
            </div>
            <div className="flex items-center justify-center gap-2">
                <button
                    type="button"
                    className={navButton}
                    disabled={scene === 0}
                    onClick={() => choose(scene - 1)}
                    aria-label={t('eduKart.howTo.previous')}
                >
                    <ChevronLeft aria-hidden="true" />
                </button>
                <div className="flex items-center">
                    {SCENES.map((item, index) => (
                        <button
                            type="button"
                            key={item}
                            className="grid size-11 place-items-center"
                            data-testid={`ek-howto-dot-${index}`}
                            aria-label={t(`eduKart.howTo.scenes.${item}.title`)}
                            aria-current={index === scene ? 'step' : undefined}
                            onClick={() => choose(index)}
                        >
                            <span
                                className={
                                    index === scene
                                        ? 'size-3.5 rounded-full bg-[#e11d48]'
                                        : 'size-2.5 rounded-full bg-slate-300'
                                }
                            />
                        </button>
                    ))}
                </div>
                <button
                    type="button"
                    className={navButton}
                    aria-label={t(
                        autoplay
                            ? 'eduKart.howTo.pause'
                            : 'eduKart.howTo.replay',
                    )}
                    aria-pressed={autoplay}
                    onClick={() => {
                        if (autoplay) {
                            setPlaying(false);
                        } else {
                            setScene(0);
                            setCycle((value) => value + 1);
                            setPlaying(true);
                        }
                    }}
                >
                    {autoplay ? (
                        <Pause aria-hidden="true" />
                    ) : reduced ? (
                        <RotateCcw aria-hidden="true" />
                    ) : (
                        <Play aria-hidden="true" />
                    )}
                </button>
                <button
                    type="button"
                    className={navButton}
                    disabled={scene === SCENES.length - 1}
                    onClick={() => choose(scene + 1)}
                    aria-label={t('eduKart.howTo.next')}
                >
                    <ChevronRight aria-hidden="true" />
                </button>
            </div>
            <div className="flex flex-wrap justify-center gap-3 text-sm font-bold">
                <a
                    className="inline-flex min-h-11 items-center gap-2 rounded-xl border-2 border-[#1f2a44] px-3"
                    href={`${base}.mp4`}
                    download
                >
                    <Download size={16} aria-hidden="true" />
                    {t('eduKart.howTo.video')}
                </a>
                <a
                    className="inline-flex min-h-11 items-center gap-2 rounded-xl border-2 border-[#1f2a44] px-3"
                    href={`${base}.pdf`}
                    download
                >
                    <Download size={16} aria-hidden="true" />
                    {t('eduKart.howTo.pdf')}
                </a>
            </div>
        </section>
    );
}
