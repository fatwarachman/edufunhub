import {
    OptionPads,
    QuestionCard,
    RopeField,
    type RopePuller,
    TeamBar,
} from '@/components/tug-of-war/arena';
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

export const SCENES = ['setup', 'read', 'pull', 'win', 'points'] as const;
export const SCENE_MS = 6500;
export const DEMO_STEPS = 5;
const TUTORIAL_BASE = '/tutorials/cara-bermain-tug-of-war';

const DEMO_PULLERS: RopePuller[] = [
    { key: 'a', name: 'Rani', team: 0, seat: 0 },
    { key: 'b', name: 'Dito', team: 0, seat: 2 },
    { key: 'c', name: 'Sari', team: 1, seat: 1 },
    { key: 'd', name: 'Bima', team: 1, seat: 3 },
];

function subscribeMotion(callback: () => void) {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    query.addEventListener('change', callback);
    return () => query.removeEventListener('change', callback);
}
const reducedMotion = () =>
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** One tutorial scene built from the real arena components. */
export function TutorialScene({ scene }: { scene: number }) {
    const { t } = useTranslations();
    const key = SCENES[scene];
    const raw = t('tugOfWar.howTo.demoOptions', { returnObjects: true });
    const options = Array.isArray(raw) ? (raw as string[]) : [];
    const rope =
        key === 'pull' ? -1 : key === 'win' || key === 'points' ? -5 : 0;
    const pullers = DEMO_PULLERS.map((p) =>
        key === 'points' && p.key === 'a'
            ? { ...p, mvp: true, pulls: 3 }
            : key === 'points' && p.key === 'b'
              ? { ...p, pulls: 2 }
              : p,
    );
    return (
        <div data-scene={key}>
            <TeamBar
                teams={[
                    { team: 0, size: 2, pulls: -rope, points: 0 },
                    { team: 1, size: 2, pulls: 0, points: 0 },
                ]}
                rope={rope}
                winSteps={DEMO_STEPS}
            />
            <RopeField
                pullers={pullers}
                rope={rope}
                winSteps={DEMO_STEPS}
                pull={key === 'pull' ? 0 : -1}
                winner={key === 'win' || key === 'points' ? 0 : null}
                pullKey={key}
            />
            {(key === 'read' || key === 'pull') && (
                <>
                    <QuestionCard
                        label={t('tugOfWar.question', {
                            number: 1,
                            total: 10,
                        })}
                        text={t('tugOfWar.howTo.demoQuestion')}
                        subject={t('subjects.math')}
                    />
                    <OptionPads
                        options={options}
                        disabled
                        selected={key === 'pull' ? 1 : undefined}
                        correct={key === 'pull' ? 1 : undefined}
                    />
                </>
            )}
            {key === 'pull' && (
                <div className="tw-reveal" data-team={0}>
                    <strong>
                        {t('tugOfWar.pulled', {
                            name: t('tugOfWar.howTo.demoName'),
                            team: t('tugOfWar.team.0'),
                        })}
                    </strong>
                </div>
            )}
            {key === 'points' && (
                <div className="tw-result" style={{ marginTop: 12 }}>
                    <p>{t('tugOfWar.points', { points: 75 })}</p>
                    <span className="tw-mvp">
                        {t('tugOfWar.mvp', { bonus: 20 })}
                    </span>
                </div>
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
    return (
        <section
            className="tw-tutorial"
            data-testid="tw-howto"
            data-scene={scene}
            aria-label={t('tugOfWar.howTo.title')}
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
            <header>
                <h2>{t('tugOfWar.howTo.title')}</h2>
                <span>
                    {t('tugOfWar.howTo.step', {
                        step: scene + 1,
                        total: SCENES.length,
                    })}
                </span>
            </header>
            <div key={`${scene}-${cycle}`} className="tw-scene">
                <TutorialScene scene={scene} />
                <div
                    className="tw-scene-progress"
                    style={{
                        animationDuration: `${SCENE_MS}ms`,
                        animationPlayState: autoplay ? 'running' : 'paused',
                    }}
                />
            </div>
            <div className="tw-caption" aria-live={autoplay ? 'off' : 'polite'}>
                <h3>{t(`tugOfWar.howTo.scenes.${SCENES[scene]}.title`)}</h3>
                <p>
                    {t(`tugOfWar.howTo.scenes.${SCENES[scene]}.body`, {
                        steps: DEMO_STEPS,
                    })}
                </p>
            </div>
            <div className="tw-controls">
                <button
                    type="button"
                    disabled={scene === 0}
                    onClick={() => choose(scene - 1)}
                    aria-label={t('tugOfWar.howTo.previous')}
                >
                    <ChevronLeft aria-hidden="true" />
                </button>
                <div className="tw-dots">
                    {SCENES.map((key, index) => (
                        <button
                            type="button"
                            key={key}
                            data-testid={`tw-howto-dot-${index}`}
                            aria-label={t(`tugOfWar.howTo.scenes.${key}.title`)}
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
                            ? 'tugOfWar.howTo.pause'
                            : 'tugOfWar.howTo.replay',
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
                    disabled={scene === SCENES.length - 1}
                    onClick={() => choose(scene + 1)}
                    aria-label={t('tugOfWar.howTo.next')}
                >
                    <ChevronRight aria-hidden="true" />
                </button>
            </div>
            <div className="tw-downloads">
                <a href={`${TUTORIAL_BASE}.mp4`} download>
                    <Download size={16} aria-hidden="true" />
                    {t('tugOfWar.howTo.video')}
                </a>
                <a href={`${TUTORIAL_BASE}.pdf`} download>
                    <Download size={16} aria-hidden="true" />
                    {t('tugOfWar.howTo.pdf')}
                </a>
            </div>
        </section>
    );
}
