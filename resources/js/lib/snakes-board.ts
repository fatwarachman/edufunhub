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
