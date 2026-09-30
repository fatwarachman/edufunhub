const colors: Record<string, string> = {
    amber: '#f5a623',
    coral: '#e85d75',
    teal: '#1aab8a',
    violet: '#6c5ce7',
};

export interface CharacterData {
    color: string;
    accessory: string;
    nickname: string | null;
}

export default function PlayerCharacter({
    character,
}: {
    character: CharacterData;
}) {
    return (
        <svg
            viewBox="0 0 200 200"
            className="mx-auto w-full max-w-48"
            aria-hidden="true"
        >
            <circle cx="100" cy="100" r="88" fill="#ffd93d" opacity=".3" />
            <path
                d="M45 183v-30c0-35 110-35 110 0v30"
                fill={colors[character.color] ?? colors.amber}
                stroke="#151b2e"
                strokeWidth="5"
            />
            <rect
                x="52"
                y="35"
                width="96"
                height="100"
                rx="36"
                fill="#ffdab5"
                stroke="#151b2e"
                strokeWidth="5"
            />
            <circle cx="81" cy="85" r="5" fill="#151b2e" />
            <circle cx="119" cy="85" r="5" fill="#151b2e" />
            <path
                d="M84 110q16 12 32 0"
                fill="none"
                stroke="#151b2e"
                strokeWidth="4"
                strokeLinecap="round"
            />
            {character.accessory === 'cap' && (
                <path
                    d="M49 62q0-43 51-43t51 43H40"
                    fill={colors[character.color] ?? colors.amber}
                    stroke="#151b2e"
                    strokeWidth="5"
                    strokeLinejoin="round"
                />
            )}
            {character.accessory === 'glasses' && (
                <g fill="none" stroke="#151b2e" strokeWidth="4">
                    <rect x="65" y="73" width="31" height="24" rx="8" />
                    <rect x="104" y="73" width="31" height="24" rx="8" />
                    <path d="M96 82h8" />
                </g>
            )}
        </svg>
    );
}
