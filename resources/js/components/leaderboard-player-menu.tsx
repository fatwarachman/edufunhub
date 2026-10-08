import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import { useTranslations } from '@/hooks/use-translations';
import { cn } from '@/lib/utils';
import { Link, router } from '@inertiajs/react';
import {
    Check,
    Clock3,
    IdCard,
    Loader2,
    MessageCircle,
    UserPlus,
} from 'lucide-react';
import { useState } from 'react';

export type FriendRelation = 'none' | 'friends' | 'sent' | 'received';

const ACTION =
    'inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border-[2.5px] border-[#151b2e] px-3 text-sm font-bold shadow-[2px_2px_0_#151b2e] transition-colors disabled:opacity-60';

/**
 * Send (or accept) a friend request from any page and report back the new
 * relation; the flash message shows the server's result.
 */
export function sendFriendRequest(
    userId: number,
    relation: FriendRelation,
    handlers: {
        onDone: (next: FriendRelation) => void;
        onError: (message: string) => void;
        onFinish: () => void;
    },
) {
    router.post(
        '/friends',
        { user_id: userId },
        {
            preserveScroll: true,
            preserveState: true,
            only: ['pendingFriends', 'flash', 'errors'],
            onSuccess: () =>
                handlers.onDone(relation === 'received' ? 'friends' : 'sent'),
            onError: (errors) =>
                handlers.onError(
                    errors.user_id ?? Object.values(errors)[0] ?? '',
                ),
            onFinish: handlers.onFinish,
        },
    );
}

/** Friend action button: add, accept, or a disabled status chip. */
export function FriendButton({
    userId,
    relation,
    onChange,
    className,
    testId,
}: {
    userId: number;
    relation: FriendRelation;
    onChange: (next: FriendRelation) => void;
    className?: string;
    testId?: string;
}) {
    const { t } = useTranslations();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    if (relation === 'friends' || relation === 'sent') {
        const Icon = relation === 'friends' ? Check : Clock3;
        return (
            <span
                className={cn(
                    'inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[#151b2e]/50 bg-[#f3f0e8] px-3 text-sm font-bold text-[#151b2e]',
                    className,
                )}
                data-testid={testId}
                data-relation={relation}
            >
                <Icon className="size-4" aria-hidden />
                {t(`playerMenu.relation.${relation}`)}
            </span>
        );
    }

    return (
        <div className={cn('flex w-full flex-col gap-1', className)}>
            <button
                type="button"
                disabled={busy}
                onClick={() => {
                    setBusy(true);
                    setError(null);
                    sendFriendRequest(userId, relation, {
                        onDone: onChange,
                        onError: (message) =>
                            setError(message || t('playerMenu.friendError')),
                        onFinish: () => setBusy(false),
                    });
                }}
                className={cn(ACTION, 'bg-[#a8e6cf] hover:bg-[#c5f0dd]')}
                data-testid={testId}
                data-relation={relation}
            >
                {busy ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                    <UserPlus className="size-4" aria-hidden />
                )}
                {t(
                    relation === 'received'
                        ? 'playerMenu.acceptFriend'
                        : 'playerMenu.addFriend',
                )}
            </button>
            {error && (
                <p className="text-xs font-bold text-[#c0262d]" role="alert">
                    {error}
                </p>
            )}
        </div>
    );
}

/**
 * Opens (or reuses) the direct conversation with a player and navigates to
 * it. `error` holds the server message when the chat cannot be opened.
 */
export function useStartChat(userId: number, onOpened?: () => void) {
    const { t } = useTranslations();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const startChat = async () => {
        setBusy(true);
        setError(null);
        try {
            const res = await fetch('/chat/direct', {
                method: 'POST',
                credentials: 'same-origin',
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                    'X-CSRF-TOKEN':
                        document.querySelector<HTMLMetaElement>(
                            'meta[name="csrf-token"]',
                        )?.content ?? '',
                },
                body: JSON.stringify({ user_id: userId }),
            });
            const data = (await res.json().catch(() => ({}))) as {
                conversation?: { id: number };
                message?: string;
            };
            if (!res.ok || !data.conversation) {
                setError(data.message ?? t('portal.playerMenu.chatError'));
                return;
            }
            onOpened?.();
            router.visit(`/chat?c=${data.conversation.id}`);
        } catch {
            setError(t('portal.playerMenu.chatError'));
        } finally {
            setBusy(false);
        }
    };

    return { startChat, busy, error, setError };
}

/** Yellow "Chat" button that opens the direct conversation with a player. */
export function ChatButton({
    userId,
    className,
    testId,
}: {
    userId: number;
    className?: string;
    testId?: string;
}) {
    const { t } = useTranslations();
    const { startChat, busy, error } = useStartChat(userId);

    return (
        <div className={cn('flex w-full flex-col gap-1', className)}>
            <button
                type="button"
                onClick={startChat}
                disabled={busy}
                className={cn(ACTION, 'bg-[#ffd93d] hover:bg-[#ffe680]')}
                data-testid={testId}
            >
                {busy ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                    <MessageCircle className="size-4" aria-hidden />
                )}
                {t('portal.playerMenu.chat')}
            </button>
            {error && (
                <p className="text-xs font-bold text-[#c0262d]" role="alert">
                    {error}
                </p>
            )}
        </div>
    );
}

/**
 * Clickable leaderboard name: a small menu with the player's rank and the
 * actions "see details" (player page), "add friend" and "chat".
 */
export function LeaderboardPlayerMenu({
    userId,
    name,
    rank,
    points,
    relation: initialRelation = 'none',
    className,
    testIdPrefix = 'portal',
}: {
    userId: number;
    name: string;
    rank: number;
    points: string;
    relation?: FriendRelation;
    className?: string;
    testIdPrefix?: string;
}) {
    const { t } = useTranslations();
    const [open, setOpen] = useState(false);
    const [relation, setRelation] = useState<FriendRelation>(initialRelation);
    const [seen, setSeen] = useState(initialRelation);

    if (seen !== initialRelation) {
        setSeen(initialRelation);
        setRelation(initialRelation);
    }

    const { startChat, busy, error, setError } = useStartChat(userId, () =>
        setOpen(false),
    );

    return (
        <Popover
            open={open}
            onOpenChange={(next) => {
                setOpen(next);
                setError(null);
            }}
        >
            <PopoverTrigger asChild>
                <button
                    type="button"
                    className={cn(
                        'min-w-0 flex-1 truncate rounded-md text-left text-sm font-bold underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6c5ce7]',
                        className,
                    )}
                    aria-label={t('portal.playerMenu.open', { name })}
                    data-testid={`${testIdPrefix}-leaderboard-player-${userId}`}
                >
                    {name}
                </button>
            </PopoverTrigger>
            <PopoverContent
                align="start"
                sideOffset={6}
                collisionPadding={12}
                className="w-64 max-w-[calc(100vw-24px)] rounded-2xl border-[3px] border-[#151b2e] bg-white p-3 text-[#151b2e] shadow-[4px_4px_0_#151b2e]"
                data-testid="portal-player-menu"
            >
                <p className="truncate text-sm font-bold">{name}</p>
                <p className="text-xs font-semibold text-[#151b2e]/75">
                    {t('portal.playerMenu.summary', { rank, points })}
                </p>
                <div className="mt-3 flex flex-col gap-2">
                    <Link
                        href={`/players/${userId}`}
                        className={cn(ACTION, 'bg-white hover:bg-[#fff9e6]')}
                        data-testid="portal-player-detail"
                    >
                        <IdCard className="size-4" aria-hidden />
                        {t('playerMenu.detail')}
                    </Link>
                    <FriendButton
                        userId={userId}
                        relation={relation}
                        onChange={setRelation}
                        testId="portal-player-friend"
                    />
                    <button
                        type="button"
                        onClick={startChat}
                        disabled={busy}
                        className={cn(
                            ACTION,
                            'bg-[#ffd93d] hover:bg-[#ffe680]',
                        )}
                        data-testid="portal-player-chat"
                    >
                        {busy ? (
                            <Loader2 className="size-4 animate-spin" />
                        ) : (
                            <MessageCircle className="size-4" />
                        )}
                        {t('portal.playerMenu.chat')}
                    </button>
                </div>
                {error && (
                    <p
                        className="mt-2 text-xs font-bold text-[#c0262d]"
                        role="alert"
                    >
                        {error}
                    </p>
                )}
            </PopoverContent>
        </Popover>
    );
}
