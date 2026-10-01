/**
 * Single source of truth for drawing the player character. Used by the Flag Quest
 * renderer (in-world sprite) and by the portal/dashboard avatar component, so the
 * character looks identical everywhere.
 */

export interface CharacterLook {
    color: string;
    accessory: string;
}

export interface CharacterPose {
    /** Walk cycle phase in -1..1 (0 = standing). */
    phase: number;
    /** Vertical bob in px. */
    bob: number;
    facingBack: boolean;
    /** 1 = facing right, -1 = facing left. */
    flip: number;
}

export const CHARACTER_INK = '#1d2238';

export const CHARACTER_SHIRTS: Record<string, [string, string]> = {
    amber: ['#f5a623', '#c77f0c'],
    coral: ['#e85d75', '#b8394f'],
    teal: ['#1aab8a', '#11806a'],
    violet: ['#6c5ce7', '#4b3cc0'],
};

export const STANDING_POSE: CharacterPose = {
    phase: 0,
    bob: 0,
    facingBack: false,
    flip: 1,
};

/** Height of the character in px from feet (y=0) to the top of the cap. */
export const CHARACTER_HEIGHT = 72;

function fillRoundRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
): void {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fill();
}

/** Draws the character with its feet at (x, y). */
export function drawCharacter(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    look: CharacterLook,
    pose: CharacterPose = STANDING_POSE,
): void {
    const [shirt, shirtDark] =
        CHARACTER_SHIRTS[look.color] ?? CHARACTER_SHIRTS.amber;
    const { phase, bob, facingBack, flip } = pose;

    ctx.save();
    ctx.translate(x, y - bob);
    ctx.scale(flip, 1);
    ctx.fillStyle = '#2b3150';
    ctx.fillRect(-7, -16 + phase * 2, 5, 16 - phase * 2);
    ctx.fillRect(2, -16 - phase * 2, 5, 16 + phase * 2);
    ctx.fillStyle = CHARACTER_INK;
    ctx.fillRect(-8, -2 + phase, 7, 3);
    ctx.fillRect(1, -2 - phase, 7, 3);

    ctx.fillStyle = shirtDark;
    fillRoundRect(ctx, -12, -38, 24, 24, 7);
    ctx.fillStyle = shirt;
    fillRoundRect(ctx, -11, -38, 20, 22, 7);
    ctx.fillStyle = shirtDark;
    ctx.save();
    ctx.translate(-12, -34);
    ctx.rotate(0.25 + phase * 0.35);
    fillRoundRect(ctx, -4, 0, 7, 16, 3);
    ctx.restore();
    ctx.save();
    ctx.translate(12, -34);
    ctx.rotate(-0.25 - phase * 0.35);
    fillRoundRect(ctx, -3, 0, 7, 16, 3);
    ctx.restore();

    ctx.fillStyle = '#ffd6ad';
    ctx.beginPath();
    ctx.arc(0, -52, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3b2616';
    ctx.beginPath();
    ctx.arc(0, facingBack ? -53 : -56, 15, Math.PI, 0);
    ctx.fill();
    if (facingBack) {
        ctx.beginPath();
        ctx.arc(0, -52, 15, 0, Math.PI);
        ctx.fill();
    } else {
        ctx.fillStyle = CHARACTER_INK;
        ctx.beginPath();
        ctx.arc(3, -50, 2.2, 0, Math.PI * 2);
        ctx.arc(10, -50, 2.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ff9f9f';
        ctx.beginPath();
        ctx.arc(12, -45, 2.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = CHARACTER_INK;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(7, -45, 3, 0.2, Math.PI - 0.2);
        ctx.stroke();
    }
    if (look.accessory === 'cap') {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.ellipse(0, -66, 17, 7, 0, Math.PI, 0);
        ctx.fill();
        ctx.fillRect(-15, -66, 30, 5);
        ctx.fillStyle = '#23304f';
        ctx.fillRect(-15, -63, 30, 4);
        ctx.beginPath();
        ctx.ellipse(10, -59, 9, 3, 0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffd93d';
        ctx.beginPath();
        ctx.arc(0, -68, 2.5, 0, Math.PI * 2);
        ctx.fill();
    }
    if (look.accessory === 'glasses' && !facingBack) {
        ctx.strokeStyle = CHARACTER_INK;
        ctx.lineWidth = 1.8;
        ctx.strokeRect(-1, -54, 8, 7);
        ctx.strokeRect(8, -54, 8, 7);
    }
    ctx.restore();
}
