import { PlayerAvatar } from '@/components/player-avatar';
import {
    chatLive,
    useChatEvents,
    type ChatEvent,
} from '@/hooks/use-chat-socket';
import { useTranslations } from '@/hooks/use-translations';
import { type CharacterLook } from '@/lib/character/draw-character';
import { router } from '@inertiajs/react';
import { MessageCircle, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import '../../css/chat-live.css';

/** How long the in-game banner stays before sliding away. */
export const GAME_BANNER_MS = 4_500;

interface LiveProps {
    auth?: { user?: { id?: number } | null };
    chatLive?: { wsUrl?: string } | null;
}

interface ChatNotice {
    key: number;
    conversationId: number;
    senderId: number | null;
    senderName: string;
    character: CharacterLook | null;
    groupName: string | null;
    body: string;
    count: number;
}

/** Game screens get a short top banner; every other page a centred modal. */
export function isGamePath(pathname: string): boolean {
    return /^\/(games|play)\/./.test(pathname);
}

function readLive(props: Record<string, unknown> | undefined) {
    const p = (props ?? {}) as LiveProps;
    return {
        userId: p.auth?.user?.id ?? null,
        wsUrl: p.chatLive?.wsUrl ?? null,
    };
}

/**
 * Mounted once next to the Inertia app. Keeps the shared chat socket open
 * for the signed-in player on every page (presence dots + live chat) and
 * pops a notice for each new chat message from someone else: a short banner
 * at the top while playing, a centred modal anywhere else. Messages for the
 * conversation open on the chat page are skipped.
 */
export function ChatLive({
    initialProps,
}: {
    initialProps: Record<string, unknown>;
}) {
    const { t } = useTranslations();
    const [live, setLive] = useState(() => readLive(initialProps));
    const [notice, setNotice] = useState<ChatNotice | null>(null);
    const [inGame, setInGame] = useState(() =>
        isGamePath(window.location.pathname),
    );
    const openButton = useRef<HTMLButtonElement | null>(null);
    const lastFocus = useRef<HTMLElement | null>(null);

    useEffect(
        () =>
            router.on('navigate', (event) => {
                setLive(
                    readLive(
                        event.detail.page.props as Record<string, unknown>,
                    ),
                );
                setInGame(isGamePath(window.location.pathname));
                setNotice(null);
            }),
        [],
    );

    useEffect(() => {
        chatLive.start(live.wsUrl, live.userId);
    }, [live.wsUrl, live.userId]);

    useChatEvents(
        useCallback(
            (event: ChatEvent) => {
                if (event.t !== 'message') {
                    return;
                }
                const message = event.message as
                    | {
                          type?: string;
                          user_id?: number | null;
                          body?: string;
                          conversation_id?: number;
                      }
                    | undefined;
                if (
                    !message ||
                    message.type !== 'text' ||
                    !message.conversation_id ||
                    message.user_id === live.userId ||
                    chatLive.activeConversation === message.conversation_id
                ) {
                    return;
                }
                const sender = (event.sender ?? null) as {
                    id?: number;
                    name?: string;
                    character?: CharacterLook | null;
                } | null;
                const conversation = (event.conversation ?? null) as {
                    type?: string;
                    name?: string | null;
                } | null;
                const game = isGamePath(window.location.pathname);
                setInGame(game);
                setNotice((current) => ({
                    key: Date.now(),
                    conversationId: message.conversation_id as number,
                    senderId: sender?.id ?? message.user_id ?? null,
                    senderName: sender?.name ?? '',
                    character: sender?.character ?? null,
                    groupName:
                        conversation?.type === 'group'
                            ? (conversation.name ?? null)
                            : null,
                    body: message.body ?? '',
                    count:
                        current &&
                        current.conversationId === message.conversation_id
                            ? current.count + 1
                            : 1,
                }));
                if (!game) {
                    router.reload({
                        only: ['unreadChats', 'unreadNotifications'],
                    });
                }
            },
            [live.userId],
        ),
    );

    const close = useCallback(() => {
        setNotice(null);
        lastFocus.current?.focus?.();
        lastFocus.current = null;
    }, []);

    const open = useCallback(() => {
        if (!notice) {
            return;
        }
        const url = `/chat?c=${notice.conversationId}`;
        setNotice(null);
        router.visit(url);
    }, [notice]);

    // In game: hide the banner after a moment.
    useEffect(() => {
        if (!notice || !inGame) {
            return;
        }
        const timer = window.setTimeout(() => setNotice(null), GAME_BANNER_MS);
        return () => window.clearTimeout(timer);
    }, [notice, inGame]);

    // Modal: focus the primary action, Escape closes.
    useEffect(() => {
        if (!notice || inGame) {
            return;
        }
        if (!lastFocus.current) {
            lastFocus.current = document.activeElement as HTMLElement | null;
        }
        openButton.current?.focus();
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                close();
            }
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [notice, inGame, close]);

    if (!notice) {
        return null;
    }

    const title = notice.groupName
        ? t('chatNotice.inGroup', {
              name: notice.senderName,
              group: notice.groupName,
          })
        : notice.senderName;
    const more =
        notice.count > 1 ? t('chatNotice.more', { count: notice.count }) : null;

    const avatar = (size: string) => (
        <span
            className={`${size} shrink-0 rounded-2xl border-2 border-[#151b2e] bg-[#fff3c4]`}
        >
            <PlayerAvatar
                character={notice.character}
                seat={notice.senderId ?? 0}
                userId={notice.senderId}
            />
        </span>
    );

    if (inGame) {
        return (
            <div
                key={notice.key}
                role="status"
                aria-live="polite"
                className="pointer-events-none fixed inset-x-0 top-[max(8px,env(safe-area-inset-top))] z-[90] flex justify-center px-3"
                data-testid="chat-notice-banner"
            >
                <div className="edu-chat-banner pointer-events-auto relative flex w-full max-w-md items-center gap-2 rounded-2xl border-[2.5px] border-[#151b2e] bg-[#fffaf0] p-2 text-[#151b2e] shadow-[4px_4px_0_#151b2e]">
                    <button
                        type="button"
                        onClick={open}
                        className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl p-1 text-left hover:bg-[#ffefc2] focus-visible:bg-[#ffefc2] focus-visible:outline-none"
                        data-testid="chat-notice-open"
                    >
                        {avatar('size-10')}
                        <span className="flex min-w-0 flex-col">
                            <span className="flex min-w-0 items-center gap-1.5 text-sm font-black">
                                <MessageCircle
                                    className="size-4 shrink-0 text-sky-600"
                                    aria-hidden="true"
                                />
                                <span className="truncate">{title}</span>
                                {more && (
                                    <span className="shrink-0 rounded-full bg-[#7dd3fc] px-1.5 text-[11px] font-black">
                                        {more}
                                    </span>
                                )}
                            </span>
                            <span className="truncate text-sm font-medium text-[#151b2e]/80">
                                {notice.body}
                            </span>
                        </span>
                    </button>
                    <button
                        type="button"
                        onClick={close}
                        aria-label={t('chatNotice.close')}
                        title={t('chatNotice.close')}
                        className="grid size-9 shrink-0 place-items-center rounded-xl hover:bg-[#ffefc2]"
                        data-testid="chat-notice-close"
                    >
                        <X className="size-4" aria-hidden="true" />
                    </button>
                    <span
                        className="edu-chat-banner-timer absolute inset-x-3 bottom-1 h-0.5 origin-left rounded-full bg-[#151b2e]/25"
                        style={{ animationDuration: `${GAME_BANNER_MS}ms` }}
                        aria-hidden="true"
                    />
                </div>
            </div>
        );
    }

    return (
        <div
            className="edu-chat-modal-backdrop fixed inset-0 z-[90] grid place-items-center bg-[#151b2e]/60 p-5 backdrop-blur-[2px]"
            onPointerDown={(event) => {
                if (event.target === event.currentTarget) {
                    close();
                }
            }}
            data-testid="chat-notice-modal"
        >
            <div
                key={notice.key}
                role="dialog"
                aria-modal="true"
                aria-labelledby="chat-notice-title"
                aria-describedby="chat-notice-body"
                className="edu-chat-modal relative flex w-full max-w-sm flex-col items-center gap-3 rounded-3xl border-[3px] border-[#151b2e] bg-[#fffaf0] p-5 text-center text-[#151b2e] shadow-[8px_8px_0_#151b2e]"
            >
                <button
                    type="button"
                    onClick={close}
                    aria-label={t('chatNotice.close')}
                    title={t('chatNotice.close')}
                    className="absolute top-1.5 right-1.5 grid size-11 place-items-center rounded-xl hover:bg-[#ffefc2]"
                >
                    <X className="size-4" aria-hidden="true" />
                </button>
                <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-[#151b2e] bg-[#7dd3fc] px-3 py-0.5 text-xs font-black tracking-wide uppercase">
                    <MessageCircle className="size-3.5" aria-hidden="true" />
                    {t('chatNotice.newMessage')}
                </span>
                {avatar('size-20')}
                <h2
                    id="chat-notice-title"
                    className="max-w-full font-display text-lg leading-tight font-black break-words"
                >
                    {title}
                </h2>
                <p
                    id="chat-notice-body"
                    className="line-clamp-4 w-full rounded-2xl rounded-tl-md border-l-4 border-[#38bdf8] bg-[#e0f4ff] px-3 py-2 text-left text-sm font-medium break-words whitespace-pre-line"
                    data-testid="chat-notice-body"
                >
                    {notice.body}
                </p>
                {more && (
                    <p className="text-xs font-bold text-[#151b2e]/70">
                        {more}
                    </p>
                )}
                <div className="grid w-full grid-cols-2 gap-2">
                    <button
                        type="button"
                        onClick={close}
                        className="min-h-11 rounded-2xl border-2 border-[#151b2e] bg-white px-3 font-black hover:bg-[#ffefc2]"
                        data-testid="chat-notice-close"
                    >
                        {t('chatNotice.later')}
                    </button>
                    <button
                        ref={openButton}
                        type="button"
                        onClick={open}
                        className="min-h-11 rounded-2xl border-2 border-[#151b2e] bg-[#ffd93d] px-3 font-black shadow-[3px_3px_0_#151b2e] hover:bg-[#ffcd1f]"
                        data-testid="chat-notice-open"
                    >
                        {t('chatNotice.open')}
                    </button>
                </div>
            </div>
        </div>
    );
}
