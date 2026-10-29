import { useGameCatalog } from '@/components/classroom/classroom-ui';
import { NavButton } from '@/components/site-nav';
import { TeacherTabs } from '@/components/teacher/teacher-tabs';
import {
    OutcomeBar,
    StatCard,
    SuccessNotice,
    type UsageStats,
    useTeacherFormat,
} from '@/components/teacher/teacher-ui';
import { useTranslations } from '@/hooks/use-translations';
import PlayerLayout from '@/layouts/player-layout';
import { GRADE_LEVELS, gradeLabel } from '@/lib/grade';
import { useSubjectName } from '@/lib/subjects';
import { Link } from '@inertiajs/react';
import {
    BookOpenCheck,
    CircleCheck,
    CircleX,
    Coins,
    FileUp,
    Gamepad2,
    GraduationCap,
    ListChecks,
    Plus,
    School,
    Users,
} from 'lucide-react';

interface Bucket extends UsageStats {
    label: string;
}

interface GradeBucket extends UsageStats {
    grade: number;
}

interface RecentQuestion {
    id: number;
    type: 'choice' | 'true_false';
    subject: string;
    prompt_id: string;
    prompt_en: string | null;
    is_active: boolean;
    created_at: string | null;
}

interface TeacherIndexProps {
    overview: {
        summary: UsageStats & {
            questions: number;
            active_questions: number;
            used_questions: number;
        };
        byGame: Bucket[];
        byGrade: GradeBucket[];
        byLevel: Bucket[];
    };
    rates: Record<string, number>;
    recent: RecentQuestion[];
}

export default function TeacherIndex({
    overview,
    rates,
    recent,
}: TeacherIndexProps) {
    const { t } = useTranslations();
    const games = useGameCatalog();
    const format = useTeacherFormat();
    const { summary } = overview;

    return (
        <PlayerLayout title={t('teacher.title')}>
            <TeacherTabs active="questions" />
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div className="flex min-w-0 flex-col items-start gap-3">
                    <span className="auth-badge">{t('teacher.badge')}</span>
                    <h1 className="text-3xl font-bold tracking-tight md:text-5xl">
                        {t('teacher.heading')}
                    </h1>
                    <p className="max-w-2xl text-muted-foreground">
                        {t('teacher.intro')}
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <NavButton
                        href="/teacher/classrooms"
                        icon={School}
                        label={t('teacher.tabs.classrooms')}
                        testId="teacher-classrooms-link"
                    />
                    <NavButton
                        href="/teacher/questions/list"
                        icon={ListChecks}
                        label={t('teacher.myQuestions')}
                        testId="teacher-list-link"
                    />
                    <NavButton
                        href="/teacher/questions/import"
                        icon={FileUp}
                        label={t('teacher.import')}
                        testId="teacher-import-link"
                    />
                    <NavButton
                        href="/teacher/questions/create"
                        icon={Plus}
                        label={t('teacher.create')}
                        variant="primary"
                        testId="teacher-create-link"
                    />
                </div>
            </div>

            <SuccessNotice />

            <section
                className="grid grid-cols-2 gap-2.5 sm:gap-4 xl:grid-cols-5"
                aria-label={t('teacher.heading')}
            >
                <StatCard
                    icon={BookOpenCheck}
                    accent="#efeaff"
                    label={t('teacher.stats.questions')}
                    value={format.number(summary.questions)}
                    hint={t('teacher.stats.questionsHint', {
                        active: format.number(summary.active_questions),
                        used: format.number(summary.used_questions),
                    })}
                    testId="teacher-stat-questions"
                />
                <StatCard
                    icon={Gamepad2}
                    accent="#fff0cf"
                    label={t('teacher.stats.used')}
                    value={format.number(summary.answered)}
                    hint={t('teacher.stats.usedHint', {
                        players: format.number(summary.players),
                    })}
                    testId="teacher-stat-used"
                />
                <StatCard
                    icon={CircleCheck}
                    accent="#dff7ea"
                    label={t('teacher.stats.correct')}
                    value={format.number(summary.correct)}
                    hint={t('teacher.stats.successRate', {
                        rate: format.percent(summary.success_rate),
                    })}
                    testId="teacher-stat-correct"
                />
                <StatCard
                    icon={CircleX}
                    accent="#ffe1e6"
                    label={t('teacher.stats.wrong')}
                    value={format.number(summary.wrong)}
                    testId="teacher-stat-wrong"
                />
                <StatCard
                    icon={Coins}
                    accent="#ffd93d"
                    label={t('teacher.stats.compensation')}
                    value={format.money(summary.compensation)}
                    hint={t('teacher.stats.compensationHint', {
                        count: summary.correct,
                    })}
                    testId="teacher-stat-compensation"
                    className="col-span-2 xl:col-span-1"
                />
            </section>

            <div className="grid gap-6 lg:grid-cols-3">
                <BreakdownCard
                    title={t('teacher.stats.byGame')}
                    icon={Gamepad2}
                    rows={overview.byGame.map((row) => ({
                        key: row.label,
                        label: games.title(row.label),
                        stats: row,
                    }))}
                    testId="teacher-by-game"
                />
                <BreakdownCard
                    title={t('teacher.stats.byLevel')}
                    icon={GraduationCap}
                    rows={overview.byLevel.map((row) => ({
                        key: row.label,
                        label: t(`teacher.levels.${row.label}`),
                        stats: row,
                    }))}
                    testId="teacher-by-level"
                />
                <BreakdownCard
                    title={t('teacher.stats.byGrade')}
                    icon={Users}
                    rows={overview.byGrade.map((row) => ({
                        key: String(row.grade),
                        label: gradeLabel(t, row.grade),
                        stats: row,
                    }))}
                    testId="teacher-by-grade"
                />
            </div>

            <RatesCard rates={rates} />

            <RecentQuestions recent={recent} />
        </PlayerLayout>
    );
}

function BreakdownCard({
    title,
    icon: Icon,
    rows,
    testId,
}: {
    title: string;
    icon: typeof Gamepad2;
    rows: { key: string; label: string; stats: UsageStats }[];
    testId: string;
}) {
    const { t } = useTranslations();
    const format = useTeacherFormat();
    const used = rows.filter((row) => row.stats.answered > 0);

    return (
        <section
            className="auth-card flex min-w-0 flex-col gap-4 !p-5"
            data-testid={testId}
        >
            <h2 className="flex items-center gap-2 text-lg font-bold">
                <Icon className="size-5" aria-hidden="true" />
                {title}
            </h2>
            {used.length === 0 ? (
                <div className="rounded-xl border-2 border-dashed border-[#151b2e]/25 px-4 py-6 text-center">
                    <p className="text-sm font-bold">
                        {t('teacher.stats.empty')}
                    </p>
                    <p className="text-xs text-muted-foreground">
                        {t('teacher.stats.emptyHint')}
                    </p>
                </div>
            ) : (
                <ul className="flex flex-col gap-3">
                    {used.map((row) => (
                        <li key={row.key} className="flex flex-col gap-1.5">
                            <div className="flex items-baseline justify-between gap-3 text-sm">
                                <span className="min-w-0 truncate font-bold">
                                    {row.label}
                                </span>
                                <span className="shrink-0 text-muted-foreground tabular-nums">
                                    {t('teacher.stats.answered')}{' '}
                                    <strong className="text-[#151b2e]">
                                        {format.number(row.stats.answered)}
                                    </strong>
                                </span>
                            </div>
                            <OutcomeBar
                                correct={row.stats.correct}
                                wrong={row.stats.wrong}
                            />
                            <div className="flex flex-wrap justify-between gap-x-3 text-xs font-semibold">
                                <span className="text-[#116a56]">
                                    {format.number(row.stats.correct)}{' '}
                                    {t('teacher.form.true').toLowerCase()}
                                </span>
                                <span className="text-[#b23a52]">
                                    {format.number(row.stats.wrong)}{' '}
                                    {t('teacher.form.false').toLowerCase()}
                                </span>
                                <span className="text-muted-foreground">
                                    {format.money(row.stats.compensation)}
                                </span>
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}

function RatesCard({ rates }: { rates: Record<string, number> }) {
    const { t } = useTranslations();
    const format = useTeacherFormat();

    return (
        <section
            className="auth-card flex flex-col gap-4 !bg-[#fff9e6] !p-5"
            data-testid="teacher-rates"
        >
            <div className="flex flex-col gap-1">
                <h2 className="flex items-center gap-2 text-lg font-bold">
                    <Coins className="size-5" aria-hidden="true" />
                    {t('teacher.rates.title')}
                </h2>
                <p className="text-sm text-muted-foreground">
                    {t('teacher.rates.note')}
                </p>
            </div>
            <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
                {GRADE_LEVELS.map((level) => (
                    <div
                        key={level.key}
                        className="flex min-w-0 flex-col gap-2 rounded-xl border-2 border-[#151b2e] bg-white p-2.5 sm:p-3"
                    >
                        <p className="text-sm font-bold">
                            {t(`teacher.levels.${level.key}`)}
                        </p>
                        <ul className="flex flex-col gap-1 text-xs sm:text-sm">
                            {level.grades.map((grade) => (
                                <li
                                    key={grade}
                                    className="flex flex-wrap justify-between gap-x-2"
                                >
                                    <span className="text-muted-foreground">
                                        {gradeLabel(t, grade)}
                                    </span>
                                    <span className="ml-auto font-bold whitespace-nowrap tabular-nums">
                                        {format.money(rates[grade] ?? 0)}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </div>
                ))}
            </div>
        </section>
    );
}

function RecentQuestions({ recent }: { recent: RecentQuestion[] }) {
    const { t, i18n } = useTranslations();
    const subjectName = useSubjectName();

    return (
        <section
            className="auth-card flex min-w-0 flex-col gap-4 !p-5"
            aria-labelledby="teacher-recent-title"
            data-testid="teacher-recent"
        >
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h2
                    id="teacher-recent-title"
                    className="flex items-center gap-2 text-xl font-bold"
                >
                    <BookOpenCheck className="size-5" aria-hidden="true" />
                    {t('teacher.recent.title')}
                </h2>
                <NavButton
                    href="/teacher/questions/list"
                    icon={ListChecks}
                    label={t('teacher.recent.all')}
                    testId="teacher-recent-all"
                />
            </div>
            {recent.length === 0 ? (
                <div className="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-[#151b2e]/30 px-4 py-8 text-center">
                    <p className="font-bold">{t('teacher.list.emptyTitle')}</p>
                    <p className="text-sm text-muted-foreground">
                        {t('teacher.list.emptyHint')}
                    </p>
                </div>
            ) : (
                <ul className="flex flex-col gap-2">
                    {recent.map((question) => (
                        <li key={question.id}>
                            <Link
                                href={`/teacher/questions/${question.id}`}
                                className="flex min-h-11 min-w-0 items-center gap-3 rounded-xl border-2 border-[#151b2e] bg-white px-3 py-2 transition-colors hover:bg-[#fff0cf]"
                            >
                                <span className="shrink-0 rounded-full border-2 border-[#151b2e] bg-[#fff0cf] px-2 py-0.5 text-xs font-bold">
                                    {subjectName(question.subject)}
                                </span>
                                <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                                    {i18n.language === 'en' &&
                                    question.prompt_en
                                        ? question.prompt_en
                                        : question.prompt_id}
                                </span>
                                {!question.is_active && (
                                    <span className="shrink-0 rounded-full border-2 border-[#151b2e] bg-[#ffe1e6] px-2 py-0.5 text-xs font-bold">
                                        {t('teacher.list.inactive')}
                                    </span>
                                )}
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}
