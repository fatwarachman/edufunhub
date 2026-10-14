import { BAND_LABELS, fieldClass } from '@/components/admin/game-stats';
import { tr } from '@/lib/admin-i18n';
import { cn } from '@/lib/utils';
import { router } from '@inertiajs/react';
import { CornerDownLeft, Loader2, Search, X } from 'lucide-react';
import { type ReactNode, useEffect, useId, useRef, useState } from 'react';

/** One suggestion returned by `GET /admin/questions/search`. */
export interface QuestionSuggestion {
    id: number;
    key: string;
    subject: string;
    band: number;
    level: number | null;
    type: 'choice' | 'true_false';
    prompt_id: string;
    is_active: boolean;
    source: string;
}

interface SearchResponse {
    term: string;
    total: number;
    results: QuestionSuggestion[];
}

const MIN_LENGTH = 2;
const DEBOUNCE_MS = 250;

/** Wraps every case-insensitive occurrence of `term` in a highlight mark. */
export function highlightMatch(
    text: string,
    term: string | undefined,
): ReactNode {
    const needle = term?.trim();
    if (!needle) {
        return text;
    }
    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const parts = text.split(new RegExp(`(${escaped})`, 'gi'));

    return parts.map((part, index) =>
        index % 2 === 1 ? (
            <mark
                key={index}
                className="rounded-sm bg-amber-200/80 px-0.5 text-inherit dark:bg-amber-500/30"
            >
                {part}
            </mark>
        ) : (
            part
        ),
    );
}

/**
 * Question bank live search: suggests matching questions while typing
 * (keyboard navigable), Enter opens the highlighted question or the full
 * filtered list.
 */
export function QuestionLiveSearch({
    subjectLabel,
    className,
}: {
    subjectLabel: (subject: string) => string;
    className?: string;
}) {
    const listId = useId();
    const [query, setQuery] = useState('');
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [response, setResponse] = useState<SearchResponse | null>(null);
    const [failed, setFailed] = useState(false);
    const [active, setActive] = useState(-1);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const request = useRef<AbortController | null>(null);
    const input = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const focusShortcut = (event: KeyboardEvent) => {
            const target = event.target as HTMLElement | null;
            const typing =
                target?.isContentEditable ||
                ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName ?? '');
            if (event.key === '/' && !typing) {
                event.preventDefault();
                input.current?.focus();
            }
        };
        window.addEventListener('keydown', focusShortcut);

        return () => {
            window.removeEventListener('keydown', focusShortcut);
            if (timer.current) clearTimeout(timer.current);
            request.current?.abort();
        };
    }, []);

    const fetchSuggestions = (term: string) => {
        request.current?.abort();
        const controller = new AbortController();
        request.current = controller;
        setLoading(true);
        setFailed(false);

        fetch(`/admin/questions/search?q=${encodeURIComponent(term)}`, {
            headers: { Accept: 'application/json' },
            signal: controller.signal,
        })
            .then(async (res) => {
                if (!res.ok) throw new Error(String(res.status));
                const data = (await res.json()) as SearchResponse;
                setResponse(data);
                setActive(-1);
            })
            .catch((error: unknown) => {
                if ((error as Error).name !== 'AbortError') {
                    setFailed(true);
                    setResponse(null);
                }
            })
            .finally(() => {
                if (request.current === controller) setLoading(false);
            });
    };

    const change = (value: string) => {
        setQuery(value);
        setOpen(true);
        if (timer.current) clearTimeout(timer.current);
        const term = value.trim();
        if (term.length < MIN_LENGTH) {
            request.current?.abort();
            setLoading(false);
            setResponse(null);
            setActive(-1);
            return;
        }
        timer.current = setTimeout(() => fetchSuggestions(term), DEBOUNCE_MS);
    };

    const clear = () => {
        change('');
        input.current?.focus();
    };

    const showAll = () => {
        const term = query.trim();
        if (term) {
            router.get('/admin/questions', { search: term });
        }
    };

    const results = response?.results ?? [];
    const term = query.trim();
    const panelOpen = open && term.length > 0;

    const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            setOpen(true);
            setActive((index) =>
                results.length ? (index + 1) % results.length : -1,
            );
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActive((index) =>
                results.length
                    ? index <= 0
                        ? results.length - 1
                        : index - 1
                    : -1,
            );
        } else if (event.key === 'Enter') {
            event.preventDefault();
            if (active >= 0 && results[active]) {
                router.visit(`/admin/questions/${results[active].id}`);
            } else {
                showAll();
            }
        } else if (event.key === 'Escape') {
            if (panelOpen) {
                event.preventDefault();
                setOpen(false);
            } else if (query) {
                clear();
            }
        }
    };

    return (
        <div
            className={cn('relative', className)}
            onBlur={(event) => {
                if (
                    !event.currentTarget.contains(
                        event.relatedTarget as Node | null,
                    )
                ) {
                    setOpen(false);
                }
            }}
            data-testid="questions-live-search"
        >
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
                ref={input}
                type="search"
                role="combobox"
                aria-label={tr('Search all questions')}
                aria-expanded={panelOpen}
                aria-controls={listId}
                aria-autocomplete="list"
                aria-activedescendant={
                    active >= 0 ? `${listId}-option-${active}` : undefined
                }
                autoComplete="off"
                value={query}
                onChange={(event) => change(event.target.value)}
                onFocus={() => setOpen(true)}
                onKeyDown={onKeyDown}
                placeholder={tr('Search all questions…')}
                className={cn(
                    fieldClass,
                    'h-10 w-full rounded-xl border-2 border-[#1f2a44] pr-16 pl-9 shadow-[2px_2px_0_#1f2a44] dark:border-white/20 dark:shadow-none [&::-webkit-search-cancel-button]:hidden',
                )}
                data-testid="questions-live-search-input"
            />
            <span className="absolute top-1/2 right-2 flex -translate-y-1/2 items-center gap-1">
                {loading && (
                    <Loader2
                        className="size-4 animate-spin text-muted-foreground"
                        aria-hidden="true"
                    />
                )}
                {query ? (
                    <button
                        type="button"
                        onClick={clear}
                        aria-label={tr('Clear search')}
                        title={tr('Clear search')}
                        className="grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                        <X className="size-4" />
                    </button>
                ) : (
                    <kbd className="hidden rounded border border-border bg-muted px-1.5 font-mono text-[11px] text-muted-foreground sm:inline">
                        /
                    </kbd>
                )}
            </span>

            {panelOpen && (
                <div
                    className="absolute top-full right-0 left-0 z-40 mt-2 overflow-hidden rounded-xl border-2 border-[#1f2a44] bg-popover text-popover-foreground shadow-[4px_4px_0_#1f2a44] sm:min-w-[28rem] dark:border-white/20 dark:shadow-[0_0_24px_rgba(255,255,255,0.06)]"
                    data-testid="questions-live-search-panel"
                >
                    <p className="sr-only" aria-live="polite">
                        {response
                            ? tr('{0} questions found', [response.total])
                            : ''}
                    </p>
                    {term.length < MIN_LENGTH ? (
                        <p className="px-4 py-3 text-sm text-muted-foreground">
                            {tr('Type at least 2 characters to search.')}
                        </p>
                    ) : failed ? (
                        <p className="px-4 py-3 text-sm text-destructive">
                            {tr('Search failed. Try again.')}
                        </p>
                    ) : !response ? (
                        <p className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground">
                            <Loader2 className="size-4 animate-spin" />
                            {tr('Searching…')}
                        </p>
                    ) : results.length === 0 ? (
                        <p className="px-4 py-3 text-sm text-muted-foreground">
                            {tr('No questions match “{0}”.', [response.term])}
                        </p>
                    ) : (
                        <ul
                            id={listId}
                            role="listbox"
                            aria-label={tr('Matching questions')}
                            className="max-h-80 divide-y divide-border overflow-y-auto"
                        >
                            {results.map((result, index) => (
                                <li
                                    key={result.id}
                                    id={`${listId}-option-${index}`}
                                    role="option"
                                    aria-selected={index === active}
                                    onMouseEnter={() => setActive(index)}
                                    onMouseDown={(event) =>
                                        event.preventDefault()
                                    }
                                    onClick={() =>
                                        router.visit(
                                            `/admin/questions/${result.id}`,
                                        )
                                    }
                                    className={cn(
                                        'flex cursor-pointer flex-col gap-1 px-4 py-2.5 text-sm',
                                        index === active && 'bg-accent',
                                        !result.is_active && 'opacity-60',
                                    )}
                                    data-testid="questions-live-search-option"
                                >
                                    <span className="line-clamp-2 font-medium text-foreground">
                                        {highlightMatch(
                                            result.prompt_id,
                                            response.term,
                                        )}
                                    </span>
                                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                                        <span className="font-medium text-foreground/80">
                                            {subjectLabel(result.subject)}
                                        </span>
                                        <span>·</span>
                                        <span>
                                            {tr(BAND_LABELS[result.band] ?? '')}
                                        </span>
                                        <span>·</span>
                                        <span>
                                            {result.type === 'choice'
                                                ? tr('Multiple choice')
                                                : tr('True / false')}
                                        </span>
                                        {!result.is_active && (
                                            <>
                                                <span>·</span>
                                                <span>{tr('Inactive')}</span>
                                            </>
                                        )}
                                        <code className="ml-auto font-mono text-[11px]">
                                            {highlightMatch(
                                                result.key,
                                                response.term,
                                            )}
                                        </code>
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                    {response && response.total > 0 && (
                        <button
                            type="button"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={showAll}
                            className="flex w-full items-center justify-between gap-2 border-t-2 border-dashed border-border bg-muted/40 px-4 py-2.5 text-left text-sm font-semibold text-primary hover:bg-muted"
                            data-testid="questions-live-search-all"
                        >
                            {tr('Show all {0} results', [response.total])}
                            <CornerDownLeft
                                className="size-4"
                                aria-hidden="true"
                            />
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}

export default QuestionLiveSearch;
