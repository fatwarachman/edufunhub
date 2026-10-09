export function answerKey(state: { pin: string; round: number }): string {
    return `${state.pin}:${state.round}`;
}

/** Sequence changes on ticks; only a new question unlocks another answer. */
export function canSubmitAnswer(
    state: {
        pin: string;
        round: number;
        phase: string;
        turn: number;
        remaining_ms: number;
        players: { seat: number; controlled: boolean; bot?: boolean }[];
    },
    online: boolean,
    pending: string | null,
): boolean {
    return (
        online &&
        state.phase === 'playing' &&
        state.remaining_ms > 0 &&
        pending !== answerKey(state) &&
        state.players.some(
            (player) =>
                player.seat === state.turn && player.controlled && !player.bot,
        )
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

/** Answer intent; the Go referee resolves it against the hidden key. */
export function answerMessage(
    state: { round: number },
    option: number,
): { t: 'answer'; round: number; option: number } {
    return { t: 'answer', round: state.round, option };
}
