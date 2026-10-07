import GameAdStrip from '@/components/ads/game-ad-strip';
import { DigitalClock } from '@/components/digital-clock';
import {
    BackButton,
    NavButton,
    SiteNav,
    useGameBackHref,
} from '@/components/site-nav';
import {
    LocalGame,
    type LocalGameHandle,
} from '@/components/snakes/local-game';
import { RoomGame } from '@/components/snakes/room-game';
import { useGameAudio } from '@/hooks/use-game-audio';
import { useTranslations } from '@/hooks/use-translations';
import { type CharacterLook } from '@/lib/character/draw-character';
import { hasGrade } from '@/lib/grade';
import { type OfflineQuestion } from '@/lib/snakes-questions';
import { cn } from '@/lib/utils';
import { Head } from '@inertiajs/react';
import {
    Globe,
    LogIn,
    MonitorSmartphone,
    RotateCcw,
    Volume2,
    VolumeX,
} from 'lucide-react';
import { useRef, useState } from 'react';

interface SnakesProps {
    player: {
        name: string;
        grade: number | null;
        character?: CharacterLook;
    } | null;
    online: boolean;
    wsUrl: string | null;
    pin: string | null;
    practiceQuestions?: OfflineQuestion[];
}

type Mode = 'local' | 'online';

export default function SnakesAndLaddersGame({
    player,
    online,
    wsUrl,
    pin,
    practiceQuestions = [],
}: SnakesProps) {
    const { t } = useTranslations();
    const signedIn = player !== null;
    const backHref = useGameBackHref();
    const { play, muted, toggleMuted } = useGameAudio();
    const [mode, setMode] = useState<Mode>(
        online || (signedIn && pin) ? 'online' : 'local',
    );
    const localGame = useRef<LocalGameHandle>(null);
    const loginHref = pin ? `/games/snakes-and-ladders/join/${pin}` : '/login';

    const modes: { key: Mode; icon: typeof Globe; label: string }[] = [
        { key: 'online', icon: Globe, label: t('snakes.mode.online') },
        {
            key: 'local',
            icon: MonitorSmartphone,
            label: t('snakes.mode.local'),
        },
    ];

    return (
        <div className="relative min-h-screen touch-manipulation overflow-x-clip bg-[#FFF9E6] text-[#1f2a44] selection:bg-[#FF6584] selection:text-white">
            <Head title={`${t('snakes.title')} - EduFunHub`}>
                <meta name="description" content={t('snakes.meta')} />
            </Head>

            <header className="sticky top-0 z-30 border-b-4 border-[#1f2a44] bg-[#FFF9E6]/95 backdrop-blur-md">
                <div className="mx-auto flex min-h-16 items-center justify-between gap-2 px-3 py-2 sm:px-6 lg:px-8">
                    <div className="edu-game-brand flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
                        <BackButton
                            href={backHref}
                            label={t(
                                signedIn
                                    ? 'nav.backToPortal'
                                    : 'nav.backToGames',
                            )}
                            iconOnly
                        />
                        <div className="flex min-w-0 flex-col">
                            <span className="truncate font-display text-lg font-black text-[#1f2a44] sm:text-2xl">
                                {t('snakes.title')}
                            </span>
                            <span className="hidden truncate text-xs font-bold text-slate-600 sm:block">
                                {t('snakes.tagline')}
                            </span>
                        </div>
                        <DigitalClock className="edu-clock--game" />
                    </div>

                    <div className="flex shrink-0 items-center gap-1.5">
                        <button
                            type="button"
                            onClick={toggleMuted}
                            aria-pressed={!muted}
                            aria-label={
                                muted
                                    ? t('snakes.sound.off')
                                    : t('snakes.sound.on')
                            }
                            title={
                                muted
                                    ? t('snakes.sound.off')
                                    : t('snakes.sound.on')
                            }
                            className="edu-nav-btn edu-nav-btn--icon"
                        >
                            {muted ? (
                                <VolumeX aria-hidden="true" />
                            ) : (
                                <Volume2 aria-hidden="true" />
                            )}
                        </button>
                        {mode === 'local' && (
                            <button
                                type="button"
                                onClick={() => localGame.current?.reset()}
                                aria-label={t('snakes.restart')}
                                title={t('snakes.restart')}
                                className="edu-nav-btn edu-nav-btn--icon"
                                data-testid="snakes-restart"
                            >
                                <RotateCcw aria-hidden="true" />
                            </button>
                        )}
                        <SiteNav compact />
                    </div>
                </div>
            </header>

            <main className="mx-auto overflow-x-clip px-3 py-3 sm:px-6 lg:px-8">
                <GameAdStrip className="mb-4" />
                <div
                    className="mb-4 flex flex-wrap items-center justify-center gap-2"
                    role="tablist"
                    aria-label={t('snakes.mode.label')}
                    data-testid="snakes-mode"
                >
                    {modes.map(({ key, icon: Icon, label }) => (
                        <button
                            key={key}
                            type="button"
                            role="tab"
                            aria-selected={mode === key}
                            onClick={() => setMode(key)}
                            data-testid={`snakes-mode-${key}`}
                            className={cn(
                                'inline-flex min-h-11 items-center gap-2 rounded-2xl border-3 border-[#1f2a44] px-4 text-sm font-black shadow-[3px_3px_0px_#1f2a44] transition-colors',
                                mode === key
                                    ? 'bg-[#1f2a44] text-white'
                                    : 'bg-white text-[#1f2a44] hover:bg-[#FFF176]',
                            )}
                        >
                            <Icon className="size-4" />
                            {label}
                        </button>
                    ))}
                </div>

                {mode === 'local' ? (
                    <>
                        <p
                            className="mx-auto mb-4 max-w-2xl rounded-2xl border-2 border-dashed border-[#1f2a44]/40 bg-white/70 px-4 py-2 text-center text-xs font-bold text-slate-600"
                            data-testid="snakes-practice-note"
                        >
                            {t('snakes.mode.guestNote')}
                        </p>
                        <LocalGame
                            ref={localGame}
                            firstName={player?.name ?? null}
                            character={player?.character}
                            play={play}
                            muted={muted}
                            questions={practiceQuestions}
                        />
                    </>
                ) : !signedIn ? (
                    <div className="mx-auto max-w-xl rounded-3xl border-3 border-[#1f2a44] bg-white p-8 text-center shadow-[5px_5px_0px_#1f2a44]">
                        <p className="font-bold text-slate-700">
                            {t('snakes.online.intro', { max: 4 })}
                        </p>
                        <div className="mt-5 flex justify-center">
                            <NavButton
                                href={loginHref}
                                icon={LogIn}
                                label={t('snakes.mode.loginForOnline')}
                                variant="primary"
                                testId="snakes-login"
                            />
                        </div>
                    </div>
                ) : !online ? (
                    <div className="mx-auto max-w-xl rounded-3xl border-3 border-[#1f2a44] bg-white p-8 text-center font-bold text-slate-700 shadow-[5px_5px_0px_#1f2a44]">
                        {t('snakes.mode.onlineUnavailable')}
                    </div>
                ) : (
                    <RoomGame
                        wsUrl={wsUrl}
                        initialPin={pin}
                        hasGrade={hasGrade(player.grade)}
                        play={play}
                        muted={muted}
                    />
                )}
            </main>
        </div>
    );
}
