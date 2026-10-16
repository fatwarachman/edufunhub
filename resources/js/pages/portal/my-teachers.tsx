import {
    AccuracyBar,
    EmptyBox,
    useClassroomFormat,
} from '@/components/classroom/classroom-ui';
import { ClassCard, Kpi } from '@/components/classroom/my-classroom-cards';
import type { MyTeacherGroup } from '@/components/classroom/types';
import { useTranslations } from '@/hooks/use-translations';
import PlayerLayout from '@/layouts/player-layout';
import { Link } from '@inertiajs/react';
import {
    ArrowLeft,
    GraduationCap,
    Percent,
    School,
    Search,
    Star,
    UserRound,
} from 'lucide-react';
import { useDeferredValue, useMemo, useState } from 'react';

interface Props {
    teachers: MyTeacherGroup[];
}

/** "Guru & kelasku": every teacher the student learned with and those classes. */
export default function MyTeachers({ teachers }: Props) {
    const { t } = useTranslations();
    const format = useClassroomFormat();
    const [search, setSearch] = useState('');
    const query = useDeferredValue(search.trim().toLowerCase());

    const totals = useMemo(() => {
        const answered = teachers.reduce(
            (sum, g) => sum + g.totals.answered,
            0,
        );
        const correct = teachers.reduce((sum, g) => sum + g.totals.correct, 0);
        return {
            teachers: teachers.length,
            classes: teachers.reduce((sum, g) => sum + g.totals.classes, 0),
            points: teachers.reduce((sum, g) => sum + g.totals.points, 0),
            accuracy:
                answered > 0
                    ? Math.round((correct / answered) * 1000) / 10
                    : null,
        };
    }, [teachers]);

    const visible = useMemo(
        () =>
            teachers.filter(
                (group) =>
                    query === '' ||
                    group.teacher.name.toLowerCase().includes(query) ||
                    group.classes.some((item) =>
                        item.classroom.name.toLowerCase().includes(query),
                    ),
            ),
        [teachers, query],
    );

    return (
        <PlayerLayout title={t('classroom.teachers.title')}>
            <div className="flex flex-col gap-1">
                <Link
                    href="/my-classrooms"
                    className="inline-flex w-fit items-center gap-1 text-sm font-bold text-muted-foreground hover:text-foreground"
                >
                    <ArrowLeft className="size-4" aria-hidden="true" />
                    {t('nav.myClassrooms')}
                </Link>
                <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
                    {t('classroom.teachers.title')}
                </h1>
                <p className="text-sm font-semibold text-muted-foreground">
                    {t('classroom.teachers.subtitle')}
                </p>
            </div>

            <section
                className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4"
                data-testid="my-teachers-kpis"
            >
                <Kpi
                    icon={GraduationCap}
                    accent="#ffe1e6"
                    label={t('classroom.teachers.kpiTeachers')}
                    value={format.number(totals.teachers)}
                />
                <Kpi
                    icon={School}
                    accent="#dbeafe"
                    label={t('classroom.mine.kpiClasses')}
                    value={format.number(totals.classes)}
                />
                <Kpi
                    icon={Star}
                    accent="#ffd93d"
                    label={t('classroom.mine.kpiPoints')}
                    value={format.number(totals.points)}
                />
                <Kpi
                    icon={Percent}
                    accent="#dff7ea"
                    label={t('classroom.mine.kpiAccuracy')}
                    value={format.percent(totals.accuracy)}
                />
            </section>

            {teachers.length === 0 ? (
                <EmptyBox
                    icon={GraduationCap}
                    title={t('classroom.teachers.emptyTitle')}
                    hint={t('classroom.mine.emptyHint')}
                />
            ) : (
                <>
                    <label className="relative min-w-0">
                        <span className="sr-only">
                            {t('classroom.teachers.search')}
                        </span>
                        <Search
                            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                            aria-hidden="true"
                        />
                        <input
                            type="search"
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            placeholder={t('classroom.teachers.search')}
                            className="h-11 w-full rounded-xl border-2 border-[#1f2a44] bg-white pr-3 pl-9 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-[#1f2a44]/40"
                            data-testid="my-teachers-search"
                        />
                    </label>

                    {visible.length === 0 ? (
                        <p className="rounded-xl border-2 border-dashed border-[#1f2a44]/30 p-6 text-center text-sm font-semibold text-muted-foreground">
                            {t('classroom.mine.noMatch')}
                        </p>
                    ) : (
                        <div
                            className="flex flex-col gap-5"
                            data-testid="my-teachers-list"
                        >
                            {visible.map((group) => (
                                <section
                                    key={group.teacher.id ?? 'none'}
                                    className="auth-card flex min-w-0 flex-col gap-4 !p-4 sm:!p-5"
                                    data-testid={`my-teacher-${group.teacher.id ?? 'none'}`}
                                >
                                    <div className="flex flex-wrap items-center gap-3">
                                        <span className="grid size-12 shrink-0 place-items-center rounded-2xl border-2 border-[#1f2a44] bg-[#ffe1e6]">
                                            <UserRound
                                                className="size-6"
                                                aria-hidden="true"
                                            />
                                        </span>
                                        <div className="flex min-w-0 flex-1 flex-col">
                                            <h2 className="truncate text-xl font-bold">
                                                {group.teacher.name ||
                                                    t(
                                                        'classroom.teachers.unknown',
                                                    )}
                                            </h2>
                                            <p className="truncate text-sm font-semibold text-muted-foreground">
                                                {[
                                                    group.teacher.school,
                                                    t(
                                                        'classroom.teachers.classes',
                                                        {
                                                            count: group.totals
                                                                .classes,
                                                        },
                                                    ),
                                                    t(
                                                        'classroom.teachers.lastJoined',
                                                        {
                                                            date: format.dateTime(
                                                                group.last_joined_at,
                                                            ),
                                                        },
                                                    ),
                                                ]
                                                    .filter(Boolean)
                                                    .join(' · ')}
                                            </p>
                                        </div>
                                        <div className="flex w-full flex-col gap-1 sm:w-48">
                                            <p className="flex justify-between text-xs font-bold">
                                                <span>
                                                    {t(
                                                        'classroom.mine.kpiPoints',
                                                    )}
                                                </span>
                                                <span className="tabular-nums">
                                                    {format.number(
                                                        group.totals.points,
                                                    )}
                                                </span>
                                            </p>
                                            <AccuracyBar
                                                value={group.totals.accuracy}
                                            />
                                        </div>
                                    </div>
                                    <ul className="grid gap-3 md:grid-cols-2">
                                        {group.classes.map((item) => (
                                            <li key={item.member_id}>
                                                <ClassCard item={item} />
                                            </li>
                                        ))}
                                    </ul>
                                </section>
                            ))}
                        </div>
                    )}
                </>
            )}
        </PlayerLayout>
    );
}
