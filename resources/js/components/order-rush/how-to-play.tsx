import { PlayerAvatar } from '@/components/player-avatar';
import { type SequenceItem } from '@/hooks/use-order-rush';
import { useTranslations } from '@/hooks/use-translations';
import { type CharacterLook } from '@/lib/character/draw-character';
import { cn } from '@/lib/utils';
import {
    ChevronLeft,
    ChevronRight,
    Crown,
    FileDown,
    Flag,
    Pause,
    Play,
    RotateCcw,
    Smartphone,
    Video,
    Zap,
} from 'lucide-react';
import {
    type CSSProperties,
    type ReactNode,
    useCallback,
    useEffect,
    useState,
    useSyncExternalStore,
} from 'react';
import { POWER_STYLE, Piece } from './shared';

/** Shareable recording of this walkthrough (MP4 video and PDF slides). */
const TUTORIAL_BASE = '/tutorials/cara-bermain-order-rush';

/** Milliseconds each scene stays on screen while auto-playing. */
const SCENE_MS = 6500;

const SCENES = ['join', 'tap', 'test', 'score', 'power', 'win'] as const;
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

const ORANGE = '#f97316';
const GREEN = '#16a34a';
const BLUE = '#2563eb';
const BROWN = '#7c4a1e';
const WHITE = '#f8fafc';

/** T568B in the correct order: the colour key every TKJ student memorises. */
const T568B: SequenceItem[] = [
    { id: 'wo', label: 'Putih-Orange', color: WHITE, stripe: ORANGE },
    { id: 'o', label: 'Orange', color: ORANGE },
    { id: 'wg', label: 'Putih-Hijau', color: WHITE, stripe: GREEN },
    { id: 'b', label: 'Biru', color: BLUE },
    { id: 'wb', label: 'Putih-Biru', color: WHITE, stripe: BLUE },
    { id: 'g', label: 'Hijau', color: GREEN },
    { id: 'wbr', label: 'Putih-Cokelat', color: WHITE, stripe: BROWN },
    { id: 'br', label: 'Cokelat', color: BROWN },
];

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
 * Animated "how to play" walkthrough for Order Rush: six illustrated scenes
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

    return (
        <section
            className={cn(
                'flex flex-col gap-3 rounded-3xl border-3 border-[#1f2a44] bg-white p-4 shadow-[5px_5px_0px_#1f2a44] sm:p-5',
                className,
            )}
            aria-roledescription="carousel"
            aria-label={t('orderRush.howTo.title')}
            data-testid="or-howto"
            data-scene={scene}
            tabIndex={0}
            onKeyDown={onKey}
        >
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-display text-xl font-black">
                    {t('orderRush.howTo.title')}
                </h2>
                <span className="rounded-full border-2 border-[#1f2a44] bg-[#ccfbf1] px-2.5 py-0.5 text-xs font-black tabular-nums">
                    {t('orderRush.howTo.step', {
                        current: index + 1,
                        total: SCENES.length,
                    })}
                </span>
            </div>

            <div
                className="relative overflow-hidden rounded-2xl border-2 border-[#1f2a44] bg-[#ecfdf5]"
                aria-live={autoplay ? 'off' : 'polite'}
            >
                <div
                    key={`${scene}-${cycle}`}
                    className="or-howto-scene flex min-h-72 flex-col items-center justify-center gap-3 p-4 sm:min-h-80"
                    role="group"
                    aria-roledescription="slide"
                    aria-label={t('orderRush.howTo.step', {
                        current: index + 1,
                        total: SCENES.length,
                    })}
                >
                    <SceneArt scene={scene} />
                </div>
                {autoplay && (
                    <div className="absolute inset-x-0 bottom-0 h-1.5 bg-[#1f2a44]/10">
                        <div
                            key={`bar-${index}-${cycle}`}
                            className="or-howto-progress h-full bg-[#0f766e]"
                            style={{ animationDuration: `${SCENE_MS}ms` }}
                        />
                    </div>
                )}
            </div>

            <div className="flex min-h-24 flex-col gap-1 text-center">
                <h3
                    className="font-display text-lg font-black text-balance"
                    data-testid="or-howto-title"
                >
                    {t(`orderRush.howTo.scenes.${scene}.title`)}
                </h3>
                <p className="text-sm font-bold text-balance text-slate-700">
                    {t(`orderRush.howTo.scenes.${scene}.body`)}
                </p>
            </div>

            <div className="flex items-center justify-between gap-2">
                <ControlButton
                    label={t('orderRush.howTo.prev')}
                    onClick={() => go(index - 1)}
                    testId="or-howto-prev"
                >
                    <ChevronLeft className="size-5" aria-hidden="true" />
                </ControlButton>
                <div className="flex min-w-0 flex-1 items-center justify-center gap-0.5 sm:gap-1">
                    {SCENES.map((s, i) => (
                        <button
                            key={s}
                            type="button"
                            onClick={() => go(i)}
                            aria-label={t('orderRush.howTo.goTo', {
                                number: i + 1,
                            })}
                            aria-current={i === index ? 'step' : undefined}
                            data-testid={`or-howto-dot-${i}`}
                            className="grid h-11 w-6 shrink-0 place-items-center sm:w-8"
                        >
                            <span
                                className={cn(
                                    'block h-2.5 rounded-full border-2 border-[#1f2a44] transition-all',
                                    i === index
                                        ? 'w-5 bg-[#0f766e]'
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
                                    ? t('orderRush.howTo.replay')
                                    : playing
                                      ? t('orderRush.howTo.pause')
                                      : t('orderRush.howTo.play')
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
                            testId="or-howto-play"
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
                        label={t('orderRush.howTo.next')}
                        onClick={() => go(index + 1)}
                        testId="or-howto-next"
                    >
                        <ChevronRight className="size-5" aria-hidden="true" />
                    </ControlButton>
                </div>
            </div>

            <div className="flex flex-wrap justify-center gap-2 border-t-2 border-dashed border-[#1f2a44]/20 pt-3">
                <a
                    href={`${TUTORIAL_BASE}.mp4`}
                    download
                    className="inline-flex min-h-11 items-center gap-2 rounded-xl border-2 border-[#1f2a44] bg-white px-3 text-sm font-black shadow-[2px_2px_0px_#1f2a44] hover:bg-[#ccfbf1]"
                    data-testid="or-howto-video"
                >
                    <Video className="size-4" aria-hidden="true" />
                    {t('orderRush.howTo.downloadVideo')}
                </a>
                <a
                    href={`${TUTORIAL_BASE}.pdf`}
                    download
                    className="inline-flex min-h-11 items-center gap-2 rounded-xl border-2 border-[#1f2a44] bg-white px-3 text-sm font-black shadow-[2px_2px_0px_#1f2a44] hover:bg-[#ccfbf1]"
                    data-testid="or-howto-slides"
                >
                    <FileDown className="size-4" aria-hidden="true" />
                    {t('orderRush.howTo.downloadSlides')}
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
            className="grid size-11 shrink-0 place-items-center rounded-xl border-2 border-[#1f2a44] bg-white shadow-[2px_2px_0px_#1f2a44] transition-colors hover:bg-[#ccfbf1] focus-visible:ring-4 focus-visible:ring-[#0f766e]/40 focus-visible:outline-none"
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

/** Delay helper so scene timelines read as seconds. */
function at(seconds: number): CSSProperties {
    return { animationDelay: `${seconds}s` };
}

function SceneArt({ scene }: { scene: Scene }) {
    switch (scene) {
        case 'join':
            return <JoinScene />;
        case 'tap':
            return <TapScene />;
        case 'test':
            return <TestScene />;
        case 'score':
            return <ScoreScene />;
        case 'power':
            return <PowerScene />;
        default:
            return <WinScene />;
    }
}

function JoinScene() {
    const { t } = useTranslations();
    const digits = '482913'.split('');
    return (
        <div className="flex w-full flex-wrap items-center justify-center gap-4">
            <div className="flex flex-col items-center gap-2 rounded-2xl border-3 border-[#1f2a44] bg-[#1e293b] px-4 py-3 text-white">
                <span className="text-[10px] font-black tracking-widest text-slate-300 uppercase">
                    {t('orderRush.howTo.demoProjector')}
                </span>
                <span className="flex gap-1 font-display text-3xl font-black text-[#5eead4]">
                    {digits.map((d, i) => (
                        <span
                            key={i}
                            className="or-howto-pop"
                            style={at(0.2 + i * 0.18)}
                        >
                            {d}
                        </span>
                    ))}
                </span>
                <span className="text-xs font-bold text-slate-300">PIN</span>
            </div>
            <Phone className="max-w-56">
                <span className="flex items-center gap-1.5 text-xs font-black">
                    <Smartphone className="size-4" aria-hidden="true" />
                    {t('orderRush.howTo.demoJoined')}
                </span>
                <div className="flex justify-center gap-1.5">
                    {[RANI, BUDI, SARI].map((look, i) => (
                        <span
                            key={i}
                            className="or-howto-rise"
                            style={at(1.5 + i * 0.4)}
                        >
                            <Avatar look={look} seat={i} className="size-16" />
                        </span>
                    ))}
                </div>
            </Phone>
        </div>
    );
}

/** Pool order shown scrambled; taps then fill slots 1..8 in T568B order. */
const SCRAMBLE = [5, 2, 7, 0, 3, 6, 1, 4];

function TapScene() {
    const { t } = useTranslations();
    return (
        <Phone className="max-w-72">
            <p className="text-center text-xs font-black">
                {t('orderRush.howTo.demoTarget')}
            </p>
            <div className="grid grid-cols-4 gap-1">
                {T568B.map((item, slot) => (
                    <span
                        key={item.id}
                        className="relative grid min-h-9 place-items-center rounded-lg border-2 border-dashed border-[#1f2a44]/40 bg-[#f8fafc]"
                    >
                        <span className="absolute text-[10px] font-black text-slate-400">
                            {slot + 1}
                        </span>
                        <span className="absolute -top-2 -left-1.5 z-10 grid size-4 place-items-center rounded-full border border-[#1f2a44] bg-white text-[9px] font-black">
                            {slot + 1}
                        </span>
                        <span
                            className="or-howto-fill absolute inset-0 w-full"
                            style={at(0.9 + slot * 0.45)}
                        >
                            <Piece item={item} kind="cable" size="sm" />
                        </span>
                    </span>
                ))}
            </div>
            <div className="grid grid-cols-4 gap-1">
                {SCRAMBLE.map((pos) => {
                    const item = T568B[pos];
                    return (
                        <span
                            key={item.id}
                            className="or-howto-take relative"
                            style={at(0.6 + pos * 0.45)}
                        >
                            <Piece item={item} kind="cable" size="sm" />
                        </span>
                    );
                })}
            </div>
            <span
                className="or-howto-finger pointer-events-none absolute size-7 rounded-full border-2 border-[#1f2a44] bg-[#facc15]/80"
                aria-hidden="true"
            />
        </Phone>
    );
}

function TestScene() {
    const { t } = useTranslations();
    return (
        <div className="flex w-full flex-wrap items-center justify-center gap-4">
            <TesterDemo
                label={t('orderRush.howTo.demoCorrect')}
                stopAt={8}
                tone="ok"
            />
            <TesterDemo
                label={t('orderRush.howTo.demoWrong', { pin: 3 })}
                stopAt={2}
                tone="bad"
            />
        </div>
    );
}

function TesterDemo({
    label,
    stopAt,
    tone,
}: {
    label: string;
    stopAt: number;
    tone: 'ok' | 'bad';
}) {
    const { t } = useTranslations();
    const settle = 0.6 + (stopAt + 1) * 0.16;
    return (
        <div
            className={cn(
                'flex flex-col items-center gap-1.5 rounded-2xl border-3 border-[#1f2a44] bg-[#1e293b] px-3 py-2.5 text-white',
                tone === 'bad' && 'or-howto-shake',
            )}
            style={tone === 'bad' ? at(settle) : undefined}
        >
            <span className="text-[10px] font-black tracking-widest text-slate-300 uppercase">
                {t('orderRush.lanTester')}
            </span>
            <div className="flex gap-1">
                {Array.from({ length: 8 }, (_, i) => {
                    const final =
                        tone === 'ok' || i < stopAt
                            ? 'ok'
                            : i === stopAt
                              ? 'bad'
                              : 'off';
                    return (
                        <span
                            key={i}
                            className="or-howto-led grid size-6 place-items-center rounded-full border border-black/40 text-[10px] font-black"
                            data-final={final}
                            style={
                                {
                                    '--or-run': `${0.6 + i * 0.16}s`,
                                    '--or-settle': `${settle}s`,
                                } as CSSProperties
                            }
                        >
                            {i + 1}
                        </span>
                    );
                })}
            </div>
            <span
                className={cn(
                    'or-howto-rise rounded-full px-2 py-0.5 text-xs font-black',
                    tone === 'ok'
                        ? 'bg-[#22c55e] text-[#052e16]'
                        : 'bg-[#ef4444] text-white',
                )}
                style={at(settle + 0.2)}
            >
                {label}
            </span>
        </div>
    );
}

function ScoreScene() {
    const { t } = useTranslations();
    return (
        <Phone className="max-w-72">
            <div className="flex items-center gap-2">
                <Avatar look={RANI} seat={0} className="size-11" />
                <div className="flex min-w-0 flex-1 flex-col text-xs font-black">
                    <span>Rani</span>
                    <span className="text-slate-500">
                        {t('orderRush.howTo.demoStreak')}
                    </span>
                </div>
            </div>
            <div className="flex flex-col gap-1">
                {[
                    { s: '+100', bonus: '+80', d: 0.4 },
                    { s: '+100', bonus: '+45', d: 1.2 },
                    { s: '+100', bonus: '+92', d: 2 },
                ].map((row, i) => (
                    <div
                        key={i}
                        className="or-howto-rise flex items-center justify-between rounded-xl border-2 border-[#1f2a44] bg-[#ccfbf1] px-2.5 py-1 text-xs font-black"
                        style={at(row.d)}
                    >
                        <span>
                            {t('orderRush.howTo.demoModule', { n: i + 1 })}
                        </span>
                        <span className="tabular-nums">
                            {row.s}{' '}
                            <span className="text-[#b45309]">
                                {row.bonus} ⚡
                            </span>
                        </span>
                    </div>
                ))}
            </div>
            <div
                className="or-howto-pop flex items-center justify-center gap-1.5 rounded-xl border-2 border-[#1f2a44] bg-[#facc15] py-1.5 font-display text-lg font-black"
                style={at(2.9)}
            >
                <Zap className="size-5" aria-hidden="true" />
                {t('orderRush.combo', { count: 3 })}
            </div>
            <div className="grid grid-cols-3 gap-1">
                {(['TANGLE', 'FREEZE', 'SHIELD'] as const).map((type, i) => {
                    const style = POWER_STYLE[type];
                    const Icon = style.icon;
                    return (
                        <span
                            key={type}
                            className="or-howto-rise flex flex-col items-center gap-0.5 rounded-lg border-2 border-[#1f2a44] py-1 text-[10px] font-black text-white"
                            style={{
                                ...at(3.5 + i * 0.25),
                                background: style.tone,
                            }}
                        >
                            <Icon className="size-4" aria-hidden="true" />
                            {t(`orderRush.power.${type}`)}
                        </span>
                    );
                })}
            </div>
        </Phone>
    );
}

function PowerScene() {
    const { t } = useTranslations();
    const cards = [
        {
            type: 'TANGLE' as const,
            body: t('orderRush.howTo.demoTangle'),
            effect: 'or-howto-tangle',
        },
        {
            type: 'FREEZE' as const,
            body: t('orderRush.howTo.demoFreeze'),
            effect: 'or-howto-freeze',
        },
        {
            type: 'SHIELD' as const,
            body: t('orderRush.howTo.demoShield'),
            effect: 'or-howto-shield',
        },
    ];
    return (
        <div className="grid w-full max-w-xl grid-cols-1 gap-2 sm:grid-cols-3">
            {cards.map((card, i) => {
                const style = POWER_STYLE[card.type];
                const Icon = style.icon;
                return (
                    <div
                        key={card.type}
                        className="or-howto-rise flex items-center gap-2.5 rounded-2xl border-2 border-[#1f2a44] bg-white p-2.5 sm:flex-col sm:text-center"
                        style={at(0.3 + i * 0.9)}
                    >
                        <span
                            className={cn(
                                'grid size-12 shrink-0 place-items-center rounded-xl border-2 border-[#1f2a44] text-white',
                                card.effect,
                            )}
                            style={{
                                ...at(0.8 + i * 0.9),
                                background: style.tone,
                            }}
                        >
                            <Icon className="size-6" aria-hidden="true" />
                        </span>
                        <span className="flex min-w-0 flex-col gap-0.5">
                            <span className="text-sm font-black">
                                {t(`orderRush.power.${card.type}`)}
                            </span>
                            <span className="text-xs font-bold text-slate-600">
                                {card.body}
                            </span>
                        </span>
                    </div>
                );
            })}
        </div>
    );
}

function WinScene() {
    const { t } = useTranslations();
    const lanes = [
        { look: RANI, name: 'Rani', to: '80%', d: 0.3 },
        { look: BUDI, name: 'Budi', to: '58%', d: 0.45 },
        { look: SARI, name: 'Sari', to: '42%', d: 0.6 },
    ];
    return (
        <div className="flex w-full max-w-xl flex-col gap-3">
            <div className="flex flex-col gap-1.5 rounded-2xl border-3 border-[#1f2a44] bg-[#0f172a] p-2.5">
                {lanes.map((lane, i) => (
                    <div key={lane.name} className="relative h-11">
                        <span className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-slate-700" />
                        <span
                            className="or-howto-lane absolute top-1/2 left-0 h-1.5 -translate-y-1/2 rounded-full bg-[#5eead4]"
                            style={
                                {
                                    '--or-to': lane.to,
                                    animationDelay: `${lane.d}s`,
                                } as CSSProperties
                            }
                        />
                        <span
                            className="or-howto-runner absolute top-0 z-10 flex items-center gap-1"
                            style={
                                {
                                    '--or-to': lane.to,
                                    animationDelay: `${lane.d}s`,
                                } as CSSProperties
                            }
                        >
                            <Avatar
                                look={lane.look}
                                seat={i}
                                className="size-11"
                            />
                        </span>
                        <Flag
                            className="absolute top-1/2 right-0 size-5 -translate-y-1/2 text-[#facc15]"
                            aria-hidden="true"
                        />
                    </div>
                ))}
            </div>
            <div
                className="or-howto-pop flex items-center justify-center gap-2 rounded-2xl border-2 border-[#1f2a44] bg-[#facc15] px-3 py-2 font-display text-base font-black"
                style={at(3.4)}
            >
                <Crown className="size-5" aria-hidden="true" />
                {t('orderRush.howTo.demoWinner', { name: 'Rani' })}
            </div>
        </div>
    );
}
