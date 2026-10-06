import GameAdStrip from '@/components/ads/game-ad-strip';
import { HostScreen } from '@/components/economy-heist/host-screen';
import { HowToPlay } from '@/components/economy-heist/how-to-play';
import {
    type HeistNotice,
    PlayerScreen,
} from '@/components/economy-heist/player-screen';
import {
    ACCENT,
    BG,
    formatGold,
    Panel,
} from '@/components/economy-heist/shared';
import { useRoomPin } from '@/components/multiplayer/room';
import { BackButton, SiteNav, useGameBackHref } from '@/components/site-nav';
import {
    type HeistAction,
    type HeistRole,
    useEconomyHeist,
} from '@/hooks/use-economy-heist';
import { useGameAudio } from '@/hooks/use-game-audio';
import { useTranslations } from '@/hooks/use-translations';
import { useAdMoments } from '@/lib/ads';
import { type CharacterLook } from '@/lib/character/draw-character';
import { Head, router } from '@inertiajs/react';
import {
    Coins,
    MonitorPlay,
    Play,
    Smartphone,
    Vault,
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
import '../../../css/economy-heist.css';

interface EconomyHeistProps {
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
    role: HeistRole | null;
}

export default function EconomyHeist({
    player,
    points,
    serviceReady,
    wsUrl,
    pin,
    role,
}: EconomyHeistProps) {
    const { t, i18n } = useTranslations();
    const backHref = useGameBackHref();
    const { play, muted, toggleMuted } = useGameAudio();
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<HeistNotice | null>(null);
    const playRef = useRef(play);
    const tRef = useRef(t);
    const langRef = useRef(i18n.language);
    useEffect(() => {
        playRef.current = play;
        tRef.current = t;
        langRef.current = i18n.language;
    }, [play, t, i18n.language]);

    const show = useCallback((tone: HeistNotice['tone'], text: string) => {
        setNotice({ id: Date.now(), tone, text });
    }, []);
    useEffect(() => {
        if (!notice) {
            return;
        }
        const id = setTimeout(() => setNotice(null), 3500);
        return () => clearTimeout(id);
    }, [notice]);

    const onEvent = useCallback(
        (msg: Record<string, unknown>) => {
            const tr = tRef.current;
            switch (msg.t) {
                case 'answer_result':
                    playRef.current(msg.correct ? 'correct' : 'wrong');
                    break;
                case 'chest_result':
                    playRef.current(
                        msg.type === 'LOSE_GOLD' || msg.type === 'BANKRUPT_BOMB'
                            ? 'wrong'
                            : 'dice',
                    );
                    break;
                case 'heist_expired':
                    show('bad', tr('economyHeist.targetExpired'));
                    break;
                case 'action_broadcast': {
                    const action = msg as unknown as HeistAction;
                    const me = player.id;
                    const amount = formatGold(
                        Math.abs(action.amount),
                        langRef.current,
                    );
                    const fromMe = action.source_player.user_id === me;
                    const atMe = action.target_player?.user_id === me;
                    if (action.action === 'BLOCKED') {
                        if (fromMe) {
                            playRef.current('wrong');
                            show(
                                'bad',
                                `${tr('economyHeist.blockedAttacker')} ${tr('economyHeist.blockedBody', { name: action.target_player?.name ?? '' })}`,
                            );
                        } else if (atMe) {
                            playRef.current('correct');
                            show(
                                'good',
                                tr('economyHeist.shieldSaved', {
                                    name: action.source_player.name,
                                }),
                            );
                        }
                    } else if (atMe && action.action === 'STEAL_PERCENT') {
                        playRef.current('wrong');
                        show(
                            'bad',
                            tr('economyHeist.stolenFrom', {
                                name: action.source_player.name,
                                amount,
                            }),
                        );
                    } else if (atMe && action.action === 'SWAP_GOLD') {
                        show(
                            'info',
                            tr('economyHeist.swappedBy', {
                                name: action.source_player.name,
                            }),
                        );
                    } else if (
                        fromMe &&
                        (action.action === 'STEAL_PERCENT' ||
                            action.action === 'SWAP_GOLD')
                    ) {
                        playRef.current('correct');
                        show(
                            action.amount >= 0 ? 'good' : 'bad',
                            tr(`economyHeist.actions.${action.action}`, {
                                source: tr('economyHeist.you'),
                                target: action.target_player?.name ?? '',
                                amount,
                            }),
                        );
                    }
                    break;
                }
            }
        },
        [player.id, show],
    );
    const onError = useCallback((code: string) => setError(code), []);
    const chosenRole: HeistRole | null = role ?? (pin ? 'player' : null);
    const { state, status, send } = useEconomyHeist(
        serviceReady && chosenRole ? wsUrl : null,
        chosenRole ?? 'player',
        i18n.language,
        onError,
        onEvent,
    );

    const online = status === 'online';
    const act = (msg: Record<string, unknown>) => {
        setError(null);
        if (!send(msg)) {
            setError('unknown');
        }
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
        state.phase === 'PLAYING'
            ? 'playing'
            : state.phase === 'GAME_OVER'
              ? 'done'
              : 'idle',
        { muted, won: state.result?.won ?? false },
    );

    const title = t('economyHeist.title');
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
                notice={notice}
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
            data-testid="economy-heist"
            data-role={chosenRole ?? 'none'}
            data-phase={state.phase}
        >
            <Head title={`${title} — EduFunHub`} />
            <header
                className="sticky top-0 z-30 border-b-4 border-[#1f2a44] backdrop-blur-md"
                style={{ background: `${BG}f2` }}
            >
                <div className="mx-auto flex min-h-16 items-center justify-between gap-2 px-3 py-2 sm:px-6 lg:px-8">
                    <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
                        <BackButton
                            href={backHref}
                            label={t('nav.backToPortal')}
                            iconOnly
                        />
                        <span
                            className="hidden size-10 shrink-0 place-items-center rounded-xl border-2 border-[#1f2a44] text-white shadow-[2px_2px_0px_#1f2a44] sm:grid"
                            style={{ background: ACCENT }}
                        >
                            <Vault className="size-5" aria-hidden="true" />
                        </span>
                        <div className="flex min-w-0 flex-col">
                            <h1 className="truncate font-display text-lg font-black sm:text-2xl">
                                {title}
                            </h1>
                            <span className="hidden truncate text-xs font-bold text-slate-600 sm:block">
                                {t('economyHeist.tagline')}
                            </span>
                        </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                        {chosenRole === 'player' && (
                            <span
                                className="hidden min-h-11 items-center gap-1.5 rounded-xl border-2 border-[#1f2a44] bg-[#ffd93d] px-3 text-sm font-black sm:inline-flex"
                                data-testid="eh-total-points"
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
                {body}
                {state.phase !== 'PLAYING' && (
                    <HowToPlay className="mx-auto w-full max-w-3xl" />
                )}
            </main>
        </div>
    );
}

function chooseRole(role: HeistRole) {
    router.visit(`/games/economy-heist?role=${role}`, { preserveScroll: true });
}

function RolePicker() {
    const { t } = useTranslations();
    const roles = [
        {
            role: 'host' as const,
            icon: MonitorPlay,
            title: t('economyHeist.hostTitle'),
            body: t('economyHeist.hostBody'),
            cta: t('economyHeist.openHost'),
            tone: '#ffe08a',
        },
        {
            role: 'player' as const,
            icon: Smartphone,
            title: t('economyHeist.playerTitle'),
            body: t('economyHeist.playerBody'),
            cta: t('economyHeist.openPlayer'),
            tone: '#dbeafe',
        },
    ];
    return (
        <div
            className="mx-auto flex w-full max-w-3xl flex-col gap-4"
            data-testid="eh-role-picker"
        >
            <h2 className="text-center font-display text-2xl font-black">
                {t('economyHeist.chooseRole')}
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {roles.map(({ role, icon: Icon, title, body, cta, tone }) => (
                    <button
                        key={role}
                        type="button"
                        onClick={() => chooseRole(role)}
                        data-testid={`eh-role-${role}`}
                        className="flex flex-col items-start gap-3 rounded-3xl border-3 border-[#1f2a44] bg-white p-5 text-left shadow-[5px_5px_0px_#1f2a44] transition-transform hover:-translate-y-0.5 focus-visible:ring-4 focus-visible:ring-[#b45309]/40 focus-visible:outline-none"
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
                {t('economyHeist.rules')}
            </p>
        </div>
    );
}
