import { Link } from '@inertiajs/react';
import { ArrowUpRight } from 'lucide-react';
import { Fragment, type ReactNode } from 'react';

/** App paths an assistant may link to (admin by default). */
const DEFAULT_PREFIXES = ['/admin'];

const escape = (value: string): string =>
    value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function isInternal(value: string, prefixes: readonly string[]): boolean {
    return prefixes.some((prefix) =>
        new RegExp(`^${escape(prefix)}(?:/|$|[?#])`).test(value),
    );
}

export function safeAssistantLink(
    value: string,
    prefixes: readonly string[] = DEFAULT_PREFIXES,
): string | null {
    if (
        /[\s\\]/.test(value) ||
        [...value].some((character) => character.charCodeAt(0) < 32)
    )
        return null;
    if (isInternal(value, prefixes))
        return /(?:^|\/)\.\.?(?:\/|$|[?#])/.test(value) ? null : value;
    try {
        const url = new URL(value);
        return url.protocol === 'https:' && !url.username && !url.password
            ? url.href
            : null;
    } catch {
        return null;
    }
}

interface InlineOptions {
    prefixes: readonly string[];
    linkLabel?: (path: string) => string | null | undefined;
}

/** In-app page link rendered as a small button (pill). */
function PageButton({ href, label }: { href: string; label: string }) {
    return (
        <Link
            href={href}
            title={href}
            className="mx-0.5 inline-flex max-w-full items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-0.5 align-baseline text-xs leading-5 font-semibold text-primary no-underline transition-colors hover:bg-primary hover:text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            data-testid="assistant-page-link"
        >
            <span className="min-w-0 truncate">{label}</span>
            <ArrowUpRight className="size-3 shrink-0" aria-hidden="true" />
        </Link>
    );
}

/** Split trailing sentence punctuation off a bare path ("…/create." → path + "."). */
function trimPath(token: string): [string, string] {
    const match = token.match(/^(.*?)([.,;:!?)]+)$/);
    return match && match[1] !== '' ? [match[1], match[2]] : [token, ''];
}

function inline(text: string, options: InlineOptions): ReactNode[] {
    const paths = options.prefixes.map(escape).join('|');
    const tokens = text.split(
        new RegExp(
            String.raw`(\[[^\]\n]+\]\([^\s)]+\)|\*\*[^\n]+?\*\*|\*[^*\n]+\*|` +
                '`[^`\\n]+`' +
                String.raw`|https:\/\/[^\s<>]+|(?:${paths})(?:\/[a-zA-Z0-9_/?=&%.#-]*)?)`,
            'g',
        ),
    );
    const pageLabel = (path: string): string =>
        options.linkLabel?.(path.split(/[?#]/)[0]) || path;

    return tokens.map((token, index) => {
        const link = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
        const code =
            token.startsWith('`') && token.endsWith('`')
                ? token.slice(1, -1)
                : null;
        if (code !== null && isInternal(code, options.prefixes)) {
            const href = safeAssistantLink(code, options.prefixes);
            if (href)
                return (
                    <PageButton
                        key={index}
                        href={href}
                        label={pageLabel(href)}
                    />
                );
        }
        const bare =
            !link &&
            (token.startsWith('https://') ||
                isInternal(token, options.prefixes));
        if (link || bare) {
            const [target, tail] = link ? [link[2], ''] : trimPath(token);
            const href = safeAssistantLink(target, options.prefixes);
            const label = link ? link[1] : target;
            if (!href)
                return (
                    <Fragment key={index}>
                        {label}
                        {tail}
                    </Fragment>
                );
            if (href.startsWith('/'))
                return (
                    <Fragment key={index}>
                        <PageButton
                            href={href}
                            label={link ? label : pageLabel(href)}
                        />
                        {tail}
                    </Fragment>
                );
            return (
                <Fragment key={index}>
                    <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-primary underline underline-offset-4 hover:opacity-80"
                    >
                        {label}
                    </a>
                    {tail}
                </Fragment>
            );
        }
        if (token.startsWith('**') && token.endsWith('**'))
            return (
                <strong key={index} className="font-semibold">
                    {inline(token.slice(2, -2), options)}
                </strong>
            );
        if (token.startsWith('*') && token.endsWith('*'))
            return <em key={index}>{inline(token.slice(1, -1), options)}</em>;
        if (code !== null)
            return (
                <code
                    key={index}
                    className="rounded bg-muted px-1 py-0.5 text-xs"
                >
                    {code}
                </code>
            );
        return <Fragment key={index}>{token}</Fragment>;
    });
}

/** Render a safe, deliberately limited answer format; HTML is never interpreted. */
export function AssistantAnswer({
    content,
    linkPrefixes = DEFAULT_PREFIXES,
    linkLabel,
}: {
    content: string;
    /** App path prefixes rendered as page buttons (e.g. ['/teacher']). */
    linkPrefixes?: readonly string[];
    /** Friendly button label for a path; falls back to the path itself. */
    linkLabel?: (path: string) => string | null | undefined;
}) {
    const options: InlineOptions = { prefixes: linkPrefixes, linkLabel };
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
                    {inline(line.replace(/^#{1,6}\s+/, ''), options)}
                </h3>,
            );
        } else if (/^\s*(?:[-*]|\d+\.)\s+/.test(line)) {
            const ordered = /^\s*\d+\./.test(line);
            const pattern = ordered ? /^\s*\d+\.\s+/ : /^\s*[-*]\s+/;
            const items: ReactNode[] = [];
            do {
                items.push(
                    <li key={index}>
                        {inline(lines[index].replace(pattern, ''), options)}
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
            blocks.push(<p key={index}>{inline(line, options)}</p>);
        }
    }
    return (
        <div className="flex min-w-0 flex-col gap-3 text-sm leading-7 [overflow-wrap:anywhere]">
            {blocks}
        </div>
    );
}
