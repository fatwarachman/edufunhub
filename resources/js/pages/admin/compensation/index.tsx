import { Panel, StatTile } from '@/components/admin/game-stats';
import InputError from '@/components/input-error';
import AdminLayout from '@/layouts/admin-layout';
import { tr } from '@/lib/admin-i18n';
import { cn } from '@/lib/utils';
import { type SharedData } from '@/types';
import { Head, useForm, usePage } from '@inertiajs/react';
import {
    CircleCheck,
    Coins,
    GraduationCap,
    Loader2,
    Users,
} from 'lucide-react';
import { type FormEvent, type ReactNode, useState } from 'react';

interface Rate {
    grade: number;
    amount: number;
}

interface TeacherEarning {
    id: number;
    name: string;
    email: string;
    correct_answers: number;
    total: number;
}

interface CompensationProps {
    rates: Rate[];
    teachers: TeacherEarning[];
    totalPaid: number;
    lastUpdated: { at: string | null; by: string | null } | null;
}

const LEVELS: { label: string; grades: number[] }[] = [
    { label: 'Kindergarten (TK)', grades: [0] },
    { label: 'Elementary (SD)', grades: [1, 2, 3, 4, 5, 6] },
    { label: 'Junior high (SMP)', grades: [7, 8, 9] },
    { label: 'Senior high (SMA)', grades: [10, 11, 12] },
];

const rupiah = new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
});

const gradeName = (grade: number): string =>
    grade === 0 ? tr('TK') : tr('Grade {0}', [grade]);

export default function CompensationIndex({
    rates,
    teachers,
    totalPaid,
    lastUpdated,
}: CompensationProps) {
    const { flash } = usePage<SharedData>().props;
    const form = useForm<{ rates: Rate[] }>({ rates });
    const { data, setData, errors, processing, isDirty } = form;
    const amountFor = (grade: number): number =>
        data.rates.find((rate) => rate.grade === grade)?.amount ?? 0;

    const setAmount = (grades: number[], value: string) => {
        const amount = Math.max(0, Math.floor(Number(value) || 0));
        setData((current) => ({
            ...current,
            rates: current.rates.map((rate) =>
                grades.includes(rate.grade) ? { ...rate, amount } : rate,
            ),
        }));
    };

    const submit = (event: FormEvent) => {
        event.preventDefault();
        form.put('/admin/compensation', { preserveScroll: true });
    };

    const errorFor = (grade: number): string | undefined => {
        const index = data.rates.findIndex((rate) => rate.grade === grade);
        return (errors as Record<string, string>)[`rates.${index}.amount`];
    };

    return (
        <>
            <Head title={tr('Teacher Compensation')} />
            <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-1">
                    <h2 className="font-display text-2xl font-bold text-foreground">
                        {tr('Teacher Compensation')}
                    </h2>
                    <p className="max-w-3xl text-sm text-muted-foreground">
                        {tr(
                            "Amount a teacher earns each time a player answers one of the teacher's questions correctly. The rate follows the player's grade and is locked in when the answer is recorded, so changes only affect future answers.",
                        )}
                    </p>
                </div>

                {flash?.success && (
                    <p
                        role="status"
                        className="flex items-center gap-2 rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm font-medium text-green-700 dark:text-green-300"
                    >
                        <CircleCheck className="size-4" />
                        {flash.success}
                    </p>
                )}

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <StatTile
                        icon={Coins}
                        color="bg-amber-500"
                        label={tr('Total compensation earned')}
                        value={rupiah.format(totalPaid)}
                    />
                    <StatTile
                        icon={Users}
                        color="bg-violet-500"
                        label={tr('Teachers earning')}
                        value={teachers.length}
                    />
                    <StatTile
                        icon={GraduationCap}
                        color="bg-sky-500"
                        label={tr('Last rate change')}
                        value={
                            lastUpdated?.at
                                ? new Date(lastUpdated.at).toLocaleDateString()
                                : '—'
                        }
                        hint={lastUpdated?.by ?? undefined}
                    />
                </div>

                <form onSubmit={submit} noValidate>
                    <Panel
                        title={tr('Rate per correct answer')}
                        description={tr('Set 0 to pay nothing for a grade.')}
                        icon={Coins}
                        actions={
                            <button
                                type="submit"
                                disabled={processing || !isDirty}
                                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow hover:bg-primary/90 disabled:opacity-50"
                                data-testid="compensation-save"
                            >
                                {processing && (
                                    <Loader2 className="size-4 animate-spin" />
                                )}
                                {tr('Save rates')}
                            </button>
                        }
                    >
                        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                            {LEVELS.map((level) => (
                                <section
                                    key={level.label}
                                    className="flex flex-col gap-3 rounded-xl border border-border p-4"
                                >
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <h4 className="font-semibold text-foreground">
                                            {tr(level.label)}
                                        </h4>
                                        {level.grades.length > 1 && (
                                            <ApplyAll
                                                onApply={(value) =>
                                                    setAmount(
                                                        level.grades,
                                                        value,
                                                    )
                                                }
                                            />
                                        )}
                                    </div>
                                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                        {level.grades.map((grade) => (
                                            <RateField
                                                key={grade}
                                                label={gradeName(grade)}
                                                value={amountFor(grade)}
                                                error={errorFor(grade)}
                                                onChange={(value) =>
                                                    setAmount([grade], value)
                                                }
                                                testId={`compensation-grade-${grade}`}
                                            />
                                        ))}
                                    </div>
                                </section>
                            ))}
                        </div>
                        <InputError message={errors.rates} />
                    </Panel>
                </form>

                <Panel
                    title={tr('Top earning teachers')}
                    description={tr(
                        'Compensation from correct answers to teacher questions.',
                    )}
                    icon={Users}
                >
                    {teachers.length === 0 ? (
                        <p className="py-6 text-center text-sm text-muted-foreground">
                            {tr('No teacher has earned compensation yet.')}
                        </p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[480px] text-sm">
                                <thead>
                                    <tr className="border-b border-border text-xs tracking-wider text-muted-foreground uppercase">
                                        <th className="py-2 pr-3 text-left font-medium">
                                            {tr('Teacher')}
                                        </th>
                                        <th className="px-3 py-2 text-right font-medium">
                                            {tr('Paid answers')}
                                        </th>
                                        <th className="py-2 pl-3 text-right font-medium">
                                            {tr('Total')}
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border">
                                    {teachers.map((teacher) => (
                                        <tr key={teacher.id}>
                                            <td className="py-2.5 pr-3">
                                                <p className="font-medium text-foreground">
                                                    {teacher.name}
                                                </p>
                                                <p className="text-xs text-muted-foreground">
                                                    {teacher.email}
                                                </p>
                                            </td>
                                            <td className="px-3 py-2.5 text-right text-foreground tabular-nums">
                                                {teacher.correct_answers.toLocaleString()}
                                            </td>
                                            <td className="py-2.5 pl-3 text-right font-semibold text-foreground tabular-nums">
                                                {rupiah.format(teacher.total)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </Panel>
            </div>
        </>
    );
}

function RateField({
    label,
    value,
    error,
    onChange,
    testId,
}: {
    label: string;
    value: number;
    error?: string;
    onChange: (value: string) => void;
    testId: string;
}): ReactNode {
    return (
        <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">
                {tr(label)}
            </span>
            <div
                className={cn(
                    'flex h-9 items-center rounded-lg border bg-background focus-within:ring-2 focus-within:ring-ring',
                    error ? 'border-destructive' : 'border-input',
                )}
            >
                <span className="pl-3 text-sm text-muted-foreground">
                    {tr('Rp')}
                </span>
                <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={1000000}
                    step={1}
                    value={value}
                    onChange={(event) => onChange(event.target.value)}
                    className="h-full w-full min-w-0 bg-transparent px-2 text-right text-sm text-foreground tabular-nums focus:outline-none"
                    data-testid={testId}
                />
            </div>
            <InputError message={error} />
        </label>
    );
}

function ApplyAll({ onApply }: { onApply: (value: string) => void }) {
    const [value, setValue] = useState('');
    return (
        <div className="flex items-center gap-1.5">
            <input
                type="number"
                min={0}
                placeholder={tr('Rp')}
                value={value}
                onChange={(event) => setValue(event.target.value)}
                aria-label={tr('Amount for every grade in this level')}
                className="h-8 w-24 rounded-lg border border-input bg-background px-2 text-right text-xs text-foreground"
            />
            <button
                type="button"
                disabled={value === ''}
                onClick={() => onApply(value)}
                className="h-8 rounded-lg border border-input px-2 text-xs font-medium text-foreground hover:bg-accent disabled:opacity-50"
            >
                {tr('Apply to all')}
            </button>
        </div>
    );
}

CompensationIndex.layout = (page: ReactNode) => (
    <AdminLayout title={tr('Teacher Compensation')}>{page}</AdminLayout>
);
