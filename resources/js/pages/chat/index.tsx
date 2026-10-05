import { PlayerAvatar } from '@/components/player-avatar';
import { useChatSocket } from '@/hooks/use-chat-socket';
import { useTranslations } from '@/hooks/use-translations';
import PlayerLayout from '@/layouts/player-layout';
import { type CharacterLook } from '@/lib/character/draw-character';
import { cn } from '@/lib/utils';
import { type SharedData } from '@/types';
import { router, usePage } from '@inertiajs/react';
import {
    ArrowLeft,
    Check,
    Crown,
    Info,
    Loader2,
    LogOut,
    MessageCirclePlus,
    Pencil,
    RotateCcw,
    Search,
    SendHorizontal,
    UserPlus,
    Users,
    Wifi,
    WifiOff,
    X,
} from 'lucide-react';
import {
    type FormEvent,
    type KeyboardEvent,
    type ReactNode,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';

interface Member {
    id: number;
    name: string;
    character: CharacterLook | null;
    role?: string;
}

interface Message {
    id: number;
    conversation_id: number;
    type: 'text' | 'system';
    body: string;
    user_id: number | null;
    user_name: string | null;
    mine?: boolean;
    created_at: string | null;
    /** Client-only: optimistic send state. */
    pending?: 'sending' | 'failed';
    tempId?: string;
}

interface Conversation {
    id: number;
    type: 'direct' | 'group';
    name: string;
    owner_id: number | null;
    members: Member[];
    character: CharacterLook | null;
    unread?: number;
    last?: Message | null;
}

interface ChatProps {
    conversations: Conversation[];
    openId: number | null;
    live: boolean;
    wsUrl: string;
    limits: { message: number; group: number };
}

function csrfToken(): string {
    return (
        document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')
            ?.content ?? ''
    );
}

async function api<T>(
    url: string,
    method = 'GET',
    body?: unknown,
): Promise<{ ok: boolean; status: number; data: T }> {
    const res = await fetch(url, {
        method,
        credentials: 'same-origin',
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'X-CSRF-TOKEN': csrfToken(),
            'X-Requested-With': 'XMLHttpRequest',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    let data = {} as T;
    try {
        data = (await res.json()) as T;
    } catch {
        // Empty body.
    }
    return { ok: res.ok, status: res.status, data };
}

function firstError(data: unknown): string | null {
    const value = data as {
        message?: string;
        errors?: Record<string, string[]>;
    };
    const errors = value?.errors ? Object.values(value.errors) : [];
    return errors[0]?.[0] ?? value?.message ?? null;
}

function ConversationAvatar({
    conversation,
    meId,
    className = 'size-11',
}: {
    conversation: Conversation;
    meId: number;
    className?: string;
}) {
    if (conversation.type === 'direct') {
        const other = conversation.members.find((m) => m.id !== meId);
        return (
            <span
                className={cn(
                    'shrink-0 overflow-hidden rounded-2xl border-2 border-[#151b2e] bg-[#fff3c4]',
                    className,
                )}
            >
                <PlayerAvatar
                    character={conversation.character ?? other?.character}
                    seat={other?.id ?? 0}
                />
            </span>
        );
    }
    const faces = conversation.members.filter((m) => m.id !== meId).slice(0, 2);
    return (
        <span
            className={cn(
                'relative grid shrink-0 place-items-center rounded-2xl border-2 border-[#151b2e] bg-[#c9f5e5]',
                className,
            )}
        >
            {faces.length === 0 ? (
                <Users className="size-5" aria-hidden="true" />
            ) : (
                <span className="flex -space-x-3">
                    {faces.map((m) => (
                        <span key={m.id} className="size-7">
                            <PlayerAvatar character={m.character} seat={m.id} />
                        </span>
                    ))}
                </span>
            )}
        </span>
    );
}

function Modal({
    title,
    onClose,
    children,
    testId,
}: {
    title: string;
    onClose: () => void;
    children: ReactNode;
    testId: string;
}) {
    const { t } = useTranslations();
    useEffect(() => {
        const onKey = (event: globalThis.KeyboardEvent) => {
            if (event.key === 'Escape') {
                onClose();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);
    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
            <div className="fixed inset-0 bg-black/50" onClick={onClose} />
            <div
                role="dialog"
                aria-modal="true"
                aria-label={title}
                data-testid={testId}
                className="relative z-10 flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border-3 border-[#151b2e] bg-white shadow-[6px_6px_0_#151b2e] sm:rounded-3xl"
            >
                <div className="flex items-center justify-between gap-3 border-b-2 border-[#151b2e]/10 px-5 py-3">
                    <h2 className="text-lg font-bold">{title}</h2>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label={t('chat.close')}
                        className="grid size-10 place-items-center rounded-xl hover:bg-[#faf7ef]"
                    >
                        <X className="size-5" />
                    </button>
                </div>
                <div className="flex min-h-0 flex-col gap-3 overflow-y-auto p-5">
                    {children}
                </div>
            </div>
        </div>
    );
}

/** Search box + list of players; single pick or multi pick. */
function PeoplePicker({
    selected,
    onToggle,
    exclude = [],
    multiple,
}: {
    selected: Member[];
    onToggle: (person: Member) => void;
    exclude?: number[];
    multiple: boolean;
}) {
    const { t } = useTranslations();
    const [q, setQ] = useState('');
    const [people, setPeople] = useState<Member[] | null>(null);

    useEffect(() => {
        let cancelled = false;
        const timer = setTimeout(async () => {
            const { ok, data } = await api<{ people: Member[] }>(
                `/chat/people?q=${encodeURIComponent(q)}`,
            );
            if (!cancelled && ok) {
                setPeople(data.people);
            }
        }, 250);
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [q]);

    const visible = (people ?? []).filter((p) => !exclude.includes(p.id));

    return (
        <div className="flex flex-col gap-2">
            <label className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-500" />
                <input
                    value={q}
                    onChange={(event) => setQ(event.target.value)}
                    placeholder={t('chat.peopleSearch')}
                    aria-label={t('chat.peopleSearch')}
                    className="w-full !pl-9"
                    data-testid="chat-people-search"
                    autoFocus
                />
            </label>
            {multiple && selected.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                    {selected.map((p) => (
                        <button
                            key={p.id}
                            type="button"
                            onClick={() => onToggle(p)}
                            className="inline-flex min-h-8 items-center gap-1 rounded-full border-2 border-[#151b2e] bg-[#ffd93d] px-2.5 text-xs font-bold"
                        >
                            {p.name}
                            <X className="size-3" />
                        </button>
                    ))}
                </div>
            )}
            <ul
                className="flex max-h-72 flex-col gap-1 overflow-y-auto"
                data-testid="chat-people"
            >
                {people === null ? (
                    <li className="flex justify-center py-4">
                        <Loader2 className="size-5 animate-spin" />
                    </li>
                ) : visible.length === 0 ? (
                    <li className="py-4 text-center text-sm text-slate-600">
                        {t('chat.peopleEmpty')}
                    </li>
                ) : (
                    visible.map((p) => {
                        const on = selected.some((s) => s.id === p.id);
                        return (
                            <li key={p.id}>
                                <button
                                    type="button"
                                    onClick={() => onToggle(p)}
                                    aria-pressed={multiple ? on : undefined}
                                    data-testid={`chat-person-${p.id}`}
                                    className={cn(
                                        'flex w-full items-center gap-3 rounded-2xl px-2 py-1.5 text-left font-bold hover:bg-[#faf7ef]',
                                        on && 'bg-[#fff3c4]',
                                    )}
                                >
                                    <span className="size-10 shrink-0">
                                        <PlayerAvatar
                                            character={p.character}
                                            seat={p.id}
                                        />
                                    </span>
                                    <span className="min-w-0 flex-1 truncate">
                                        {p.name}
                                    </span>
                                    {multiple && (
                                        <span
                                            className={cn(
                                                'grid size-6 place-items-center rounded-lg border-2 border-[#151b2e]',
                                                on && 'bg-[#151b2e] text-white',
                                            )}
                                        >
                                            {on && <Check className="size-4" />}
                                        </span>
                                    )}
                                </button>
                            </li>
                        );
                    })
                )}
            </ul>
        </div>
    );
}

function dayKey(iso: string | null): string {
    return iso ? new Date(iso).toDateString() : '';
}

export default function ChatIndex({
    conversations: initial,
    openId,
    live,
    wsUrl,
    limits,
}: ChatProps) {
    const { t, i18n } = useTranslations();
    const { auth } = usePage<SharedData>().props;
    const meId = auth.user.id;
    const [conversations, setConversations] = useState(initial);
    const [activeId, setActiveId] = useState<number | null>(openId);
    const [messages, setMessages] = useState<Message[]>([]);
    const [hasMore, setHasMore] = useState(false);
    const [loading, setLoading] = useState(openId !== null);
    const [draft, setDraft] = useState('');
    const [filter, setFilter] = useState('');
    const [modal, setModal] = useState<
        'direct' | 'group' | 'info' | 'add' | null
    >(null);
    const [error, setError] = useState<string | null>(null);
    const listRef = useRef<HTMLDivElement | null>(null);
    const inputRef = useRef<HTMLTextAreaElement | null>(null);
    const activeRef = useRef(activeId);
    const stickBottom = useRef(true);
    const tempSeq = useRef(0);

    useEffect(() => {
        activeRef.current = activeId;
    }, [activeId]);

    const active = conversations.find((c) => c.id === activeId) ?? null;

    const refreshInbox = useCallback(async () => {
        const { ok, data } = await api<{ conversations: Conversation[] }>(
            '/chat/inbox',
        );
        if (ok) {
            setConversations(data.conversations);
        }
    }, []);

    const loadConversation = useCallback(
        async (id: number, before?: number) => {
            const { ok, data } = await api<{
                conversation: Conversation;
                messages: Message[];
                page_size: number;
            }>(`/chat/conversations/${id}${before ? `?before=${before}` : ''}`);
            setLoading(false);
            if (!ok || activeRef.current !== id) {
                return;
            }
            setHasMore(data.messages.length >= data.page_size);
            if (before) {
                const el = listRef.current;
                const from = el ? el.scrollHeight - el.scrollTop : 0;
                setMessages((current) => [...data.messages, ...current]);
                requestAnimationFrame(() => {
                    if (el) {
                        el.scrollTop = el.scrollHeight - from;
                    }
                });
            } else {
                stickBottom.current = true;
                setMessages(data.messages);
                setConversations((current) => {
                    const exists = current.some((c) => c.id === id);
                    const merged = { ...data.conversation, unread: 0 };
                    return exists
                        ? current.map((c) =>
                              c.id === id ? { ...c, ...merged } : c,
                          )
                        : [merged, ...current];
                });
                router.reload({ only: ['unreadChats', 'unreadNotifications'] });
            }
        },
        [],
    );

    useEffect(() => {
        if (activeId) {
            // Fetching from the server; state updates happen after await.
            // eslint-disable-next-line react-hooks/set-state-in-effect
            void loadConversation(activeId);
            const url = new URL(window.location.href);
            url.searchParams.set('c', String(activeId));
            window.history.replaceState(window.history.state, '', url);
        }
    }, [activeId, loadConversation]);

    const select = (id: number | null) => {
        if (id === activeId) {
            return;
        }
        setMessages([]);
        setError(null);
        setHasMore(false);
        setLoading(id !== null);
        setActiveId(id);
    };

    useEffect(() => {
        const el = listRef.current;
        if (el && stickBottom.current) {
            el.scrollTop = el.scrollHeight;
        }
    }, [messages]);

    const onEvent = useCallback(
        (event: Record<string, unknown>) => {
            if (event.t !== 'message') {
                return;
            }
            const message = event.message as Message;
            const mine = message.user_id === meId;
            const isActive = message.conversation_id === activeRef.current;
            if (isActive) {
                setMessages((current) =>
                    current.some((m) => m.id === message.id)
                        ? current
                        : [...current, { ...message, mine }],
                );
                if (!mine && document.visibilityState === 'visible') {
                    void api(
                        `/chat/conversations/${message.conversation_id}/read`,
                        'POST',
                    );
                }
            }
            setConversations((current) => {
                const found = current.find(
                    (c) => c.id === message.conversation_id,
                );
                if (!found) {
                    void refreshInbox();
                    return current;
                }
                const updated = {
                    ...found,
                    last: { ...message, mine },
                    unread:
                        isActive || mine || message.type === 'system'
                            ? found.unread
                            : (found.unread ?? 0) + 1,
                };
                return [updated, ...current.filter((c) => c.id !== found.id)];
            });
            if (message.type === 'system' && isActive) {
                void loadConversation(message.conversation_id);
            }
        },
        [meId, refreshInbox, loadConversation],
    );

    const onResync = useCallback(() => {
        void refreshInbox();
        if (activeRef.current) {
            void loadConversation(activeRef.current);
        }
    }, [refreshInbox, loadConversation]);

    const status = useChatSocket(live ? wsUrl : null, { onEvent, onResync });

    // Without a live socket, poll so chats still arrive.
    useEffect(() => {
        if (status === 'online') {
            return;
        }
        const timer = setInterval(() => {
            if (document.visibilityState === 'visible') {
                onResync();
            }
        }, 10_000);
        return () => clearInterval(timer);
    }, [status, onResync]);

    const send = async (text: string, retryOf?: Message) => {
        if (!active) {
            return;
        }
        const body = text.trim();
        if (!body) {
            return;
        }
        tempSeq.current += 1;
        const tempId = retryOf?.tempId ?? `tmp-${tempSeq.current}`;
        const optimistic: Message = {
            id: -tempSeq.current,
            conversation_id: active.id,
            type: 'text',
            body,
            user_id: meId,
            user_name: null,
            mine: true,
            created_at: new Date().toISOString(),
            pending: 'sending',
            tempId,
        };
        stickBottom.current = true;
        setMessages((current) => [
            ...current.filter((m) => m.tempId !== tempId),
            optimistic,
        ]);
        setError(null);
        const { ok, data } = await api<{ message: Message }>(
            `/chat/conversations/${active.id}/messages`,
            'POST',
            { body },
        );
        if (!ok) {
            setMessages((current) =>
                current.map((m) =>
                    m.tempId === tempId ? { ...m, pending: 'failed' } : m,
                ),
            );
            setError(firstError(data) ?? t('chat.failed'));
            return;
        }
        setMessages((current) => {
            const without = current.filter((m) => m.tempId !== tempId);
            return without.some((m) => m.id === data.message.id)
                ? without
                : [...without, data.message];
        });
        setConversations((current) => {
            const found = current.find((c) => c.id === active.id);
            return found
                ? [
                      { ...found, last: data.message },
                      ...current.filter((c) => c.id !== found.id),
                  ]
                : current;
        });
    };

    const submit = (event?: FormEvent) => {
        event?.preventDefault();
        const text = draft;
        if (!text.trim()) {
            return;
        }
        setDraft('');
        void send(text);
        inputRef.current?.focus();
    };

    const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
        if (
            event.key === 'Enter' &&
            !event.shiftKey &&
            !event.nativeEvent.isComposing
        ) {
            event.preventDefault();
            submit();
        }
    };

    const openConversation = (conversation: Conversation) => {
        setModal(null);
        setConversations((current) =>
            current.some((c) => c.id === conversation.id)
                ? current
                : [conversation, ...current],
        );
        select(conversation.id);
    };

    const time = useMemo(
        () =>
            new Intl.DateTimeFormat(i18n.language, {
                hour: '2-digit',
                minute: '2-digit',
            }),
        [i18n.language],
    );
    const day = (iso: string | null) => {
        if (!iso) {
            return '';
        }
        const date = new Date(iso);
        const today = new Date();
        const yesterday = new Date();
        yesterday.setDate(today.getDate() - 1);
        if (date.toDateString() === today.toDateString()) {
            return t('chat.today');
        }
        if (date.toDateString() === yesterday.toDateString()) {
            return t('chat.yesterday');
        }
        return new Intl.DateTimeFormat(i18n.language, {
            day: 'numeric',
            month: 'short',
            year:
                date.getFullYear() === today.getFullYear()
                    ? undefined
                    : 'numeric',
        }).format(date);
    };

    const shown = conversations.filter((c) =>
        c.name.toLowerCase().includes(filter.trim().toLowerCase()),
    );

    return (
        <PlayerLayout title={t('chat.title')} fill>
            <div
                className="grid min-h-0 flex-1 overflow-hidden rounded-3xl border-3 border-[#151b2e] bg-white shadow-[6px_6px_0_#151b2e] md:grid-cols-[minmax(280px,360px)_minmax(0,1fr)]"
                data-testid="chat-app"
            >
                <aside
                    className={cn(
                        'flex min-h-0 flex-col border-[#151b2e]/15 md:border-r-2',
                        active && 'hidden md:flex',
                    )}
                    data-testid="chat-inbox"
                >
                    <div className="flex flex-col gap-3 border-b-2 border-[#151b2e]/10 p-4">
                        <div className="flex items-center justify-between gap-2">
                            <h1 className="text-2xl font-bold">
                                {t('chat.title')}
                            </h1>
                            <span
                                className={cn(
                                    'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold',
                                    status === 'online'
                                        ? 'bg-[#c9f5e5] text-[#00695c]'
                                        : 'bg-[#ffe4e6] text-[#9f1239]',
                                )}
                                data-testid="chat-status"
                                data-status={status}
                            >
                                {status === 'online' ? (
                                    <Wifi className="size-3" />
                                ) : (
                                    <WifiOff className="size-3" />
                                )}
                                {status === 'online'
                                    ? t('chat.online')
                                    : t('chat.offline')}
                            </span>
                        </div>
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={() => setModal('direct')}
                                className="edu-nav-btn edu-nav-btn--primary flex-1"
                                data-testid="chat-new"
                            >
                                <MessageCirclePlus aria-hidden="true" />
                                {t('chat.new')}
                            </button>
                            <button
                                type="button"
                                onClick={() => setModal('group')}
                                className="edu-nav-btn flex-1"
                                data-testid="chat-new-group"
                            >
                                <Users aria-hidden="true" />
                                {t('chat.newGroup')}
                            </button>
                        </div>
                        <label className="relative">
                            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-500" />
                            <input
                                value={filter}
                                onChange={(event) =>
                                    setFilter(event.target.value)
                                }
                                placeholder={t('chat.search')}
                                aria-label={t('chat.search')}
                                className="w-full !pl-9"
                            />
                        </label>
                    </div>
                    <ul className="min-h-0 flex-1 overflow-y-auto p-2">
                        {shown.length === 0 ? (
                            <li className="p-6 text-center text-sm text-slate-600">
                                {t('chat.empty')}
                            </li>
                        ) : (
                            shown.map((c) => (
                                <li key={c.id}>
                                    <button
                                        type="button"
                                        onClick={() => select(c.id)}
                                        aria-current={
                                            c.id === activeId
                                                ? 'true'
                                                : undefined
                                        }
                                        data-testid={`chat-conversation-${c.id}`}
                                        className={cn(
                                            'flex w-full items-center gap-3 rounded-2xl px-2.5 py-2 text-left transition-colors hover:bg-[#faf7ef]',
                                            c.id === activeId && 'bg-[#fff3c4]',
                                        )}
                                    >
                                        <ConversationAvatar
                                            conversation={c}
                                            meId={meId}
                                        />
                                        <span className="flex min-w-0 flex-1 flex-col">
                                            <span className="flex items-center gap-2">
                                                <span className="min-w-0 flex-1 truncate font-bold">
                                                    {c.name}
                                                </span>
                                                <span className="shrink-0 text-xs text-slate-600">
                                                    {c.last?.created_at
                                                        ? dayKey(
                                                              c.last.created_at,
                                                          ) ===
                                                          new Date().toDateString()
                                                            ? time.format(
                                                                  new Date(
                                                                      c.last
                                                                          .created_at,
                                                                  ),
                                                              )
                                                            : day(
                                                                  c.last
                                                                      .created_at,
                                                              )
                                                        : ''}
                                                </span>
                                            </span>
                                            <span className="flex items-center gap-2">
                                                <span className="min-w-0 flex-1 truncate text-sm text-slate-600">
                                                    {c.last
                                                        ? `${c.last.mine ? `${t('chat.you')}: ` : c.type === 'group' && c.last.type === 'text' && c.last.user_name ? `${c.last.user_name}: ` : ''}${c.last.body}`
                                                        : c.type === 'group'
                                                          ? t('chat.members', {
                                                                count: c.members
                                                                    .length,
                                                            })
                                                          : ''}
                                                </span>
                                                {(c.unread ?? 0) > 0 && (
                                                    <span
                                                        className="grid min-w-5 shrink-0 place-items-center rounded-full bg-[#ff5470] px-1.5 text-[11px] font-bold text-white"
                                                        aria-label={t(
                                                            'chat.unread',
                                                            {
                                                                count: c.unread,
                                                            },
                                                        )}
                                                        data-testid={`chat-unread-${c.id}`}
                                                    >
                                                        {(c.unread ?? 0) > 99
                                                            ? '99+'
                                                            : c.unread}
                                                    </span>
                                                )}
                                            </span>
                                        </span>
                                    </button>
                                </li>
                            ))
                        )}
                    </ul>
                </aside>

                <section
                    className={cn(
                        'flex min-h-0 min-w-0 flex-col',
                        !active && 'hidden md:flex',
                    )}
                    data-testid="chat-thread"
                >
                    {!active ? (
                        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center text-slate-600">
                            <MessageCirclePlus className="size-12 text-[#6c5ce7]" />
                            <p className="font-bold">{t('chat.pick')}</p>
                        </div>
                    ) : (
                        <>
                            <header className="flex items-center gap-3 border-b-2 border-[#151b2e]/10 px-3 py-2.5 sm:px-4">
                                <button
                                    type="button"
                                    onClick={() => select(null)}
                                    aria-label={t('chat.back')}
                                    className="grid size-10 shrink-0 place-items-center rounded-xl hover:bg-[#faf7ef] md:hidden"
                                    data-testid="chat-back"
                                >
                                    <ArrowLeft className="size-5" />
                                </button>
                                <ConversationAvatar
                                    conversation={active}
                                    meId={meId}
                                    className="size-10"
                                />
                                <div className="min-w-0 flex-1">
                                    <h2
                                        className="truncate font-bold"
                                        data-testid="chat-thread-title"
                                    >
                                        {active.name}
                                    </h2>
                                    <p className="truncate text-xs text-slate-600">
                                        {active.type === 'group'
                                            ? t('chat.members', {
                                                  count: active.members.length,
                                              })
                                            : t('chat.directLabel')}
                                    </p>
                                </div>
                                {active.type === 'group' && (
                                    <button
                                        type="button"
                                        onClick={() => setModal('info')}
                                        aria-label={t('chat.info')}
                                        title={t('chat.info')}
                                        className="edu-nav-btn edu-nav-btn--icon"
                                        data-testid="chat-info"
                                    >
                                        <Info aria-hidden="true" />
                                    </button>
                                )}
                            </header>
                            <div
                                ref={listRef}
                                onScroll={(event) => {
                                    const el = event.currentTarget;
                                    stickBottom.current =
                                        el.scrollHeight -
                                            el.scrollTop -
                                            el.clientHeight <
                                        80;
                                }}
                                className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto bg-[#faf7ef] px-3 py-4 sm:px-6 [&>:first-child]:mt-auto"
                                data-testid="chat-messages"
                            >
                                {hasMore && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setLoading(true);
                                            void loadConversation(
                                                active.id,
                                                messages.find((m) => m.id > 0)
                                                    ?.id,
                                            );
                                        }}
                                        disabled={loading}
                                        className="mx-auto mb-2 rounded-full border-2 border-[#151b2e] bg-white px-3 py-1 text-xs font-bold"
                                    >
                                        {t('chat.loadMore')}
                                    </button>
                                )}
                                {loading && messages.length === 0 && (
                                    <Loader2 className="m-auto size-6 animate-spin" />
                                )}
                                {messages.map((m, index) => {
                                    const prev = messages[index - 1];
                                    const newDay =
                                        dayKey(m.created_at) !==
                                        dayKey(prev?.created_at ?? null);
                                    const mine = m.mine ?? m.user_id === meId;
                                    const sameAuthor =
                                        !newDay &&
                                        prev?.type === 'text' &&
                                        prev.user_id === m.user_id;
                                    const author = active.members.find(
                                        (mem) => mem.id === m.user_id,
                                    );
                                    return (
                                        <div
                                            key={m.tempId ?? m.id}
                                            className="flex flex-col"
                                        >
                                            {newDay && (
                                                <span className="mx-auto my-2 rounded-full border border-[#151b2e]/20 bg-white px-3 py-0.5 text-xs font-bold text-slate-700">
                                                    {day(m.created_at)}
                                                </span>
                                            )}
                                            {m.type === 'system' ? (
                                                <p
                                                    className="mx-auto my-1 max-w-[85%] text-center text-xs text-slate-600 italic"
                                                    data-testid="chat-system"
                                                >
                                                    {m.body}
                                                </p>
                                            ) : (
                                                <div
                                                    className={cn(
                                                        'flex items-end gap-2',
                                                        mine &&
                                                            'flex-row-reverse',
                                                        !sameAuthor && 'mt-2',
                                                    )}
                                                    data-testid="chat-message"
                                                    data-mine={mine}
                                                >
                                                    {!mine &&
                                                        active.type ===
                                                            'group' && (
                                                            <span className="size-8 shrink-0">
                                                                {!sameAuthor && (
                                                                    <PlayerAvatar
                                                                        character={
                                                                            author?.character
                                                                        }
                                                                        seat={
                                                                            m.user_id ??
                                                                            0
                                                                        }
                                                                    />
                                                                )}
                                                            </span>
                                                        )}
                                                    <div
                                                        className={cn(
                                                            'flex max-w-[80%] flex-col gap-0.5 rounded-2xl border-2 border-[#151b2e] px-3 py-1.5 sm:max-w-[65%]',
                                                            mine
                                                                ? 'rounded-br-md bg-[#ffd93d]'
                                                                : 'rounded-bl-md bg-white',
                                                            m.pending ===
                                                                'failed' &&
                                                                'border-[#e11d48]',
                                                        )}
                                                    >
                                                        {!mine &&
                                                            active.type ===
                                                                'group' &&
                                                            !sameAuthor && (
                                                                <span className="text-xs font-bold text-[#6c5ce7]">
                                                                    {m.user_name ??
                                                                        author?.name}
                                                                </span>
                                                            )}
                                                        <p className="text-sm break-words whitespace-pre-wrap">
                                                            {m.body}
                                                        </p>
                                                        <span className="flex items-center justify-end gap-1 text-[11px] text-slate-700">
                                                            {m.created_at &&
                                                                time.format(
                                                                    new Date(
                                                                        m.created_at,
                                                                    ),
                                                                )}
                                                            {m.pending ===
                                                                'sending' && (
                                                                <Loader2 className="size-3 animate-spin" />
                                                            )}
                                                            {mine &&
                                                                !m.pending && (
                                                                    <Check className="size-3" />
                                                                )}
                                                        </span>
                                                    </div>
                                                    {m.pending === 'failed' && (
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                send(m.body, m)
                                                            }
                                                            aria-label={t(
                                                                'chat.retry',
                                                            )}
                                                            title={t(
                                                                'chat.retry',
                                                            )}
                                                            className="grid size-8 shrink-0 place-items-center rounded-lg text-[#e11d48] hover:bg-white"
                                                        >
                                                            <RotateCcw className="size-4" />
                                                        </button>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                            <form
                                onSubmit={submit}
                                className="flex flex-col gap-1 border-t-2 border-[#151b2e]/10 p-3"
                            >
                                {error && (
                                    <p
                                        className="text-xs font-bold text-[#e11d48]"
                                        role="alert"
                                    >
                                        {error}
                                    </p>
                                )}
                                <div className="flex items-end gap-2 [&>button]:size-11">
                                    <textarea
                                        ref={inputRef}
                                        value={draft}
                                        onChange={(event) =>
                                            setDraft(
                                                event.target.value.slice(
                                                    0,
                                                    limits.message,
                                                ),
                                            )
                                        }
                                        onKeyDown={onKeyDown}
                                        rows={1}
                                        placeholder={t('chat.placeholder')}
                                        aria-label={t('chat.placeholder')}
                                        title={t('chat.typingHint')}
                                        className="max-h-32 min-h-11 flex-1 resize-none rounded-2xl border-2 border-[#151b2e] bg-white px-3.5 py-2.5 text-sm outline-none focus-visible:border-[#6c5ce7]"
                                        data-testid="chat-input"
                                    />
                                    <button
                                        type="submit"
                                        disabled={!draft.trim()}
                                        aria-label={t('chat.send')}
                                        title={t('chat.send')}
                                        className="edu-nav-btn edu-nav-btn--primary edu-nav-btn--icon"
                                        data-testid="chat-send"
                                    >
                                        <SendHorizontal aria-hidden="true" />
                                    </button>
                                </div>
                                {draft.length > limits.message * 0.8 && (
                                    <span className="self-end text-[11px] text-slate-600 tabular-nums">
                                        {t('chat.limit', {
                                            count: draft.length,
                                            max: limits.message,
                                        })}
                                    </span>
                                )}
                            </form>
                        </>
                    )}
                </section>
            </div>

            {modal === 'direct' && (
                <DirectModal
                    onClose={() => setModal(null)}
                    onOpen={openConversation}
                />
            )}
            {modal === 'group' && (
                <GroupModal
                    max={limits.group}
                    onClose={() => setModal(null)}
                    onOpen={openConversation}
                />
            )}
            {modal === 'info' && active && (
                <GroupInfoModal
                    conversation={active}
                    meId={meId}
                    onClose={() => setModal(null)}
                    onAdd={() => setModal('add')}
                    onChanged={(c) =>
                        setConversations((current) =>
                            current.map((x) =>
                                x.id === c.id ? { ...x, ...c } : x,
                            ),
                        )
                    }
                    onLeft={() => {
                        setModal(null);
                        select(null);
                        setConversations((current) =>
                            current.filter((x) => x.id !== active.id),
                        );
                    }}
                />
            )}
            {modal === 'add' && active && (
                <AddMembersModal
                    conversation={active}
                    max={limits.group}
                    onClose={() => setModal('info')}
                    onChanged={(c) => {
                        setConversations((current) =>
                            current.map((x) =>
                                x.id === c.id ? { ...x, ...c } : x,
                            ),
                        );
                        setModal('info');
                    }}
                />
            )}
        </PlayerLayout>
    );
}

function DirectModal({
    onClose,
    onOpen,
}: {
    onClose: () => void;
    onOpen: (c: Conversation) => void;
}) {
    const { t } = useTranslations();
    const [error, setError] = useState<string | null>(null);
    return (
        <Modal
            title={t('chat.new')}
            onClose={onClose}
            testId="chat-direct-modal"
        >
            <PeoplePicker
                selected={[]}
                multiple={false}
                onToggle={async (person) => {
                    const { ok, data } = await api<{
                        conversation: Conversation;
                    }>('/chat/direct', 'POST', { user_id: person.id });
                    if (ok) {
                        onOpen(data.conversation);
                    } else {
                        setError(firstError(data));
                    }
                }}
            />
            {error && (
                <p className="text-sm font-bold text-[#e11d48]" role="alert">
                    {error}
                </p>
            )}
        </Modal>
    );
}

function GroupModal({
    max,
    onClose,
    onOpen,
}: {
    max: number;
    onClose: () => void;
    onOpen: (c: Conversation) => void;
}) {
    const { t } = useTranslations();
    const [name, setName] = useState('');
    const [members, setMembers] = useState<Member[]>([]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const create = async (event: FormEvent) => {
        event.preventDefault();
        setBusy(true);
        const { ok, data } = await api<{ conversation: Conversation }>(
            '/chat/groups',
            'POST',
            { name, member_ids: members.map((m) => m.id) },
        );
        setBusy(false);
        if (ok) {
            onOpen(data.conversation);
        } else {
            setError(firstError(data));
        }
    };

    return (
        <Modal
            title={t('chat.newGroup')}
            onClose={onClose}
            testId="chat-group-modal"
        >
            <form onSubmit={create} className="flex flex-col gap-3">
                <label className="flex flex-col gap-1 text-sm font-bold">
                    {t('chat.groupName')}
                    <input
                        value={name}
                        onChange={(event) =>
                            setName(event.target.value.slice(0, 60))
                        }
                        placeholder={t('chat.groupNamePlaceholder')}
                        data-testid="chat-group-name"
                    />
                </label>
                <div className="flex items-center justify-between text-sm font-bold">
                    <span>{t('chat.groupMembers')}</span>
                    <span className="text-xs text-slate-600">
                        {t('chat.selected', { count: members.length })}
                    </span>
                </div>
                <PeoplePicker
                    multiple
                    selected={members}
                    onToggle={(person) =>
                        setMembers((current) =>
                            current.some((m) => m.id === person.id)
                                ? current.filter((m) => m.id !== person.id)
                                : current.length < max - 1
                                  ? [...current, person]
                                  : current,
                        )
                    }
                />
                {error && (
                    <p
                        className="text-sm font-bold text-[#e11d48]"
                        role="alert"
                    >
                        {error}
                    </p>
                )}
                <div className="flex justify-end gap-2">
                    <button
                        type="button"
                        onClick={onClose}
                        className="edu-nav-btn"
                    >
                        {t('chat.cancel')}
                    </button>
                    <button
                        type="submit"
                        disabled={
                            busy ||
                            name.trim().length < 2 ||
                            members.length === 0
                        }
                        className="edu-nav-btn edu-nav-btn--primary disabled:opacity-50"
                        data-testid="chat-group-create"
                    >
                        <Users aria-hidden="true" />
                        {t('chat.create')}
                    </button>
                </div>
            </form>
        </Modal>
    );
}

function GroupInfoModal({
    conversation,
    meId,
    onClose,
    onAdd,
    onChanged,
    onLeft,
}: {
    conversation: Conversation;
    meId: number;
    onClose: () => void;
    onAdd: () => void;
    onChanged: (c: Conversation) => void;
    onLeft: () => void;
}) {
    const { t } = useTranslations();
    const isOwner = conversation.owner_id === meId;
    const [editing, setEditing] = useState(false);
    const [name, setName] = useState(conversation.name);
    const [confirmLeave, setConfirmLeave] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const rename = async (event: FormEvent) => {
        event.preventDefault();
        const { ok, data } = await api<{ conversation: Conversation }>(
            `/chat/groups/${conversation.id}`,
            'PATCH',
            { name },
        );
        if (ok) {
            onChanged(data.conversation);
            setEditing(false);
        } else {
            setError(firstError(data));
        }
    };

    const leave = async () => {
        const { ok, data } = await api(
            `/chat/groups/${conversation.id}/leave`,
            'POST',
        );
        if (ok) {
            onLeft();
        } else {
            setError(firstError(data));
        }
    };

    return (
        <Modal
            title={t('chat.info')}
            onClose={onClose}
            testId="chat-info-modal"
        >
            {editing ? (
                <form onSubmit={rename} className="flex gap-2">
                    <input
                        value={name}
                        onChange={(event) =>
                            setName(event.target.value.slice(0, 60))
                        }
                        aria-label={t('chat.groupName')}
                        className="min-w-0 flex-1"
                        autoFocus
                    />
                    <button
                        type="submit"
                        className="edu-nav-btn edu-nav-btn--primary"
                        disabled={name.trim().length < 2}
                    >
                        {t('chat.save')}
                    </button>
                </form>
            ) : (
                <div className="flex items-center gap-2">
                    <h3 className="min-w-0 flex-1 truncate text-xl font-bold">
                        {conversation.name}
                    </h3>
                    {isOwner && (
                        <button
                            type="button"
                            onClick={() => setEditing(true)}
                            className="edu-nav-btn edu-nav-btn--icon"
                            aria-label={t('chat.rename')}
                            title={t('chat.rename')}
                        >
                            <Pencil aria-hidden="true" />
                        </button>
                    )}
                </div>
            )}
            <div className="flex items-center justify-between text-sm font-bold">
                <span>
                    {t('chat.members', { count: conversation.members.length })}
                </span>
                <button
                    type="button"
                    onClick={onAdd}
                    className="edu-nav-btn"
                    data-testid="chat-add-members"
                >
                    <UserPlus aria-hidden="true" />
                    {t('chat.add')}
                </button>
            </div>
            <ul className="flex flex-col gap-1">
                {conversation.members.map((m) => (
                    <li
                        key={m.id}
                        className="flex items-center gap-3 rounded-2xl px-2 py-1.5"
                    >
                        <span className="size-10 shrink-0">
                            <PlayerAvatar character={m.character} seat={m.id} />
                        </span>
                        <span className="min-w-0 flex-1 truncate font-bold">
                            {m.name}
                            {m.id === meId && ` (${t('chat.you')})`}
                        </span>
                        {m.id === conversation.owner_id && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-[#151b2e] bg-[#ffd93d] px-2 text-[10px] font-bold">
                                <Crown className="size-3" />
                                {t('chat.owner')}
                            </span>
                        )}
                    </li>
                ))}
            </ul>
            {error && (
                <p className="text-sm font-bold text-[#e11d48]" role="alert">
                    {error}
                </p>
            )}
            {confirmLeave ? (
                <div className="flex flex-col gap-2 rounded-2xl border-2 border-[#e11d48] bg-[#fff1f2] p-3">
                    <p className="text-sm font-bold">
                        {t('chat.leaveConfirm')}
                    </p>
                    <div className="flex justify-end gap-2">
                        <button
                            type="button"
                            onClick={() => setConfirmLeave(false)}
                            className="edu-nav-btn"
                        >
                            {t('chat.cancel')}
                        </button>
                        <button
                            type="button"
                            onClick={leave}
                            className="edu-nav-btn !bg-[#e11d48] !text-white"
                            data-testid="chat-leave-confirm"
                        >
                            <LogOut aria-hidden="true" />
                            {t('chat.leave')}
                        </button>
                    </div>
                </div>
            ) : (
                <button
                    type="button"
                    onClick={() => setConfirmLeave(true)}
                    className="edu-nav-btn self-start !text-[#e11d48]"
                    data-testid="chat-leave"
                >
                    <LogOut aria-hidden="true" />
                    {t('chat.leave')}
                </button>
            )}
        </Modal>
    );
}

function AddMembersModal({
    conversation,
    max,
    onClose,
    onChanged,
}: {
    conversation: Conversation;
    max: number;
    onClose: () => void;
    onChanged: (c: Conversation) => void;
}) {
    const { t } = useTranslations();
    const [members, setMembers] = useState<Member[]>([]);
    const [error, setError] = useState<string | null>(null);
    const room = max - conversation.members.length;

    const add = async () => {
        const { ok, data } = await api<{ conversation: Conversation }>(
            `/chat/groups/${conversation.id}`,
            'PATCH',
            { add_member_ids: members.map((m) => m.id) },
        );
        if (ok) {
            onChanged(data.conversation);
        } else {
            setError(firstError(data));
        }
    };

    return (
        <Modal
            title={t('chat.addMembers')}
            onClose={onClose}
            testId="chat-add-modal"
        >
            <PeoplePicker
                multiple
                selected={members}
                exclude={conversation.members.map((m) => m.id)}
                onToggle={(person) =>
                    setMembers((current) =>
                        current.some((m) => m.id === person.id)
                            ? current.filter((m) => m.id !== person.id)
                            : current.length < room
                              ? [...current, person]
                              : current,
                    )
                }
            />
            {error && (
                <p className="text-sm font-bold text-[#e11d48]" role="alert">
                    {error}
                </p>
            )}
            <div className="flex justify-end gap-2">
                <button type="button" onClick={onClose} className="edu-nav-btn">
                    {t('chat.cancel')}
                </button>
                <button
                    type="button"
                    onClick={add}
                    disabled={members.length === 0}
                    className="edu-nav-btn edu-nav-btn--primary disabled:opacity-50"
                    data-testid="chat-add-confirm"
                >
                    <UserPlus aria-hidden="true" />
                    {t('chat.add')}
                </button>
            </div>
        </Modal>
    );
}
