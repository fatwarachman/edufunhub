import { isGamePath } from '@/components/chat-live';
import { PlayerAvatar } from '@/components/player-avatar';
import { useChatEvents } from '@/hooks/use-chat-socket';
import { useTranslations } from '@/hooks/use-translations';
import { type CharacterLook } from '@/lib/character/draw-character';
import { bindChatSoundUnlock, playChatTing } from '@/lib/chat-sound';
import { router } from '@inertiajs/react';
import { Check, UserPlus, Users, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import '../../css/chat-live.css';

interface FriendNotice {
    key: number;
    action: 'request' | 'accepted';
    friendshipId: number | null;
    userId: number;
    name: string;
    character: CharacterLook | null;
}

/**
 * Mounted once next to the Inertia app. Shows a popup when someone sends a
 * friend request or accepts ours. While a game is running (game screens) the
 * notices wait and pop up once the player leaves the game, so play is never
 * interrupted; the bell keeps them too.
 */
export function FriendLive() {
    const { t } = useTranslations();
    const [queue, setQueue] = useState<FriendNotice[]>([]);
    const [inGame, setInGame] = useState(() =>
        isGamePath(window.location.pathname),
    );
    const [busy, setBusy] = useState(false);
    const primary = useRef<HTMLButtonElement | null>(null);

    useEffect(
        () =>
            router.on('navigate', () =>
                setInGame(isGamePath(window.location.pathname)),
            ),
        [],
    );
    useEffect(() => bindChatSoundUnlock(), []);

    useChatEvents((event) => {
        if (event.t !== 'friend') {
            return;
        }
        const action = event.action;
        const user = (event.user ?? null) as {
            id?: number;
            name?: string;
            character?: CharacterLook | null;
        } | null;
        if (user?.id === undefined) {
            return;
        }
        if (action === 'cancelled') {
            if (!isGamePath(window.location.pathname)) {
                router.reload({ only: ['pendingFriends'] });
            }
            setQueue((current) =>
                current.filter(
                    (n) => !(n.userId === user.id && n.action === 'request'),
                ),
            );
            return;
        }
        if (action !== 'request' && action !== 'accepted') {
            return;
        }
        if (!isGamePath(window.location.pathname)) {
            router.reload({ only: ['pendingFriends'] });
        }
        const game = isGamePath(window.location.pathname);
        playChatTing(!game && document.visibilityState === 'visible');
        setQueue((current) => [
            ...current.filter(
                (n) => !(n.userId === user.id && n.action === action),
            ),
            {
                key: Date.now(),
                action,
                friendshipId: (event.friendship_id as number | null) ?? null,
                userId: user.id as number,
                name: user.name ?? '',
                character: user.character ?? null,
            },
        ]);
    });

    const notice = inGame ? null : (queue[0] ?? null);

    useEffect(() => {
        if (notice) {
            primary.current?.focus();
        }
    }, [notice]);

    useEffect(() => {
        if (!notice) {
            return;
        }
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setQueue((current) => current.slice(1));
            }
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [notice]);

    if (!notice) {
        return null;
    }

    const close = () => setQueue((current) => current.slice(1));
    const respond = (decision: 'accept' | 'decline') => {
        if (!notice.friendshipId) {
            close();
            return;
        }
        setBusy(true);
        router.post(
            `/friends/${notice.friendshipId}/${decision}`,
            {},
            {
                preserveScroll: true,
                preserveState: true,
                onFinish: () => {
                    setBusy(false);
                    close();
                },
            },
        );
    };
    const request = notice.action === 'request';

    return (
        <div
            className="edu-chat-modal-backdrop fixed inset-0 z-[90] grid place-items-center bg-[#151b2e]/60 p-5 backdrop-blur-[2px]"
            onPointerDown={(event) => {
                if (event.target === event.currentTarget) {
                    close();
                }
            }}
            data-testid="friend-notice"
            data-action={notice.action}
        >
            <div
                key={notice.key}
                role="dialog"
                aria-modal="true"
                aria-labelledby="friend-notice-title"
                aria-describedby="friend-notice-body"
                className="edu-chat-modal relative flex w-full max-w-sm flex-col items-center gap-3 rounded-3xl border-[3px] border-[#151b2e] bg-[#fffaf0] p-5 text-center text-[#151b2e] shadow-[8px_8px_0_#151b2e]"
            >
                <button
                    type="button"
                    onClick={close}
                    aria-label={t('friendNotice.close')}
                    title={t('friendNotice.close')}
                    className="absolute top-1.5 right-1.5 grid size-11 place-items-center rounded-xl hover:bg-[#ffefc2]"
                >
                    <X className="size-4" aria-hidden="true" />
                </button>
                <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-[#151b2e] bg-[#c8f1e4] px-3 py-0.5 text-xs font-black tracking-wide uppercase">
                    {request ? (
                        <UserPlus className="size-3.5" aria-hidden="true" />
                    ) : (
                        <Users className="size-3.5" aria-hidden="true" />
                    )}
                    {request
                        ? t('friendNotice.requestTitle')
                        : t('friendNotice.acceptedTitle')}
                </span>
                <span className="relative block size-20 rounded-2xl bg-[#d8c7a4]/50">
                    <PlayerAvatar
                        character={notice.character}
                        userId={notice.userId}
                    />
                </span>
                <h2
                    id="friend-notice-title"
                    className="max-w-full font-display text-lg leading-tight font-black break-words"
                >
                    {notice.name}
                </h2>
                <p id="friend-notice-body" className="text-sm font-semibold">
                    {request
                        ? t('friendNotice.request')
                        : t('friendNotice.accepted')}
                </p>
                {queue.length > 1 && (
                    <p className="text-xs font-bold text-[#151b2e]/70">
                        +{queue.length - 1}
                    </p>
                )}
                {request ? (
                    <div className="grid w-full grid-cols-2 gap-2">
                        <button
                            type="button"
                            disabled={busy}
                            onClick={() => respond('decline')}
                            className="min-h-11 rounded-2xl border-2 border-[#151b2e] bg-white px-3 font-black hover:bg-[#ffe1e6]"
                            data-testid="friend-notice-decline"
                        >
                            {t('friendNotice.decline')}
                        </button>
                        <button
                            ref={primary}
                            type="button"
                            disabled={busy}
                            onClick={() => respond('accept')}
                            className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-2xl border-2 border-[#151b2e] bg-[#ffd93d] px-3 font-black shadow-[3px_3px_0_#151b2e] hover:bg-[#ffcd1f]"
                            data-testid="friend-notice-accept"
                        >
                            <Check className="size-4" aria-hidden="true" />
                            {t('friendNotice.accept')}
                        </button>
                    </div>
                ) : (
                    <div className="grid w-full grid-cols-2 gap-2">
                        <button
                            type="button"
                            onClick={close}
                            className="min-h-11 rounded-2xl border-2 border-[#151b2e] bg-white px-3 font-black hover:bg-[#ffefc2]"
                        >
                            {t('friendNotice.later')}
                        </button>
                        <button
                            ref={primary}
                            type="button"
                            onClick={() => {
                                close();
                                router.visit('/friends');
                            }}
                            className="min-h-11 rounded-2xl border-2 border-[#151b2e] bg-[#ffd93d] px-3 font-black shadow-[3px_3px_0_#151b2e] hover:bg-[#ffcd1f]"
                            data-testid="friend-notice-view"
                        >
                            {t('friendNotice.view')}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
