/** Pure client rules of Tarik Tambang; the Go referee decides every outcome. */

export const TEAM_RED = 0;
export const TEAM_BLUE = 1;
export const TEAM_WATCH = 2;

export interface TugSeatLike {
    seat: number;
    team: number;
    left: boolean;
    bot?: boolean;
}

export function answerKey(state: { pin: string; round: number }): string {
    return `${state.pin}:${state.round}`;
}

/** The viewer may answer: live question, own seat on a team, not yet answered. */
export function canAnswer(
    state: {
        pin: string;
        round: number;
        phase: string;
        stage: string | null;
        you: number;
        remaining_ms: number;
        your_choice: number | null;
        players: TugSeatLike[];
    },
    online: boolean,
    pending: string | null,
): boolean {
    const me = state.players.find((p) => p.seat === state.you);
    return (
        online &&
        state.phase === 'playing' &&
        state.stage === 'question' &&
        state.remaining_ms > 0 &&
        state.your_choice === null &&
        pending !== answerKey(state) &&
        Boolean(me) &&
        me!.team !== TEAM_WATCH
    );
}

/** Option index must point at a displayed option of the live question. */
export function isValidOption(
    state: { question: { options: string[] } | null },
    option: number,
): boolean {
    return (
        Number.isInteger(option) &&
        option >= 0 &&
        option < (state.question?.options.length ?? 0)
    );
}

export function answerMessage(
    state: { round: number },
    option: number,
): { t: 'answer'; round: number; option: number } {
    return { t: 'answer', round: state.round, option };
}

/** Active players per team (computer included, referee screen excluded). */
export function teamSizes(players: TugSeatLike[]): [number, number] {
    const size: [number, number] = [0, 0];
    for (const p of players) {
        if (!p.left && (p.team === TEAM_RED || p.team === TEAM_BLUE)) {
            size[p.team]++;
        }
    }
    return size;
}

export type TeamCheck =
    | { kind: 'empty' }
    | { kind: 'solo' }
    | { kind: 'odd'; count: number }
    | { kind: 'unbalanced'; red: number; blue: number }
    | { kind: 'ready'; red: number; blue: number };

/** Mirrors Go's start check so the lobby can explain why Start fails. */
export function teamCheck(players: TugSeatLike[]): TeamCheck {
    const [red, blue] = teamSizes(players.filter((p) => !p.bot));
    const count = red + blue;
    if (count === 0) {
        return { kind: 'empty' };
    }
    if (count === 1) {
        return { kind: 'solo' };
    }
    if (count % 2 !== 0) {
        return { kind: 'odd', count };
    }
    if (red !== blue) {
        return { kind: 'unbalanced', red, blue };
    }
    return { kind: 'ready', red, blue };
}

/**
 * Horizontal shift of the rope in percent of half the field: rope < 0 moves
 * toward red (left), > 0 toward blue (right); ±winSteps reaches the line.
 */
export function ropeShift(rope: number, winSteps: number): number {
    if (winSteps <= 0) {
        return 0;
    }
    const clamped = Math.max(-winSteps, Math.min(winSteps, rope));
    return (clamped / winSteps) * 100;
}

/** Leading team (-1 = even). */
export function leadingTeam(rope: number): number {
    if (rope < 0) {
        return TEAM_RED;
    }
    if (rope > 0) {
        return TEAM_BLUE;
    }
    return -1;
}
