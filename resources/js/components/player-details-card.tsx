import { EditableCardHeader, ReadOnlyFields } from '@/components/editable-card';
import InputError from '@/components/input-error';
import { SchoolPicker } from '@/components/school-picker';
import { WhatsAppIcon } from '@/components/whatsapp-share-button';
import { useTranslations } from '@/hooks/use-translations';
import { useForm } from '@inertiajs/react';
import { BellOff, IdCard, MapPin } from 'lucide-react';
import { useState } from 'react';

export interface PlayerDetails {
    birth_date: string | null;
    school_name: string | null;
    school_city: string | null;
    school_level?: string | null;
    school_npsn?: string | null;
    whatsapp_number?: string | null;
    whatsapp_notifications?: boolean;
}

function ageFromBirthDate(birthDate: string): number {
    const [year, month, day] = birthDate.split('-').map(Number);
    const now = new Date();
    const hadBirthday =
        now.getMonth() + 1 > month ||
        (now.getMonth() + 1 === month && now.getDate() >= day);

    return now.getFullYear() - year - (hadBirthday ? 0 : 1);
}

/** 6281234567890 -> +62 812-3456-7890 for display. */
function formatWhatsApp(number: string): string {
    const match = number.match(/^62(\d{3})(\d{4})(\d+)$/);

    return match ? `+62 ${match[1]}-${match[2]}-${match[3]}` : `+${number}`;
}

/**
 * Birth date, last school and WhatsApp number (profile page). Saved data is
 * read-only until the player taps Edit; an incomplete profile opens the form
 * straight away.
 */
export function PlayerDetailsCard({ details }: { details: PlayerDetails }) {
    const { t } = useTranslations();
    const form = useForm<{
        birth_date: string;
        school_name: string;
        school_city: string;
        school_level: string;
        school_npsn: string;
        whatsapp_number: string;
        whatsapp_notifications: boolean;
    }>({
        birth_date: details.birth_date ?? '',
        school_name: details.school_name ?? '',
        school_city: details.school_city ?? '',
        school_level: details.school_level ?? '',
        school_npsn: details.school_npsn ?? '',
        whatsapp_number: details.whatsapp_number ?? '',
        whatsapp_notifications: details.whatsapp_notifications ?? true,
    });
    const today = new Date().toISOString().slice(0, 10);
    const complete = Boolean(details.birth_date && details.school_name);
    const [editing, setEditing] = useState(!complete);
    const [saved, setSaved] = useState(false);

    const cancel = () => {
        form.reset();
        form.clearErrors();
        setEditing(false);
    };

    return (
        <section
            id="player-details"
            className="auth-card flex scroll-mt-6 flex-col gap-3 !p-4 sm:!p-5"
            data-testid="player-details"
        >
            <EditableCardHeader
                icon={<IdCard className="size-5" aria-hidden />}
                title={t('player.details')}
                editing={editing}
                canCancel={complete}
                onEdit={() => {
                    setSaved(false);
                    setEditing(true);
                }}
                onCancel={cancel}
                testId="player-details"
            />
            {!complete && (
                <p className="text-sm text-muted-foreground">
                    {t('player.detailsNote')}
                </p>
            )}
            {saved && !editing && (
                <p
                    role="status"
                    className="text-sm font-semibold text-[#116a56]"
                >
                    {t('player.detailsSaved')}
                </p>
            )}
            {!editing ? (
                <ReadOnlyFields
                    testId="player-details-view"
                    rows={[
                        {
                            label: t('player.birthDate'),
                            value: details.birth_date
                                ? t('player.age', {
                                      count: ageFromBirthDate(
                                          details.birth_date,
                                      ),
                                  })
                                : '—',
                            testId: 'player-details-view-age',
                        },
                        {
                            label: t('player.schoolName'),
                            value: (
                                <span className="flex flex-col">
                                    <span>{details.school_name || '—'}</span>
                                    {details.school_city && (
                                        <span className="inline-flex items-center gap-1 text-xs text-[#151b2e]/75">
                                            <MapPin
                                                className="size-3.5 shrink-0"
                                                aria-hidden
                                            />
                                            {details.school_city}
                                        </span>
                                    )}
                                </span>
                            ),
                            testId: 'player-details-view-school',
                        },
                        {
                            label: t('player.whatsappLabel'),
                            value: details.whatsapp_number ? (
                                <span className="flex flex-col">
                                    <span className="tabular-nums">
                                        {formatWhatsApp(
                                            details.whatsapp_number,
                                        )}
                                    </span>
                                    {details.whatsapp_notifications ===
                                        false && (
                                        <span className="inline-flex items-center gap-1 text-xs text-[#151b2e]/75">
                                            <BellOff
                                                className="size-3.5 shrink-0"
                                                aria-hidden
                                            />
                                            {t('player.whatsappOff')}
                                        </span>
                                    )}
                                </span>
                            ) : (
                                <span className="font-semibold text-[#151b2e]/75">
                                    {t('player.whatsappEmpty')}
                                </span>
                            ),
                            testId: 'player-details-view-whatsapp',
                        },
                    ]}
                />
            ) : (
                <form
                    className="flex flex-col gap-3"
                    data-testid="player-details-form"
                    onSubmit={(event) => {
                        event.preventDefault();
                        form.patch('/player-details', {
                            preserveScroll: true,
                            onSuccess: () => {
                                form.setDefaults();
                                setSaved(true);
                                setEditing(false);
                            },
                        });
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
                    <label
                        htmlFor="whatsapp-number-input"
                        className="flex items-center gap-1.5 text-sm font-semibold"
                    >
                        <WhatsAppIcon className="size-4 text-[#128c4a]" />
                        {t('player.whatsapp')}
                    </label>
                    <input
                        id="whatsapp-number-input"
                        type="tel"
                        name="whatsapp_number"
                        inputMode="tel"
                        autoComplete="tel"
                        maxLength={20}
                        placeholder={t('player.whatsappPlaceholder')}
                        value={form.data.whatsapp_number}
                        onChange={(event) =>
                            form.setData('whatsapp_number', event.target.value)
                        }
                        aria-describedby="whatsapp-number-hint"
                        data-testid="player-details-whatsapp"
                        className="min-h-11 w-full rounded-xl border-2 border-[#151b2e] bg-white px-3.5 font-semibold"
                    />
                    <p
                        id="whatsapp-number-hint"
                        className="-mt-1 text-xs text-[#151b2e]/75"
                    >
                        {t('player.whatsappHint')}
                    </p>
                    <InputError message={form.errors.whatsapp_number} />
                    <label className="flex cursor-pointer items-start gap-2.5 text-sm font-semibold">
                        <input
                            type="checkbox"
                            name="whatsapp_notifications"
                            checked={form.data.whatsapp_notifications}
                            onChange={(event) =>
                                form.setData(
                                    'whatsapp_notifications',
                                    event.target.checked,
                                )
                            }
                            data-testid="player-details-whatsapp-optin"
                            className="mt-0.5 size-5 shrink-0 accent-[#116a56]"
                        />
                        <span>{t('player.whatsappOptIn')}</span>
                    </label>
                    <button
                        type="submit"
                        disabled={
                            form.processing ||
                            form.data.birth_date === '' ||
                            form.data.school_name.trim() === ''
                        }
                        className="px-5 py-2.5 font-bold disabled:opacity-50"
                        data-testid="player-details-save"
                    >
                        {t('player.detailsSave')}
                    </button>
                </form>
            )}
        </section>
    );
}
