import { Court, OptionPads, QuestionCard } from '@/components/ping-pong/court';
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
    'subject',
    'read',
    'return',
    'goal',
    'rally',
    'win',
] as const;
export const SCENE_MS = 6000;
const DEMO_SUBJECTS = ['mix', 'math', 'science', 'english'] as const;
function subscribeMotion(callback: () => void) {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    query.addEventListener('change', callback);
    return () => query.removeEventListener('change', callback);
}
const reducedMotion = () =>
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Shared tutorial art: rendered directly in the carousel and recorded for downloads. */
export function TutorialScene({ scene }: { scene: number }) {
    const { t } = useTranslations();
    const key = SCENES[scene];
    const rally = key === 'rally';
    const raw = t(
        rally
            ? 'pingPong.howTo.demoRallyOptions'
            : 'pingPong.howTo.demoOptions',
        { returnObjects: true },
    );
    const options = Array.isArray(raw) ? (raw as string[]) : [];
    return (
        <div className="pp-tutorial-scene" data-scene={key}>
            <div className="pp-demo-label">
                {t(`pingPong.howTo.demo.${key}`)}
            </div>
            <Court
                goals={
                    key === 'win' ? [5, 3] : key === 'goal' ? [0, 1] : [0, 0]
                }
                turn={key === 'return' ? 1 : 0}
                round={scene}
                goal={key === 'goal'}
            />
            {key === 'subject' ? (
                <div className="pp-demo-subjects">
                    <div className="pp-demo-pin">
                        <span>{t('pingPong.howTo.demoPin')}</span>
                        <strong>482 913</strong>
                    </div>
                    <div className="pp-demo-chips">
                        {DEMO_SUBJECTS.map((subject) => (
                            <span
                                key={subject}
                                data-selected={subject === 'math'}
                            >
                                {t(`subjects.${subject}`)}
                            </span>
                        ))}
                    </div>
                </div>
            ) : key === 'win' ? (
                <div className="pp-demo-win">
                    {t('pingPong.howTo.demoWinner')}
                </div>
            ) : (
                <>
                    {key === 'rally' && (
                        <div className="pp-demo-rally">
                            {t('pingPong.howTo.demoRally')}
                        </div>
                    )}
                    <QuestionCard
                        text={t(
                            rally
                                ? 'pingPong.howTo.demoRallyQuestion'
                                : 'pingPong.howTo.demoQuestion',
                        )}
                        subject={t(
                            rally ? 'subjects.science' : 'subjects.math',
                        )}
                    />
                    <OptionPads
                        options={options}
                        disabled
                        selected={
                            key === 'return'
                                ? 1
                                : key === 'goal'
                                  ? 0
                                  : undefined
                        }
                        correct={
                            key === 'return' || key === 'goal' ? 1 : undefined
                        }
                    />
                    {key === 'goal' && (
                        <div className="pp-demo-answer">
                            {t('pingPong.howTo.demoAnswer')}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

export default function HowToPlay() {
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
            className="pp-tutorial"
            data-testid="pp-howto"
            data-scene={scene}
            aria-label={t('pingPong.howTo.title')}
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
            <header className="pp-tutorial-header">
                <h2>{t('pingPong.howTo.title')}</h2>
                <span>
                    {t('pingPong.howTo.step', {
                        step: scene + 1,
                        total: SCENES.length,
                    })}
                </span>
            </header>
            <div key={`${scene}-${cycle}`} className="pp-scene-frame">
                <TutorialScene scene={scene} />
                <div
                    className="pp-scene-progress"
                    style={{
                        animationDuration: `${SCENE_MS}ms`,
                        animationPlayState: autoplay ? 'running' : 'paused',
                    }}
                />
            </div>
            <div className="pp-caption" aria-live={autoplay ? 'off' : 'polite'}>
                <h3>{t(`pingPong.howTo.scenes.${SCENES[scene]}.title`)}</h3>
                <p>{t(`pingPong.howTo.scenes.${SCENES[scene]}.body`)}</p>
            </div>
            <div className="pp-tutorial-controls">
                <button
                    type="button"
                    disabled={scene === 0}
                    onClick={() => choose(scene - 1)}
                    aria-label={t('pingPong.howTo.previous')}
                >
                    <ChevronLeft />
                </button>
                <div className="pp-dots">
                    {SCENES.map((key, index) => (
                        <button
                            type="button"
                            key={key}
                            data-testid={`pp-howto-dot-${index}`}
                            aria-label={t(`pingPong.howTo.scenes.${key}.title`)}
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
                        autoplay
                            ? 'pingPong.howTo.pause'
                            : 'pingPong.howTo.replay',
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
                    aria-label={t('pingPong.howTo.next')}
                >
                    <ChevronRight />
                </button>
            </div>
            <div className="pp-downloads">
                <a href="/tutorials/cara-bermain-ping-pong.mp4" download>
                    <Download size={16} />
                    {t('pingPong.howTo.video')}
                </a>
                <a href="/tutorials/cara-bermain-ping-pong.pdf" download>
                    <Download size={16} />
                    {t('pingPong.howTo.pdf')}
                </a>
            </div>
        </section>
    );
}
