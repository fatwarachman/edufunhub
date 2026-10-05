/**
 * Single source of truth for drawing the player character: a chibi RPG hero
 * (big head, small body, thick outline) that can be a boy or a girl and wear
 * shop items per slot. Used by the Flag Quest renderer (in-world sprite) and
 * by the avatar component, so the character looks identical everywhere.
 */

export type ItemSlot =
    'hat' | 'face' | 'outfit' | 'back' | 'weapon' | 'offhand';

export interface ItemLook {
    style: string;
    color?: string | null;
}

export interface CharacterLook {
    /** Shirt colour of the free tunic. */
    color: string;
    gender?: string;
    skin?: string;
    hair?: string;
    items?: Partial<Record<ItemSlot, ItemLook | null>>;
    /** Legacy look (before the shop): cap / glasses. */
    accessory?: string;
}

export interface CharacterPose {
    /** Walk cycle phase in -1..1 (0 = standing). */
    phase: number;
    /** Vertical bob in px. */
    bob: number;
    facingBack: boolean;
    /** 1 = facing right, -1 = facing left. */
    flip: number;
    /** Whole-body lean around the feet, radians (idle animation). */
    lean?: number;
    /** Squash (+) / stretch (-) around the feet, about -0.1..0.1. */
    squash?: number;
    /** Head tilt around the neck, radians. */
    headTilt?: number;
    /** Back (left) arm angle override, radians; 0 hangs down. */
    armBack?: number;
    /** Front (right) arm angle override, radians; 0 hangs down. */
    armFront?: number;
    /** Eyes closed (blink). */
    blink?: boolean;
}

export const CHARACTER_INK = '#1d2238';

export const CHARACTER_SHIRTS: Record<string, [string, string]> = {
    amber: ['#f5a623', '#c77f0c'],
    coral: ['#e85d75', '#b8394f'],
    teal: ['#1aab8a', '#11806a'],
    violet: ['#6c5ce7', '#4b3cc0'],
};

export const GENDERS = ['boy', 'girl'] as const;

export const SKIN_TONES: Record<string, string> = {
    light: '#ffdcb8',
    tan: '#f1bf8c',
    brown: '#c98b5a',
    dark: '#8d5a37',
};

export const HAIR_COLORS: Record<string, string> = {
    brown: '#6b3f22',
    black: '#272233',
    blonde: '#f2c14e',
    red: '#d9572b',
    blue: '#3d7be0',
    pink: '#f07ab4',
    teal: '#22b3a5',
};

export const STANDING_POSE: CharacterPose = {
    phase: 0,
    bob: 0,
    facingBack: false,
    flip: 1,
};

/** Height of the character in px from feet (y=0) to the top of tall hats. */
export const CHARACTER_HEIGHT = 80;

const LINE = 2.2;

function shade(hex: string, amount: number): string {
    const value = hex.replace('#', '');
    const full =
        value.length === 3
            ? value
                  .split('')
                  .map((c) => c + c)
                  .join('')
            : value;
    const num = parseInt(full, 16);
    if (Number.isNaN(num)) {
        return hex;
    }
    const channel = (shift: number) => {
        const c = (num >> shift) & 255;
        const next = amount < 0 ? c * (1 + amount) : c + (255 - c) * amount;
        return Math.max(0, Math.min(255, Math.round(next)));
    };
    return `#${[channel(16), channel(8), channel(0)].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

/** Fills the current path and strokes it with the ink outline. */
function ink(ctx: CanvasRenderingContext2D, fill: string, width = LINE): void {
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = width;
    ctx.strokeStyle = CHARACTER_INK;
    ctx.lineJoin = 'round';
    ctx.stroke();
}

function roundRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
): void {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
}

function circle(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    r: number,
): void {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
}

function poly(ctx: CanvasRenderingContext2D, points: number[]): void {
    ctx.beginPath();
    ctx.moveTo(points[0], points[1]);
    for (let i = 2; i < points.length; i += 2) {
        ctx.lineTo(points[i], points[i + 1]);
    }
    ctx.closePath();
}

/** Resolves the legacy accessory into shop items. */
export function resolveItems(
    look: CharacterLook,
): Partial<Record<ItemSlot, ItemLook>> {
    const items: Partial<Record<ItemSlot, ItemLook>> = {};
    for (const [slot, item] of Object.entries(look.items ?? {})) {
        if (item) {
            items[slot as ItemSlot] = item;
        }
    }
    if (!look.items) {
        if (look.accessory === 'cap') {
            items.hat = { style: 'cap', color: '#ffffff' };
        }
        if (look.accessory === 'glasses') {
            items.face = { style: 'glasses' };
        }
    }
    return items;
}

const HEAD_X = 1;
const HEAD_Y = -50;
const HEAD_R = 17;
/** Pivot for head tilts: where the head meets the shirt. */
const NECK_Y = -33;

function drawBack(
    ctx: CanvasRenderingContext2D,
    item: ItemLook,
    phase: number,
): void {
    const color = item.color ?? '#d6453d';
    if (item.style === 'wings') {
        for (const side of [-1, 1]) {
            ctx.save();
            ctx.scale(side, 1);
            ctx.rotate(-0.08 + phase * 0.05);
            ctx.beginPath();
            ctx.moveTo(4, -30);
            ctx.quadraticCurveTo(26, -52, 30, -34);
            ctx.quadraticCurveTo(28, -22, 18, -18);
            ctx.quadraticCurveTo(14, -24, 4, -20);
            ctx.closePath();
            ctx.globalAlpha = 0.9;
            ink(ctx, color, 1.8);
            ctx.globalAlpha = 1;
            ctx.restore();
        }
        return;
    }
    ctx.beginPath();
    ctx.moveTo(-11, -32);
    ctx.lineTo(11, -32);
    ctx.quadraticCurveTo(21 - phase * 3, -16, 21 - phase * 4, -1);
    ctx.lineTo(-21 - phase * 4, -1);
    ctx.quadraticCurveTo(-21 - phase * 3, -16, -11, -32);
    ctx.closePath();
    ink(ctx, shade(color, -0.12));
}

function drawLegs(
    ctx: CanvasRenderingContext2D,
    phase: number,
    boots: string,
): void {
    for (const [x, swing] of [
        [-7, phase],
        [2, -phase],
    ] as const) {
        roundRect(ctx, x, -14 + swing * 2, 6, 14 - swing * 2, 2.5);
        ink(ctx, '#2b3150', 1.8);
        roundRect(ctx, x - 1, -4 - swing, 8, 4.5, 2);
        ink(ctx, boots, 1.8);
    }
}

function drawOutfit(
    ctx: CanvasRenderingContext2D,
    item: ItemLook | undefined,
    shirtColor: string,
): string {
    const style = item?.style ?? 'tunic';
    const [shirt, shirtDark] = CHARACTER_SHIRTS[shirtColor] ?? [
        shirtColor,
        shade(shirtColor, -0.25),
    ];
    const color = item?.color ?? shirt;
    switch (style) {
        case 'robe':
            poly(ctx, [-10, -32, 10, -32, 14, -3, -14, -3]);
            ink(ctx, color);
            ctx.fillStyle = '#f2c14e';
            ctx.fillRect(-1.5, -31, 3, 28);
            ctx.fillRect(-13, -7, 26, 2.5);
            return color;
        case 'dress':
            roundRect(ctx, -10, -32, 20, 14, 6);
            ink(ctx, color);
            poly(ctx, [-9, -19, 9, -19, 15, -6, -15, -6]);
            ink(ctx, shade(color, 0.15));
            ctx.fillStyle = '#ff7eb6';
            ctx.fillRect(-9, -20.5, 18, 3);
            return color;
        case 'armor':
            roundRect(ctx, -12, -32, 24, 20, 6);
            ink(ctx, color);
            poly(ctx, [-8, -30, 8, -30, 6, -16, -6, -16]);
            ink(ctx, shade(color, 0.25), 1.6);
            ctx.fillStyle = '#f2c14e';
            ctx.fillRect(-12, -15, 24, 3);
            circle(ctx, -12, -30, 5);
            ink(ctx, shade(color, -0.15), 1.8);
            circle(ctx, 12, -30, 5);
            ink(ctx, shade(color, -0.15), 1.8);
            return color;
        case 'leather':
            roundRect(ctx, -11, -32, 22, 20, 6);
            ink(ctx, color);
            ctx.fillStyle = shade(color, -0.3);
            ctx.fillRect(-11, -18, 22, 3.5);
            ctx.fillStyle = '#c9ced6';
            for (const x of [-6, 0, 6]) {
                circle(ctx, x, -26, 1.3);
                ctx.fill();
            }
            ctx.fillStyle = '#f2c14e';
            ctx.fillRect(-2, -18.5, 4, 4.5);
            return color;
        default:
            roundRect(ctx, -11, -32, 22, 20, 6);
            ink(ctx, shirt);
            ctx.fillStyle = shirtDark;
            ctx.fillRect(-11, -17, 22, 3);
            return shirt;
    }
}

function drawArm(
    ctx: CanvasRenderingContext2D,
    x: number,
    angle: number,
    sleeve: string,
    skin: string,
): void {
    ctx.save();
    ctx.translate(x, -29);
    ctx.rotate(angle);
    roundRect(ctx, -3, 0, 6, 11, 3);
    ink(ctx, shade(sleeve, -0.12), 1.8);
    circle(ctx, 0, 12.5, 3.2);
    ink(ctx, skin, 1.6);
    ctx.restore();
}

function drawHairBack(
    ctx: CanvasRenderingContext2D,
    girl: boolean,
    hair: string,
    facingBack: boolean,
): void {
    if (!girl) {
        return;
    }
    ctx.beginPath();
    if (facingBack) {
        ctx.moveTo(HEAD_X - 17, HEAD_Y - 2);
        ctx.quadraticCurveTo(
            HEAD_X - 20,
            HEAD_Y + 20,
            HEAD_X - 11,
            HEAD_Y + 26,
        );
        ctx.lineTo(HEAD_X + 11, HEAD_Y + 26);
        ctx.quadraticCurveTo(HEAD_X + 20, HEAD_Y + 20, HEAD_X + 17, HEAD_Y - 2);
    } else {
        ctx.moveTo(HEAD_X - 15, HEAD_Y - 6);
        ctx.quadraticCurveTo(
            HEAD_X - 23,
            HEAD_Y + 14,
            HEAD_X - 15,
            HEAD_Y + 26,
        );
        ctx.quadraticCurveTo(HEAD_X - 8, HEAD_Y + 24, HEAD_X - 5, HEAD_Y + 14);
        ctx.lineTo(HEAD_X - 2, HEAD_Y + 4);
    }
    ctx.closePath();
    ink(ctx, shade(hair, -0.08));
}

function drawHead(
    ctx: CanvasRenderingContext2D,
    skin: string,
    girl: boolean,
    hair: string,
    facingBack: boolean,
    hat: string | null,
    blink = false,
): void {
    const covered = hat !== null && !['flower', 'circlet'].includes(hat);
    circle(ctx, HEAD_X, HEAD_Y, HEAD_R);
    ink(ctx, skin);
    if (facingBack) {
        ctx.beginPath();
        ctx.arc(HEAD_X, HEAD_Y, HEAD_R, Math.PI * 0.95, Math.PI * 2.05);
        ctx.quadraticCurveTo(HEAD_X + 14, HEAD_Y + 14, HEAD_X, HEAD_Y + 15);
        ctx.quadraticCurveTo(HEAD_X - 14, HEAD_Y + 14, HEAD_X - 17, HEAD_Y);
        ctx.closePath();
        ink(ctx, hair);
        return;
    }
    if (hat !== 'hood') {
        circle(ctx, HEAD_X - 9, HEAD_Y + 2, 3.5);
        ink(ctx, shade(skin, -0.06), 1.6);
    }
    // Eyes: big and determined (a short curve while blinking).
    for (const ex of [6, 13]) {
        if (blink) {
            ctx.strokeStyle = CHARACTER_INK;
            ctx.lineWidth = 1.8;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(HEAD_X + ex - 2.4, HEAD_Y + 1.2);
            ctx.quadraticCurveTo(
                HEAD_X + ex,
                HEAD_Y + 2.6,
                HEAD_X + ex + 2.4,
                HEAD_Y + 1.2,
            );
            ctx.stroke();
            continue;
        }
        ctx.beginPath();
        ctx.ellipse(HEAD_X + ex, HEAD_Y + 1, 2.4, 3.6, 0, 0, Math.PI * 2);
        ctx.fillStyle = CHARACTER_INK;
        ctx.fill();
        circle(ctx, HEAD_X + ex + 0.8, HEAD_Y - 0.4, 1);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
    }
    ctx.strokeStyle = CHARACTER_INK;
    ctx.lineCap = 'round';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(HEAD_X + 3, HEAD_Y - 6);
    ctx.lineTo(HEAD_X + 8.5, HEAD_Y - 4.5);
    ctx.moveTo(HEAD_X + 15.5, HEAD_Y - 6);
    ctx.lineTo(HEAD_X + 11, HEAD_Y - 4.5);
    ctx.stroke();
    if (girl) {
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(HEAD_X + 15, HEAD_Y - 1);
        ctx.lineTo(HEAD_X + 17, HEAD_Y - 2.5);
        ctx.moveTo(HEAD_X + 4, HEAD_Y - 1.5);
        ctx.lineTo(HEAD_X + 2.5, HEAD_Y - 3);
        ctx.stroke();
    }
    circle(ctx, HEAD_X + 15, HEAD_Y + 7, 2.4);
    ctx.fillStyle = 'rgba(255, 120, 130, 0.55)';
    ctx.fill();
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(HEAD_X + 10, HEAD_Y + 7, 2.6, 0.25, Math.PI - 0.25);
    ctx.stroke();

    // Hair front. Girls keep a side-swept fringe low on the forehead so it
    // stays visible under hats.
    if (girl) {
        ctx.beginPath();
        ctx.moveTo(HEAD_X - 17, HEAD_Y + 4);
        ctx.arc(HEAD_X, HEAD_Y, HEAD_R + 1, Math.PI, Math.PI * 2);
        ctx.lineTo(HEAD_X + 18, HEAD_Y - 2);
        ctx.quadraticCurveTo(HEAD_X + 13, HEAD_Y - 6, HEAD_X + 8, HEAD_Y - 4);
        ctx.quadraticCurveTo(HEAD_X + 2, HEAD_Y - 1, HEAD_X - 4, HEAD_Y - 5);
        ctx.quadraticCurveTo(HEAD_X - 11, HEAD_Y + 1, HEAD_X - 17, HEAD_Y + 4);
        ctx.closePath();
        ink(ctx, hair);
        return;
    }
    if (covered && !girl) {
        ctx.beginPath();
        ctx.moveTo(HEAD_X - 17, HEAD_Y + 2);
        ctx.arc(HEAD_X, HEAD_Y, HEAD_R + 0.5, Math.PI * 1.02, Math.PI * 1.9);
        ctx.lineTo(HEAD_X + 12, HEAD_Y - 6);
        ctx.lineTo(HEAD_X + 6, HEAD_Y - 3);
        ctx.lineTo(HEAD_X, HEAD_Y - 7);
        ctx.lineTo(HEAD_X - 8, HEAD_Y - 3);
        ctx.closePath();
        ink(ctx, hair);
        return;
    }
    poly(ctx, [
        HEAD_X - 17,
        HEAD_Y + 2,
        HEAD_X - 19,
        HEAD_Y - 12,
        HEAD_X - 11,
        HEAD_Y - 15,
        HEAD_X - 10,
        HEAD_Y - 24,
        HEAD_X - 2,
        HEAD_Y - 18,
        HEAD_X + 4,
        HEAD_Y - 26,
        HEAD_X + 8,
        HEAD_Y - 17,
        HEAD_X + 17,
        HEAD_Y - 20,
        HEAD_X + 17,
        HEAD_Y - 9,
        HEAD_X + 19,
        HEAD_Y - 4,
        HEAD_X + 10,
        HEAD_Y - 8,
        HEAD_X + 5,
        HEAD_Y - 4,
        HEAD_X - 2,
        HEAD_Y - 8,
        HEAD_X - 9,
        HEAD_Y - 4,
    ]);
    ink(ctx, hair);
}

function drawFace(ctx: CanvasRenderingContext2D, item: ItemLook): void {
    ctx.strokeStyle = item.color ?? CHARACTER_INK;
    if (item.style === 'mask') {
        roundRect(ctx, HEAD_X + 1, HEAD_Y - 4, 17, 8, 4);
        ink(ctx, item.color ?? '#1d2238', 1.6);
        for (const ex of [6, 13]) {
            circle(ctx, HEAD_X + ex, HEAD_Y, 1.6);
            ctx.fillStyle = '#ffffff';
            ctx.fill();
        }
        return;
    }
    ctx.lineWidth = 1.8;
    ctx.strokeStyle = CHARACTER_INK;
    circle(ctx, HEAD_X + 6, HEAD_Y + 1, 4.2);
    ctx.stroke();
    circle(ctx, HEAD_X + 14, HEAD_Y + 1, 4.2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(HEAD_X + 10.2, HEAD_Y);
    ctx.lineTo(HEAD_X + 9.8, HEAD_Y);
    ctx.stroke();
}

function drawHat(ctx: CanvasRenderingContext2D, item: ItemLook): void {
    const color = item.color ?? '#ffffff';
    const top = HEAD_Y - HEAD_R;
    switch (item.style) {
        case 'flower':
            for (let i = 0; i < 5; i++) {
                const a = (i / 5) * Math.PI * 2;
                circle(
                    ctx,
                    HEAD_X - 9 + Math.cos(a) * 3.6,
                    top + 5 + Math.sin(a) * 3.6,
                    2.8,
                );
                ink(ctx, color, 1.4);
            }
            circle(ctx, HEAD_X - 9, top + 5, 2.2);
            ink(ctx, '#ffd93d', 1.2);
            return;
        case 'hood':
            ctx.beginPath();
            ctx.arc(HEAD_X, HEAD_Y, HEAD_R + 3, Math.PI * 0.82, Math.PI * 2.08);
            ctx.lineTo(HEAD_X + 18, HEAD_Y - 3);
            ctx.quadraticCurveTo(
                HEAD_X + 6,
                HEAD_Y - 14,
                HEAD_X - 6,
                HEAD_Y - 8,
            );
            ctx.quadraticCurveTo(
                HEAD_X - 11,
                HEAD_Y + 4,
                HEAD_X - 14,
                HEAD_Y + 12,
            );
            ctx.closePath();
            ink(ctx, color);
            return;
        case 'wizard':
            ctx.beginPath();
            ctx.ellipse(HEAD_X, top + 4, 24, 5.5, 0, 0, Math.PI * 2);
            ink(ctx, shade(color, -0.1));
            ctx.beginPath();
            ctx.moveTo(HEAD_X - 13, top + 3);
            ctx.quadraticCurveTo(HEAD_X - 4, top - 20, HEAD_X - 12, top - 30);
            ctx.quadraticCurveTo(HEAD_X + 8, top - 18, HEAD_X + 13, top + 3);
            ctx.closePath();
            ink(ctx, color);
            ctx.beginPath();
            ctx.moveTo(HEAD_X - 12, top - 1);
            ctx.lineTo(HEAD_X + 12.5, top - 1);
            ctx.lineTo(HEAD_X + 12.8, top + 3);
            ctx.lineTo(HEAD_X - 12.6, top + 3);
            ctx.closePath();
            ink(ctx, '#a0672e', 1.6);
            return;
        case 'helmet':
            ctx.beginPath();
            ctx.ellipse(HEAD_X, top + 9, 23, 5, 0, 0, Math.PI * 2);
            ink(ctx, shade(color, -0.12));
            ctx.beginPath();
            ctx.arc(HEAD_X, top + 9, 17, Math.PI, 0);
            ctx.closePath();
            ink(ctx, color);
            ctx.fillStyle = shade(color, 0.35);
            ctx.fillRect(HEAD_X - 1.5, top - 7, 3, 15);
            return;
        case 'circlet':
            ctx.beginPath();
            ctx.moveTo(HEAD_X - 16, HEAD_Y - 7);
            ctx.quadraticCurveTo(
                HEAD_X + 2,
                HEAD_Y - 14,
                HEAD_X + 18,
                HEAD_Y - 7,
            );
            ctx.lineWidth = 5;
            ctx.strokeStyle = CHARACTER_INK;
            ctx.stroke();
            ctx.lineWidth = 3;
            ctx.strokeStyle = color;
            ctx.stroke();
            poly(ctx, [
                HEAD_X + 7,
                HEAD_Y - 16,
                HEAD_X + 10,
                HEAD_Y - 11,
                HEAD_X + 7,
                HEAD_Y - 6,
                HEAD_X + 4,
                HEAD_Y - 11,
            ]);
            ink(ctx, '#2bd4c4', 1.4);
            return;
        case 'horned':
            for (const side of [-1, 1]) {
                ctx.beginPath();
                ctx.moveTo(HEAD_X + side * 14, top + 6);
                ctx.quadraticCurveTo(
                    HEAD_X + side * 26,
                    top + 2,
                    HEAD_X + side * 24,
                    top - 12,
                );
                ctx.quadraticCurveTo(
                    HEAD_X + side * 20,
                    top - 2,
                    HEAD_X + side * 10,
                    top + 1,
                );
                ctx.closePath();
                ink(ctx, '#f4ead2', 1.8);
            }
            ctx.beginPath();
            ctx.arc(HEAD_X, top + 10, 18, Math.PI, 0);
            ctx.closePath();
            ink(ctx, color);
            ctx.fillStyle = '#f2c14e';
            ctx.fillRect(HEAD_X - 18, top + 7, 36, 3.5);
            return;
        case 'crown':
            poly(ctx, [
                HEAD_X - 13,
                top + 4,
                HEAD_X - 15,
                top - 10,
                HEAD_X - 7,
                top - 3,
                HEAD_X,
                top - 14,
                HEAD_X + 7,
                top - 3,
                HEAD_X + 15,
                top - 10,
                HEAD_X + 13,
                top + 4,
            ]);
            ink(ctx, color);
            for (const [gx, c] of [
                [-7, '#e74c3c'],
                [0, '#3d7be0'],
                [7, '#2bb5a3'],
            ] as const) {
                circle(ctx, HEAD_X + gx, top + 0.5, 1.8);
                ctx.fillStyle = c;
                ctx.fill();
            }
            return;
        default:
            ctx.beginPath();
            ctx.ellipse(HEAD_X, top + 3, 17, 8, 0, Math.PI, 0);
            ctx.closePath();
            ink(ctx, color);
            ctx.beginPath();
            ctx.ellipse(HEAD_X + 11, top + 5, 8, 3.2, 0.15, 0, Math.PI * 2);
            ink(ctx, '#23304f', 1.6);
            circle(ctx, HEAD_X, top - 5, 2.5);
            ctx.fillStyle = '#ffd93d';
            ctx.fill();
    }
}

function drawShield(ctx: CanvasRenderingContext2D, item: ItemLook): void {
    const color = item.color ?? '#c0392b';
    circle(ctx, -13, -21, 9);
    ink(ctx, '#c9a227');
    circle(ctx, -13, -21, 6.5);
    ink(ctx, color, 1.4);
    poly(ctx, [-13, -26, -10, -21, -13, -16, -16, -21]);
    ctx.fillStyle = '#f4ead2';
    ctx.fill();
}

function drawWeapon(ctx: CanvasRenderingContext2D, item: ItemLook): void {
    const color = item.color ?? '#d7dde6';
    const wood = '#8a5a2b';
    ctx.save();
    ctx.translate(15, -17);
    switch (item.style) {
        case 'wand':
            ctx.rotate(0.6);
            roundRect(ctx, -1.5, -24, 3, 26, 1.5);
            ink(ctx, '#f4ead2', 1.6);
            poly(
                ctx,
                [
                    0, -34, 2.6, -28, 8, -27, 3.8, -23.5, 5, -18, 0, -21, -5,
                    -18, -3.8, -23.5, -8, -27, -2.6, -28,
                ],
            );
            ink(ctx, color, 1.6);
            break;
        case 'bow':
            ctx.translate(2, -10);
            ctx.beginPath();
            ctx.arc(-17, 0, 18, -1.1, 1.1);
            ctx.lineWidth = 5;
            ctx.strokeStyle = CHARACTER_INK;
            ctx.stroke();
            ctx.lineWidth = 3;
            ctx.strokeStyle = color;
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(-17 + 18 * Math.cos(-1.1), 18 * Math.sin(-1.1));
            ctx.lineTo(-17 + 18 * Math.cos(1.1), 18 * Math.sin(1.1));
            ctx.lineWidth = 1;
            ctx.strokeStyle = '#f4ead2';
            ctx.stroke();
            roundRect(ctx, -2.5, -4, 5, 8, 2);
            ink(ctx, '#6b3f22', 1.4);
            break;
        case 'staff':
            ctx.rotate(0.3);
            roundRect(ctx, -2, -48, 4, 56, 2);
            ink(ctx, color ?? wood, 1.8);
            ctx.beginPath();
            ctx.arc(0, -50, 6, Math.PI * 0.9, Math.PI * 2.1);
            ctx.lineWidth = 4;
            ctx.strokeStyle = CHARACTER_INK;
            ctx.stroke();
            ctx.lineWidth = 2.4;
            ctx.strokeStyle = color;
            ctx.stroke();
            circle(ctx, 0, -50, 3.5);
            ink(ctx, '#7de3ff', 1.4);
            break;
        case 'spear':
            ctx.rotate(0.3);
            roundRect(ctx, -1.6, -46, 3.2, 56, 1.6);
            ink(ctx, wood, 1.6);
            poly(ctx, [0, -60, 5, -48, 0, -44, -5, -48]);
            ink(ctx, color, 1.6);
            break;
        case 'mace':
            ctx.rotate(0.65);
            roundRect(ctx, -1.8, -20, 3.6, 24, 1.8);
            ink(ctx, wood, 1.6);
            for (let i = 0; i < 8; i++) {
                const a = (i / 8) * Math.PI * 2;
                poly(ctx, [
                    Math.cos(a - 0.25) * 6,
                    -25 + Math.sin(a - 0.25) * 6,
                    Math.cos(a) * 10.5,
                    -25 + Math.sin(a) * 10.5,
                    Math.cos(a + 0.25) * 6,
                    -25 + Math.sin(a + 0.25) * 6,
                ]);
                ink(ctx, '#c9ced6', 1.2);
            }
            circle(ctx, 0, -25, 7);
            ink(ctx, color, 1.8);
            break;
        case 'axe':
            ctx.rotate(0.65);
            roundRect(ctx, -1.8, -30, 3.6, 36, 1.8);
            ink(ctx, wood, 1.6);
            for (const side of [-1, 1]) {
                ctx.beginPath();
                ctx.moveTo(0, -30);
                ctx.quadraticCurveTo(side * 14, -36, side * 13, -24);
                ctx.quadraticCurveTo(side * 12, -14, 0, -20);
                ctx.closePath();
                ink(ctx, color, 1.8);
            }
            break;
        default:
            ctx.rotate(0.6);
            roundRect(ctx, -2.5, -32, 5, 28, 2);
            ink(ctx, color, 1.8);
            poly(ctx, [-2.5, -32, 0, -37, 2.5, -32]);
            ink(ctx, color, 1.8);
            roundRect(ctx, -6.5, -5, 13, 3.5, 1.5);
            ink(ctx, '#f2c14e', 1.6);
            roundRect(ctx, -1.6, -1.5, 3.2, 6, 1.2);
            ink(ctx, '#6b3f22', 1.4);
    }
    ctx.restore();
}

/** Draws the character with its feet at (x, y). */
export function drawCharacter(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    look: CharacterLook,
    pose: CharacterPose = STANDING_POSE,
): void {
    const { phase, bob, facingBack, flip } = pose;
    const squash = pose.squash ?? 0;
    const headTilt = pose.headTilt ?? 0;
    const items = resolveItems(look);
    const girl = look.gender === 'girl';
    const skin = SKIN_TONES[look.skin ?? ''] ?? SKIN_TONES.light;
    const hair =
        HAIR_COLORS[look.hair ?? ''] ??
        (girl ? HAIR_COLORS.brown : HAIR_COLORS.brown);

    ctx.save();
    ctx.translate(x, y - bob);
    if (pose.lean) {
        ctx.rotate(pose.lean);
    }
    if (squash) {
        ctx.scale(1 + squash * 0.6, 1 - squash);
    }
    ctx.scale(flip, 1);

    if (items.back && !facingBack) {
        drawBack(ctx, items.back, phase);
    }
    drawLegs(ctx, phase, '#5b3a22');
    if (items.offhand && facingBack) {
        drawShield(ctx, items.offhand);
    }
    const sleeve = drawOutfit(ctx, items.outfit, look.color);
    if (items.back?.style === 'cape' && !facingBack) {
        poly(ctx, [-11, -32, 11, -32, 7, -26, -7, -26]);
        ink(ctx, items.back.color ?? '#d6453d', 1.8);
        circle(ctx, 0, -29, 2.4);
        ink(ctx, '#f2c14e', 1.4);
    }
    drawArm(ctx, -11, pose.armBack ?? 0.3 + phase * 0.35, sleeve, skin);
    if (items.offhand && !facingBack) {
        drawShield(ctx, items.offhand);
    }
    ctx.save();
    if (headTilt) {
        ctx.translate(HEAD_X, NECK_Y);
        ctx.rotate(headTilt);
        ctx.translate(-HEAD_X, -NECK_Y);
    }
    drawHairBack(ctx, girl, hair, facingBack);
    drawHead(
        ctx,
        skin,
        girl,
        hair,
        facingBack,
        items.hat?.style ?? null,
        pose.blink ?? false,
    );
    if (items.face && !facingBack) {
        drawFace(ctx, items.face);
    }
    if (items.hat) {
        drawHat(ctx, items.hat);
    }
    ctx.restore();
    if (items.weapon) {
        drawWeapon(ctx, items.weapon);
    }
    drawArm(ctx, 11, pose.armFront ?? -0.3 - phase * 0.35, sleeve, skin);
    if (items.back && facingBack) {
        drawBack(ctx, items.back, phase);
    }
    ctx.restore();
}
