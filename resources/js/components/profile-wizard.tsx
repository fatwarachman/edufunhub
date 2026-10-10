import InputError from '@/components/input-error';
import { SchoolPicker } from '@/components/school-picker';
import { WhatsAppIcon } from '@/components/whatsapp-share-button';
import { useTranslations } from '@/hooks/use-translations';
import { GRADE_LEVELS, gradeLabel } from '@/lib/grade';
import { cn } from '@/lib/utils';
import { router } from '@inertiajs/react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import {
    ArrowLeft,
    ArrowRight,
    Check,
    GraduationCap,
    LogOut,
    Sparkles,
    UserRound,
} from 'lucide-react';
import { type ComponentType, type FormEvent, useEffect, useState } from 'react';

/** Prefill sent by the server while the first-login wizard is pending. */
export interface ProfileWizardPrefill {
    name: string;
    birth_date: string | null;
    grade: number | null;
    school_name: string | null;
    school_city: string | null;
    school_level: string | null;
    school_npsn: string | null;
    whatsapp_number: string | null;
}

interface WizardForm {
    name: string;
    birth_date: string;
    grade: string;
    school_name: string;
    school_city: string;
    school_level: string;
    school_npsn: string;
    whatsapp_number: string;
    whatsapp_notifications: boolean;
}

type Errors = Partial<Record<keyof WizardForm, string>>;

const STEPS = [
    { key: 'identity', icon: UserRound, fields: ['name', 'birth_date'] },
    {
        key: 'school',
        icon: GraduationCap,
        fields: [
            'grade',
            'school_name',
            'school_city',
            'school_level',
            'school_npsn',
        ],
    },
    {
        key: 'contact',
        icon: WhatsAppIcon,
        fields: ['whatsapp_number', 'whatsapp_notifications'],
    },
] as const satisfies readonly {
    key: string;
    icon: ComponentType<{ className?: string }>;
    fields: readonly (keyof WizardForm)[];
}[];

/** Same shape the server accepts: 0…, 62… or +62…, then 8-12 digits not starting with 0. */
const WHATSAPP_NUMBER = /^(?:\+62|62|0)[1-9]\d{7,11}$/;

const inputClass =
    'min-h-11 w-full rounded-xl border-2 border-[#151b2e] bg-white px-3.5 font-semibold text-[#151b2e] outline-none focus-visible:ring-4 focus-visible:ring-[#FF9E44]/40 aria-invalid:border-red-600';

function readPrefill(
    props: Record<string, unknown> | undefined,
): ProfileWizardPrefill | null {
    const value = props?.profileWizard;

    return value && typeof value === 'object'
        ? (value as ProfileWizardPrefill)
        : null;
}

function toForm(prefill: ProfileWizardPrefill): WizardForm {
    return {
        name: prefill.name ?? '',
        birth_date: prefill.birth_date ?? '',
        grade: prefill.grade === null ? '' : String(prefill.grade),
        school_name: prefill.school_name ?? '',
        school_city: prefill.school_city ?? '',
        school_level: prefill.school_level ?? '',
        school_npsn: prefill.school_npsn ?? '',
        whatsapp_number: prefill.whatsapp_number ?? '',
        whatsapp_notifications: true,
    };
}

/**
 * Mandatory first-login wizard (name, birth date, grade, last school,
 * WhatsApp). Mounted once next to the Inertia app and driven by the shared
 * `profileWizard` prop: it cannot be dismissed (no close button, Esc and
 * outside clicks are ignored) until the server stores the profile. Logging
 * out is the only way to leave.
 */
export function ProfileWizard({
    initialProps,
}: {
    initialProps: Record<string, unknown>;
}) {
    const { t } = useTranslations();
    const [prefill, setPrefill] = useState(() => readPrefill(initialProps));

    useEffect(() => {
        const sync = (props: unknown) =>
            setPrefill(readPrefill(props as Record<string, unknown>));
        const offNavigate = router.on('navigate', (event) =>
            sync(event.detail.page.props),
        );
        // Same-URL redirects (back() after saving) fire success, not navigate.
        const offSuccess = router.on('success', (event) =>
            sync(event.detail.page.props),
        );

        return () => {
            offNavigate();
            offSuccess();
        };
    }, []);

    if (prefill === null) {
        return null;
    }

    return (
        <DialogPrimitive.Root open modal>
            <DialogPrimitive.Portal>
                <DialogPrimitive.Overlay className="fixed inset-0 z-[70] bg-[#1f2a44]/60 backdrop-blur-sm" />
                <DialogPrimitive.Content
                    onEscapeKeyDown={(event) => event.preventDefault()}
                    onPointerDownOutside={(event) => event.preventDefault()}
                    onInteractOutside={(event) => event.preventDefault()}
                    className="fixed inset-x-0 bottom-0 z-[70] flex max-h-[calc(100dvh-0.75rem)] w-full flex-col overflow-hidden rounded-t-3xl border-[3px] border-[#1f2a44] bg-[#FFFDF7] text-[#1f2a44] shadow-[6px_6px_0px_#1f2a44] outline-none sm:inset-x-auto sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:max-h-[calc(100dvh-2rem)] sm:w-[min(36rem,calc(100vw-2rem))] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl"
                    data-testid="profile-wizard"
                >
                    <WizardBody prefill={prefill} t={t} />
                </DialogPrimitive.Content>
            </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
    );
}

function WizardBody({
    prefill,
    t,
}: {
    prefill: ProfileWizardPrefill;
    t: ReturnType<typeof useTranslations>['t'];
}) {
    const [data, setData] = useState<WizardForm>(() => toForm(prefill));
    const [errors, setErrors] = useState<Errors>({});
    const [step, setStep] = useState(0);
    const [processing, setProcessing] = useState(false);
    const today = new Date().toISOString().slice(0, 10);
    const current = STEPS[step];
    const last = step === STEPS.length - 1;

    const update = <K extends keyof WizardForm>(
        field: K,
        value: WizardForm[K],
    ) => {
        setData((previous) => ({ ...previous, [field]: value }));
        setErrors((previous) => ({ ...previous, [field]: undefined }));
    };

    /** Light client checks so a step cannot be skipped empty; the server re-validates everything. */
    const validateStep = (index: number): Errors => {
        const found: Errors = {};
        const fields = STEPS[index].fields as readonly (keyof WizardForm)[];

        if (fields.includes('name') && data.name.trim().length < 2) {
            found.name = t('profileWizard.errors.name');
        }
        if (fields.includes('birth_date') && data.birth_date === '') {
            found.birth_date = t('profileWizard.errors.birthDate');
        }
        if (fields.includes('grade') && data.grade === '') {
            found.grade = t('profileWizard.errors.grade');
        }
        if (fields.includes('school_name') && data.school_name.trim() === '') {
            found.school_name = t('profileWizard.errors.school');
        }
        if (
            fields.includes('whatsapp_number') &&
            !WHATSAPP_NUMBER.test(data.whatsapp_number.replace(/[\s().-]/g, ''))
        ) {
            found.whatsapp_number = t('profileWizard.errors.whatsapp');
        }

        return found;
    };

    const goNext = () => {
        const found = validateStep(step);
        if (Object.keys(found).length > 0) {
            setErrors(found);
            return;
        }
        setStep((value) => Math.min(value + 1, STEPS.length - 1));
    };

    const submit = (event: FormEvent) => {
        event.preventDefault();
        if (!last) {
            goNext();
            return;
        }
        const found = validateStep(step);
        if (Object.keys(found).length > 0) {
            setErrors(found);
            return;
        }

        setProcessing(true);
        router.post(
            '/profile/wizard',
            { ...data, grade: Number(data.grade) },
            {
                preserveScroll: true,
                onError: (serverErrors) => {
                    setErrors(serverErrors as Errors);
                    const firstStep = STEPS.findIndex((candidate) =>
                        (
                            candidate.fields as readonly (keyof WizardForm)[]
                        ).some((field) => serverErrors[field]),
                    );
                    if (firstStep >= 0) {
                        setStep(firstStep);
                    }
                },
                onFinish: () => setProcessing(false),
            },
        );
    };

    return (
        <form
            onSubmit={submit}
            noValidate
            className="flex min-h-0 flex-1 flex-col"
            data-testid="profile-wizard-form"
        >
            <div className="flex flex-col gap-3 border-b-2 border-[#1f2a44]/10 px-5 pt-5 pb-4 sm:px-7 sm:pt-6">
                <div className="flex items-start gap-3">
                    <span className="grid size-11 shrink-0 place-items-center rounded-2xl border-2 border-[#1f2a44] bg-[#FFD93D] shadow-[2px_2px_0px_#1f2a44]">
                        <Sparkles className="size-5" aria-hidden />
                    </span>
                    <div className="min-w-0">
                        <DialogPrimitive.Title className="font-display text-xl font-black">
                            {t('profileWizard.title')}
                        </DialogPrimitive.Title>
                        <DialogPrimitive.Description className="text-sm text-[#1f2a44]/75">
                            {t('profileWizard.description')}
                        </DialogPrimitive.Description>
                    </div>
                </div>
                <ol
                    className="grid grid-cols-3 gap-2"
                    aria-label={t('profileWizard.progress', {
                        step: step + 1,
                        total: STEPS.length,
                    })}
                    data-testid="profile-wizard-steps"
                >
                    {STEPS.map((item, index) => {
                        const Icon = item.icon;
                        const done = index < step;
                        const active = index === step;
                        return (
                            <li
                                key={item.key}
                                aria-current={active ? 'step' : undefined}
                                className={cn(
                                    'flex min-w-0 items-center gap-1.5 rounded-xl border-2 px-2 py-1.5 text-xs font-bold',
                                    active
                                        ? 'border-[#1f2a44] bg-[#FF9E44] text-white shadow-[2px_2px_0px_#1f2a44]'
                                        : done
                                          ? 'border-[#1f2a44] bg-[#d9f5ea] text-[#116a56]'
                                          : 'border-[#1f2a44]/25 bg-white text-[#1f2a44]/60',
                                )}
                            >
                                {done ? (
                                    <Check
                                        className="size-4 shrink-0"
                                        aria-hidden
                                    />
                                ) : (
                                    <Icon
                                        className="size-4 shrink-0"
                                        aria-hidden
                                    />
                                )}
                                <span className="truncate">
                                    {t(`profileWizard.steps.${item.key}`)}
                                </span>
                            </li>
                        );
                    })}
                </ol>
            </div>

            <div
                className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-5 py-4 sm:px-7"
                data-testid={`profile-wizard-step-${current.key}`}
            >
                {current.key === 'identity' && (
                    <>
                        <label
                            htmlFor="wizard-name"
                            className="text-sm font-semibold"
                        >
                            {t('profileWizard.name')}
                        </label>
                        <input
                            id="wizard-name"
                            name="name"
                            autoComplete="name"
                            maxLength={80}
                            value={data.name}
                            onChange={(event) =>
                                update('name', event.target.value)
                            }
                            placeholder={t('profileWizard.namePlaceholder')}
                            aria-invalid={errors.name ? true : undefined}
                            className={inputClass}
                            data-testid="profile-wizard-name"
                        />
                        <InputError message={errors.name} />
                        <label
                            htmlFor="wizard-birth-date"
                            className="text-sm font-semibold"
                        >
                            {t('player.birthDate')}
                        </label>
                        <input
                            id="wizard-birth-date"
                            type="date"
                            name="birth_date"
                            max={today}
                            value={data.birth_date}
                            onChange={(event) =>
                                update('birth_date', event.target.value)
                            }
                            aria-invalid={errors.birth_date ? true : undefined}
                            className={inputClass}
                            data-testid="profile-wizard-birth-date"
                        />
                        <InputError message={errors.birth_date} />
                    </>
                )}

                {current.key === 'school' && (
                    <>
                        <label
                            htmlFor="wizard-grade"
                            className="text-sm font-semibold"
                        >
                            {t('profileWizard.grade')}
                        </label>
                        <select
                            id="wizard-grade"
                            name="grade"
                            value={data.grade}
                            onChange={(event) =>
                                update('grade', event.target.value)
                            }
                            aria-invalid={errors.grade ? true : undefined}
                            className={inputClass}
                            data-testid="profile-wizard-grade"
                        >
                            <option value="" disabled>
                                {t('player.gradePlaceholder')}
                            </option>
                            {GRADE_LEVELS.map((band) => (
                                <optgroup
                                    key={band.key}
                                    label={t(`player.gradeBands.${band.key}`)}
                                >
                                    {band.grades.map((value) => (
                                        <option key={value} value={value}>
                                            {gradeLabel(t, value)}
                                        </option>
                                    ))}
                                </optgroup>
                            ))}
                        </select>
                        <InputError message={errors.grade} />
                        <SchoolPicker
                            idPrefix="wizard-school"
                            value={{
                                city: data.school_city,
                                level: data.school_level,
                                name: data.school_name,
                                npsn: data.school_npsn,
                            }}
                            onChange={(next) => {
                                setData((previous) => ({
                                    ...previous,
                                    school_city: next.city,
                                    school_level: next.level,
                                    school_name: next.name,
                                    school_npsn: next.npsn,
                                }));
                                setErrors((previous) => ({
                                    ...previous,
                                    school_name: undefined,
                                    school_npsn: undefined,
                                }));
                            }}
                            schoolError={
                                errors.school_name ?? errors.school_npsn
                            }
                            cityError={errors.school_city}
                            levelError={errors.school_level}
                        />
                    </>
                )}

                {current.key === 'contact' && (
                    <>
                        <label
                            htmlFor="wizard-whatsapp"
                            className="flex items-center gap-1.5 text-sm font-semibold"
                        >
                            <WhatsAppIcon className="size-4 text-[#128c4a]" />
                            {t('player.whatsappLabel')}
                        </label>
                        <input
                            id="wizard-whatsapp"
                            type="tel"
                            name="whatsapp_number"
                            inputMode="tel"
                            autoComplete="tel"
                            maxLength={20}
                            placeholder={t('player.whatsappPlaceholder')}
                            value={data.whatsapp_number}
                            onChange={(event) =>
                                update('whatsapp_number', event.target.value)
                            }
                            aria-invalid={
                                errors.whatsapp_number ? true : undefined
                            }
                            aria-describedby="wizard-whatsapp-hint"
                            className={inputClass}
                            data-testid="profile-wizard-whatsapp"
                        />
                        <p
                            id="wizard-whatsapp-hint"
                            className="-mt-1 text-xs text-[#1f2a44]/75"
                        >
                            {t('player.whatsappHint')}
                        </p>
                        <InputError message={errors.whatsapp_number} />
                        <label className="flex cursor-pointer items-start gap-2.5 text-sm font-semibold">
                            <input
                                type="checkbox"
                                name="whatsapp_notifications"
                                checked={data.whatsapp_notifications}
                                onChange={(event) =>
                                    update(
                                        'whatsapp_notifications',
                                        event.target.checked,
                                    )
                                }
                                className="mt-0.5 size-5 shrink-0 accent-[#116a56]"
                                data-testid="profile-wizard-whatsapp-optin"
                            />
                            <span>{t('player.whatsappOptIn')}</span>
                        </label>
                    </>
                )}
            </div>

            <div className="flex flex-col gap-3 border-t-2 border-[#1f2a44]/10 px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-7 sm:pb-5">
                <div className="flex items-center gap-2">
                    {step > 0 && (
                        <button
                            type="button"
                            onClick={() => setStep((value) => value - 1)}
                            disabled={processing}
                            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border-2 border-[#1f2a44] bg-white px-3 text-sm font-black text-[#1f2a44] shadow-[2px_2px_0px_#1f2a44] transition-colors hover:bg-[#FFF176] disabled:opacity-50"
                            data-testid="profile-wizard-back"
                        >
                            <ArrowLeft className="size-4" aria-hidden />
                            {t('profileWizard.back')}
                        </button>
                    )}
                    <button
                        type="submit"
                        disabled={processing}
                        className="ml-auto inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border-3 border-[#1f2a44] bg-[#FF9E44] px-6 font-display text-lg font-black text-white shadow-[4px_4px_0px_#1f2a44] hover:bg-[#ff8f29] disabled:opacity-50"
                        data-testid={
                            last
                                ? 'profile-wizard-submit'
                                : 'profile-wizard-next'
                        }
                    >
                        {last
                            ? processing
                                ? t('profileWizard.saving')
                                : t('profileWizard.finish')
                            : t('profileWizard.next')}
                        {last ? (
                            <Check className="size-5" aria-hidden />
                        ) : (
                            <ArrowRight className="size-5" aria-hidden />
                        )}
                    </button>
                </div>
                <button
                    type="button"
                    onClick={() => router.post('/logout')}
                    className="inline-flex items-center justify-center gap-1.5 self-center text-xs font-semibold text-[#1f2a44]/70 underline-offset-4 hover:underline"
                    data-testid="profile-wizard-logout"
                >
                    <LogOut className="size-3.5" aria-hidden />
                    {t('profileWizard.logout')}
                </button>
            </div>
        </form>
    );
}
