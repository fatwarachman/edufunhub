import { AiPoints, STUDENT_SECTIONS } from '@/components/classroom/ai-points';
import {
    AccuracyBar,
    MasteryBadge,
    useClassroomFormat,
    useGameCatalog,
} from '@/components/classroom/classroom-ui';
import type { MemberReport } from '@/components/classroom/types';
import { useTranslations } from '@/hooks/use-translations';
import PlayerLayout from '@/layouts/player-layout';
import { absoluteUrl, shareWhatsApp } from '@/lib/share';
import { useSubjectName } from '@/lib/subjects';
import {
    CalendarClock,
    CheckCheck,
    CircleX,
    Gamepad2,
    GraduationCap,
    MessageSquareShare,
    Printer,
    ShieldCheck,
    Trophy,
    Users,
} from 'lucide-react';

interface Props {
    report: MemberReport;
}

export default function ClassroomReport({ report }: Props) {
    const { t } = useTranslations();
    const format = useClassroomFormat();
    const subjectName = useSubjectName();
    const catalog = useGameCatalog();
    const {
        classroom,
        student,
        totals,
        mastery,
        games,
        subjects,
        topics,
        review,
        teacher_note,
        ai_feedback,
        shared_at,
    } = report;

    const classAccuracy = report.class_accuracy;

    const shareUrl = absoluteUrl(window.location.pathname);

    return (
        <PlayerLayout title={t('classroom.report.title')}>
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 flex-col gap-1">
                    <h1 className="text-2xl font-bold break-words md:text-3xl">
                        {classroom.name}
                    </h1>
                    <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Users className="size-4" aria-hidden="true" />
                        {classroom.teacher_name}
                    </p>
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <CalendarClock
                            className="size-3.5"
                            aria-hidden="true"
                        />
                        {format.dateTime(classroom.starts_at)} –{' '}
                        {format.dateTime(classroom.ends_at)}
                    </p>
                </div>
                <div className="flex gap-2">
                    <button
                        type="button"
                        onClick={() => window.print()}
                        className="edu-nav-btn"
                        aria-label={t('classroom.report.print')}
                    >
                        <Printer className="size-4" aria-hidden="true" />
                        <span className="edu-nav-label max-md:sr-only">
                            {t('classroom.report.print')}
                        </span>
                    </button>
                    <button
                        type="button"
                        onClick={() =>
                            shareWhatsApp(
                                t('classroom.report.waText', {
                                    name: student.name,
                                    url: shareUrl,
                                }),
                            )
                        }
                        className="edu-nav-btn"
                        aria-label={t('classroom.report.shareWa')}
                    >
                        <MessageSquareShare
                            className="size-4"
                            aria-hidden="true"
                        />
                        <span className="edu-nav-label max-md:sr-only">
                            {t('classroom.report.shareWa')}
                        </span>
                    </button>
                </div>
            </div>

            {shared_at && (
                <p className="flex items-center gap-2 rounded-xl border-2 border-[#1f2a44] bg-[#dff7ea] px-3 py-2 text-sm font-bold">
                    <CheckCheck className="size-4" aria-hidden="true" />
                    {t('classroom.report.sharedBadge')}
                </p>
            )}

            <section
                className="auth-card flex flex-col gap-4 !p-5"
                data-testid="report-totals"
            >
                <div className="flex flex-col items-center gap-2">
                    <MasteryBadge mastery={mastery} />
                    <p className="text-sm text-muted-foreground">
                        {student.name}
                    </p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="rounded-xl border-2 border-[#1f2a44] bg-white p-3 text-center">
                        <p className="text-2xl font-bold tabular-nums">
                            {format.number(totals.plays)}
                        </p>
                        <p className="text-xs font-bold text-muted-foreground">
                            {t('classroom.report.plays')}
                        </p>
                    </div>
                    <div className="rounded-xl border-2 border-[#1f2a44] bg-white p-3 text-center">
                        <p className="text-2xl font-bold tabular-nums">
                            {format.percent(totals.accuracy)}
                        </p>
                        <p className="text-xs font-bold text-muted-foreground">
                            {t('classroom.report.accuracy')}
                        </p>
                        {classAccuracy !== null && (
                            <div className="mt-2">
                                <AccuracyBar
                                    value={totals.accuracy}
                                    compare={classAccuracy}
                                    label={t(
                                        'classroom.report.accuracyCompare',
                                    )}
                                />
                                <p className="mt-1 text-xs text-muted-foreground">
                                    {t('classroom.report.classAvg')}:{' '}
                                    {format.percent(classAccuracy)}
                                </p>
                            </div>
                        )}
                    </div>
                    <div className="rounded-xl border-2 border-[#1f2a44] bg-white p-3 text-center">
                        <p className="text-2xl font-bold tabular-nums">
                            {format.number(totals.points)}
                        </p>
                        <p className="text-xs font-bold text-muted-foreground">
                            {t('classroom.report.points')}
                        </p>
                    </div>
                    {totals.rank !== null && (
                        <div className="rounded-xl border-2 border-[#1f2a44] bg-[#fff4cc] p-3 text-center">
                            <p className="text-2xl font-bold tabular-nums">
                                #{format.number(totals.rank)}
                            </p>
                            <p className="text-xs font-bold text-muted-foreground">
                                {t('classroom.report.rank')}
                            </p>
                        </div>
                    )}
                </div>
                <div className="flex flex-col gap-1">
                    <p className="text-sm font-bold">
                        {t('classroom.report.accuracyVsClass')}
                    </p>
                    <AccuracyBar
                        value={totals.accuracy}
                        compare={classAccuracy}
                    />
                </div>
            </section>

            {games.length > 0 && (
                <section
                    className="auth-card flex flex-col gap-3 !p-5"
                    data-testid="report-games"
                >
                    <h2 className="flex items-center gap-2 text-lg font-bold">
                        <Gamepad2 className="size-5" aria-hidden="true" />
                        {t('classroom.report.perGame')}
                    </h2>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {games.map((g) => {
                            const Icon = catalog.icon(g.game_key);
                            return (
                                <div
                                    key={g.game_key}
                                    className="rounded-xl border-2 border-[#1f2a44] bg-white p-3"
                                >
                                    <div className="flex items-center gap-2 text-sm font-bold">
                                        <Icon
                                            className="size-4 shrink-0"
                                            aria-hidden="true"
                                        />
                                        <span className="min-w-0 truncate">
                                            {catalog.title(g.game_key)}
                                        </span>
                                    </div>
                                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                                        <span>
                                            {t('classroom.report.plays')}:{' '}
                                            <strong>
                                                {format.number(g.plays)}
                                            </strong>
                                        </span>
                                        <span>
                                            {t('classroom.report.accuracy')}:{' '}
                                            <strong>
                                                {format.percent(g.accuracy)}
                                            </strong>
                                        </span>
                                        <span>
                                            {t('classroom.report.points')}:{' '}
                                            <strong>
                                                {format.number(g.points)}
                                            </strong>
                                        </span>
                                    </div>
                                    <AccuracyBar value={g.accuracy ?? null} />
                                </div>
                            );
                        })}
                    </div>
                </section>
            )}

            {subjects.length > 0 && (
                <section
                    className="auth-card flex flex-col gap-3 !p-5"
                    data-testid="report-subjects"
                >
                    <h2 className="flex items-center gap-2 text-lg font-bold">
                        <GraduationCap className="size-5" aria-hidden="true" />
                        {t('classroom.report.perSubject')}
                    </h2>
                    <div className="flex flex-col gap-3">
                        {subjects.map((s) => (
                            <div key={s.key} className="flex flex-col gap-1">
                                <div className="flex items-baseline justify-between gap-2 text-sm">
                                    <span className="font-bold">
                                        {subjectName(s.key)}
                                    </span>
                                    <span className="text-xs text-muted-foreground tabular-nums">
                                        {format.percent(s.accuracy)}
                                    </span>
                                </div>
                                <AccuracyBar
                                    value={s.accuracy ?? null}
                                    compare={s.class_accuracy ?? null}
                                />
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {topics.length > 0 && (
                <section
                    className="auth-card flex flex-col gap-3 !p-5"
                    data-testid="report-topics"
                >
                    <h2 className="flex items-center gap-2 text-lg font-bold">
                        <ShieldCheck className="size-5" aria-hidden="true" />
                        {t('classroom.report.perTopic')}
                    </h2>
                    <div className="flex flex-col gap-3">
                        {topics.map((topic) => (
                            <div
                                key={topic.name_id}
                                className="flex flex-col gap-1"
                            >
                                <div className="flex items-baseline justify-between gap-2 text-sm">
                                    <span className="font-bold">
                                        {topic.name_id}
                                    </span>
                                    <span className="text-xs text-muted-foreground tabular-nums">
                                        {format.percent(topic.accuracy)}
                                    </span>
                                </div>
                                <AccuracyBar value={topic.accuracy ?? null} />
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {review.length > 0 && (
                <section
                    className="auth-card flex flex-col gap-3 !p-5"
                    data-testid="report-review"
                >
                    <h2 className="flex items-center gap-2 text-lg font-bold">
                        <CircleX className="size-5" aria-hidden="true" />
                        {t('classroom.report.reviewTitle')}
                    </h2>
                    <div className="flex flex-col gap-2">
                        {review.map((r, i) => (
                            <div
                                key={i}
                                className="rounded-xl border-2 border-[#1f2a44] bg-white p-3"
                            >
                                <p className="text-sm font-semibold">
                                    {r.prompt_id}
                                </p>
                                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                                    <span className="font-bold text-[#1f2a44]">
                                        {t('classroom.report.correctAnswer')}:{' '}
                                        {r.correct_text}
                                    </span>
                                    {r.times_wrong > 0 && (
                                        <span className="text-[#b23a52]">
                                            <CircleX
                                                className="mr-0.5 inline size-3"
                                                aria-hidden="true"
                                            />
                                            {r.times_wrong}x{' '}
                                            {t('classroom.report.wrongTimes')}
                                        </span>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {teacher_note && (
                <section
                    className="auth-card flex flex-col gap-2 !p-5"
                    data-testid="report-teacher-note"
                >
                    <h2 className="flex items-center gap-2 text-base font-bold">
                        <Users className="size-4" aria-hidden="true" />
                        {t('classroom.report.teacherNote')}
                    </h2>
                    <p className="text-sm whitespace-pre-line">
                        {teacher_note}
                    </p>
                </section>
            )}

            {ai_feedback && (
                <section
                    className="auth-card flex flex-col gap-2 !p-5"
                    data-testid="report-ai-feedback"
                >
                    <h2 className="flex items-center gap-2 text-base font-bold">
                        <Trophy className="size-4" aria-hidden="true" />
                        {t('classroom.report.aiFeedback')}
                    </h2>
                    <AiPoints
                        sections={ai_feedback}
                        order={STUDENT_SECTIONS}
                        testId="report-ai-feedback-points"
                    />
                </section>
            )}

            <style>{`
@media print {
    body { background: white !important; }
    .auth-card { break-inside: avoid; box-shadow: none !important; border: 1px solid #ccc !important; }
    nav, button, .edu-nav-btn { display: none !important; }
}
`}</style>
        </PlayerLayout>
    );
}
