import { AiPoints, STUDENT_SECTIONS } from '@/components/classroom/ai-points';
import {
    actionButtonClass,
    EmptyBox,
    MasteryBadge,
    StatusPill,
    useClassroomFormat,
} from '@/components/classroom/classroom-ui';
import type {
    ClassroomReport,
    ClassroomStatus,
    Mastery,
    ReportStudent,
} from '@/components/classroom/types';
import { TeacherTabs } from '@/components/teacher/teacher-tabs';
import {
    SuccessNotice,
    teacherFieldClass,
} from '@/components/teacher/teacher-ui';
import { useTranslations } from '@/hooks/use-translations';
import PlayerLayout from '@/layouts/player-layout';
import { useSubjectName } from '@/lib/subjects';
import { cn } from '@/lib/utils';
import { Link, router } from '@inertiajs/react';
import {
    ArrowLeft,
    CheckCheck,
    ChevronDown,
    Crown,
    Download,
    Gamepad2,
    Medal,
    Percent,
    Search,
    Send,
    Sparkles,
    Trophy,
    Users,
    X,
} from 'lucide-react';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';

interface TopStudent {
    member_id: number;
    name: string;
    points: number;
    accuracy: number | null;
    mastery: Mastery;
}

interface ParticipantsProps {
    classroom: {
        id: number;
        name: string;
        pin: string;
        status: ClassroomStatus;
    };
    summary: ClassroomReport['summary'];
    students: ReportStudent[];
    top: TopStudent[];
}

type MasteryFilter = 'all' | Mastery;
type PlayedFilter = 'all' | 'played' | 'not_played';
type SortKey = 'points' | 'accuracy' | 'name' | 'plays' | 'wrong';

const MASTERY_OPTIONS: Mastery[] = [
    'excellent',
    'good',
    'fair',
    'needs_help',
    'no_data',
];
const SORT_OPTIONS: SortKey[] = [
    'points',
    'accuracy',
    'name',
    'plays',
    'wrong',
];

/** Podium tile colours for places 1–3. */
const PODIUM = [
    { tile: 'bg-[#ffd93d]', icon: Crown, height: 'sm:pt-0' },
    { tile: 'bg-[#e6ecf5]', icon: Medal, height: 'sm:pt-6' },
    { tile: 'bg-[#ffd8b5]', icon: Medal, height: 'sm:pt-10' },
] as const;

/** Debounced copy of a value (keeps typing smooth on long lists). */
function useDebounced<T>(value: T, delay: number): T {
    const [debounced, setDebounced] = useState(value);
    useEffect(() => {
        const timer = window.setTimeout(() => setDebounced(value), delay);
        return () => window.clearTimeout(timer);
    }, [value, delay]);
    return debounced;
}

/** Neutralises spreadsheet formulas and quotes a CSV cell. */
function csvCell(value: string | number | null): string {
    let text = value === null ? '' : String(value);
    if (/^[=+\-@\t\r]/.test(text)) {
        text = `'${text}`;
    }
    return `"${text.replace(/"/g, '""')}"`;
}

export default function ClassroomParticipants({
    classroom,
    summary,
    students,
    top,
}: ParticipantsProps) {
    const { t } = useTranslations();
    const format = useClassroomFormat();
    const subjectName = useSubjectName();

    const [query, setQuery] = useState('');
    const [mastery, setMastery] = useState<MasteryFilter>('all');
    const [played, setPlayed] = useState<PlayedFilter>('all');
    const [sort, setSort] = useState<SortKey>('points');
    const [expanded, setExpanded] = useState<number | null>(null);
    const [sharing, setSharing] = useState<number | null>(null);

    const search = useDeferredValue(useDebounced(query, 150));

    const filtered = useMemo(() => {
        const needle = search.trim().toLocaleLowerCase();
        const rows = students.filter((student) => {
            if (needle && !student.name.toLocaleLowerCase().includes(needle)) {
                return false;
            }
            if (mastery !== 'all' && student.mastery !== mastery) {
                return false;
            }
            if (played === 'played' && student.plays === 0) {
                return false;
            }
            if (played === 'not_played' && student.plays > 0) {
                return false;
            }
            return true;
        });
        const byName = (a: ReportStudent, b: ReportStudent) =>
            a.name.localeCompare(b.name);
        return [...rows].sort((a, b) => {
            switch (sort) {
                case 'name':
                    return byName(a, b);
                case 'accuracy':
                    return (
                        (b.accuracy ?? -1) - (a.accuracy ?? -1) ||
                        b.points - a.points ||
                        byName(a, b)
                    );
                case 'plays':
                    return b.plays - a.plays || b.points - a.points;
                case 'wrong':
                    return b.wrong - a.wrong || byName(a, b);
                default:
                    return (
                        b.points - a.points ||
                        (b.accuracy ?? -1) - (a.accuracy ?? -1) ||
                        byName(a, b)
                    );
            }
        });
    }, [students, search, mastery, played, sort]);

    const filtersActive =
        query.trim() !== '' || mastery !== 'all' || played !== 'all';

    const resetFilters = () => {
        setQuery('');
        setMastery('all');
        setPlayed('all');
    };

    const share = (memberId: number) => {
        router.post(
            `/teacher/classrooms/${classroom.id}/share`,
            { member_id: memberId },
            {
                preserveScroll: true,
                onStart: () => setSharing(memberId),
                onFinish: () => setSharing(null),
            },
        );
    };

    const exportCsv = () => {
        const header = [
            'name',
            'grade',
            'plays',
            'correct',
            'wrong',
            'accuracy',
            'points',
            'mastery',
        ].map((key) => csvCell(t(`classroom.participants.csv.${key}`)));
        const lines = filtered.map((student) =>
            [
                student.name,
                student.grade,
                student.plays,
                student.correct,
                student.wrong,
                student.accuracy,
                student.points,
                t(`classroom.mastery.${student.mastery}`),
            ]
                .map(csvCell)
                .join(','),
        );
        const blob = new Blob(
            ['\uFEFF' + [header.join(','), ...lines].join('\r\n')],
            { type: 'text/csv;charset=utf-8' },
        );
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${t('classroom.participants.csvFile')}-${classroom.pin}.csv`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    };

    return (
        <PlayerLayout
            title={`${t('classroom.participants.title')} · ${classroom.name}`}
        >
            <TeacherTabs active="classrooms" />

            <div className="flex flex-wrap items-end justify-between gap-4">
                <div className="flex min-w-0 flex-col items-start gap-3">
                    <Link
                        href={`/teacher/classrooms/${classroom.id}`}
                        className={actionButtonClass}
                        data-testid="participants-back"
                    >
                        <ArrowLeft className="size-4" aria-hidden="true" />
                        {t('classroom.participants.back')}
                    </Link>
                    <h1 className="text-3xl font-bold tracking-tight break-words md:text-5xl">
                        {t('classroom.participants.title')}
                    </h1>
                    <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-muted-foreground">
                        <span className="break-words">{classroom.name}</span>
                        <StatusPill status={classroom.status} />
                    </div>
                </div>
            </div>

            <SuccessNotice />

            <section
                className="auth-card flex flex-col gap-4 !p-5"
                data-testid="participants-top"
            >
                <h2 className="flex items-center gap-2 text-lg font-bold">
                    <Trophy className="size-5" aria-hidden="true" />
                    {t('classroom.participants.topTitle')}
                </h2>
                {top.length === 0 ? (
                    <EmptyBox
                        icon={Trophy}
                        title={t('classroom.participants.topEmpty')}
                        hint={t('classroom.participants.topEmptyHint')}
                    />
                ) : (
                    <ol className="grid gap-3 sm:grid-cols-3 sm:items-start">
                        {top.map((student, index) => {
                            const place = PODIUM[index];
                            const Icon = place.icon;
                            return (
                                <li
                                    key={student.member_id}
                                    className={cn(
                                        'flex',
                                        place.height,
                                        index === 0 && 'sm:order-2',
                                        index === 1 && 'sm:order-1',
                                        index === 2 && 'sm:order-3',
                                    )}
                                    data-testid={`participants-top-${index + 1}`}
                                >
                                    <div className="flex w-full min-w-0 items-center gap-3 rounded-2xl border-2 border-[#151b2e] bg-white p-3 shadow-[3px_3px_0_#151b2e] sm:flex-col sm:text-center">
                                        <span
                                            className={cn(
                                                'grid size-12 shrink-0 place-items-center rounded-full border-2 border-[#151b2e] font-black',
                                                place.tile,
                                            )}
                                            aria-label={t(
                                                'classroom.participants.place',
                                                { place: index + 1 },
                                            )}
                                        >
                                            <Icon
                                                className="size-5"
                                                aria-hidden="true"
                                            />
                                        </span>
                                        <div className="flex min-w-0 flex-1 flex-col gap-1 sm:items-center">
                                            <p className="truncate font-bold">
                                                #{index + 1} {student.name}
                                            </p>
                                            <p className="text-2xl leading-none font-black tabular-nums">
                                                {format.number(student.points)}{' '}
                                                <span className="text-xs font-bold text-muted-foreground">
                                                    {t(
                                                        'classroom.participants.points',
                                                    )}
                                                </span>
                                            </p>
                                            <div className="flex flex-wrap items-center gap-2 text-xs">
                                                <span className="font-bold tabular-nums">
                                                    {format.percent(
                                                        student.accuracy,
                                                    )}
                                                </span>
                                                <MasteryBadge
                                                    mastery={student.mastery}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </li>
                            );
                        })}
                    </ol>
                )}
            </section>

            <div
                className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4"
                data-testid="participants-kpis"
            >
                <KpiCard
                    icon={Users}
                    label={t('classroom.participants.kpiMembers')}
                    value={format.number(summary.members)}
                    accent="#dbeafe"
                />
                <KpiCard
                    icon={Gamepad2}
                    label={t('classroom.participants.kpiPlayed')}
                    value={format.number(summary.played_members)}
                    accent="#dff7ea"
                />
                <KpiCard
                    icon={Percent}
                    label={t('classroom.participants.kpiAccuracy')}
                    value={format.percent(summary.accuracy)}
                    accent="#fff0cf"
                />
                <KpiCard
                    icon={Trophy}
                    label={t('classroom.participants.kpiPoints')}
                    value={format.number(summary.points)}
                    accent="#efeaff"
                />
            </div>

            <section
                className="auth-card flex flex-col gap-4 !p-5"
                data-testid="participants-list"
            >
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="flex items-center gap-2 text-lg font-bold">
                        <Users className="size-5" aria-hidden="true" />
                        {t('classroom.participants.listTitle')}
                    </h2>
                    <button
                        type="button"
                        onClick={exportCsv}
                        disabled={filtered.length === 0}
                        className={actionButtonClass}
                        data-testid="participants-export"
                    >
                        <Download className="size-4" aria-hidden="true" />
                        {t('classroom.participants.exportCsv')}
                    </button>
                </div>

                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    <label className="relative sm:col-span-2 lg:col-span-1">
                        <span className="sr-only">
                            {t('classroom.participants.searchLabel')}
                        </span>
                        <Search
                            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                            aria-hidden="true"
                        />
                        <input
                            type="search"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder={t(
                                'classroom.participants.searchPlaceholder',
                            )}
                            className={cn(teacherFieldClass, 'pl-9')}
                            data-testid="participants-search"
                            maxLength={80}
                        />
                    </label>
                    <label className="flex flex-col gap-1">
                        <span className="sr-only">
                            {t('classroom.participants.filterMastery')}
                        </span>
                        <select
                            value={mastery}
                            onChange={(e) =>
                                setMastery(e.target.value as MasteryFilter)
                            }
                            className={teacherFieldClass}
                            data-testid="participants-filter-mastery"
                        >
                            <option value="all">
                                {t('classroom.participants.allMastery')}
                            </option>
                            {MASTERY_OPTIONS.map((key) => (
                                <option key={key} value={key}>
                                    {t(`classroom.mastery.${key}`)}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label className="flex flex-col gap-1">
                        <span className="sr-only">
                            {t('classroom.participants.filterStatus')}
                        </span>
                        <select
                            value={played}
                            onChange={(e) =>
                                setPlayed(e.target.value as PlayedFilter)
                            }
                            className={teacherFieldClass}
                            data-testid="participants-filter-status"
                        >
                            <option value="all">
                                {t('classroom.participants.allStatus')}
                            </option>
                            <option value="played">
                                {t('classroom.participants.played')}
                            </option>
                            <option value="not_played">
                                {t('classroom.participants.notPlayed')}
                            </option>
                        </select>
                    </label>
                    <label className="flex flex-col gap-1">
                        <span className="sr-only">
                            {t('classroom.participants.sortLabel')}
                        </span>
                        <select
                            value={sort}
                            onChange={(e) => setSort(e.target.value as SortKey)}
                            className={teacherFieldClass}
                            data-testid="participants-sort"
                        >
                            {SORT_OPTIONS.map((key) => (
                                <option key={key} value={key}>
                                    {t(`classroom.participants.sort.${key}`)}
                                </option>
                            ))}
                        </select>
                    </label>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <p
                        className="font-semibold text-muted-foreground"
                        aria-live="polite"
                        data-testid="participants-count"
                    >
                        {t('classroom.participants.resultCount', {
                            count: filtered.length,
                            total: students.length,
                        })}
                    </p>
                    {filtersActive && (
                        <button
                            type="button"
                            onClick={resetFilters}
                            className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 font-bold underline-offset-2 hover:underline focus-visible:outline-3 focus-visible:outline-[#6c5ce7]"
                            data-testid="participants-reset"
                        >
                            <X className="size-4" aria-hidden="true" />
                            {t('classroom.participants.resetFilters')}
                        </button>
                    )}
                </div>

                {students.length === 0 ? (
                    <EmptyBox
                        icon={Users}
                        title={t('classroom.participants.empty')}
                        hint={t('classroom.participants.emptyHint')}
                    />
                ) : filtered.length === 0 ? (
                    <EmptyBox
                        icon={Search}
                        title={t('classroom.participants.noResults')}
                    />
                ) : (
                    <>
                        <div className="hidden overflow-x-auto md:block">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b-2 border-[#1f2a44]/15 text-left text-xs font-bold text-muted-foreground">
                                        <th className="p-2">
                                            {t('classroom.show.rank')}
                                        </th>
                                        <th className="p-2">
                                            {t('classroom.show.thMember')}
                                        </th>
                                        <th className="p-2">
                                            {t('classroom.show.thGrade')}
                                        </th>
                                        <th className="p-2 text-right">
                                            {t('classroom.show.thPlays')}
                                        </th>
                                        <th className="p-2 text-right">
                                            {t('classroom.show.reportCorrect')}
                                        </th>
                                        <th className="p-2 text-right">
                                            {t('classroom.show.reportWrong')}
                                        </th>
                                        <th className="p-2 text-right">
                                            {t('classroom.show.thAccuracy')}
                                        </th>
                                        <th className="p-2 text-right">
                                            {t('classroom.show.thPoints')}
                                        </th>
                                        <th className="p-2">
                                            {t(
                                                'classroom.participants.mastery',
                                            )}
                                        </th>
                                        <th className="p-2">
                                            <span className="sr-only">
                                                {t(
                                                    'classroom.participants.actions',
                                                )}
                                            </span>
                                        </th>
                                    </tr>
                                </thead>
                                {filtered.map((student) => (
                                    <tbody
                                        key={student.member_id}
                                        className="border-b border-[#1f2a44]/10"
                                        data-testid={`participants-row-${student.member_id}`}
                                    >
                                        <tr>
                                            <td className="p-2 font-bold tabular-nums">
                                                {student.rank === null
                                                    ? '—'
                                                    : `#${format.number(student.rank)}`}
                                            </td>
                                            <td className="p-2">
                                                <span className="flex min-w-0 items-center gap-2 font-bold">
                                                    <Avatar
                                                        name={student.name}
                                                    />
                                                    <span className="min-w-0 truncate">
                                                        {student.name}
                                                    </span>
                                                </span>
                                            </td>
                                            <td className="p-2 text-muted-foreground tabular-nums">
                                                {student.grade ?? '—'}
                                            </td>
                                            <td className="p-2 text-right tabular-nums">
                                                {format.number(student.plays)}
                                            </td>
                                            <td className="p-2 text-right text-[#116a56] tabular-nums">
                                                {format.number(student.correct)}
                                            </td>
                                            <td className="p-2 text-right text-[#b23a52] tabular-nums">
                                                {format.number(student.wrong)}
                                            </td>
                                            <td className="p-2 text-right font-bold tabular-nums">
                                                {format.percent(
                                                    student.accuracy,
                                                )}
                                            </td>
                                            <td className="p-2 text-right font-bold tabular-nums">
                                                {format.number(student.points)}
                                            </td>
                                            <td className="p-2">
                                                <MasteryBadge
                                                    mastery={student.mastery}
                                                />
                                            </td>
                                            <td className="p-2">
                                                <RowActions
                                                    student={student}
                                                    open={
                                                        expanded ===
                                                        student.member_id
                                                    }
                                                    busy={
                                                        sharing ===
                                                        student.member_id
                                                    }
                                                    onShare={share}
                                                    onToggle={() =>
                                                        setExpanded(
                                                            expanded ===
                                                                student.member_id
                                                                ? null
                                                                : student.member_id,
                                                        )
                                                    }
                                                    panelId={`participants-panel-d-${student.member_id}`}
                                                />
                                            </td>
                                        </tr>
                                        <tr>
                                            <td colSpan={10} className="p-0">
                                                <DetailPanel
                                                    id={`participants-panel-d-${student.member_id}`}
                                                    student={student}
                                                    open={
                                                        expanded ===
                                                        student.member_id
                                                    }
                                                    subjectName={subjectName}
                                                />
                                            </td>
                                        </tr>
                                    </tbody>
                                ))}
                            </table>
                        </div>

                        <ul className="flex flex-col gap-3 md:hidden">
                            {filtered.map((student) => (
                                <li
                                    key={student.member_id}
                                    className="rounded-xl border-2 border-[#1f2a44] bg-white p-3"
                                    data-testid={`participants-card-${student.member_id}`}
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="flex min-w-0 items-center gap-2">
                                            <Avatar name={student.name} />
                                            <div className="min-w-0">
                                                <p className="truncate text-sm font-bold">
                                                    {student.rank !== null &&
                                                        `#${format.number(student.rank)} `}
                                                    {student.name}
                                                </p>
                                                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                                    <MasteryBadge
                                                        mastery={
                                                            student.mastery
                                                        }
                                                    />
                                                    <span>
                                                        {t(
                                                            'classroom.show.thGrade',
                                                        )}{' '}
                                                        {student.grade ?? '—'}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                        <p className="shrink-0 text-right text-lg leading-none font-black tabular-nums">
                                            {format.number(student.points)}
                                            <span className="block text-[11px] font-bold text-muted-foreground">
                                                {t('classroom.show.thPoints')}
                                            </span>
                                        </p>
                                    </div>
                                    <dl className="mt-3 grid grid-cols-4 gap-1.5 text-center">
                                        {(
                                            [
                                                [
                                                    'thPlays',
                                                    format.number(
                                                        student.plays,
                                                    ),
                                                ],
                                                [
                                                    'reportCorrect',
                                                    format.number(
                                                        student.correct,
                                                    ),
                                                ],
                                                [
                                                    'reportWrong',
                                                    format.number(
                                                        student.wrong,
                                                    ),
                                                ],
                                                [
                                                    'thAccuracy',
                                                    format.percent(
                                                        student.accuracy,
                                                    ),
                                                ],
                                            ] as const
                                        ).map(([label, value]) => (
                                            <div
                                                key={label}
                                                className="flex min-w-0 flex-col rounded-lg border border-[#1f2a44]/15 bg-[#faf7f0] px-1 py-1.5"
                                            >
                                                <dd className="text-sm font-bold tabular-nums">
                                                    {value}
                                                </dd>
                                                <dt className="truncate text-[11px] font-semibold text-[#1f2a44]/70">
                                                    {t(
                                                        `classroom.show.${label}`,
                                                    )}
                                                </dt>
                                            </div>
                                        ))}
                                    </dl>
                                    <div className="mt-3">
                                        <RowActions
                                            student={student}
                                            open={
                                                expanded === student.member_id
                                            }
                                            busy={sharing === student.member_id}
                                            onShare={share}
                                            onToggle={() =>
                                                setExpanded(
                                                    expanded ===
                                                        student.member_id
                                                        ? null
                                                        : student.member_id,
                                                )
                                            }
                                            panelId={`participants-panel-m-${student.member_id}`}
                                        />
                                    </div>
                                    <DetailPanel
                                        id={`participants-panel-m-${student.member_id}`}
                                        student={student}
                                        open={expanded === student.member_id}
                                        subjectName={subjectName}
                                    />
                                </li>
                            ))}
                        </ul>
                    </>
                )}
            </section>
        </PlayerLayout>
    );
}

function Avatar({ name }: { name: string }) {
    return (
        <span
            className="grid size-8 shrink-0 place-items-center rounded-full border-2 border-[#1f2a44] bg-[#fff0cf] text-xs font-black"
            aria-hidden="true"
        >
            {name.charAt(0).toUpperCase()}
        </span>
    );
}

/** Shared status / share button and accordion toggle. */
function RowActions({
    student,
    open,
    busy,
    onShare,
    onToggle,
    panelId,
}: {
    student: ReportStudent;
    open: boolean;
    busy: boolean;
    onShare: (memberId: number) => void;
    onToggle: () => void;
    panelId: string;
}) {
    const { t } = useTranslations();
    return (
        <div className="flex flex-wrap items-center justify-end gap-2">
            {student.shared_at ? (
                <span
                    className="flex items-center gap-1 rounded-full border-2 border-[#1f2a44] bg-[#dff7ea] px-2 py-0.5 text-xs font-bold whitespace-nowrap"
                    data-testid={`participants-shared-${student.member_id}`}
                >
                    <CheckCheck className="size-3" aria-hidden="true" />
                    {t('classroom.show.shared')}
                </span>
            ) : (
                <button
                    type="button"
                    onClick={() => onShare(student.member_id)}
                    disabled={busy}
                    className={actionButtonClass}
                    data-testid={`participants-share-${student.member_id}`}
                >
                    <Send className="size-3.5" aria-hidden="true" />
                    <span className="text-xs">{t('classroom.show.share')}</span>
                </button>
            )}
            <button
                type="button"
                onClick={onToggle}
                aria-expanded={open}
                aria-controls={panelId}
                className={actionButtonClass}
                data-testid={`participants-toggle-${student.member_id}`}
            >
                <span className="text-xs">
                    {t('classroom.participants.details')}
                </span>
                <ChevronDown
                    className={cn(
                        'size-4 shrink-0 transition-transform duration-300 ease-out motion-reduce:transition-none',
                        open && 'rotate-180',
                    )}
                    aria-hidden="true"
                />
            </button>
        </div>
    );
}

/** Accordion body: strong/weak subjects and AI feedback. */
function DetailPanel({
    id,
    student,
    open,
    subjectName,
}: {
    id: string;
    student: ReportStudent;
    open: boolean;
    subjectName: (key: string) => string;
}) {
    const { t } = useTranslations();
    return (
        <div
            id={id}
            className={cn(
                'grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none',
                open
                    ? 'grid-rows-[1fr] opacity-100'
                    : 'grid-rows-[0fr] opacity-0',
            )}
            aria-hidden={!open}
            inert={!open}
        >
            <div className="min-h-0 overflow-hidden">
                <div className="mt-3 mb-2 flex flex-col gap-3 border-t-2 border-dashed border-[#1f2a44]/15 pt-3 text-sm">
                    <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                            <p className="font-bold text-[#116a56]">
                                {t('classroom.show.strengths')}
                            </p>
                            <p className="text-muted-foreground">
                                {student.strengths.length > 0
                                    ? student.strengths
                                          .map(subjectName)
                                          .join(', ')
                                    : '—'}
                            </p>
                        </div>
                        <div>
                            <p className="font-bold text-[#b23a52]">
                                {t('classroom.show.weaknesses')}
                            </p>
                            <p className="text-muted-foreground">
                                {student.weaknesses.length > 0
                                    ? student.weaknesses
                                          .map(subjectName)
                                          .join(', ')
                                    : '—'}
                            </p>
                        </div>
                    </div>
                    {student.ai_feedback ? (
                        <div className="flex flex-col gap-2">
                            <p className="flex items-center gap-1.5 font-bold">
                                <Sparkles
                                    className="size-4"
                                    aria-hidden="true"
                                />
                                {t('classroom.show.aiFeedbackTitle')}
                            </p>
                            <AiPoints
                                sections={student.ai_feedback}
                                order={STUDENT_SECTIONS}
                                compact
                            />
                        </div>
                    ) : (
                        <p className="text-xs text-muted-foreground">
                            {student.plays > 0
                                ? t('classroom.show.noAiFeedback')
                                : t('classroom.show.notPlayedYet')}
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}

function KpiCard({
    icon: Icon,
    label,
    value,
    accent,
}: {
    icon: typeof Users;
    label: string;
    value: string;
    accent: string;
}) {
    return (
        <div className="flex min-w-0 items-center gap-2 rounded-2xl border-2 border-[#151b2e] bg-white p-2.5 shadow-[3px_3px_0_#151b2e] sm:gap-3 sm:p-4">
            <span
                className="hidden size-10 shrink-0 place-items-center rounded-xl border-2 border-[#151b2e] min-[400px]:grid sm:size-11"
                style={{ background: accent }}
            >
                <Icon className="size-5" aria-hidden="true" />
            </span>
            <div className="flex min-w-0 flex-col">
                <p className="flex items-center gap-1.5 text-xl leading-tight font-bold tabular-nums sm:text-2xl md:text-3xl">
                    <span
                        className="grid size-6 shrink-0 place-items-center rounded-md border-2 border-[#151b2e] min-[400px]:hidden"
                        style={{ background: accent }}
                    >
                        <Icon className="size-3.5" aria-hidden="true" />
                    </span>
                    <span className="truncate">{value}</span>
                </p>
                <p className="truncate text-xs font-bold text-muted-foreground sm:text-sm">
                    {label}
                </p>
            </div>
        </div>
    );
}
