import { Link } from '@inertiajs/react';
import { Fragment, type ReactNode } from 'react';

export function safeAssistantLink(value: string): string | null {
    if (
        /[\s\\]/.test(value) ||
        [...value].some((character) => character.charCodeAt(0) < 32)
    )
        return null;
    if (/^\/admin(?:\/|$|[?#])/.test(value)) return value;
    try {
        const url = new URL(value);
        return url.protocol === 'https:' && !url.username && !url.password
            ? url.href
            : null;
    } catch {
        return null;
    }
}

function inline(text: string): ReactNode[] {
    const tokens = text.split(
        /(\[[^\]\n]+\]\([^\s)]+\)|\*\*[^\n]+?\*\*|\*[^*\n]+\*|`[^`\n]+`|https:\/\/[^\s<>]+|\/admin(?:\/[a-zA-Z0-9_/?=&%.#-]*)?)/g,
    );
    return tokens.map((token, index) => {
        const link = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
        if (
            link ||
            token.startsWith('https://') ||
            token.startsWith('/admin')
        ) {
            const href = safeAssistantLink(link ? link[2] : token);
            const label = link ? link[1] : token;
            if (!href) return <Fragment key={index}>{label}</Fragment>;
            const style =
                'font-medium text-primary underline underline-offset-4 hover:opacity-80';
            return href.startsWith('/') ? (
                <Link key={index} href={href} className={style}>
                    {label}
                </Link>
            ) : (
                <a
                    key={index}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={style}
                >
                    {label}
                </a>
            );
        }
        if (token.startsWith('**') && token.endsWith('**'))
            return (
                <strong key={index} className="font-semibold">
                    {inline(token.slice(2, -2))}
                </strong>
            );
        if (token.startsWith('*') && token.endsWith('*'))
            return <em key={index}>{inline(token.slice(1, -1))}</em>;
        if (token.startsWith('`') && token.endsWith('`'))
            return (
                <code
                    key={index}
                    className="rounded bg-muted px-1 py-0.5 text-xs"
                >
                    {token.slice(1, -1)}
                </code>
            );
        return <Fragment key={index}>{token}</Fragment>;
    });
}

/** Render a safe, deliberately limited answer format; HTML is never interpreted. */
export function AssistantAnswer({ content }: { content: string }) {
    const lines = content.split('\n');
    const blocks: ReactNode[] = [];
    for (let index = 0; index < lines.length; index++) {
        const line = lines[index];
        if (!line.trim()) continue;
        if (/^\s*```/.test(line)) {
            const code: string[] = [];
            while (++index < lines.length && !/^\s*```/.test(lines[index]))
                code.push(lines[index]);
            blocks.push(
                <pre
                    key={index}
                    className="overflow-x-auto rounded-lg bg-muted p-3 text-xs"
                >
                    <code>{code.join('\n')}</code>
                </pre>,
            );
        } else if (/^#{1,6}\s+/.test(line)) {
            blocks.push(
                <h3 key={index} className="font-semibold">
                    {inline(line.replace(/^#{1,6}\s+/, ''))}
                </h3>,
            );
        } else if (/^\s*(?:[-*]|\d+\.)\s+/.test(line)) {
            const ordered = /^\s*\d+\./.test(line);
            const pattern = ordered ? /^\s*\d+\.\s+/ : /^\s*[-*]\s+/;
            const items: ReactNode[] = [];
            do {
                items.push(
                    <li key={index}>
                        {inline(lines[index].replace(pattern, ''))}
                    </li>,
                );
                index++;
            } while (index < lines.length && pattern.test(lines[index]));
            index--;
            blocks.push(
                ordered ? (
                    <ol key={index} className="list-decimal space-y-1 pl-5">
                        {items}
                    </ol>
                ) : (
                    <ul key={index} className="list-disc space-y-1 pl-5">
                        {items}
                    </ul>
                ),
            );
        } else {
            blocks.push(<p key={index}>{inline(line)}</p>);
        }
    }
    return (
        <div className="flex min-w-0 flex-col gap-3 text-sm leading-7 [overflow-wrap:anywhere]">
            {blocks}
        </div>
    );
}
