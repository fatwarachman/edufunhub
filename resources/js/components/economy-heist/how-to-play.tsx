import {
    ChestArt,
    OUTCOME_STYLE,
    useOutcomeValue,
} from '@/components/economy-heist/shared';
import { PlayerAvatar } from '@/components/player-avatar';
import { type ChestType } from '@/hooks/use-economy-heist';
import { useTranslations } from '@/hooks/use-translations';
import { type CharacterLook } from '@/lib/character/draw-character';
import { cn } from '@/lib/utils';
import {
    Check,
    ChevronLeft,
    ChevronRight,
    Coins,
    Crown,
    Hourglass,
    Pause,
    Play,
    RotateCcw,
    Shield,
    Smartphone,
    Target,
    Timer,
} from 'lucide-react';
import {
    type ReactNode,
    useCallback,
    useEffect,
    useState,
    useSyncExternalStore,
} from 'react';

/** Seconds each scene stays on screen while auto-playing. */
const SCENE_MS = 6000;

const SCENES = ['join', 'answer', 'chest', 'outcomes', 'heist', 'win'] as const;
type Scene = (typeof SCENES)[number];

/** Demo looks for the illustrated players (same chibi model as the portal). */
const RANI: CharacterLook = {
    color: 'violet',
    gender: 'girl',
    skin: 'tan',
    hair: 'black',
};
const BUDI: CharacterLook = {
    color: 'teal',
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
 * Animated "how to play" walkthrough: six illustrated scenes that auto-play
 * like a short video (pause, previous/next, dots, arrow keys). Pure React +
 * CSS, so it follows the locale and needs no media download.
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
            aria-label={t('economyHeist.howTo.title')}
            data-testid="eh-howto"
            data-scene={scene}
            tabIndex={0}
            onKeyDown={onKey}
        >
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-display text-xl font-black">
                    {t('economyHeist.howTo.title')}
                </h2>
                <span className="rounded-full border-2 border-[#1f2a44] bg-[#FFFDE6] px-2.5 py-0.5 text-xs font-black tabular-nums">
                    {t('economyHeist.howTo.step', {
                        current: index + 1,
                        total: SCENES.length,
                    })}
                </span>
            </div>

            <div
                className="relative overflow-hidden rounded-2xl border-2 border-[#1f2a44] bg-[#fff8e6]"
                aria-live={autoplay ? 'off' : 'polite'}
            >
                <div
                    key={`${scene}-${cycle}`}
                    className="eh-howto-scene flex min-h-64 flex-col items-center justify-center gap-3 p-4 sm:min-h-72"
                    role="group"
                    aria-roledescription="slide"
                    aria-label={t('economyHeist.howTo.step', {
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
                            className="eh-howto-progress h-full bg-[#b45309]"
                            style={{ animationDuration: `${SCENE_MS}ms` }}
                        />
                    </div>
                )}
            </div>

            <div className="flex flex-col gap-1 text-center">
                <h3
                    className="font-display text-lg font-black"
                    data-testid="eh-howto-title"
                >
                    {t(`economyHeist.howTo.scenes.${scene}.title`)}
                </h3>
                <p className="text-sm font-bold text-balance text-slate-700">
                    {t(`economyHeist.howTo.scenes.${scene}.body`)}
                </p>
            </div>

            <div className="flex items-center justify-between gap-2">
                <ControlButton
                    label={t('economyHeist.howTo.prev')}
                    onClick={() => go(index - 1)}
                    testId="eh-howto-prev"
                >
                    <ChevronLeft className="size-5" aria-hidden="true" />
                </ControlButton>
                <div className="flex min-w-0 flex-1 items-center justify-center gap-0.5 sm:gap-1">
                    {SCENES.map((s, i) => (
                        <button
                            key={s}
                            type="button"
                            onClick={() => go(i)}
                            aria-label={t('economyHeist.howTo.goTo', {
                                number: i + 1,
                            })}
                            aria-current={i === index ? 'step' : undefined}
                            className="grid h-11 w-6 shrink-0 place-items-center sm:w-8"
                        >
                            <span
                                className={cn(
                                    'block h-2.5 rounded-full border-2 border-[#1f2a44] transition-all',
                                    i === index
                                        ? 'w-5 bg-[#b45309]'
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
                                    ? t('economyHeist.howTo.replay')
                                    : playing
                                      ? t('economyHeist.howTo.pause')
                                      : t('economyHeist.howTo.play')
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
                            testId="eh-howto-play"
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
                        label={t('economyHeist.howTo.next')}
                        onClick={() => go(index + 1)}
                        testId="eh-howto-next"
                    >
                        <ChevronRight className="size-5" aria-hidden="true" />
                    </ControlButton>
                </div>
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
            className="grid size-11 shrink-0 place-items-center rounded-xl border-2 border-[#1f2a44] bg-white shadow-[2px_2px_0px_#1f2a44] transition-colors hover:bg-[#FFF176] focus-visible:ring-4 focus-visible:ring-[#b45309]/40 focus-visible:outline-none"
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

function Phone({ children }: { children: ReactNode }) {
    return (
        <div className="flex w-full max-w-60 flex-col gap-2 rounded-[1.75rem] border-3 border-[#1f2a44] bg-white p-3 shadow-[4px_4px_0px_#1f2a44]">
            <span className="mx-auto h-1.5 w-12 rounded-full bg-[#1f2a44]/20" />
            {children}
        </div>
    );
}

function SceneArt({ scene }: { scene: Scene }) {
    switch (scene) {
        case 'join':
            return <JoinScene />;
        case 'answer':
            return <AnswerScene />;
        case 'chest':
            return <ChestScene />;
        case 'outcomes':
            return <OutcomesScene />;
        case 'heist':
            return <HeistScene />;
        default:
            return <WinScene />;
    }
}

function JoinScene() {
    const { t } = useTranslations();
    const digits = '482913'.split('');
    return (
        <div className="flex w-full flex-wrap items-center justify-center gap-4">
            <div className="flex flex-col items-center gap-2 rounded-2xl border-3 border-dashed border-[#1f2a44] bg-[#FFFDE6] px-4 py-3">
                <span className="text-xs font-black">PIN</span>
                <span className="flex gap-1 font-display text-3xl font-black">
                    {digits.map((d, i) => (
                        <span
                            key={i}
                            className="eh-howto-pop"
                            style={{ animationDelay: `${0.2 + i * 0.18}s` }}
                        >
                            {d}
                        </span>
                    ))}
                </span>
            </div>
            <Phone>
                <span className="flex items-center gap-1.5 text-xs font-black">
                    <Smartphone className="size-4" aria-hidden="true" />
                    {t('economyHeist.howTo.demoJoined')}
                </span>
                <div className="flex justify-center gap-1.5">
                    {[RANI, BUDI, SARI].map((look, i) => (
                        <span
                            key={i}
                            className="eh-howto-rise"
                            style={{ animationDelay: `${1.4 + i * 0.4}s` }}
                        >
                            <Avatar look={look} seat={i} className="size-14" />
                        </span>
                    ))}
                </div>
            </Phone>
        </div>
    );
}

function AnswerScene() {
    const { t } = useTranslations();
    const options = ['12', '15', '18', '21'];
    const colors = ['#c2185b', '#1565c0', '#b45309', '#2e7d32'];
    return (
        <Phone>
            <p className="text-center font-display text-lg font-black">
                3 × 6 = ?
            </p>
            <div className="grid grid-cols-2 gap-1.5">
                {options.map((o, i) => (
                    <span
                        key={o}
                        className={cn(
                            'relative grid min-h-10 place-items-center rounded-xl border-2 border-[#1f2a44] font-display font-black text-white',
                            i === 2 && 'eh-howto-tap',
                        )}
                        style={{ background: colors[i] }}
                    >
                        {o}
                        {i === 2 && (
                            <Check
                                className="eh-howto-pop absolute -top-2 -right-2 size-6 rounded-full border-2 border-[#1f2a44] bg-[#c9f5e5] p-0.5 text-[#15803d]"
                                style={{ animationDelay: '1.6s' }}
                                aria-hidden="true"
                            />
                        )}
                    </span>
                ))}
            </div>
            <div className="grid grid-cols-2 gap-1.5 text-[11px] font-black">
                <span
                    className="eh-howto-rise flex items-center justify-center gap-1 rounded-lg bg-[#c9f5e5] px-1 py-1"
                    style={{ animationDelay: '2.2s' }}
                >
                    <Check className="size-3.5" aria-hidden="true" />
                    {t('economyHeist.howTo.demoRight')}
                </span>
                <span
                    className="eh-howto-rise flex items-center justify-center gap-1 rounded-lg bg-[#FFEBF0] px-1 py-1 text-[#AD1457]"
                    style={{ animationDelay: '2.8s' }}
                >
                    <Hourglass className="size-3.5" aria-hidden="true" />
                    {t('economyHeist.howTo.demoWrong')}
                </span>
            </div>
        </Phone>
    );
}

function ChestScene() {
    const { t } = useTranslations();
    const valueOf = useOutcomeValue();
    const contents: {
        type: ChestType;
        value: number;
        unit: 'flat' | 'percent';
    }[] = [
        { type: 'SHIELD', value: 1, unit: 'flat' },
        { type: 'ADD_GOLD', value: 250, unit: 'flat' },
        { type: 'SWAP_GOLD', value: 100, unit: 'percent' },
    ];
    return (
        <div className="grid w-full max-w-md grid-cols-3 gap-2 sm:gap-4">
            {contents.map((chest, i) => {
                const picked = i === 1;
                const style = OUTCOME_STYLE[chest.type];
                const Icon = style.icon;
                return (
                    <div key={i} className="flex flex-col items-center gap-2">
                        <div
                            className={cn(
                                'flex w-full flex-col items-center rounded-3xl border-3 border-[#1f2a44] p-2 shadow-[4px_4px_0px_#1f2a44] sm:p-3',
                                picked
                                    ? 'eh-howto-pick bg-[#ffe08a]'
                                    : 'eh-chest-idle bg-[#fff1c2]',
                            )}
                            data-picked={picked ? 'true' : 'false'}
                        >
                            <span
                                className={cn(
                                    'w-full',
                                    picked && 'eh-howto-open',
                                )}
                            >
                                <ChestArt open={picked} />
                            </span>
                            <span className="font-display text-lg font-black">
                                {i + 1}
                            </span>
                        </div>
                        <span
                            className={cn(
                                'eh-howto-rise flex w-full flex-col items-center rounded-xl border-2 border-[#1f2a44] px-1 py-1 text-center text-[11px] leading-tight font-black sm:text-xs',
                                picked ? 'bg-white' : 'bg-white/70 opacity-70',
                            )}
                            style={{
                                animationDelay: picked ? '2s' : '2.8s',
                            }}
                        >
                            <Icon
                                className="size-4"
                                style={{ color: style.tone }}
                                aria-hidden="true"
                            />
                            {t(`economyHeist.outcomes.${chest.type}`)}
                            <span style={{ color: style.tone }}>
                                {valueOf(chest)}
                            </span>
                        </span>
                    </div>
                );
            })}
        </div>
    );
}

function OutcomesScene() {
    const { t } = useTranslations();
    const valueOf = useOutcomeValue();
    const list: { type: ChestType; value: number; unit: 'flat' | 'percent' }[] =
        [
            { type: 'ADD_GOLD', value: 250, unit: 'flat' },
            { type: 'SHIELD', value: 1, unit: 'flat' },
            { type: 'STEAL_PERCENT', value: 25, unit: 'percent' },
            { type: 'SWAP_GOLD', value: 100, unit: 'percent' },
            { type: 'LOSE_GOLD', value: 15, unit: 'percent' },
            { type: 'BANKRUPT_BOMB', value: 50, unit: 'percent' },
        ];
    return (
        <ul className="grid w-full max-w-lg grid-cols-2 gap-2 sm:grid-cols-3">
            {list.map((c, i) => {
                const style = OUTCOME_STYLE[c.type];
                const Icon = style.icon;
                return (
                    <li
                        key={c.type}
                        className="eh-howto-rise flex items-center gap-2 rounded-2xl border-2 border-[#1f2a44] bg-white p-2"
                        style={{ animationDelay: `${0.2 + i * 0.35}s` }}
                    >
                        <span
                            className="grid size-9 shrink-0 place-items-center rounded-xl text-white"
                            style={{ background: style.tone }}
                        >
                            <Icon className="size-5" aria-hidden="true" />
                        </span>
                        <span className="flex min-w-0 flex-col leading-tight">
                            <span className="truncate text-xs font-black">
                                {t(`economyHeist.outcomes.${c.type}`)}
                            </span>
                            <span
                                className="text-sm font-black"
                                style={{ color: style.tone }}
                            >
                                {valueOf(c)}
                            </span>
                        </span>
                    </li>
                );
            })}
        </ul>
    );
}

function HeistScene() {
    const { t } = useTranslations();
    return (
        <div className="flex w-full max-w-lg flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
                <div className="flex flex-col items-center gap-1">
                    <Avatar look={RANI} seat={0} className="size-16" />
                    <span className="text-xs font-black">Rani</span>
                </div>
                <div className="relative flex flex-1 items-center justify-center">
                    <span className="h-1 w-full rounded-full bg-[#1f2a44]/15" />
                    <span className="eh-howto-coin absolute left-0 grid size-8 place-items-center rounded-full border-2 border-[#1f2a44] bg-[#ffd93d]">
                        <Coins className="size-4" aria-hidden="true" />
                    </span>
                </div>
                <div className="flex flex-col items-center gap-1">
                    <span className="relative">
                        <Avatar look={BUDI} seat={1} className="size-16" />
                        <Target
                            className="eh-howto-pop absolute -top-1 -right-1 size-6 rounded-full bg-white text-[#7e22ce]"
                            style={{ animationDelay: '0.4s' }}
                            aria-hidden="true"
                        />
                    </span>
                    <span className="text-xs font-black">Budi</span>
                </div>
            </div>
            <div
                className="eh-howto-rise flex items-center gap-2 rounded-2xl border-2 border-[#1f2a44] bg-[#dbeafe] p-2 text-xs font-black"
                style={{ animationDelay: '2.8s' }}
            >
                <Avatar look={SARI} seat={2} className="size-9" />
                <Shield
                    className="eh-howto-shield size-6 text-[#1d4ed8]"
                    aria-hidden="true"
                />
                {t('economyHeist.howTo.demoShield')}
            </div>
        </div>
    );
}

function WinScene() {
    const { t } = useTranslations();
    const rows = [
        { look: BUDI, name: 'Budi', gold: '2.500' },
        { look: RANI, name: 'Rani', gold: '1.980' },
        { look: SARI, name: 'Sari', gold: '1.240' },
    ];
    return (
        <div className="flex w-full max-w-md flex-col gap-3">
            <div className="grid grid-cols-2 gap-2 text-xs font-black">
                <span className="flex items-center justify-center gap-1.5 rounded-xl border-2 border-[#1f2a44] bg-white px-2 py-2">
                    <Timer className="size-4" aria-hidden="true" />
                    {t('economyHeist.winTime')}
                </span>
                <span className="flex items-center justify-center gap-1.5 rounded-xl border-2 border-[#1f2a44] bg-white px-2 py-2">
                    <Target className="size-4" aria-hidden="true" />
                    {t('economyHeist.winGold')}
                </span>
            </div>
            <ol className="flex flex-col gap-1.5">
                {rows.map((r, i) => (
                    <li
                        key={r.name}
                        className={cn(
                            'eh-howto-rise flex items-center gap-2 rounded-2xl border-2 border-[#1f2a44] px-2 py-1.5',
                            i === 0 ? 'bg-[#ffe08a]' : 'bg-white',
                        )}
                        style={{ animationDelay: `${0.3 + (2 - i) * 0.45}s` }}
                    >
                        <span className="w-6 text-center font-display font-black">
                            {i === 0 ? (
                                <Crown
                                    className="mx-auto size-5 fill-[#ffd93d] text-[#b45309]"
                                    aria-hidden="true"
                                />
                            ) : (
                                `#${i + 1}`
                            )}
                        </span>
                        <Avatar look={r.look} seat={i} className="size-9" />
                        <span className="flex-1 text-sm font-black">
                            {r.name}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full border-2 border-[#1f2a44] bg-[#ffd93d] px-2 py-0.5 text-sm font-black">
                            <Coins className="size-3.5" aria-hidden="true" />
                            {r.gold}
                        </span>
                    </li>
                ))}
            </ol>
        </div>
    );
}
