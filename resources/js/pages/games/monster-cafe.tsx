import GameAdStrip from '@/components/ads/game-ad-strip';
import { BrandLink } from '@/components/brand-link';
import { DigitalClock } from '@/components/digital-clock';
import { GameFinale, podiumStandings } from '@/components/game-finale';
import { HostScreen } from '@/components/monster-cafe/host-screen';
import { HowToPlay } from '@/components/monster-cafe/how-to-play';
import {
    type CafeNotice,
    PlayerScreen,
} from '@/components/monster-cafe/player-screen';
import {
    ACCENT,
    BG,
    formatCoins,
    Panel,
    useCafeAudio,
} from '@/components/monster-cafe/shared';
import { RoomError, useRoomPin } from '@/components/multiplayer/room';
import { BackButton, SiteNav, useGameBackHref } from '@/components/site-nav';
import {
    type MonsterCafePageRole,
    type MonsterCafeSend,
    useMonsterCafe,
} from '@/hooks/use-monster-cafe';
import { useTranslations } from '@/hooks/use-translations';
import { useAdMoments } from '@/lib/ads';
import { type CharacterLook } from '@/lib/character/draw-character';
import { Head, router } from '@inertiajs/react';
import {
    ChefHat,
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
import '../../../css/monster-cafe.css';

export interface MonsterCafePlayer {
    id: number;
    name: string;
    grade: number | null;
    character: CharacterLook | null;
}

interface MonsterCafeProps {
    player: MonsterCafePlayer;
    points: number;
    serviceReady: boolean;
    wsUrl: string | null;
    pin: string | null;
    /** Chosen role from `?role=`; invite links open as a player. */
    role: MonsterCafePageRole | null;
}

/** Toasts kept on the pad at once. */
const TOASTS = 3;
const TOAST_MS = 3200;

export default function MonsterCafe({
    player,
    points,
    serviceReady,
    wsUrl,
    pin,
    role,
}: MonsterCafeProps) {
    const { t, i18n } = useTranslations();
    const backHref = useGameBackHref();
    const { play, muted, toggleMuted } = useCafeAudio();
    const [error, setError] = useState<string | null>(null);
    const [notices, setNotices] = useState<CafeNotice[]>([]);
    const playRef = useRef(play);
    const tRef = useRef(t);
    const ovenRef = useRef<string>('EMPTY');
    useEffect(() => {
        playRef.current = play;
        tRef.current = t;
    }, [play, t]);

    const show = useCallback((tone: CafeNotice['tone'], text: string) => {
        const id = Date.now() + Math.random();
        setNotices((list) => [...list, { id, tone, text }].slice(-TOASTS));
        setTimeout(
            () => setNotices((list) => list.filter((n) => n.id !== id)),
            TOAST_MS,
        );
    }, []);

    const onEvent = useCallback(
        (msg: Record<string, unknown>) => {
            const tr = tRef.current;
            const sound = playRef.current;
            const ing = (value: unknown) =>
                tr(`monsterCafe.common.ingredients.${String(value)}`);
            switch (msg.t) {
                case 'kitchen_sync': {
                    const oven = String(
                        (msg.oven as { state?: string } | undefined)?.state ??
                            'EMPTY',
                    );
                    if (oven !== ovenRef.current) {
                        if (oven === 'READY') {
                            sound('ding');
                        } else if (oven === 'COOKING') {
                            sound('cook');
                        }
                        ovenRef.current = oven;
                    }
                    break;
                }
                case 'answer_result':
                    if (msg.correct) {
                        sound('correct');
                        if (msg.ingredient) {
                            show(
                                'good',
                                tr('monsterCafe.player.gotIngredient', {
                                    ingredient: ing(msg.ingredient),
                                }),
                            );
                        }
                    } else {
                        sound('wrong');
                        show(
                            'bad',
                            [
                                tr('monsterCafe.player.wrongAnswer'),
                                typeof msg.hint === 'string' ? msg.hint : '',
                            ]
                                .filter(Boolean)
                                .join(' '),
                        );
                    }
                    break;
                case 'order_served':
                    sound('serve');
                    show(
                        'good',
                        tr('monsterCafe.player.served', {
                            coins: Number(msg.coins ?? 0),
                            tip: Number(msg.tip ?? 0),
                        }),
                    );
                    if (msg.pie_granted) {
                        show('info', tr('monsterCafe.player.pieGranted'));
                    }
                    break;
                case 'order_failed':
                    sound('angry');
                    show(
                        'bad',
                        msg.reason === 'WRONG_DISH'
                            ? tr('monsterCafe.player.wrongDish')
                            : tr('monsterCafe.player.monsterLeft'),
                    );
                    break;
                case 'burnt':
                    sound('burnt');
                    show('bad', tr('monsterCafe.player.burnt'));
                    break;
                case 'rat_appear':
                    sound('rat');
                    break;
                case 'rat_result':
                    if (msg.shooed) {
                        sound('shoo');
                        show('good', tr('monsterCafe.player.ratShooed'));
                    } else {
                        sound('wrong');
                        show(
                            'bad',
                            tr('monsterCafe.player.ratStole', {
                                ingredient: ing(msg.ingredient),
                            }),
                        );
                    }
                    break;
                case 'pie_result':
                    sound('pie');
                    show(
                        'good',
                        tr('monsterCafe.player.pieThrown', {
                            name:
                                (msg.target as { name?: string } | undefined)
                                    ?.name ?? '',
                        }),
                    );
                    break;
                case 'pie_hit':
                    sound('splat');
                    show(
                        'bad',
                        tr('monsterCafe.player.pieHit', {
                            name:
                                (msg.attacker as { name?: string } | undefined)
                                    ?.name ?? '',
                        }),
                    );
                    break;
            }
        },
        [show],
    );
    const onError = useCallback((code: string) => setError(code), []);
    const chosenRole: MonsterCafePageRole | null =
        role ?? (pin ? 'player' : null);
    const solo = chosenRole === 'solo';
    const { state, status, send, clearPie } = useMonsterCafe(
        serviceReady && chosenRole ? wsUrl : null,
        chosenRole === 'host' ? 'host' : 'player',
        i18n.language,
        onError,
        onEvent,
    );

    /** The pie splat lasts exactly `duration_ms` from its arrival. */
    const pieUntil = state.pieHit?.until;
    useEffect(() => {
        if (!pieUntil) {
            return;
        }
        const id = setTimeout(clearPie, Math.max(0, pieUntil - Date.now()));
        return () => clearTimeout(id);
    }, [pieUntil, clearPie]);

    const online = status === 'online';
    const act: MonsterCafeSend = useCallback(
        (msg: Record<string, unknown>) => {
            setError(null);
            const ok = send(msg);
            if (!ok) {
                setError('unknown');
            }
            return ok;
        },
        [send],
    );
    /** join_room carries the active portal avatar (Go prefers the signed claim). */
    const join = useCallback(
        (code: string) =>
            send({
                t: 'join_room',
                room_code: code,
                player_id: String(player.id),
                avatar: player.character ?? null,
            }),
        [send, player.id, player.character],
    );
    useRoomPin(
        online && chosenRole === 'player',
        state.pin,
        chosenRole === 'player' ? pin : null,
        join,
    );

    /**
     * Solo: open a private kitchen once the first snapshot says there is no
     * room yet. A reload resumes the running solo room (phase is not NONE),
     * so nothing is sent then.
     */
    const soloCreated = useRef(false);
    const synced = state.receivedAt > 0;
    useEffect(() => {
        if (state.phase !== 'NONE') {
            // A resumed or open kitchen counts as created: closing it later
            // must not silently open a new one.
            soloCreated.current = true;
            return;
        }
        if (
            solo &&
            online &&
            synced &&
            state.phase === 'NONE' &&
            !state.closed &&
            !soloCreated.current
        ) {
            soloCreated.current = true;
            send({ t: 'create_solo' });
        }
    }, [solo, online, synced, state.phase, state.closed, send]);

    useAdMoments(
        state.phase === 'PLAYING'
            ? 'playing'
            : state.phase === 'GAME_OVER'
              ? 'done'
              : 'idle',
        { muted, won: state.result?.won ?? false },
    );

    const winnerSeen = useRef<string | undefined>(undefined);
    useEffect(() => {
        if (
            state.phase === 'GAME_OVER' &&
            state.result?.won &&
            winnerSeen.current !== state.pin
        ) {
            winnerSeen.current = state.pin;
            playRef.current('win');
        }
    }, [state.phase, state.result?.won, state.pin]);

    const title = t('monsterCafe.page.title');
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
            <>
                <HostScreen
                    state={state}
                    send={act}
                    status={status}
                    player={player}
                    pin={pin ?? undefined}
                />
                {error && (
                    <div className="mx-auto w-full max-w-3xl">
                        <RoomError code={error} />
                    </div>
                )}
            </>
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
                notices={notices}
                act={act}
                play={play}
                onJoin={(code) => {
                    setError(null);
                    if (!join(code)) {
                        setError('unknown');
                    }
                }}
                onHost={() => chooseRole('host')}
                solo={solo}
                onCreateSolo={() => act({ t: 'create_solo' })}
            />
        );
    }

    return (
        <div
            className="mc-page min-h-dvh text-[#1f2a44]"
            style={{ background: BG }}
            data-testid="monster-cafe"
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
                            <ChefHat className="size-5" aria-hidden="true" />
                        </span>
                        <div className="flex min-w-0 flex-col">
                            <h1 className="truncate font-display text-lg font-black sm:text-2xl">
                                {title}
                            </h1>
                            <span className="hidden truncate text-xs font-bold text-slate-600 sm:block">
                                {t('monsterCafe.page.tagline')}
                            </span>
                        </div>
                        <DigitalClock className="edu-clock--game" />
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                        {chosenRole === 'player' && (
                            <span
                                className="hidden min-h-11 items-center gap-1.5 rounded-xl border-2 border-[#1f2a44] bg-[#ffd93d] px-3 text-sm font-black sm:inline-flex"
                                data-testid="mc-total-points"
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
                            data-testid="mc-sound"
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
            <GameFinale
                game="monster-cafe"
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
                    state.you ?? state.result?.user_id,
                    (row) =>
                        t('monsterCafe.common.coins', {
                            amount: formatCoins(row.coins, i18n.language),
                        }),
                )}
                onPlayAgain={
                    chosenRole === 'host' || solo
                        ? () => act({ t: 'start_game' })
                        : undefined
                }
            />
        </div>
    );
}

function chooseRole(role: MonsterCafePageRole) {
    router.visit(`/games/monster-cafe?role=${role}`, { preserveScroll: true });
}

function RolePicker() {
    const { t } = useTranslations();
    const roles = [
        {
            role: 'solo' as const,
            icon: ChefHat,
            title: t('monsterCafe.page.soloTitle'),
            body: t('monsterCafe.page.soloBody'),
            cta: t('monsterCafe.page.openSolo'),
            tone: '#bbf7d0',
        },
        {
            role: 'host' as const,
            icon: MonitorPlay,
            title: t('monsterCafe.page.hostTitle'),
            body: t('monsterCafe.page.hostBody'),
            cta: t('monsterCafe.page.openHost'),
            tone: '#ffe08a',
        },
        {
            role: 'player' as const,
            icon: Smartphone,
            title: t('monsterCafe.page.playerTitle'),
            body: t('monsterCafe.page.playerBody'),
            cta: t('monsterCafe.page.openPlayer'),
            tone: '#fed7aa',
        },
    ];
    return (
        <div
            className="mx-auto flex w-full max-w-4xl flex-col gap-4"
            data-testid="mc-role-picker"
        >
            <h2 className="text-center font-display text-2xl font-black">
                {t('monsterCafe.page.chooseRole')}
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                {roles.map(({ role, icon: Icon, title, body, cta, tone }) => (
                    <button
                        key={role}
                        type="button"
                        onClick={() => chooseRole(role)}
                        data-testid={`mc-role-${role}`}
                        className="flex min-w-0 flex-col items-start gap-3 rounded-3xl border-3 border-[#1f2a44] bg-white p-5 text-left shadow-[5px_5px_0px_#1f2a44] transition-transform hover:-translate-y-0.5 focus-visible:ring-4 focus-visible:ring-[#ea580c]/40 focus-visible:outline-none"
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
                {t('monsterCafe.page.rules')}
            </p>
        </div>
    );
}
