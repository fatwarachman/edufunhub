import {
    EmptyBox,
    GameChip,
    StatusPill,
    useClassroomFormat,
} from '@/components/classroom/classroom-ui';
import {
    type ClassroomRow,
    type ClassroomStatus,
    type Paginated,
} from '@/components/classroom/types';
import { NavButton } from '@/components/site-nav';
import { TeacherTabs } from '@/components/teacher/teacher-tabs';
import { SuccessNotice } from '@/components/teacher/teacher-ui';
import { useClipboard } from '@/hooks/use-clipboard';
import { useTranslations } from '@/hooks/use-translations';
import PlayerLayout from '@/layouts/player-layout';
import { cn } from '@/lib/utils';
import { Link, router } from '@inertiajs/react';
import {
    CalendarClock,
    Check,
    ChevronLeft,
    ChevronRight,
    Copy,
    Plus,
    School,
    Users,
    Wifi,
} from 'lucide-react';
import { useState } from 'react';

type Filter = 'all' | ClassroomStatus;

const FILTERS: Filter[] = ['all', 'active', 'scheduled', 'ended'];

interface ClassroomIndexProps {
    classrooms: Paginated<ClassroomRow>;
    filters: { status?: ClassroomStatus };
}

export default function ClassroomIndex({
    classrooms,
    filters,
}: ClassroomIndexProps) {
    const { t } = useTranslations();
    const current: Filter = filters.status ?? 'all';

    const choose = (filter: Filter) => {
        router.get(
            '/teacher/classrooms',
            filter === 'all' ? {} : { status: filter },
            { preserveScroll: true, preserveState: true },
        );
    };

    return (
        <PlayerLayout title={t('classroom.teacher.title')}>
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div className="flex min-w-0 flex-col items-start gap-3">
                    <span className="auth-badge">{t('teacher.badge')}</span>
                    <h1 className="text-3xl font-bold tracking-tight break-words md:text-5xl">
                        {t('classroom.teacher.heading')}
                    </h1>
                    <p className="max-w-2xl text-muted-foreground">
                        {t('classroom.teacher.intro')}
                    </p>
                </div>
                <NavButton
                    href="/teacher/classrooms/create"
                    icon={Plus}
                    label={t('classroom.teacher.create')}
                    variant="primary"
                    testId="classroom-create-link"
                />
            </div>

            <TeacherTabs active="classrooms" />

            <Link
                href="/teacher/classrooms/history"
                className="inline-flex min-h-11 items-center gap-2 self-start rounded-xl border-2 border-[#151b2e] bg-white px-4 text-sm font-bold shadow-[2px_2px_0_#151b2e] hover:bg-[#fff9e6]"
                data-testid="classroom-history-link"
            >
                <Users className="size-4" aria-hidden="true" />
                {t('classroom.history.title')}
            </Link>

            <SuccessNotice />

            <section
                className="auth-card flex min-w-0 flex-col gap-5 !p-5"
                aria-labelledby="classroom-list-title"
            >
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2
                        id="classroom-list-title"
                        className="flex items-center gap-2 text-xl font-bold"
                    >
                        <School className="size-5" aria-hidden="true" />
                        {t('classroom.teacher.listTitle')}
                        <span className="rounded-full border-2 border-[#151b2e] bg-[#ffd93d] px-2 text-sm tabular-nums">
                            {classrooms.total}
                        </span>
                    </h2>
                </div>

                <div
                    className="grid grid-cols-2 gap-1 rounded-[1.25rem] border-2 border-[#151b2e] bg-white p-1 sm:grid-cols-4"
                    role="group"
                    aria-label={t('classroom.teacher.filterLabel')}
                >
                    {FILTERS.map((filter) => (
                        <button
                            key={filter}
                            type="button"
                            aria-pressed={current === filter}
                            onClick={() => choose(filter)}
                            data-testid={`classroom-filter-${filter}`}
                            className={cn(
                                'flex min-h-11 min-w-0 items-center justify-center rounded-full px-2 text-sm leading-tight font-bold transition-colors',
                                current === filter
                                    ? 'bg-[#151b2e] text-white'
                                    : 'text-[#151b2e] hover:bg-[#fff0cf]',
                            )}
                        >
                            {t(`classroom.filter.${filter}`)}
                        </button>
                    ))}
                </div>

                {classrooms.data.length === 0 ? (
                    <EmptyBox
                        icon={School}
                        title={
                            current === 'all'
                                ? t('classroom.teacher.emptyTitle')
                                : t('classroom.teacher.emptyFiltered')
                        }
                        hint={
                            current === 'all'
                                ? t('classroom.teacher.emptyHint')
                                : undefined
                        }
                    >
                        {current === 'all' && (
                            <NavButton
                                href="/teacher/classrooms/create"
                                icon={Plus}
                                label={t('classroom.teacher.create')}
                                variant="primary"
                                className="mt-2"
                            />
                        )}
                    </EmptyBox>
                ) : (
                    <ul
                        className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
                        data-testid="classroom-list"
                    >
                        {classrooms.data.map((classroom) => (
                            <ClassroomCard
                                key={classroom.id}
                                classroom={classroom}
                            />
                        ))}
                    </ul>
                )}

                {classrooms.last_page > 1 && (
                    <nav
                        className="flex flex-wrap items-center justify-between gap-3"
                        aria-label={t('classroom.common.page', {
                            current: classrooms.current_page,
                            last: classrooms.last_page,
                        })}
                    >
                        <span className="text-sm text-muted-foreground">
                            {t('classroom.common.page', {
                                current: classrooms.current_page,
                                last: classrooms.last_page,
                            })}
                        </span>
                        <div className="flex gap-2">
                            {classrooms.prev_page_url && (
                                <NavButton
                                    href={classrooms.prev_page_url}
                                    icon={ChevronLeft}
                                    label={t('classroom.common.prev')}
                                />
                            )}
                            {classrooms.next_page_url && (
                                <NavButton
                                    href={classrooms.next_page_url}
                                    icon={ChevronRight}
                                    label={t('classroom.common.next')}
                                />
                            )}
                        </div>
                    </nav>
                )}
            </section>
        </PlayerLayout>
    );
}

function ClassroomCard({ classroom }: { classroom: ClassroomRow }) {
    const { t } = useTranslations();
    const format = useClassroomFormat();
    const [copied, copy] = useClipboard();
    const [justCopied, setJustCopied] = useState(false);

    const copyPin = async () => {
        if (await copy(classroom.pin)) {
            setJustCopied(true);
            window.setTimeout(() => setJustCopied(false), 1600);
        }
    };

    return (
        <li
            className="flex min-w-0 flex-col gap-3 rounded-2xl border-[3px] border-[#1f2a44] bg-white p-4 shadow-[4px_4px_0px_#1f2a44]"
            data-testid="classroom-card"
        >
            <div className="flex items-start justify-between gap-2">
                <Link
                    href={`/teacher/classrooms/${classroom.id}`}
                    className="min-w-0 text-lg leading-snug font-bold break-words hover:underline"
                    data-testid="classroom-open"
                >
                    {classroom.name}
                </Link>
                <StatusPill status={classroom.status} />
            </div>

            <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold text-slate-600">
                    {t('classroom.common.pin')}
                </span>
                <span
                    className="font-display text-xl font-black tracking-[0.2em] tabular-nums"
                    data-testid="classroom-card-pin"
                >
                    {classroom.pin}
                </span>
                {classroom.status !== 'ended' && (
                    <button
                        type="button"
                        onClick={copyPin}
                        className="inline-flex size-11 items-center justify-center rounded-xl border-2 border-[#1f2a44] bg-white hover:bg-[#FFF176]"
                        aria-label={t('classroom.share.copyPin')}
                        title={t('classroom.share.copyPin')}
                        data-testid="classroom-card-copy-pin"
                    >
                        {justCopied && copied === classroom.pin ? (
                            <Check className="size-4" aria-hidden="true" />
                        ) : (
                            <Copy className="size-4" aria-hidden="true" />
                        )}
                    </button>
                )}
                <span aria-live="polite" className="sr-only">
                    {justCopied ? t('classroom.share.copied') : ''}
                </span>
            </div>

            <p className="flex items-start gap-2 text-sm text-slate-700">
                <CalendarClock
                    className="mt-0.5 size-4 shrink-0"
                    aria-hidden="true"
                />
                <span className="min-w-0">
                    {format.dateTime(classroom.starts_at)} –{' '}
                    {format.dateTime(classroom.ends_at)}
                </span>
            </p>

            <div className="flex flex-wrap gap-1.5">
                {classroom.games.map((game) => (
                    <GameChip key={game} gameKey={game} iconOnly />
                ))}
            </div>

            <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t-2 border-[#1f2a44]/10 pt-3 text-sm font-bold">
                <span className="flex items-center gap-3">
                    <span className="flex items-center gap-1">
                        <Users className="size-4" aria-hidden="true" />
                        {t('classroom.common.membersCount', {
                            count: classroom.members_count,
                        })}
                    </span>
                    {classroom.status === 'active' && (
                        <span className="flex items-center gap-1 text-[#15803d]">
                            <Wifi className="size-4" aria-hidden="true" />
                            {t('classroom.common.onlineCount', {
                                count: classroom.online_count,
                            })}
                        </span>
                    )}
                </span>
                <Link
                    href={`/teacher/classrooms/${classroom.id}`}
                    className="edu-nav-btn"
                >
                    <span className="edu-nav-label">
                        {t('classroom.teacher.open')}
                    </span>
                    <ChevronRight aria-hidden="true" />
                </Link>
            </div>
        </li>
    );
}
