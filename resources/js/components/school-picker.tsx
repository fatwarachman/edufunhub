import InputError from '@/components/input-error';
import {
    SearchableSelect,
    type SearchableSelectOption,
} from '@/components/searchable-select';
import { useTranslations } from '@/hooks/use-translations';
import { cn } from '@/lib/utils';
import { Loader2, MapPin, School } from 'lucide-react';
import {
    type KeyboardEvent,
    useEffect,
    useId,
    useMemo,
    useRef,
    useState,
} from 'react';

export interface SchoolSuggestion {
    name: string;
    city: string | null;
    players?: number;
}

const MIN_QUERY = 2;
const DEBOUNCE_MS = 250;
const REGENCIES_ENDPOINT = '/player-details/regencies';

interface Regency {
    name: string;
    province: string;
}

/** Shared across pickers so the static list is fetched once per page load. */
let regencyRequest: Promise<Regency[]> | null = null;

function loadRegencies(): Promise<Regency[]> {
    regencyRequest ??= fetch(REGENCIES_ENDPOINT, {
        headers: {
            Accept: 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
        },
        credentials: 'same-origin',
    })
        .then(async (response) => {
            if (!response.ok) {
                throw new Error(`regencies ${response.status}`);
            }
            const data = (await response.json()) as { regencies?: Regency[] };

            return Array.isArray(data.regencies) ? data.regencies : [];
        })
        .catch(() => {
            regencyRequest = null;

            return [];
        });

    return regencyRequest;
}

function useRegencyOptions(): {
    options: SearchableSelectOption[];
    loading: boolean;
} {
    const [regencies, setRegencies] = useState<Regency[] | null>(null);

    useEffect(() => {
        let active = true;
        loadRegencies().then((rows) => {
            if (active) {
                setRegencies(rows);
            }
        });

        return () => {
            active = false;
        };
    }, []);

    const options = useMemo(
        () =>
            (regencies ?? []).map((regency) => ({
                value: regency.name,
                label: regency.name,
                description: regency.province,
            })),
        [regencies],
    );

    return { options, loading: regencies === null };
}

/**
 * School name combobox with suggestions from schools other players entered,
 * plus a separate city/regency field. Picking a suggestion fills both fields;
 * free text stays allowed for schools nobody entered yet.
 */
export function SchoolPicker({
    schoolName,
    schoolCity,
    onSchoolNameChange,
    onSchoolCityChange,
    endpoint = '/player-details/schools',
    schoolError,
    cityError,
    variant = 'player',
    required = false,
    idPrefix = 'school',
}: {
    schoolName: string;
    schoolCity: string;
    onSchoolNameChange: (value: string) => void;
    onSchoolCityChange: (value: string) => void;
    endpoint?: string;
    schoolError?: string;
    cityError?: string;
    /** "player": cream neo-brutalist inputs; "auth": shadcn-style inputs of the auth pages. */
    variant?: 'player' | 'auth';
    required?: boolean;
    idPrefix?: string;
}) {
    const { t, i18n } = useTranslations();
    const listId = useId();
    const [open, setOpen] = useState(false);
    const [results, setResults] = useState<Record<string, SchoolSuggestion[]>>(
        {},
    );
    const [active, setActive] = useState(-1);
    const [typed, setTyped] = useState(false);
    const blurTimer = useRef<number | undefined>(undefined);
    const regencies = useRegencyOptions();

    const query = schoolName.trim().replace(/\s+/g, ' ').toLowerCase();
    const searchable = typed && query.length >= MIN_QUERY;
    const items = searchable ? (results[query] ?? []) : [];
    const loading = searchable && results[query] === undefined;

    useEffect(() => {
        if (!loading) {
            return;
        }
        const controller = new AbortController();
        const timer = window.setTimeout(async () => {
            let schools: SchoolSuggestion[] = [];
            try {
                const response = await fetch(
                    `${endpoint}?q=${encodeURIComponent(query)}`,
                    {
                        headers: {
                            Accept: 'application/json',
                            'X-Requested-With': 'XMLHttpRequest',
                        },
                        credentials: 'same-origin',
                        signal: controller.signal,
                    },
                );
                if (response.ok) {
                    const data = (await response.json()) as {
                        schools?: SchoolSuggestion[];
                    };
                    schools = Array.isArray(data.schools) ? data.schools : [];
                }
            } catch {
                if (controller.signal.aborted) {
                    return;
                }
            }
            setResults((current) => ({ ...current, [query]: schools }));
        }, DEBOUNCE_MS);

        return () => {
            controller.abort();
            window.clearTimeout(timer);
        };
    }, [loading, query, endpoint]);

    useEffect(() => () => window.clearTimeout(blurTimer.current), []);

    const exactMatch = items.some((item) => item.name.toLowerCase() === query);
    const showList = open && searchable && (loading || items.length > 0);

    const choose = (item: SchoolSuggestion) => {
        onSchoolNameChange(item.name);
        if (item.city) {
            onSchoolCityChange(item.city);
        }
        setTyped(false);
        setOpen(false);
        setActive(-1);
    };

    const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            setOpen(true);
            setActive((current) =>
                items.length === 0 ? -1 : (current + 1) % items.length,
            );
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActive((current) =>
                items.length === 0
                    ? -1
                    : (current - 1 + items.length) % items.length,
            );
        } else if (event.key === 'Enter' && showList && active >= 0) {
            event.preventDefault();
            choose(items[active]);
        } else if (event.key === 'Escape' && showList) {
            event.preventDefault();
            setOpen(false);
            setActive(-1);
        }
    };

    const number = new Intl.NumberFormat(i18n.language);
    const inputClass =
        variant === 'player'
            ? 'min-h-11 w-full rounded-xl border-2 border-[#151b2e] bg-white pr-9 pl-9 font-semibold'
            : 'border-input flex h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 pl-9 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 md:text-sm';
    /** The city trigger is a button, so on auth pages it mirrors the input look of auth-landing.css. */
    const cityTriggerClass =
        variant === 'player'
            ? 'min-h-11 w-full rounded-xl border-2 border-[#151b2e] bg-white pl-9 font-semibold text-[#151b2e] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#6c5ce7] aria-invalid:border-destructive'
            : 'min-h-[46px] w-full min-w-0 rounded-[10px] border-2 border-[#151b2e] bg-[#faf7ef] py-1 pl-9 text-base text-[#151b2e] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive md:text-sm';
    const labelClass =
        variant === 'player'
            ? 'text-sm font-semibold'
            : 'text-sm leading-none font-medium select-none';

    return (
        <div className="flex flex-col gap-3" data-testid="school-picker">
            <div className="flex flex-col gap-1.5">
                <label htmlFor={`${idPrefix}_name`} className={labelClass}>
                    {t('schoolPicker.school')}
                </label>
                <div className="relative">
                    <School
                        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                        aria-hidden
                    />
                    <input
                        id={`${idPrefix}_name`}
                        name="school_name"
                        type="text"
                        role="combobox"
                        aria-expanded={showList}
                        aria-controls={listId}
                        aria-autocomplete="list"
                        aria-activedescendant={
                            showList && active >= 0
                                ? `${listId}-${active}`
                                : undefined
                        }
                        aria-invalid={schoolError ? true : undefined}
                        value={schoolName}
                        maxLength={120}
                        required={required}
                        autoComplete="off"
                        placeholder={t('schoolPicker.schoolPlaceholder')}
                        onChange={(event) => {
                            onSchoolNameChange(event.target.value);
                            setTyped(true);
                            setOpen(true);
                            setActive(-1);
                        }}
                        onFocus={() => setOpen(true)}
                        onBlur={() => {
                            blurTimer.current = window.setTimeout(
                                () => setOpen(false),
                                120,
                            );
                        }}
                        onKeyDown={onKeyDown}
                        className={inputClass}
                        data-testid="school-picker-input"
                    />
                    {loading && (
                        <Loader2
                            className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground"
                            aria-hidden
                        />
                    )}
                    <ul
                        id={listId}
                        role="listbox"
                        aria-label={t('schoolPicker.suggestions')}
                        hidden={!showList}
                        className="absolute top-[calc(100%+6px)] right-0 left-0 z-30 max-h-64 overflow-y-auto overscroll-contain rounded-xl border-2 border-[#151b2e] bg-white p-1 text-[#151b2e] shadow-[4px_4px_0_#151b2e]"
                        data-testid="school-picker-list"
                    >
                        {items.map((item, index) => (
                            <li
                                key={`${item.name}-${index}`}
                                id={`${listId}-${index}`}
                                role="option"
                                aria-selected={index === active}
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={() => choose(item)}
                                onMouseEnter={() => setActive(index)}
                                className={cn(
                                    'flex cursor-pointer items-start gap-2 rounded-lg px-2.5 py-2 text-sm',
                                    index === active
                                        ? 'bg-[#fff0cf]'
                                        : 'hover:bg-[#fff9e6]',
                                )}
                                data-testid="school-picker-option"
                            >
                                <School
                                    className="mt-0.5 size-4 shrink-0"
                                    aria-hidden
                                />
                                <span className="min-w-0 flex-1">
                                    <span className="block font-bold break-words">
                                        {item.name}
                                    </span>
                                    <span className="flex flex-wrap gap-x-2 text-xs font-semibold text-[#151b2e]/70">
                                        {item.city && (
                                            <span className="inline-flex items-center gap-1">
                                                <MapPin
                                                    className="size-3"
                                                    aria-hidden
                                                />
                                                {item.city}
                                            </span>
                                        )}
                                        {item.players !== undefined && (
                                            <span>
                                                {t('schoolPicker.players', {
                                                    count: item.players,
                                                    formatted: number.format(
                                                        item.players,
                                                    ),
                                                })}
                                            </span>
                                        )}
                                    </span>
                                </span>
                            </li>
                        ))}
                        {loading && items.length === 0 && (
                            <li
                                role="presentation"
                                className="px-2.5 py-2 text-sm text-[#151b2e]/70"
                            >
                                {t('schoolPicker.searching')}
                            </li>
                        )}
                    </ul>
                </div>
                <p className="text-xs text-[#151b2e]/75">
                    {typed &&
                    query.length >= MIN_QUERY &&
                    !loading &&
                    !exactMatch
                        ? t('schoolPicker.newSchool')
                        : t('schoolPicker.hint')}
                </p>
                <InputError message={schoolError} />
            </div>
            <div className="flex flex-col gap-1.5">
                <label htmlFor={`${idPrefix}_city`} className={labelClass}>
                    {t('schoolPicker.city')}
                </label>
                <SearchableSelect
                    id={`${idPrefix}_city`}
                    name="school_city"
                    value={schoolCity}
                    options={regencies.options}
                    onChange={onSchoolCityChange}
                    loading={regencies.loading}
                    loadingText={t('schoolPicker.cityLoading')}
                    placeholder={t('schoolPicker.cityPlaceholder')}
                    searchPlaceholder={t('schoolPicker.citySearch')}
                    emptyText={t('schoolPicker.cityEmpty')}
                    clearLabel={t('schoolPicker.cityClear')}
                    invalid={Boolean(cityError)}
                    leadingIcon={
                        <MapPin
                            className="size-4 text-muted-foreground"
                            aria-hidden
                        />
                    }
                    className={cityTriggerClass}
                    testId="school-picker-city"
                />
                <InputError message={cityError} />
            </div>
        </div>
    );
}
