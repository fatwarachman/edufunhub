import { usePage } from '@inertiajs/react';
import { useEffect, useRef, useSyncExternalStore } from 'react';

export type ChatSocketStatus = 'connecting' | 'online' | 'reconnecting' | 'off';

export type ChatEvent = Record<string, unknown>;

type Listener = (event: ChatEvent) => void;

function csrfToken(): string {
    return (
        document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')
            ?.content ?? ''
    );
}

function resolveWsUrl(base: string): string {
    if (/^wss?:\/\//.test(base)) {
        return base;
    }
    const scheme = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${scheme}//${window.location.host}${base.startsWith('/') ? base : `/${base}`}`;
}

/**
 * One live link per tab to the Go chat container, shared by every page:
 * chat events (`{t: 'message', …}`), presence of watched users and the
 * connection status. Started once by <ChatLive> with the signed-in user's
 * socket URL; reconnects with backoff and emits `{t: 'resync'}` after every
 * reconnect so pages can refetch what they missed.
 */
class ChatLiveStore {
    private wsUrl: string | null = null;
    private userId: number | null = null;
    private socket: WebSocket | null = null;
    private timer: ReturnType<typeof setTimeout> | undefined;
    private watchTimer: ReturnType<typeof setTimeout> | undefined;
    private attempts = 0;
    private everOnline = false;
    private generation = 0;
    private status: ChatSocketStatus = 'off';
    private listeners = new Set<Listener>();
    private statusListeners = new Set<() => void>();
    private presenceListeners = new Set<() => void>();
    private online = new Set<number>();
    private watched = new Map<number, number>();
    private presenceVersion = 0;

    /** Conversation open on the chat page (no popup for its messages). */
    activeConversation: number | null = null;

    me(): number | null {
        return this.userId;
    }

    /** Connects for user (or disconnects when url/user is null). */
    start(wsUrl: string | null, userId: number | null): void {
        if (wsUrl === this.wsUrl && userId === this.userId) {
            return;
        }
        this.stop();
        this.wsUrl = wsUrl;
        this.userId = userId;
        if (wsUrl && userId) {
            this.setStatus('connecting');
            void this.connect(this.generation);
        }
    }

    private stop(): void {
        this.generation += 1;
        clearTimeout(this.timer);
        const socket = this.socket;
        this.socket = null;
        socket?.close();
        this.attempts = 0;
        this.everOnline = false;
        this.online.clear();
        this.bumpPresence();
        this.setStatus('off');
    }

    private schedule(generation: number): void {
        if (generation !== this.generation) {
            return;
        }
        this.attempts += 1;
        this.setStatus('reconnecting');
        this.timer = setTimeout(
            () => void this.connect(generation),
            Math.min(1000 * 2 ** Math.min(this.attempts, 4), 15000),
        );
    }

    private async connect(generation: number): Promise<void> {
        let token: string;
        try {
            const res = await fetch('/chat/token', {
                method: 'POST',
                credentials: 'same-origin',
                headers: {
                    Accept: 'application/json',
                    'X-CSRF-TOKEN': csrfToken(),
                    'X-Requested-With': 'XMLHttpRequest',
                },
            });
            if (generation !== this.generation) {
                return;
            }
            if (res.status === 503 || res.status === 401) {
                this.setStatus('off');
                return;
            }
            if (!res.ok) {
                throw new Error(String(res.status));
            }
            token = (await res.json()).token;
        } catch {
            this.schedule(generation);
            return;
        }
        if (generation !== this.generation || !this.wsUrl) {
            return;
        }
        const ws = new WebSocket(
            `${resolveWsUrl(this.wsUrl)}?token=${encodeURIComponent(token)}`,
        );
        this.socket = ws;
        ws.onopen = () => {
            if (generation !== this.generation) {
                return;
            }
            this.attempts = 0;
            this.setStatus('online');
            this.sendWatch();
            if (this.everOnline) {
                this.emit({ t: 'resync' });
            }
            this.everOnline = true;
        };
        ws.onmessage = (event: MessageEvent<string>) => {
            try {
                const msg = JSON.parse(event.data);
                if (msg && typeof msg === 'object') {
                    this.handle(msg as ChatEvent);
                }
            } catch {
                // Ignore malformed frames.
            }
        };
        ws.onclose = () => {
            if (this.socket === ws) {
                this.socket = null;
                this.online.clear();
                this.bumpPresence();
                this.schedule(generation);
            }
        };
    }

    private handle(msg: ChatEvent): void {
        if (msg.t === 'hello') {
            return;
        }
        if (msg.t === 'presence_state') {
            this.online = new Set(
                (Array.isArray(msg.online) ? msg.online : []).map(Number),
            );
            this.bumpPresence();
            return;
        }
        if (msg.t === 'presence') {
            const user = Number(msg.user);
            if (msg.online) {
                this.online.add(user);
            } else {
                this.online.delete(user);
            }
            this.bumpPresence();
            return;
        }
        this.emit(msg);
    }

    private emit(event: ChatEvent): void {
        this.listeners.forEach((listener) => listener(event));
    }

    private setStatus(status: ChatSocketStatus): void {
        if (this.status !== status) {
            this.status = status;
            this.statusListeners.forEach((listener) => listener());
        }
    }

    private bumpPresence(): void {
        this.presenceVersion += 1;
        this.presenceListeners.forEach((listener) => listener());
    }

    /** Sends the watch list once per tick, however many avatars mount. */
    private queueWatch(): void {
        clearTimeout(this.watchTimer);
        this.watchTimer = setTimeout(() => this.sendWatch(), 50);
    }

    private sendWatch(): void {
        if (this.socket?.readyState === WebSocket.OPEN) {
            this.socket.send(
                JSON.stringify({ t: 'watch', users: [...this.watched.keys()] }),
            );
        }
    }

    watch(userId: number): () => void {
        const count = this.watched.get(userId) ?? 0;
        this.watched.set(userId, count + 1);
        if (count === 0) {
            this.queueWatch();
        }
        return () => {
            const left = (this.watched.get(userId) ?? 1) - 1;
            if (left <= 0) {
                this.watched.delete(userId);
                this.queueWatch();
            } else {
                this.watched.set(userId, left);
            }
        };
    }

    subscribe = (listener: Listener): (() => void) => {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    };

    subscribeStatus = (listener: () => void): (() => void) => {
        this.statusListeners.add(listener);
        return () => this.statusListeners.delete(listener);
    };

    subscribePresence = (listener: () => void): (() => void) => {
        this.presenceListeners.add(listener);
        return () => this.presenceListeners.delete(listener);
    };

    getStatus = (): ChatSocketStatus => this.status;

    getPresenceVersion = (): number => this.presenceVersion;

    isOnline(userId: number): boolean {
        return this.status === 'online' && this.online.has(userId);
    }
}

export const chatLive = new ChatLiveStore();

const serverStatus = (): ChatSocketStatus => 'off';
const serverVersion = (): number => 0;

/** Id of the signed-in account (null for guests). */
export function useMyUserId(): number | null {
    const { auth } = usePage<{ auth?: { user?: { id?: number } | null } }>()
        .props;
    return auth?.user?.id ?? null;
}

/** Connection status of the shared chat socket. */
export function useChatLiveStatus(): ChatSocketStatus {
    return useSyncExternalStore(
        chatLive.subscribeStatus,
        chatLive.getStatus,
        serverStatus,
    );
}

/** Calls handler for every chat event (messages, resync) on this tab. */
export function useChatEvents(handler: (event: ChatEvent) => void): void {
    const ref = useRef(handler);
    useEffect(() => {
        ref.current = handler;
    }, [handler]);
    useEffect(() => chatLive.subscribe((event) => ref.current(event)), []);
}

/**
 * Whether the account is connected right now. Watches the user on the chat
 * socket while mounted; false for guests, seats without an account and when
 * the chat service is unavailable.
 */
export function useUserOnline(userId: number | null | undefined): boolean {
    const id = userId && userId > 0 ? userId : null;
    useEffect(() => (id ? chatLive.watch(id) : undefined), [id]);
    useSyncExternalStore(
        chatLive.subscribePresence,
        chatLive.getPresenceVersion,
        serverVersion,
    );
    const status = useChatLiveStatus();
    return id !== null && status === 'online' && chatLive.isOnline(id);
}

/**
 * Chat page binding to the shared socket: forwards events and calls
 * `onResync` after every reconnect. Returns 'off' when live chat is off.
 */
export function useChatSocket(
    wsUrl: string | null,
    handlers: {
        onEvent: (event: ChatEvent) => void;
        onResync: () => void;
    },
): ChatSocketStatus {
    const handlersRef = useRef(handlers);
    useEffect(() => {
        handlersRef.current = handlers;
    }, [handlers]);
    useChatEvents((event) => {
        if (!wsUrl) {
            return;
        }
        if (event.t === 'resync') {
            handlersRef.current.onResync();
        } else {
            handlersRef.current.onEvent(event);
        }
    });
    const status = useChatLiveStatus();
    return wsUrl ? status : 'off';
}
