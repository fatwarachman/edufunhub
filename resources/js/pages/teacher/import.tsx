import InputError from '@/components/input-error';
import { ResponsiveTable } from '@/components/responsive-table';
import { BackButton, NavButton } from '@/components/site-nav';
import { useTranslations } from '@/hooks/use-translations';
import PlayerLayout from '@/layouts/player-layout';
import { type SharedData } from '@/types';
import { useForm, usePage } from '@inertiajs/react';
import {
    CircleAlert,
    Download,
    FileSpreadsheet,
    FileUp,
    Loader2,
} from 'lucide-react';
import { type FormEvent, useRef } from 'react';

interface ImportProps {
    columns: string[];
    maxRows: number;
}

/** Column docs grouped so option_1..6 and hint columns share one row. */
const COLUMN_GUIDE: { key: string; columns: string; required: boolean }[] = [
    { key: 'type', columns: 'type', required: true },
    { key: 'grades', columns: 'grades', required: true },
    { key: 'subject', columns: 'subject', required: true },
    { key: 'games', columns: 'games', required: false },
    { key: 'question_id', columns: 'question_id', required: true },
    { key: 'question_en', columns: 'question_en', required: false },
    {
        key: 'options',
        columns: 'option_1_id … option_6_en',
        required: true,
    },
    { key: 'answer', columns: 'answer', required: true },
    { key: 'hint', columns: 'hint_id, hint_en', required: false },
];

export default function TeacherImport({ maxRows }: ImportProps) {
    const { t } = useTranslations();
    const { flash } = usePage<SharedData>().props;
    const input = useRef<HTMLInputElement>(null);
    const form = useForm<{ file: File | null }>({ file: null });
    const rowErrors = flash?.importErrors ?? [];

    const submit = (event: FormEvent) => {
        event.preventDefault();
        form.post('/teacher/questions/import', {
            forceFormData: true,
            onSuccess: () => {
                form.reset();
                if (input.current) {
                    input.current.value = '';
                }
            },
        });
    };

    return (
        <PlayerLayout title={t('teacher.importPage.title')}>
            <div className="flex w-full flex-col gap-6">
                <div className="flex flex-col items-start gap-3">
                    <BackButton
                        href="/teacher/questions"
                        label={t('teacher.form.back')}
                    />
                    <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
                        {t('teacher.importPage.title')}
                    </h1>
                    <p className="max-w-2xl text-muted-foreground">
                        {t('teacher.importPage.intro')}
                    </p>
                </div>

                <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                    <section className="auth-card flex flex-col gap-4 !bg-[#fff9e6] !p-5">
                        <h2 className="flex items-center gap-2 text-lg font-bold">
                            <FileSpreadsheet
                                className="size-5"
                                aria-hidden="true"
                            />
                            {t('teacher.importPage.steps')}
                        </h2>
                        <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm">
                            <li>{t('teacher.importPage.step1')}</li>
                            <li>{t('teacher.importPage.step2')}</li>
                            <li>{t('teacher.importPage.step3')}</li>
                        </ol>
                        <NavButton
                            href="/teacher/questions/template"
                            icon={Download}
                            label={t('teacher.importPage.download')}
                            variant="primary"
                            external
                            className="self-start"
                            testId="teacher-template-download"
                        />
                    </section>

                    <form
                        onSubmit={submit}
                        className="auth-card flex flex-col gap-4 !p-5"
                        noValidate
                    >
                        <h2 className="flex items-center gap-2 text-lg font-bold">
                            <FileUp className="size-5" aria-hidden="true" />
                            {t('teacher.importPage.file')}
                        </h2>
                        <label
                            htmlFor="import-file"
                            className="flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[#151b2e] bg-[#faf7ef] px-4 py-6 text-center hover:bg-[#fff0cf]"
                        >
                            <FileSpreadsheet
                                className="size-8"
                                aria-hidden="true"
                            />
                            <span className="font-bold">
                                {form.data.file
                                    ? t('teacher.importPage.selected', {
                                          name: form.data.file.name,
                                      })
                                    : t('teacher.importPage.choose')}
                            </span>
                            <span className="text-xs text-muted-foreground">
                                {t('teacher.importPage.maxRows', {
                                    count: maxRows,
                                })}
                            </span>
                        </label>
                        <input
                            ref={input}
                            id="import-file"
                            type="file"
                            accept=".csv,text/csv"
                            className="sr-only"
                            onChange={(event) =>
                                form.setData(
                                    'file',
                                    event.target.files?.[0] ?? null,
                                )
                            }
                            data-testid="teacher-import-file"
                        />
                        <InputError message={form.errors.file} />
                        <button
                            type="submit"
                            disabled={form.processing || !form.data.file}
                            className="inline-flex items-center justify-center gap-2 px-5 font-bold disabled:opacity-50"
                            data-testid="teacher-import-submit"
                        >
                            {form.processing && (
                                <Loader2 className="size-4 animate-spin" />
                            )}
                            {form.processing
                                ? t('teacher.importPage.uploading')
                                : t('teacher.importPage.upload')}
                        </button>
                    </form>
                </div>

                {rowErrors.length > 0 && (
                    <section
                        role="alert"
                        className="flex flex-col gap-3 rounded-2xl border-[3px] border-[#151b2e] bg-[#ffe1e6] p-5"
                        data-testid="teacher-import-errors"
                    >
                        <h2 className="flex items-center gap-2 text-lg font-bold">
                            <CircleAlert
                                className="size-5"
                                aria-hidden="true"
                            />
                            {t('teacher.importPage.errorsTitle')}
                        </h2>
                        <p className="text-sm">
                            {t('teacher.importPage.errorsIntro')}
                        </p>
                        <ul className="flex max-h-80 flex-col gap-2 overflow-y-auto">
                            {rowErrors.map((error) => (
                                <li
                                    key={error.row}
                                    className="rounded-xl border-2 border-[#151b2e] bg-white px-3 py-2 text-sm"
                                >
                                    <strong>
                                        {t('teacher.importPage.row', {
                                            row: error.row,
                                        })}
                                    </strong>
                                    <ul className="list-disc pl-5">
                                        {error.messages.map((message) => (
                                            <li key={message}>{message}</li>
                                        ))}
                                    </ul>
                                </li>
                            ))}
                        </ul>
                    </section>
                )}

                <section className="auth-card flex min-w-0 flex-col gap-4 !p-5">
                    <h2 className="text-lg font-bold">
                        {t('teacher.importPage.columns')}
                    </h2>
                    <ResponsiveTable
                        variant="player"
                        testId="import-columns"
                        rows={COLUMN_GUIDE}
                        rowKey={(row) => row.key}
                        columns={[
                            {
                                key: 'column',
                                header: t('teacher.importPage.column'),
                                primary: true,
                                cellClassName: 'align-top',
                                cell: (row) => (
                                    <span className="font-mono text-xs font-bold [overflow-wrap:anywhere]">
                                        {row.columns}
                                    </span>
                                ),
                            },
                            {
                                key: 'description',
                                header: t('teacher.importPage.description'),
                                cell: (row) =>
                                    t(`teacher.importPage.docs.${row.key}`),
                            },
                            {
                                key: 'required',
                                header: t('teacher.importPage.required'),
                                align: 'right',
                                cellClassName: 'align-top font-bold',
                                cell: (row) => (row.required ? '✓' : '—'),
                            },
                        ]}
                    />
                </section>
            </div>
        </PlayerLayout>
    );
}
