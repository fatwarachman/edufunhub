import { QuestionBar, SnakeCanvas, TailGauge } from '@/components/snake/board';
import { type Cell, type SnakeBoard } from '@/hooks/use-snake';
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
import './snake.css';

export const SCENES = ['room', 'read', 'cut', 'grow', 'junk', 'win'] as const;
export const SCENE_MS = 6000;
export const TUTORIAL_BASE = '/tutorials/cara-bermain-main-ular';
const DEMO_GRID = 12;
const DEMO_MODES = ['shared', 'split'] as const;

function subscribeMotion(callback: () => void) {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    query.addEventListener('change', callback);
    return () => query.removeEventListener('change', callback);
}
const reducedMotion = () =>
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** A snake lying left of (x, y), coiling down a row when it runs out of room. */
function body(length: number): Cell[] {
    const cells: Cell[] = [];
    for (let i = 0; i < length; i++) {
        const row = Math.floor(i / 8);
        const col = i % 8;
        cells.push([row % 2 === 0 ? 8 - col : 1 + col, 5 + row]);
    }
    return cells;
}

const FOODS = [
    { label: 'A', x: 9, y: 1, size: 2 },
    { label: 'B', x: 9, y: 4, size: 2 },
    { label: 'C', x: 1, y: 9, size: 2 },
    { label: 'D', x: 9, y: 9, size: 2 },
];

function demoBoard(scene: (typeof SCENES)[number]): SnakeBoard {
    const length =
        scene === 'cut' ? 5 : scene === 'grow' ? 12 : scene === 'win' ? 1 : 8;
    return {
        snakes: [
            {
                seat: 0,
                body: body(length),
                dir: 'right',
                alive: true,
                frozen: scene === 'read',
            },
        ],
        foods:
            scene === 'win'
                ? []
                : FOODS.filter((f) => !(scene === 'cut' && f.label === 'B')),
        blocks:
            scene === 'junk'
                ? [
                      [4, 2],
                      [5, 2],
                  ]
                : [],
    };
}

function DemoBoard({ scene }: { scene: (typeof SCENES)[number] }) {
    const { t } = useTranslations();
    return (
        <div className="sn-demo-board">
            <SnakeCanvas
                board={demoBoard(scene)}
                grid={DEMO_GRID}
                you={0}
                label={t('snake.boardLabel')}
            />
        </div>
    );
}

/** Shared tutorial art: rendered in the carousel and recorded for downloads. */
export function TutorialScene({ scene }: { scene: number }) {
    const { t } = useTranslations();
    const key = SCENES[scene];
    const raw = t('snake.howTo.demoOptions', { returnObjects: true });
    const options = Array.isArray(raw) ? (raw as string[]) : [];
    if (key === 'room') {
        return (
            <div className="sn-tutorial-scene" data-scene={key}>
                <div className="sn-demo-label">
                    {t('snake.howTo.demo.room')}
                </div>
                <div className="sn-demo-pin">
                    <span>{t('snake.howTo.demoPin')}</span>
                    <strong>482 913</strong>
                </div>
                <div className="sn-demo-chips">
                    {DEMO_MODES.map((mode) => (
                        <span key={mode} data-selected={mode === 'shared'}>
                            {t(`snake.modes.${mode}.title`)}
                        </span>
                    ))}
                </div>
                <DemoBoard scene="room" />
            </div>
        );
    }
    if (key === 'win') {
        return (
            <div className="sn-tutorial-scene" data-scene={key}>
                <div className="sn-demo-label">{t('snake.howTo.demo.win')}</div>
                <DemoBoard scene="win" />
                <div className="sn-demo-win">{t('snake.howTo.demoWinner')}</div>
            </div>
        );
    }
    return (
        <div className="sn-tutorial-scene" data-scene={key}>
            <div className="sn-demo-label">{t(`snake.howTo.demo.${key}`)}</div>
            {key === 'read' ? (
                <QuestionBar
                    text={t('snake.howTo.demoQuestion')}
                    subject={t('subjects.math')}
                    options={options}
                    labels={['A', 'B', 'C', 'D']}
                />
            ) : (
                <TailGauge
                    tail={key === 'cut' ? 4 : key === 'grow' ? 11 : 7}
                    start={15}
                />
            )}
            <DemoBoard scene={key} />
            {key !== 'read' && (
                <div
                    className="sn-demo-badge"
                    data-tone={
                        key === 'grow'
                            ? 'bad'
                            : key === 'junk'
                              ? 'attack'
                              : 'good'
                    }
                >
                    {t(`snake.howTo.badge.${key}`)}
                </div>
            )}
        </div>
    );
}

export default function HowToPlaySnake() {
    const { t } = useTranslations();
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
        if (!autoplay) return;
        const timer = setTimeout(() => {
            if (scene === SCENES.length - 1) setPlaying(false);
            else setScene((value) => value + 1);
        }, SCENE_MS);
        return () => clearTimeout(timer);
    }, [scene, cycle, autoplay]);
    const choose = (index: number) => {
        setScene(Math.max(0, Math.min(SCENES.length - 1, index)));
        setCycle((value) => value + 1);
        setPlaying(false);
    };
    return (
        <section
            className="sn-tutorial"
            data-testid="sn-howto"
            data-scene={scene}
            aria-label={t('snake.howTo.title')}
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
            <header className="sn-tutorial-header">
                <h2>{t('snake.howTo.title')}</h2>
                <span>
                    {t('snake.howTo.step', {
                        step: scene + 1,
                        total: SCENES.length,
                    })}
                </span>
            </header>
            <div key={`${scene}-${cycle}`} className="sn-scene-frame">
                <TutorialScene scene={scene} />
                <div
                    className="sn-scene-progress"
                    style={{
                        animationDuration: `${SCENE_MS}ms`,
                        animationPlayState: autoplay ? 'running' : 'paused',
                    }}
                />
            </div>
            <div className="sn-caption" aria-live={autoplay ? 'off' : 'polite'}>
                <h3>{t(`snake.howTo.scenes.${SCENES[scene]}.title`)}</h3>
                <p>{t(`snake.howTo.scenes.${SCENES[scene]}.body`)}</p>
            </div>
            <div className="sn-tutorial-controls">
                <button
                    type="button"
                    disabled={scene === 0}
                    onClick={() => choose(scene - 1)}
                    aria-label={t('snake.howTo.previous')}
                >
                    <ChevronLeft />
                </button>
                <div className="sn-dots">
                    {SCENES.map((key, index) => (
                        <button
                            type="button"
                            key={key}
                            data-testid={`sn-howto-dot-${index}`}
                            aria-label={t(`snake.howTo.scenes.${key}.title`)}
                            aria-current={index === scene ? 'step' : undefined}
                            onClick={() => choose(index)}
                        >
                            <span />
                        </button>
                    ))}
                </div>
                <button
                    type="button"
                    aria-label={t(
                        autoplay ? 'snake.howTo.pause' : 'snake.howTo.replay',
                    )}
                    aria-pressed={autoplay}
                    onClick={() => {
                        if (autoplay) setPlaying(false);
                        else {
                            setScene(0);
                            setCycle((value) => value + 1);
                            setPlaying(true);
                        }
                    }}
                >
                    {autoplay ? <Pause /> : reduced ? <RotateCcw /> : <Play />}
                </button>
                <button
                    type="button"
                    disabled={scene === SCENES.length - 1}
                    onClick={() => choose(scene + 1)}
                    aria-label={t('snake.howTo.next')}
                >
                    <ChevronRight />
                </button>
            </div>
            <div className="sn-downloads">
                <a href={`${TUTORIAL_BASE}.mp4`} download>
                    <Download size={16} />
                    {t('snake.howTo.video')}
                </a>
                <a href={`${TUTORIAL_BASE}.pdf`} download>
                    <Download size={16} />
                    {t('snake.howTo.pdf')}
                </a>
            </div>
        </section>
    );
}
