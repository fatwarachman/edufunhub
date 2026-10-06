import { cn } from '@/lib/utils';
import { ChevronDown } from 'lucide-react';
import type React from 'react';
import {
    type ReactNode,
    useCallback,
    useId,
    useLayoutEffect,
    useRef,
    useState,
} from 'react';

/**
 * One column of a ResponsiveTable.
 *
 * - `primary`: shown as the title of the accordion item (first primary wins
 *   the bold title, others follow it).
 * - `summary`: shown as a one-line summary under the title, joined by " · ".
 * - Every other column is listed as label/value rows inside the panel.
 */
export interface ResponsiveColumn<T> {
    key: string;
    header: ReactNode;
    cell: (row: T, index: number) => ReactNode;
    /** Plain-text label used inside the accordion (defaults to `header`). */
    label?: ReactNode;
    align?: 'left' | 'right' | 'center';
    primary?: boolean;
    summary?: boolean;
    /** Leave this column out of the accordion (e.g. row-number or actions shown elsewhere). */
    hideInAccordion?: boolean;
    headerClassName?: string;
    cellClassName?: string;
}

type Variant = 'admin' | 'player';

const ALIGN: Record<NonNullable<ResponsiveColumn<unknown>['align']>, string> = {
    left: 'text-left',
    right: 'text-right',
    center: 'text-center',
};

/**
 * A table that never scrolls sideways: it renders as a normal table while
 * all columns fit the available width and switches to an accordion list as
 * soon as they do not (measured on the container, so it also reacts to the
 * admin sidebar and to the content of the cells, not only to the viewport).
 */
export function ResponsiveTable<T>({
    rows,
    columns,
    rowKey,
    variant = 'admin',
    onRowClick,
    rowAriaLabel,
    rowClassName,
    actions,
    empty,
    caption,
    className,
    tableClassName,
    testId,
}: {
    rows: T[];
    columns: ResponsiveColumn<T>[];
    rowKey: (row: T, index: number) => string | number;
    variant?: Variant;
    /** Makes a row clickable (table: whole row; accordion: "open" action in the panel). */
    onRowClick?: (row: T) => void;
    rowAriaLabel?: (row: T) => string;
    rowClassName?: (row: T, index: number) => string | undefined;
    /** Extra buttons rendered at the bottom of an open accordion item. */
    actions?: (row: T) => ReactNode;
    empty?: ReactNode;
    caption?: string;
    className?: string;
    tableClassName?: string;
    testId?: string;
}) {
    const wrapper = useRef<HTMLDivElement>(null);
    const probe = useRef<HTMLTableElement>(null);
    const [compact, setCompact] = useState(false);
    const [open, setOpen] = useState<Set<string>>(() => new Set());
    const baseId = useId();

    // An invisible copy of the table is always laid out at the container
    // width: when its cells cannot shrink (even with text wrapping) it grows
    // wider than the container, and the accordion is used instead. Keeping
    // the copy also lets the table come back when space grows again.
    const measure = useCallback(() => {
        const box = wrapper.current;
        const ghost = probe.current;
        if (!box || !ghost) {
            return;
        }
        setCompact(ghost.offsetWidth > box.clientWidth + 1);
    }, []);

    useLayoutEffect(() => {
        measure();
    }, [measure, rows, columns]);

    useLayoutEffect(() => {
        const box = wrapper.current;
        if (!box || typeof ResizeObserver === 'undefined') {
            return;
        }
        let frame = 0;
        const observer = new ResizeObserver(() => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(measure);
        });
        observer.observe(box);
        if (probe.current) {
            observer.observe(probe.current);
        }
        return () => {
            cancelAnimationFrame(frame);
            observer.disconnect();
        };
    }, [measure]);

    if (rows.length === 0) {
        return <>{empty ?? null}</>;
    }

    const player = variant === 'player';
    const primary = columns.filter((c) => c.primary);
    const summary = columns.filter((c) => c.summary && !c.primary);
    const details = columns.filter(
        (c) => !c.primary && !c.summary && !c.hideInAccordion,
    );

    const renderTable = (ref?: React.Ref<HTMLTableElement>) => (
        <table ref={ref} className={cn('w-full text-sm', tableClassName)}>
            {caption && <caption className="sr-only">{caption}</caption>}
            <thead>
                <tr
                    className={cn(
                        'border-b text-xs tracking-wider uppercase',
                        player
                            ? 'border-[#1f2a44]/20 text-slate-500'
                            : 'border-border text-muted-foreground',
                    )}
                >
                    {columns.map((c) => (
                        <th
                            key={c.key}
                            scope="col"
                            className={cn(
                                'px-3 py-2.5 font-medium whitespace-nowrap first:pl-4 last:pr-4',
                                ALIGN[c.align ?? 'left'],
                                c.headerClassName,
                            )}
                        >
                            {c.header}
                        </th>
                    ))}
                </tr>
            </thead>
            <tbody
                className={cn(
                    'divide-y',
                    player ? 'divide-[#1f2a44]/10' : 'divide-border',
                )}
            >
                {rows.map((row, index) => (
                    <tr
                        key={rowKey(row, index)}
                        onClick={onRowClick ? () => onRowClick(row) : undefined}
                        onKeyDown={
                            onRowClick
                                ? (event) => {
                                      if (
                                          event.key === 'Enter' ||
                                          event.key === ' '
                                      ) {
                                          event.preventDefault();
                                          onRowClick(row);
                                      }
                                  }
                                : undefined
                        }
                        tabIndex={onRowClick ? 0 : undefined}
                        aria-label={
                            onRowClick ? rowAriaLabel?.(row) : undefined
                        }
                        className={cn(
                            onRowClick &&
                                'cursor-pointer focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring',
                            player ? 'hover:bg-[#FFF9E6]' : 'hover:bg-muted/30',
                            rowClassName?.(row, index),
                        )}
                        data-testid={testId ? `${testId}-row` : undefined}
                    >
                        {columns.map((c) => (
                            <td
                                key={c.key}
                                className={cn(
                                    'px-3 py-2.5 align-middle first:pl-4 last:pr-4',
                                    ALIGN[c.align ?? 'left'],
                                    c.cellClassName,
                                )}
                            >
                                {c.cell(row, index)}
                            </td>
                        ))}
                    </tr>
                ))}
            </tbody>
        </table>
    );

    const toggle = (id: string) =>
        setOpen((previous) => {
            const next = new Set(previous);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });

    return (
        <div
            ref={wrapper}
            className={cn('relative w-full min-w-0', className)}
            data-testid={testId}
            data-layout={compact ? 'accordion' : 'table'}
        >
            <div
                className="pointer-events-none invisible absolute inset-x-0 top-0 h-0 overflow-hidden"
                aria-hidden="true"
                inert
            >
                {renderTable(probe)}
            </div>
            {compact ? (
                <ul
                    className={cn(
                        'flex flex-col',
                        player
                            ? 'gap-2'
                            : 'divide-y divide-border rounded-xl border border-border',
                    )}
                >
                    {rows.map((row, index) => {
                        const id = String(rowKey(row, index));
                        const isOpen = open.has(id);
                        const panelId = `${baseId}-${id}`;
                        const summaryText = summary
                            .map((c) => c.cell(row, index))
                            .filter(
                                (value) =>
                                    value !== null &&
                                    value !== undefined &&
                                    value !== false &&
                                    value !== '',
                            );
                        return (
                            <li
                                key={id}
                                className={cn(
                                    'min-w-0',
                                    player &&
                                        'rounded-2xl border-2 border-[#1f2a44] bg-white',
                                    rowClassName?.(row, index),
                                )}
                                data-testid={
                                    testId ? `${testId}-item` : undefined
                                }
                            >
                                <button
                                    type="button"
                                    onClick={() => toggle(id)}
                                    aria-expanded={isOpen}
                                    aria-controls={panelId}
                                    className={cn(
                                        'flex w-full min-w-0 items-center gap-3 px-4 py-3 text-left transition-colors focus-visible:outline-none',
                                        player
                                            ? 'rounded-2xl hover:bg-[#FFF9E6] focus-visible:bg-[#FFF9E6]'
                                            : 'hover:bg-muted/40 focus-visible:bg-muted/40',
                                    )}
                                >
                                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                                        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium">
                                            {primary.map((c) => (
                                                <span
                                                    key={c.key}
                                                    className="min-w-0 [overflow-wrap:anywhere]"
                                                >
                                                    {c.cell(row, index)}
                                                </span>
                                            ))}
                                        </span>
                                        {summaryText.length > 0 && (
                                            <span
                                                className={cn(
                                                    'flex min-w-0 flex-wrap items-center gap-x-1.5 text-xs',
                                                    player
                                                        ? 'text-slate-600'
                                                        : 'text-muted-foreground',
                                                )}
                                            >
                                                {summaryText.map((value, i) => (
                                                    <span
                                                        key={i}
                                                        className="flex min-w-0 items-center gap-1.5"
                                                    >
                                                        {i > 0 && (
                                                            <span aria-hidden="true">
                                                                ·
                                                            </span>
                                                        )}
                                                        {value}
                                                    </span>
                                                ))}
                                            </span>
                                        )}
                                    </span>
                                    {(details.length > 0 ||
                                        onRowClick ||
                                        actions) && (
                                        <ChevronDown
                                            className={cn(
                                                'size-4 shrink-0 transition-transform duration-300 ease-out motion-reduce:transition-none',
                                                player
                                                    ? 'text-[#1f2a44]'
                                                    : 'text-muted-foreground',
                                                isOpen && 'rotate-180',
                                            )}
                                            aria-hidden="true"
                                        />
                                    )}
                                </button>
                                <div
                                    id={panelId}
                                    className={cn(
                                        'grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none',
                                        isOpen
                                            ? 'grid-rows-[1fr] opacity-100'
                                            : 'grid-rows-[0fr] opacity-0',
                                    )}
                                    aria-hidden={!isOpen}
                                    inert={!isOpen}
                                >
                                    <div className="min-h-0 overflow-hidden">
                                        <dl className="flex flex-col gap-2.5 px-4 pt-1 pb-4 text-sm">
                                            {details.map((c) => (
                                                <div
                                                    key={c.key}
                                                    className="flex min-w-0 items-start justify-between gap-4"
                                                >
                                                    <dt
                                                        className={cn(
                                                            'shrink-0 text-xs font-semibold tracking-wide uppercase',
                                                            player
                                                                ? 'text-slate-500'
                                                                : 'text-muted-foreground',
                                                        )}
                                                    >
                                                        {c.label ?? c.header}
                                                    </dt>
                                                    <dd className="flex min-w-0 justify-end text-right [overflow-wrap:anywhere]">
                                                        {c.cell(row, index)}
                                                    </dd>
                                                </div>
                                            ))}
                                            {(onRowClick || actions) && (
                                                <div className="flex flex-wrap justify-end gap-2 pt-1">
                                                    {actions?.(row)}
                                                    {onRowClick && (
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                onRowClick(row)
                                                            }
                                                            className={cn(
                                                                'inline-flex h-8 items-center rounded-lg border px-3 text-xs font-medium',
                                                                player
                                                                    ? 'border-[#1f2a44] bg-white font-black text-[#1f2a44]'
                                                                    : 'border-border text-foreground hover:bg-accent',
                                                            )}
                                                            aria-label={rowAriaLabel?.(
                                                                row,
                                                            )}
                                                            data-testid={
                                                                testId
                                                                    ? `${testId}-open`
                                                                    : undefined
                                                            }
                                                        >
                                                            {rowAriaLabel?.(
                                                                row,
                                                            ) ?? '›'}
                                                        </button>
                                                    )}
                                                </div>
                                            )}
                                        </dl>
                                    </div>
                                </div>
                            </li>
                        );
                    })}
                </ul>
            ) : (
                renderTable()
            )}
        </div>
    );
}
