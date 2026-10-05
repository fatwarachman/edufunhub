import { PlayerAvatar } from '@/components/player-avatar';
import { Button } from '@/components/ui/button';
import { type GameSocketStatus } from '@/hooks/use-game-socket';
import { useTranslations } from '@/hooks/use-translations';
import { type CharacterLook } from '@/lib/character/draw-character';
import { cn } from '@/lib/utils';
import {
    Copy,
    Crown,
    DoorOpen,
    Link2,
    LogIn,
    MonitorSmartphone,
    Play,
    Plus,
    Share2,
    Trash2,
    UserPlus,
    Wifi,
    WifiOff,
} from 'lucide-react';
import {
    type FormEvent,
    type ReactNode,
    useEffect,
    useRef,
    useState,
} from 'react';

/**
 * Standard multiplayer invite UI (see docs/multiplayer.md). Every room-based
 * game renders <RoomEntry> before a room exists and <RoomLobby> while the
 * room waits for players. The Go lobby sends the room payload below.
 */
export interface RoomSeat {
    seat: number;
    name: string;
    grade: number;
    online: boolean;
    left: boolean;
    local: boolean;
    controlled: boolean;
    /** Portal avatar look of the account behind this seat. */
    character?: CharacterLook | null;
}

export interface RoomPayload<Seat extends RoomSeat = RoomSeat> {
    pin: string;
    seq: number;
    phase: 'lobby' | 'playing' | 'done';
    host: number;
    you: number;
    players: Seat[];
    min_players: number;
    max_players: number;
    local_seats: boolean;
    /** Host's question subject (`mix` = every subject). */
    subject?: string;
}

/** Shareable invite link for a room: /games/{game}/join/{pin}. */
export function inviteLink(game: string, pin: string): string {
    return `${window.location.origin}/games/${game}/join/${pin}`;
}

/**
 * Joins the room from an invite link once connected and keeps `?pin=` in
 * the address bar in sync, so a reload returns to the same room.
 */
export function useRoomPin(
    online: boolean,
    currentPin: string | undefined,
    initialPin: string | null,
    join: (pin: string) => void,
) {
    const done = useRef(false);
    useEffect(() => {
        if (!online || done.current || !initialPin) {
            return;
        }
        done.current = true;
        if (currentPin !== initialPin) {
            join(initialPin);
        }
    }, [online, currentPin, initialPin, join]);

    useEffect(() => {
        const url = new URL(window.location.href);
        if ((url.searchParams.get('pin') ?? undefined) === currentPin) {
            return;
        }
        if (currentPin) {
            url.searchParams.set('pin', currentPin);
        } else {
            url.searchParams.delete('pin');
        }
        window.history.replaceState(window.history.state, '', url);
    }, [currentPin]);
}

export function ConnectionBadge({
    status,
}: {
    status: GameSocketStatus | null;
}) {
    const { t } = useTranslations();
    if (!status) {
        return null;
    }
    const online = status === 'online';
    return (
        <span
            className={cn(
                'inline-flex min-h-9 items-center gap-1.5 rounded-xl border-2 border-[#1f2a44] px-3 text-xs font-black text-[#1f2a44]',
                online ? 'bg-[#c9f5e5]' : 'bg-[#ffe1e1]',
            )}
            data-testid="room-connection"
            data-status={status}
        >
            {online ? (
                <Wifi className="size-4" />
            ) : (
                <WifiOff className="size-4" />
            )}
            {t(`room.connection.${status}`)}
        </span>
    );
}

export function RoomError({ code }: { code: string | null }) {
    const { t } = useTranslations();
    if (!code) {
        return null;
    }
    return (
        <p
            role="alert"
            className="rounded-2xl border-2 border-[#1f2a44] bg-[#FFEBF0] px-4 py-2.5 text-sm font-bold text-[#AD1457]"
            data-testid="room-error"
            data-code={code}
        >
            {t(`room.errors.${code}`, {
                defaultValue: t('room.errors.unknown'),
            })}
        </p>
    );
}

function Panel({ children }: { children: ReactNode }) {
    return (
        <div className="mx-auto w-full max-w-xl rounded-3xl border-3 border-[#1f2a44] bg-white p-6 text-center text-[#1f2a44] shadow-[5px_5px_0px_#1f2a44] sm:p-8">
            {children}
        </div>
    );
}

/**
 * Before a room exists: create a room (optionally with game settings in
 * `children`, e.g. a level picker) or join a friend's room by PIN.
 */
export function RoomEntry({
    status,
    error,
    intro,
    createLabel,
    onCreate,
    onJoin,
    children,
}: {
    status: GameSocketStatus | null;
    error: string | null;
    intro: string;
    createLabel?: string;
    onCreate: () => void;
    onJoin: (pin: string) => void;
    children?: ReactNode;
}) {
    const { t } = useTranslations();
    const [pin, setPin] = useState('');
    const online = status === 'online';
    const submit = (event: FormEvent) => {
        event.preventDefault();
        if (pin.length === 6) {
            onJoin(pin);
        }
    };

    return (
        <Panel>
            <div className="flex justify-center">
                <ConnectionBadge status={status} />
            </div>
            <p className="mt-4 text-sm font-bold text-slate-700">{intro}</p>
            {children && <div className="mt-5">{children}</div>}
            <Button
                onClick={onCreate}
                disabled={!online}
                data-testid="room-create"
                className="mx-auto mt-5 flex min-h-12 rounded-2xl border-3 border-[#1f2a44] bg-[#FF9E44] px-6 font-display text-lg font-black text-white shadow-[4px_4px_0px_#1f2a44] hover:bg-[#ff8f29] disabled:opacity-50"
            >
                <Plus className="size-5" />
                {createLabel ?? t('room.create')}
            </Button>
            <div className="my-4 flex items-center gap-3 text-xs font-black text-slate-500 uppercase">
                <span className="h-0.5 flex-1 bg-[#1f2a44]/15" />
                {t('room.or')}
                <span className="h-0.5 flex-1 bg-[#1f2a44]/15" />
            </div>
            <form
                onSubmit={submit}
                className="mx-auto flex max-w-sm items-end gap-2 text-left"
            >
                <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs font-black">
                    {t('room.pinLabel')}
                    <input
                        value={pin}
                        onChange={(event) =>
                            setPin(
                                event.target.value
                                    .replace(/\D/g, '')
                                    .slice(0, 6),
                            )
                        }
                        inputMode="numeric"
                        autoComplete="off"
                        maxLength={6}
                        placeholder={t('room.pinPlaceholder')}
                        aria-label={t('room.pinLabel')}
                        data-testid="room-pin-input"
                        className="min-h-12 rounded-xl border-2 border-[#1f2a44] bg-white px-3.5 text-center font-display text-xl tracking-[0.3em] outline-none focus-visible:ring-4 focus-visible:ring-[#FF9E44]/40"
                    />
                </label>
                <Button
                    type="submit"
                    disabled={!online || pin.length !== 6}
                    data-testid="room-join"
                    className="min-h-12 shrink-0 rounded-xl border-2 border-[#1f2a44] bg-[#1f2a44] px-4 font-display font-black text-white shadow-[3px_3px_0px_#FF9E44] disabled:opacity-50"
                >
                    <LogIn className="size-4" />
                    {t('room.join')}
                </Button>
            </form>
            {error && (
                <div className="mt-4">
                    <RoomError code={error} />
                </div>
            )}
        </Panel>
    );
}

function ShareButton({
    onClick,
    icon: Icon,
    testId,
    label,
    children,
}: {
    onClick: () => void;
    icon: typeof Copy;
    testId: string;
    label?: string;
    children: ReactNode;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            data-testid={testId}
            aria-label={label}
            title={label}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border-2 border-[#1f2a44] bg-white px-3 text-sm font-black whitespace-nowrap text-[#1f2a44] shadow-[2px_2px_0px_#1f2a44] transition-colors hover:bg-[#FFF176]"
        >
            <Icon className="size-4" />
            {children}
        </button>
    );
}

/**
 * Waiting room: PIN, invite link (copy / native share), seats, optional
 * pass-and-play seats, and host-only start. `settings` renders game options
 * (e.g. level) that the host may change.
 */
export function RoomLobby({
    game,
    title,
    room,
    status,
    error,
    onStart,
    onLeave,
    onAddLocal,
    onRemoveLocal,
    settings,
    soloHint,
}: {
    game: string;
    title: string;
    room: RoomPayload;
    status: GameSocketStatus | null;
    error: string | null;
    onStart: () => void;
    onLeave: () => void;
    onAddLocal?: (name: string) => void;
    onRemoveLocal?: (seat: number) => void;
    settings?: ReactNode;
    soloHint?: string;
}) {
    const { t } = useTranslations();
    const [copied, setCopied] = useState<'pin' | 'link' | null>(null);
    const [shareError, setShareError] = useState<string | null>(null);
    const [localName, setLocalName] = useState('');
    const online = status === 'online';
    const isHost = room.host === room.you;
    const active = room.players.filter((p) => !p.left);
    const link = inviteLink(game, room.pin);
    const enough = active.length >= room.min_players;

    const copy = async (kind: 'pin' | 'link', text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(kind);
            setShareError(null);
            setTimeout(() => setCopied(null), 1800);
        } catch {
            setShareError('copy_failed');
        }
    };
    const share = async () => {
        const text = t('room.shareText', { game: title, pin: room.pin });
        if (navigator.share) {
            try {
                await navigator.share({ title, text, url: link });
            } catch {
                /* dismissed */
            }
            return;
        }
        void copy('link', `${text} ${link}`);
    };
    const addLocal = (event: FormEvent) => {
        event.preventDefault();
        onAddLocal?.(
            localName.trim() ||
                t('room.localDefault', { number: active.length + 1 }),
        );
        setLocalName('');
    };

    return (
        <div className="flex w-full flex-col gap-5" data-testid="room-lobby">
            <div className="rounded-3xl border-3 border-[#1f2a44] bg-white p-5 text-[#1f2a44] shadow-[5px_5px_0px_#1f2a44] sm:p-7">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="font-display text-xl font-black">
                        {t('room.lobbyTitle')}
                    </h2>
                    <ConnectionBadge status={status} />
                </div>

                <div className="mt-4 grid gap-5 lg:grid-cols-2 lg:items-start">
                    <div className="flex flex-col gap-5">
                        <div className="rounded-2xl border-3 border-dashed border-[#1f2a44] bg-[#FFFDE6] p-4 text-center">
                            <p className="text-sm font-black">
                                {t('room.shareTitle')}
                            </p>
                            <p className="mt-1 text-xs font-bold text-slate-600">
                                {t('room.shareHint')}
                            </p>
                            <p
                                className="mt-2 font-display text-4xl font-black tracking-[0.25em] sm:text-5xl"
                                data-testid="room-pin"
                            >
                                {room.pin}
                            </p>
                            <p
                                className="mt-1 text-xs font-bold [overflow-wrap:anywhere] text-slate-600"
                                data-testid="room-link"
                            >
                                {link}
                            </p>
                            <div className="mt-3 flex flex-wrap justify-center gap-2">
                                <ShareButton
                                    onClick={() => copy('pin', room.pin)}
                                    icon={Copy}
                                    testId="room-copy-pin"
                                    label={t('room.copyPinLabel')}
                                >
                                    {copied === 'pin'
                                        ? t('room.copied')
                                        : t('room.copyPin')}
                                </ShareButton>
                                <ShareButton
                                    onClick={() => copy('link', link)}
                                    icon={Link2}
                                    testId="room-copy-link"
                                    label={t('room.copyLinkLabel')}
                                >
                                    {copied === 'link'
                                        ? t('room.copied')
                                        : t('room.copyLink')}
                                </ShareButton>
                                <ShareButton
                                    onClick={share}
                                    icon={Share2}
                                    testId="room-share"
                                >
                                    {t('room.share')}
                                </ShareButton>
                            </div>
                            {shareError && (
                                <div className="mt-3">
                                    <RoomError code={shareError} />
                                </div>
                            )}
                        </div>

                        {settings && <div>{settings}</div>}
                    </div>

                    <div className="flex flex-col">
                        <div>
                            <p className="text-xs font-black text-slate-500 uppercase">
                                {t('room.seats', {
                                    count: active.length,
                                    max: room.max_players,
                                })}
                            </p>
                            <ul
                                className="mt-2 grid gap-2 sm:grid-cols-2"
                                data-testid="room-players"
                            >
                                {Array.from(
                                    { length: room.max_players },
                                    (_, i) => {
                                        const p = active[i];
                                        return (
                                            <li
                                                key={
                                                    p
                                                        ? `seat-${p.seat}`
                                                        : `empty-${i}`
                                                }
                                                className={cn(
                                                    'flex min-h-12 items-center gap-2.5 rounded-2xl border-2 border-[#1f2a44] px-3 py-1',
                                                    p
                                                        ? 'bg-white'
                                                        : 'border-dashed text-slate-600',
                                                )}
                                            >
                                                {p ? (
                                                    <>
                                                        <div className="size-10 shrink-0">
                                                            <PlayerAvatar
                                                                character={
                                                                    p.character
                                                                }
                                                                seat={p.seat}
                                                            />
                                                        </div>
                                                        <span className="min-w-0 flex-1 truncate text-sm font-black">
                                                            {p.name}
                                                            {p.seat ===
                                                                room.you &&
                                                                ` (${t('room.you')})`}
                                                        </span>
                                                        {p.seat ===
                                                            room.host && (
                                                            <span className="inline-flex items-center gap-1 rounded-full border border-[#1f2a44] bg-[#ffd93d] px-2 text-[10px] font-black">
                                                                <Crown className="size-3" />
                                                                {t('room.host')}
                                                            </span>
                                                        )}
                                                        {p.local && (
                                                            <span
                                                                className="inline-flex items-center gap-1 rounded-full border border-[#1f2a44] bg-[#c9f5e5] px-2 text-[10px] font-black"
                                                                title={t(
                                                                    'room.localHint',
                                                                )}
                                                            >
                                                                <MonitorSmartphone className="size-3" />
                                                                {t(
                                                                    'room.local',
                                                                )}
                                                            </span>
                                                        )}
                                                        {!p.online && (
                                                            <WifiOff
                                                                className="size-4 text-[#AD1457]"
                                                                aria-label={t(
                                                                    'room.offline',
                                                                )}
                                                            />
                                                        )}
                                                        {p.local &&
                                                            isHost &&
                                                            onRemoveLocal && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() =>
                                                                        onRemoveLocal(
                                                                            p.seat,
                                                                        )
                                                                    }
                                                                    aria-label={t(
                                                                        'room.removeLocal',
                                                                        {
                                                                            name: p.name,
                                                                        },
                                                                    )}
                                                                    className="grid size-9 place-items-center rounded-lg hover:bg-[#FFEBF0]"
                                                                >
                                                                    <Trash2 className="size-4" />
                                                                </button>
                                                            )}
                                                    </>
                                                ) : (
                                                    <span className="text-xs font-bold">
                                                        {t('room.emptySeat')}
                                                    </span>
                                                )}
                                            </li>
                                        );
                                    },
                                )}
                            </ul>
                            {isHost &&
                                room.local_seats &&
                                onAddLocal &&
                                active.length < room.max_players && (
                                    <form
                                        onSubmit={addLocal}
                                        className="mt-3 flex gap-2"
                                    >
                                        <input
                                            value={localName}
                                            onChange={(event) =>
                                                setLocalName(
                                                    event.target.value.slice(
                                                        0,
                                                        20,
                                                    ),
                                                )
                                            }
                                            placeholder={t(
                                                'room.localPlaceholder',
                                            )}
                                            aria-label={t(
                                                'room.localPlaceholder',
                                            )}
                                            data-testid="room-local-name"
                                            className="min-h-11 min-w-0 flex-1 rounded-xl border-2 border-[#1f2a44] bg-white px-3.5 text-sm font-bold outline-none focus-visible:ring-4 focus-visible:ring-[#FF9E44]/40"
                                        />
                                        <button
                                            type="submit"
                                            disabled={!online}
                                            data-testid="room-add-local"
                                            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-xl border-2 border-[#1f2a44] bg-[#c9f5e5] px-3.5 text-sm font-black disabled:opacity-50"
                                        >
                                            <UserPlus className="size-4" />
                                            {t('room.addLocal')}
                                        </button>
                                    </form>
                                )}
                        </div>

                        {error && (
                            <div className="mt-4">
                                <RoomError code={error} />
                            </div>
                        )}

                        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                            {isHost ? (
                                <Button
                                    onClick={onStart}
                                    disabled={!online || !enough}
                                    data-testid="room-start"
                                    className="min-h-12 rounded-2xl border-3 border-[#1f2a44] bg-[#FF9E44] px-6 font-display text-lg font-black text-white shadow-[4px_4px_0px_#1f2a44] hover:bg-[#ff8f29] disabled:opacity-50"
                                >
                                    <Play className="size-5" />
                                    {!enough
                                        ? t('room.needMore', {
                                              min: room.min_players,
                                          })
                                        : active.length === 1
                                          ? t('room.startSolo')
                                          : t('room.start')}
                                </Button>
                            ) : (
                                <p
                                    className="flex min-h-12 items-center justify-center rounded-2xl border-2 border-[#1f2a44] bg-[#FFFDE6] px-4 text-sm font-bold text-slate-700"
                                    data-testid="room-waiting-host"
                                >
                                    {t('room.waitingHost')}
                                </p>
                            )}
                            <Button
                                variant="outline"
                                onClick={onLeave}
                                data-testid="room-leave"
                                className="min-h-12 rounded-2xl border-2 border-[#1f2a44] bg-white px-4 font-black text-[#1f2a44]"
                            >
                                <DoorOpen className="size-4" />
                                {t('room.leave')}
                            </Button>
                        </div>
                        {isHost && soloHint && active.length === 1 && (
                            <p className="mt-3 text-center text-xs font-bold text-slate-500">
                                {soloHint}
                            </p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
