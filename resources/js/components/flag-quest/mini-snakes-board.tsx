import PlayerCharacter from '@/components/player-character';
import { useTranslations } from '@/hooks/use-translations';
import { type CharacterLook } from '@/lib/character/draw-character';

/** Tile centre in the 1000×1000 viewBox for a boustrophedon board. */
export function miniBoardPoint(
    position: number,
    cols: number,
    rows: number,
): { x: number; y: number } {
    const row = Math.floor((position - 1) / cols);
    const column = (position - 1) % cols;
    const stepX = 700 / (cols - 1);
    const stepY = 660 / (rows - 1);
    return {
        x: 150 + (row % 2 === 0 ? column : cols - 1 - column) * stepX,
        y: 905 - row * stepY,
    };
}

interface Props {
    size: number;
    cols: number;
    jumps: [number, number][];
    position: number;
    look: CharacterLook;
    moving: boolean;
    jumping: boolean;
}

/**
 * Compact version of the illustrated snakes & ladders board (same art style as
 * /games/snakes-and-ladders) sized for the Flag Quest challenge dialog.
 */
export default function MiniSnakesBoard({
    size,
    cols,
    jumps,
    position,
    look,
    moving,
    jumping,
}: Props) {
    const { t } = useTranslations();
    const rows = Math.ceil(size / cols);
    const point = (n: number) => miniBoardPoint(n, cols, rows);
    const stepX = 700 / (cols - 1);
    const stepY = 660 / (rows - 1);
    const tileW = stepX - 22;
    const tileH = stepY - 34;
    const ladders = jumps.filter(([from, to]) => to > from);
    const snakes = jumps.filter(([from, to]) => to < from);
    const pawn = point(position);

    return (
        <div className="relative mx-auto aspect-square w-full max-w-[min(260px,34dvh)] [@media(max-height:500px)_and_(orientation:landscape)]:w-[min(240px,calc(100dvh-13rem))] [@media(max-height:500px)_and_(orientation:landscape)]:max-w-none">
            <svg
                data-testid="fq-snakes-board"
                viewBox="0 0 1000 1000"
                className="block size-full rounded-2xl border-[3px] border-[#151b2e]"
                role="img"
                aria-label={t('flagQuest.challenge.boardLabel', {
                    position,
                })}
            >
                <defs>
                    <linearGradient id="fq-board-sky" x2="0" y2="1">
                        <stop stopColor="#a9dce4" />
                        <stop offset="1" stopColor="#e2f3de" />
                    </linearGradient>
                </defs>
                <rect
                    width="1000"
                    height="1000"
                    rx="24"
                    fill="url(#fq-board-sky)"
                />
                {[
                    { x: 30, y: 60 },
                    { x: 850, y: 48 },
                ].map(({ x, y }) => (
                    <g
                        key={x}
                        transform={`translate(${x} ${y})`}
                        fill="#fffef2"
                    >
                        <ellipse cx="52" cy="24" rx="52" ry="20" />
                        <circle cx="34" cy="11" r="22" />
                        <circle cx="66" cy="5" r="30" />
                    </g>
                ))}
                <path
                    d="M0 963Q140 870 290 960Q510 860 720 959Q880 885 1000 943V1000H0Z"
                    fill="#89b877"
                />
                <path
                    d="M0 987Q150 941 330 983Q610 932 830 988L1000 969V1000H0Z"
                    fill="#659859"
                />
                <g transform="translate(265 34) rotate(-2 235 45)">
                    <rect
                        x="7"
                        y="9"
                        width="470"
                        height="92"
                        rx="8"
                        fill="#d2ac43"
                    />
                    <rect
                        width="470"
                        height="92"
                        rx="8"
                        fill="#ffe47b"
                        stroke="#fff3b3"
                        strokeWidth="6"
                    />
                    <text
                        x="235"
                        y="61"
                        textAnchor="middle"
                        fontFamily="system-ui"
                        fontSize="40"
                        fontWeight="900"
                        fill="#2e422c"
                        textLength={410}
                        lengthAdjust="spacingAndGlyphs"
                    >
                        {t('flagQuest.challenge.boardTitle')}
                    </text>
                </g>
                {Array.from({ length: rows }, (_, row) => (
                    <path
                        key={`row-${row}`}
                        d={`M150 ${905 - row * stepY}H850`}
                        stroke="#fffce8"
                        strokeWidth={tileH + 24}
                        strokeLinecap="round"
                    />
                ))}
                {Array.from({ length: rows - 1 }, (_, row) => {
                    const right = row % 2 === 0;
                    const x = right ? 850 : 150;
                    const y = 905 - row * stepY;
                    const bulge = right ? 95 : -95;
                    return (
                        <path
                            key={`turn-${row}`}
                            d={`M${x} ${y}C${x + bulge} ${y} ${x + bulge} ${y - stepY} ${x} ${y - stepY}`}
                            fill="none"
                            stroke="#fffce8"
                            strokeWidth={tileH + 16}
                        />
                    );
                })}
                {Array.from({ length: size }, (_, i) => {
                    const n = i + 1;
                    const { x, y } = point(n);
                    return (
                        <g key={n} data-tile={n}>
                            <rect
                                x={x - tileW / 2}
                                y={y - tileH / 2}
                                width={tileW}
                                height={tileH}
                                rx="16"
                                fill={
                                    n === 1 || n === size
                                        ? '#ffe17c'
                                        : n % 2
                                          ? '#b6cf94'
                                          : '#91b277'
                                }
                            />
                            {(n === 1 || n === size) && (
                                <text
                                    x={x}
                                    y={y + tileH / 2 - 14}
                                    textAnchor="middle"
                                    fontSize="24"
                                    fontWeight="900"
                                    fill="#3d512e"
                                    fontFamily="system-ui"
                                >
                                    {n === 1
                                        ? t('flagQuest.challenge.start')
                                        : t('flagQuest.challenge.finish')}
                                </text>
                            )}
                        </g>
                    );
                })}
                {ladders.map(([from, to]) => {
                    const a = point(from);
                    const b = point(to);
                    const length = Math.hypot(b.x - a.x, b.y - a.y);
                    const angle =
                        (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI - 90;
                    const rungs = Math.max(3, Math.floor(length / 42));
                    return (
                        <g
                            key={`l-${from}`}
                            data-ladder={`${from}-${to}`}
                            transform={`translate(${a.x} ${a.y}) rotate(${angle})`}
                        >
                            <path
                                d={`M-20 0V${length}M20 0V${length}`}
                                stroke="#486760"
                                strokeWidth="15"
                                strokeLinecap="round"
                            />
                            <path
                                d={`M-20 0V${length}M20 0V${length}`}
                                stroke="#dcb783"
                                strokeWidth="8"
                                strokeLinecap="round"
                            />
                            {Array.from({ length: rungs }, (_, i) => (
                                <path
                                    key={i}
                                    d={`M-20 ${((i + 0.5) * length) / rungs}H20`}
                                    stroke="#fff0bf"
                                    strokeWidth="9"
                                />
                            ))}
                        </g>
                    );
                })}
                {snakes.map(([from, to], i) => {
                    const a = point(from);
                    const b = point(to);
                    const middle = (a.y + b.y) / 2;
                    const bend = i % 2 ? 80 : -80;
                    const d = `M${a.x} ${a.y} C${a.x + bend} ${middle - 50} ${b.x - bend} ${middle + 50} ${b.x} ${b.y}`;
                    const color = i % 2 ? '#e4a245' : '#e76866';
                    return (
                        <g key={`s-${from}`} data-snake={`${from}-${to}`}>
                            <path
                                d={d}
                                stroke="#9b614d"
                                strokeWidth="34"
                                fill="none"
                                strokeLinecap="round"
                            />
                            <path
                                d={d}
                                stroke={color}
                                strokeWidth="27"
                                fill="none"
                                strokeLinecap="round"
                            />
                            <path
                                d={d}
                                stroke="#ffe3a1"
                                strokeWidth="5"
                                strokeDasharray="3 24"
                                fill="none"
                                strokeLinecap="round"
                            />
                            <ellipse
                                cx={a.x}
                                cy={a.y}
                                rx="27"
                                ry="22"
                                fill={color}
                                stroke="#9b614d"
                                strokeWidth="4"
                            />
                            <circle
                                cx={a.x - 9}
                                cy={a.y - 8}
                                r="7"
                                fill="white"
                            />
                            <circle
                                cx={a.x + 9}
                                cy={a.y - 8}
                                r="7"
                                fill="white"
                            />
                            <circle
                                cx={a.x - 9}
                                cy={a.y - 9}
                                r="3.2"
                                fill="#263d32"
                            />
                            <circle
                                cx={a.x + 9}
                                cy={a.y - 9}
                                r="3.2"
                                fill="#263d32"
                            />
                            <path
                                d={`M${a.x - 7} ${a.y + 8}Q${a.x} ${a.y + 15} ${a.x + 7} ${a.y + 8}`}
                                stroke="#713e35"
                                strokeWidth="3.5"
                                fill="none"
                            />
                        </g>
                    );
                })}
                {Array.from({ length: size }, (_, i) => {
                    const n = i + 1;
                    const { x, y } = point(n);
                    return (
                        <text
                            key={`label-${n}`}
                            x={x - tileW / 2 + 12}
                            y={y - tileH / 2 + 36}
                            fontSize="34"
                            fontWeight="900"
                            fill="#263f2e"
                            stroke="#eaf0ce"
                            strokeWidth="5"
                            paintOrder="stroke"
                            fontFamily="system-ui"
                        >
                            {n}
                        </text>
                    );
                })}
            </svg>
            <div
                data-testid="fq-snakes-pawn"
                data-position={position}
                className={`pointer-events-none absolute w-[15%] ${moving ? 'fq-pawn-hop' : ''}`}
                style={{
                    left: `${pawn.x / 10}%`,
                    top: `${pawn.y / 10}%`,
                    transform: 'translate(-50%, -82%)',
                    transition: jumping
                        ? 'left 600ms cubic-bezier(.34,1.56,.64,1), top 600ms cubic-bezier(.34,1.56,.64,1)'
                        : moving
                          ? 'left 290ms linear, top 290ms linear'
                          : 'none',
                }}
            >
                <PlayerCharacter
                    character={look}
                    backdrop={false}
                    className="w-full"
                />
            </div>
        </div>
    );
}
