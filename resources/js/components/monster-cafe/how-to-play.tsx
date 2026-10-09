import {
    DishView,
    type Ingredient,
    IngredientIcon,
    MonsterSprite,
    PieSplat,
    RatSprite,
} from '@/components/monster-cafe/art';
import { PlayerAvatar } from '@/components/player-avatar';
import { useTranslations } from '@/hooks/use-translations';
import { type CharacterLook } from '@/lib/character/draw-character';
import { cn } from '@/lib/utils';
import {
    ChevronLeft,
    ChevronRight,
    Coins,
    Crown,
    FileDown,
    Flame,
    MonitorPlay,
    Pause,
    Play,
    Pointer,
    RotateCcw,
    Smartphone,
    Timer,
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

/** Shareable recording of this walkthrough (MP4 video and PDF slides). */
const TUTORIAL_BASE = '/tutorials/cara-bermain-monster-cafe';

/** Milliseconds each scene stays on screen while auto-playing. */
const SCENE_MS = 6500;

const ACCENT = '#ea580c';

const SCENES = ['join', 'order', 'quiz', 'cook', 'pests', 'win'] as const;
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

const REDUCED_QUERY = '(prefers-reduced-motion: reduce)';

function subscribeReducedMotion(callback: () => void): () => void {
    const query = window.matchMedia(REDUCED_QUERY);
    query.addEventListener('change', callback);
    return () => query.removeEventListener('change', callback);
}

function usePrefersReducedMotion(): boolean {
    return useSyncExternalStore(
        subscribeReducedMotion,
        () => window.matchMedia(REDUCED_QUERY).matches,
        () => false,
    );
}

/**
 * Scene keyframes live with the component (the page stylesheet belongs to
 * the player pad). Every animation keeps its end state (`both`), and under
 * reduced motion the end state is shown without animating.
 */
const HOWTO_CSS = `
.mc-howto-scene { animation: mc-howto-enter .45s ease-out; }
.mc-howto-progress { width: 0; animation-name: mc-howto-progress; animation-timing-function: linear; animation-fill-mode: forwards; }
.mc-howto-pop { animation: mc-howto-pop .4s ease-out both; }
.mc-howto-rise { animation: mc-howto-rise .45s ease-out both; }
.mc-howto-fadein { animation: mc-howto-fadein .35s ease-out both; }
.mc-howto-out { animation: mc-howto-out .35s ease-in both; }
.mc-howto-walk { animation: mc-howto-walk 1s ease-out both; }
.mc-howto-drain { animation: mc-howto-drain 4.6s linear both; }
.mc-howto-pick { animation: mc-howto-pick .5s ease-out both; }
.mc-howto-tap { animation: mc-howto-tap .9s ease-in-out both; }
.mc-howto-fly { animation: mc-howto-fly .7s ease-in both; }
.mc-howto-rat { animation: mc-howto-rat 1s ease-out both; }
.mc-howto-flee { animation: mc-howto-flee .6s ease-in both; }
.mc-howto-pie { animation: mc-howto-pie .7s ease-in both; }
.mc-howto-blur { animation: mc-howto-blur .3s ease-out both; }
.mc-howto-glow { animation: mc-howto-glow 1.2s ease-in-out both; }
.mc-howto-shake { animation: mc-howto-shake .5s ease-in-out both; }
@keyframes mc-howto-enter { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
@keyframes mc-howto-progress { to { width: 100%; } }
@keyframes mc-howto-pop { 0% { opacity: 0; transform: scale(.6); } 60% { opacity: 1; transform: scale(1.08); } 100% { opacity: 1; transform: scale(1); } }
@keyframes mc-howto-rise { from { opacity: 0; transform: translateY(12px) scale(.95); } to { opacity: 1; transform: none; } }
@keyframes mc-howto-fadein { from { opacity: 0; } to { opacity: 1; } }
@keyframes mc-howto-out { from { opacity: 1; } to { opacity: 0; } }
@keyframes mc-howto-walk { from { opacity: 0; transform: translateX(-60px); } to { opacity: 1; transform: none; } }
@keyframes mc-howto-drain { 0% { width: 100%; background: #15803d; } 45% { background: #15803d; } 55% { background: #b45309; } 100% { width: 42%; background: #b45309; } }
@keyframes mc-howto-pick { 0% { transform: scale(1); } 40% { transform: scale(.94); } 100% { transform: scale(1); background: #15803d; color: #fff; box-shadow: 0 0 0 3px #86efac; } }
@keyframes mc-howto-tap { 0% { opacity: 0; transform: translate(14px, 14px); } 30% { opacity: 1; transform: none; } 55% { opacity: 1; transform: scale(.85); } 100% { opacity: 0; transform: none; } }
@keyframes mc-howto-fly { 0% { opacity: 1; transform: none; } 100% { opacity: 0; transform: translateY(70px) scale(.5); } }
@keyframes mc-howto-rat { from { opacity: 0; transform: translateX(80px); } to { opacity: 1; transform: none; } }
@keyframes mc-howto-flee { 0% { opacity: 1; transform: none; } 40% { transform: scaleX(-1) translateX(-6px); } 100% { opacity: .6; transform: scaleX(-1) translateX(-14px); } }
@keyframes mc-howto-pie { 0% { opacity: 0; transform: translate(-90px, 10px) rotate(-30deg) scale(.6); } 20% { opacity: 1; } 100% { opacity: 0; transform: translate(0, 0) rotate(20deg) scale(1.2); } }
@keyframes mc-howto-blur { from { opacity: 0; } to { opacity: 1; } }
@keyframes mc-howto-glow { 0%, 100% { box-shadow: 0 0 0 0 rgb(234 88 12 / 0); } 50% { box-shadow: 0 0 0 6px rgb(234 88 12 / .45); } }
@keyframes mc-howto-shake { 0%, 100% { transform: none; } 25% { transform: rotate(-6deg); } 75% { transform: rotate(6deg); } }
@media (prefers-reduced-motion: reduce) {
  .mc-howto-scene, .mc-howto-pop, .mc-howto-rise, .mc-howto-fadein, .mc-howto-walk, .mc-howto-rat, .mc-howto-blur, .mc-howto-glow, .mc-howto-shake { animation: none; }
  .mc-howto-drain { animation: none; width: 42%; background: #b45309; }
  .mc-howto-pick { animation: none; background: #15803d; color: #fff; box-shadow: 0 0 0 3px #86efac; }
  .mc-howto-flee { animation: none; opacity: .6; transform: scaleX(-1) translateX(-14px); }
  .mc-howto-out, .mc-howto-tap, .mc-howto-fly, .mc-howto-pie { animation: none; opacity: 0; }
}
`;

/**
 * Animated "how to play" walkthrough for Monster Café: six illustrated
 * scenes that auto-play like a short video (pause, previous/next, dots,
 * arrow keys). Pure React + CSS, so it follows the locale.
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

    const step = t('monsterCafe.howTo.step', {
        current: index + 1,
        total: SCENES.length,
    });

    return (
        <section
            className={cn(
                'flex flex-col gap-3 rounded-3xl border-3 border-[#1f2a44] bg-white p-4 text-[#1f2a44] shadow-[5px_5px_0px_#1f2a44] sm:p-5',
                className,
            )}
            aria-roledescription="carousel"
            aria-label={t('monsterCafe.howTo.title')}
            data-testid="mc-howto"
            data-scene={scene}
            tabIndex={0}
            onKeyDown={onKey}
        >
            <style>{HOWTO_CSS}</style>
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-display text-xl font-black">
                    {t('monsterCafe.howTo.title')}
                </h2>
                <span
                    className="rounded-full border-2 border-[#1f2a44] bg-[#ffedd5] px-2.5 py-0.5 text-xs font-black tabular-nums"
                    data-testid="mc-howto-step"
                >
                    {step}
                </span>
            </div>

            <div
                className="relative overflow-hidden rounded-2xl border-2 border-[#1f2a44] bg-[#fff7ed]"
                aria-live={autoplay ? 'off' : 'polite'}
            >
                <div
                    key={`${scene}-${cycle}`}
                    className="mc-howto-scene flex h-[25rem] flex-col items-center justify-center gap-3 overflow-hidden p-3 sm:p-4"
                    role="group"
                    aria-roledescription="slide"
                    aria-label={step}
                    data-testid="mc-howto-scene"
                >
                    <SceneArt scene={scene} />
                </div>
                {autoplay && (
                    <div className="absolute inset-x-0 bottom-0 h-1.5 bg-[#1f2a44]/10">
                        <div
                            key={`bar-${index}-${cycle}`}
                            className="mc-howto-progress h-full"
                            style={{
                                animationDuration: `${SCENE_MS}ms`,
                                background: ACCENT,
                            }}
                        />
                    </div>
                )}
            </div>

            <div className="flex min-h-40 flex-col justify-start gap-1 text-center">
                <h3
                    className="font-display text-lg font-black text-balance"
                    data-testid="mc-howto-title"
                >
                    {t(`monsterCafe.howTo.scenes.${scene}.title`)}
                </h3>
                <p className="text-sm font-bold text-balance text-slate-700">
                    {t(`monsterCafe.howTo.scenes.${scene}.body`)}
                </p>
            </div>

            <div className="flex items-center justify-between gap-2">
                <ControlButton
                    label={t('monsterCafe.howTo.prev')}
                    onClick={() => go(index - 1)}
                    testId="mc-howto-prev"
                >
                    <ChevronLeft className="size-5" aria-hidden="true" />
                </ControlButton>
                <div className="flex min-w-0 flex-1 items-center justify-center gap-0.5 sm:gap-1">
                    {SCENES.map((s, i) => (
                        <button
                            key={s}
                            type="button"
                            onClick={() => go(i)}
                            aria-label={t('monsterCafe.howTo.goTo', {
                                number: i + 1,
                            })}
                            aria-current={i === index ? 'step' : undefined}
                            data-testid={`mc-howto-dot-${i}`}
                            className="grid h-11 w-6 shrink-0 place-items-center sm:w-8"
                        >
                            <span
                                className={cn(
                                    'block h-2.5 rounded-full border-2 border-[#1f2a44] transition-all',
                                    i === index
                                        ? 'w-5 bg-[#ea580c]'
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
                                    ? t('monsterCafe.howTo.replay')
                                    : playing
                                      ? t('monsterCafe.howTo.pause')
                                      : t('monsterCafe.howTo.play')
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
                            testId="mc-howto-play"
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
                        label={t('monsterCafe.howTo.next')}
                        onClick={() => go(index + 1)}
                        testId="mc-howto-next"
                    >
                        <ChevronRight className="size-5" aria-hidden="true" />
                    </ControlButton>
                </div>
            </div>

            <div className="flex flex-wrap justify-center gap-2 border-t-2 border-dashed border-[#1f2a44]/20 pt-3">
                <a
                    href={`${TUTORIAL_BASE}.mp4`}
                    download
                    className="inline-flex min-h-11 items-center gap-2 rounded-xl border-2 border-[#1f2a44] bg-white px-3 text-sm font-black shadow-[2px_2px_0px_#1f2a44] hover:bg-[#ffedd5]"
                    data-testid="mc-howto-video"
                >
                    <Video className="size-4" aria-hidden="true" />
                    {t('monsterCafe.howTo.downloadVideo')}
                </a>
                <a
                    href={`${TUTORIAL_BASE}.pdf`}
                    download
                    className="inline-flex min-h-11 items-center gap-2 rounded-xl border-2 border-[#1f2a44] bg-white px-3 text-sm font-black shadow-[2px_2px_0px_#1f2a44] hover:bg-[#ffedd5]"
                    data-testid="mc-howto-slides"
                >
                    <FileDown className="size-4" aria-hidden="true" />
                    {t('monsterCafe.howTo.downloadSlides')}
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
            className="grid size-11 shrink-0 place-items-center rounded-xl border-2 border-[#1f2a44] bg-white shadow-[2px_2px_0px_#1f2a44] transition-colors hover:bg-[#ffedd5] focus-visible:ring-4 focus-visible:ring-[#ea580c]/40 focus-visible:outline-none"
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

/** Tapping finger used to show where the player presses. */
function Finger({
    className,
    style,
}: {
    className?: string;
    style?: CSSProperties;
}) {
    return (
        <span
            className={cn(
                'mc-howto-tap pointer-events-none absolute z-20 grid size-9 place-items-center rounded-full border-2 border-[#1f2a44] bg-white shadow-[2px_2px_0px_#1f2a44]',
                className,
            )}
            style={style}
            aria-hidden="true"
        >
            <Pointer className="size-5" />
        </span>
    );
}

/** Delay helper so scene timelines read as seconds. */
function at(seconds: number): CSSProperties {
    return { animationDelay: `${seconds}s` };
}

function useIngredientName() {
    const { t } = useTranslations();
    return (ingredient: Ingredient) =>
        t(`monsterCafe.common.ingredients.${ingredient}`);
}

function SceneArt({ scene }: { scene: Scene }) {
    switch (scene) {
        case 'join':
            return <JoinScene />;
        case 'order':
            return <OrderScene />;
        case 'quiz':
            return <QuizScene />;
        case 'cook':
            return <CookScene />;
        case 'pests':
            return <PestsScene />;
        default:
            return <WinScene />;
    }
}

function JoinScene() {
    const { t } = useTranslations();
    const digits = '730415'.split('');
    return (
        <div className="flex w-full flex-wrap items-center justify-center gap-4">
            <div className="flex flex-col items-center gap-2 rounded-2xl border-3 border-[#1f2a44] bg-[#1f2a44] px-4 py-3 text-white">
                <span className="flex items-center gap-1 text-[10px] font-black tracking-widest text-orange-200 uppercase">
                    <MonitorPlay className="size-3.5" aria-hidden="true" />
                    {t('monsterCafe.howTo.demoProjector')}
                </span>
                <span className="flex gap-1 font-display text-3xl font-black text-[#fdba74]">
                    {digits.map((d, i) => (
                        <span
                            key={i}
                            className="mc-howto-pop"
                            style={at(0.2 + i * 0.18)}
                        >
                            {d}
                        </span>
                    ))}
                </span>
                <span
                    className="mc-howto-pop flex items-end gap-0.5 rounded-xl bg-[#fff7ed] px-2 pt-1"
                    style={at(1.4)}
                >
                    <MonsterSprite kind="SLIME" size={34} />
                    <MonsterSprite kind="YETI" size={40} />
                    <MonsterSprite kind="DRAGON" size={34} />
                </span>
            </div>
            <Phone className="max-w-56">
                <span className="flex items-center gap-1.5 text-xs font-black">
                    <Smartphone className="size-4" aria-hidden="true" />
                    {t('monsterCafe.howTo.demoJoined')}
                </span>
                <div className="flex flex-col gap-1 sm:gap-1.5">
                    {[RANI, BUDI, SARI].map((look, i) => (
                        <span
                            key={i}
                            className="mc-howto-rise flex items-center gap-2 rounded-xl border-2 border-[#1f2a44] bg-[#fff7ed] p-0.5 sm:p-1"
                            style={at(2 + i * 0.45)}
                        >
                            <Avatar
                                look={look}
                                seat={i}
                                className="size-8 sm:size-9"
                            />
                            <span className="text-xs font-black">
                                {['Rani', 'Budi', 'Sari'][i]}
                            </span>
                            <span className="mr-1.5 ml-auto text-[10px] font-black text-[#9a3412]">
                                {t('monsterCafe.howTo.demoChef')}
                            </span>
                        </span>
                    ))}
                </div>
            </Phone>
        </div>
    );
}

function OrderScene() {
    const { t } = useTranslations();
    const name = useIngredientName();
    const recipe: Ingredient[] = ['BUN', 'PATTY', 'CHEESE', 'LETTUCE'];
    return (
        <div className="flex w-full max-w-md flex-col items-center gap-3">
            <div className="flex w-full items-end justify-center gap-3">
                <div
                    className="mc-howto-walk relative size-28 shrink-0 sm:size-32"
                    style={at(0.2)}
                >
                    <span
                        className="mc-howto-out absolute inset-0"
                        style={at(3.4)}
                    >
                        <MonsterSprite
                            kind="CYCLOPS"
                            mood="HAPPY"
                            className="size-full"
                            size={128}
                        />
                    </span>
                    <span
                        className="mc-howto-fadein absolute inset-0"
                        style={at(3.4)}
                    >
                        <MonsterSprite
                            kind="CYCLOPS"
                            mood="IMPATIENT"
                            className="size-full"
                            size={128}
                        />
                    </span>
                </div>
                <div
                    className="mc-howto-pop relative flex min-w-0 flex-col gap-1.5 rounded-2xl border-3 border-[#1f2a44] bg-white p-2 shadow-[3px_3px_0px_#1f2a44]"
                    style={at(1)}
                >
                    <span className="text-[11px] font-black text-slate-600 uppercase">
                        {t('monsterCafe.howTo.demoOrder')}
                    </span>
                    <span className="flex items-center gap-1">
                        <DishView dish="BURGER" items={recipe} size={52} />
                        <span className="grid grid-cols-2 gap-1">
                            {recipe.map((item, i) => (
                                <span
                                    key={item}
                                    className="mc-howto-pop flex items-center gap-1 rounded-lg border-2 border-[#1f2a44]/20 bg-[#fff7ed] pr-1.5 text-[10px] font-black"
                                    style={at(1.3 + i * 0.2)}
                                >
                                    <IngredientIcon
                                        ingredient={item}
                                        size={22}
                                    />
                                    {name(item)}
                                </span>
                            ))}
                        </span>
                    </span>
                </div>
            </div>
            <div className="flex w-full max-w-xs flex-col gap-1">
                <span className="flex items-center justify-between text-xs font-black">
                    <span className="inline-flex items-center gap-1">
                        <Timer className="size-4" aria-hidden="true" />
                        {t('monsterCafe.howTo.demoPatience')}
                    </span>
                    <span
                        className="mc-howto-fadein text-[#b45309]"
                        style={at(3.4)}
                    >
                        {t('monsterCafe.howTo.demoHurry')}
                    </span>
                </span>
                <span className="h-4 overflow-hidden rounded-full border-2 border-[#1f2a44] bg-white">
                    <span
                        className="mc-howto-drain block h-full"
                        style={at(1)}
                    />
                </span>
            </div>
            <span
                className="mc-howto-pop rounded-full border-2 border-[#1f2a44] bg-[#fecdd3] px-3 py-1 text-center text-xs font-black"
                style={at(4.2)}
            >
                {t('monsterCafe.howTo.demoAngry')}
            </span>
        </div>
    );
}

function QuizScene() {
    const { t } = useTranslations();
    const name = useIngredientName();
    const pantry: Ingredient[] = ['BUN', 'PATTY', 'CHEESE', 'LETTUCE'];
    const options = ['12', '15', '18', '21'];
    return (
        <div className="relative flex w-full flex-col items-center gap-2">
            <Phone className="max-w-72">
                <div className="relative grid grid-cols-4 gap-1.5">
                    {pantry.map((item) => (
                        <span
                            key={item}
                            className={cn(
                                'flex flex-col items-center rounded-xl border-2 border-[#1f2a44] bg-[#fff7ed] p-1 text-[9px] font-black',
                                item === 'CHEESE' && 'mc-howto-glow',
                            )}
                            style={item === 'CHEESE' ? at(0.4) : undefined}
                        >
                            <IngredientIcon ingredient={item} size={30} />
                            <span className="w-full text-center leading-tight break-words">
                                {name(item)}
                            </span>
                        </span>
                    ))}
                    <Finger className="top-6 left-[56%]" style={at(0.5)} />
                </div>
                <div
                    className="mc-howto-pop flex flex-col gap-1.5 rounded-xl border-2 border-[#1f2a44] bg-[#fff7ed] p-2"
                    style={at(1.3)}
                >
                    <p className="flex items-center justify-center gap-1.5 text-center text-sm font-black">
                        <IngredientIcon ingredient="CHEESE" size={22} />
                        {t('monsterCafe.howTo.demoQuestion')}
                    </p>
                    <div className="grid grid-cols-2 gap-1.5">
                        {options.map((option, i) => (
                            <span
                                key={option}
                                className={cn(
                                    'flex min-h-9 items-center gap-1.5 rounded-xl border-2 border-[#1f2a44] bg-white px-2 text-xs font-black',
                                    i === 1 && 'mc-howto-pick',
                                )}
                                style={i === 1 ? at(2.5) : undefined}
                            >
                                <span className="grid size-5 place-items-center rounded-md bg-[#1f2a44]/10">
                                    {'ABCD'[i]}
                                </span>
                                {option}
                            </span>
                        ))}
                    </div>
                </div>
                <div className="flex items-center gap-1.5 rounded-xl border-2 border-dashed border-[#1f2a44]/40 p-1">
                    <span className="text-[10px] font-black text-slate-600 uppercase">
                        {t('monsterCafe.howTo.demoTray')}
                    </span>
                    <IngredientIcon ingredient="BUN" size={24} />
                    <IngredientIcon ingredient="PATTY" size={24} />
                    <span className="mc-howto-pop" style={at(3.2)}>
                        <IngredientIcon ingredient="CHEESE" size={24} />
                    </span>
                </div>
            </Phone>
            <div className="flex flex-wrap justify-center gap-2">
                <span
                    className="mc-howto-pop rounded-full border-2 border-[#1f2a44] bg-[#22c55e] px-3 py-1 text-center text-xs font-black text-[#052e16]"
                    style={at(3)}
                >
                    {t('monsterCafe.howTo.demoCorrect', {
                        ingredient: name('CHEESE'),
                    })}
                </span>
                <span
                    className="mc-howto-pop rounded-full border-2 border-[#1f2a44] bg-[#fecdd3] px-3 py-1 text-center text-xs font-black"
                    style={at(3.8)}
                >
                    {t('monsterCafe.howTo.demoWrong')}
                </span>
            </div>
        </div>
    );
}

function Oven({ children }: { children: ReactNode }) {
    const { t } = useTranslations();
    return (
        <div className="flex flex-col items-center gap-1">
            <div className="flex w-36 flex-col gap-1 rounded-2xl border-3 border-[#1f2a44] bg-[#94a3b8] p-1.5 shadow-[3px_3px_0px_#1f2a44] sm:w-40">
                <div className="flex items-center justify-between px-1">
                    <span className="text-[10px] font-black text-white uppercase">
                        {t('monsterCafe.howTo.demoOven')}
                    </span>
                    <span className="flex gap-1">
                        <span className="size-2.5 rounded-full border-2 border-[#1f2a44] bg-[#fde047]" />
                        <span className="size-2.5 rounded-full border-2 border-[#1f2a44] bg-white" />
                    </span>
                </div>
                <div className="relative grid h-24 place-items-center overflow-hidden rounded-xl border-3 border-[#1f2a44] bg-[#431407]">
                    <span className="absolute inset-x-2 bottom-1.5 h-1 rounded-full bg-[#f97316]" />
                    {children}
                </div>
                <span className="mx-auto h-2 w-20 rounded-full border-2 border-[#1f2a44] bg-[#e2e8f0]" />
            </div>
        </div>
    );
}

function CookScene() {
    const { t } = useTranslations();
    const stack: Ingredient[] = ['BUN', 'PATTY', 'CHEESE', 'LETTUCE'];
    return (
        <div className="flex w-full max-w-md flex-col items-center gap-3">
            <div className="flex w-full items-end justify-center gap-3 sm:gap-5">
                <div className="flex flex-col items-center gap-1">
                    <span className="text-[10px] font-black text-slate-600 uppercase">
                        {t('monsterCafe.howTo.demoPlate')}
                    </span>
                    <div className="relative grid size-32 place-items-center rounded-2xl border-2 border-[#1f2a44] bg-white sm:size-36">
                        {stack.map((item, i) => (
                            <span
                                key={item}
                                className="mc-howto-fadein absolute inset-0 grid place-items-center"
                                style={at(0.3 + i * 0.4)}
                            >
                                <DishView
                                    dish="BURGER"
                                    items={stack.slice(0, i + 1)}
                                    size={112}
                                />
                            </span>
                        ))}
                        <span className="absolute -bottom-3 left-1/2 flex -translate-x-1/2 gap-0.5 rounded-full border-2 border-[#1f2a44] bg-[#fff7ed] px-1">
                            {stack.map((item, i) => (
                                <span
                                    key={item}
                                    className="mc-howto-pop"
                                    style={at(0.3 + i * 0.4)}
                                >
                                    <IngredientIcon
                                        ingredient={item}
                                        size={22}
                                    />
                                </span>
                            ))}
                        </span>
                    </div>
                </div>
                <Oven>
                    <span
                        className="mc-howto-pop absolute inset-0 grid place-items-center"
                        style={at(2.2)}
                    >
                        <DishView dish="BURGER" items={stack} size={84} />
                    </span>
                    <span
                        className="mc-howto-pop absolute top-1 right-1 rounded-md bg-white px-1.5 text-[10px] font-black text-[#15803d]"
                        style={at(3.4)}
                    >
                        {t('monsterCafe.howTo.demoReady')}
                    </span>
                </Oven>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2">
                <span
                    className="mc-howto-pop inline-flex items-center gap-1 rounded-full border-2 border-[#1f2a44] bg-[#1f2a44] px-3 py-1 text-xs font-black text-white"
                    style={at(2.2)}
                >
                    <Timer className="size-3.5" aria-hidden="true" />
                    {t('monsterCafe.howTo.demoCooking')}
                </span>
                <span
                    className="mc-howto-pop inline-flex items-center gap-1 rounded-full border-2 border-[#1f2a44] bg-[#fef3c7] py-0.5 pr-3 pl-1 text-xs font-black"
                    style={at(4)}
                >
                    <DishView
                        dish="BURGER"
                        items={['BUN', 'PATTY', 'CHEESE']}
                        burnt
                        size={40}
                    />
                    <Flame
                        className="size-3.5 text-[#be123c]"
                        aria-hidden="true"
                    />
                    {t('monsterCafe.howTo.demoBurnt')}
                </span>
            </div>
        </div>
    );
}

function PestsScene() {
    const { t } = useTranslations();
    return (
        <div className="flex w-full max-w-lg flex-col items-center gap-3">
            <div className="flex w-full items-stretch justify-center gap-2 sm:gap-4">
                <Phone className="max-w-40 !gap-1.5 !p-2 sm:max-w-48">
                    <span className="flex items-center gap-1.5 text-[11px] font-black">
                        <Avatar look={RANI} seat={0} className="size-7" />
                        Rani
                    </span>
                    <div className="relative flex h-16 items-center gap-1 overflow-hidden rounded-xl border-2 border-dashed border-[#1f2a44]/40 bg-[#fff7ed] px-1">
                        <IngredientIcon ingredient="TOMATO" size={26} />
                        <IngredientIcon ingredient="CHEESE" size={26} />
                        <span className="relative ml-auto">
                            <span
                                className="mc-howto-rat block"
                                style={at(0.3)}
                            >
                                <span
                                    className="mc-howto-flee relative block"
                                    style={at(2)}
                                >
                                    <RatSprite size={58} />
                                    <span
                                        className="absolute top-3 -left-3 flex flex-col gap-1"
                                        aria-hidden="true"
                                    >
                                        <span className="h-0.5 w-3 rounded-full bg-[#1f2a44]/50" />
                                        <span className="h-0.5 w-4 rounded-full bg-[#1f2a44]/50" />
                                        <span className="h-0.5 w-2.5 rounded-full bg-[#1f2a44]/50" />
                                    </span>
                                </span>
                            </span>
                            <Finger className="top-2 left-6" style={at(1.3)} />
                        </span>
                    </div>
                    <span
                        className="mc-howto-pop rounded-lg bg-[#c9f5e5] px-1.5 py-0.5 text-center text-[10px] font-black"
                        style={at(2.1)}
                    >
                        {t('monsterCafe.howTo.demoShoo')}
                    </span>
                    <span
                        className="mc-howto-pop inline-flex items-center justify-center gap-1 rounded-lg border-2 border-[#1f2a44] bg-[#fde68a] px-1.5 py-0.5 text-[10px] font-black"
                        style={at(2.8)}
                    >
                        <span className="block size-5 overflow-hidden rounded-full border border-[#1f2a44]">
                            <PieSplat className="size-full" />
                        </span>
                        {t('monsterCafe.howTo.demoPie')}
                    </span>
                </Phone>
                <Phone className="max-w-40 !gap-1.5 !p-2 sm:max-w-48">
                    <span className="flex items-center gap-1.5 text-[11px] font-black">
                        <Avatar look={BUDI} seat={1} className="size-7" />
                        Budi
                    </span>
                    <div className="relative flex flex-1 flex-col gap-1">
                        <div className="flex h-16 items-center justify-center gap-1 rounded-xl border-2 border-[#1f2a44]/20 bg-[#fff7ed]">
                            <IngredientIcon ingredient="DOUGH" size={26} />
                            <IngredientIcon ingredient="SAUCE" size={26} />
                            <IngredientIcon ingredient="OLIVE" size={26} />
                        </div>
                        <div className="grid grid-cols-2 gap-1">
                            {['A', 'B', 'C', 'D'].map((letter) => (
                                <span
                                    key={letter}
                                    className="h-6 rounded-md border-2 border-[#1f2a44]/30 bg-white text-center text-[10px] leading-5 font-black"
                                >
                                    {letter}
                                </span>
                            ))}
                        </div>
                        <span
                            className="mc-howto-blur absolute -inset-1 overflow-hidden rounded-xl backdrop-blur-sm"
                            style={at(3.6)}
                        >
                            <PieSplat className="size-full" />
                        </span>
                    </div>
                    <span
                        className="mc-howto-pie pointer-events-none absolute top-14 left-6 z-10 block size-12 overflow-hidden rounded-full border-2 border-[#1f2a44] bg-[#fde68a]"
                        style={at(3)}
                        aria-hidden="true"
                    >
                        <PieSplat className="size-full" />
                    </span>
                </Phone>
            </div>
            <span
                className="mc-howto-pop rounded-full border-2 border-[#1f2a44] bg-[#1f2a44] px-3 py-1 text-center text-xs font-black text-white"
                style={at(3.9)}
            >
                {t('monsterCafe.howTo.demoPieHit')}
            </span>
        </div>
    );
}

function WinScene() {
    const { t } = useTranslations();
    const steps = [
        { look: BUDI, name: 'Budi', rank: 2, h: 'h-12', tone: '#e2e8f0' },
        { look: RANI, name: 'Rani', rank: 1, h: 'h-16', tone: '#ffd93d' },
        { look: SARI, name: 'Sari', rank: 3, h: 'h-9', tone: '#f6b98a' },
    ];
    return (
        <div className="flex w-full max-w-md flex-col items-center gap-2">
            <div className="flex flex-wrap items-end justify-center gap-x-2 gap-y-1">
                <span className="mc-howto-pop" style={at(0.3)}>
                    <DishView
                        dish="BURGER"
                        items={['BUN', 'PATTY', 'CHEESE', 'LETTUCE']}
                        size={60}
                    />
                </span>
                <span className="relative size-20">
                    <span
                        className="mc-howto-out absolute inset-0"
                        style={at(0.9)}
                    >
                        <MonsterSprite
                            kind="CYCLOPS"
                            mood="IMPATIENT"
                            className="size-full"
                            size={80}
                        />
                    </span>
                    <span
                        className="mc-howto-fadein absolute inset-0"
                        style={at(0.9)}
                    >
                        <MonsterSprite
                            kind="CYCLOPS"
                            mood="HAPPY"
                            className="size-full"
                            size={80}
                        />
                    </span>
                </span>
                <span
                    className="mc-howto-pop inline-flex items-center gap-1 self-center rounded-full border-2 border-[#1f2a44] bg-[#ffd93d] px-2.5 py-1 font-display text-sm font-black whitespace-nowrap"
                    style={at(1.2)}
                >
                    <Coins className="size-4" aria-hidden="true" />
                    {t('monsterCafe.howTo.demoServed')}
                </span>
            </div>
            <ol className="flex w-full max-w-xs items-end justify-center gap-2 border-b-4 border-[#1f2a44]">
                {steps.map((s, i) => (
                    <li
                        key={s.name}
                        className="mc-howto-rise flex flex-1 flex-col items-center gap-0.5"
                        style={at(2 + i * 0.3)}
                    >
                        <span className="relative">
                            <Avatar
                                look={s.look}
                                seat={i}
                                className={s.rank === 1 ? 'size-12' : 'size-10'}
                            />
                            {s.rank === 1 && (
                                <Crown
                                    className="absolute -top-4 left-1/2 size-6 -translate-x-1/2 fill-[#ffd93d] text-[#b45309]"
                                    aria-hidden="true"
                                />
                            )}
                        </span>
                        <span className="text-xs font-black">{s.name}</span>
                        <span
                            className={cn(
                                'flex w-full items-start justify-center rounded-t-xl border-3 border-[#1f2a44] pt-0.5 font-display text-lg font-black',
                                s.h,
                            )}
                            style={{ background: s.tone }}
                        >
                            {s.rank}
                        </span>
                    </li>
                ))}
            </ol>
            <div
                className="mc-howto-pop flex items-center justify-center gap-2 rounded-2xl border-2 border-[#1f2a44] bg-[#facc15] px-3 py-1.5 font-display text-sm font-black"
                style={at(3.2)}
            >
                <Crown className="size-5" aria-hidden="true" />
                {t('monsterCafe.howTo.demoWinner', { name: 'Rani' })}
            </div>
            <span
                className="mc-howto-pop rounded-full border-2 border-[#1f2a44] bg-white px-3 py-1 text-center text-xs font-black"
                style={at(3.8)}
            >
                {t('monsterCafe.howTo.demoPoints')}
            </span>
        </div>
    );
}
