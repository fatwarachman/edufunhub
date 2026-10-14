import {
    EmptyBox,
    GameChip,
    MasteryBadge,
    StatusPill,
    useClassroomFormat,
} from '@/components/classroom/classroom-ui';
import type {
    ClassroomStatus,
    MyClassroomItem,
} from '@/components/classroom/types';
import { useTranslations } from '@/hooks/use-translations';
import PlayerLayout from '@/layouts/player-layout';
import { cn } from '@/lib/utils';
import { Link } from '@inertiajs/react';
import {
    CalendarClock,
    ChevronRight,
    Gamepad2,
    Percent,
    School,
    Search,
    Star,
    Trophy,
    Users,
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

function ClassCard({ item }: { item: MyClassroomItem }) {
    const { t } = useTranslations();
    const format = useClassroomFormat();
    const { classroom, totals } = item;

    return (
        <Link
            href={`/my-classrooms/${item.member_id}`}
            className="flex h-full flex-col gap-3 rounded-2xl border-2 border-[#1f2a44] bg-white p-4 shadow-[3px_3px_0_#1f2a44] transition-transform hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-[#1f2a44] focus-visible:outline-none"
            data-testid={`my-classroom-${item.member_id}`}
        >
            <div className="flex items-start gap-3">
                <span className="grid size-11 shrink-0 place-items-center rounded-xl border-2 border-[#1f2a44] bg-[#dbeafe]">
                    <School className="size-5" aria-hidden="true" />
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <p className="text-base leading-tight font-bold break-words">
                        {classroom.name}
                    </p>
                    <p className="flex items-center gap-1 truncate text-xs font-semibold text-muted-foreground">
                        <Users className="size-3.5 shrink-0" aria-hidden />
                        <span className="truncate">
                            {classroom.teacher_name}
                        </span>
                    </p>
                </div>
                <ChevronRight
                    className="mt-1 size-5 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                />
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
                <StatusPill status={classroom.status} />
                <MasteryBadge mastery={item.mastery} />
                {item.left && (
                    <span className="rounded-full border-2 border-[#1f2a44] bg-[#ffe1e6] px-2.5 py-0.5 text-xs font-bold">
                        {t('classroom.mine.left')}
                    </span>
                )}
                {item.report_shared && (
                    <span className="rounded-full border-2 border-[#1f2a44] bg-[#dff7ea] px-2.5 py-0.5 text-xs font-bold">
                        {t('classroom.mine.reportShared')}
                    </span>
                )}
            </div>

            <dl className="grid grid-cols-4 gap-1.5 text-center">
                <Stat
                    label={t('classroom.report.points')}
                    value={format.number(totals.points)}
                />
                <Stat
                    label={t('classroom.report.plays')}
                    value={format.number(totals.plays)}
                />
                <Stat
                    label={t('classroom.report.accuracy')}
                    value={format.percent(totals.accuracy)}
                />
                <Stat
                    label={t('classroom.report.rank')}
                    value={
                        totals.rank
                            ? `#${format.number(totals.rank)}/${format.number(totals.members)}`
                            : '–'
                    }
                    icon={totals.rank === 1}
                />
            </dl>

            <div className="flex flex-wrap items-center gap-1.5">
                {classroom.games.slice(0, 4).map((key) => (
                    <GameChip key={key} gameKey={key} />
                ))}
                {classroom.games.length > 4 && (
                    <span className="text-xs font-bold text-muted-foreground">
                        +{classroom.games.length - 4}
                    </span>
                )}
            </div>

            <p className="mt-auto flex items-center gap-1 text-xs font-semibold text-muted-foreground">
                <CalendarClock className="size-3.5 shrink-0" aria-hidden />
                {format.dateTime(classroom.starts_at)} –{' '}
                {format.dateTime(classroom.ends_at)}
            </p>
        </Link>
    );
}

function Stat({
    label,
    value,
    icon,
}: {
    label: string;
    value: string;
    icon?: boolean;
}) {
    return (
        <div className="flex min-w-0 flex-col rounded-xl border-2 border-[#1f2a44]/15 bg-[#FFFDF7] px-1 py-1.5">
            <dd className="flex items-center justify-center gap-0.5 truncate text-sm font-bold tabular-nums">
                {icon && (
                    <Trophy
                        className="size-3 shrink-0 text-[#f5a623]"
                        aria-hidden="true"
                    />
                )}
                {value}
            </dd>
            <dt className="truncate text-[10px] font-semibold text-[#1f2a44]/70 min-[360px]:text-xs">
                {label}
            </dt>
        </div>
    );
}

function Kpi({
    icon: Icon,
    label,
    value,
    accent,
}: {
    icon: typeof School;
    label: string;
    value: string;
    accent: string;
}) {
    return (
        <div className="flex min-w-0 items-center gap-2 rounded-2xl border-2 border-[#1f2a44] bg-white p-2.5 shadow-[3px_3px_0_#1f2a44] sm:gap-3 sm:p-4">
            <span
                className="grid size-9 shrink-0 place-items-center rounded-xl border-2 border-[#1f2a44] sm:size-11"
                style={{ background: accent }}
            >
                <Icon className="size-4 sm:size-5" aria-hidden="true" />
            </span>
            <div className="flex min-w-0 flex-col">
                <p className="truncate text-xl leading-tight font-bold tabular-nums sm:text-2xl">
                    {value}
                </p>
                <p className="truncate text-xs font-bold text-muted-foreground">
                    {label}
                </p>
            </div>
        </div>
    );
}
