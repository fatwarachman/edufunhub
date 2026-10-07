import { chatLive } from '@/hooks/use-chat-socket';
import { useTranslations } from '@/hooks/use-translations';
import { type SharedData } from '@/types';
import { router, usePage } from '@inertiajs/react';
import {
    Bell,
    CheckCheck,
    Coins,
    GraduationCap,
    Medal,
    Megaphone,
    MessageCircle,
    Package,
    TrendingUp,
    X,
    type LucideIcon,
} from 'lucide-react';
import {
    useCallback,
    useEffect,
    useId,
    useRef,
    useState,
    type CSSProperties,
} from 'react';

export interface PlayerNotice {
    id: string;
    kind: 'points' | 'level' | 'item' | 'teacher' | 'admin' | 'chat' | 'badge';
    title: string;
    body: string;
    url: string | null;
    read: boolean;
    /** Unread messages folded into one chat notification. */
    count?: number;
    created_at: string | null;
}

interface Feed {
    unread: number;
    items: PlayerNotice[];
}

/** How often the bell asks for new notifications while the tab is visible. */
const POLL_MS = 30_000;
/** How long a new-notification toast stays on screen. */
const TOAST_MS = 6_000;

const KIND_ICON: Record<PlayerNotice['kind'], LucideIcon> = {
    points: Coins,
    level: TrendingUp,
    item: Package,
    teacher: GraduationCap,
    admin: Megaphone,
    chat: MessageCircle,
    badge: Medal,
};

const KIND_TONE: Record<PlayerNotice['kind'], string> = {
    points: '#ffd93d',
    level: '#5ad1a6',
    item: '#ff9ecf',
    teacher: '#8fb8ff',
    admin: '#ff8a5c',
    chat: '#7dd3fc',
    badge: '#c4a7ff',
};

function csrfToken(): string {
    return (
        document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')
            ?.content ?? ''
    );
}

async function post(url: string): Promise<void> {
    await fetch(url, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
            Accept: 'application/json',
            'X-CSRF-TOKEN': csrfToken(),
            'X-Requested-With': 'XMLHttpRequest',
        },
    });
}

function NoticeIcon({ kind }: { kind: PlayerNotice['kind'] }) {
    const Icon = KIND_ICON[kind] ?? Megaphone;
    return (
        <span
            className="edu-notice-icon"
            style={{ background: KIND_TONE[kind] ?? KIND_TONE.admin }}
        >
            <Icon aria-hidden="true" />
        </span>
    );
}

/**
 * Bell in the site navigation: unread badge, dropdown list, and a toast when
 * a new notification arrives (system events or admin messages). Polls while
 * the tab is visible; closes on outside click, Escape and navigation.
 */
export function NotificationBell() {
    const { t, i18n } = useTranslations();
    const { props, url } = usePage<SharedData>();
    const initialUnread = Number(props.unreadNotifications ?? 0);
    const [open, setOpen] = useState(false);
    const [feed, setFeed] = useState<Feed>({
        unread: initialUnread,
        items: [],
    });
    const [loaded, setLoaded] = useState(false);
    const [toast, setToast] = useState<PlayerNotice | null>(null);
    const [now, setNow] = useState(0);
    const seen = useRef<Set<string> | null>(null);
    const root = useRef<HTMLDivElement | null>(null);
    const trigger = useRef<HTMLButtonElement | null>(null);
    const panelId = useId();
    const [lastUrl, setLastUrl] = useState(url);

    const [lastUnread, setLastUnread] = useState(initialUnread);

    if (lastUrl !== url) {
        setLastUrl(url);
        setOpen(false);
    }
    if (lastUnread !== initialUnread) {
        setLastUnread(initialUnread);
        setFeed((current) => ({ ...current, unread: initialUnread }));
    }

    const load = useCallback(async () => {
        try {
            const response = await fetch('/notifications', {
                credentials: 'same-origin',
                headers: {
                    Accept: 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                },
            });
            if (!response.ok) {
                return;
            }
            const next = (await response.json()) as Feed;
            if (seen.current !== null) {
                // Live chat messages already pop up via <ChatLive>.
                const chatIsLive = chatLive.getStatus() === 'online';
                const fresh = next.items.find(
                    (item) =>
                        !item.read &&
                        !seen.current?.has(item.id) &&
                        !(chatIsLive && item.kind === 'chat'),
                );
                if (fresh) {
                    setToast(fresh);
                }
            }
            seen.current = new Set(next.items.map((item) => item.id));
            setNow(Date.now());
            setFeed(next);
            setLoaded(true);
        } catch {
            // Offline or navigating away: the next poll tries again.
        }
    }, []);

    useEffect(() => {
        load();
        const timer = window.setInterval(() => {
            if (document.visibilityState === 'visible') {
                load();
            }
        }, POLL_MS);
        const onVisible = () => {
            if (document.visibilityState === 'visible') {
                load();
            }
        };
        document.addEventListener('visibilitychange', onVisible);
        return () => {
            window.clearInterval(timer);
            document.removeEventListener('visibilitychange', onVisible);
        };
    }, [load]);

    useEffect(() => {
        if (initialUnread > 0) {
            load();
        }
    }, [initialUnread, load]);

    const [toastHeld, setToastHeld] = useState(false);

    useEffect(() => {
        if (!toast || toastHeld) {
            return;
        }
        const timer = window.setTimeout(() => setToast(null), TOAST_MS);
        return () => window.clearTimeout(timer);
    }, [toast, toastHeld]);

    useEffect(() => {
        if (!open) {
            return;
        }
        const onPointer = (event: PointerEvent) => {
            if (!root.current?.contains(event.target as Node)) {
                setOpen(false);
            }
        };
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setOpen(false);
                trigger.current?.focus();
            }
        };
        document.addEventListener('pointerdown', onPointer);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('pointerdown', onPointer);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);

    const markRead = (notice: PlayerNotice) => {
        if (!notice.read) {
            setFeed((current) => ({
                unread: Math.max(0, current.unread - 1),
                items: current.items.map((item) =>
                    item.id === notice.id ? { ...item, read: true } : item,
                ),
            }));
            post(`/notifications/${notice.id}/read`);
        }
    };

    const openNotice = (notice: PlayerNotice) => {
        markRead(notice);
        setOpen(false);
        setToast(null);
        if (!notice.url) {
            return;
        }
        if (notice.url.startsWith('/')) {
            router.visit(notice.url);
        } else {
            window.open(notice.url, '_blank', 'noopener,noreferrer');
        }
    };

    const readAll = () => {
        setFeed((current) => ({
            unread: 0,
            items: current.items.map((item) => ({ ...item, read: true })),
        }));
        post('/notifications/read');
    };

    const when = (iso: string | null) => {
        if (!iso || now === 0) {
            return '';
        }
        const minutes = Math.round((Date.parse(iso) - now) / 60_000);
        if (Math.abs(minutes) < 1) {
            return t('notifications.justNow');
        }
        const format = new Intl.RelativeTimeFormat(i18n.language, {
            numeric: 'auto',
        });
        if (Math.abs(minutes) < 60) {
            return format.format(minutes, 'minute');
        }
        if (Math.abs(minutes) < 60 * 24) {
            return format.format(Math.round(minutes / 60), 'hour');
        }
        return format.format(Math.round(minutes / (60 * 24)), 'day');
    };

    const unread = feed.unread;
    const label =
        unread > 0
            ? t('notifications.labelUnread', { count: unread })
            : t('notifications.label');

    return (
        <div className="edu-notice" ref={root} data-testid="notification-bell">
            <button
                ref={trigger}
                type="button"
                className="edu-nav-btn edu-nav-btn--icon"
                aria-haspopup="true"
                aria-expanded={open}
                aria-controls={panelId}
                aria-label={label}
                data-tip={open ? undefined : label}
                onClick={() => {
                    setOpen((value) => !value);
                    if (!open) {
                        load();
                    }
                }}
                data-testid="notification-trigger"
            >
                <Bell aria-hidden="true" />
                {unread > 0 && (
                    <span
                        className="edu-notice-badge"
                        data-testid="notification-badge"
                    >
                        {unread > 9 ? '9+' : unread}
                    </span>
                )}
            </button>
            <div
                id={panelId}
                className="edu-notice-panel"
                hidden={!open}
                data-testid="notification-panel"
            >
                <div className="edu-notice-head">
                    <h2>{t('notifications.title')}</h2>
                    <button
                        type="button"
                        className="edu-notice-readall"
                        onClick={readAll}
                        disabled={unread === 0}
                        data-testid="notification-read-all"
                    >
                        <CheckCheck aria-hidden="true" />
                        {t('notifications.readAll')}
                    </button>
                </div>
                {feed.items.length === 0 ? (
                    <p className="edu-notice-empty">
                        {loaded
                            ? t('notifications.empty')
                            : t('notifications.loading')}
                    </p>
                ) : (
                    <ul>
                        {feed.items.map((notice) => (
                            <li key={notice.id}>
                                <button
                                    type="button"
                                    className="edu-notice-item"
                                    data-unread={!notice.read}
                                    onClick={() => openNotice(notice)}
                                    data-testid={`notification-${notice.id}`}
                                >
                                    <NoticeIcon kind={notice.kind} />
                                    <span className="edu-notice-text">
                                        <span className="edu-notice-title">
                                            {notice.title}
                                            {(notice.count ?? 1) > 1 && (
                                                <span className="edu-notice-count">
                                                    {t(
                                                        'notifications.messages',
                                                        {
                                                            count: notice.count,
                                                        },
                                                    )}
                                                </span>
                                            )}
                                        </span>
                                        <span className="edu-notice-body">
                                            {notice.body}
                                        </span>
                                        <span className="edu-notice-time">
                                            {when(notice.created_at)}
                                        </span>
                                    </span>
                                    {!notice.read && (
                                        <span
                                            className="edu-notice-dot"
                                            aria-label={t('notifications.new')}
                                        />
                                    )}
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
            {toast && !open && (
                <div
                    key={toast.id}
                    className="edu-notice-toast"
                    role="status"
                    aria-live="polite"
                    data-testid="notification-toast"
                    onPointerEnter={() => setToastHeld(true)}
                    onPointerLeave={() => setToastHeld(false)}
                    onFocus={() => setToastHeld(true)}
                    onBlur={() => setToastHeld(false)}
                    style={
                        {
                            '--notice-tone':
                                KIND_TONE[toast.kind] ?? KIND_TONE.admin,
                        } as CSSProperties
                    }
                >
                    <button
                        type="button"
                        className="edu-notice-toast-main"
                        onClick={() => openNotice(toast)}
                    >
                        <NoticeIcon kind={toast.kind} />
                        <span className="edu-notice-text">
                            <span className="edu-notice-title">
                                {toast.title}
                            </span>
                            <span className="edu-notice-body">
                                {toast.body}
                            </span>
                        </span>
                    </button>
                    <button
                        type="button"
                        className="edu-notice-toast-close"
                        aria-label={t('notifications.close')}
                        onClick={() => setToast(null)}
                    >
                        <X aria-hidden="true" />
                    </button>
                </div>
            )}
        </div>
    );
}
