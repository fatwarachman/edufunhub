import InputError from '@/components/input-error';
import {
    SearchableSelect,
    type SearchableSelectOption,
} from '@/components/searchable-select';
import { useTranslations } from '@/hooks/use-translations';
import { cn } from '@/lib/utils';
import { GraduationCap, MapPin, PencilLine, School } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

/** Levels with their equivalents (sederajat): SD/MI, SMP/MTs, SMA/SMK/MA. */
export const SCHOOL_LEVELS = ['TK', 'SD', 'SMP', 'SMA', 'SLB'] as const;
export type SchoolLevel = (typeof SCHOOL_LEVELS)[number];

/** Picked school: city/regency, level, name and the official NPSN (empty = typed in). */
export interface SchoolChoice {
    city: string;
    level: string;
    name: string;
    npsn: string;
}

interface OfficialSchool {
    npsn: string;
    name: string;
    district: string | null;
    form: string;
}

type SchoolList = { schools: OfficialSchool[]; total: number };

const REGENCIES_ENDPOINT = '/player-details/regencies';
const SCHOOLS_ENDPOINT = '/player-details/school-list';
const DEBOUNCE_MS = 250;

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

/** Official schools of a city + level, fetched (debounced) per search. */
function useSchoolList(city: string, level: string, search: string) {
    const enabled = city !== '' && level !== '';
    const query = search.trim();
    const key = `${city}|${level}|${query.toLowerCase()}`;
    const [results, setResults] = useState<Record<string, SchoolList>>({});
    const current = enabled ? results[key] : undefined;
    const missing = enabled && current === undefined;

    useEffect(() => {
        if (!missing) {
            return;
        }
        const controller = new AbortController();
        const timer = window.setTimeout(
            async () => {
                let list: SchoolList = { schools: [], total: 0 };
                try {
                    const params = new URLSearchParams({
                        regency: city,
                        level,
                        q: query,
                    });
                    const response = await fetch(
                        `${SCHOOLS_ENDPOINT}?${params.toString()}`,
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
                        const data = (await response.json()) as SchoolList;
                        list = {
                            schools: Array.isArray(data.schools)
                                ? data.schools
                                : [],
                            total: Number(data.total) || 0,
                        };
                    }
                } catch {
                    if (controller.signal.aborted) {
                        return;
                    }
                }
                setResults((all) => ({ ...all, [key]: list }));
            },
            query === '' ? 0 : DEBOUNCE_MS,
        );

        return () => {
            controller.abort();
            window.clearTimeout(timer);
        };
    }, [missing, key, city, level, query]);

    return { list: current, loading: missing };
}

/**
 * School picker in three steps: city/regency, then level, then the official
 * school list (Dapodik) of that city and level, narrowed by typing a name or
 * district. A school missing from the list can still be typed in by hand.
 * Changing the city or level clears the picked school.
 */
export function SchoolPicker({
    value,
    onChange,
    schoolError,
    cityError,
    levelError,
    variant = 'player',
    idPrefix = 'school',
}: {
    value: SchoolChoice;
    onChange: (next: SchoolChoice) => void;
    schoolError?: string;
    cityError?: string;
    levelError?: string;
    /** "player": cream neo-brutalist inputs; "auth": inputs of the auth pages. */
    variant?: 'player' | 'auth';
    idPrefix?: string;
}) {
    const { t, i18n } = useTranslations();
    const regencies = useRegencyOptions();
    const [search, setSearch] = useState('');
    /** The official list is always the default; typing is an explicit opt-in. */
    const [manual, setManual] = useState(false);
    /** A school typed in before the list existed, kept until a new pick. */
    const legacyName = !manual && value.npsn === '' ? value.name : '';
    const { list, loading } = useSchoolList(value.city, value.level, search);
    const ready = value.city !== '' && value.level !== '';

    const schoolOptions = useMemo(
        () =>
            (list?.schools ?? []).map((school) => ({
                value: school.npsn,
                label: school.name,
                description: [
                    school.district,
                    school.form !== value.level ? school.form : null,
                ]
                    .filter(Boolean)
                    .join(' · '),
            })),
        [list, value.level],
    );

    const triggerClass =
        variant === 'player'
            ? 'min-h-11 w-full rounded-xl border-2 border-[#151b2e] bg-white pl-9 font-semibold text-[#151b2e] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#6c5ce7] aria-invalid:border-destructive'
            : 'min-h-[46px] w-full min-w-0 rounded-[10px] border-2 border-[#151b2e] bg-[#faf7ef] py-1 pl-9 text-base text-[#151b2e] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive md:text-sm';
    const inputClass =
        variant === 'player'
            ? 'min-h-11 w-full rounded-xl border-2 border-[#151b2e] bg-white pr-3.5 pl-9 font-semibold'
            : 'min-h-[46px] w-full min-w-0 rounded-[10px] border-2 border-[#151b2e] bg-[#faf7ef] py-1 pr-3 pl-9 text-base md:text-sm';
    const labelClass =
        variant === 'player'
            ? 'text-sm font-semibold'
            : 'text-sm leading-none font-medium select-none';
    const stepClass =
        'text-[11px] font-black tracking-wide text-[#151b2e]/80 uppercase';

    const setCity = (city: string) => {
        setSearch('');
        if (city !== value.city) {
            onChange({ city, level: value.level, name: '', npsn: '' });
        }
    };
    const setLevel = (level: string) => {
        setSearch('');
        if (level !== value.level) {
            onChange({ city: value.city, level, name: '', npsn: '' });
        }
    };
    const pickSchool = (npsn: string) => {
        const school = list?.schools.find((row) => row.npsn === npsn);
        onChange({
            ...value,
            npsn: school?.npsn ?? '',
            name: school?.name ?? '',
        });
    };
    const toggleManual = () => {
        setManual((on) => !on);
        onChange({ ...value, npsn: '', name: '' });
    };

    const number = new Intl.NumberFormat(i18n.language);
    const footer =
        list && list.total > list.schools.length
            ? t('schoolPicker.listCount', {
                  shown: number.format(list.schools.length),
                  total: number.format(list.total),
              })
            : undefined;

    return (
        <div className="flex flex-col gap-4" data-testid="school-picker">
            <div className="flex flex-col gap-1.5">
                <span className={stepClass}>{t('schoolPicker.step1')}</span>
                <label htmlFor={`${idPrefix}_city`} className={labelClass}>
                    {t('schoolPicker.city')}
                </label>
                <SearchableSelect
                    id={`${idPrefix}_city`}
                    name="school_city"
                    value={value.city}
                    options={regencies.options}
                    onChange={setCity}
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
                    className={triggerClass}
                    testId="school-picker-city"
                />
                <InputError message={cityError} />
            </div>

            <div className="flex min-w-0 flex-col gap-1.5">
                <span className={stepClass}>{t('schoolPicker.step2')}</span>
                <span id={`${idPrefix}_level`} className={labelClass}>
                    {t('schoolPicker.level')}
                </span>
                <div
                    className="grid grid-cols-6 gap-2 sm:grid-cols-5"
                    role="radiogroup"
                    aria-labelledby={`${idPrefix}_level`}
                    data-testid="school-picker-levels"
                >
                    {SCHOOL_LEVELS.map((level, index) => {
                        const selected = value.level === level;
                        return (
                            <button
                                key={level}
                                type="button"
                                role="radio"
                                aria-checked={selected}
                                disabled={value.city === ''}
                                onClick={() => setLevel(level)}
                                className={cn(
                                    index < 3
                                        ? 'col-span-2 sm:col-span-1'
                                        : 'col-span-3 sm:col-span-1',
                                    'flex min-h-14 min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl border-2 border-[#151b2e] px-1 py-1 text-center leading-tight text-[#151b2e] transition-colors focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#6c5ce7] disabled:cursor-not-allowed disabled:border-[#151b2e]/30 disabled:bg-[#f4f1e8] disabled:text-[#151b2e]/45',
                                    selected
                                        ? 'bg-[#ffd166] shadow-[2px_2px_0_#151b2e]'
                                        : 'bg-white hover:bg-[#fff9e6]',
                                )}
                                data-testid={`school-picker-level-${level}`}
                            >
                                <span className="font-display text-base font-black">
                                    {level}
                                </span>
                                <span className="w-full text-[10px] leading-tight font-semibold text-balance opacity-80">
                                    {t(`schoolPicker.levels.${level}`)}
                                </span>
                            </button>
                        );
                    })}
                </div>
                {value.city === '' && (
                    <p className="text-xs text-[#151b2e]/70">
                        {t('schoolPicker.levelFirstCity')}
                    </p>
                )}
                <InputError message={levelError} />
            </div>

            <div className="flex flex-col gap-1.5">
                <span className={stepClass}>{t('schoolPicker.step3')}</span>
                <label htmlFor={`${idPrefix}_name`} className={labelClass}>
                    {t('schoolPicker.school')}
                </label>
                {manual ? (
                    <div className="relative">
                        <PencilLine
                            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                            aria-hidden
                        />
                        <input
                            id={`${idPrefix}_name`}
                            name="school_name"
                            type="text"
                            value={value.name}
                            maxLength={120}
                            autoComplete="off"
                            disabled={!ready}
                            placeholder={
                                ready
                                    ? t('schoolPicker.schoolPlaceholder')
                                    : t('schoolPicker.listFirst')
                            }
                            aria-invalid={schoolError ? true : undefined}
                            onChange={(event) =>
                                onChange({
                                    ...value,
                                    name: event.target.value,
                                    npsn: '',
                                })
                            }
                            className={cn(
                                inputClass,
                                'disabled:cursor-not-allowed disabled:bg-[#f4f1e8]',
                            )}
                            data-testid="school-picker-input"
                        />
                    </div>
                ) : (
                    <SearchableSelect
                        id={`${idPrefix}_name`}
                        value={value.npsn}
                        selectedLabel={
                            value.npsn !== '' ? value.name : undefined
                        }
                        options={schoolOptions}
                        onChange={pickSchool}
                        onSearchChange={setSearch}
                        disabled={!ready}
                        loading={loading}
                        loadingText={t('schoolPicker.listLoading')}
                        placeholder={
                            ready
                                ? t('schoolPicker.listPlaceholder')
                                : t('schoolPicker.listFirst')
                        }
                        searchPlaceholder={t('schoolPicker.listSearch')}
                        emptyText={t('schoolPicker.listEmpty')}
                        clearLabel={t('schoolPicker.listClear')}
                        invalid={Boolean(schoolError)}
                        footer={footer}
                        leadingIcon={
                            <School
                                className="size-4 text-muted-foreground"
                                aria-hidden
                            />
                        }
                        className={triggerClass}
                        testId="school-picker-school"
                    />
                )}
                {legacyName !== '' && (
                    <p
                        className="rounded-lg border-2 border-dashed border-[#151b2e]/40 bg-[#fff9e6] px-2.5 py-1.5 text-xs font-semibold text-[#151b2e]"
                        data-testid="school-picker-legacy"
                    >
                        {t('schoolPicker.legacy', { name: legacyName })}
                    </p>
                )}
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-[#151b2e]/75">
                    <span className="inline-flex items-center gap-1">
                        {manual ? (
                            t('schoolPicker.manualHint')
                        ) : (
                            <>
                                <GraduationCap
                                    className="size-3.5 shrink-0"
                                    aria-hidden
                                />
                                {t('schoolPicker.official')}
                            </>
                        )}
                    </span>
                    <button
                        type="button"
                        onClick={toggleManual}
                        className="min-h-9 font-bold text-[#4c3fc4] underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-[#6c5ce7]"
                        data-testid="school-picker-manual"
                    >
                        {manual
                            ? t('schoolPicker.manualBack')
                            : t('schoolPicker.manual')}
                    </button>
                </div>
                <InputError message={schoolError} />
            </div>
        </div>
    );
}
