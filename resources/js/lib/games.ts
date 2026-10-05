import { type GameMenuCategory, type GameMenuGame } from '@/types';
import {
    Dice5,
    Flag,
    FlaskConical,
    Flower2,
    Gamepad2,
    Grid3x3,
    Layers,
    type LucideIcon,
    Map as MapIcon,
    Plane,
    ShoppingCart,
    Swords,
    TrainFront,
} from 'lucide-react';

/** Icon per catalog `icon` key (config/game-catalog.php). */
export const GAME_ICONS: Record<string, LucideIcon> = {
    flag: Flag,
    dice: Dice5,
    plane: Plane,
    swords: Swords,
    train: TrainFront,
    grid: Grid3x3,
    gamepad: Gamepad2,
    cart: ShoppingCart,
    flower: Flower2,
    map: MapIcon,
    flask: FlaskConical,
    layers: Layers,
};

export function gameIcon(icon: string): LucideIcon {
    return GAME_ICONS[icon] ?? Gamepad2;
}

/** Category key of a game, for labels like "Quiz · Grade 1–12". */
export function categoryOf(
    categories: GameMenuCategory[],
    game: GameMenuGame,
): GameMenuCategory | undefined {
    return categories.find((category) =>
        category.games.some((candidate) => candidate.key === game.key),
    );
}
