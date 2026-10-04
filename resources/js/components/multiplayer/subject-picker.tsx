import { useTranslations } from '@/hooks/use-translations';
import { cn } from '@/lib/utils';
import {
    BookOpenText,
    Calculator,
    FlaskConical,
    Globe2,
    Landmark,
    Languages,
    Shuffle,
    type LucideIcon,
} from 'lucide-react';

/** Question subjects a game can be limited to; `mix` draws from all. */
export const GAME_SUBJECTS = [
    'mix',
    'math',
    'science',
    'language',
    'social',
    'english',
    'civics',
] as const;

export type GameSubject = (typeof GAME_SUBJECTS)[number];

const ICONS: Record<GameSubject, LucideIcon> = {
    mix: Shuffle,
    math: Calculator,
    science: FlaskConical,
    language: BookOpenText,
    social: Globe2,
    english: Languages,
    civics: Landmark,
};

const STORAGE_KEY = 'edufunhub.subject';

export function isGameSubject(value: unknown): value is GameSubject {
    return GAME_SUBJECTS.includes(value as GameSubject);
}

/** Last subject the player picked on this device (defaults to the mix). */
export function rememberedSubject(): GameSubject {
    try {
        const saved = window.localStorage.getItem(STORAGE_KEY);
        return isGameSubject(saved) ? saved : 'mix';
    } catch {
        return 'mix';
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
 * changes it; everyone else sees the host's choice.
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
    return (
        <fieldset
            className={cn('text-left', className)}
            data-testid="subject-picker"
            data-subject={value}
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
                {GAME_SUBJECTS.map((subject) => {
                    const Icon = ICONS[subject];
                    const selected = value === subject;
                    return (
                        <button
                            key={subject}
                            type="button"
                            disabled={disabled}
                            aria-pressed={selected}
                            onClick={() => {
                                rememberSubject(subject);
                                onChange(subject);
                            }}
                            data-testid={`subject-${subject}`}
                            className={cn(
                                'flex min-h-12 items-center gap-2 rounded-2xl border-2 border-[#1f2a44] px-3 py-2 text-left font-display text-sm leading-tight font-black transition-colors disabled:cursor-default',
                                subject === 'mix' && 'col-span-2 sm:col-span-1',
                                selected
                                    ? 'bg-[#1f2a44] text-white shadow-[3px_3px_0px_#FF9E44]'
                                    : 'bg-white text-[#1f2a44] enabled:hover:bg-[#FFF9E6] disabled:opacity-60',
                            )}
                        >
                            <Icon className="size-4 shrink-0" />
                            <span className="min-w-0">
                                {t(`subjects.${subject}`)}
                            </span>
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
    if (!isGameSubject(subject) || subject === 'mix') {
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
            {t('subjects.fallback', { subject: t(`subjects.${subject}`) })}
        </p>
    );
}
