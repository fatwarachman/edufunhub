export const BOARD_LADDERS: Record<number, number> = {
    4: 16,
    12: 31,
    21: 42,
    33: 54,
    41: 79,
    56: 76,
    69: 88,
    74: 92,
};
export const BOARD_SNAKES: Record<number, number> = {
    28: 10,
    37: 17,
    48: 26,
    62: 44,
    75: 53,
    84: 63,
    95: 72,
    98: 78,
};
export function boardPoint(position: number): { x: number; y: number } {
    const row = Math.floor((position - 1) / 10);
    const column = (position - 1) % 10;
    return {
        x: 94 + (row % 2 === 0 ? column : 9 - column) * 90,
        y: 918 - row * 82,
    };
}

/** Squares a token walks through for a dice roll; overshooting 100 bounces back. */
export function walkPath(from: number, dice: number): number[] {
    const path: number[] = [];
    let position = from;
    let direction = 1;
    for (let step = 0; step < dice; step++) {
        if (position === 100) {
            direction = -1;
        }
        position += direction;
        path.push(position);
    }
    return path;
}
