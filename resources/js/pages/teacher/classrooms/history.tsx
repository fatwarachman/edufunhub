import {
    AccuracyBar,
    EmptyBox,
    GameChip,
    StatusPill,
    useClassroomFormat,
} from '@/components/classroom/classroom-ui';
import type { ClassroomStatus } from '@/components/classroom/types';
import { useTranslations } from '@/hooks/use-translations';
import PlayerLayout from '@/layouts/player-layout';
import { cn } from '@/lib/utils';
import { Link } from '@inertiajs/react';
import { CalendarDays, School, Search, Users } from 'lucide-react';
import { useDeferredValue, useMemo, useState } from 'react';

interface Score {
    points: number;
    plays: number;
    accuracy: number | null;
}

interface ClassroomVisit extends Score {
    id: number;
    name: string;
    joined_at: string | null;
    left_at: string | null;
}

interface StudentHistory {
    user_id: number;
    name: string;
    grade: number | null;
    classrooms: ClassroomVisit[];
}

interface ClassroomStudent extends Score {
    user_id: number;
    name: string;
    grade: number | null;
    joined_at: string | null;
    left_at: string | null;
}

interface ClassroomHistoryItem {
    id: number;
    name: string;
    pin: string;
    status: ClassroomStatus;
    starts_at: string | null;
    ends_at: string | null;
    games: string[];
    members: number;
    active_members: number;
    students: ClassroomStudent[];
}

interface Props {
    students: StudentHistory[];
    classrooms?: ClassroomHistoryItem[];
}

type View = 'classes' | 'students';

/** Teacher: every classroom with the users who ever joined it, or per student. */
export default function ClassroomHistory({ students, classrooms = [] }: Props) {
    const { t } = useTranslations();
    const format = useClassroomFormat();
    const [view, setView] = useState<View>('classes');
    const [search, setSearch] = useState('');
    const query = useDeferredValue(search.trim().toLowerCase());

    const visibleClasses = useMemo(
        () =>
            classrooms.filter(
                (item) =>
                    query === '' ||
                    item.name.toLowerCase().includes(query) ||
                    item.students.some((s) =>
                        s.name.toLowerCase().includes(query),
                    ),
            ),
        [classrooms, query],
    );
    const visibleStudents = useMemo(
        () =>
            students.filter(
                (student) =>
                    query === '' ||
                    student.name.toLowerCase().includes(query) ||
                    student.classrooms.some((c) =>
                        c.name.toLowerCase().includes(query),
                    ),
            ),
        [students, query],
    );

    const joinedText = (joined: string | null, left: string | null) =>
        `${t('classroom.history.joined', { date: format.dateTime(joined) })} · ${
            left
                ? t('classroom.history.left', { date: format.dateTime(left) })
                : t('classroom.history.active')
        }`;

    return (
        <PlayerLayout title={t('classroom.history.title')}>
            <div className="flex flex-col gap-1">
                <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
                    {t('classroom.history.title')}
                </h1>
                <p className="text-sm font-semibold text-muted-foreground">
                    {t('classroom.history.subtitle')}
                </p>
            </div>
            {students.length === 0 && classrooms.length === 0 ? (
                <EmptyBox
                    icon={Users}
                    title={t('classroom.history.emptyTitle')}
                    hint={t('classroom.history.emptyHint')}
                />
            ) : (
                <>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <label className="relative min-w-0 flex-1">
                            <span className="sr-only">
                                {t('classroom.history.search')}
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
                                placeholder={t('classroom.history.search')}
                                className="h-11 w-full rounded-xl border-2 border-[#1f2a44] bg-white pr-3 pl-9 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-[#1f2a44]/40"
                                data-testid="teacher-history-search"
                            />
                        </label>
                        <div
                            className="flex gap-1.5"
                            role="group"
                            aria-label={t('classroom.history.view')}
                        >
                            {(['classes', 'students'] as View[]).map((key) => (
                                <button
                                    key={key}
                                    type="button"
                                    onClick={() => setView(key)}
                                    aria-pressed={view === key}
                                    className={cn(
                                        'inline-flex h-11 items-center gap-1.5 rounded-xl border-2 border-[#1f2a44] px-3 text-sm font-bold',
                                        view === key
                                            ? 'bg-[#1f2a44] text-white'
                                            : 'bg-white hover:bg-[#FFFDE6]',
                                    )}
                                    data-testid={`teacher-history-view-${key}`}
                                >
                                    {key === 'classes' ? (
                                        <School
                                            className="size-4"
                                            aria-hidden="true"
                                        />
                                    ) : (
                                        <Users
                                            className="size-4"
                                            aria-hidden="true"
                                        />
                                    )}
                                    {t(`classroom.history.by.${key}`)}
                                </button>
                            ))}
                        </div>
                    </div>

                    {view === 'classes' ? (
                        visibleClasses.length === 0 ? (
                            <NoMatch />
                        ) : (
                            <section
                                className="flex flex-col gap-4"
                                data-testid="teacher-history-classes"
                            >
                                {visibleClasses.map((item) => (
                                    <article
                                        key={item.id}
                                        className="auth-card flex min-w-0 flex-col gap-3 !p-4 sm:!p-5"
                                        data-testid={`teacher-history-class-${item.id}`}
                                    >
                                        <div className="flex flex-wrap items-start gap-3">
                                            <span className="grid size-11 shrink-0 place-items-center rounded-xl border-2 border-[#151b2e] bg-[#dbeafe]">
                                                <School
                                                    className="size-5"
                                                    aria-hidden="true"
                                                />
                                            </span>
                                            <div className="flex min-w-0 flex-1 flex-col gap-1">
                                                <Link
                                                    href={`/teacher/classrooms/${item.id}`}
                                                    className="truncate text-lg font-bold hover:underline"
                                                >
                                                    {item.name}
                                                </Link>
                                                <p className="flex flex-wrap items-center gap-1 text-xs font-semibold text-muted-foreground">
                                                    <CalendarDays
                                                        className="size-3.5"
                                                        aria-hidden="true"
                                                    />
                                                    {format.dateTime(
                                                        item.starts_at,
                                                    )}{' '}
                                                    –{' '}
                                                    {format.dateTime(
                                                        item.ends_at,
                                                    )}{' '}
                                                    · PIN {item.pin}
                                                </p>
                                            </div>
                                            <div className="flex flex-wrap items-center gap-1.5">
                                                <StatusPill
                                                    status={item.status}
                                                />
                                                <span className="rounded-full border-2 border-[#1f2a44] bg-white px-2.5 py-0.5 text-xs font-bold">
                                                    {t(
                                                        'classroom.history.members',
                                                        {
                                                            count: item.members,
                                                            active: item.active_members,
                                                        },
                                                    )}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="flex flex-wrap gap-1.5">
                                            {item.games.map((key) => (
                                                <GameChip
                                                    key={key}
                                                    gameKey={key}
                                                />
                                            ))}
                                        </div>
                                        {item.students.length === 0 ? (
                                            <p className="rounded-xl border-2 border-dashed border-[#151b2e]/30 p-3 text-sm font-semibold text-muted-foreground">
                                                {t(
                                                    'classroom.history.noStudents',
                                                )}
                                            </p>
                                        ) : (
                                            <ul className="grid gap-2 md:grid-cols-2">
                                                {item.students.map(
                                                    (student) => (
                                                        <li
                                                            key={`${item.id}-${student.user_id}-${student.joined_at}`}
                                                            className="flex min-w-0 flex-col gap-1.5 rounded-xl border-2 border-[#151b2e]/15 bg-white p-3"
                                                        >
                                                            <div className="flex items-center justify-between gap-2">
                                                                <p className="truncate font-bold">
                                                                    {
                                                                        student.name
                                                                    }
                                                                </p>
                                                                <span className="shrink-0 text-sm font-bold tabular-nums">
                                                                    {format.number(
                                                                        student.points,
                                                                    )}{' '}
                                                                    {t(
                                                                        'classroom.report.points',
                                                                    )}
                                                                </span>
                                                            </div>
                                                            <AccuracyBar
                                                                value={
                                                                    student.accuracy
                                                                }
                                                            />
                                                            <p className="text-xs font-semibold text-muted-foreground">
                                                                {t(
                                                                    'classroom.history.score',
                                                                    {
                                                                        plays: student.plays,
                                                                        accuracy:
                                                                            format.percent(
                                                                                student.accuracy,
                                                                            ),
                                                                    },
                                                                )}{' '}
                                                                ·{' '}
                                                                {joinedText(
                                                                    student.joined_at,
                                                                    student.left_at,
                                                                )}
                                                            </p>
                                                        </li>
                                                    ),
                                                )}
                                            </ul>
                                        )}
                                    </article>
                                ))}
                            </section>
                        )
                    ) : visibleStudents.length === 0 ? (
                        <NoMatch />
                    ) : (
                        <section
                            className="grid gap-4 md:grid-cols-2"
                            data-testid="teacher-classroom-history"
                        >
                            {visibleStudents.map((student) => (
                                <article
                                    key={student.user_id}
                                    className="auth-card flex flex-col gap-3 !p-5"
                                >
                                    <div className="flex items-center gap-3">
                                        <span className="grid size-11 place-items-center rounded-xl border-2 border-[#151b2e] bg-[#dbeafe]">
                                            <Users
                                                className="size-5"
                                                aria-hidden="true"
                                            />
                                        </span>
                                        <div className="min-w-0">
                                            <h2 className="truncate text-lg font-bold">
                                                {student.name}
                                            </h2>
                                            <p className="text-xs font-semibold text-muted-foreground">
                                                {t(
                                                    'classroom.history.classCount',
                                                    {
                                                        count: student
                                                            .classrooms.length,
                                                    },
                                                )}
                                            </p>
                                        </div>
                                    </div>
                                    <ul className="flex flex-col gap-2">
                                        {student.classrooms.map((classroom) => (
                                            <li
                                                key={`${student.user_id}-${classroom.id}-${classroom.joined_at}`}
                                                className="rounded-xl border-2 border-[#151b2e]/15 bg-white p-3"
                                            >
                                                <Link
                                                    href={`/teacher/classrooms/${classroom.id}`}
                                                    className="flex items-center gap-2 font-bold hover:underline"
                                                >
                                                    <School
                                                        className="size-4"
                                                        aria-hidden="true"
                                                    />
                                                    {classroom.name}
                                                </Link>
                                                <p className="mt-1 text-xs font-semibold text-muted-foreground">
                                                    {t(
                                                        'classroom.history.score',
                                                        {
                                                            plays: classroom.plays,
                                                            accuracy:
                                                                format.percent(
                                                                    classroom.accuracy,
                                                                ),
                                                        },
                                                    )}{' '}
                                                    ·{' '}
                                                    {format.number(
                                                        classroom.points,
                                                    )}{' '}
                                                    {t(
                                                        'classroom.report.points',
                                                    )}
                                                </p>
                                                <p className="mt-0.5 flex flex-wrap items-center gap-1 text-xs font-semibold text-muted-foreground">
                                                    <CalendarDays
                                                        className="size-3.5"
                                                        aria-hidden="true"
                                                    />
                                                    {joinedText(
                                                        classroom.joined_at,
                                                        classroom.left_at,
                                                    )}
                                                </p>
                                            </li>
                                        ))}
                                    </ul>
                                </article>
                            ))}
                        </section>
                    )}
                </>
            )}
        </PlayerLayout>
    );
}

function NoMatch() {
    const { t } = useTranslations();

    return (
        <p className="rounded-xl border-2 border-dashed border-[#1f2a44]/30 p-6 text-center text-sm font-semibold text-muted-foreground">
            {t('classroom.mine.noMatch')}
        </p>
    );
}
