import InputError from '@/components/input-error';
import { SchoolPicker } from '@/components/school-picker';
import { useTranslations } from '@/hooks/use-translations';
import { useForm } from '@inertiajs/react';
import { IdCard, MapPin } from 'lucide-react';

export interface PlayerDetails {
    birth_date: string | null;
    school_name: string | null;
    school_city: string | null;
    school_level?: string | null;
    school_npsn?: string | null;
}

function ageFromBirthDate(birthDate: string): number {
    const [year, month, day] = birthDate.split('-').map(Number);
    const now = new Date();
    const hadBirthday =
        now.getMonth() + 1 > month ||
        (now.getMonth() + 1 === month && now.getDate() >= day);

    return now.getFullYear() - year - (hadBirthday ? 0 : 1);
}

/** Birth date + last school (and city) form, shared by dashboard and profile. */
export function PlayerDetailsCard({ details }: { details: PlayerDetails }) {
    const { t } = useTranslations();
    const form = useForm<{
        birth_date: string;
        school_name: string;
        school_city: string;
        school_level: string;
        school_npsn: string;
    }>({
        birth_date: details.birth_date ?? '',
        school_name: details.school_name ?? '',
        school_city: details.school_city ?? '',
        school_level: details.school_level ?? '',
        school_npsn: details.school_npsn ?? '',
    });
    const today = new Date().toISOString().slice(0, 10);
    const complete = Boolean(details.birth_date && details.school_name);

    return (
        <section
            id="player-details"
            className="auth-card flex scroll-mt-6 flex-col gap-3 !p-4 sm:!p-5"
        >
            <h2 className="flex items-center gap-2 text-xl font-bold">
                <IdCard className="size-5" aria-hidden />
                {t('player.details')}
            </h2>
            {complete && details.birth_date ? (
                <p className="flex flex-wrap items-center gap-x-1.5 text-sm font-semibold">
                    <span>
                        {t('player.age', {
                            count: ageFromBirthDate(details.birth_date),
                        })}
                    </span>
                    <span aria-hidden>·</span>
                    <span className="break-words">{details.school_name}</span>
                    {details.school_city && (
                        <span className="inline-flex items-center gap-1 text-[#151b2e]/75">
                            <MapPin className="size-3.5" aria-hidden />
                            {details.school_city}
                        </span>
                    )}
                </p>
            ) : (
                <p className="text-sm text-muted-foreground">
                    {t('player.detailsNote')}
                </p>
            )}
            <form
                className="flex flex-col gap-3"
                onSubmit={(event) => {
                    event.preventDefault();
                    form.patch('/player-details', { preserveScroll: true });
                }}
            >
                <label
                    htmlFor="birth-date-input"
                    className="text-sm font-semibold"
                >
                    {t('player.birthDate')}
                </label>
                <input
                    id="birth-date-input"
                    type="date"
                    name="birth_date"
                    value={form.data.birth_date}
                    max={today}
                    onChange={(event) =>
                        form.setData('birth_date', event.target.value)
                    }
                    className="min-h-11 w-full rounded-xl border-2 border-[#151b2e] bg-white px-3.5 font-semibold"
                />
                <InputError message={form.errors.birth_date} />
                <SchoolPicker
                    idPrefix="details-school"
                    value={{
                        city: form.data.school_city,
                        level: form.data.school_level,
                        name: form.data.school_name,
                        npsn: form.data.school_npsn,
                    }}
                    onChange={(next) =>
                        form.setData((current) => ({
                            ...current,
                            school_city: next.city,
                            school_level: next.level,
                            school_name: next.name,
                            school_npsn: next.npsn,
                        }))
                    }
                    schoolError={
                        form.errors.school_name ?? form.errors.school_npsn
                    }
                    cityError={form.errors.school_city}
                    levelError={form.errors.school_level}
                />
                {form.recentlySuccessful && (
                    <p
                        role="status"
                        className="text-sm font-semibold text-[#116a56]"
                    >
                        {t('player.detailsSaved')}
                    </p>
                )}
                <button
                    type="submit"
                    disabled={
                        form.processing ||
                        form.data.birth_date === '' ||
                        form.data.school_name.trim() === ''
                    }
                    className="px-5 py-2.5 font-bold disabled:opacity-50"
                >
                    {t('player.detailsSave')}
                </button>
            </form>
        </section>
    );
}
