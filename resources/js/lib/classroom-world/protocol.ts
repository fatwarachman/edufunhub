/**
 * Wire contract of the Go classroom world (`/game-ws/classroom`). Go owns
 * positions, collision, booths and chat; the client only renders and sends
 * intents. Keep in sync with services/game/internal/classroom.
 */
import type { CharacterLook } from '../character/draw-character';

export interface Box {
    x: number;
    z: number;
    w: number;
    d: number;
}

export interface Booth {
    i: number;
    game: string;
    x: number;
    z: number;
    r: number;
}

export interface WorldGeometry {
    /** Floor size; grows with the classroom seats (max_members). */
    room: { w: number; d: number };
    /** Seat count the layout was built for (absent on old servers). */
    seats?: number;
    /** Fixed room entry (door / spawn area); absent on old servers. */
    entry?: { x: number; z: number };
    desks: Box[];
    teacher_desk: Box;
    booths: Booth[];
}

export interface WelcomeMessage extends WorldGeometry {
    t: 'welcome';
    you: number;
    spawn: { x: number; z: number };
    tick_ms: number;
    /** Teacher seat behind the teacher desk; absent on old servers. */
    teacher?: { id: number; x: number; z: number };
}

export interface RosterPlayer {
    id: number;
    name: string;
    character: CharacterLook | null;
    /** True for the classroom's teacher (absent on old servers). */
    teacher?: boolean;
}

/** `[id, x, z, facing (radians), busy game key or ""]`. */
export type PlayerTuple = [number, number, number, number, string];

export interface StateMessage {
    t: 'state';
    p: PlayerTuple[];
}

export interface ChatMessage {
    t: 'chat';
    id: number;
    name: string;
    text: string;
    at: number;
}

/** Proximity direct message; only sender and target receive it. */
export interface SayMessage {
    t: 'say';
    id: number;
    to: number;
    name: string;
    text: string;
    at: number;
}

export type Emote = 'wave' | 'jump' | 'clap';

export const EMOTES: Emote[] = ['wave', 'jump', 'clap'];

/** Same limits Go enforces; the client trims early so players see it. */
export const CHAT_MAX_RUNES = 120;
export const PLAYER_RADIUS = 0.35;
export const MOVE_SPEED = 3.5;
/** Max distance (m) Go accepts for a `say` between two players. */
export const SAY_RADIUS = 3.0;
/** Distance (m) at which the "chat with X" button shows up. */
export const NEAR_RADIUS = 2.5;

export interface HudRow {
    rank: number;
    user_id: number;
    name: string;
    points: number;
    plays: number;
    is_me: boolean;
}

export interface HudPayload {
    me: { points: number; plays: number; rank: number | null };
    leaderboard: HudRow[];
    members_count: number;
    ends_at: string;
    /** Play limits per booth game (absent on old servers). */
    limits?: Record<
        string,
        { plays: number; max: number | null; remaining: number | null }
    >;
}

export interface WorldProps {
    ws_url: string | null;
    token_url: string;
    hud_url: string;
    hud: HudPayload;
    me: { id: number; name: string; character: CharacterLook | null };
    /** Classroom teacher (absent on old servers). */
    teacher?: { id: number; name: string; character: CharacterLook | null };
    role?: 'student' | 'teacher';
    /** User ids of the other people of this classroom (teacher + members). */
    people?: number[];
    /** Waiting direct chats of this classroom (GET; POST `/reply`, `/read`). */
    chat_url?: string;
}

/** One person whose direct messages to me are still unanswered. */
export interface InboxSender {
    user_id: number;
    name: string;
    teacher: boolean;
    unread: number;
    last_at: string | null;
    messages: { id: number; text: string; at: string | null }[];
}

/** Valid rows of the waiting-chats payload, newest activity first. */
export function parseInbox(data: unknown): InboxSender[] {
    const rows = (data as { senders?: unknown } | null)?.senders;
    if (!Array.isArray(rows)) {
        return [];
    }
    const out: InboxSender[] = [];
    for (const row of rows as unknown[]) {
        const r = row as Record<string, unknown> | null;
        if (
            !r ||
            !finite(r.user_id) ||
            typeof r.name !== 'string' ||
            !finite(r.unread) ||
            r.unread <= 0
        ) {
            continue;
        }
        const messages = Array.isArray(r.messages)
            ? (r.messages as unknown[]).flatMap((m) => {
                  const x = m as Record<string, unknown> | null;
                  return x && finite(x.id) && typeof x.text === 'string'
                      ? [
                            {
                                id: x.id,
                                text: x.text,
                                at: typeof x.at === 'string' ? x.at : null,
                            },
                        ]
                      : [];
              })
            : [];
        out.push({
            user_id: r.user_id,
            name: r.name,
            teacher: r.teacher === true,
            unread: Math.floor(r.unread),
            last_at: typeof r.last_at === 'string' ? r.last_at : null,
            messages,
        });
    }
    return out;
}

function finite(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
}

/** Valid roster rows only; `teacher` normalised to a boolean. */
export function parseRoster(msg: Record<string, unknown>): RosterPlayer[] {
    if (!Array.isArray(msg.players)) {
        return [];
    }
    const out: RosterPlayer[] = [];
    for (const row of msg.players as unknown[]) {
        if (!row || typeof row !== 'object') {
            continue;
        }
        const p = row as Record<string, unknown>;
        if (!finite(p.id) || typeof p.name !== 'string') {
            continue;
        }
        out.push({
            id: p.id,
            name: p.name,
            character:
                p.character && typeof p.character === 'object'
                    ? (p.character as CharacterLook)
                    : null,
            teacher: p.teacher === true,
        });
    }
    return out;
}

/** A well-formed `say` frame, or null. */
export function parseSay(msg: Record<string, unknown>): SayMessage | null {
    if (
        msg.t !== 'say' ||
        !finite(msg.id) ||
        !finite(msg.to) ||
        typeof msg.text !== 'string' ||
        msg.text === ''
    ) {
        return null;
    }
    return {
        t: 'say',
        id: msg.id,
        to: msg.to,
        name: typeof msg.name === 'string' ? msg.name : '',
        text: msg.text,
        at: finite(msg.at) ? msg.at : Date.now(),
    };
}

/** The other party of a `say` from the local player's point of view. */
export function sayPartner(msg: SayMessage, meId: number): number {
    return msg.id === meId ? msg.to : msg.id;
}

/**
 * Teacher id + seat from `welcome.teacher`; the id falls back to the page's
 * teacher id when the server sent 0. Old servers (no field) give null.
 */
export function teacherSeat(
    welcome: Pick<WelcomeMessage, 'teacher'>,
    fallbackId = 0,
): { id: number; x: number; z: number } | null {
    const t = welcome.teacher;
    if (!t || !finite(t.x) || !finite(t.z)) {
        return null;
    }
    const id = finite(t.id) && t.id > 0 ? t.id : fallbackId;
    return id > 0 ? { id, x: t.x, z: t.z } : null;
}

/** Closest candidate within `radius` of `from` (ties: first wins), or null. */
export function nearestWithin<T extends { x: number; z: number }>(
    from: { x: number; z: number },
    candidates: T[],
    radius: number,
): T | null {
    let best: T | null = null;
    let bestDist = radius;
    for (const c of candidates) {
        const d = Math.hypot(c.x - from.x, c.z - from.z);
        if (d <= bestDist && (best === null || d < bestDist)) {
            best = c;
            bestDist = d;
        }
    }
    return best;
}

/** Drops malformed tuples so a bad frame never breaks the render loop. */
export function parseState(msg: Record<string, unknown>): PlayerTuple[] {
    if (!Array.isArray(msg.p)) {
        return [];
    }
    return msg.p.filter(
        (row): row is PlayerTuple =>
            Array.isArray(row) &&
            finite(row[0]) &&
            finite(row[1]) &&
            finite(row[2]) &&
            finite(row[3]),
    );
}

/** Index of the booth the point stands in, or -1. */
export function boothAt(booths: Booth[], x: number, z: number): number {
    for (const booth of booths) {
        if (Math.hypot(x - booth.x, z - booth.z) <= booth.r) {
            return booth.i;
        }
    }
    return -1;
}

/**
 * Client-side prediction of one movement step; mirrors the Go integrator
 * (circle vs box push-out, then clamp to the room) so the local avatar
 * moves instantly and only glides when the server disagrees.
 */
export function predictStep(
    geometry: WorldGeometry,
    pos: { x: number; z: number },
    dir: { x: number; z: number },
    dt: number,
): { x: number; z: number } {
    const len = Math.hypot(dir.x, dir.z);
    if (len === 0) {
        return pos;
    }
    const scale = Math.min(1, len) / len;
    let x = pos.x + dir.x * scale * MOVE_SPEED * dt;
    let z = pos.z + dir.z * scale * MOVE_SPEED * dt;
    for (const box of [...geometry.desks, geometry.teacher_desk]) {
        const cx = Math.max(box.x - box.w / 2, Math.min(x, box.x + box.w / 2));
        const cz = Math.max(box.z - box.d / 2, Math.min(z, box.z + box.d / 2));
        const dx = x - cx;
        const dz = z - cz;
        const dist = Math.hypot(dx, dz);
        if (dist < PLAYER_RADIUS) {
            if (dist === 0) {
                return pos;
            }
            x = cx + (dx / dist) * PLAYER_RADIUS;
            z = cz + (dz / dist) * PLAYER_RADIUS;
        }
    }
    const hw = geometry.room.w / 2 - PLAYER_RADIUS;
    const hd = geometry.room.d / 2 - PLAYER_RADIUS;
    return {
        x: Math.max(-hw, Math.min(hw, x)),
        z: Math.max(-hd, Math.min(hd, z)),
    };
}

/** Room entry (door side): the server's value or the back-right corner. */
export function roomEntry(geometry: WorldGeometry): { x: number; z: number } {
    if (
        geometry.entry &&
        finite(geometry.entry.x) &&
        finite(geometry.entry.z)
    ) {
        return geometry.entry;
    }
    return { x: geometry.room.w / 2 - 3, z: geometry.room.d / 2 - 2 };
}

/**
 * Evenly spaced window centres along a wall of `length` metres, keeping
 * `margin` free at both ends and skipping spots within `avoidGap` of
 * `avoid` (e.g. the door).
 */
export function wallWindows(
    length: number,
    spacing = 4,
    margin = 2.5,
    avoid: number | null = null,
    avoidGap = 1.8,
): number[] {
    const usable = length - margin * 2;
    if (usable < 0) {
        return [];
    }
    const count = Math.floor(usable / spacing) + 1;
    const start = -((count - 1) * spacing) / 2;
    const out: number[] = [];
    for (let i = 0; i < count; i++) {
        const at = start + i * spacing;
        if (avoid === null || Math.abs(at - avoid) >= avoidGap) {
            out.push(at);
        }
    }
    return out;
}

/** Camera zoom limit and fog range that keep the whole room readable. */
export function viewRange(room: { w: number; d: number }): {
    cameraMax: number;
    fogNear: number;
    fogFar: number;
    far: number;
} {
    const span = Math.max(room.w, room.d);
    return {
        cameraMax: Math.max(16, Math.round(span * 0.6)),
        fogNear: Math.max(24, span),
        fogFar: Math.max(48, span * 2),
        far: Math.max(100, span * 3),
    };
}

/** Rune-safe trim to the chat limit. */
export function clampChat(text: string): string {
    return Array.from(text.replace(/\s+/g, ' '))
        .slice(0, CHAT_MAX_RUNES)
        .join('');
}
