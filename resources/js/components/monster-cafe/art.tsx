import { useId, type JSX, type ReactNode } from 'react';

export type MonsterKind =
    'SLIME' | 'CYCLOPS' | 'VAMPIRE' | 'YETI' | 'DRAGON' | 'GHOST';
export type Ingredient =
    | 'BUN'
    | 'PATTY'
    | 'CHEESE'
    | 'LETTUCE'
    | 'TOMATO'
    | 'SAUCE'
    | 'DOUGH'
    | 'MUSHROOM'
    | 'PEPPERONI'
    | 'OLIVE';
export type Dish = 'BURGER' | 'PIZZA' | 'MESS';
export type Mood = 'HAPPY' | 'IMPATIENT' | 'ANGRY';

export const INGREDIENTS: Ingredient[] = [
    'BUN',
    'PATTY',
    'CHEESE',
    'LETTUCE',
    'TOMATO',
    'SAUCE',
    'DOUGH',
    'MUSHROOM',
    'PEPPERONI',
    'OLIVE',
];

export const MONSTERS: MonsterKind[] = [
    'SLIME',
    'CYCLOPS',
    'VAMPIRE',
    'YETI',
    'DRAGON',
    'GHOST',
];

const INK = '#2b2140';

/** Main fill colour per ingredient, also used for generic layers and toppings. */
export const INGREDIENT_COLORS: Record<Ingredient, string> = {
    BUN: '#f2a541',
    PATTY: '#7c3f22',
    CHEESE: '#facc15',
    LETTUCE: '#4ade80',
    TOMATO: '#ef4444',
    SAUCE: '#dc2626',
    DOUGH: '#fde3b0',
    MUSHROOM: '#a16207',
    PEPPERONI: '#c81e1e',
    OLIVE: '#4b5563',
};

function cleanId(raw: string): string {
    return raw.replace(/[^a-zA-Z0-9_-]/g, '');
}

/** Bumpy closed path around a centre, used for fur, cheese and splats. */
function bumpyPath(
    cx: number,
    cy: number,
    radius: number,
    bump: number,
    count: number,
    jitter: number[] = [],
): string {
    const points: Array<[number, number]> = [];
    const controls: Array<[number, number]> = [];

    for (let index = 0; index < count; index++) {
        const angle = (index / count) * Math.PI * 2;
        const mid = ((index + 0.5) / count) * Math.PI * 2;
        const extra = jitter.length > 0 ? jitter[index % jitter.length] : 0;
        points.push([
            cx + Math.cos(angle) * radius,
            cy + Math.sin(angle) * radius,
        ]);
        controls.push([
            cx + Math.cos(mid) * (radius + bump + extra),
            cy + Math.sin(mid) * (radius + bump + extra),
        ]);
    }

    const round = (value: number) => Math.round(value * 10) / 10;
    let path = `M${round(points[0][0])} ${round(points[0][1])}`;

    for (let index = 0; index < count; index++) {
        const next = points[(index + 1) % count];
        const control = controls[index];
        path += ` Q${round(control[0])} ${round(control[1])} ${round(next[0])} ${round(next[1])}`;
    }

    return `${path} Z`;
}

/** Horizontal wavy band (lettuce frill). */
function wavyBand(
    left: number,
    right: number,
    top: number,
    height: number,
): string {
    const waves = 8;
    const step = (right - left) / waves;
    let path = `M${left} ${top + 3}`;

    for (let index = 0; index < waves; index++) {
        const x = left + step * index;
        path += ` Q${x + step / 2} ${top + (index % 2 === 0 ? -3 : 4)} ${x + step} ${top + 2}`;
    }

    path += ` L${right} ${top + height}`;

    for (let index = waves; index > 0; index--) {
        const x = left + step * index;
        path += ` Q${x - step / 2} ${top + height + (index % 2 === 0 ? 4 : 1)} ${x - step} ${top + height}`;
    }

    return `${path} Z`;
}

/* ------------------------------------------------------------------ */
/* Monsters                                                            */
/* ------------------------------------------------------------------ */

type EyeSpec = { x: number; y: number; r: number; side: -1 | 0 | 1 };

type FaceSpec = {
    eyes: EyeSpec[];
    mouth: { x: number; y: number; w: number };
    cheeks: Array<[number, number]>;
    sweat: [number, number];
    anger: [number, number];
    lid: string;
    pupil?: string;
    fangs?: boolean;
};

function Eye({
    eye,
    mood,
    lid,
    pupil,
}: {
    eye: EyeSpec;
    mood: Mood;
    lid: string;
    pupil: string;
}) {
    const { x, y, r, side } = eye;
    const pupilShiftX = mood === 'IMPATIENT' ? r * 0.3 : 0;
    const pupilShiftY = mood === 'ANGRY' ? r * 0.15 : r * 0.08;
    let brow: string | null = null;

    if (mood === 'ANGRY') {
        if (side === 0) {
            brow = `M${x - r * 1.1} ${y - r * 1.35} L${x} ${y - r * 0.8} L${x + r * 1.1} ${y - r * 1.35}`;
        } else if (side < 0) {
            brow = `M${x - r * 1.1} ${y - r * 1.5} L${x + r * 1.1} ${y - r * 0.85}`;
        } else {
            brow = `M${x - r * 1.1} ${y - r * 0.85} L${x + r * 1.1} ${y - r * 1.5}`;
        }
    }

    return (
        <g>
            <circle
                cx={x}
                cy={y}
                r={r}
                fill="#ffffff"
                stroke={INK}
                strokeWidth={2}
            />
            <circle
                cx={x + pupilShiftX}
                cy={y + pupilShiftY}
                r={r * 0.55}
                fill={pupil}
            />
            <circle
                cx={x + pupilShiftX - r * 0.2}
                cy={y + pupilShiftY - r * 0.22}
                r={r * 0.2}
                fill="#ffffff"
            />
            {mood === 'IMPATIENT' && (
                <path
                    d={`M${x - r - 0.6} ${y - r * 0.05} A${r + 0.6} ${r + 0.6} 0 0 1 ${x + r + 0.6} ${y - r * 0.05} Z`}
                    fill={lid}
                    stroke={INK}
                    strokeWidth={2}
                    strokeLinejoin="round"
                />
            )}
            {brow && (
                <path
                    d={brow}
                    fill="none"
                    stroke={INK}
                    strokeWidth={3.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />
            )}
        </g>
    );
}

function Mouth({
    x,
    y,
    w,
    mood,
    fangs,
}: {
    x: number;
    y: number;
    w: number;
    mood: Mood;
    fangs?: boolean;
}) {
    if (mood === 'IMPATIENT') {
        return (
            <g>
                <path
                    d={`M${x - w * 0.8} ${y + 2} q${w * 0.4} -4 ${w * 0.8} 0 t${w * 0.8} 0`}
                    fill="none"
                    stroke={INK}
                    strokeWidth={3}
                    strokeLinecap="round"
                />
                {fangs && (
                    <path
                        d={`M${x - w * 0.45} ${y + 1.5} l2.5 5 l2.5 -5 Z M${x + w * 0.45 - 5} ${y + 1.5} l2.5 5 l2.5 -5 Z`}
                        fill="#ffffff"
                        stroke={INK}
                        strokeWidth={1.2}
                        strokeLinejoin="round"
                    />
                )}
            </g>
        );
    }

    if (mood === 'ANGRY') {
        const top = y + w * 0.25;

        return (
            <g>
                <path
                    d={`M${x - w} ${y + w * 0.7} Q${x} ${y - w * 0.45} ${x + w} ${y + w * 0.7} Z`}
                    fill="#4a1426"
                    stroke={INK}
                    strokeWidth={2}
                    strokeLinejoin="round"
                />
                <path
                    d={`M${x - w * 0.45} ${top - 0.5} l${w * 0.18} ${w * 0.28} l${w * 0.18} ${-w * 0.3} Z M${x + w * 0.09} ${top - 0.6} l${w * 0.18} ${w * 0.28} l${w * 0.18} ${-w * 0.26} Z`}
                    fill="#ffffff"
                />
                {fangs && (
                    <path
                        d={`M${x - w * 0.7} ${y + w * 0.5} l2.5 5 l2.5 -5 Z M${x + w * 0.7 - 5} ${y + w * 0.5} l2.5 5 l2.5 -5 Z`}
                        fill="#ffffff"
                        stroke={INK}
                        strokeWidth={1.2}
                        strokeLinejoin="round"
                    />
                )}
            </g>
        );
    }

    return (
        <g>
            <path
                d={`M${x - w} ${y} Q${x} ${y + w * 1.35} ${x + w} ${y} Z`}
                fill="#5b1f33"
                stroke={INK}
                strokeWidth={2}
                strokeLinejoin="round"
            />
            <ellipse
                cx={x}
                cy={y + w * 0.45}
                rx={w * 0.38}
                ry={w * 0.17}
                fill="#f47b9a"
            />
            {fangs && (
                <path
                    d={`M${x - w * 0.6} ${y} l2.5 5.5 l2.5 -5.5 Z M${x + w * 0.6 - 5} ${y} l2.5 5.5 l2.5 -5.5 Z`}
                    fill="#ffffff"
                    stroke={INK}
                    strokeWidth={1.2}
                    strokeLinejoin="round"
                />
            )}
        </g>
    );
}

function Face({ face, mood }: { face: FaceSpec; mood: Mood }) {
    const pupil = face.pupil ?? INK;
    const [sweatX, sweatY] = face.sweat;
    const [angerX, angerY] = face.anger;

    return (
        <g>
            {mood === 'HAPPY' &&
                face.cheeks.map(([cx, cy]) => (
                    <ellipse
                        key={`${cx}-${cy}`}
                        cx={cx}
                        cy={cy}
                        rx={5}
                        ry={3}
                        fill="#ff8fab"
                        opacity={0.75}
                    />
                ))}
            {face.eyes.map((eye) => (
                <Eye
                    key={`${eye.x}-${eye.y}`}
                    eye={eye}
                    mood={mood}
                    lid={face.lid}
                    pupil={pupil}
                />
            ))}
            <Mouth {...face.mouth} mood={mood} fangs={face.fangs} />
            {mood === 'IMPATIENT' && (
                <path
                    d={`M${sweatX} ${sweatY} q5.5 8 0 11.5 q-5.5 -3.5 0 -11.5 Z`}
                    fill="#7cc6ff"
                    stroke={INK}
                    strokeWidth={1.5}
                    strokeLinejoin="round"
                />
            )}
            {mood === 'ANGRY' && (
                <g
                    stroke="#e11d48"
                    strokeWidth={3}
                    fill="none"
                    strokeLinecap="round"
                >
                    <path
                        d={`M${angerX - 7} ${angerY - 2} q5 0 5 -5 M${angerX + 2} ${angerY - 7} q0 5 5 5 M${angerX + 7} ${angerY + 2} q-5 0 -5 5 M${angerX - 2} ${angerY + 7} q0 -5 -5 -5`}
                    />
                </g>
            )}
        </g>
    );
}

const YETI_FUR = bumpyPath(50, 56, 34, 7, 16);

const MONSTER_FACES: Record<MonsterKind, FaceSpec> = {
    SLIME: {
        eyes: [
            { x: 38, y: 52, r: 9, side: -1 },
            { x: 62, y: 52, r: 9, side: 1 },
        ],
        mouth: { x: 50, y: 68, w: 10 },
        cheeks: [
            [27, 64],
            [73, 64],
        ],
        sweat: [80, 34],
        anger: [77, 30],
        lid: '#22a35a',
    },
    CYCLOPS: {
        eyes: [{ x: 50, y: 44, r: 14, side: 0 }],
        mouth: { x: 50, y: 69, w: 11 },
        cheeks: [
            [28, 60],
            [72, 60],
        ],
        sweat: [80, 30],
        anger: [76, 26],
        lid: '#7c5cd6',
    },
    VAMPIRE: {
        eyes: [
            { x: 40, y: 54, r: 7.5, side: -1 },
            { x: 60, y: 54, r: 7.5, side: 1 },
        ],
        mouth: { x: 50, y: 69, w: 9 },
        cheeks: [
            [31, 64],
            [69, 64],
        ],
        sweat: [80, 40],
        anger: [74, 26],
        lid: '#c9c0dc',
        pupil: '#9f1239',
        fangs: true,
    },
    YETI: {
        eyes: [
            { x: 41, y: 54, r: 7, side: -1 },
            { x: 59, y: 54, r: 7, side: 1 },
        ],
        mouth: { x: 50, y: 67, w: 8 },
        cheeks: [
            [32, 64],
            [68, 64],
        ],
        sweat: [82, 36],
        anger: [78, 28],
        lid: '#93c5fd',
    },
    DRAGON: {
        eyes: [
            { x: 37, y: 45, r: 8.5, side: -1 },
            { x: 63, y: 45, r: 8.5, side: 1 },
        ],
        mouth: { x: 50, y: 75, w: 8 },
        cheeks: [
            [26, 58],
            [74, 58],
        ],
        sweat: [84, 36],
        anger: [80, 30],
        lid: '#0f9488',
    },
    GHOST: {
        eyes: [
            { x: 39, y: 44, r: 7.5, side: -1 },
            { x: 61, y: 44, r: 7.5, side: 1 },
        ],
        mouth: { x: 50, y: 60, w: 8 },
        cheeks: [
            [29, 54],
            [71, 54],
        ],
        sweat: [80, 28],
        anger: [76, 22],
        lid: '#cbd5e1',
    },
};

function MonsterBody({ kind }: { kind: MonsterKind }) {
    const outline = {
        stroke: INK,
        strokeWidth: 2.5,
        strokeLinejoin: 'round' as const,
    };

    switch (kind) {
        case 'SLIME':
            return (
                <g>
                    <ellipse
                        cx={50}
                        cy={93}
                        rx={34}
                        ry={4}
                        fill="#000"
                        opacity={0.14}
                    />
                    <path
                        d="M14 82 C10 60 22 22 50 20 C78 22 90 60 86 82 C86 88 80 90 76 87 C72 93 66 93 62 88 C56 94 44 94 38 88 C34 93 28 93 24 87 C20 90 14 88 14 82 Z"
                        fill="#4ade80"
                        {...outline}
                    />
                    <path
                        d="M70 26 C74 18 82 16 80 10"
                        fill="none"
                        stroke={INK}
                        strokeWidth={2.5}
                        strokeLinecap="round"
                    />
                    <circle
                        cx={80}
                        cy={9}
                        r={4}
                        fill="#bbf7d0"
                        stroke={INK}
                        strokeWidth={2}
                    />
                    <ellipse
                        cx={32}
                        cy={36}
                        rx={8}
                        ry={4}
                        fill="#ffffff"
                        opacity={0.55}
                        transform="rotate(-35 32 36)"
                    />
                    <circle cx={26} cy={74} r={3} fill="#22a35a" />
                    <circle cx={74} cy={76} r={2.2} fill="#22a35a" />
                    <circle cx={68} cy={30} r={1.8} fill="#22a35a" />
                </g>
            );
        case 'CYCLOPS':
            return (
                <g>
                    <ellipse
                        cx={50}
                        cy={94}
                        rx={30}
                        ry={4}
                        fill="#000"
                        opacity={0.14}
                    />
                    <ellipse
                        cx={36}
                        cy={90}
                        rx={9}
                        ry={5}
                        fill="#7c5cd6"
                        {...outline}
                    />
                    <ellipse
                        cx={64}
                        cy={90}
                        rx={9}
                        ry={5}
                        fill="#7c5cd6"
                        {...outline}
                    />
                    <path
                        d="M17 58 C8 58 6 68 12 72 C16 68 18 64 20 63 Z M83 58 C92 58 94 68 88 72 C84 68 82 64 80 63 Z"
                        fill="#a78bfa"
                        {...outline}
                    />
                    <path
                        d="M44 18 L50 4 L56 18 Z"
                        fill="#fde68a"
                        {...outline}
                    />
                    <path
                        d="M50 15 C76 15 86 38 86 60 C86 80 72 89 50 89 C28 89 14 80 14 60 C14 38 24 15 50 15 Z"
                        fill="#a78bfa"
                        {...outline}
                    />
                    <ellipse cx={50} cy={75} rx={22} ry={11} fill="#c4b5fd" />
                    <ellipse
                        cx={30}
                        cy={30}
                        rx={6}
                        ry={3}
                        fill="#ffffff"
                        opacity={0.5}
                        transform="rotate(-40 30 30)"
                    />
                </g>
            );
        case 'VAMPIRE':
            return (
                <g>
                    <ellipse
                        cx={50}
                        cy={95}
                        rx={34}
                        ry={3.5}
                        fill="#000"
                        opacity={0.14}
                    />
                    <path
                        d="M12 93 L20 52 L35 64 L50 58 L65 64 L80 52 L88 93 Z"
                        fill="#be123c"
                        {...outline}
                    />
                    <path
                        d="M36 82 L50 70 L64 82 L50 93 Z"
                        fill="#1e1b4b"
                        {...outline}
                    />
                    <path
                        d="M24 52 L10 38 L26 62 Z M76 52 L90 38 L74 62 Z"
                        fill="#e9e3f5"
                        {...outline}
                    />
                    <ellipse
                        cx={50}
                        cy={54}
                        rx={27}
                        ry={29}
                        fill="#e9e3f5"
                        {...outline}
                    />
                    <path
                        d="M22 48 C20 24 36 17 50 17 C64 17 80 24 78 48 C72 37 62 34 56 36 L50 47 L44 36 C38 34 28 37 22 48 Z"
                        fill="#312e81"
                        {...outline}
                    />
                    <path
                        d="M32 24 C38 20 44 20 46 21"
                        fill="none"
                        stroke="#6366f1"
                        strokeWidth={2.5}
                        strokeLinecap="round"
                    />
                </g>
            );
        case 'YETI':
            return (
                <g>
                    <ellipse
                        cx={50}
                        cy={95}
                        rx={32}
                        ry={3.5}
                        fill="#000"
                        opacity={0.14}
                    />
                    <path
                        d="M29 28 Q18 14 28 8 Q30 18 38 22 Z M71 28 Q82 14 72 8 Q70 18 62 22 Z"
                        fill="#fef3c7"
                        {...outline}
                    />
                    <path d={YETI_FUR} fill="#e0f2fe" {...outline} />
                    <ellipse
                        cx={50}
                        cy={60}
                        rx={23}
                        ry={18}
                        fill="#93c5fd"
                        stroke={INK}
                        strokeWidth={2}
                    />
                    <path
                        d="M30 30 q4 -4 8 0 M58 26 q4 -4 8 0"
                        fill="none"
                        stroke="#bae6fd"
                        strokeWidth={2.5}
                        strokeLinecap="round"
                    />
                </g>
            );
        case 'DRAGON':
            return (
                <g>
                    <ellipse
                        cx={50}
                        cy={94}
                        rx={32}
                        ry={4}
                        fill="#000"
                        opacity={0.14}
                    />
                    <path
                        d="M16 50 L2 36 L5 50 L1 62 Z M84 50 L98 36 L95 50 L99 62 Z"
                        fill="#fb923c"
                        {...outline}
                    />
                    <path
                        d="M31 26 L22 6 L40 20 Z M69 26 L78 6 L60 20 Z"
                        fill="#fde68a"
                        {...outline}
                    />
                    <path
                        d="M41 20 L45 9 L50 19 Z M50 19 L55 9 L59 20 Z"
                        fill="#fb923c"
                        {...outline}
                    />
                    <path
                        d="M50 18 C74 18 86 36 86 56 C86 78 70 90 50 90 C30 90 14 78 14 56 C14 36 26 18 50 18 Z"
                        fill="#2dd4bf"
                        {...outline}
                    />
                    <ellipse
                        cx={50}
                        cy={71}
                        rx={19}
                        ry={12}
                        fill="#99f6e4"
                        stroke={INK}
                        strokeWidth={2}
                    />
                    <ellipse cx={44} cy={66} rx={2} ry={1.4} fill={INK} />
                    <ellipse cx={56} cy={66} rx={2} ry={1.4} fill={INK} />
                    <path
                        d="M24 72 l4 -3 M22 64 l4 -2 M76 72 l-4 -3 M78 64 l-4 -2"
                        stroke="#0f9488"
                        strokeWidth={2.5}
                        strokeLinecap="round"
                    />
                </g>
            );
        case 'GHOST':
        default:
            return (
                <g>
                    <ellipse
                        cx={50}
                        cy={96}
                        rx={26}
                        ry={3}
                        fill="#000"
                        opacity={0.12}
                    />
                    <path
                        d="M19 56 Q7 57 9 67 Q16 66 19 63 Z M81 56 Q93 57 91 67 Q84 66 81 63 Z"
                        fill="#f8fafc"
                        {...outline}
                    />
                    <path
                        d="M18 86 L18 46 C18 24 32 12 50 12 C68 12 82 24 82 46 L82 86 Q76 79 70 86 Q64 94 58 86 Q50 78 42 86 Q36 94 30 86 Q24 79 18 86 Z"
                        fill="#f8fafc"
                        {...outline}
                    />
                    <path
                        d="M70 22 C76 28 78 38 78 50 L78 80 Q76 79 74 81 L74 50 C74 38 72 30 70 22 Z"
                        fill="#e2e8f0"
                    />
                    <ellipse
                        cx={32}
                        cy={26}
                        rx={6}
                        ry={3}
                        fill="#ffffff"
                        transform="rotate(-40 32 26)"
                    />
                </g>
            );
    }
}

export function MonsterSprite({
    kind,
    mood = 'HAPPY',
    size = 96,
    className,
}: {
    kind: MonsterKind;
    mood?: Mood;
    size?: number;
    className?: string;
}): JSX.Element {
    return (
        <svg
            viewBox="0 0 100 100"
            width={size}
            height={size}
            className={className}
            aria-hidden="true"
            focusable="false"
            data-monster={kind}
            data-mood={mood}
        >
            <MonsterBody kind={kind} />
            <Face face={MONSTER_FACES[kind]} mood={mood} />
        </svg>
    );
}

/* ------------------------------------------------------------------ */
/* Ingredients                                                          */
/* ------------------------------------------------------------------ */

function IngredientGlyph({ ingredient }: { ingredient: Ingredient }) {
    const line = {
        stroke: INK,
        strokeWidth: 2,
        strokeLinejoin: 'round' as const,
    };

    switch (ingredient) {
        case 'BUN':
            return (
                <g>
                    <rect
                        x={6}
                        y={29}
                        width={36}
                        height={9}
                        rx={4.5}
                        fill="#e08e2b"
                        {...line}
                    />
                    <path
                        d="M6 30 C6 16 16 9 24 9 C32 9 42 16 42 30 Z"
                        fill="#f2a541"
                        {...line}
                    />
                    <g fill="#fff7e0">
                        <ellipse cx={16} cy={19} rx={1.8} ry={1} />
                        <ellipse cx={24} cy={14} rx={1.8} ry={1} />
                        <ellipse cx={32} cy={19} rx={1.8} ry={1} />
                        <ellipse cx={20} cy={25} rx={1.8} ry={1} />
                        <ellipse cx={29} cy={25} rx={1.8} ry={1} />
                    </g>
                    <path
                        d="M11 22 C12 17 15 14 18 13"
                        fill="none"
                        stroke="#fde3b0"
                        strokeWidth={2}
                        strokeLinecap="round"
                    />
                </g>
            );
        case 'PATTY':
            return (
                <g>
                    <path
                        d="M5 22 L5 29 C5 36 14 40 24 40 C34 40 43 36 43 29 L43 22 Z"
                        fill="#5c2e17"
                        {...line}
                    />
                    <ellipse
                        cx={24}
                        cy={22}
                        rx={19}
                        ry={9}
                        fill="#7c3f22"
                        {...line}
                    />
                    <path
                        d="M14 19 L19 25 M22 16 L28 23 M30 17 L35 23"
                        stroke="#4a2414"
                        strokeWidth={2.5}
                        strokeLinecap="round"
                    />
                    <path
                        d="M10 20 C12 17 15 15 19 14.5"
                        fill="none"
                        stroke="#b06b45"
                        strokeWidth={2}
                        strokeLinecap="round"
                    />
                </g>
            );
        case 'CHEESE':
            return (
                <g>
                    <path
                        d="M5 35 L43 35 L43 41 L5 41 Z"
                        fill="#eab308"
                        {...line}
                    />
                    <path d="M5 35 L43 35 L43 15 Z" fill="#facc15" {...line} />
                    <circle cx={33} cy={29} r={3} fill="#eab308" />
                    <circle cx={39} cy={23} r={1.8} fill="#eab308" />
                    <circle cx={23} cy={32} r={1.8} fill="#eab308" />
                    <circle cx={30} cy={38} r={1.5} fill="#ca8a04" />
                </g>
            );
        case 'LETTUCE':
            return (
                <g>
                    <path
                        d="M5 30 Q8 13 24 11 Q40 13 43 30 Q39 35 35 31 Q31 37 27 32 Q23 37 19 32 Q14 36 11 31 Q7 34 5 30 Z"
                        fill="#4ade80"
                        {...line}
                    />
                    <path
                        d="M24 14 L24 31 M24 21 L16 26 M24 21 L32 26 M24 27 L19 30 M24 27 L29 30"
                        fill="none"
                        stroke="#15803d"
                        strokeWidth={1.8}
                        strokeLinecap="round"
                    />
                </g>
            );
        case 'TOMATO':
            return (
                <g>
                    <circle cx={24} cy={27} r={15} fill="#ef4444" {...line} />
                    <path
                        d="M14 22 C15 18 18 15 21 14"
                        fill="none"
                        stroke="#fecaca"
                        strokeWidth={2.5}
                        strokeLinecap="round"
                    />
                    <path
                        d="M24 13 L18 9 M24 13 L30 9 M24 13 L16 15 M24 13 L32 15"
                        stroke="#15803d"
                        strokeWidth={3}
                        strokeLinecap="round"
                    />
                    <path
                        d="M24 13 L25 6"
                        stroke="#15803d"
                        strokeWidth={2.5}
                        strokeLinecap="round"
                    />
                </g>
            );
        case 'SAUCE':
            return (
                <g>
                    <path
                        d="M22 3 L26 3 L27 8 L21 8 Z"
                        fill="#fde047"
                        {...line}
                    />
                    <rect
                        x={18}
                        y={8}
                        width={12}
                        height={6}
                        rx={1.5}
                        fill="#fde047"
                        {...line}
                    />
                    <path
                        d="M14 18 Q14 14 18 14 L30 14 Q34 14 34 18 L34 40 Q34 43 31 43 L17 43 Q14 43 14 40 Z"
                        fill="#dc2626"
                        {...line}
                    />
                    <rect
                        x={17.5}
                        y={23}
                        width={13}
                        height={11}
                        rx={2}
                        fill="#fff7ed"
                    />
                    <path
                        d="M24 25 q3.5 4 0 6.5 q-3.5 -2.5 0 -6.5 Z"
                        fill="#dc2626"
                    />
                    <path
                        d="M17 18 L17 21"
                        stroke="#fca5a5"
                        strokeWidth={2}
                        strokeLinecap="round"
                    />
                </g>
            );
        case 'DOUGH':
            return (
                <g>
                    <path
                        d="M7 32 C5 21 13 13 24 13 C35 13 43 21 41 32 C39 39 9 39 7 32 Z"
                        fill="#fde3b0"
                        {...line}
                    />
                    <path
                        d="M14 30 C18 33 30 33 34 30"
                        fill="none"
                        stroke="#e7b875"
                        strokeWidth={2}
                        strokeLinecap="round"
                    />
                    <g fill="#ffffff">
                        <circle cx={17} cy={20} r={1.4} />
                        <circle cx={27} cy={18} r={1.1} />
                        <circle cx={32} cy={23} r={1.4} />
                        <circle cx={21} cy={25} r={1} />
                    </g>
                </g>
            );
        case 'MUSHROOM':
            return (
                <g>
                    <path
                        d="M18 26 L30 26 L31 39 Q24 43 17 39 Z"
                        fill="#fef3c7"
                        {...line}
                    />
                    <path
                        d="M5 26 C5 14 15 7 24 7 C33 7 43 14 43 26 Q24 31 5 26 Z"
                        fill="#a16207"
                        {...line}
                    />
                    <g fill="#fef3c7">
                        <circle cx={16} cy={18} r={2.6} />
                        <circle cx={27} cy={13} r={2.2} />
                        <circle cx={34} cy={21} r={2.4} />
                    </g>
                </g>
            );
        case 'PEPPERONI':
            return (
                <g>
                    <circle cx={24} cy={25} r={16} fill="#c81e1e" {...line} />
                    <g fill="#7f1d1d">
                        <circle cx={18} cy={20} r={2.4} />
                        <circle cx={29} cy={18} r={1.8} />
                        <circle cx={30} cy={30} r={2.6} />
                        <circle cx={19} cy={31} r={1.8} />
                        <circle cx={24} cy={25} r={1.4} />
                    </g>
                    <path
                        d="M12 20 C13 16 16 13 19 12"
                        fill="none"
                        stroke="#fca5a5"
                        strokeWidth={2.2}
                        strokeLinecap="round"
                    />
                </g>
            );
        case 'OLIVE':
        default:
            return (
                <g>
                    <circle cx={30} cy={18} r={10} fill="#4b5563" {...line} />
                    <circle cx={30} cy={18} r={3.6} fill="#d6d3d1" {...line} />
                    <circle cx={18} cy={30} r={11.5} fill="#4b5563" {...line} />
                    <circle cx={18} cy={30} r={4.2} fill="#d6d3d1" {...line} />
                    <path
                        d="M10 26 C11 23 13 21 16 20 M24 12 C25 11 27 10 29 10"
                        fill="none"
                        stroke="#9ca3af"
                        strokeWidth={2}
                        strokeLinecap="round"
                    />
                </g>
            );
    }
}

export function IngredientIcon({
    ingredient,
    size = 40,
    className,
}: {
    ingredient: Ingredient;
    size?: number;
    className?: string;
}): JSX.Element {
    return (
        <svg
            viewBox="0 0 48 48"
            width={size}
            height={size}
            className={className}
            aria-hidden="true"
            focusable="false"
            data-ingredient={ingredient}
        >
            <IngredientGlyph ingredient={ingredient} />
        </svg>
    );
}

/* ------------------------------------------------------------------ */
/* Dishes                                                              */
/* ------------------------------------------------------------------ */

type Layer = { height: number; render: (top: number) => ReactNode };

const LAYER_LINE = {
    stroke: INK,
    strokeWidth: 2,
    strokeLinejoin: 'round' as const,
};

function burgerLayer(ingredient: Ingredient, key: number): Layer {
    switch (ingredient) {
        case 'PATTY':
            return {
                height: 13,
                render: (top) => (
                    <g key={key}>
                        <rect
                            x={16}
                            y={top}
                            width={88}
                            height={13}
                            rx={6.5}
                            fill="#7c3f22"
                            {...LAYER_LINE}
                        />
                        <path
                            d={`M30 ${top + 4} l3 5 M48 ${top + 4} l3 5 M66 ${top + 4} l3 5 M84 ${top + 4} l3 5`}
                            stroke="#4a2414"
                            strokeWidth={2.5}
                            strokeLinecap="round"
                        />
                    </g>
                ),
            };
        case 'CHEESE':
            return {
                height: 5,
                render: (top) => (
                    <path
                        key={key}
                        d={`M13 ${top} L107 ${top} L107 ${top + 5} L90 ${top + 5} L86 ${top + 12} L82 ${top + 5} L42 ${top + 5} L37 ${top + 11} L32 ${top + 5} L13 ${top + 5} Z`}
                        fill="#facc15"
                        {...LAYER_LINE}
                    />
                ),
            };
        case 'LETTUCE':
            return {
                height: 7,
                render: (top) => (
                    <path
                        key={key}
                        d={wavyBand(11, 109, top, 6)}
                        fill="#4ade80"
                        {...LAYER_LINE}
                    />
                ),
            };
        case 'TOMATO':
            return {
                height: 6,
                render: (top) => (
                    <g key={key}>
                        <rect
                            x={19}
                            y={top}
                            width={40}
                            height={6}
                            rx={3}
                            fill="#ef4444"
                            {...LAYER_LINE}
                        />
                        <rect
                            x={61}
                            y={top}
                            width={40}
                            height={6}
                            rx={3}
                            fill="#ef4444"
                            {...LAYER_LINE}
                        />
                        <path
                            d={`M30 ${top + 3} h4 M44 ${top + 3} h4 M72 ${top + 3} h4 M86 ${top + 3} h4`}
                            stroke="#fecaca"
                            strokeWidth={2}
                            strokeLinecap="round"
                        />
                    </g>
                ),
            };
        case 'SAUCE':
            return {
                height: 4,
                render: (top) => (
                    <path
                        key={key}
                        d={`M17 ${top} L103 ${top} L103 ${top + 4} L74 ${top + 4} Q71 ${top + 10} 68 ${top + 4} L36 ${top + 4} Q33 ${top + 8} 30 ${top + 4} L17 ${top + 4} Z`}
                        fill="#dc2626"
                        {...LAYER_LINE}
                    />
                ),
            };
        default:
            return {
                height: 7,
                render: (top) => (
                    <rect
                        key={key}
                        x={18}
                        y={top}
                        width={84}
                        height={7}
                        rx={3.5}
                        fill={INGREDIENT_COLORS[ingredient]}
                        {...LAYER_LINE}
                    />
                ),
            };
    }
}

function BurgerStack({ items }: { items: Ingredient[] }) {
    const hasBun = items.includes('BUN');
    const layers: Layer[] = [];

    if (hasBun) {
        layers.push({
            height: 12,
            render: (top) => (
                <path
                    key="heel"
                    d={`M18 ${top} L102 ${top} Q102 ${top + 12} 90 ${top + 12} L30 ${top + 12} Q18 ${top + 12} 18 ${top} Z`}
                    fill="#e08e2b"
                    {...LAYER_LINE}
                />
            ),
        });
    }

    items
        .filter((item) => item !== 'BUN')
        .forEach((item, index) => layers.push(burgerLayer(item, index)));

    if (hasBun) {
        layers.push({
            height: 26,
            render: (top) => (
                <g key="crown">
                    <path
                        d={`M17 ${top + 26} L103 ${top + 26} Q103 ${top} 60 ${top} Q17 ${top} 17 ${top + 26} Z`}
                        fill="#f2a541"
                        {...LAYER_LINE}
                    />
                    <g fill="#fff7e0">
                        <ellipse cx={42} cy={top + 10} rx={2.2} ry={1.2} />
                        <ellipse cx={60} cy={top + 6} rx={2.2} ry={1.2} />
                        <ellipse cx={78} cy={top + 10} rx={2.2} ry={1.2} />
                        <ellipse cx={51} cy={top + 16} rx={2.2} ry={1.2} />
                        <ellipse cx={70} cy={top + 16} rx={2.2} ry={1.2} />
                    </g>
                    <path
                        d={`M28 ${top + 18} C30 ${top + 11} 36 ${top + 6} 42 ${top + 5}`}
                        fill="none"
                        stroke="#fde3b0"
                        strokeWidth={2.5}
                        strokeLinecap="round"
                    />
                </g>
            ),
        });
    }

    const total = layers.reduce((sum, layer) => sum + layer.height, 0);
    const scale = total > 90 ? 90 / total : 1;
    let bottom = 100;
    const rendered: ReactNode[] = [];

    layers.forEach((layer) => {
        const top = bottom - layer.height;
        rendered.push(layer.render(top));
        bottom = top + 0.8;
    });

    return (
        <g
            transform={
                scale < 1
                    ? `translate(${60 - 60 * scale} ${100 - 100 * scale}) scale(${scale})`
                    : undefined
            }
        >
            {rendered}
        </g>
    );
}

const PIZZA_CHEESE = bumpyPath(60, 60, 33, 5, 14, [0, 2, -1, 3, 1, -2, 2]);
const PIZZA_SAUCE = bumpyPath(60, 60, 37, 3, 18, [0, 1, -1]);

function Topping({
    ingredient,
    x,
    y,
    rotate,
}: {
    ingredient: Ingredient;
    x: number;
    y: number;
    rotate: number;
}) {
    const transform = `translate(${x} ${y}) rotate(${rotate})`;

    switch (ingredient) {
        case 'PEPPERONI':
            return (
                <g transform={transform}>
                    <circle r={6.5} fill="#c81e1e" {...LAYER_LINE} />
                    <circle cx={-2} cy={-1.5} r={1.2} fill="#7f1d1d" />
                    <circle cx={2.2} cy={2} r={1.2} fill="#7f1d1d" />
                </g>
            );
        case 'MUSHROOM':
            return (
                <g transform={transform}>
                    <path
                        d="M-6 0 C-6 -6 6 -6 6 0 Q0 1.5 -6 0 Z M-2 0.5 L2 0.5 L2.5 5 L-2.5 5 Z"
                        fill="#d6b88a"
                        {...LAYER_LINE}
                    />
                </g>
            );
        case 'OLIVE':
            return (
                <g transform={transform}>
                    <circle r={4.5} fill="#374151" {...LAYER_LINE} />
                    <circle r={1.8} fill="#fde047" />
                </g>
            );
        case 'TOMATO':
            return (
                <g transform={transform}>
                    <circle r={5.5} fill="#ef4444" {...LAYER_LINE} />
                    <circle r={2.5} fill="#fca5a5" />
                </g>
            );
        case 'LETTUCE':
            return (
                <g transform={transform}>
                    <path
                        d="M-6 2 Q-4 -5 0 -5 Q4 -5 6 2 Q3 4 0 2 Q-3 4 -6 2 Z"
                        fill="#4ade80"
                        {...LAYER_LINE}
                    />
                </g>
            );
        default:
            return (
                <g transform={transform}>
                    <rect
                        x={-5}
                        y={-3.5}
                        width={10}
                        height={7}
                        rx={3}
                        fill={INGREDIENT_COLORS[ingredient]}
                        {...LAYER_LINE}
                    />
                </g>
            );
    }
}

const TOPPING_SPOTS: Array<[number, number]> = [
    [0, 22],
    [90, 22],
    [180, 22],
    [270, 22],
    [45, 10],
    [225, 10],
];

function PizzaTop({ items }: { items: Ingredient[] }) {
    const hasDough = items.includes('DOUGH');
    const hasSauce = items.includes('SAUCE');
    const hasCheese = items.includes('CHEESE');
    const toppings = items.filter(
        (item) => !['DOUGH', 'SAUCE', 'CHEESE'].includes(item),
    );

    return (
        <g>
            <ellipse
                cx={60}
                cy={110}
                rx={42}
                ry={4}
                fill="#000"
                opacity={0.14}
            />
            {hasDough ? (
                <circle cx={60} cy={60} r={46} fill="#f3c36b" {...LAYER_LINE} />
            ) : (
                <circle
                    cx={60}
                    cy={60}
                    r={46}
                    fill="#f1f5f9"
                    stroke="#94a3b8"
                    strokeWidth={2}
                    strokeDasharray="6 5"
                />
            )}
            {hasDough && (
                <circle
                    cx={60}
                    cy={60}
                    r={40}
                    fill="#fde3b0"
                    stroke="#e7b875"
                    strokeWidth={1.5}
                />
            )}
            {hasSauce && <path d={PIZZA_SAUCE} fill="#dc2626" />}
            {hasCheese && <path d={PIZZA_CHEESE} fill="#fde047" />}
            {toppings.map((topping, toppingIndex) =>
                TOPPING_SPOTS.map(([angle, radius], spotIndex) => {
                    const turn =
                        ((angle + toppingIndex * 37 + spotIndex * 5) *
                            Math.PI) /
                        180;
                    const distance =
                        radius +
                        (toppingIndex % 2 === 0 ? 4 : -2) *
                            (spotIndex < 4 ? 1 : 0);

                    return (
                        <Topping
                            key={`${topping}-${toppingIndex}-${spotIndex}`}
                            ingredient={topping}
                            x={60 + Math.cos(turn) * distance}
                            y={60 + Math.sin(turn) * distance}
                            rotate={(spotIndex * 47 + toppingIndex * 23) % 360}
                        />
                    );
                }),
            )}
            {hasDough && (
                <path
                    d="M26 40 C30 32 38 24 48 20"
                    fill="none"
                    stroke="#fde68a"
                    strokeWidth={3}
                    strokeLinecap="round"
                />
            )}
        </g>
    );
}

const MESS_SPOTS: Array<[number, number, number]> = [
    [24, 62, -18],
    [56, 58, 12],
    [40, 44, 28],
    [72, 46, -8],
    [30, 34, 40],
    [60, 30, -30],
];

function MessPile({ items }: { items: Ingredient[] }) {
    return (
        <g>
            {items.slice(0, 6).map((item, index) => {
                const [x, y, rotate] = MESS_SPOTS[index];

                return (
                    <g
                        key={`${item}-${index}`}
                        transform={`translate(${x} ${y}) rotate(${rotate} 12 12) scale(0.55)`}
                    >
                        <IngredientGlyph ingredient={item} />
                    </g>
                );
            })}
        </g>
    );
}

function Plate() {
    return (
        <g>
            <ellipse
                cx={60}
                cy={102}
                rx={54}
                ry={11}
                fill="#f8fafc"
                {...LAYER_LINE}
            />
            <ellipse cx={60} cy={101} rx={40} ry={6.5} fill="#e2e8f0" />
        </g>
    );
}

function Smoke() {
    return (
        <g
            fill="none"
            stroke="#374151"
            strokeWidth={5}
            strokeLinecap="round"
            opacity={0.9}
        >
            <path d="M40 30 C34 22 46 18 40 8" />
            <path d="M60 26 C54 16 66 12 60 2" />
            <path d="M80 30 C74 22 86 18 80 8" />
        </g>
    );
}

export function DishView({
    dish,
    items,
    burnt = false,
    size = 120,
    className,
}: {
    dish: Dish;
    items: Ingredient[];
    burnt?: boolean;
    size?: number;
    className?: string;
}): JSX.Element {
    const filterId = `mc-char-${cleanId(useId())}`;

    let content: ReactNode;

    if (dish === 'PIZZA') {
        content = <PizzaTop items={items} />;
    } else if (dish === 'BURGER') {
        content = <BurgerStack items={items} />;
    } else {
        content = <MessPile items={items} />;
    }

    return (
        <svg
            viewBox="0 0 120 120"
            width={size}
            height={size}
            className={className}
            aria-hidden="true"
            focusable="false"
            data-dish={dish}
            data-burnt={burnt ? 'true' : 'false'}
        >
            {burnt && (
                <defs>
                    <filter id={filterId}>
                        <feColorMatrix
                            type="matrix"
                            values="0.42 0.12 0.02 0 0.02  0.16 0.24 0.02 0 0.01  0.06 0.06 0.12 0 0  0 0 0 1 0"
                        />
                    </filter>
                </defs>
            )}
            {dish !== 'PIZZA' && <Plate />}
            <g filter={burnt ? `url(#${filterId})` : undefined}>{content}</g>
            {burnt && (
                <g>
                    <g fill="#111827" opacity={0.55}>
                        <circle cx={44} cy={70} r={4} />
                        <circle cx={70} cy={62} r={3} />
                        <circle cx={58} cy={80} r={2.5} />
                    </g>
                    <Smoke />
                </g>
            )}
        </svg>
    );
}

/* ------------------------------------------------------------------ */
/* Rat & pie                                                           */
/* ------------------------------------------------------------------ */

export function RatSprite({
    size = 72,
    className,
}: {
    size?: number;
    className?: string;
}): JSX.Element {
    return (
        <svg
            viewBox="0 0 120 80"
            width={size}
            height={(size * 80) / 120}
            className={className}
            aria-hidden="true"
            focusable="false"
            data-sprite="rat"
        >
            <ellipse
                cx={58}
                cy={75}
                rx={40}
                ry={3.5}
                fill="#000"
                opacity={0.14}
            />
            <path
                d="M26 58 C6 56 4 34 18 32 C28 31 28 44 18 44"
                fill="none"
                stroke="#f9a8d4"
                strokeWidth={4.5}
                strokeLinecap="round"
            />
            <ellipse
                cx={44}
                cy={71}
                rx={7}
                ry={4}
                fill="#f9a8d4"
                {...LAYER_LINE}
            />
            <ellipse
                cx={70}
                cy={71}
                rx={7}
                ry={4}
                fill="#f9a8d4"
                {...LAYER_LINE}
            />
            <ellipse
                cx={56}
                cy={52}
                rx={33}
                ry={20}
                fill="#9ca3af"
                {...LAYER_LINE}
            />
            <ellipse cx={58} cy={60} rx={20} ry={9} fill="#d1d5db" />
            <path
                d="M76 36 C92 33 108 44 113 52 C108 59 94 62 80 61 Z"
                fill="#9ca3af"
                {...LAYER_LINE}
            />
            <circle cx={80} cy={33} r={11} fill="#9ca3af" {...LAYER_LINE} />
            <circle cx={80} cy={33} r={6.5} fill="#f9a8d4" />
            <path
                d="M84 41 C90 39 100 40 104 45 C100 50 90 51 84 49 Z"
                fill="#1f2937"
            />
            <circle cx={95} cy={45} r={3.6} fill="#ffffff" />
            <circle cx={96} cy={45} r={2} fill={INK} />
            <circle
                cx={113}
                cy={52}
                r={3.2}
                fill="#f472b6"
                stroke={INK}
                strokeWidth={1.5}
            />
            <path
                d="M106 55 L118 52 M106 57 L118 60 M104 58 L114 65"
                stroke={INK}
                strokeWidth={1.4}
                strokeLinecap="round"
            />
            <path
                d="M98 58 q3 3 6 0"
                fill="none"
                stroke={INK}
                strokeWidth={1.8}
                strokeLinecap="round"
            />
            <rect
                x={98}
                y={57.5}
                width={3}
                height={3.5}
                rx={0.6}
                fill="#ffffff"
                stroke={INK}
                strokeWidth={1}
            />
        </svg>
    );
}

const SPLAT_PATH = bumpyPath(
    100,
    100,
    78,
    20,
    14,
    [0, 8, -4, 10, 2, -6, 6, 12, -2, 4],
);
const SPLAT_INNER = bumpyPath(100, 96, 46, 12, 9, [0, 6, -3, 4]);

export function PieSplat({ className }: { className?: string }): JSX.Element {
    return (
        <svg
            viewBox="0 0 200 200"
            preserveAspectRatio="xMidYMid slice"
            className={className ?? 'h-full w-full'}
            aria-hidden="true"
            focusable="false"
            data-sprite="pie-splat"
        >
            <path
                d={SPLAT_PATH}
                fill="#fffbeb"
                stroke="#d6a26b"
                strokeWidth={4}
            />
            <g fill="#fffbeb" stroke="#f5d0a9" strokeWidth={2}>
                <path d="M54 150 L54 186 Q60 196 66 186 L66 150 Z" />
                <path d="M96 168 L96 198 Q102 206 108 198 L108 168 Z" />
                <path d="M140 152 L140 178 Q146 188 152 178 L152 152 Z" />
            </g>
            <path d={SPLAT_INNER} fill="#fef3c7" />
            <g
                fill="#e7a95b"
                stroke="#b7791f"
                strokeWidth={2}
                strokeLinejoin="round"
            >
                <path d="M30 60 L52 48 L58 62 L36 72 Z" />
                <path d="M146 40 L168 52 L160 66 L140 54 Z" />
                <path d="M150 128 L174 132 L170 146 L148 140 Z" />
            </g>
            <g>
                <path
                    d="M104 62 C106 50 112 44 120 40"
                    fill="none"
                    stroke="#15803d"
                    strokeWidth={3}
                    strokeLinecap="round"
                />
                <circle
                    cx={102}
                    cy={70}
                    r={10}
                    fill="#e11d48"
                    stroke="#9f1239"
                    strokeWidth={2}
                />
                <ellipse cx={98} cy={66} rx={3} ry={2} fill="#ffffff" />
            </g>
            <g
                fill="none"
                stroke="#f5d0a9"
                strokeWidth={3}
                strokeLinecap="round"
            >
                <path d="M70 112 C80 120 94 122 106 118" />
                <path d="M118 96 C126 104 128 114 124 122" />
            </g>
            <g fill="#ffffff" opacity={0.8}>
                <ellipse cx={84} cy={82} rx={2} ry={1.4} />
                <ellipse cx={115} cy={108} rx={1.8} ry={1.2} />
                <ellipse
                    cx={128}
                    cy={70}
                    rx={10}
                    ry={5}
                    transform="rotate(-25 128 70)"
                />
            </g>
        </svg>
    );
}
