import { PlayerAvatar } from '@/components/player-avatar';
import { useTranslations } from '@/hooks/use-translations';
import { type CharacterLook } from '@/lib/character/draw-character';
import { cn } from '@/lib/utils';
import {
    ChevronLeft,
    ChevronRight,
    Crown,
    FileDown,
    MonitorPlay,
    Pause,
    Play,
    RotateCcw,
    Skull,
    Smartphone,
    Swords,
    Video,
} from 'lucide-react';
import {
    type CSSProperties,
    type ReactNode,
    useCallback,
    useEffect,
    useState,
} from 'react';
import { boardFromRows, CELL_COLORS, GridBoard, PiecePreview } from './board';
import {
    ACCENT,
    MonsterFace,
    OPTION_TONES,
    usePrefersReducedMotion,
} from './shared';

/** Shareable recording of this walkthrough (MP4 video and PDF slides). */
const TUTORIAL_BASE = '/tutorials/cara-bermain-block-battle';

/** Milliseconds each scene stays on screen while auto-playing. */
const SCENE_MS = 6500;

const SCENES = [
    'join',
    'answer',
    'battle',
    'words',
    'fortress',
    'win',
] as const;
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

/**
 * Animated "how to play" walkthrough for Block Battle: six illustrated
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

    const step = t('blockBattle.howTo.step', {
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
            aria-label={t('blockBattle.howTo.title')}
            data-testid="bb-howto"
            data-scene={scene}
            tabIndex={0}
            onKeyDown={onKey}
        >
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-display text-xl font-black">
                    {t('blockBattle.howTo.title')}
                </h2>
                <span className="rounded-full border-2 border-[#1f2a44] bg-[#fef9c3] px-2.5 py-0.5 text-xs font-black tabular-nums">
                    {step}
                </span>
            </div>

            <div
                className="relative overflow-hidden rounded-2xl border-2 border-[#1f2a44] bg-[#fefce8]"
                aria-live={autoplay ? 'off' : 'polite'}
            >
                <div
                    key={`${scene}-${cycle}`}
                    className="bb-howto-scene flex h-[25rem] flex-col items-center justify-center gap-3 overflow-hidden p-4"
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
                            className="bb-howto-progress h-full"
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
                    data-testid="bb-howto-title"
                >
                    {t(`blockBattle.howTo.scenes.${scene}.title`)}
                </h3>
                <p className="text-sm font-bold text-balance text-slate-700">
                    {t(`blockBattle.howTo.scenes.${scene}.body`)}
                </p>
            </div>

            <div className="flex items-center justify-between gap-2">
                <ControlButton
                    label={t('blockBattle.howTo.prev')}
                    onClick={() => go(index - 1)}
                    testId="bb-howto-prev"
                >
                    <ChevronLeft className="size-5" aria-hidden="true" />
                </ControlButton>
                <div className="flex min-w-0 flex-1 items-center justify-center gap-0.5 sm:gap-1">
                    {SCENES.map((s, i) => (
                        <button
                            key={s}
                            type="button"
                            onClick={() => go(i)}
                            aria-label={t('blockBattle.howTo.goTo', {
                                number: i + 1,
                            })}
                            aria-current={i === index ? 'step' : undefined}
                            data-testid={`bb-howto-dot-${i}`}
                            className="grid h-11 w-6 shrink-0 place-items-center sm:w-8"
                        >
                            <span
                                className={cn(
                                    'block h-2.5 rounded-full border-2 border-[#1f2a44] transition-all',
                                    i === index
                                        ? 'w-5 bg-[#ca8a04]'
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
                                    ? t('blockBattle.howTo.replay')
                                    : playing
                                      ? t('blockBattle.howTo.pause')
                                      : t('blockBattle.howTo.play')
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
                            testId="bb-howto-play"
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
                        label={t('blockBattle.howTo.next')}
                        onClick={() => go(index + 1)}
                        testId="bb-howto-next"
                    >
                        <ChevronRight className="size-5" aria-hidden="true" />
                    </ControlButton>
                </div>
            </div>

            <div className="flex flex-wrap justify-center gap-2 border-t-2 border-dashed border-[#1f2a44]/20 pt-3">
                <a
                    href={`${TUTORIAL_BASE}.mp4`}
                    download
                    className="inline-flex min-h-11 items-center gap-2 rounded-xl border-2 border-[#1f2a44] bg-white px-3 text-sm font-black shadow-[2px_2px_0px_#1f2a44] hover:bg-[#fef9c3]"
                    data-testid="bb-howto-video"
                >
                    <Video className="size-4" aria-hidden="true" />
                    {t('blockBattle.howTo.downloadVideo')}
                </a>
                <a
                    href={`${TUTORIAL_BASE}.pdf`}
                    download
                    className="inline-flex min-h-11 items-center gap-2 rounded-xl border-2 border-[#1f2a44] bg-white px-3 text-sm font-black shadow-[2px_2px_0px_#1f2a44] hover:bg-[#fef9c3]"
                    data-testid="bb-howto-slides"
                >
                    <FileDown className="size-4" aria-hidden="true" />
                    {t('blockBattle.howTo.downloadSlides')}
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
            className="grid size-11 shrink-0 place-items-center rounded-xl border-2 border-[#1f2a44] bg-white shadow-[2px_2px_0px_#1f2a44] transition-colors hover:bg-[#fef9c3] focus-visible:ring-4 focus-visible:ring-[#ca8a04]/40 focus-visible:outline-none"
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
            className="block size-12 sm:size-16"
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
        case 'battle':
            return <BattleScene />;
        case 'words':
            return <WordsScene />;
        case 'fortress':
            return <FortressScene />;
        default:
            return <WinScene />;
    }
}

function JoinScene() {
    const { t } = useTranslations();
    const digits = '582014'.split('');
    return (
        <div className="flex w-full flex-wrap items-center justify-center gap-4">
            <div className="flex flex-col items-center gap-1.5 rounded-2xl border-3 border-[#1f2a44] bg-[#1f2a44] px-4 py-2.5 text-white">
                <span className="flex items-center gap-1 text-[10px] font-black tracking-widest text-yellow-200 uppercase">
                    <MonitorPlay className="size-3.5" aria-hidden="true" />
                    {t('blockBattle.howTo.demoProjector')}
                </span>
                <span className="flex gap-1 font-display text-3xl font-black text-[#fde047]">
                    {digits.map((d, i) => (
                        <span
                            key={i}
                            className="bb-howto-pop"
                            style={at(0.2 + i * 0.18)}
                        >
                            {d}
                        </span>
                    ))}
                </span>
                <span
                    className="bb-howto-pop rounded-xl bg-white p-1.5"
                    style={at(1.4)}
                >
                    <DemoQr />
                </span>
            </div>
            <Phone className="max-w-56">
                <span className="flex items-center gap-1.5 text-xs font-black">
                    <Smartphone className="size-4" aria-hidden="true" />
                    {t('blockBattle.howTo.demoJoined')}
                </span>
                <div className="flex flex-col gap-1 sm:gap-1.5">
                    {[RANI, BUDI, SARI].map((look, i) => (
                        <span
                            key={i}
                            className="bb-howto-rise flex items-center gap-2 rounded-xl border-2 border-[#1f2a44] bg-[#fefce8] p-0.5 sm:p-1"
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
                            <span className="ml-auto">
                                <PiecePreview
                                    type={(['T', 'L', 'S'] as const)[i]}
                                    cell={7}
                                />
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
    const options = ['12', '14', '16', '18'];
    return (
        <div className="relative flex w-full flex-col items-center gap-3">
            <Phone className="max-w-72">
                <p className="rounded-xl border-2 border-[#1f2a44] bg-[#fefce8] p-2 text-center text-sm font-black">
                    {t('blockBattle.howTo.demoQuestion')}
                </p>
                <div className="grid grid-cols-2 gap-1.5">
                    {options.map((option, i) => (
                        <span
                            key={option}
                            className={cn(
                                'flex min-h-10 items-center gap-1.5 rounded-xl border-2 border-[#1f2a44] px-2 text-xs font-black text-white',
                                i === 2 ? 'bb-howto-pick' : 'bb-howto-dim',
                            )}
                            style={{
                                background: OPTION_TONES[i],
                                ...at(1.6),
                            }}
                        >
                            <span className="grid size-5 place-items-center rounded-md bg-white/25">
                                {'ABCD'[i]}
                            </span>
                            {option}
                        </span>
                    ))}
                </div>
                <span
                    className="bb-howto-pop rounded-xl border-2 border-[#1f2a44] bg-[#22c55e] py-1 text-center text-xs font-black text-[#052e16]"
                    style={at(2.2)}
                >
                    {t('blockBattle.howTo.demoCorrect')}
                </span>
            </Phone>
            <div
                className="bb-howto-rise grid w-full max-w-72 grid-cols-2 gap-2"
                style={at(3)}
            >
                <span
                    className="bb-howto-glow flex flex-col items-center gap-1 rounded-2xl border-3 border-[#1f2a44] bg-[#06b6d4] p-2 text-center text-[11px] font-black text-white"
                    style={at(3.8)}
                >
                    <PiecePreview type="I" cell={12} />
                    {t('blockBattle.rewards.I_PIECE')}
                </span>
                <span className="flex flex-col items-center gap-1 rounded-2xl border-3 border-[#1f2a44] bg-[#dc2626] p-2 text-center text-[11px] font-black text-white">
                    <Swords className="size-6" aria-hidden="true" />
                    {t('blockBattle.rewards.ATTACK')}
                </span>
            </div>
        </div>
    );
}

const BATTLE_ROWS = [
    '..........',
    '..........',
    '..........',
    '..........',
    '....T.....',
    '...TTT....',
    'JJ.ZZ.SSOO',
    'JLLL.ZSSOO',
    'IIIIIIIIIL',
    'IIIIIIIIIL',
];

const RIVAL_ROWS = [
    '..........',
    '....TTT...',
    '..LL.T.OO.',
    '..L..ZZOO.',
    'J.L.SSZZ..',
    'JJJSS.IIII',
    'GGGG.GGGGG',
    'GGGG.GGGGG',
    'SS.JJJ.OO.',
    '.SSZZJ.OOL',
];

function BattleScene() {
    const { t } = useTranslations();
    const mine = boardFromRows(BATTLE_ROWS);
    const rival = boardFromRows(RIVAL_ROWS);
    return (
        <div className="flex w-full max-w-xl flex-col items-center gap-3">
            <div className="relative flex w-full items-end justify-center gap-8 sm:gap-14">
                <div className="flex flex-col items-center gap-1">
                    <Avatar look={RANI} seat={0} className="size-10" />
                    <GridBoard
                        cells={mine}
                        rows={10}
                        className="w-28 sm:w-32"
                        rowClass={(r) =>
                            r >= 8 ? 'bb-howto-clear' : 'bb-howto-settle'
                        }
                    />
                    <span className="text-xs font-black">Rani</span>
                </div>
                <span
                    className="bb-howto-garbage pointer-events-none absolute bottom-16 left-1/2 z-10 h-4 w-20 rounded-sm border-2 border-[#1f2a44] bg-[#6b7280]"
                    style={at(1.6)}
                    aria-hidden="true"
                />
                <div className="flex flex-col items-center gap-1">
                    <Avatar look={BUDI} seat={1} className="size-10" />
                    <GridBoard
                        cells={rival}
                        rows={10}
                        className="bb-howto-shake w-28 sm:w-32"
                        style={at(2.6)}
                        rowClass={() => 'bb-howto-push'}
                    >
                        <span
                            className="bb-howto-rise-garbage absolute inset-x-0 bottom-0 flex flex-col"
                            style={at(2.6)}
                        >
                            {[0].map((r) => (
                                <span key={r} className="grid grid-cols-10">
                                    {Array.from({ length: 10 }, (_, c) => (
                                        <span
                                            key={c}
                                            className="aspect-square"
                                            style={{
                                                background:
                                                    c === 3
                                                        ? 'transparent'
                                                        : CELL_COLORS.G,
                                            }}
                                        />
                                    ))}
                                </span>
                            ))}
                        </span>
                        <span
                            className="bb-howto-pop absolute inset-0 grid place-items-center bg-[#0f172a]/60"
                            style={at(4.2)}
                        >
                            <span className="flex flex-col items-center rounded-lg bg-[#dc2626] px-2 py-1 font-display text-lg font-black text-white">
                                <Skull className="size-5" aria-hidden="true" />
                                KO
                            </span>
                        </span>
                    </GridBoard>
                    <span className="text-xs font-black">Budi</span>
                </div>
            </div>
            <span
                className="bb-howto-pop rounded-full border-2 border-[#1f2a44] bg-[#1f2a44] px-3 py-1 text-center text-xs font-black text-white"
                style={at(1.2)}
            >
                {t('blockBattle.howTo.demoGarbage')}
            </span>
        </div>
    );
}

function WordsScene() {
    const { t } = useTranslations();
    const wordRows = [
        '..........',
        '..........',
        '..........',
        '..........',
        '.TTT......',
        '..T.......',
        'IIIIJJJOOL',
        'ZZ.LLL.OO.',
    ];
    const wordGlyphs = [
        '          ',
        '          ',
        '          ',
        '          ',
        '          ',
        '          ',
        'BUKUQXZPJV',
        'MR KTA ON ',
    ];
    const mathRows = [
        '..........',
        '..........',
        '..........',
        '..........',
        '..........',
        '..........',
        '.JJJ......',
        'IIIIZZSSLL',
    ];
    const mathGlyphs = [
        '          ',
        '          ',
        '          ',
        '          ',
        '          ',
        '          ',
        ' 7x2      ',
        '4+5 72 1 6',
    ];
    return (
        <div className="flex w-full max-w-xl flex-col items-center gap-3">
            <div className="flex w-full flex-wrap items-start justify-center gap-6">
                <div className="flex flex-col items-center gap-1">
                    <span className="rounded-lg border-2 border-[#1f2a44] bg-[#ede9fe] px-2 py-0.5 text-xs font-black">
                        {t('blockBattle.howTo.demoTargetWord')}
                    </span>
                    <GridBoard
                        cells={boardFromRows(wordRows)}
                        glyphs={wordGlyphs.join('')}
                        rows={8}
                        className="w-36 text-[1.05rem]"
                        rowClass={(r) =>
                            r === 6 ? 'bb-howto-explode' : undefined
                        }
                    />
                </div>
                <div className="flex flex-col items-center gap-1">
                    <span className="rounded-lg border-2 border-[#1f2a44] bg-[#ede9fe] px-2 py-0.5 text-xs font-black">
                        {t('blockBattle.howTo.demoTargetMath')}
                    </span>
                    <GridBoard
                        cells={boardFromRows(mathRows)}
                        glyphs={mathGlyphs.join('')}
                        rows={8}
                        className="w-36 text-[1.05rem]"
                        rowClass={(r) =>
                            r === 7 ? 'bb-howto-explode-late' : undefined
                        }
                    />
                </div>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
                <span
                    className="bb-howto-pop rounded-full border-2 border-[#1f2a44] bg-[#a855f7] px-3 py-1 font-display text-sm font-black text-white"
                    style={at(1.9)}
                >
                    {t('blockBattle.howTo.demoWordHit')}
                </span>
                <span
                    className="bb-howto-pop rounded-full border-2 border-[#1f2a44] bg-[#facc15] px-3 py-1 font-display text-sm font-black"
                    style={at(3.6)}
                >
                    {t('blockBattle.howTo.demoCombo')}
                </span>
            </div>
        </div>
    );
}

function FortressScene() {
    const { t } = useTranslations();
    const wall = [
        '............',
        '............',
        '............',
        '............',
        '....T.......',
        '...TTT......',
        '############',
        '############',
    ];
    return (
        <div className="flex w-full max-w-xl flex-col items-center gap-3">
            <div className="flex w-full items-end justify-center gap-4">
                <div className="flex flex-col items-center gap-1">
                    <div className="flex -space-x-2">
                        {[RANI, BUDI, SARI].map((look, i) => (
                            <Avatar
                                key={i}
                                look={look}
                                seat={i}
                                className="size-9"
                            />
                        ))}
                    </div>
                    <GridBoard
                        cells={boardFromRows(wall, 12)}
                        cols={12}
                        rows={8}
                        className="bb-howto-wallhit w-44 sm:w-52"
                        style={at(3.2)}
                        rowClass={(r) =>
                            r === 4 || r === 5 ? 'bb-howto-drop' : undefined
                        }
                    >
                        <span
                            className="bb-howto-armor pointer-events-none absolute inset-x-0 bottom-0 h-1/4 border-3 border-white"
                            style={at(1.8)}
                        />
                    </GridBoard>
                </div>
                <div className="flex flex-col items-center gap-1">
                    <span
                        className="bb-howto-cannon h-3 w-10 rounded-full bg-[#facc15]"
                        style={at(2)}
                        aria-hidden="true"
                    />
                    <span
                        className="bb-howto-monster grid size-20 place-items-center rounded-2xl border-3 border-[#1f2a44] bg-[#7c3aed]"
                        style={at(2.4)}
                    >
                        <MonsterFace />
                    </span>
                    <span className="h-2.5 w-20 overflow-hidden rounded-full border-2 border-[#1f2a44] bg-white">
                        <span
                            className="bb-howto-hp block h-full bg-[#dc2626]"
                            style={at(2.4)}
                        />
                    </span>
                </div>
            </div>
            <span
                className="bb-howto-pop rounded-full border-2 border-[#1f2a44] bg-[#0f766e] px-3 py-1 text-center text-xs font-black text-white"
                style={at(1.8)}
            >
                {t('blockBattle.howTo.demoCannon')}
            </span>
            <span
                className="bb-howto-pop rounded-full border-2 border-[#1f2a44] bg-[#fecdd3] px-3 py-1 text-center text-xs font-black"
                style={at(3.4)}
            >
                {t('blockBattle.howTo.demoMonster')}
            </span>
        </div>
    );
}

function WinScene() {
    const { t } = useTranslations();
    const steps = [
        { look: BUDI, name: 'Budi', rank: 2, h: 'h-16', tone: '#e2e8f0' },
        { look: RANI, name: 'Rani', rank: 1, h: 'h-24', tone: '#ffd93d' },
        { look: SARI, name: 'Sari', rank: 3, h: 'h-12', tone: '#f6b98a' },
    ];
    return (
        <div className="flex w-full max-w-md flex-col items-center gap-3">
            <ol className="flex w-full items-end justify-center gap-2 border-b-4 border-[#1f2a44]">
                {steps.map((s, i) => (
                    <li
                        key={s.name}
                        className="bb-howto-rise flex flex-1 flex-col items-center gap-1"
                        style={at(0.4 + (2 - s.rank) * 0.1 + i * 0.3)}
                    >
                        <span className="relative">
                            <Avatar
                                look={s.look}
                                seat={i}
                                className={s.rank === 1 ? 'size-16' : 'size-12'}
                            />
                            {s.rank === 1 && (
                                <Crown
                                    className="absolute -top-4 left-1/2 size-7 -translate-x-1/2 fill-[#ffd93d] text-[#b45309]"
                                    aria-hidden="true"
                                />
                            )}
                        </span>
                        <span className="text-xs font-black">{s.name}</span>
                        <span
                            className={cn(
                                'flex w-full items-start justify-center rounded-t-xl border-3 border-[#1f2a44] pt-1 font-display text-xl font-black',
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
                className="bb-howto-pop flex items-center justify-center gap-2 rounded-2xl border-2 border-[#1f2a44] bg-[#facc15] px-3 py-2 font-display text-base font-black"
                style={at(2.2)}
            >
                <Crown className="size-5" aria-hidden="true" />
                {t('blockBattle.howTo.demoWinner', { name: 'Rani' })}
            </div>
            <span
                className="bb-howto-pop rounded-full border-2 border-[#1f2a44] bg-white px-3 py-1 text-center text-xs font-black"
                style={at(3)}
            >
                {t('blockBattle.howTo.demoPoints')}
            </span>
        </div>
    );
}
