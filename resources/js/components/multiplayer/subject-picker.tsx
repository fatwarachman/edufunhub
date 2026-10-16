import { useTranslations } from '@/hooks/use-translations';
import { SubjectIcon, useSubjectName, useSubjects } from '@/lib/subjects';
import { cn } from '@/lib/utils';
import { type SharedData } from '@/types';
import { usePage } from '@inertiajs/react';
import { Lock, Shuffle } from 'lucide-react';
import { useEffect } from 'react';

/** The "all subjects" choice; every other value is a subject key. */
export const MIX_SUBJECT = 'mix';

/** Separator between several chosen subject keys ("math,science"). */
export const SUBJECT_SEPARATOR = ',';

/**
 * `mix`, one subject key from the admin-managed catalog, or several keys
 * joined by SUBJECT_SEPARATOR (the game service accepts all three).
 */
export type GameSubject = string;

const STORAGE_KEY = 'edufunhub.subject';
const KEY_PATTERN = /^[a-z][a-z0-9-]{1,29}$/;

/** Subject keys in a choice, deduplicated and sorted (empty = the mix). */
export function splitSubjects(value: GameSubject | null | undefined): string[] {
    if (!value || value === MIX_SUBJECT) {
        return [];
    }
    return [
        ...new Set(
            value
                .split(SUBJECT_SEPARATOR)
                .map((key) => key.trim())
                .filter((key) => KEY_PATTERN.test(key)),
        ),
    ].sort();
}

/** Joins subject keys into one choice value (no keys = the mix). */
export function joinSubjects(keys: string[]): GameSubject {
    const unique = splitSubjects(keys.join(SUBJECT_SEPARATOR));
    return unique.length === 0 ? MIX_SUBJECT : unique.join(SUBJECT_SEPARATOR);
}

/** Whether a value looks like a subject choice (mix or subject keys). */
export function isGameSubject(value: unknown): value is GameSubject {
    if (typeof value !== 'string') {
        return false;
    }
    if (value === MIX_SUBJECT) {
        return true;
    }
    const parts = value.split(SUBJECT_SEPARATOR);
    return parts.length > 0 && parts.every((key) => KEY_PATTERN.test(key));
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
 * Subjects the classroom set for the current game, or null outside a
 * classroom. Comes from the shared `gameReturn` prop (built server-side
 * from the membership), so a student cannot change it.
 */
export function useClassroomSubject(): GameSubject | null {
    const { props } = usePage<SharedData>();
    const classroom = props.gameReturn;
    if (!classroom?.href.startsWith('/portal/classrooms/')) {
        return null;
    }
    return joinSubjects(classroom.subjects ?? []);
}

/**
 * Subject choice shown before every game starts: the mix, or one or more
 * subjects (each button toggles its subject; clearing them all returns to
 * the mix). In rooms only the host changes it; everyone else sees the
 * host's choice. Subjects come from the admin catalog, so new subjects
 * appear without a code change.
 *
 * Inside a classroom the teacher already chose the subjects: the picker
 * turns into a read-only summary and sends that choice once, so rooms and
 * solo games all use the classroom subjects (the game service enforces
 * them too).
 */
export function SubjectPicker(props: {
    value: GameSubject;
    onChange: (subject: GameSubject) => void;
    disabled?: boolean;
    compact?: boolean;
    className?: string;
}) {
    const classroomSubject = useClassroomSubject();
    if (classroomSubject !== null) {
        return <ClassroomSubjects {...props} subject={classroomSubject} />;
    }
    return <SubjectChoice {...props} />;
}

/** Read-only classroom subjects that replace the picker in a classroom. */
function ClassroomSubjects({
    subject,
    value,
    onChange,
    disabled,
    className,
}: {
    subject: GameSubject;
    value: GameSubject;
    onChange: (subject: GameSubject) => void;
    disabled?: boolean;
    className?: string;
}) {
    const { t } = useTranslations();
    const subjects = useSubjects();
    const subjectName = useSubjectName();
    const keys = splitSubjects(subject);
    const current = joinSubjects(splitSubjects(value));

    useEffect(() => {
        if (!disabled && current !== subject) {
            onChange(subject);
        }
        // Sync once per change of the classroom or room value; onChange is
        // a new function on every render.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [subject, current, disabled]);

    return (
        <section
            className={cn('text-left', className)}
            data-testid="subject-picker"
            data-subject={subject}
            data-locked="true"
            aria-label={t('subjects.label')}
        >
            <p className="mb-1 text-xs font-black text-slate-500 uppercase">
                {t('subjects.label')}
            </p>
            <ul
                className="flex flex-wrap gap-2"
                data-testid="classroom-subjects"
            >
                {keys.length === 0 ? (
                    <li className="flex min-h-10 items-center gap-2 rounded-2xl border-2 border-[#1f2a44] bg-[#1f2a44] px-3 py-2 font-display text-sm leading-tight font-black text-white">
                        <Shuffle
                            className="size-4 shrink-0"
                            aria-hidden="true"
                        />
                        <span className="min-w-0 break-words">
                            {t('subjects.mix')}
                        </span>
                    </li>
                ) : (
                    keys.map((key) => (
                        <li
                            key={key}
                            data-testid={`classroom-subject-${key}`}
                            className="flex min-h-10 items-center gap-2 rounded-2xl border-2 border-[#1f2a44] bg-[#1f2a44] px-3 py-2 font-display text-sm leading-tight font-black text-white"
                        >
                            <SubjectIcon
                                icon={subjects.find((s) => s.key === key)?.icon}
                                className="size-4 shrink-0"
                            />
                            <span className="min-w-0 break-words">
                                {subjectName(key)}
                            </span>
                        </li>
                    ))
                )}
            </ul>
            <p className="mt-2 flex items-start gap-1.5 text-xs font-bold text-slate-500">
                <Lock className="mt-px size-3.5 shrink-0" aria-hidden="true" />
                {t('subjects.classroomLocked')}
            </p>
        </section>
    );
}

function SubjectChoice({
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
    const selectedKeys = splitSubjects(value).filter((key) =>
        subjects.some((s) => s.key === key),
    );
    const selectedValue = joinSubjects(selectedKeys);
    const isSelected = (key: string): boolean =>
        key === MIX_SUBJECT
            ? selectedKeys.length === 0
            : selectedKeys.includes(key);
    const choose = (key: string): void => {
        let next: GameSubject = MIX_SUBJECT;
        if (key !== MIX_SUBJECT) {
            next = joinSubjects(
                selectedKeys.includes(key)
                    ? selectedKeys.filter((k) => k !== key)
                    : [...selectedKeys, key],
            );
        }
        rememberSubject(next);
        onChange(next);
    };
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
            <legend className="mb-1 text-xs font-black text-slate-500 uppercase">
                {t('subjects.label')}
            </legend>
            <p className="mb-2 text-xs font-bold text-slate-500">
                {selectedKeys.length > 1
                    ? t('subjects.selectedCount', {
                          count: selectedKeys.length,
                      })
                    : t('subjects.multiHint')}
            </p>
            <div
                className={cn(
                    'grid gap-2',
                    compact
                        ? 'grid-cols-2 sm:grid-cols-4'
                        : 'grid-cols-2 sm:grid-cols-3',
                )}
            >
                {choices.map(({ key, label, icon }) => {
                    const selected = isSelected(key);
                    return (
                        <button
                            key={key}
                            type="button"
                            disabled={disabled}
                            aria-pressed={selected}
                            onClick={() => choose(key)}
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
    const keys = splitSubjects(isGameSubject(subject) ? subject : null);
    if (keys.length === 0) {
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
            {t('subjects.fallback', {
                subject: keys.map((key) => subjectName(key)).join(', '),
            })}
        </p>
    );
}
