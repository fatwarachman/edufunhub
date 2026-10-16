import { useGameCatalog } from '@/components/classroom/classroom-ui';
import {
    type ChatEvent,
    chatLive,
    useChatEvents,
} from '@/hooks/use-chat-socket';
import { useClassroomWorld } from '@/hooks/use-classroom-world';
import { useTranslations } from '@/hooks/use-translations';
import { useVisibleInterval } from '@/hooks/use-visible-interval';
import {
    type Booth,
    CHAT_MAX_RUNES,
    clampChat,
    EMOTES,
    type HudPayload,
    type InboxSender,
    NEAR_RADIUS,
    parseInbox,
    SAY_RADIUS,
    type SayMessage,
    sayPartner,
    teacherSeat,
    type WorldProps,
} from '@/lib/classroom-world/protocol';
import { ClassroomScene, type NearbyActor } from '@/lib/classroom-world/scene';
import { cn } from '@/lib/utils';
import {
    ArrowBigUp,
    Ban,
    DoorOpen,
    Gamepad2,
    GraduationCap,
    Hand,
    Inbox,
    LogOut,
    type LucideIcon,
    Maximize2,
    MessageCircle,
    MessagesSquare,
    Minimize2,
    PartyPopper,
    Send,
    Star,
    Trophy,
    Users,
    WifiOff,
    X,
    ZoomIn,
    ZoomOut,
} from 'lucide-react';
import {
    type FormEvent,
    type PointerEvent as ReactPointerEvent,
    useCallback,
    useEffect,
    useRef,
    useState,
} from 'react';
import '../../../css/classroom-world.css';

const EMOTE_ICONS = { wave: Hand, jump: ArrowBigUp, clap: PartyPopper };

const chip =
    'inline-flex min-h-9 items-center gap-1.5 rounded-full border-2 border-[#1f2a44] bg-white/95 px-3 text-xs font-black text-[#1f2a44] shadow-[2px_2px_0px_#1f2a44] tabular-nums';
const roundBtn =
    'grid size-11 place-items-center rounded-full border-2 border-[#1f2a44] bg-white text-[#1f2a44] shadow-[2px_2px_0px_#1f2a44] transition-colors hover:bg-[#FFF176] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none disabled:opacity-50';

interface Props {
    classroomId: number;
    classroomName: string;
    world: WorldProps;
    onExit: () => void;
    /** Students only; the teacher leaves through `onExit`. */
    onLeaveClass?: () => void;
}

/** Codes the server answers to a `say`; shown inside the DM panel. */
const SAY_ERRORS = new Set(['too_far', 'no_target', 'chat_rate']);
/** A `say` error arrives within this window after sending. */
const SAY_ERROR_MS = 3000;
const NEAR_POLL_MS = 250;

function sameNearby(a: NearbyActor | null, b: NearbyActor | null): boolean {
    return (
        a === b ||
        (a !== null &&
            b !== null &&
            a.id === b.id &&
            a.name === b.name &&
            a.teacher === b.teacher)
    );
}

function TeacherTag({ label }: { label: string }) {
    return (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full border-2 border-[#1f2a44] bg-[#6c5ce7] px-2 py-0.5 text-[11px] font-black text-white">
            <GraduationCap className="size-3" aria-hidden="true" />
            {label}
        </span>
    );
}

function supportsWebgl(): boolean {
    try {
        const canvas = document.createElement('canvas');
        return Boolean(
            canvas.getContext('webgl2') ?? canvas.getContext('webgl'),
        );
    } catch {
        return false;
    }
}

/** Joystick knob travel in px. */
const STICK = 44;

export function ClassroomWorld({
    classroomId,
    classroomName,
    world,
    onExit,
    onLeaveClass,
}: Props) {
    const { t, i18n } = useTranslations();
    const catalog = useGameCatalog();
    const stageRef = useRef<HTMLDivElement>(null);
    const hostRef = useRef<HTMLDivElement>(null);
    const overlayRef = useRef<HTMLDivElement>(null);
    const sceneRef = useRef<ClassroomScene | null>(null);
    const [booth, setBooth] = useState(-1);
    const [hud, setHud] = useState<HudPayload>(world.hud);
    const [panel, setPanel] = useState<
        'board' | 'chat' | 'dm' | 'inbox' | null
    >(null);
    const [draft, setDraft] = useState('');
    const [dmDraft, setDmDraft] = useState('');
    /** Partner of the open direct-message panel. */
    const [dm, setDm] = useState<NearbyActor | null>(null);
    const [near, setNear] = useState<NearbyActor | null>(null);
    /** The open DM partner is out of `say` range (or left the room). */
    const [dmFar, setDmFar] = useState(false);
    /** Session-only DM threads keyed by partner user id. */
    const [threads, setThreads] = useState<Record<number, SayMessage[]>>({});
    const threadsRef = useRef(threads);
    useEffect(() => {
        threadsRef.current = threads;
    }, [threads]);
    const [dmError, setDmError] = useState<string | null>(null);
    /** Unread DMs per sender while their panel is closed (head chip). */
    const [unread, setUnread] = useState<Record<number, number>>({});
    /** Unanswered DMs from people of this classroom (server list). */
    const [inbox, setInbox] = useState<InboxSender[]>([]);
    /** Draft replies in the waiting-chats list, keyed by sender. */
    const [replyDrafts, setReplyDrafts] = useState<Record<number, string>>({});
    const [replyBusy, setReplyBusy] = useState(0);
    const [replyError, setReplyError] = useState<number | null>(null);
    const refreshInboxSoonRef = useRef<() => void>(() => {});
    const clearUnreadRef = useRef<(id: number) => void>(() => {});
    const lastSayAt = useRef(0);
    /** Partner id of the open DM panel (read by socket handlers). */
    const openDmId = useRef(0);
    const isTeacher = world.role === 'teacher';
    const isObserver = world.role === 'observer';
    const teacherLabel = t('classroom.world.teacherBadge');
    const [full, setFull] = useState(false);
    const [webgl] = useState(supportsWebgl);
    const [knob, setKnob] = useState<{ x: number; y: number } | null>(null);
    const conn = useClassroomWorld(
        world.ws_url,
        world.token_url,
        i18n.language,
    );
    const { welcome, sendInput, events, parseState } = conn;

    const boothTitle = useCallback(
        (b: Booth) => ({
            title: catalog.title(b.game),
            accent: catalog.accent(b.game),
            icon: iconSvg(catalog.icon(b.game)),
        }),
        [catalog],
    );

    // Build the 3D scene once Go sent the geometry.
    useEffect(() => {
        const host = hostRef.current;
        const overlay = overlayRef.current;
        if (!welcome || !host || !overlay || !webgl) {
            return;
        }
        const scene = new ClassroomScene(
            host,
            overlay,
            welcome,
            world.me.id,
            boothTitle,
            classroomName,
        );
        sceneRef.current = scene;
        scene.onBooth = (i) => setBooth((prev) => (prev === i ? prev : i));
        scene.onUnreadTap = (id) =>
            openInboxRef.current(id === world.me.id ? undefined : id);
        const seat = teacherSeat(welcome, world.teacher?.id ?? 0);
        scene.setTeacher(
            seat && world.teacher
                ? {
                      id: seat.id,
                      name: world.teacher.name,
                      character: world.teacher.character ?? null,
                      x: seat.x,
                      z: seat.z,
                  }
                : null,
            teacherLabel,
        );
        return () => {
            scene.dispose();
            sceneRef.current = null;
        };
    }, [
        welcome,
        webgl,
        world.me.id,
        world.teacher,
        teacherLabel,
        boothTitle,
        classroomName,
    ]);

    // Who stands close enough to chat with (static teacher included).
    useEffect(() => {
        if (!welcome || !webgl) {
            return;
        }
        const timer = window.setInterval(() => {
            const next = sceneRef.current?.nearest(NEAR_RADIUS) ?? null;
            setNear((prev) => (sameNearby(prev, next) ? prev : next));
            const partner = openDmId.current;
            if (partner) {
                const d = sceneRef.current?.distanceTo(partner) ?? null;
                setDmFar(d === null || d > SAY_RADIUS);
            }
        }, NEAR_POLL_MS);
        return () => window.clearInterval(timer);
    }, [welcome, webgl]);

    // Roster can arrive before the scene exists: sync from React state, which
    // also runs right after the scene is (re)built for a new welcome.
    useEffect(() => {
        sceneRef.current?.setRoster(conn.roster);
    }, [conn.roster, welcome]);

    // Unread counts float above each sender's head (hidden while a bubble
    // shows). Re-applied after roster/scene changes so new avatars get it.
    useEffect(() => {
        const scene = sceneRef.current;
        if (!scene) {
            return;
        }
        for (const actor of conn.roster) {
            if (actor.id !== world.me.id) {
                scene.setUnread(actor.id, unread[actor.id] ?? 0);
            }
        }
        if (world.teacher && world.teacher.id !== world.me.id) {
            scene.setUnread(world.teacher.id, unread[world.teacher.id] ?? 0);
        }
        // Above my own head: everything still waiting for my answer (tap
        // opens the list). Only this browser draws it.
        const waiting = Object.values(unread).reduce((a, b) => a + b, 0);
        scene.setUnread(world.me.id, waiting);
    }, [unread, conn.roster, welcome, world.teacher, world.me.id]);

    // While the 3D room is open, direct lines from people of this classroom
    // show as head counts + the waiting list here, not as the global popup.
    useEffect(() => {
        const people = new Set(world.people ?? []);
        chatLive.inClassroomWorld = (userId: number) =>
            people.has(userId) || (sceneRef.current?.hasActor(userId) ?? false);
        return () => {
            chatLive.inClassroomWorld = null;
        };
    }, [world.people]);

    // Replies sent from /chat (or another tab) arrive on the chat socket, not
    // the world socket: show them as a bubble over the sender when that
    // person is in this room (or is the teacher) and add them to the thread.
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
                          created_at?: string | null;
                      }
                    | undefined;
                const conversation = event.conversation as
                    { type?: string } | undefined;
                const from = Number(message?.user_id ?? 0);
                const text =
                    typeof message?.body === 'string'
                        ? clampChat(message.body).trim()
                        : '';
                if (
                    message?.type !== 'text' ||
                    conversation?.type !== 'direct' ||
                    !from ||
                    from === world.me.id ||
                    text === ''
                ) {
                    return;
                }
                if (!sceneRef.current?.hasActor(from)) {
                    // Not standing in the room: it may still be a classmate
                    // writing from elsewhere; the waiting list decides.
                    refreshInboxSoonRef.current();
                    return;
                }
                const at = message.created_at
                    ? Date.parse(message.created_at)
                    : Date.now();
                const name =
                    typeof (event.sender as { name?: unknown } | undefined)
                        ?.name === 'string'
                        ? String((event.sender as { name: string }).name)
                        : '';
                // The world socket already delivered this line when it was
                // said in the room: skip echoes of the same text.
                const thread = threadsRef.current[from] ?? [];
                if (
                    thread.some(
                        (m) =>
                            m.id === from &&
                            m.text === text &&
                            Math.abs(m.at - at) < 15000,
                    )
                ) {
                    return;
                }
                const msg: SayMessage = {
                    t: 'say',
                    id: from,
                    to: world.me.id,
                    name,
                    text,
                    at,
                };
                setThreads((prev) => ({
                    ...prev,
                    [from]: [...(prev[from] ?? []).slice(-49), msg],
                }));
                if (openDmId.current === from) {
                    sceneRef.current?.say(from, text);
                    clearUnreadRef.current(from);
                } else {
                    setUnread((prev) => ({
                        ...prev,
                        [from]: (prev[from] ?? 0) + 1,
                    }));
                    refreshInboxSoonRef.current();
                }
            },
            [world.me.id],
        ),
    );

    // Route socket events straight into the scene (no React re-render per tick).
    useEffect(() => {
        events.current = {
            state: (msg) => sceneRef.current?.setState(parseState(msg)),
            chat: (msg) => sceneRef.current?.chat(msg.id, msg.text),
            say: (msg) => {
                const partner = sayPartner(msg, world.me.id);
                // Own lines and lines in the open conversation: bubble over
                // the speaker. Other incoming lines: only the head count.
                if (msg.id === world.me.id || openDmId.current === msg.id) {
                    sceneRef.current?.say(msg.id, msg.text);
                }
                setThreads((prev) => ({
                    ...prev,
                    [partner]: [...(prev[partner] ?? []).slice(-49), msg],
                }));
                if (msg.id !== world.me.id && openDmId.current !== msg.id) {
                    setUnread((prev) => ({
                        ...prev,
                        [msg.id]: (prev[msg.id] ?? 0) + 1,
                    }));
                    refreshInboxSoonRef.current();
                } else if (msg.id !== world.me.id) {
                    clearUnreadRef.current(msg.id);
                }
            },
            error: (code) => {
                const recent =
                    performance.now() - lastSayAt.current < SAY_ERROR_MS;
                if (recent && SAY_ERRORS.has(code)) {
                    setDmError(code);
                    return true;
                }
                return false;
            },
            emote: (id, e) => sceneRef.current?.emote(id, e),
            enter: (_booth, game) => {
                const url = catalog.url(game);
                if (url) {
                    const target = new URL(url, window.location.origin);
                    target.searchParams.set('classroom', String(classroomId));
                    // Only same-origin game pages.
                    if (target.origin === window.location.origin) {
                        window.location.assign(target.pathname + target.search);
                    }
                }
            },
        };
    }, [events, parseState, catalog, classroomId, world.me.id, world.teacher]);

    // Keyboard movement (desktop): WASD / arrows, Enter opens chat, E enters booth.
    const keys = useRef(new Set<string>());
    const applyKeys = useCallback(() => {
        const k = keys.current;
        const right =
            (k.has('d') || k.has('arrowright') ? 1 : 0) -
            (k.has('a') || k.has('arrowleft') ? 1 : 0);
        const fwd =
            (k.has('w') || k.has('arrowup') ? 1 : 0) -
            (k.has('s') || k.has('arrowdown') ? 1 : 0);
        const dir = sceneRef.current?.setInput(right, fwd);
        if (dir) {
            sendInput(dir.x, dir.z);
        }
    }, [sendInput]);

    useEffect(() => {
        const typing = (e: KeyboardEvent) => {
            const el = e.target as HTMLElement | null;
            return el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA';
        };
        const down = (e: KeyboardEvent) => {
            if (typing(e)) {
                return;
            }
            const key = e.key.toLowerCase();
            if (
                [
                    'w',
                    'a',
                    's',
                    'd',
                    'arrowup',
                    'arrowdown',
                    'arrowleft',
                    'arrowright',
                ].includes(key)
            ) {
                e.preventDefault();
                keys.current.add(key);
                applyKeys();
            } else if (key === 'enter') {
                setPanel('chat');
            }
        };
        const up = (e: KeyboardEvent) => {
            const key = e.key.toLowerCase();
            if (keys.current.delete(key)) {
                applyKeys();
            }
        };
        const blur = () => {
            keys.current.clear();
            applyKeys();
        };
        window.addEventListener('keydown', down);
        window.addEventListener('keyup', up);
        window.addEventListener('blur', blur);
        return () => {
            window.removeEventListener('keydown', down);
            window.removeEventListener('keyup', up);
            window.removeEventListener('blur', blur);
        };
    }, [applyKeys]);

    // Drag the room (rotate camera) with one finger / mouse; pinch or wheel to zoom.
    const pointers = useRef(new Map<number, { x: number; y: number }>());
    const pinch = useRef(0);
    const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    };
    const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
        const prev = pointers.current.get(e.pointerId);
        if (!prev) {
            return;
        }
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pointers.current.size === 2) {
            const [a, b] = [...pointers.current.values()];
            const d = Math.hypot(a.x - b.x, a.y - b.y);
            if (pinch.current) {
                sceneRef.current?.zoom((pinch.current - d) / 200);
            }
            pinch.current = d;
            return;
        }
        sceneRef.current?.rotate(e.clientX - prev.x, e.clientY - prev.y);
    };
    const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
        pointers.current.delete(e.pointerId);
        pinch.current = 0;
    };
    useEffect(() => {
        const host = hostRef.current;
        if (!host) {
            return;
        }
        const wheel = (e: WheelEvent) => {
            e.preventDefault();
            sceneRef.current?.zoom(Math.sign(e.deltaY) * 0.1);
        };
        host.addEventListener('wheel', wheel, { passive: false });
        return () => host.removeEventListener('wheel', wheel);
    }, []);

    // Virtual joystick (touch).
    const stickOrigin = useRef<{ x: number; y: number; id: number } | null>(
        null,
    );
    const stickMove = (e: ReactPointerEvent<HTMLDivElement>) => {
        const o = stickOrigin.current;
        if (!o || o.id !== e.pointerId) {
            return;
        }
        let dx = e.clientX - o.x;
        let dy = e.clientY - o.y;
        const len = Math.hypot(dx, dy);
        if (len > STICK) {
            dx = (dx / len) * STICK;
            dy = (dy / len) * STICK;
        }
        setKnob({ x: dx, y: dy });
        const dir = sceneRef.current?.setInput(dx / STICK, -dy / STICK);
        if (dir) {
            sendInput(dir.x, dir.z);
        }
    };
    const stickEnd = () => {
        stickOrigin.current = null;
        setKnob(null);
        const dir = sceneRef.current?.setInput(0, 0);
        if (dir) {
            sendInput(0, 0);
        }
    };

    // HUD refresh: points and leaderboard change when classmates finish games.
    useVisibleInterval(async () => {
        try {
            const res = await fetch(world.hud_url, {
                headers: {
                    Accept: 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                },
                credentials: 'same-origin',
            });
            if (res.status === 403 || res.status === 404) {
                return false;
            }
            if (res.ok) {
                setHud((await res.json()) as HudPayload);
            }
        } catch {
            /* keep the last numbers */
        }
    }, 20000);

    // Waiting chats: the server is the source of truth (survives reloads and
    // covers messages sent while this tab was hidden). Live chat events only
    // bump the counts in between.
    const applyInbox = useCallback((data: unknown) => {
        const rows = parseInbox(data);
        setInbox(rows);
        setUnread(() => {
            const next: Record<number, number> = {};
            for (const row of rows) {
                if (row.user_id !== openDmId.current) {
                    next[row.user_id] = row.unread;
                }
            }
            return next;
        });
    }, []);
    const loadInbox = useCallback(async (): Promise<boolean> => {
        if (!world.chat_url) {
            return false;
        }
        try {
            const res = await fetch(world.chat_url, {
                headers: {
                    Accept: 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                },
                credentials: 'same-origin',
            });
            if (res.status === 403 || res.status === 404) {
                return false;
            }
            if (res.ok) {
                applyInbox(await res.json());
            }
        } catch {
            /* keep the last list */
        }
        return true;
    }, [world.chat_url, applyInbox]);
    useVisibleInterval(loadInbox, 8000, Boolean(world.chat_url));
    // First load right away (the interval waits one period), and again
    // whenever the tab comes back to the front.
    useEffect(() => {
        const first = window.setTimeout(() => void loadInbox(), 0);
        const onVisible = () => {
            if (document.visibilityState === 'visible') {
                void loadInbox();
            }
        };
        document.addEventListener('visibilitychange', onVisible);
        return () => {
            window.clearTimeout(first);
            document.removeEventListener('visibilitychange', onVisible);
        };
    }, [loadInbox]);
    const inboxTimer = useRef<number | null>(null);
    /** Refetch soon after a live message (debounced). */
    const refreshInboxSoon = useCallback(() => {
        if (inboxTimer.current !== null) {
            window.clearTimeout(inboxTimer.current);
        }
        inboxTimer.current = window.setTimeout(() => {
            inboxTimer.current = null;
            void loadInbox();
        }, 700);
    }, [loadInbox]);
    useEffect(
        () => () => {
            if (inboxTimer.current !== null) {
                window.clearTimeout(inboxTimer.current);
            }
        },
        [],
    );

    const openInbox = (focus?: number) => {
        setReplyError(null);
        setPanel('inbox');
        if (focus) {
            window.setTimeout(() => {
                document
                    .querySelector<HTMLInputElement>(
                        `[data-testid="classroom-world-inbox-input-${focus}"]`,
                    )
                    ?.focus();
            }, 50);
        }
        void loadInbox();
    };
    const openInboxRef = useRef(openInbox);
    useEffect(() => {
        openInboxRef.current = openInbox;
        refreshInboxSoonRef.current = refreshInboxSoon;
        clearUnreadRef.current = clearUnread;
    });

    const submitReply = async (e: FormEvent, sender: InboxSender) => {
        e.preventDefault();
        const text = clampChat(replyDrafts[sender.user_id] ?? '').trim();
        if (!text || !world.chat_url || replyBusy) {
            return;
        }
        setReplyBusy(sender.user_id);
        setReplyError(null);
        const data = await chatPost(`${world.chat_url}/reply`, {
            user_id: sender.user_id,
            text,
        });
        setReplyBusy(0);
        if (!data) {
            setReplyError(sender.user_id);
            return;
        }
        setReplyDrafts((prev) => ({ ...prev, [sender.user_id]: '' }));
        const sent = (data as { message?: { at?: unknown } }).message?.at;
        const at = typeof sent === 'string' ? Date.parse(sent) || 0 : 0;
        const mine: SayMessage = {
            t: 'say',
            id: world.me.id,
            to: sender.user_id,
            name: world.me.name,
            text,
            at,
        };
        setThreads((prev) => ({
            ...prev,
            [sender.user_id]: [
                ...(prev[sender.user_id] ?? []).slice(-49),
                mine,
            ],
        }));
        sceneRef.current?.say(world.me.id, text);
        applyInbox((data as { inbox?: unknown }).inbox);
    };

    const toggleFull = async () => {
        const stage = stageRef.current;
        if (!stage) {
            return;
        }
        try {
            if (document.fullscreenElement) {
                await document.exitFullscreen();
                setFull(false);
            } else {
                await stage.requestFullscreen();
                setFull(true);
            }
        } catch {
            setFull(false);
        }
    };

    const submitChat = (e: FormEvent) => {
        e.preventDefault();
        if (isObserver) {
            return;
        }
        const text = clampChat(draft).trim();
        if (!text) {
            return;
        }
        if (conn.sendChat(text)) {
            setDraft('');
        }
    };

    /** Drops the local count for `id` and tells the server it was read. */
    const clearUnread = (id: number) => {
        setUnread((prev) => {
            if (!prev[id]) {
                return prev;
            }
            const next = { ...prev };
            delete next[id];
            return next;
        });
        setInbox((prev) => prev.filter((s) => s.user_id !== id));
        if (world.chat_url) {
            void chatPost(`${world.chat_url}/read`, { user_id: id }).then(
                (data) => data && applyInbox(data),
            );
        }
    };

    const openDm = (partner: NearbyActor) => {
        setDm(partner);
        setDmError(null);
        setDmFar(false);
        setDmDraft('');
        clearUnread(partner.id);
        setPanel('dm');
    };

    const submitDm = (e: FormEvent) => {
        e.preventDefault();
        if (isObserver || !dm) {
            return;
        }
        const text = clampChat(dmDraft).trim();
        if (!text) {
            return;
        }
        lastSayAt.current = performance.now();
        setDmError(null);
        if (conn.sendSay(dm.id, text)) {
            setDmDraft('');
        }
    };

    const activeBooth =
        isTeacher || isObserver
            ? null
            : (welcome?.booths.find((b) => b.i === booth) ?? null);
    const activeLimit =
        !isTeacher && !isObserver && activeBooth
            ? (hud.limits?.[activeBooth.game] ?? null)
            : null;
    const dmOpen = panel === 'dm' && dm !== null;
    useEffect(() => {
        openDmId.current = dmOpen && dm ? dm.id : 0;
    }, [dmOpen, dm]);
    const dmThread = dm ? (threads[dm.id] ?? []) : [];
    const chatOpen = panel === 'chat' || panel === 'dm' || panel === 'inbox';
    const inboxTotal = inbox.reduce((sum, s) => sum + s.unread, 0);
    const showNear = near !== null && !chatOpen;
    const offline = conn.status === 'offline' || conn.status === 'reconnecting';

    if (conn.kicked) {
        return (
            <div
                className="auth-card flex flex-col items-center gap-3 !p-6 text-center"
                data-testid="classroom-world-kicked"
            >
                <LogOut className="size-8" aria-hidden="true" />
                <p className="text-lg font-bold">
                    {conn.kicked === 'ended'
                        ? t('classroom.world.kickedEnded')
                        : t('classroom.world.kickedRemoved')}
                </p>
                <button
                    type="button"
                    onClick={() => window.location.reload()}
                    className="inline-flex min-h-11 items-center gap-2 rounded-xl border-2 border-[#1f2a44] bg-white px-4 text-sm font-bold"
                >
                    {t('classroom.world.reload')}
                </button>
            </div>
        );
    }

    return (
        <div
            ref={stageRef}
            className="cw-stage min-h-[420px] w-full flex-1"
            data-testid="classroom-world"
        >
            <div
                ref={hostRef}
                className="absolute inset-0"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                role="application"
                aria-label={t('classroom.world.canvasLabel')}
            />
            <div ref={overlayRef} className="cw-overlay" aria-hidden="true" />

            {(!welcome || !webgl) && (
                <div className="absolute inset-0 grid place-items-center bg-[#dff1ff]/90 p-6 text-center">
                    <p
                        className="flex items-center gap-2 font-bold text-[#1f2a44]"
                        role="status"
                    >
                        {!webgl ? (
                            t('classroom.world.noWebgl')
                        ) : conn.status === 'grade_required' ? (
                            t('classroom.world.gradeRequired')
                        ) : (
                            <>
                                <span className="size-3 animate-pulse rounded-full bg-[#00c9a7]" />
                                {t('classroom.world.connecting')}
                            </>
                        )}
                    </p>
                </div>
            )}

            {/* Info bar */}
            <div className="pointer-events-none absolute inset-x-2 top-2 flex flex-wrap items-start justify-between gap-2">
                <div
                    className="pointer-events-auto flex flex-wrap items-center gap-1.5"
                    data-testid="classroom-world-hud"
                >
                    <span className={chip} title={t('classroom.world.points')}>
                        <Star
                            className="size-3.5 text-[#f5a623]"
                            aria-hidden="true"
                        />
                        <span className="sr-only">
                            {t('classroom.world.points')}
                        </span>
                        <span data-testid="classroom-world-points">
                            {hud.me.points}
                        </span>
                    </span>
                    <span className={chip} title={t('classroom.world.plays')}>
                        <Gamepad2 className="size-3.5" aria-hidden="true" />
                        <span className="sr-only">
                            {t('classroom.world.plays')}
                        </span>
                        <span data-testid="classroom-world-plays">
                            {hud.me.plays}
                        </span>
                    </span>
                    <span className={chip} title={t('classroom.world.rank')}>
                        <Trophy
                            className="size-3.5 text-[#b45309]"
                            aria-hidden="true"
                        />
                        <span className="sr-only">
                            {t('classroom.world.rank')}
                        </span>
                        {hud.me.rank ? `#${hud.me.rank}` : '–'}
                    </span>
                    <span className={chip} title={t('classroom.world.online')}>
                        <Users className="size-3.5" aria-hidden="true" />
                        <span className="sr-only">
                            {t('classroom.world.online')}
                        </span>
                        {conn.roster.length}
                    </span>
                    {offline && (
                        <span
                            className={cn(chip, 'bg-[#FFEBF0] text-[#AD1457]')}
                            role="status"
                        >
                            <WifiOff className="size-3.5" aria-hidden="true" />
                            {t('classroom.world.reconnecting')}
                        </span>
                    )}
                </div>
                <div className="pointer-events-auto flex items-center gap-1.5">
                    <button
                        type="button"
                        className={roundBtn}
                        onClick={() =>
                            setPanel(panel === 'board' ? null : 'board')
                        }
                        aria-label={t('classroom.world.leaderboard')}
                        aria-pressed={panel === 'board'}
                        data-testid="classroom-world-board-btn"
                    >
                        <Trophy className="size-5" aria-hidden="true" />
                    </button>
                    <button
                        type="button"
                        className={cn(roundBtn, 'hidden sm:grid')}
                        onClick={toggleFull}
                        aria-label={
                            full
                                ? t('classroom.world.exitFullscreen')
                                : t('classroom.world.fullscreen')
                        }
                    >
                        {full ? (
                            <Minimize2 className="size-5" aria-hidden="true" />
                        ) : (
                            <Maximize2 className="size-5" aria-hidden="true" />
                        )}
                    </button>
                    <button
                        type="button"
                        className={roundBtn}
                        onClick={onExit}
                        aria-label={t('classroom.world.exit')}
                        data-testid="classroom-world-exit"
                    >
                        <DoorOpen className="size-5" aria-hidden="true" />
                    </button>
                </div>
            </div>

            {/* Leaderboard */}
            {panel === 'board' && (
                <section
                    className="absolute top-16 right-2 z-10 w-[min(20rem,calc(100%-1rem))] rounded-2xl border-2 border-[#1f2a44] bg-[#FFFDF7] p-3 shadow-[4px_4px_0px_#1f2a44]"
                    data-testid="classroom-world-leaderboard"
                    aria-label={t('classroom.world.leaderboard')}
                >
                    <div className="mb-2 flex items-center justify-between gap-2">
                        <h2 className="flex items-center gap-1.5 font-display text-base font-black">
                            <Trophy
                                className="size-4 text-[#b45309]"
                                aria-hidden="true"
                            />
                            {t('classroom.world.leaderboard')}
                        </h2>
                        <button
                            type="button"
                            onClick={() => setPanel(null)}
                            className="grid size-9 place-items-center rounded-full hover:bg-[#FFF176]"
                            aria-label={t('classroom.world.close')}
                        >
                            <X className="size-4" aria-hidden="true" />
                        </button>
                    </div>
                    {hud.leaderboard.length === 0 ? (
                        <p className="text-sm text-slate-600">
                            {t('classroom.world.boardEmpty')}
                        </p>
                    ) : (
                        <ol className="flex max-h-[45vh] flex-col gap-1 overflow-y-auto">
                            {hud.leaderboard.map((row) => (
                                <li
                                    key={row.user_id}
                                    className={cn(
                                        'flex items-center gap-2 rounded-xl border-2 border-transparent px-2 py-1.5 text-sm',
                                        row.is_me &&
                                            'border-[#1f2a44] bg-[#ffd93d]',
                                    )}
                                >
                                    <span
                                        className={cn(
                                            'grid size-7 shrink-0 place-items-center rounded-full border-2 border-[#1f2a44] text-xs font-black',
                                            row.rank === 1
                                                ? 'bg-[#ffd93d]'
                                                : row.rank === 2
                                                  ? 'bg-[#e5e7eb]'
                                                  : row.rank === 3
                                                    ? 'bg-[#f1bf8c]'
                                                    : 'bg-white',
                                        )}
                                    >
                                        {row.rank}
                                    </span>
                                    <span className="min-w-0 flex-1 truncate font-bold">
                                        {row.name}
                                    </span>
                                    <span className="text-xs text-[#1f2a44]/75 tabular-nums">
                                        {t('classroom.world.playsShort', {
                                            count: row.plays,
                                        })}
                                    </span>
                                    <span className="font-black tabular-nums">
                                        {row.points}
                                    </span>
                                </li>
                            ))}
                        </ol>
                    )}
                    {!isTeacher && onLeaveClass && (
                        <button
                            type="button"
                            onClick={onLeaveClass}
                            className="mt-3 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border-2 border-[#1f2a44] bg-[#ffe1e6] px-3 text-xs font-bold text-[#8e2a3f]"
                            data-testid="classroom-leave-btn"
                        >
                            <LogOut className="size-4" aria-hidden="true" />
                            {t('classroom.world.leaveClass')}
                        </button>
                    )}
                </section>
            )}

            {/* Bottom prompts: booth and nearby person. Kept
                above the joystick (mobile) and clear of the right controls. */}
            {(activeBooth || showNear) && (
                <div className="pointer-events-none absolute inset-x-0 bottom-36 flex flex-col items-center gap-2 px-3 sm:bottom-20">
                    {showNear && near && (
                        <button
                            type="button"
                            onClick={() => openDm(near)}
                            className="pointer-events-auto inline-flex min-h-12 max-w-full items-center gap-2 rounded-2xl border-3 border-[#1f2a44] bg-[#00c9a7] px-5 font-display text-base font-black text-[#1f2a44] shadow-[4px_4px_0px_#1f2a44] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
                            data-testid="classroom-world-near-chat"
                        >
                            <MessagesSquare
                                className="size-5 shrink-0"
                                aria-hidden="true"
                            />
                            <span className="truncate">
                                {t('classroom.world.dm.chatWith', {
                                    name: near.name,
                                })}
                            </span>
                            {near.teacher && (
                                <TeacherTag label={teacherLabel} />
                            )}
                        </button>
                    )}
                    {activeBooth && activeLimit?.remaining === 0 && (
                        <span
                            role="status"
                            aria-disabled="true"
                            className="pointer-events-auto inline-flex min-h-12 items-center gap-2 rounded-2xl border-3 border-[#1f2a44] bg-[#ece9e1] px-5 font-display text-base font-black text-[#1f2a44]/70 shadow-[4px_4px_0px_#1f2a44]"
                            data-testid="classroom-world-booth-limit"
                        >
                            <Ban className="size-5" aria-hidden="true" />
                            {t('classroom.world.playLimitReached', {
                                plays: activeLimit.plays,
                                max: activeLimit.max ?? activeLimit.plays,
                            })}
                        </span>
                    )}
                    {activeBooth && activeLimit?.remaining !== 0 && (
                        <button
                            type="button"
                            onClick={() => conn.enterBooth(activeBooth.i)}
                            className="pointer-events-auto inline-flex min-h-12 items-center gap-2 rounded-2xl border-3 border-[#1f2a44] px-5 font-display text-base font-black text-white shadow-[4px_4px_0px_#1f2a44] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
                            style={{
                                background: catalog.accent(activeBooth.game),
                            }}
                            data-testid="classroom-world-enter-booth"
                        >
                            <Gamepad2 className="size-5" aria-hidden="true" />
                            <span className="[text-shadow:0_1px_0_#1f2a44]">
                                {t('classroom.world.play', {
                                    game: catalog.title(activeBooth.game),
                                })}
                            </span>
                            {activeLimit && activeLimit.max !== null && (
                                <span
                                    className="rounded-full border-2 border-[#1f2a44] bg-white px-2 py-0.5 font-sans text-[11px] font-bold text-[#1f2a44] tabular-nums"
                                    data-testid="classroom-world-booth-remaining"
                                >
                                    {t('classroom.world.playsLeft', {
                                        remaining: activeLimit.remaining ?? 0,
                                        max: activeLimit.max,
                                    })}
                                </span>
                            )}
                        </button>
                    )}
                </div>
            )}

            {conn.error && (
                <div
                    className="absolute inset-x-0 top-16 flex justify-center px-3"
                    role="alert"
                >
                    <button
                        type="button"
                        onClick={conn.clearError}
                        className="rounded-xl border-2 border-[#1f2a44] bg-[#FFEBF0] px-3 py-1.5 text-xs font-bold text-[#AD1457]"
                    >
                        {t(`classroom.world.errors.${conn.error}`, {
                            defaultValue: t('classroom.world.errors.generic'),
                        })}
                    </button>
                </div>
            )}

            {/* Joystick (touch devices) */}
            <div
                className="absolute bottom-4 left-4 grid size-28 place-items-center rounded-full border-2 border-[#1f2a44]/60 bg-white/50 [@media(pointer:fine)]:hidden"
                onPointerDown={(e) => {
                    e.stopPropagation();
                    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
                    const r = e.currentTarget.getBoundingClientRect();
                    stickOrigin.current = {
                        x: r.left + r.width / 2,
                        y: r.top + r.height / 2,
                        id: e.pointerId,
                    };
                    stickMove(e);
                }}
                onPointerMove={stickMove}
                onPointerUp={stickEnd}
                onPointerCancel={stickEnd}
                role="presentation"
                data-testid="classroom-world-joystick"
            >
                <span
                    className="size-12 rounded-full border-2 border-[#1f2a44] bg-[#ffd93d] shadow-[2px_2px_0px_#1f2a44]"
                    style={{
                        transform: knob
                            ? `translate(${knob.x}px, ${knob.y}px)`
                            : undefined,
                    }}
                />
            </div>
            <p className="pointer-events-none absolute bottom-3 left-3 hidden rounded-lg bg-white/80 px-2 py-1 text-[11px] font-bold text-slate-700 [@media(pointer:fine)]:block">
                {t('classroom.world.keysHint')}
            </p>

            {/* Right-side controls: zoom, emotes, chat */}
            <div className="absolute right-3 bottom-4 flex flex-col items-end gap-2">
                <div className="flex gap-1.5">
                    {EMOTES.map((e) => {
                        const Icon = EMOTE_ICONS[e];
                        return (
                            <button
                                key={e}
                                type="button"
                                className={roundBtn}
                                onClick={() => conn.sendEmote(e)}
                                aria-label={t(`classroom.world.emote.${e}`)}
                            >
                                <Icon className="size-5" aria-hidden="true" />
                            </button>
                        );
                    })}
                </div>
                <div className="flex gap-1.5">
                    <button
                        type="button"
                        className={roundBtn}
                        onClick={() => sceneRef.current?.zoom(-0.15)}
                        aria-label={t('classroom.world.zoomIn')}
                    >
                        <ZoomIn className="size-5" aria-hidden="true" />
                    </button>
                    <button
                        type="button"
                        className={roundBtn}
                        onClick={() => sceneRef.current?.zoom(0.15)}
                        aria-label={t('classroom.world.zoomOut')}
                    >
                        <ZoomOut className="size-5" aria-hidden="true" />
                    </button>
                    {world.chat_url && (
                        <button
                            type="button"
                            className={cn(roundBtn, 'relative')}
                            onClick={() =>
                                panel === 'inbox' ? setPanel(null) : openInbox()
                            }
                            aria-label={t('classroom.world.inbox.open', {
                                count: inboxTotal,
                            })}
                            aria-pressed={panel === 'inbox'}
                            data-testid="classroom-world-inbox-btn"
                        >
                            <Inbox className="size-5" aria-hidden="true" />
                            {inboxTotal > 0 && (
                                <span
                                    className="absolute -top-1.5 -right-1.5 grid h-5 min-w-5 place-items-center rounded-full border-2 border-[#1f2a44] bg-[#ff5c7a] px-1 text-[11px] leading-none font-black text-white"
                                    data-testid="classroom-world-inbox-count"
                                >
                                    {inboxTotal > 99 ? '99+' : inboxTotal}
                                </span>
                            )}
                        </button>
                    )}
                    <button
                        type="button"
                        className={cn(roundBtn, 'bg-[#FF9E44]')}
                        onClick={() =>
                            setPanel(panel === 'chat' ? null : 'chat')
                        }
                        aria-label={t('classroom.world.chat')}
                        aria-pressed={panel === 'chat'}
                        data-testid="classroom-world-chat-btn"
                    >
                        <MessageCircle className="size-5" aria-hidden="true" />
                    </button>
                </div>
            </div>

            {panel === 'chat' && (
                <section
                    className="absolute right-2 bottom-32 left-2 z-10 mx-auto max-w-md rounded-2xl border-2 border-[#1f2a44] bg-[#FFFDF7] p-2 shadow-[4px_4px_0px_#1f2a44] sm:left-auto sm:w-96"
                    aria-label={t('classroom.world.chat')}
                    data-testid="classroom-world-chat"
                >
                    <ul
                        className="mb-2 flex max-h-40 flex-col gap-1 overflow-y-auto px-1 text-sm"
                        aria-live="polite"
                    >
                        {conn.log.length === 0 && (
                            <li className="text-slate-600">
                                {t(
                                    isTeacher
                                        ? 'classroom.world.chatEmptyTeacher'
                                        : 'classroom.world.chatEmpty',
                                )}
                            </li>
                        )}
                        {conn.log.map((m) => (
                            <li key={`${m.id}-${m.at}`} className="break-words">
                                <span
                                    className={cn(
                                        'font-black',
                                        m.id === world.me.id &&
                                            'text-[#b45309]',
                                    )}
                                >
                                    {m.name}:
                                </span>{' '}
                                {m.text}
                            </li>
                        ))}
                    </ul>
                    <form onSubmit={submitChat} className="flex gap-1.5">
                        <label
                            className="sr-only"
                            htmlFor="classroom-chat-input"
                        >
                            {t('classroom.world.chatPlaceholder')}
                        </label>
                        <input
                            id="classroom-chat-input"
                            value={draft}
                            onChange={(e) =>
                                setDraft(clampChat(e.target.value))
                            }
                            maxLength={CHAT_MAX_RUNES * 2}
                            autoComplete="off"
                            autoFocus
                            placeholder={t('classroom.world.chatPlaceholder')}
                            onKeyDown={(e) =>
                                e.key === 'Escape' && setPanel(null)
                            }
                            className="min-h-11 min-w-0 flex-1 rounded-xl border-2 border-[#1f2a44] bg-white px-3 text-sm font-semibold text-[#1f2a44] outline-none focus:ring-2 focus:ring-[#6c5ce7]"
                            data-testid="classroom-world-chat-input"
                        />
                        <button
                            type="submit"
                            className={cn(
                                roundBtn,
                                'rounded-xl bg-[#1f2a44] text-white',
                            )}
                            aria-label={t('classroom.world.send')}
                            disabled={!draft.trim()}
                            data-testid="classroom-world-chat-send"
                        >
                            <Send className="size-5" aria-hidden="true" />
                        </button>
                    </form>
                </section>
            )}
            {panel === 'inbox' && (
                <section
                    className="absolute right-2 bottom-32 left-2 z-10 mx-auto flex max-h-[min(28rem,calc(100%-13rem))] max-w-md flex-col rounded-2xl border-2 border-[#1f2a44] bg-[#FFFDF7] p-2 shadow-[4px_4px_0px_#1f2a44] sm:left-auto sm:w-96"
                    aria-label={t('classroom.world.inbox.title')}
                    data-testid="classroom-world-inbox"
                >
                    <div className="mb-1.5 flex items-center gap-2 px-1">
                        <Inbox className="size-4 shrink-0" aria-hidden="true" />
                        <h2 className="min-w-0 truncate font-display text-base font-black text-[#1f2a44]">
                            {t('classroom.world.inbox.title')}
                        </h2>
                        <button
                            type="button"
                            onClick={() => setPanel(null)}
                            className="ml-auto grid size-11 shrink-0 place-items-center rounded-full text-[#1f2a44] hover:bg-[#FFF176]"
                            aria-label={t('classroom.world.close')}
                            data-testid="classroom-world-inbox-close"
                        >
                            <X className="size-4" aria-hidden="true" />
                        </button>
                    </div>
                    {inbox.length === 0 ? (
                        <p
                            className="px-1 pb-1 text-sm text-slate-600"
                            data-testid="classroom-world-inbox-empty"
                        >
                            {t('classroom.world.inbox.empty')}
                        </p>
                    ) : (
                        <ul className="flex min-h-0 flex-col gap-2 overflow-y-auto px-0.5 pb-0.5">
                            {inbox.map((s) => (
                                <li
                                    key={s.user_id}
                                    className="rounded-xl border-2 border-[#1f2a44] bg-white p-2"
                                    data-testid={`classroom-world-inbox-row-${s.user_id}`}
                                >
                                    <div className="mb-1 flex items-center gap-1.5">
                                        <span className="min-w-0 truncate text-sm font-black text-[#1f2a44]">
                                            {s.name}
                                        </span>
                                        {s.teacher && (
                                            <TeacherTag label={teacherLabel} />
                                        )}
                                        <span className="ml-auto grid h-5 min-w-5 shrink-0 place-items-center rounded-full border-2 border-[#1f2a44] bg-[#ff5c7a] px-1 text-[11px] leading-none font-black text-white">
                                            {s.unread}
                                        </span>
                                    </div>
                                    <ul className="mb-1.5 flex flex-col gap-1 text-sm text-[#1f2a44]">
                                        {s.messages.map((m) => (
                                            <li
                                                key={m.id}
                                                className="w-fit max-w-full rounded-lg bg-[#F1F5FF] px-2 py-0.5 break-words"
                                            >
                                                {m.text}
                                            </li>
                                        ))}
                                    </ul>
                                    {replyError === s.user_id && (
                                        <p
                                            className="mb-1.5 rounded-lg bg-[#FFEBF0] px-2 py-0.5 text-xs font-bold text-[#AD1457]"
                                            role="status"
                                        >
                                            {t('classroom.world.inbox.failed')}
                                        </p>
                                    )}
                                    <form
                                        onSubmit={(e) => submitReply(e, s)}
                                        className="flex gap-1.5"
                                    >
                                        <label
                                            className="sr-only"
                                            htmlFor={`classroom-inbox-input-${s.user_id}`}
                                        >
                                            {t(
                                                'classroom.world.dm.placeholder',
                                                {
                                                    name: s.name,
                                                },
                                            )}
                                        </label>
                                        <input
                                            id={`classroom-inbox-input-${s.user_id}`}
                                            value={replyDrafts[s.user_id] ?? ''}
                                            onChange={(e) =>
                                                setReplyDrafts((prev) => ({
                                                    ...prev,
                                                    [s.user_id]: clampChat(
                                                        e.target.value,
                                                    ),
                                                }))
                                            }
                                            maxLength={CHAT_MAX_RUNES * 2}
                                            autoComplete="off"
                                            placeholder={t(
                                                'classroom.world.inbox.replyPlaceholder',
                                            )}
                                            onKeyDown={(e) =>
                                                e.key === 'Escape' &&
                                                setPanel(null)
                                            }
                                            className="min-h-10 min-w-0 flex-1 rounded-xl border-2 border-[#1f2a44] bg-white px-3 text-sm font-semibold text-[#1f2a44] outline-none focus:ring-2 focus:ring-[#6c5ce7]"
                                            data-testid={`classroom-world-inbox-input-${s.user_id}`}
                                        />
                                        <button
                                            type="submit"
                                            className={cn(
                                                roundBtn,
                                                'size-10 rounded-xl bg-[#1f2a44] text-white',
                                            )}
                                            aria-label={t(
                                                'classroom.world.send',
                                            )}
                                            disabled={
                                                !(
                                                    replyDrafts[s.user_id] ?? ''
                                                ).trim() ||
                                                replyBusy === s.user_id
                                            }
                                            data-testid={`classroom-world-inbox-send-${s.user_id}`}
                                        >
                                            <Send
                                                className="size-4"
                                                aria-hidden="true"
                                            />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() =>
                                                clearUnread(s.user_id)
                                            }
                                            className="min-h-10 shrink-0 rounded-xl border-2 border-[#1f2a44] bg-white px-2 text-xs font-bold text-[#1f2a44] hover:bg-[#FFF176]"
                                            data-testid={`classroom-world-inbox-read-${s.user_id}`}
                                        >
                                            {t(
                                                'classroom.world.inbox.markRead',
                                            )}
                                        </button>
                                    </form>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>
            )}
            {dmOpen && dm && (
                <section
                    className="absolute right-2 bottom-32 left-2 z-10 mx-auto max-w-md rounded-2xl border-2 border-[#1f2a44] bg-[#FFFDF7] p-2 shadow-[4px_4px_0px_#1f2a44] sm:left-auto sm:w-96"
                    aria-label={t('classroom.world.dm.title', {
                        name: dm.name,
                    })}
                    data-testid="classroom-world-dm"
                >
                    <div className="mb-1.5 flex items-center gap-2 px-1">
                        <MessagesSquare
                            className="size-4 shrink-0"
                            aria-hidden="true"
                        />
                        <h2
                            className="min-w-0 truncate font-display text-base font-black text-[#1f2a44]"
                            data-testid="classroom-world-dm-name"
                        >
                            {dm.name}
                        </h2>
                        {dm.teacher && <TeacherTag label={teacherLabel} />}
                        <button
                            type="button"
                            onClick={() => setPanel(null)}
                            className="ml-auto grid size-11 shrink-0 place-items-center rounded-full text-[#1f2a44] hover:bg-[#FFF176]"
                            aria-label={t('classroom.world.close')}
                            data-testid="classroom-world-dm-close"
                        >
                            <X className="size-4" aria-hidden="true" />
                        </button>
                    </div>
                    <ul
                        className="mb-2 flex max-h-40 flex-col gap-1 overflow-y-auto px-1 text-sm text-[#1f2a44]"
                        aria-live="polite"
                        data-testid="classroom-world-dm-log"
                    >
                        {dmThread.length === 0 && (
                            <li className="text-slate-600">
                                {t('classroom.world.dm.empty', {
                                    name: dm.name,
                                })}
                            </li>
                        )}
                        {dmThread.map((m) => (
                            <li
                                key={`${m.id}-${m.at}`}
                                className={cn(
                                    'max-w-[85%] rounded-xl border-2 border-[#1f2a44] px-2.5 py-1 break-words',
                                    m.id === world.me.id
                                        ? 'self-end bg-[#ffd93d]'
                                        : 'self-start bg-white',
                                )}
                            >
                                <span className="sr-only">
                                    {m.id === world.me.id
                                        ? t('classroom.world.dm.you')
                                        : m.name}
                                    :{' '}
                                </span>
                                {m.text}
                            </li>
                        ))}
                    </ul>
                    {(dmError || dmFar) && (
                        <p
                            className="mb-2 rounded-xl border-2 border-[#1f2a44] bg-[#FFEBF0] px-2.5 py-1 text-xs font-bold text-[#AD1457]"
                            role="status"
                            data-testid="classroom-world-dm-error"
                        >
                            {dmError === 'chat_rate'
                                ? t('classroom.world.errors.chat_rate')
                                : dmError === 'no_target'
                                  ? t('classroom.world.dm.noTarget', {
                                        name: dm.name,
                                    })
                                  : t('classroom.world.dm.tooFar', {
                                        name: dm.name,
                                    })}
                        </p>
                    )}
                    <form onSubmit={submitDm} className="flex gap-1.5">
                        <label className="sr-only" htmlFor="classroom-dm-input">
                            {t('classroom.world.dm.placeholder', {
                                name: dm.name,
                            })}
                        </label>
                        <input
                            id="classroom-dm-input"
                            value={dmDraft}
                            onChange={(e) =>
                                setDmDraft(clampChat(e.target.value))
                            }
                            maxLength={CHAT_MAX_RUNES * 2}
                            autoComplete="off"
                            autoFocus
                            placeholder={t('classroom.world.dm.placeholder', {
                                name: dm.name,
                            })}
                            onKeyDown={(e) =>
                                e.key === 'Escape' && setPanel(null)
                            }
                            className="min-h-11 min-w-0 flex-1 rounded-xl border-2 border-[#1f2a44] bg-white px-3 text-sm font-semibold text-[#1f2a44] outline-none focus:ring-2 focus:ring-[#6c5ce7]"
                            data-testid="classroom-world-dm-input"
                        />
                        <button
                            type="submit"
                            className={cn(
                                roundBtn,
                                'rounded-xl bg-[#1f2a44] text-white',
                            )}
                            aria-label={t('classroom.world.send')}
                            disabled={!dmDraft.trim()}
                            data-testid="classroom-world-dm-send"
                        >
                            <Send className="size-5" aria-hidden="true" />
                        </button>
                    </form>
                </section>
            )}
        </div>
    );
}

/**
 * Standalone white SVG markup of a lucide icon, for canvas textures (the
 * booth signs). Built from the icon's own node list (no extra renderer)
 * and cached per icon.
 */
const iconSvgCache = new Map<LucideIcon, string>();
function iconSvg(Icon: LucideIcon): string | undefined {
    const cached = iconSvgCache.get(Icon);
    if (cached !== undefined) {
        return cached || undefined;
    }
    let markup = '';
    try {
        // forwardRef icon: render() returns <Icon> with the node list.
        const render = (
            Icon as unknown as {
                render?: (
                    props: object,
                    ref: null,
                ) => {
                    props?: { iconNode?: [string, Record<string, string>][] };
                };
            }
        ).render;
        const nodes = render?.({}, null)?.props?.iconNode ?? [];
        const escape = (value: string) =>
            value.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
        const body = nodes
            .map(([tag, attrs]) => {
                const list = Object.entries(attrs)
                    .filter(([key]) => key !== 'key')
                    .map(([key, value]) => `${key}="${escape(String(value))}"`)
                    .join(' ');
                return /^[a-z]+$/.test(tag) ? `<${tag} ${list}/>` : '';
            })
            .join('');
        if (body) {
            markup = `<svg xmlns="http://www.w3.org/2000/svg" width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
        }
    } catch {
        markup = '';
    }
    iconSvgCache.set(Icon, markup);
    return markup || undefined;
}

function csrfToken(): string {
    return (
        document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')
            ?.content ?? ''
    );
}

/** JSON POST to a same-origin classroom chat endpoint; null on failure. */
async function chatPost(
    url: string,
    body: Record<string, unknown>,
): Promise<unknown> {
    try {
        const res = await fetch(url, {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
                'X-CSRF-TOKEN': csrfToken(),
                'X-Requested-With': 'XMLHttpRequest',
            },
            body: JSON.stringify(body),
        });
        return res.ok ? await res.json() : null;
    } catch {
        return null;
    }
}
