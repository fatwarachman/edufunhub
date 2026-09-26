export const BLOCK_SKINS = [
    {
        name: 'Penjelajah Merah',
        color: '#e86265',
        bg: 'bg-[#e86265]',
        hair: '#4a302b',
    },
    {
        name: 'Pilot Biru',
        color: '#4299c9',
        bg: 'bg-[#4299c9]',
        hair: '#243e56',
    },
    {
        name: 'Kreator Ungu',
        color: '#9270c4',
        bg: 'bg-[#9270c4]',
        hair: '#432e59',
    },
    {
        name: 'Petualang Hijau',
        color: '#43a47c',
        bg: 'bg-[#43a47c]',
        hair: '#684431',
    },
];

export function MiniBlockAvatar({
    skinIndex,
    walking = false,
}: {
    skinIndex: number;
    walking?: boolean;
}) {
    const skin = BLOCK_SKINS[skinIndex % BLOCK_SKINS.length];
    return (
        <svg
            viewBox="0 0 64 80"
            className="h-full w-full overflow-visible"
            fill="none"
            aria-hidden="true"
        >
            <ellipse
                cx="32"
                cy="75"
                rx="24"
                ry="4"
                fill="#18352b"
                opacity="0.2"
            />
            <g stroke="#253e43" strokeWidth="1.5" strokeLinejoin="round">
                <g>
                    {walking && (
                        <animateTransform
                            attributeName="transform"
                            type="rotate"
                            values="-9 24 51;9 24 51;-9 24 51"
                            dur="0.32s"
                            repeatCount="indefinite"
                        />
                    )}
                    <path d="M18 49H30V71H18Z" fill="#344e70" />
                    <path d="M18 67H30V74H15V70Z" fill="#20364b" />
                </g>
                <g>
                    {walking && (
                        <animateTransform
                            attributeName="transform"
                            type="rotate"
                            values="9 39 51;-9 39 51;9 39 51"
                            dur="0.32s"
                            repeatCount="indefinite"
                        />
                    )}
                    <path d="M34 49H46V71H34Z" fill="#344e70" />
                    <path d="M34 67H46L49 70V74H34Z" fill="#20364b" />
                </g>
                <path d="M17 28L32 24L47 28V53H17Z" fill={skin.color} />
                <path
                    d="M32 24L47 28V53L41 49V30Z"
                    fill="#172e3c"
                    opacity="0.18"
                    stroke="none"
                />
                <path d="M17 29L7 32V50H17Z" fill={skin.color} />
                <path d="M47 29L57 32V50H47Z" fill={skin.color} />
                <rect
                    x="7"
                    y="45"
                    width="10"
                    height="11"
                    rx="2"
                    fill="#f7cd8e"
                />
                <rect
                    x="47"
                    y="45"
                    width="10"
                    height="11"
                    rx="2"
                    fill="#f7cd8e"
                />
                <path
                    d="M19 6L26 2H43L48 7V25L42 30H23L19 26Z"
                    fill="#f7cd8e"
                />
                <path
                    d="M43 7L48 7V25L42 30V10Z"
                    fill="#dca86c"
                    stroke="none"
                />
                <path
                    d="M18 7L25 1H43L49 7V13L40 10L35 7L28 11L18 13Z"
                    fill={skin.hair}
                />
                <path
                    d="M25 17V19M36 17V19"
                    strokeWidth="3"
                    strokeLinecap="round"
                />
                <path d="M27 23Q31 26 35 23" strokeLinecap="round" />
                <path d="M26 34H37V43H26Z" fill="#fff8dd" stroke="none" />
                <path
                    d="M29 37H34M29 40H33"
                    stroke={skin.color}
                    strokeWidth="2"
                />
            </g>
        </svg>
    );
}
