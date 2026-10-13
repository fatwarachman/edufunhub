import { useTranslations } from '@/hooks/use-translations';
import PlayerLayout from '@/layouts/player-layout';
import { Form } from '@inertiajs/react';
import { GraduationCap } from 'lucide-react';

interface Subject {
    key: string;
    name_id: string;
    name_en: string | null;
}

interface Props {
    subjects: Subject[];
    request: {
        status: string;
        subject_key: string | null;
        message: string | null;
    } | null;
}

export default function CreateTeacherRequest({ subjects, request }: Props) {
    const { t } = useTranslations();

    return (
        <PlayerLayout title={t('teacherRequest.title')}>
            <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
                <div className="flex flex-col gap-3">
                    <span className="auth-badge">
                        {t('teacherRequest.badge')}
                    </span>
                    <h1 className="text-3xl font-bold tracking-tight md:text-5xl">
                        {t('teacherRequest.title')}
                    </h1>
                    <p className="max-w-xl text-muted-foreground">
                        {t('teacherRequest.intro')}
                    </p>
                </div>
                {request?.status === 'pending' ? (
                    <div className="auth-card flex flex-col gap-3 p-6">
                        <GraduationCap className="size-8" aria-hidden="true" />
                        <h2 className="text-xl font-bold">
                            {t('teacherRequest.pending')}
                        </h2>
                        <p>{t('teacherRequest.pendingNote')}</p>
                    </div>
                ) : (
                    <Form
                        action="/teacher-request"
                        method="post"
                        className="auth-card flex flex-col gap-5 p-6"
                    >
                        {({ errors, processing }) => (
                            <>
                                <label className="flex flex-col gap-2 font-bold">
                                    {t('teacherRequest.subject')}
                                    <select
                                        name="subject_key"
                                        className="min-h-12 rounded-xl border-2 border-[#151b2e] bg-white px-3.5"
                                        defaultValue=""
                                    >
                                        <option value="">
                                            {t('teacherRequest.allSubjects')}
                                        </option>
                                        {subjects.map((subject) => (
                                            <option
                                                key={subject.key}
                                                value={subject.key}
                                            >
                                                {subject.name_id}
                                                {subject.name_en
                                                    ? ` / ${subject.name_en}`
                                                    : ''}
                                            </option>
                                        ))}
                                    </select>
                                    {errors.subject_key && (
                                        <span className="text-sm text-red-700">
                                            {errors.subject_key}
                                        </span>
                                    )}
                                </label>
                                <label className="flex flex-col gap-2 font-bold">
                                    {t('teacherRequest.message')}
                                    <textarea
                                        name="message"
                                        rows={5}
                                        className="rounded-xl border-2 border-[#151b2e] bg-white px-3.5 py-3"
                                        placeholder={t(
                                            'teacherRequest.messagePlaceholder',
                                        )}
                                    />
                                </label>
                                <button
                                    type="submit"
                                    disabled={processing}
                                    className="min-h-12 rounded-xl border-2 border-[#1f2a44] bg-[#1f2a44] px-4 font-display font-black text-white shadow-[3px_3px_0px_#FF9E44] disabled:opacity-50"
                                >
                                    {processing
                                        ? t('teacherRequest.sending')
                                        : t('teacherRequest.submit')}
                                </button>
                            </>
                        )}
                    </Form>
                )}
            </div>
        </PlayerLayout>
    );
}
