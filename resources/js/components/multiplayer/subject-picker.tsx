import { useTranslations } from '@/hooks/use-translations';
import { SubjectIcon, useSubjectName, useSubjects } from '@/lib/subjects';
import { cn } from '@/lib/utils';
import { Shuffle } from 'lucide-react';

/** The "all subjects" choice; every other value is a subject key. */
export const MIX_SUBJECT = 'mix';

/** `mix` or a subject key from the admin-managed catalog. */
export type GameSubject = string;

const STORAGE_KEY = 'edufunhub.subject';
const KEY_PATTERN = /^[a-z][a-z0-9-]{1,29}$/;

/** Whether a value looks like a subject choice (mix or a subject key). */
export function isGameSubject(value: unknown): value is GameSubject {
    return (
        typeof value === 'string' &&
        (value === MIX_SUBJECT || KEY_PATTERN.test(value))
    );
}

/** Last subject the player picked on this device (defaults to the mix). */
export function rememberedSubject(): GameSubject {
    try {
        const saved = window.localStorage.getItem(STORAGE_KEY);
        return isGameSubject(saved) ? saved : MIX_SUBJECT;
    } catch {
        return MIX_SUBJECT;
    }
}

export function rememberSubject(subject: GameSubject): void {
    try {
        window.localStorage.setItem(STORAGE_KEY, subject);
    } catch {
        // Storage can be unavailable (private mode); the choice still applies.
    }
}

/**
 * Subject choice shown before every game starts. In rooms only the host
 * changes it; everyone else sees the host's choice. Subjects come from the
 * admin catalog, so new subjects appear without a code change.
 */
export function SubjectPicker({
    value,
    onChange,
    disabled,
    compact,
    className,
}: {
    value: GameSubject;
    onChange: (subject: GameSubject) => void;
    disabled?: boolean;
    compact?: boolean;
    className?: string;
}) {
    const { t } = useTranslations();
    const subjects = useSubjects();
    const subjectName = useSubjectName();
    const known =
        value === MIX_SUBJECT || subjects.some((s) => s.key === value);
    const selectedValue = known ? value : MIX_SUBJECT;
    const choices = [
        { key: MIX_SUBJECT, label: t('subjects.mix'), icon: null },
        ...subjects.map((subject) => ({
            key: subject.key,
            label: subjectName(subject.key),
            icon: subject.icon,
        })),
    ];

    return (
        <fieldset
            className={cn('text-left', className)}
            data-testid="subject-picker"
            data-subject={selectedValue}
        >
            <legend className="mb-2 text-xs font-black text-slate-500 uppercase">
                {t('subjects.label')}
            </legend>
            <div
                className={cn(
                    'grid gap-2',
                    compact
                        ? 'grid-cols-2 sm:grid-cols-4'
                        : 'grid-cols-2 sm:grid-cols-3',
                )}
            >
                {choices.map(({ key, label, icon }) => {
                    const selected = selectedValue === key;
                    return (
                        <button
                            key={key}
                            type="button"
                            disabled={disabled}
                            aria-pressed={selected}
                            onClick={() => {
                                rememberSubject(key);
                                onChange(key);
                            }}
                            data-testid={`subject-${key}`}
                            className={cn(
                                'flex min-h-12 items-center gap-2 rounded-2xl border-2 border-[#1f2a44] px-3 py-2 text-left font-display text-sm leading-tight font-black transition-colors disabled:cursor-default',
                                key === MIX_SUBJECT &&
                                    'col-span-2 sm:col-span-1',
                                selected
                                    ? 'bg-[#1f2a44] text-white shadow-[3px_3px_0px_#FF9E44]'
                                    : 'bg-white text-[#1f2a44] enabled:hover:bg-[#FFF9E6] disabled:opacity-60',
                            )}
                        >
                            {icon === null ? (
                                <Shuffle
                                    className="size-4 shrink-0"
                                    aria-hidden="true"
                                />
                            ) : (
                                <SubjectIcon
                                    icon={icon}
                                    className="size-4 shrink-0"
                                />
                            )}
                            <span className="min-w-0 break-words">{label}</span>
                        </button>
                    );
                })}
            </div>
            {disabled && (
                <p className="mt-2 text-xs font-bold text-slate-500">
                    {t('subjects.hostPicks')}
                </p>
            )}
        </fieldset>
    );
}

/**
 * Shown while playing when the chosen subject has no questions for the
 * player's grade yet, so the game uses the mix instead.
 */
export function SubjectFallbackNote({
    subject,
    className,
}: {
    subject?: string;
    className?: string;
}) {
    const { t } = useTranslations();
    const subjectName = useSubjectName();
    if (!isGameSubject(subject) || subject === MIX_SUBJECT) {
        return null;
    }
    return (
        <p
            role="status"
            data-testid="subject-fallback"
            className={cn(
                'rounded-xl border-2 border-[#1f2a44] bg-[#FFF9E6] px-3 py-1.5 text-xs font-bold text-[#1f2a44]',
                className,
            )}
        >
            {t('subjects.fallback', { subject: subjectName(subject) })}
        </p>
    );
}
