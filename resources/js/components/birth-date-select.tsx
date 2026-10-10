import { useTranslations } from '@/hooks/use-translations';
import { cn } from '@/lib/utils';
import { useMemo, useState } from 'react';

/** Same window the server accepts (PlayerProfile::MIN_AGE / MAX_AGE). */
const MIN_AGE = 3;
const MAX_AGE = 100;

interface Parts {
    day: string;
    month: string;
    year: string;
}

function splitDate(value: string): Parts {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);

    return match
        ? {
              year: match[1],
              month: String(Number(match[2])),
              day: String(Number(match[3])),
          }
        : { day: '', month: '', year: '' };
}

function daysIn(month: string, year: string): number {
    if (month === '') {
        return 31;
    }

    return new Date(Number(year || 2000), Number(month), 0).getDate();
}

/** Y-m-d once all three parts are picked, otherwise ''. */
function joinDate({ day, month, year }: Parts): string {
    if (day === '' || month === '' || year === '') {
        return '';
    }

    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

/**
 * Birth date as three native selects (day, month, year). Mobile browsers
 * always open their own wheel/list for a `<select>`, while `<input
 * type="date">` inside a modal dialog may not open a picker at all on some
 * phones. The value stays `Y-m-d` ('' while incomplete), like the date input.
 */
export function BirthDateSelect({
    id,
    value,
    onChange,
    invalid = false,
    className,
    testId,
}: {
    /** Put on the day select so an external `<label htmlFor>` focuses it. */
    id: string;
    value: string;
    onChange: (value: string) => void;
    invalid?: boolean;
    /** Classes for each select (border, height, colors). */
    className?: string;
    testId?: string;
}) {
    const { t, i18n } = useTranslations();
    const [parts, setParts] = useState<Parts>(() => splitDate(value));
    const [syncedValue, setSyncedValue] = useState(value);

    // A parent reset (form.reset, server prefill) replaces the picked parts.
    if (value !== syncedValue) {
        setSyncedValue(value);
        if (value !== joinDate(parts)) {
            setParts(splitDate(value));
        }
    }

    const months = useMemo(() => {
        const format = new Intl.DateTimeFormat(i18n.language, {
            month: 'long',
            timeZone: 'UTC',
        });

        return Array.from({ length: 12 }, (_, index) => ({
            value: String(index + 1),
            label: format.format(new Date(Date.UTC(2000, index, 1))),
        }));
    }, [i18n.language]);

    const years = useMemo(() => {
        const current = new Date().getFullYear();

        return Array.from({ length: MAX_AGE - MIN_AGE + 1 }, (_, index) =>
            String(current - MIN_AGE - index),
        );
    }, []);

    const dayCount = daysIn(parts.month, parts.year);

    const update = (field: keyof Parts, next: string) => {
        const merged = { ...parts, [field]: next };
        if (
            merged.day !== '' &&
            Number(merged.day) > daysIn(merged.month, merged.year)
        ) {
            merged.day = '';
        }
        const joined = joinDate(merged);
        setParts(merged);
        setSyncedValue(joined);
        onChange(joined);
    };

    const selectClass = cn('min-w-0', className);

    return (
        <div
            className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.4fr)_minmax(0,1fr)] gap-2"
            data-testid={testId}
        >
            <select
                id={id}
                value={parts.day}
                onChange={(event) => update('day', event.target.value)}
                aria-label={t('player.birthDay')}
                aria-invalid={invalid || undefined}
                className={selectClass}
                data-testid={testId ? `${testId}-day` : undefined}
            >
                <option value="">{t('player.birthDay')}</option>
                {Array.from({ length: dayCount }, (_, index) => (
                    <option key={index + 1} value={String(index + 1)}>
                        {index + 1}
                    </option>
                ))}
            </select>
            <select
                value={parts.month}
                onChange={(event) => update('month', event.target.value)}
                aria-label={t('player.birthMonth')}
                aria-invalid={invalid || undefined}
                className={selectClass}
                data-testid={testId ? `${testId}-month` : undefined}
            >
                <option value="">{t('player.birthMonth')}</option>
                {months.map((month) => (
                    <option key={month.value} value={month.value}>
                        {month.label}
                    </option>
                ))}
            </select>
            <select
                value={parts.year}
                onChange={(event) => update('year', event.target.value)}
                aria-label={t('player.birthYear')}
                aria-invalid={invalid || undefined}
                className={selectClass}
                data-testid={testId ? `${testId}-year` : undefined}
            >
                <option value="">{t('player.birthYear')}</option>
                {years.map((year) => (
                    <option key={year} value={year}>
                        {year}
                    </option>
                ))}
            </select>
        </div>
    );
}
