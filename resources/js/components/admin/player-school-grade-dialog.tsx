import { fieldClass } from '@/components/admin/game-stats';
import InputError from '@/components/input-error';
import { SchoolPicker } from '@/components/school-picker';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { tr } from '@/lib/admin-i18n';
import { ALL_GRADES, KINDERGARTEN } from '@/lib/grade';
import { cn } from '@/lib/utils';
import { useForm } from '@inertiajs/react';
import { Loader2 } from 'lucide-react';
import { type FormEvent } from 'react';

export interface PlayerSchoolGrade {
    grade: number | null;
    school_name: string | null;
    school_city: string | null;
    school_level: string | null;
    school_npsn: string | null;
}

export function adminGradeLabel(grade: number): string {
    return grade === KINDERGARTEN
        ? tr('Kindergarten (TK)')
        : tr('Grade {0}', [grade]);
}

/**
 * Super admin dialog to correct a learner's grade and school. A school picked
 * from the official list is resolved by NPSN on the server.
 */
export function PlayerSchoolGradeDialog({
    userId,
    profile,
    open,
    onClose,
}: {
    userId: number;
    profile: PlayerSchoolGrade;
    open: boolean;
    onClose: () => void;
}) {
    const form = useForm<{
        grade: string;
        school_name: string;
        school_city: string;
        school_level: string;
        school_npsn: string;
        profile?: string;
    }>({
        grade: profile.grade === null ? '' : String(profile.grade),
        school_name: profile.school_name ?? '',
        school_city: profile.school_city ?? '',
        school_level: profile.school_level ?? '',
        school_npsn: profile.school_npsn ?? '',
    });
    const { data, errors, processing } = form;

    const submit = (event: FormEvent) => {
        event.preventDefault();
        form.patch(`/admin/users/${userId}/player-details`, {
            preserveScroll: true,
            onSuccess: onClose,
        });
    };

    return (
        <Dialog
            open={open}
            onOpenChange={(next) => !next && !processing && onClose()}
        >
            <DialogContent
                className="max-h-[calc(100dvh-2rem)] overflow-y-auto p-4 sm:max-w-xl sm:p-6 dark:border-white/15 dark:shadow-[0_0_24px_rgba(255,255,255,0.06)]"
                data-testid="player-school-grade-dialog"
            >
                <DialogHeader>
                    <DialogTitle>{tr('Edit grade and school')}</DialogTitle>
                    <DialogDescription>
                        {tr(
                            'A school picked from the official list fills in its name, city and level automatically.',
                        )}
                    </DialogDescription>
                </DialogHeader>
                <form
                    onSubmit={submit}
                    className="flex min-w-0 flex-col gap-5"
                    data-testid="player-school-grade-form"
                >
                    {errors.profile && (
                        <p
                            role="alert"
                            className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200"
                        >
                            {tr(errors.profile)}
                        </p>
                    )}
                    <div className="flex flex-col gap-1.5">
                        <label
                            htmlFor="admin-player-grade"
                            className="text-sm font-medium text-foreground"
                        >
                            {tr('Grade')}
                        </label>
                        <select
                            id="admin-player-grade"
                            name="grade"
                            value={data.grade}
                            onChange={(event) =>
                                form.setData('grade', event.target.value)
                            }
                            aria-invalid={errors.grade ? true : undefined}
                            className={cn(
                                fieldClass,
                                'h-11 w-full dark:border-white/25',
                                errors.grade && 'border-destructive',
                            )}
                            data-testid="player-school-grade-grade"
                        >
                            <option value="" disabled>
                                {tr('Choose a grade…')}
                            </option>
                            {ALL_GRADES.map((grade) => (
                                <option key={grade} value={String(grade)}>
                                    {adminGradeLabel(grade)}
                                </option>
                            ))}
                        </select>
                        <InputError message={errors.grade} />
                    </div>

                    <div className="min-w-0 rounded-xl border border-border bg-[#faf7ef] p-3 text-[#151b2e] sm:p-4 dark:border-white/15">
                        <SchoolPicker
                            idPrefix="admin-player-school"
                            value={{
                                city: data.school_city,
                                level: data.school_level,
                                name: data.school_name,
                                npsn: data.school_npsn,
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
                                errors.school_name ?? errors.school_npsn
                            }
                            cityError={errors.school_city}
                            levelError={errors.school_level}
                        />
                    </div>

                    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={processing}
                            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-border px-4 text-sm font-medium text-foreground hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none dark:border-white/25"
                        >
                            {tr('Cancel')}
                        </button>
                        <button
                            type="submit"
                            disabled={
                                processing ||
                                data.grade === '' ||
                                data.school_name.trim() === ''
                            }
                            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60"
                            data-testid="player-school-grade-save"
                        >
                            {processing && (
                                <Loader2 className="size-4 animate-spin" />
                            )}
                            {processing ? tr('Saving…') : tr('Save changes')}
                        </button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}
