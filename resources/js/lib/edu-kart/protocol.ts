/**
 * EduKart wire protocol (Go referee <-> React). Source of truth for the
 * message shapes; the Go side (services/game/internal/edukart) must emit
 * exactly these fields. Relative imports and `import type` only, so
 * `node --test` can load it.
 */
import type { Kart } from './physics';
import type { TrackData } from './track';

export const GAME_KEY = 'edu-kart';
export const STATE_TYPE = 'edukart_state';
export const TRACK_IDS = ['forest', 'beach', 'mandalika'] as const;
export type TrackId = (typeof TRACK_IDS)[number];
export const LAP_CHOICES = [2, 3, 5] as const;
export const MAX_RACERS = 8;

export type ItemKind = 'rocket' | 'tnt' | 'nos' | 'shield';
export const ITEM_KINDS: readonly ItemKind[] = [
    'rocket',
    'tnt',
    'nos',
    'shield',
];

/** Seat in the room payload (`players[]`), RoomSeat plus EduKart fields. */
export interface EduKartSeatExtra {
    vehicle: string;
}

/** Race summary inside `edukart_state`. */
export interface RaceSummary {
    /** countdown | racing | done */
    status: 'countdown' | 'racing' | 'done';
    /** Every racer incl. bots, in seat-like order `racer` index. */
    racers: RacerInfo[];
    /** Final or live standings (racer indexes, best first). */
    standings: number[];
    stopped: boolean;
    /** The viewer's paid points once done (null before). */
    result: { points: number } | null;
    match?: { key: string };
}

export interface RacerInfo {
    /** Racer index used in `race` frames (0..7). */
    racer: number;
    /** Room seat for humans, -1 for bots. */
    seat: number;
    bot: boolean;
    /** Bot number 1..7 (client names it via locale), 0 for humans. */
    bot_no: number;
    name: string;
    vehicle: string;
    /** Avatar look (humans) or null (bots use a default look per bot_no). */
    character: unknown;
    color: string;
    left: boolean;
    correct: number;
    wrong: number;
    /** Finish time in ms since GO (0 = not finished). */
    finish_ms: number;
    rank: number;
}

/** `edukart_state`: room payload + settings + race summary. */
export interface EduKartStateExtra {
    track: TrackId;
    laps: number;
    bots: boolean;
    subject_fallback?: boolean;
    race: RaceSummary | null;
}

/** `edukart_track`: sent once per connection and on every track change. */
export interface TrackMessage {
    t: 'edukart_track';
    track: TrackData;
}

/** One racer in a `race` frame. Kart fields are exactly physics `Kart`. */
export interface RacerFrame extends Kart {
    racer: number;
    lap: number;
    item: ItemKind | '';
    juiced: boolean;
    /** Shield time left (ms), 0 = none. */
    shield_ms: number;
    /** TNT on the head: ms until it blows, 0 = none. */
    tnt_ms: number;
    finish_ms: number;
    rank: number;
    /** Item presses already consumed (sync the client's fire counter on reconnect). */
    last_fire: number;
}

export interface Projectile {
    id: number;
    kind: 'rocket';
    owner: number;
    p: number;
    d: number;
    y: number;
    juiced: boolean;
}

export interface Hazard {
    id: number;
    kind: 'tnt' | 'nitro';
    owner: number;
    p: number;
    d: number;
}

/** Question gate the viewer drives towards (null when none is near). */
export interface GateQuestion {
    /** `${lap}-${gate}` unique per race. */
    id: string;
    /** Unwrapped progress of the box row (kart P where boxes stand). */
    at: number;
    /** Zone start (unwrapped P): speed cap applies from here to `at`. */
    zone: number;
    kind: 'tf' | 'choice';
    text: string;
    media?: unknown;
    /** Choice: option texts. TF: ['true','false'] (client localises). */
    options: string[];
    option_media?: unknown;
    subject: string;
    worth: number;
}

export type RaceEvent =
    | {
          k: 'answer';
          racer: number;
          gate: string;
          correct: boolean;
          /** Lane the racer hit (-1 = missed the boxes). */
          choice: number;
          /** Only for the viewer's own answers. */
          answer?: string;
          hint?: string;
          item?: ItemKind | '';
      }
    | { k: 'fire'; racer: number; item: ItemKind }
    | {
          k: 'hit';
          racer: number;
          by: number;
          cause: 'rocket' | 'tnt' | 'nitro' | 'bump';
          blocked: boolean;
      }
    | { k: 'tnt_on'; racer: number }
    | { k: 'tnt_off'; racer: number }
    | { k: 'boom'; racer: number; p: number; d: number }
    | { k: 'lap'; racer: number; lap: number }
    | { k: 'finish'; racer: number; rank: number; ms: number }
    | { k: 'start_boost'; racer: number };

/** `race`: 20 Hz frame for every human in a racing room. */
export interface RaceFrame {
    t: 'race';
    /** Race clock in ms since GO (negative during the countdown). */
    ms: number;
    /** Viewer's racer index (-1 for none). */
    you: number;
    /** Last input `seq` the referee applied for the viewer. */
    ack: number;
    racers: RacerFrame[];
    projectiles: Projectile[];
    hazards: Hazard[];
    question: GateQuestion | null;
    /** Fruit indexes (track.fruits) the viewer already took on the current lap. */
    taken: number[];
    events: RaceEvent[];
}

/** Client -> Go input intent (send ~30/s and on every change). */
export interface InputMessage {
    t: 'input';
    seq: number;
    steer: number;
    throttle: number;
    drift: boolean;
    hop: number;
    turbo: number;
    fire: number;
}

export function isRaceFrame(
    msg: Record<string, unknown>,
): msg is RaceFrame & Record<string, unknown> {
    return (
        msg.t === 'race' &&
        typeof msg.ms === 'number' &&
        Array.isArray(msg.racers) &&
        Array.isArray(msg.events)
    );
}

export function isTrackMessage(
    msg: Record<string, unknown>,
): msg is TrackMessage & Record<string, unknown> {
    const t = msg.track as Record<string, unknown> | undefined;
    return (
        msg.t === 'edukart_track' &&
        !!t &&
        typeof t.id === 'string' &&
        Array.isArray(t.samples) &&
        t.samples.length >= 16
    );
}
