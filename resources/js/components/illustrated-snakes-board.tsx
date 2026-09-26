import { MiniBlockAvatar } from '@/components/mini-block-avatar';
import { BOARD_LADDERS, BOARD_SNAKES, boardPoint } from '@/lib/snakes-board';

interface BoardPlayer {
    id: number;
    name: string;
    position: number;
    skinIndex: number;
}

export function IllustratedSnakesBoard({
    players,
    moving,
    activeId,
}: {
    players: BoardPlayer[];
    moving: boolean;
    activeId: number;
}) {
    return (
        <svg
            data-testid="snake-board"
            viewBox="0 0 1000 1000"
            className="block aspect-square w-full rounded-2xl"
            role="img"
            aria-label="Papan ular tangga 100 petak, jalur hijau, ular dan tangga"
        >
            <defs>
                <linearGradient id="board-sky" x2="0" y2="1">
                    <stop stopColor="#a9dce4" />
                    <stop offset="1" stopColor="#e2f3de" />
                </linearGradient>
            </defs>
            <rect width="1000" height="1000" rx="24" fill="url(#board-sky)" />
            {[
                { x: 58, y: 78 },
                { x: 838, y: 58 },
                { x: 2, y: 401 },
                { x: 907, y: 650 },
            ].map(({ x, y }) => (
                <g key={x} transform={`translate(${x} ${y})`} fill="#fffef2">
                    <ellipse cx="42" cy="20" rx="42" ry="16" />
                    <circle cx="28" cy="9" r="18" />
                    <circle cx="54" cy="4" r="24" />
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
            <g transform="translate(229 38) rotate(-2 270 40)">
                <rect
                    x="7"
                    y="9"
                    width="542"
                    height="80"
                    rx="6"
                    fill="#d2ac43"
                />
                <rect
                    width="542"
                    height="80"
                    rx="6"
                    fill="#ffe47b"
                    stroke="#fff3b3"
                    strokeWidth="6"
                />
                <text
                    x="271"
                    y="52"
                    textAnchor="middle"
                    fontFamily="system-ui"
                    fontSize="41"
                    fontWeight="900"
                    fill="#2e422c"
                >
                    ULAR &amp; TANGGA
                </text>
            </g>
            <g transform="translate(125 69) rotate(-16)">
                <rect
                    width="57"
                    height="57"
                    rx="10"
                    fill="#fffdf1"
                    stroke="#64867e"
                    strokeWidth="3"
                />
                {[
                    [14, 14],
                    [43, 14],
                    [28, 28],
                    [14, 43],
                    [43, 43],
                ].map(([x, y]) => (
                    <circle
                        key={`${x}-${y}`}
                        cx={x}
                        cy={y}
                        r="4"
                        fill="#3d5146"
                    />
                ))}
            </g>
            <g transform="translate(810 29) rotate(15)">
                <path d="M0 0V88M35 0V88" stroke="#ab7851" strokeWidth="8" />
                {[12, 32, 52, 72].map((y) => (
                    <path
                        key={y}
                        d={`M0 ${y}H35`}
                        stroke="#fff3ce"
                        strokeWidth="6"
                    />
                ))}
            </g>
            {Array.from({ length: 10 }, (_, row) => (
                <path
                    key={`row-${row}`}
                    d={`M94 ${918 - row * 82}H904`}
                    stroke="#fffce8"
                    strokeWidth="75"
                    strokeLinecap="round"
                />
            ))}
            {Array.from({ length: 9 }, (_, row) => {
                const right = row % 2 === 0;
                const x = right ? 904 : 94;
                const y = 918 - row * 82;
                return (
                    <path
                        key={`turn-${row}`}
                        d={`M${x} ${y}C${x + (right ? 65 : -65)} ${y} ${x + (right ? 65 : -65)} ${y - 82} ${x} ${y - 82}`}
                        fill="none"
                        stroke="#fffce8"
                        strokeWidth="70"
                    />
                );
            })}
            {Array.from({ length: 100 }, (_, i) => {
                const number = i + 1;
                const { x, y } = boardPoint(number);
                return (
                    <g key={number} data-tile={number}>
                        <rect
                            x={x - 40}
                            y={y - 30}
                            width="80"
                            height="60"
                            rx="9"
                            fill={
                                number === 1 || number === 100
                                    ? '#ffe17c'
                                    : number % 2
                                      ? '#b6cf94'
                                      : '#91b277'
                            }
                        />
                        {number === 1 && (
                            <text
                                x={x}
                                y={y + 22}
                                textAnchor="middle"
                                fontSize="13"
                                fontWeight="900"
                                fill="#3d512e"
                            >
                                START
                            </text>
                        )}
                        {number === 100 && (
                            <text
                                x={x}
                                y={y + 22}
                                textAnchor="middle"
                                fontSize="13"
                                fontWeight="900"
                                fill="#3d512e"
                            >
                                FINISH
                            </text>
                        )}
                    </g>
                );
            })}
            {Object.entries(BOARD_LADDERS).map(([from, to]) => {
                const a = boardPoint(Number(from));
                const b = boardPoint(to);
                const length = Math.hypot(b.x - a.x, b.y - a.y);
                const angle =
                    (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI - 90;
                const rungs = Math.max(3, Math.floor(length / 22));
                return (
                    <g
                        key={from}
                        data-ladder={`${from}-${to}`}
                        transform={`translate(${a.x} ${a.y}) rotate(${angle})`}
                    >
                        <title>
                            Tangga: {from} ke {to}
                        </title>
                        <path
                            d={`M-11 0V${length}M11 0V${length}`}
                            stroke="#486760"
                            strokeWidth="8"
                            strokeLinecap="round"
                        />
                        <path
                            d={`M-11 0V${length}M11 0V${length}`}
                            stroke="#dcb783"
                            strokeWidth="4"
                            strokeLinecap="round"
                        />
                        {Array.from({ length: rungs }, (_, i) => (
                            <path
                                key={i}
                                d={`M-11 ${((i + 0.5) * length) / rungs}H11`}
                                stroke="#fff0bf"
                                strokeWidth="5"
                            />
                        ))}
                    </g>
                );
            })}
            {Object.entries(BOARD_SNAKES).map(([from, to], i) => {
                const a = boardPoint(Number(from));
                const b = boardPoint(to);
                const middle = (a.y + b.y) / 2;
                const bend = i % 2 ? 42 : -42;
                const d = `M${a.x} ${a.y} C${a.x + bend} ${middle - 30} ${b.x - bend} ${middle + 30} ${b.x} ${b.y}`;
                const color = i % 2 ? '#e4a245' : '#e76866';
                return (
                    <g key={from} data-snake={`${from}-${to}`}>
                        <title>
                            Ular: {from} turun ke {to}
                        </title>
                        <path
                            d={d}
                            stroke="#9b614d"
                            strokeWidth="19"
                            fill="none"
                            strokeLinecap="round"
                        />
                        <path
                            d={d}
                            stroke={color}
                            strokeWidth="15"
                            fill="none"
                            strokeLinecap="round"
                        />
                        <path
                            d={d}
                            stroke="#ffe3a1"
                            strokeWidth="3"
                            strokeDasharray="2 14"
                            fill="none"
                            strokeLinecap="round"
                        />
                        <ellipse
                            cx={a.x}
                            cy={a.y}
                            rx="15"
                            ry="12"
                            fill={color}
                            stroke="#9b614d"
                            strokeWidth="2"
                        />
                        <circle cx={a.x - 5} cy={a.y - 5} r="4" fill="white" />
                        <circle cx={a.x + 5} cy={a.y - 5} r="4" fill="white" />
                        <circle
                            cx={a.x - 5}
                            cy={a.y - 6}
                            r="1.8"
                            fill="#263d32"
                        />
                        <circle
                            cx={a.x + 5}
                            cy={a.y - 6}
                            r="1.8"
                            fill="#263d32"
                        />
                        <path
                            d={`M${a.x - 4} ${a.y + 5}Q${a.x} ${a.y + 9} ${a.x + 4} ${a.y + 5}`}
                            stroke="#713e35"
                            strokeWidth="2"
                            fill="none"
                        />
                    </g>
                );
            })}
            {Array.from({ length: 100 }, (_, i) => {
                const n = i + 1;
                const { x, y } = boardPoint(n);
                return (
                    <text
                        key={`label-${n}`}
                        x={x - 33}
                        y={y - 11}
                        fontSize="20"
                        fontWeight="900"
                        fill="#263f2e"
                        stroke="#eaf0ce"
                        strokeWidth="3"
                        paintOrder="stroke"
                        fontFamily="system-ui"
                    >
                        {n}
                    </text>
                );
            })}
            {players.map((p) => {
                const { x, y } = boardPoint(p.position);
                const peers = players.filter(
                    (other) => other.position === p.position,
                );
                const order = peers.findIndex((other) => other.id === p.id);
                const crowded = peers.length > 1;
                const width = crowded ? 26 : 39;
                const height = crowded ? 32 : 49;
                return (
                    <g
                        key={p.id}
                        data-testid={`token-${p.id}`}
                        data-position={p.position}
                        style={{
                            transform: `translate(${x + (crowded ? (order % 2) * 31 - 31 : -10)}px,${y + (crowded ? Math.floor(order / 2) * 33 - 32 : -30)}px)`,
                            transition: moving
                                ? 'transform 290ms linear'
                                : 'none',
                        }}
                    >
                        <title>
                            {p.name}, petak {p.position}
                        </title>
                        <svg
                            width={width}
                            height={height}
                            viewBox="0 0 64 80"
                            overflow="visible"
                        >
                            <MiniBlockAvatar
                                skinIndex={p.skinIndex}
                                walking={moving && activeId === p.id}
                            />
                        </svg>
                        <circle
                            cx={width - 2}
                            cy={height - 3}
                            r="7"
                            fill="#fffce8"
                            stroke="#36563d"
                            strokeWidth="1"
                        />
                        <text
                            x={width - 2}
                            y={height + 1}
                            textAnchor="middle"
                            fontSize="10"
                            fontWeight="900"
                            fill="#263f2e"
                        >
                            {p.id + 1}
                        </text>
                    </g>
                );
            })}
        </svg>
    );
}
