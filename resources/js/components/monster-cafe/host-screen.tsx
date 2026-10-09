import AdSlot from '@/components/ads/ad-slot';
import {
    DishView,
    MONSTERS,
    MonsterSprite,
    PieSplat,
    RatSprite,
} from '@/components/monster-cafe/art';
import {
    ACCENT,
    clock,
    FEED_STYLE,
    formatCoins,
    Leaderboard,
    Panel,
    Podium,
    useRemaining,
} from '@/components/monster-cafe/shared';
import { ConnectionBadge, inviteLink } from '@/components/multiplayer/room';
import {
    type GameSubject,
    isGameSubject,
    SubjectPicker,
} from '@/components/multiplayer/subject-picker';
import { PlayerAvatar } from '@/components/player-avatar';
import { Button } from '@/components/ui/button';
import {
    type MonsterCafeAction,
    type MonsterCafeSend,
    type MonsterCafeState,
    type MonsterCafeStatus,
} from '@/hooks/use-monster-cafe';
import { useTranslations } from '@/hooks/use-translations';
import { cn } from '@/lib/utils';
import { router } from '@inertiajs/react';
import {
    ChefHat,
    Coins,
    Copy,
    DoorOpen,
    HandPlatter,
    Link2,
    MonitorPlay,
    Play,
    Timer,
    UsersRound,
} from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';

/** Signed-in teacher (or student) driving the projector screen. */
interface HostPlayer {
    id: number;
    name: string;
}

/** Players allowed in one café (host screen not counted). */
const MAX_PLAYERS = 40;

/**
 * Teacher / projector screen for Monster Café: creates the room, shows the
 * PIN + invite link and roster, picks minutes and subject, then projects the
 * live coin board, kitchen ticker and the final podium.
 */
export function HostScreen({
    state,
    send,
    status,
}: {
    state: MonsterCafeState;
    send: MonsterCafeSend;
    player: HostPlayer;
    pin?: string;
    status?: MonsterCafeStatus;
}) {
    const { t } = useTranslations();
    const online = status ? status === 'online' : true;
    const act = (msg: Record<string, unknown>) => {
        send(msg);
    };

    if (state.phase === 'NONE' || !state.pin) {
        return (
            <Panel className="mx-auto flex w-full max-w-xl flex-col items-center gap-4 text-center">
                {status && <ConnectionBadge status={status} />}
                <MonsterParade />
                <p className="text-sm font-bold text-slate-700">
                    {t('monsterCafe.host.intro')}
                </p>
                <p className="rounded-2xl border-2 border-dashed border-[#1f2a44] px-3 py-2 text-xs font-bold text-slate-600">
                    {t('monsterCafe.host.rules')}
                </p>
                <Button
                    onClick={() => act({ t: 'create_room' })}
                    disabled={!online}
                    data-testid="mc-create"
                    className="min-h-12 rounded-2xl border-3 border-[#1f2a44] bg-[#ea580c] px-6 font-display text-lg font-black text-white shadow-[4px_4px_0px_#1f2a44] hover:bg-[#c2410c] disabled:bg-[#fed7aa] disabled:text-[#1f2a44] disabled:opacity-100"
                >
                    <MonitorPlay className="size-5" aria-hidden="true" />
                    {t('monsterCafe.host.createRoom')}
                </Button>
                {state.closed && state.closed !== 'idle' && (
                    <p className="text-xs font-bold text-slate-600">
                        {t('monsterCafe.host.roomClosed')}
                    </p>
                )}
                <button
                    type="button"
                    onClick={() => router.visit('/games/monster-cafe')}
                    className="min-h-11 rounded-xl px-3 text-xs font-black text-slate-600 underline-offset-4 hover:underline"
                >
                    {t('monsterCafe.host.switchRole')}
                </button>
            </Panel>
        );
    }

    if (state.phase === 'LOBBY') {
        return (
            <HostLobby
                state={state}
                status={status}
                online={online}
                act={act}
            />
        );
    }

    const header = <HostHeader state={state} status={status} />;

    if (state.phase === 'GAME_OVER') {
        return (
            <Panel className="flex flex-col gap-5">
                {header}
                <Podium state={state} />
                <div className="flex flex-wrap justify-center gap-2">
                    <Button
                        onClick={() => act({ t: 'start_game' })}
                        disabled={!online}
                        data-testid="mc-again"
                        className="min-h-12 rounded-2xl border-3 border-[#1f2a44] bg-[#1f2a44] px-6 font-display font-black text-white shadow-[3px_3px_0px_#ea580c]"
                    >
                        <Play className="size-5" aria-hidden="true" />
                        {t('monsterCafe.host.again')}
                    </Button>
                    <Button
                        variant="outline"
                        onClick={() => act({ t: 'leave_room' })}
                        className="min-h-12 rounded-2xl border-2 border-[#1f2a44] bg-white px-4 font-black text-[#1f2a44]"
                    >
                        <DoorOpen className="size-4" aria-hidden="true" />
                        {t('monsterCafe.host.closeRoom')}
                    </Button>
                </div>
                <AdSlot
                    placement="arena.result"
                    className="mx-auto w-full max-w-md"
                />
            </Panel>
        );
    }

    const active = state.leaderboard.filter((r) => !r.left);
    const served = state.leaderboard.reduce((sum, r) => sum + r.served, 0);

    return (
        <div className="flex flex-col gap-4" data-testid="mc-host-arena">
            <Panel className="!p-4 sm:!p-5">{header}</Panel>
            <div className="grid gap-4 lg:grid-cols-12">
                <Panel className="flex flex-col gap-3 lg:col-span-8">
                    <h2 className="flex flex-wrap items-center justify-between gap-2 font-display text-xl font-black 2xl:text-2xl">
                        {t('monsterCafe.host.leaderboard')}
                        <span className="flex flex-wrap items-center gap-3 text-sm 2xl:text-base">
                            <span className="inline-flex items-center gap-1.5">
                                <UsersRound
                                    className="size-4"
                                    aria-hidden="true"
                                />
                                {t('monsterCafe.host.playersCount', {
                                    count: active.length,
                                })}
                            </span>
                            <span
                                className="inline-flex items-center gap-1.5"
                                data-testid="mc-host-served"
                            >
                                <HandPlatter
                                    className="size-4"
                                    aria-hidden="true"
                                />
                                {t('monsterCafe.host.servedTotal', {
                                    count: served,
                                })}
                            </span>
                        </span>
                    </h2>
                    {state.leaderboard.length === 0 ? (
                        <p className="rounded-2xl border-2 border-dashed border-[#1f2a44]/40 px-4 py-10 text-center text-sm font-bold text-slate-600">
                            {t('monsterCafe.host.boardEmpty')}
                        </p>
                    ) : (
                        <Leaderboard rows={state.leaderboard} size="lg" />
                    )}
                </Panel>
                <div className="flex flex-col gap-4 lg:col-span-4">
                    <Panel className="!p-4">
                        <HostFeed feed={state.feed} limit={8} />
                    </Panel>
                    <AdSlot placement="arena.sidebar" className="w-full" />
                </div>
            </div>
            <EndGameButton onConfirm={() => act({ t: 'end_game' })} />
        </div>
    );
}

/** Six café regulars greeting the class before a room exists. */
function MonsterParade() {
    return (
        <div
            className="flex flex-wrap items-end justify-center gap-1"
            aria-hidden="true"
        >
            {MONSTERS.map((kind, i) => (
                <MonsterSprite
                    key={kind}
                    kind={kind}
                    mood="HAPPY"
                    size={i % 2 === 0 ? 56 : 48}
                />
            ))}
        </div>
    );
}

function HostHeader({
    state,
    status,
}: {
    state: MonsterCafeState;
    status?: MonsterCafeStatus;
}) {
    const { t } = useTranslations();
    const remaining = useRemaining(state);
    const progress = Math.min(
        1,
        remaining / Math.max(1, state.minutes * 60000),
    );
    return (
        <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                    {status && <ConnectionBadge status={status} />}
                    <span
                        className="rounded-xl border-2 border-[#1f2a44] bg-[#fff4e6] px-3 py-1.5 font-display text-sm font-black tracking-widest lg:text-xl 2xl:text-3xl"
                        data-testid="mc-pin"
                    >
                        {t('monsterCafe.host.pinBadge', { pin: state.pin })}
                    </span>
                    {state.phase === 'PLAYING' && (
                        <span className="hidden items-center gap-1.5 rounded-xl border-2 border-[#1f2a44] bg-white px-3 py-1.5 text-xs font-black sm:inline-flex 2xl:text-sm">
                            <ChefHat className="size-4" aria-hidden="true" />
                            {t('monsterCafe.host.joinHint')}
                        </span>
                    )}
                </div>
                {state.phase === 'PLAYING' && (
                    <span
                        className="inline-flex min-h-11 items-center gap-2 rounded-xl border-2 border-[#1f2a44] bg-white px-3 font-display text-lg font-black tabular-nums lg:text-3xl 2xl:text-5xl"
                        data-testid="mc-clock"
                    >
                        <Timer
                            className="size-5 2xl:size-7"
                            aria-hidden="true"
                        />
                        <span className="sr-only">
                            {t('monsterCafe.host.timeLeft')}
                        </span>
                        {clock(remaining)}
                    </span>
                )}
            </div>
            {state.phase === 'PLAYING' && (
                <div
                    className="h-3 overflow-hidden rounded-full border-2 border-[#1f2a44] bg-white 2xl:h-5"
                    role="progressbar"
                    aria-label={t('monsterCafe.host.timeLeft')}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(progress * 100)}
                >
                    <div
                        className="h-full transition-[width] duration-100 ease-linear motion-reduce:transition-none"
                        style={{
                            width: `${progress * 100}%`,
                            background: progress < 0.2 ? '#e11d48' : ACCENT,
                        }}
                    />
                </div>
            )}
        </div>
    );
}

function HostLobby({
    state,
    status,
    online,
    act,
}: {
    state: MonsterCafeState;
    status?: MonsterCafeStatus;
    online: boolean;
    act: (msg: Record<string, unknown>) => void;
}) {
    const { t } = useTranslations();
    const [subject, setSubject] = useState<GameSubject>('mix');
    const [copied, setCopied] = useState<string | null>(null);
    const link = inviteLink('monster-cafe', state.pin ?? '');
    const active = state.roster.filter((p) => !p.left);
    const enough = active.length >= 1;
    const roomSubject = isGameSubject(state.subject ?? '')
        ? (state.subject as GameSubject)
        : subject;

    const copy = async (kind: string, text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(kind);
            setTimeout(() => setCopied(null), 1600);
        } catch {
            setCopied(null);
        }
    };

    return (
        <div className="grid gap-5 lg:grid-cols-12" data-testid="mc-host-lobby">
            <Panel className="flex flex-col gap-4 lg:col-span-5">
                <HostHeader state={state} status={status} />
                <div className="rounded-2xl border-3 border-dashed border-[#1f2a44] bg-[#fff4e6] p-4 text-center">
                    <p className="text-sm font-black">{t('room.shareTitle')}</p>
                    <p
                        className="mt-2 font-display text-5xl font-black tracking-[0.25em] 2xl:text-7xl"
                        data-testid="mc-lobby-pin"
                    >
                        {state.pin}
                    </p>
                    <p className="mt-1 text-xs font-bold [overflow-wrap:anywhere] text-slate-600 2xl:text-sm">
                        {link}
                    </p>
                    <div className="mt-3 flex flex-wrap justify-center gap-2">
                        <CopyButton
                            onClick={() => copy('pin', state.pin ?? '')}
                            icon={Copy}
                            label={t('room.copyPinLabel')}
                        >
                            {copied === 'pin'
                                ? t('room.copied')
                                : t('room.copyPin')}
                        </CopyButton>
                        <CopyButton
                            onClick={() => copy('link', link)}
                            icon={Link2}
                            label={t('room.copyLinkLabel')}
                        >
                            {copied === 'link'
                                ? t('room.copied')
                                : t('room.copyLink')}
                        </CopyButton>
                    </div>
                </div>

                <fieldset className="flex flex-col gap-2" disabled={!online}>
                    <legend className="mb-1 text-sm font-black">
                        {t('monsterCafe.host.duration')}
                    </legend>
                    <div
                        className="grid grid-cols-3 gap-2 sm:grid-cols-5"
                        role="group"
                        data-testid="mc-minutes"
                    >
                        {state.minutes_options.map((minutes) => (
                            <Chip
                                key={minutes}
                                active={state.minutes === minutes}
                                onClick={() => act({ t: 'configure', minutes })}
                                testId={`mc-minutes-${minutes}`}
                            >
                                <Timer className="size-4" aria-hidden="true" />
                                {t('monsterCafe.host.minutes', {
                                    count: minutes,
                                })}
                            </Chip>
                        ))}
                    </div>
                    <p className="text-xs font-bold text-slate-600">
                        {t('monsterCafe.host.durationHint', {
                            count: state.minutes,
                        })}
                    </p>
                </fieldset>

                <SubjectPicker
                    value={roomSubject}
                    onChange={(value) => {
                        setSubject(value);
                        act({ t: 'set_subject', subject: value });
                    }}
                    disabled={!online}
                    compact
                />
                <div className="flex flex-wrap justify-center gap-2">
                    <Button
                        onClick={() => act({ t: 'start_game' })}
                        disabled={!online || !enough}
                        data-testid="mc-start"
                        className="min-h-12 rounded-2xl border-3 border-[#1f2a44] bg-[#ea580c] px-6 font-display text-lg font-black text-white shadow-[4px_4px_0px_#1f2a44] hover:bg-[#c2410c] disabled:bg-[#fed7aa] disabled:text-[#1f2a44] disabled:opacity-100"
                    >
                        <Play className="size-5" aria-hidden="true" />
                        {enough
                            ? t('monsterCafe.host.start')
                            : t('monsterCafe.host.needPlayers')}
                    </Button>
                    <Button
                        variant="outline"
                        onClick={() => act({ t: 'leave_room' })}
                        className="min-h-12 rounded-2xl border-2 border-[#1f2a44] bg-white px-4 font-black text-[#1f2a44]"
                    >
                        <DoorOpen className="size-4" aria-hidden="true" />
                        {t('monsterCafe.host.closeRoom')}
                    </Button>
                </div>
            </Panel>
            <Panel className="flex flex-col gap-3 lg:col-span-7">
                <h2 className="flex items-center justify-between gap-2 font-display text-lg font-black 2xl:text-2xl">
                    {t('monsterCafe.host.joined')}
                    <span
                        className="text-sm tabular-nums 2xl:text-lg"
                        data-testid="mc-lobby-count"
                    >
                        {active.length}/{MAX_PLAYERS}
                    </span>
                </h2>
                {active.length === 0 ? (
                    <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-[#1f2a44]/40 px-4 py-8 text-center">
                        <MonsterSprite
                            kind="GHOST"
                            mood="IMPATIENT"
                            size={72}
                        />
                        <p className="text-sm font-bold text-slate-600">
                            {t('monsterCafe.host.waitingPlayers')}
                        </p>
                    </div>
                ) : (
                    <ul
                        className="grid grid-cols-3 gap-2 sm:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8"
                        data-testid="mc-lobby-players"
                    >
                        {active.map((p) => (
                            <li
                                key={p.user_id}
                                className={cn(
                                    'flex min-w-0 flex-col items-center gap-1 rounded-2xl border-2 border-[#1f2a44] bg-white p-1.5',
                                    !p.online && 'opacity-50',
                                )}
                            >
                                <span className="size-12 2xl:size-16">
                                    <PlayerAvatar
                                        character={p.character}
                                        seat={p.user_id}
                                        userId={p.user_id}
                                    />
                                </span>
                                <span className="w-full truncate text-center text-xs font-black 2xl:text-sm">
                                    {p.name}
                                </span>
                            </li>
                        ))}
                    </ul>
                )}
            </Panel>
        </div>
    );
}

/** Sprite that illustrates one kitchen event on the projector ticker. */
function FeedSprite({ action }: { action: MonsterCafeAction }) {
    const pizza = action.dish === 'PIZZA';
    switch (action.kind) {
        case 'SERVED':
            return (
                <DishView
                    dish={pizza ? 'PIZZA' : 'BURGER'}
                    items={
                        pizza
                            ? ['DOUGH', 'SAUCE', 'CHEESE', 'PEPPERONI']
                            : ['BUN', 'PATTY', 'CHEESE', 'LETTUCE']
                    }
                    className="size-full"
                />
            );
        case 'ANGRY':
            return (
                <MonsterSprite
                    kind={MONSTERS[action.id % MONSTERS.length]}
                    mood="ANGRY"
                    className="size-full"
                />
            );
        case 'BURNT':
            return (
                <DishView
                    dish={pizza ? 'PIZZA' : 'BURGER'}
                    items={
                        pizza
                            ? ['DOUGH', 'SAUCE', 'CHEESE']
                            : ['BUN', 'PATTY', 'CHEESE']
                    }
                    burnt
                    className="size-full"
                />
            );
        case 'RAT':
            return <RatSprite className="h-auto w-full" />;
        default:
            return (
                <span className="block size-full overflow-hidden rounded-full border-2 border-[#1f2a44] bg-[#fde68a]">
                    <PieSplat className="size-full" />
                </span>
            );
    }
}

function HostFeedItem({ action }: { action: MonsterCafeAction }) {
    const { t, i18n } = useTranslations();
    const style = FEED_STYLE[action.kind] ?? FEED_STYLE.SERVED;
    const text = t(`monsterCafe.host.feedActions.${action.kind}`, {
        name: action.player.name,
        target: action.target?.name ?? '',
        dish: t(`monsterCafe.common.dishes.${action.dish ?? 'MESS'}`),
        coins: formatCoins(action.coins ?? 0, i18n.language),
    });
    return (
        <li
            className="mc-feed-item flex items-center gap-2 rounded-2xl border-2 bg-white px-2 py-1.5"
            style={{ borderColor: style.tone }}
            data-kind={action.kind}
            data-testid="mc-host-feed-item"
        >
            <span className="size-8 shrink-0 2xl:size-10">
                <PlayerAvatar
                    character={action.player.character}
                    seat={action.player.user_id}
                />
            </span>
            <span className="grid size-12 shrink-0 place-items-center 2xl:size-16">
                <FeedSprite action={action} />
            </span>
            {action.target && (
                <span className="size-8 shrink-0 2xl:size-10">
                    <PlayerAvatar
                        character={action.target.character}
                        seat={action.target.user_id}
                    />
                </span>
            )}
            <span className="min-w-0 flex-1 text-xs leading-snug font-bold [overflow-wrap:anywhere] sm:text-sm 2xl:text-lg">
                {text}
            </span>
            {action.kind === 'SERVED' && (action.coins ?? 0) > 0 && (
                <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full border-2 border-[#1f2a44] bg-[#ffd93d] px-1.5 text-xs font-black tabular-nums">
                    <Coins className="size-3.5" aria-hidden="true" />+
                    {formatCoins(action.coins ?? 0, i18n.language)}
                </span>
            )}
        </li>
    );
}

function HostFeed({
    feed,
    limit,
}: {
    feed: MonsterCafeAction[];
    limit: number;
}) {
    const { t } = useTranslations();
    const items = feed.slice(-limit).reverse();
    return (
        <div className="flex flex-col gap-2" data-testid="mc-host-feed">
            <h2 className="font-display text-xl font-black 2xl:text-2xl">
                {t('monsterCafe.host.feed')}
            </h2>
            {items.length === 0 ? (
                <p className="rounded-2xl border-2 border-dashed border-[#1f2a44]/40 px-3 py-6 text-center text-sm font-bold text-slate-600">
                    {t('monsterCafe.host.feedEmpty')}
                </p>
            ) : (
                <ul className="flex flex-col gap-1.5" aria-live="polite">
                    {items.map((action) => (
                        <HostFeedItem key={action.id} action={action} />
                    ))}
                </ul>
            )}
        </div>
    );
}

function Chip({
    active,
    onClick,
    testId,
    children,
}: {
    active: boolean;
    onClick: () => void;
    testId?: string;
    children: ReactNode;
}) {
    return (
        <button
            type="button"
            aria-pressed={active}
            onClick={onClick}
            data-testid={testId}
            className={cn(
                'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border-2 border-[#1f2a44] px-3 text-sm font-black tabular-nums transition-colors',
                active
                    ? 'bg-[#ffd93d] shadow-[2px_2px_0px_#1f2a44]'
                    : 'bg-white hover:bg-[#ffedd5]',
            )}
        >
            {children}
        </button>
    );
}

function CopyButton({
    onClick,
    icon: Icon,
    label,
    children,
}: {
    onClick: () => void;
    icon: typeof Copy;
    label: string;
    children: ReactNode;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-label={label}
            title={label}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border-2 border-[#1f2a44] bg-white px-3 text-sm font-black shadow-[2px_2px_0px_#1f2a44] hover:bg-[#ffedd5]"
        >
            <Icon className="size-4" aria-hidden="true" />
            {children}
        </button>
    );
}

function EndGameButton({ onConfirm }: { onConfirm: () => void }) {
    const { t } = useTranslations();
    const [armed, setArmed] = useState(false);

    useEffect(() => {
        if (!armed) {
            return;
        }
        const timer = window.setTimeout(() => setArmed(false), 4000);
        return () => window.clearTimeout(timer);
    }, [armed]);

    return (
        <div className="flex flex-wrap items-center justify-center gap-2">
            {armed && (
                <p className="text-xs font-bold text-[#AD1457]" role="status">
                    {t('monsterCafe.host.endConfirm')}
                </p>
            )}
            <Button
                variant="outline"
                onClick={() => (armed ? onConfirm() : setArmed(true))}
                data-testid="mc-end"
                className={cn(
                    'min-h-11 rounded-xl border-2 px-4 text-xs font-black',
                    armed
                        ? 'border-[#AD1457] bg-[#FFEBF0] text-[#AD1457]'
                        : 'border-[#1f2a44]/30 bg-white/70 text-slate-700',
                )}
            >
                <DoorOpen className="size-4" aria-hidden="true" />
                {armed
                    ? t('monsterCafe.host.endNow')
                    : t('monsterCafe.host.endGame')}
            </Button>
        </div>
    );
}
