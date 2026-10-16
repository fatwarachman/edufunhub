import {
    GameChip,
    MasteryBadge,
    StatusPill,
    useClassroomFormat,
} from '@/components/classroom/classroom-ui';
import type { MyClassroomItem } from '@/components/classroom/types';
import { useTranslations } from '@/hooks/use-translations';
import { Link } from '@inertiajs/react';
import {
    CalendarClock,
    ChevronRight,
    School,
    Trophy,
    Users,
} from 'lucide-react';

/** Shared cards for the student's classroom pages (Kelasku, Guru & kelasku). */
export function ClassCard({ item }: { item: MyClassroomItem }) {
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

export function Kpi({
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
