import GameAdStrip from '@/components/ads/game-ad-strip';
import { BrandLink } from '@/components/brand-link';
import { DigitalClock } from '@/components/digital-clock';
import { GameFinale, podiumStandings } from '@/components/game-finale';
import { GameLanguageToggle } from '@/components/game-language-toggle';
import { useRoomPin } from '@/components/multiplayer/room';
import { HostScreen } from '@/components/order-rush/host-screen';
import { HowToPlay } from '@/components/order-rush/how-to-play';
import { PlayerScreen } from '@/components/order-rush/player-screen';
import { ACCENT, BG, Panel } from '@/components/order-rush/shared';
import { BackButton, SiteNav, useGameBackHref } from '@/components/site-nav';
import { useGameAudio } from '@/hooks/use-game-audio';
import { type RushRole, useOrderRush } from '@/hooks/use-order-rush';
import { useTranslations } from '@/hooks/use-translations';
import { useAdMoments } from '@/lib/ads';
import { type CharacterLook } from '@/lib/character/draw-character';
import { Head, router } from '@inertiajs/react';
import {
    Cable,
    Coins,
    MonitorPlay,
    Play,
    Smartphone,
    Volume2,
    VolumeX,
    WifiOff,
} from 'lucide-react';
import {
    type ReactNode,
    useCallback,
    useEffect,
    useRef,
    useState,
} from 'react';
import '../../../css/order-rush.css';

interface OrderRushProps {
    player: {
        id: number;
        name: string;
        grade: number | null;
        character: CharacterLook | null;
    };
    points: number;
    serviceReady: boolean;
    wsUrl: string | null;
    pin: string | null;
    /** Chosen role from `?role=`; invite links open as a player. */
    role: RushRole | null;
}

export default function OrderRush({
    player,
    points,
    serviceReady,
    wsUrl,
    pin,
    role,
}: OrderRushProps) {
    const { t, i18n } = useTranslations();
    const backHref = useGameBackHref();
    const { play, muted, toggleMuted } = useGameAudio();
    const [error, setError] = useState<string | null>(null);
    const playRef = useRef(play);
    useEffect(() => {
        playRef.current = play;
    }, [play]);

    const onEvent = useCallback((msg: Record<string, unknown>) => {
        switch (msg.t) {
            case 'sequence_validated':
                playRef.current(msg.is_correct ? 'correct' : 'wrong');
                if (!msg.is_correct && 'vibrate' in navigator) {
                    navigator.vibrate?.(120);
                }
                break;
            case 'sabotage_received':
                playRef.current(msg.blocked ? 'correct' : 'shoot');
                if (!msg.blocked && 'vibrate' in navigator) {
                    navigator.vibrate?.([60, 40, 60]);
                }
                break;
            case 'powerup_result':
                playRef.current('dice');
                break;
        }
    }, []);
    const onError = useCallback((code: string) => setError(code), []);
    const chosenRole: RushRole | null = role ?? (pin ? 'player' : null);
    const { state, status, send } = useOrderRush(
        serviceReady && chosenRole ? wsUrl : null,
        chosenRole ?? 'player',
        i18n.language,
        onError,
        onEvent,
    );

    const online = status === 'online';
    const act = (msg: Record<string, unknown>): boolean => {
        setError(null);
        const ok = send(msg);
        if (!ok) {
            setError('unknown');
        }
        return ok;
    };
    /** join_room carries the active portal avatar (Go prefers the signed claim). */
    const join = useCallback(
        (code: string) =>
            send({
                t: 'join_room',
                room_code: code,
                player_id: String(player.id),
                username: player.name,
                avatar: player.character ?? null,
            }),
        [send, player.id, player.name, player.character],
    );
    useRoomPin(
        online && chosenRole === 'player',
        state.pin,
        chosenRole === 'player' ? pin : null,
        join,
    );

    useAdMoments(
        state.phase === 'RACE_ACTIVE'
            ? 'playing'
            : state.phase === 'GAME_OVER'
              ? 'done'
              : 'idle',
        { muted, won: state.result?.won ?? false },
    );

    const title = t('orderRush.title');
    let body: ReactNode;
    if (!serviceReady || status === 'offline') {
        body = (
            <Panel className="mx-auto flex max-w-xl flex-col items-center gap-3 text-center font-bold">
                <WifiOff className="size-10" aria-hidden="true" />
                {t('mini.unavailable')}
            </Panel>
        );
    } else if (!chosenRole) {
        body = <RolePicker />;
    } else if (chosenRole === 'host') {
        body = (
            <HostScreen
                state={state}
                status={status}
                error={error}
                online={online}
                act={act}
            />
        );
    } else {
        body = (
            <PlayerScreen
                state={state}
                status={status}
                error={error}
                online={online}
                name={player.name}
                character={player.character}
                act={act}
                onJoin={(code) => {
                    setError(null);
                    if (!join(code)) {
                        setError('unknown');
                    }
                }}
                onHost={() => chooseRole('host')}
            />
        );
    }

    return (
        <div
            className="min-h-dvh text-[#1f2a44]"
            style={{ background: BG }}
            data-testid="order-rush"
            data-role={chosenRole ?? 'none'}
            data-phase={state.phase}
        >
            <Head title={`${title} — EduFunHub`} />
            <header
                className="sticky top-0 z-30 border-b-4 border-[#1f2a44]"
                style={{ background: BG }}
            >
                <div className="mx-auto flex min-h-16 items-center justify-between gap-2 px-3 py-2 sm:px-6 lg:px-8">
                    <div className="edu-game-brand flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
                        <BackButton
                            href={backHref}
                            label={t('nav.backToPortal')}
                            iconOnly
                        />
                        <BrandLink variant="mark" />
                        <span
                            className="hidden size-10 shrink-0 place-items-center rounded-xl border-2 border-[#1f2a44] text-white shadow-[2px_2px_0px_#1f2a44] sm:grid"
                            style={{ background: ACCENT }}
                        >
                            <Cable className="size-5" aria-hidden="true" />
                        </span>
                        <div className="flex min-w-0 flex-col">
                            <h1 className="truncate font-display text-lg font-black sm:text-2xl">
                                {title}
                            </h1>
                            <span className="hidden truncate text-xs font-bold text-slate-600 sm:block">
                                {t('orderRush.tagline')}
                            </span>
                        </div>
                        <DigitalClock className="edu-clock--game" />
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                        {chosenRole === 'player' && (
                            <span
                                className="hidden min-h-11 items-center gap-1.5 rounded-xl border-2 border-[#1f2a44] bg-[#ffd93d] px-3 text-sm font-black sm:inline-flex"
                                data-testid="or-total-points"
                            >
                                <Coins className="size-4" aria-hidden="true" />
                                {t('mini.points', {
                                    count:
                                        points +
                                        (state.phase === 'GAME_OVER'
                                            ? (state.result?.points ?? 0)
                                            : 0),
                                })}
                            </span>
                        )}
                        <GameLanguageToggle
                            className="hidden sm:inline-flex"
                            testId="or-language-toggle"
                        />
                        <button
                            type="button"
                            onClick={toggleMuted}
                            aria-pressed={!muted}
                            aria-label={
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
                        <SiteNav compact />
                    </div>
                </div>
            </header>
            <main className="mx-auto flex flex-col gap-4 px-3 py-5 sm:px-6 lg:px-8">
                <GameAdStrip />
                <GameLanguageToggle
                    className="self-end sm:hidden"
                    testId="or-language-toggle-mobile"
                />
                {body}
                {state.phase !== 'RACE_ACTIVE' && (
                    <HowToPlay className="mx-auto w-full max-w-3xl" />
                )}
            </main>
            <GameFinale
                game="order-rush"
                done={state.phase === 'GAME_OVER'}
                matchKey={state.pin}
                won={state.result?.won ?? false}
                points={state.result?.points}
                title={
                    state.podium?.[0] && !state.result?.won
                        ? t('finale.winner', { name: state.podium[0].name })
                        : undefined
                }
                standings={podiumStandings(
                    state.ranking,
                    state.you?.user_id ?? state.result?.user_id,
                    (row) => row.score,
                    (row) => `${t('orderRush.accuracy')} ${row.accuracy}%`,
                )}
                onPlayAgain={
                    chosenRole === 'host'
                        ? () => act({ t: 'start_game' })
                        : undefined
                }
            />
        </div>
    );
}

function chooseRole(role: RushRole) {
    router.visit(`/games/order-rush?role=${role}`, { preserveScroll: true });
}

function RolePicker() {
    const { t } = useTranslations();
    const roles = [
        {
            role: 'host' as const,
            icon: MonitorPlay,
            title: t('orderRush.hostTitle'),
            body: t('orderRush.hostBody'),
            cta: t('orderRush.openHost'),
            tone: '#99f6e4',
        },
        {
            role: 'player' as const,
            icon: Smartphone,
            title: t('orderRush.playerTitle'),
            body: t('orderRush.playerBody'),
            cta: t('orderRush.openPlayer'),
            tone: '#dbeafe',
        },
    ];
    return (
        <div
            className="mx-auto flex w-full max-w-3xl flex-col gap-4"
            data-testid="or-role-picker"
        >
            <h2 className="text-center font-display text-2xl font-black">
                {t('orderRush.chooseRole')}
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {roles.map(({ role, icon: Icon, title, body, cta, tone }) => (
                    <button
                        key={role}
                        type="button"
                        onClick={() => chooseRole(role)}
                        data-testid={`or-role-${role}`}
                        className="flex flex-col items-start gap-3 rounded-3xl border-3 border-[#1f2a44] bg-white p-5 text-left shadow-[5px_5px_0px_#1f2a44] transition-transform hover:-translate-y-0.5 focus-visible:ring-4 focus-visible:ring-[#0f766e]/40 focus-visible:outline-none"
                    >
                        <span
                            className="grid size-12 place-items-center rounded-2xl border-2 border-[#1f2a44]"
                            style={{ background: tone }}
                        >
                            <Icon className="size-6" aria-hidden="true" />
                        </span>
                        <span className="font-display text-xl font-black">
                            {title}
                        </span>
                        <span className="text-sm font-bold text-slate-600">
                            {body}
                        </span>
                        <span className="mt-auto inline-flex min-h-11 items-center gap-1.5 rounded-xl border-2 border-[#1f2a44] bg-[#1f2a44] px-4 font-display text-sm font-black text-white">
                            <Play className="size-4" aria-hidden="true" />
                            {cta}
                        </span>
                    </button>
                ))}
            </div>
            <p className="rounded-2xl border-2 border-dashed border-[#1f2a44] bg-white/70 px-4 py-3 text-center text-sm font-bold text-slate-700">
                {t('orderRush.rules')}
            </p>
        </div>
    );
}
