import {
    GradeChips,
    OutcomeBar,
    StatCard,
    Toggle,
} from '@/components/teacher/teacher-ui';
import { useTranslations } from '@/hooks/use-translations';
import PlayerLayout from '@/layouts/player-layout';
import { gradeShortLabel } from '@/lib/grade';
import { questionLevelKey } from '@/lib/question-levels';
import { useSubjectName } from '@/lib/subjects';
import { cn } from '@/lib/utils';
import {
    BarChart3,
    BookOpenCheck,
    BookText,
    CircleCheck,
    CircleX,
    Gamepad2,
    Info,
    Users,
} from 'lucide-react';
import { useState } from 'react';

interface QuestionDetail {
    id: number;
    type: 'choice' | 'true_false';
    band: number;
    subject: string;
    prompt_id: string;
    prompt_en: string | null;
    options: Record<string, { id: string; en: string | null }> | null;
    answer: string | string[];
    hint_id: string | null;
    hint_en: string | null;
    games: string[];
    is_active: boolean;
    source: string;
    topic_id: number | null;
    topic: { id: number; name_id: string; name_en: string | null } | null;
    level: number;
    grades: number[];
    created_at: string | null;
}

interface StatsDetail {
    answered: number;
    correct: number;
    wrong: number;
    success_rate: number | null;
    compensation: number;
    byAnswer: Record<string, { count: number; percent: number }>;
    byGame: {
        game_key: string;
        answered: number;
        correct: number;
        wrong: number;
    }[];
    byGrade: {
        grade: number;
        answered: number;
        correct: number;
        wrong: number;
    }[];
    aiVersus: {
        ai_answered: number;
        ai_correct: number;
        teacher_answered: number;
        teacher_correct: number;
    } | null;
}

interface BandInfo {
    value: number;
    min: number;
    max: number;
}

interface Props {
    question: QuestionDetail;
    stats: StatsDetail;
    bands: BandInfo[];
}

export default function TeacherQuestionShow({ question, stats, bands }: Props) {
    const { t, i18n } = useTranslations();
    const subjectName = useSubjectName();
    const english = i18n.language === 'en';
    const prompt =
        english && question.prompt_en ? question.prompt_en : question.prompt_id;
    const [showRaw, setShowRaw] = useState<Record<string, boolean>>({});

    const band = bands.find((b) => b.value === question.band);

    return (
        <PlayerLayout title={t('teacher.analysis.pageTitle')}>
            <div className="flex flex-col gap-2">
                <span className="auth-badge">{t('teacher.badge')}</span>
                <h1 className="text-2xl font-bold break-words md:text-3xl">
                    {t('teacher.analysis.heading')}
                </h1>
            </div>

            <section
                className="auth-card flex flex-col gap-4 !p-5"
                data-testid="question-detail"
            >
                <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border-2 border-[#151b2e] bg-[#fff0cf] px-2 py-0.5 text-xs font-bold">
                        {subjectName(question.subject)}
                    </span>
                    <span className="rounded-full border-2 border-[#151b2e] bg-white px-2 py-0.5 text-xs font-bold">
                        {question.type === 'choice'
                            ? t('teacher.form.choice')
                            : t('teacher.form.trueFalse')}
                    </span>
                    <span className="rounded-full border-2 border-[#151b2e] bg-[#efeaff] px-2 py-0.5 text-xs font-bold">
                        {t(
                            `teacher.levels.${questionLevelKey(question.level)}`,
                        )}
                        \{' '}
                        {t(
                            `classroom.levels.${questionLevelKey(question.level)}`,
                        )}
                    </span>
                    {question.is_active ? (
                        <span className="rounded-full border-2 border-[#151b2e] bg-[#dff7ea] px-2 py-0.5 text-xs font-bold">
                            {t('teacher.analysis.active')}
                        </span>
                    ) : (
                        <span className="rounded-full border-2 border-[#151b2e] bg-[#ffe1e6] px-2 py-0.5 text-xs font-bold">
                            {t('teacher.analysis.inactive')}
                        </span>
                    )}
                </div>
                <p className="text-lg font-semibold">{prompt}</p>
                <div className="flex flex-wrap gap-1.5 text-xs">
                    <span className="font-bold text-muted-foreground">
                        {t('teacher.form.grades')}:
                    </span>
                    <GradeChips grades={question.grades} />
                    {band && (
                        <span className="ml-2 font-bold text-muted-foreground">
                            {t('teacher.analysis.band', {
                                min: band.min,
                                max: band.max,
                            })}
                        </span>
                    )}
                </div>
            </section>

            <section
                className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
                data-testid="analysis-kpis"
            >
                <StatCard
                    icon={BookOpenCheck}
                    accent="#efeaff"
                    label={t('teacher.analysis.answered')}
                    value={stats.answered}
                />
                <StatCard
                    icon={CircleCheck}
                    accent="#dff7ea"
                    label={t('teacher.analysis.correct')}
                    value={stats.correct}
                />
                <StatCard
                    icon={CircleX}
                    accent="#ffe1e6"
                    label={t('teacher.analysis.wrong')}
                    value={stats.wrong}
                />
                <StatCard
                    icon={BarChart3}
                    accent="#fff0cf"
                    label={t('teacher.analysis.successRate')}
                    value={
                        stats.success_rate !== null
                            ? `${stats.success_rate}%`
                            : '—'
                    }
                />
            </section>

            {stats.byAnswer && Object.keys(stats.byAnswer).length > 0 && (
                <section
                    className="auth-card flex flex-col gap-3 !p-5"
                    data-testid="analysis-answer-dist"
                >
                    <h2 className="flex items-center gap-2 text-lg font-bold">
                        <BarChart3 className="size-5" aria-hidden="true" />
                        {t('teacher.analysis.answerDistribution')}
                    </h2>
                    <div className="flex flex-col gap-2">
                        {Object.entries(stats.byAnswer).map(([key, value]) => {
                            const isCorrect =
                                question.type === 'true_false'
                                    ? question.answer === key
                                    : (Array.isArray(question.answer) &&
                                          question.answer.includes(key)) ||
                                      question.answer === key;
                            return (
                                <div key={key} className="flex flex-col gap-1">
                                    <div className="flex items-center justify-between text-sm">
                                        <span
                                            className={cn(
                                                'font-bold',
                                                isCorrect
                                                    ? 'text-[#116a56]'
                                                    : '',
                                            )}
                                        >
                                            {key}:{' '}
                                            {english
                                                ? (question.options?.[key]
                                                      ?.en ??
                                                  question.options?.[key]?.id ??
                                                  key)
                                                : (question.options?.[key]
                                                      ?.id ?? key)}
                                            {isCorrect && (
                                                <CircleCheck className="ml-1 inline size-3.5 text-[#116a56]" />
                                            )}
                                        </span>
                                        <span className="text-muted-foreground tabular-nums">
                                            {value.count} ({value.percent}%)
                                        </span>
                                    </div>
                                    <div className="h-2 w-full overflow-hidden rounded-full border-2 border-[#151b2e] bg-white">
                                        <span
                                            className="block h-full"
                                            style={{
                                                width: `${value.percent}%`,
                                                background: isCorrect
                                                    ? '#1aab8a'
                                                    : '#e85d75',
                                            }}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </section>
            )}

            {stats.byGame.length > 0 && (
                <section
                    className="auth-card flex flex-col gap-3 !p-5"
                    data-testid="analysis-by-game"
                >
                    <h2 className="flex items-center gap-2 text-lg font-bold">
                        <Gamepad2 className="size-5" aria-hidden="true" />
                        {t('teacher.analysis.byGame')}
                    </h2>
                    <div className="flex flex-col gap-3">
                        {stats.byGame.map((g) => (
                            <div
                                key={g.game_key}
                                className="flex flex-col gap-1.5"
                            >
                                <div className="flex items-baseline justify-between gap-2 text-sm">
                                    <span className="font-bold">
                                        {t(`teacher.games.${g.game_key}`, {
                                            defaultValue: g.game_key,
                                        })}
                                    </span>
                                    <span className="text-xs text-muted-foreground tabular-nums">
                                        {g.answered}×
                                    </span>
                                </div>
                                <OutcomeBar
                                    correct={g.correct}
                                    wrong={g.wrong}
                                />
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {stats.byGrade.length > 0 && (
                <section
                    className="auth-card flex flex-col gap-3 !p-5"
                    data-testid="analysis-by-grade"
                >
                    <h2 className="flex items-center gap-2 text-lg font-bold">
                        <Users className="size-5" aria-hidden="true" />
                        {t('teacher.analysis.byGrade')}
                    </h2>
                    <div className="flex flex-col gap-3">
                        {stats.byGrade.map((g) => (
                            <div
                                key={g.grade}
                                className="flex flex-col gap-1.5"
                            >
                                <div className="flex items-baseline justify-between gap-2 text-sm">
                                    <span className="font-bold">
                                        {gradeShortLabel(t, g.grade)}
                                    </span>
                                    <span className="text-xs text-muted-foreground tabular-nums">
                                        {g.answered}×
                                    </span>
                                </div>
                                <OutcomeBar
                                    correct={g.correct}
                                    wrong={g.wrong}
                                />
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {stats.aiVersus && (
                <section
                    className="auth-card flex flex-col gap-3 !p-5"
                    data-testid="analysis-ai-versus"
                >
                    <h2 className="flex items-center gap-2 text-lg font-bold">
                        <Info className="size-5" aria-hidden="true" />
                        {t('teacher.analysis.aiVersus')}
                    </h2>
                    <div className="grid gap-3 sm:grid-cols-2">
                        <div className="rounded-xl border-2 border-[#151b2e] bg-white p-3">
                            <p className="text-xs font-bold text-muted-foreground">
                                {t('teacher.analysis.aiQuestions')}
                            </p>
                            <p className="text-xl font-bold tabular-nums">
                                {stats.aiVersus.ai_answered} ·{' '}
                                {t('teacher.analysis.correctRate', {
                                    rate:
                                        stats.aiVersus.ai_answered > 0
                                            ? Math.round(
                                                  (stats.aiVersus.ai_correct /
                                                      stats.aiVersus
                                                          .ai_answered) *
                                                      100,
                                              )
                                            : 0,
                                })}
                            </p>
                        </div>
                        <div className="rounded-xl border-2 border-[#151b2e] bg-white p-3">
                            <p className="text-xs font-bold text-muted-foreground">
                                {t('teacher.analysis.teacherQuestions')}
                            </p>
                            <p className="text-xl font-bold tabular-nums">
                                {stats.aiVersus.teacher_answered} ·{' '}
                                {t('teacher.analysis.correctRate', {
                                    rate:
                                        stats.aiVersus.teacher_answered > 0
                                            ? Math.round(
                                                  (stats.aiVersus
                                                      .teacher_correct /
                                                      stats.aiVersus
                                                          .teacher_answered) *
                                                      100,
                                              )
                                            : 0,
                                })}
                            </p>
                        </div>
                    </div>
                </section>
            )}

            <section className="auth-card flex flex-col gap-3 !p-5">
                <h2 className="flex items-center gap-2 text-lg font-bold">
                    <BookText className="size-5" aria-hidden="true" />
                    {t('teacher.analysis.rawInfo')}
                </h2>
                <Toggle
                    pressed={showRaw.raw}
                    onClick={() =>
                        setShowRaw((prev) => ({ ...prev, raw: !prev.raw }))
                    }
                    testId="analysis-raw-toggle"
                >
                    {t('teacher.analysis.showRaw')}
                </Toggle>
                {showRaw.raw && (
                    <pre className="overflow-auto rounded-xl border-2 border-[#151b2e] bg-[#f8f6f0] p-3 text-xs">
                        {JSON.stringify({ question, stats }, null, 2)}
                    </pre>
                )}
            </section>
        </PlayerLayout>
    );
}
