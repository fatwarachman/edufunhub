import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from '@/components/ui/command';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { Check, ChevronsUpDown, X } from 'lucide-react';
import { type ReactNode, useState } from 'react';

export interface SearchableSelectOption {
    value: string;
    label: string;
    /** Optional second line (also searchable), e.g. the province of a city. */
    description?: string;
}

/**
 * Select2-style dropdown: a trigger button that opens a searchable option
 * list. Pass an empty-value option to allow clearing the choice. A value that
 * is not in the options (legacy free text) is still shown on the trigger.
 */
export function SearchableSelect({
    id,
    value,
    options,
    onChange,
    placeholder,
    searchPlaceholder,
    emptyText,
    clearLabel,
    className,
    contentClassName,
    testId,
    name,
    loading = false,
    loadingText,
    leadingIcon,
    invalid,
    disabled = false,
    onSearchChange,
    footer,
    selectedLabel,
}: {
    id?: string;
    value: string;
    options: SearchableSelectOption[];
    onChange: (value: string) => void;
    placeholder: string;
    searchPlaceholder: string;
    emptyText: string;
    clearLabel?: string;
    className?: string;
    /** Extra classes for the popover panel (e.g. a different look per page). */
    contentClassName?: string;
    testId?: string;
    /** Renders a hidden input so plain form posts still carry the value. */
    name?: string;
    loading?: boolean;
    loadingText?: string;
    /** Icon drawn inside the trigger on the left; add left padding via className. */
    leadingIcon?: ReactNode;
    invalid?: boolean;
    disabled?: boolean;
    /**
     * Server-side search: the parent fetches matching options for each query
     * and the list is no longer filtered in the browser.
     */
    onSearchChange?: (search: string) => void;
    /** Note under the option list (e.g. "showing 50 of 2,570"). */
    footer?: ReactNode;
    /** Trigger label for a value that is not among the current options. */
    selectedLabel?: string;
}) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const selected =
        options.find((option) => option.value === value) ??
        (value ? { value, label: selectedLabel ?? value } : undefined);
    const remote = onSearchChange !== undefined;

    const choose = (next: string) => {
        onChange(next);
        setOpen(false);
    };

    return (
        <Popover
            open={open && !disabled}
            onOpenChange={(next) => {
                setOpen(next);
                if (!next && remote && search !== '') {
                    setSearch('');
                    onSearchChange?.('');
                }
            }}
        >
            <div className="relative">
                {name && <input type="hidden" name={name} value={value} />}
                {leadingIcon && (
                    <span className="pointer-events-none absolute top-1/2 left-3 z-10 flex -translate-y-1/2 items-center">
                        {leadingIcon}
                    </span>
                )}
                <PopoverTrigger asChild>
                    <button
                        id={id}
                        type="button"
                        role="combobox"
                        aria-expanded={open}
                        aria-haspopup="listbox"
                        aria-invalid={invalid ? true : undefined}
                        disabled={disabled}
                        className={cn(
                            className,
                            'flex items-center gap-2 pr-16 text-left disabled:cursor-not-allowed disabled:bg-[#f4f1e8] disabled:opacity-100',
                        )}
                        data-testid={testId}
                    >
                        <span
                            className={cn(
                                'min-w-0 flex-1 truncate',
                                !selected?.value && 'text-[#4b5268]',
                            )}
                        >
                            {selected?.label ?? placeholder}
                        </span>
                    </button>
                </PopoverTrigger>
                <span className="pointer-events-none absolute top-1/2 right-3 flex -translate-y-1/2 items-center gap-1">
                    {value && clearLabel && !disabled && (
                        <button
                            type="button"
                            onClick={() => onChange('')}
                            aria-label={clearLabel}
                            title={clearLabel}
                            className="pointer-events-auto grid size-6 place-items-center rounded-md text-[#4b5268] hover:bg-[#faf7ef] hover:text-[#151b2e] focus-visible:outline-2 focus-visible:outline-[#6c5ce7]"
                            data-testid={testId ? `${testId}-clear` : undefined}
                        >
                            <X className="size-4" aria-hidden="true" />
                        </button>
                    )}
                    <ChevronsUpDown
                        className="size-4 text-[#4b5268]"
                        aria-hidden="true"
                    />
                </span>
            </div>
            <PopoverContent
                align="start"
                collisionPadding={8}
                className={cn(
                    'w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-16px)] min-w-56 overflow-hidden rounded-xl border-2 border-[#151b2e] bg-white p-0 text-[#151b2e] shadow-[4px_4px_0_#151b2e]',
                    contentClassName,
                )}
                data-testid={testId ? `${testId}-popover` : undefined}
            >
                <Command
                    className="bg-white text-[#151b2e]"
                    shouldFilter={!remote}
                    filter={(itemValue, search, keywords) =>
                        [itemValue, ...(keywords ?? [])]
                            .join(' ')
                            .toLowerCase()
                            .includes(search.trim().toLowerCase())
                            ? 1
                            : 0
                    }
                >
                    <CommandInput
                        {...(remote
                            ? {
                                  value: search,
                                  onValueChange: (next: string) => {
                                      setSearch(next);
                                      onSearchChange(next);
                                  },
                              }
                            : {})}
                        placeholder={searchPlaceholder}
                        className="h-11 font-semibold placeholder:text-[#4b5268]"
                        data-testid={testId ? `${testId}-search` : undefined}
                    />
                    <CommandList className="max-h-64 overscroll-contain">
                        <CommandEmpty className="py-6 text-center text-sm font-semibold text-[#4b5268]">
                            {loading && loadingText ? loadingText : emptyText}
                        </CommandEmpty>
                        <CommandGroup>
                            {options.map((option) => (
                                <CommandItem
                                    key={option.value || '__empty'}
                                    value={`${option.label} ${option.value}`}
                                    keywords={
                                        option.description
                                            ? [option.description]
                                            : undefined
                                    }
                                    onSelect={() => choose(option.value)}
                                    className="min-h-10 cursor-pointer rounded-lg px-2.5 font-semibold text-[#151b2e] data-[selected=true]:bg-[#fff0cf] data-[selected=true]:text-[#151b2e]"
                                    data-testid={
                                        testId ? `${testId}-option` : undefined
                                    }
                                >
                                    {option.description ? (
                                        <span className="min-w-0 flex-1 py-1">
                                            <span className="block truncate">
                                                {option.label}
                                            </span>
                                            <span className="block truncate text-xs font-medium text-[#4b5268]">
                                                {option.description}
                                            </span>
                                        </span>
                                    ) : (
                                        <span className="min-w-0 flex-1 truncate">
                                            {option.label}
                                        </span>
                                    )}
                                    <Check
                                        aria-hidden="true"
                                        className={cn(
                                            'size-4 !text-[#1aab8a]',
                                            option.value === value
                                                ? 'opacity-100'
                                                : 'opacity-0',
                                        )}
                                    />
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                    {footer && (
                        <div className="border-t-2 border-[#151b2e]/10 px-3 py-2 text-xs font-semibold text-[#4b5268]">
                            {footer}
                        </div>
                    )}
                </Command>
            </PopoverContent>
        </Popover>
    );
}
