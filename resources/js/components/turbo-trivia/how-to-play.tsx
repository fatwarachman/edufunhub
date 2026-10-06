import { PlayerAvatar } from '@/components/player-avatar';
import { useTranslations } from '@/hooks/use-translations';
import { type TurboItem } from '@/hooks/use-turbo-trivia';
import { type CharacterLook } from '@/lib/character/draw-character';
import { cn } from '@/lib/utils';
import {
    ChevronLeft,
    ChevronRight,
    Crown,
    FileDown,
    Flag,
    Gauge,
    MonitorPlay,
    Pause,
    Play,
    RotateCcw,
    Smartphone,
    Video,
} from 'lucide-react';
import {
    type CSSProperties,
    type ReactNode,
    useCallback,
    useEffect,
    useState,
    useSyncExternalStore,
} from 'react';
import { ACCENT, ITEM_STYLE, kartColor } from './shared';

/** Shareable recording of this walkthrough (MP4 video and PDF slides). */
const TUTORIAL_BASE = '/tutorials/cara-bermain-turbo-trivia';

/** Milliseconds each scene stays on screen while auto-playing. */
const SCENE_MS = 6500;

const SCENES = ['join', 'answer', 'speed', 'items', 'attack', 'win'] as const;
type Scene = (typeof SCENES)[number];

/** Demo looks for the illustrated players (same chibi model as the portal). */
const RANI: CharacterLook = {
    color: 'teal',
    gender: 'girl',
    skin: 'tan',
    hair: 'black',
};
const BUDI: CharacterLook = {
    color: 'violet',
    gender: 'boy',
    skin: 'light',
    hair: 'brown',
};
const SARI: CharacterLook = {
    color: 'coral',
    gender: 'girl',
    skin: 'brown',
    hair: 'black',
};

/** Same answer colours as the phone controller. */
const OPTION_TONES = ['#e11d48', '#2563eb', '#a16207', '#15803d'];

const REDUCED_QUERY = '(prefers-reduced-motion: reduce)';

function subscribeReducedMotion(onChange: () => void): () => void {
    const query = window.matchMedia(REDUCED_QUERY);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
}

function usePrefersReducedMotion(): boolean {
    return useSyncExternalStore(
        subscribeReducedMotion,
        () => window.matchMedia(REDUCED_QUERY).matches,
        () => false,
    );
}

/**
 * Animated "how to play" walkthrough for Turbo Trivia: six illustrated scenes
 * that auto-play like a short video (pause, previous/next, dots, arrow keys).
 * Pure React + CSS, so it follows the locale and needs no media download.
 */
export function HowToPlay({ className }: { className?: string }) {
    const { t } = useTranslations();
    const reduced = usePrefersReducedMotion();
    const [index, setIndex] = useState(0);
    const [playing, setPlaying] = useState(true);
    const [cycle, setCycle] = useState(0);
    const autoplay = playing && !reduced;
    const scene = SCENES[index];
    const last = index === SCENES.length - 1;

    const go = useCallback((next: number) => {
        setIndex((next + SCENES.length) % SCENES.length);
        setCycle((c) => c + 1);
    }, []);

    useEffect(() => {
        if (!autoplay) {
            return;
        }
        const id = setTimeout(() => {
            if (last) {
                setPlaying(false);
            } else {
                go(index + 1);
            }
        }, SCENE_MS);
        return () => clearTimeout(id);
    }, [autoplay, index, last, go, cycle]);

    const onKey = (event: React.KeyboardEvent) => {
        if (event.key === 'ArrowRight') {
            event.preventDefault();
            go(index + 1);
        } else if (event.key === 'ArrowLeft') {
            event.preventDefault();
            go(index - 1);
        }
    };

    const step = t('turboTrivia.howTo.step', {
        current: index + 1,
        total: SCENES.length,
    });

    return (
        <section
            className={cn(
                'flex flex-col gap-3 rounded-3xl border-3 border-[#1f2a44] bg-white p-4 shadow-[5px_5px_0px_#1f2a44] sm:p-5',
                className,
            )}
            aria-roledescription="carousel"
            aria-label={t('turboTrivia.howTo.title')}
            data-testid="tt-howto"
            data-scene={scene}
            tabIndex={0}
            onKeyDown={onKey}
        >
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-display text-xl font-black">
                    {t('turboTrivia.howTo.title')}
                </h2>
                <span className="rounded-full border-2 border-[#1f2a44] bg-[#ffe4e6] px-2.5 py-0.5 text-xs font-black tabular-nums">
                    {step}
                </span>
            </div>

            <div
                className="relative overflow-hidden rounded-2xl border-2 border-[#1f2a44] bg-[#fff1f2]"
                aria-live={autoplay ? 'off' : 'polite'}
            >
                <div
                    key={`${scene}-${cycle}`}
                    className="tt-howto-scene flex h-[25rem] flex-col items-center justify-center gap-3 overflow-hidden p-4"
                    role="group"
                    aria-roledescription="slide"
                    aria-label={step}
                >
                    <SceneArt scene={scene} />
                </div>
                {autoplay && (
                    <div className="absolute inset-x-0 bottom-0 h-1.5 bg-[#1f2a44]/10">
                        <div
                            key={`bar-${index}-${cycle}`}
                            className="tt-howto-progress h-full"
                            style={{
                                animationDuration: `${SCENE_MS}ms`,
                                background: ACCENT,
                            }}
                        />
                    </div>
                )}
            </div>

            <div className="flex min-h-36 flex-col justify-start gap-1 text-center">
                <h3
                    className="font-display text-lg font-black text-balance"
                    data-testid="tt-howto-title"
                >
                    {t(`turboTrivia.howTo.scenes.${scene}.title`)}
                </h3>
                <p className="text-sm font-bold text-balance text-slate-700">
                    {t(`turboTrivia.howTo.scenes.${scene}.body`)}
                </p>
            </div>

            <div className="flex items-center justify-between gap-2">
                <ControlButton
                    label={t('turboTrivia.howTo.prev')}
                    onClick={() => go(index - 1)}
                    testId="tt-howto-prev"
                >
                    <ChevronLeft className="size-5" aria-hidden="true" />
                </ControlButton>
                <div className="flex min-w-0 flex-1 items-center justify-center gap-0.5 sm:gap-1">
                    {SCENES.map((s, i) => (
                        <button
                            key={s}
                            type="button"
                            onClick={() => go(i)}
                            aria-label={t('turboTrivia.howTo.goTo', {
                                number: i + 1,
                            })}
                            aria-current={i === index ? 'step' : undefined}
                            data-testid={`tt-howto-dot-${i}`}
                            className="grid h-11 w-6 shrink-0 place-items-center sm:w-8"
                        >
                            <span
                                className={cn(
                                    'block h-2.5 rounded-full border-2 border-[#1f2a44] transition-all',
                                    i === index
                                        ? 'w-5 bg-[#e11d48]'
                                        : 'w-2.5 bg-white',
                                )}
                            />
                        </button>
                    ))}
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                    {!reduced && (
                        <ControlButton
                            label={
                                last && !playing
                                    ? t('turboTrivia.howTo.replay')
                                    : playing
                                      ? t('turboTrivia.howTo.pause')
                                      : t('turboTrivia.howTo.play')
                            }
                            onClick={() => {
                                if (last && !playing) {
                                    go(0);
                                    setPlaying(true);
                                } else {
                                    setPlaying((p) => !p);
                                    setCycle((c) => c + 1);
                                }
                            }}
                            testId="tt-howto-play"
                            pressed={playing}
                        >
                            {last && !playing ? (
                                <RotateCcw
                                    className="size-5"
                                    aria-hidden="true"
                                />
                            ) : playing ? (
                                <Pause className="size-5" aria-hidden="true" />
                            ) : (
                                <Play className="size-5" aria-hidden="true" />
                            )}
                        </ControlButton>
                    )}
                    <ControlButton
                        label={t('turboTrivia.howTo.next')}
                        onClick={() => go(index + 1)}
                        testId="tt-howto-next"
                    >
                        <ChevronRight className="size-5" aria-hidden="true" />
                    </ControlButton>
                </div>
            </div>

            <div className="flex flex-wrap justify-center gap-2 border-t-2 border-dashed border-[#1f2a44]/20 pt-3">
                <a
                    href={`${TUTORIAL_BASE}.mp4`}
                    download
                    className="inline-flex min-h-11 items-center gap-2 rounded-xl border-2 border-[#1f2a44] bg-white px-3 text-sm font-black shadow-[2px_2px_0px_#1f2a44] hover:bg-[#ffe4e6]"
                    data-testid="tt-howto-video"
                >
                    <Video className="size-4" aria-hidden="true" />
                    {t('turboTrivia.howTo.downloadVideo')}
                </a>
                <a
                    href={`${TUTORIAL_BASE}.pdf`}
                    download
                    className="inline-flex min-h-11 items-center gap-2 rounded-xl border-2 border-[#1f2a44] bg-white px-3 text-sm font-black shadow-[2px_2px_0px_#1f2a44] hover:bg-[#ffe4e6]"
                    data-testid="tt-howto-slides"
                >
                    <FileDown className="size-4" aria-hidden="true" />
                    {t('turboTrivia.howTo.downloadSlides')}
                </a>
            </div>
        </section>
    );
}

function ControlButton({
    label,
    onClick,
    testId,
    pressed,
    children,
}: {
    label: string;
    onClick: () => void;
    testId: string;
    pressed?: boolean;
    children: ReactNode;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-label={label}
            title={label}
            aria-pressed={pressed}
            data-testid={testId}
            className="grid size-11 shrink-0 place-items-center rounded-xl border-2 border-[#1f2a44] bg-white shadow-[2px_2px_0px_#1f2a44] transition-colors hover:bg-[#ffe4e6] focus-visible:ring-4 focus-visible:ring-[#e11d48]/40 focus-visible:outline-none"
        >
            {children}
        </button>
    );
}

function Avatar({
    look,
    seat,
    className,
}: {
    look: CharacterLook;
    seat: number;
    className?: string;
}) {
    return (
        <span className={cn('block shrink-0', className ?? 'size-12')}>
            <PlayerAvatar character={look} seat={seat} />
        </span>
    );
}

function Phone({
    children,
    className,
}: {
    children: ReactNode;
    className?: string;
}) {
    return (
        <div
            className={cn(
                'relative flex w-full max-w-64 flex-col gap-2 overflow-hidden rounded-[1.75rem] border-3 border-[#1f2a44] bg-white p-3 shadow-[4px_4px_0px_#1f2a44]',
                className,
            )}
        >
            <span className="mx-auto h-1.5 w-12 rounded-full bg-[#1f2a44]/20" />
            {children}
        </div>
    );
}

/** Small top-down kart with the driver's avatar, used in every scene. */
function MiniKart({
    look,
    seat,
    className,
    style,
}: {
    look: CharacterLook;
    seat: number;
    className?: string;
    style?: CSSProperties;
}) {
    return (
        <span
            className={cn(
                'relative flex h-10 w-16 shrink-0 items-center justify-center rounded-xl border-2 border-[#1f2a44] shadow-[2px_2px_0px_#1f2a44]',
                className,
            )}
            style={{ background: kartColor(seat + 1), ...style }}
        >
            <span className="absolute -top-1 -left-1 h-2.5 w-4 rounded-sm border border-[#1f2a44] bg-[#1f2a44]" />
            <span className="absolute -bottom-1 -left-1 h-2.5 w-4 rounded-sm border border-[#1f2a44] bg-[#1f2a44]" />
            <span className="absolute -top-1 -right-1 h-2.5 w-4 rounded-sm border border-[#1f2a44] bg-[#1f2a44]" />
            <span className="absolute -right-1 -bottom-1 h-2.5 w-4 rounded-sm border border-[#1f2a44] bg-[#1f2a44]" />
            <Avatar look={look} seat={seat} className="size-9" />
        </span>
    );
}

function ItemChip({
    item,
    label,
    className,
    style,
}: {
    item: TurboItem;
    label?: string;
    className?: string;
    style?: CSSProperties;
}) {
    const { icon: Icon, tone } = ITEM_STYLE[item];
    return (
        <span
            className={cn(
                'flex flex-col items-center gap-0.5 rounded-xl border-2 border-[#1f2a44] px-2 py-1.5 text-[11px] font-black text-white',
                className,
            )}
            style={{ background: tone, ...style }}
        >
            <Icon className="size-5" aria-hidden="true" />
            {label}
        </span>
    );
}

/** Deterministic 21 x 21 QR-style code (finder squares + pattern). */
function DemoQr() {
    const size = 21;
    const cells: ReactNode[] = [];
    const finder = (x: number, y: number) =>
        x >= 0 && y >= 0 && x < 7 && y < 7
            ? x === 0 ||
              y === 0 ||
              x === 6 ||
              y === 6 ||
              (x > 1 && x < 5 && y > 1 && y < 5)
            : null;
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const corner =
                finder(x, y) ?? finder(x - 14, y) ?? finder(x, y - 14);
            const inFinderArea =
                (x < 8 && y < 8) || (x > 12 && y < 8) || (x < 8 && y > 12);
            const on = inFinderArea
                ? Boolean(corner)
                : (x * 7 + y * 13 + ((x * y) % 5)) % 3 === 0;
            if (on) {
                cells.push(
                    <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" />,
                );
            }
        }
    }
    return (
        <svg
            viewBox={`0 0 ${size} ${size}`}
            className="block size-16"
            fill="#1f2a44"
            shapeRendering="crispEdges"
            aria-hidden="true"
        >
            {cells}
        </svg>
    );
}

/** Delay helper so scene timelines read as seconds. */
function at(seconds: number): CSSProperties {
    return { animationDelay: `${seconds}s` };
}

function SceneArt({ scene }: { scene: Scene }) {
    switch (scene) {
        case 'join':
            return <JoinScene />;
        case 'answer':
            return <AnswerScene />;
        case 'speed':
            return <SpeedScene />;
        case 'items':
            return <ItemsScene />;
        case 'attack':
            return <AttackScene />;
        default:
            return <WinScene />;
    }
}

function JoinScene() {
    const { t } = useTranslations();
    const digits = '482913'.split('');
    return (
        <div className="flex w-full flex-wrap items-center justify-center gap-4">
            <div className="flex flex-col items-center gap-1.5 rounded-2xl border-3 border-[#1f2a44] bg-[#1f2a44] px-4 py-2.5 text-white">
                <span className="flex items-center gap-1 text-[10px] font-black tracking-widest text-rose-200 uppercase">
                    <MonitorPlay className="size-3.5" aria-hidden="true" />
                    {t('turboTrivia.howTo.demoProjector')}
                </span>
                <span className="flex gap-1 font-display text-3xl font-black text-[#fda4af]">
                    {digits.map((d, i) => (
                        <span
                            key={i}
                            className="tt-howto-pop"
                            style={at(0.2 + i * 0.18)}
                        >
                            {d}
                        </span>
                    ))}
                </span>
                <span
                    className="tt-howto-pop rounded-xl bg-white p-1.5"
                    style={at(1.4)}
                >
                    <DemoQr />
                </span>
            </div>
            <Phone className="max-w-56">
                <span className="flex items-center gap-1.5 text-xs font-black">
                    <Smartphone className="size-4" aria-hidden="true" />
                    {t('turboTrivia.howTo.demoJoined')}
                </span>
                <div className="flex flex-col gap-1">
                    {[RANI, BUDI, SARI].map((look, i) => (
                        <span
                            key={i}
                            className="tt-howto-rise flex items-center gap-2"
                            style={at(2 + i * 0.45)}
                        >
                            <MiniKart
                                look={look}
                                seat={i}
                                className="h-9 w-14"
                            />
                            <span className="text-xs font-black">
                                {['Rani', 'Budi', 'Sari'][i]}
                            </span>
                        </span>
                    ))}
                </div>
            </Phone>
        </div>
    );
}

function AnswerScene() {
    const { t } = useTranslations();
    const options = ['Bandung', 'Jakarta', 'Surabaya', 'Medan'];
    return (
        <Phone className="max-w-72">
            <span className="flex items-center justify-between text-[11px] font-black">
                <span>{t('turboTrivia.howTo.demoQuestionNo')}</span>
                <span className="h-2.5 w-20 overflow-hidden rounded-full border-2 border-[#1f2a44] bg-white">
                    <span
                        className="tt-howto-timer block h-full bg-[#facc15]"
                        aria-hidden="true"
                    />
                </span>
            </span>
            <p className="rounded-xl border-2 border-[#1f2a44] bg-[#fff1f2] p-2 text-center text-sm font-black">
                {t('turboTrivia.howTo.demoQuestion')}
            </p>
            <div className="grid grid-cols-2 gap-1.5">
                {options.map((option, i) => (
                    <span
                        key={option}
                        className={cn(
                            'flex min-h-11 items-center gap-1.5 rounded-xl border-2 border-[#1f2a44] px-2 text-xs font-black text-white',
                            i === 1 ? 'tt-howto-pick' : 'tt-howto-dim',
                        )}
                        style={
                            {
                                '--tt-tone': OPTION_TONES[i],
                                background: OPTION_TONES[i],
                                ...at(2.2),
                            } as CSSProperties
                        }
                    >
                        <span className="grid size-5 place-items-center rounded-md bg-white/25">
                            {'ABCD'[i]}
                        </span>
                        {option}
                    </span>
                ))}
            </div>
            <span
                className="tt-howto-pop rounded-xl border-2 border-[#1f2a44] bg-[#22c55e] py-1.5 text-center text-sm font-black text-[#052e16]"
                style={at(2.9)}
            >
                {t('turboTrivia.howTo.demoCorrect')}
            </span>
            <span
                className="tt-howto-finger pointer-events-none absolute size-7 rounded-full border-2 border-[#1f2a44] bg-[#facc15]/80"
                aria-hidden="true"
            />
        </Phone>
    );
}

function SpeedScene() {
    const { t } = useTranslations();
    const lanes = [
        {
            look: RANI,
            seat: 0,
            label: t('turboTrivia.howTo.demoNitro'),
            speed: 120,
            tone: '#f97316',
            effect: 'tt-howto-nitro',
            to: 'calc(100% - 5.75rem)',
        },
        {
            look: BUDI,
            seat: 1,
            label: t('turboTrivia.howTo.demoStutter'),
            speed: 30,
            tone: '#64748b',
            effect: 'tt-howto-stutter',
            to: '28%',
        },
    ];
    return (
        <div className="flex w-full max-w-xl flex-col gap-2">
            {lanes.map((lane, i) => (
                <div
                    key={lane.seat}
                    className="flex flex-col gap-1 rounded-2xl border-2 border-[#1f2a44] bg-white p-2"
                >
                    <span className="flex items-center justify-between gap-2 text-xs font-black">
                        <span>{lane.label}</span>
                        <span
                            className="tt-howto-pop inline-flex items-center gap-1 rounded-full border-2 border-[#1f2a44] px-2 text-white tabular-nums"
                            style={{
                                background: lane.tone,
                                ...at(0.6 + i * 0.3),
                            }}
                        >
                            <Gauge className="size-3.5" aria-hidden="true" />
                            {t('turboTrivia.controller.speedValue', {
                                speed: lane.speed,
                            })}
                        </span>
                    </span>
                    <div className="relative h-12 rounded-xl bg-[#334155]">
                        <span className="absolute inset-x-2 top-1/2 border-t-2 border-dashed border-white/50" />
                        <Flag
                            className="absolute top-1/2 right-1.5 size-5 -translate-y-1/2 text-[#facc15]"
                            aria-hidden="true"
                        />
                        <span
                            className={cn(
                                'tt-howto-drive absolute top-1',
                                lane.effect,
                            )}
                            style={
                                {
                                    '--tt-to': lane.to,
                                    animationDelay: '0.8s',
                                } as CSSProperties
                            }
                        >
                            {lane.effect === 'tt-howto-nitro' && (
                                <span
                                    className="tt-howto-flame absolute top-1/2 right-full h-4 w-10 -translate-y-1/2 rounded-l-full"
                                    aria-hidden="true"
                                />
                            )}
                            <MiniKart look={lane.look} seat={lane.seat} />
                        </span>
                    </div>
                </div>
            ))}
        </div>
    );
}

function ItemsScene() {
    const { t } = useTranslations();
    const items: TurboItem[] = ['BANANA', 'MISSILE', 'LIGHTNING', 'SHIELD'];
    return (
        <div className="flex w-full max-w-xl flex-col items-center gap-3">
            <div className="flex items-center gap-3">
                <span
                    className="tt-howto-box grid size-16 place-items-center rounded-2xl border-3 border-[#1f2a44] bg-[#facc15] font-display text-3xl font-black shadow-[3px_3px_0px_#1f2a44]"
                    aria-hidden="true"
                >
                    ?
                </span>
                <span className="text-sm font-black">
                    {t('turboTrivia.howTo.demoItemBox')}
                </span>
            </div>
            <div className="grid w-full grid-cols-2 gap-2 sm:grid-cols-4">
                {items.map((item, i) => (
                    <div
                        key={item}
                        className="tt-howto-rise flex flex-col items-center gap-1 rounded-2xl border-2 border-[#1f2a44] bg-white p-2 text-center"
                        style={at(1.2 + i * 0.5)}
                    >
                        <ItemChip item={item} className="w-full" />
                        <span className="text-xs font-black">
                            {t(`turboTrivia.items.${item}`)}
                        </span>
                        <span className="text-[11px] font-bold text-slate-600">
                            {t(`turboTrivia.itemHelp.${item}`)}
                        </span>
                    </div>
                ))}
            </div>
            <span
                className="tt-howto-pop rounded-full border-2 border-[#1f2a44] bg-[#ffe4e6] px-3 py-1 text-center text-xs font-black"
                style={at(3.6)}
            >
                {t('turboTrivia.howTo.demoBalance')}
            </span>
        </div>
    );
}

function AttackScene() {
    const { t } = useTranslations();
    return (
        <div className="flex w-full max-w-xl flex-col gap-2">
            <div className="relative h-28 overflow-hidden rounded-2xl border-2 border-[#1f2a44] bg-[#334155]">
                <span className="absolute inset-x-2 top-1/2 border-t-2 border-dashed border-white/50" />
                <span className="absolute top-10 left-[6%]">
                    <MiniKart look={BUDI} seat={1} />
                </span>
                <span
                    className="tt-howto-missile absolute top-11 left-[24%] text-white"
                    style={at(0.6)}
                >
                    <ItemChip item="MISSILE" className="!px-1.5 !py-1" />
                </span>
                <span
                    className="tt-howto-hit absolute top-10 right-6"
                    style={at(1.9)}
                >
                    <MiniKart look={RANI} seat={0} />
                </span>
                <span
                    className="tt-howto-pop absolute top-2 right-3 rounded-full border-2 border-[#1f2a44] bg-[#fef08a] px-2 text-[11px] font-black"
                    style={at(1.9)}
                >
                    {t('turboTrivia.effects.STAGGER')}
                </span>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div
                    className="tt-howto-rise flex items-center gap-3 rounded-2xl border-2 border-[#1f2a44] bg-white p-2 pl-3"
                    style={at(2.8)}
                >
                    <span
                        className="tt-howto-shield grid place-items-center rounded-full"
                        style={at(3.2)}
                    >
                        <MiniKart look={SARI} seat={2} />
                    </span>
                    <span className="text-xs font-bold text-slate-700">
                        {t('turboTrivia.howTo.demoShield')}
                    </span>
                </div>
                <div
                    className="tt-howto-rise flex items-center gap-2 rounded-2xl border-2 border-[#1f2a44] bg-white p-2"
                    style={at(3.4)}
                >
                    <ItemChip item="BANANA" />
                    <span className="text-xs font-bold text-slate-700">
                        {t('turboTrivia.howTo.demoBanana')}
                    </span>
                </div>
            </div>
            <span
                className="tt-howto-pop self-center rounded-full border-2 border-[#1f2a44] bg-[#1f2a44] px-3 py-1 text-center text-xs font-black text-white"
                style={at(4.2)}
            >
                {t('turboTrivia.howTo.demoTicker')}
            </span>
        </div>
    );
}

function WinScene() {
    const { t } = useTranslations();
    const lanes = [
        { look: RANI, name: 'Rani', to: 'calc(100% - 5.75rem)', d: 0.3 },
        { look: BUDI, name: 'Budi', to: '58%', d: 0.45 },
        { look: SARI, name: 'Sari', to: '40%', d: 0.6 },
    ];
    return (
        <div className="flex w-full max-w-xl flex-col gap-3">
            <span className="self-center rounded-full border-2 border-[#1f2a44] bg-white px-3 py-0.5 text-xs font-black">
                {t('turboTrivia.howTo.demoLaps')}
            </span>
            <div className="flex flex-col gap-1.5 rounded-2xl border-3 border-[#1f2a44] bg-[#334155] p-2.5">
                {lanes.map((lane, i) => (
                    <div key={lane.name} className="relative h-11">
                        <span className="absolute inset-x-0 top-1/2 border-t-2 border-dashed border-white/40" />
                        <span
                            className="tt-howto-drive absolute top-0.5 z-10"
                            style={
                                {
                                    '--tt-to': lane.to,
                                    animationDelay: `${lane.d}s`,
                                } as CSSProperties
                            }
                        >
                            <MiniKart look={lane.look} seat={i} />
                        </span>
                        <Flag
                            className="absolute top-1/2 right-0 size-5 -translate-y-1/2 text-[#facc15]"
                            aria-hidden="true"
                        />
                    </div>
                ))}
            </div>
            <div
                className="tt-howto-pop flex items-center justify-center gap-2 rounded-2xl border-2 border-[#1f2a44] bg-[#facc15] px-3 py-2 font-display text-base font-black"
                style={at(3.4)}
            >
                <Crown className="size-5" aria-hidden="true" />
                {t('turboTrivia.howTo.demoWinner', { name: 'Rani' })}
            </div>
        </div>
    );
}
