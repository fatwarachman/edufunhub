import {
    EmptyBox,
    useClassroomFormat,
} from '@/components/classroom/classroom-ui';
import { ClassCard, Kpi } from '@/components/classroom/my-classroom-cards';
import type {
    ClassroomStatus,
    MyClassroomItem,
} from '@/components/classroom/types';
import { useTranslations } from '@/hooks/use-translations';
import PlayerLayout from '@/layouts/player-layout';
import { cn } from '@/lib/utils';
import { Link } from '@inertiajs/react';
import {
    Gamepad2,
    GraduationCap,
    Percent,
    School,
    Search,
    Star,
} from 'lucide-react';
import { useDeferredValue, useMemo, useState } from 'react';

interface Props {
    classrooms: MyClassroomItem[];
}

type StatusFilter = 'all' | ClassroomStatus;

const STATUS_FILTERS: StatusFilter[] = ['all', 'active', 'scheduled', 'ended'];

/** "Kelasku": every classroom the student joined with their own score. */
export default function MyClassrooms({ classrooms }: Props) {
    const { t } = useTranslations();
    const format = useClassroomFormat();
    const [status, setStatus] = useState<StatusFilter>('all');
    const [search, setSearch] = useState('');
    const query = useDeferredValue(search.trim().toLowerCase());

    const totals = useMemo(() => {
        const points = classrooms.reduce((sum, c) => sum + c.totals.points, 0);
        const plays = classrooms.reduce((sum, c) => sum + c.totals.plays, 0);
        const answered = classrooms.reduce(
            (sum, c) => sum + c.totals.answered,
            0,
        );
        const correct = classrooms.reduce(
            (sum, c) => sum + c.totals.correct,
            0,
        );
        return {
            classes: classrooms.length,
            points,
            plays,
            accuracy:
                answered > 0
                    ? Math.round((correct / answered) * 1000) / 10
                    : null,
        };
    }, [classrooms]);

    const visible = useMemo(
        () =>
            classrooms.filter(
                (item) =>
                    (status === 'all' || item.classroom.status === status) &&
                    (query === '' ||
                        item.classroom.name.toLowerCase().includes(query) ||
                        item.classroom.teacher_name
                            .toLowerCase()
                            .includes(query)),
            ),
        [classrooms, status, query],
    );

    return (
        <PlayerLayout title={t('classroom.mine.title')}>
            <div className="flex flex-col gap-1">
                <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
                    {t('classroom.mine.title')}
                </h1>
                <p className="text-sm font-semibold text-muted-foreground">
                    {t('classroom.mine.subtitle')}
                </p>
                <Link
                    href="/my-classrooms/teachers"
                    className="mt-1 inline-flex w-fit items-center gap-1.5 rounded-xl border-2 border-[#1f2a44] bg-white px-3 py-1.5 text-sm font-bold hover:bg-[#FFFDE6]"
                    data-testid="my-classrooms-teachers-link"
                >
                    <GraduationCap className="size-4" aria-hidden="true" />
                    {t('classroom.teachers.open')}
                </Link>
            </div>

            <section
                className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4"
                data-testid="my-classrooms-kpis"
            >
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
                    icon={Gamepad2}
                    accent="#efeaff"
                    label={t('classroom.mine.kpiPlays')}
                    value={format.number(totals.plays)}
                />
                <Kpi
                    icon={Percent}
                    accent="#dff7ea"
                    label={t('classroom.mine.kpiAccuracy')}
                    value={format.percent(totals.accuracy)}
                />
            </section>

            {classrooms.length === 0 ? (
                <EmptyBox
                    icon={School}
                    title={t('classroom.mine.emptyTitle')}
                    hint={t('classroom.mine.emptyHint')}
                />
            ) : (
                <section
                    className="auth-card flex flex-col gap-4 !p-4 sm:!p-5"
                    data-testid="my-classrooms-list"
                >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <label className="relative min-w-0 flex-1">
                            <span className="sr-only">
                                {t('classroom.mine.search')}
                            </span>
                            <Search
                                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                                aria-hidden="true"
                            />
                            <input
                                type="search"
                                value={search}
                                onChange={(event) =>
                                    setSearch(event.target.value)
                                }
                                placeholder={t('classroom.mine.search')}
                                className="h-11 w-full rounded-xl border-2 border-[#1f2a44] bg-white pr-3 pl-9 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-[#1f2a44]/40"
                                data-testid="my-classrooms-search"
                            />
                        </label>
                        <div
                            className="flex flex-wrap gap-1.5"
                            role="group"
                            aria-label={t('classroom.mine.filterStatus')}
                        >
                            {STATUS_FILTERS.map((key) => (
                                <button
                                    key={key}
                                    type="button"
                                    onClick={() => setStatus(key)}
                                    aria-pressed={status === key}
                                    className={cn(
                                        'h-11 rounded-xl border-2 border-[#1f2a44] px-3 text-sm font-bold',
                                        status === key
                                            ? 'bg-[#1f2a44] text-white'
                                            : 'bg-white hover:bg-[#FFFDE6]',
                                    )}
                                    data-testid={`my-classrooms-filter-${key}`}
                                >
                                    {t(`classroom.filter.${key}`)}
                                </button>
                            ))}
                        </div>
                    </div>

                    <p
                        className="text-xs font-semibold text-muted-foreground"
                        aria-live="polite"
                        data-testid="my-classrooms-count"
                    >
                        {t('classroom.mine.count', {
                            count: visible.length,
                            total: classrooms.length,
                        })}
                    </p>

                    {visible.length === 0 ? (
                        <p className="rounded-xl border-2 border-dashed border-[#1f2a44]/30 p-6 text-center text-sm font-semibold text-muted-foreground">
                            {t('classroom.mine.noMatch')}
                        </p>
                    ) : (
                        <ul className="grid gap-3 md:grid-cols-2">
                            {visible.map((item) => (
                                <li key={item.member_id}>
                                    <ClassCard item={item} />
                                </li>
                            ))}
                        </ul>
                    )}
                </section>
            )}
        </PlayerLayout>
    );
}
