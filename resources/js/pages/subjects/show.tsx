import { useTranslations } from '@/hooks/use-translations';
import PlayerLayout from '@/layouts/player-layout';
import { SubjectIcon } from '@/lib/subjects';
import { Head, Link } from '@inertiajs/react';
import { ArrowLeft, ChartNoAxesCombined, CircleAlert } from 'lucide-react';

interface SubjectData {
    key: string;
    nameId: string;
    nameEn: string | null;
    icon: string;
    color: string;
}

interface Analysis {
    summary: {
        answered: number;
        correct: number;
        success_rate: number | null;
        questions: number;
    };
    byGrade: {
        label: string | null;
        answered: number;
        success_rate: number | null;
    }[];
    byGame: {
        label: string | null;
        answered: number;
        success_rate: number | null;
    }[];
    weakestQuestions: {
        id: number;
        prompt: string;
        prompt_en: string | null;
        answered: number;
        success_rate: number | null;
    }[];
}

export default function SubjectShow({
    subject,
    analysis,
}: {
    subject: SubjectData;
    analysis: Analysis;
}) {
    const { t, i18n } = useTranslations();
    const name = i18n.language.startsWith('en')
        ? subject.nameEn || subject.nameId
        : subject.nameId;
    const accuracy =
        analysis.summary.success_rate === null
            ? '—'
            : `${analysis.summary.success_rate}%`;
    const questionName = (question: Analysis['weakestQuestions'][number]) =>
        i18n.language.startsWith('en')
            ? question.prompt_en || question.prompt
            : question.prompt;

    return (
        <PlayerLayout title={name}>
            <Head title={name} />
            <div className="flex flex-col gap-6">
                <Link
                    href="/portal"
                    className="inline-flex min-h-11 items-center gap-2 self-start text-sm font-bold hover:text-[#6c5ce7]"
                >
                    <ArrowLeft className="size-4" aria-hidden="true" />
                    {t('portal.subjectDetail.back')}
                </Link>
                <section className="auth-card flex flex-col gap-5 !bg-[#fff4d6] sm:flex-row sm:items-center">
                    <span
                        className="grid size-16 shrink-0 place-items-center rounded-2xl border-[3px] border-[#151b2e] text-white shadow-[3px_3px_0_#151b2e]"
                        style={{ background: subject.color }}
                    >
                        <SubjectIcon icon={subject.icon} className="size-8" />
                    </span>
                    <div className="min-w-0">
                        <span className="auth-badge">
                            {t('portal.subjectDetail.eyebrow')}
                        </span>
                        <h1 className="mt-2 text-3xl font-bold">{name}</h1>
                        <p className="text-sm text-muted-foreground">
                            {t('portal.subjectDetail.intro')}
                        </p>
                    </div>
                </section>
                <dl className="grid gap-4 sm:grid-cols-3">
                    <StatCard
                        label={t('portal.subjectDetail.accuracy')}
                        value={accuracy}
                    />
                    <StatCard
                        label={t('portal.subjectDetail.answers')}
                        value={analysis.summary.answered.toLocaleString(
                            i18n.language,
                        )}
                    />
                    <StatCard
                        label={t('portal.subjectDetail.questions')}
                        value={analysis.summary.questions.toLocaleString(
                            i18n.language,
                        )}
                    />
                </dl>
                <div className="grid gap-5 lg:grid-cols-2">
                    <SubjectBuckets
                        title={t('portal.subjectDetail.byGrade')}
                        rows={analysis.byGrade}
                    />
                    <SubjectBuckets
                        title={t('portal.subjectDetail.byGame')}
                        rows={analysis.byGame}
                    />
                </div>
                <section className="auth-card flex flex-col gap-4 !p-5">
                    <h2 className="flex items-center gap-2 text-xl font-bold">
                        <CircleAlert className="size-5 text-[#e85d75]" />
                        {t('portal.subjectDetail.weakestQuestions')}
                    </h2>
                    {analysis.weakestQuestions.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                            {t('portal.news.empty')}
                        </p>
                    ) : (
                        <ol className="flex flex-col gap-2">
                            {analysis.weakestQuestions.map(
                                (question, index) => (
                                    <li
                                        key={question.id}
                                        className="flex items-start gap-3 rounded-xl border-2 border-[#151b2e] bg-white p-3"
                                    >
                                        <span className="grid size-7 shrink-0 place-items-center rounded-full border-2 border-[#151b2e] bg-[#ffe1e6] text-xs font-bold">
                                            {index + 1}
                                        </span>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-bold">
                                                {questionName(question)}
                                            </p>
                                            <p className="mt-1 text-xs text-muted-foreground">
                                                {question.answered.toLocaleString(
                                                    i18n.language,
                                                )}{' '}
                                                {t(
                                                    'portal.subjectDetail.answersShort',
                                                )}{' '}
                                                · {question.success_rate ?? 0}%
                                            </p>
                                        </div>
                                    </li>
                                ),
                            )}
                        </ol>
                    )}
                </section>
            </div>
        </PlayerLayout>
    );
}

function StatCard({ label, value }: { label: string; value: string }) {
    return (
        <div className="auth-card flex min-w-0 flex-col gap-2 !p-5">
            <dt className="text-sm font-bold text-muted-foreground">{label}</dt>
            <dd className="text-3xl font-bold tabular-nums">{value}</dd>
        </div>
    );
}

function SubjectBuckets({
    title,
    rows,
}: {
    title: string;
    rows: {
        label: string | null;
        answered: number;
        success_rate: number | null;
    }[];
}) {
    const { t, i18n } = useTranslations();
    return (
        <section className="auth-card flex min-w-0 flex-col gap-4 !p-5">
            <h2 className="flex items-center gap-2 text-xl font-bold">
                <ChartNoAxesCombined className="size-5 text-[#6c5ce7]" />
                {title}
            </h2>
            {rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                    {t('portal.news.empty')}
                </p>
            ) : (
                <ul className="flex flex-col gap-2">
                    {rows.map((row) => (
                        <li
                            key={row.label ?? 'unknown'}
                            className="flex items-center justify-between gap-3 rounded-xl border-2 border-[#151b2e] bg-white px-3 py-2.5"
                        >
                            <span className="truncate text-sm font-bold">
                                {row.label ?? t('portal.subjectDetail.unknown')}
                            </span>
                            <span className="shrink-0 text-sm font-bold tabular-nums">
                                {row.success_rate ?? 0}% ·{' '}
                                {row.answered.toLocaleString(i18n.language)}
                            </span>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}
