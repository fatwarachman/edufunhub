import {
    EmptyState,
    formatNumber,
    formatPercent,
    Panel,
} from '@/components/admin/game-stats';
import { ResponsiveTable } from '@/components/responsive-table';
import { tr } from '@/lib/admin-i18n';
import { BookMarked } from 'lucide-react';

export interface MasteryBucket {
    label: string | null;
    answered: number;
    correct: number;
    wrong: number;
    players: number;
    success_rate: number | null;
}

export interface SubjectSummary extends Omit<MasteryBucket, 'label'> {
    id: number;
    key: string;
    name_id: string;
    name_en: string | null;
    detail_url: string;
    questions: number;
}

export function MasteryRate({ rate }: { rate: number | null }) {
    return (
        <div className="flex min-w-0 items-center gap-3">
            <div
                className="h-2 w-20 overflow-hidden rounded-full bg-muted"
                aria-hidden="true"
            >
                <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${rate ?? 0}%` }}
                />
            </div>
            <span className="font-semibold tabular-nums">
                {formatPercent(rate)}
            </span>
        </div>
    );
}

export function MasteryBreakdown({
    title,
    rows,
    label = (value) => value,
}: {
    title: string;
    rows: MasteryBucket[];
    label?: (value: string) => string;
}) {
    return (
        <Panel title={title}>
            {rows.length === 0 ? (
                <EmptyState icon={BookMarked} title="No recorded answers yet" />
            ) : (
                <ResponsiveTable
                    rows={rows}
                    rowKey={(row) => row.label ?? 'unknown'}
                    columns={[
                        {
                            key: 'label',
                            header: tr('Group'),
                            primary: true,
                            cell: (row) =>
                                row.label === null
                                    ? tr('Unknown')
                                    : label(row.label),
                        },
                        {
                            key: 'rate',
                            header: tr('Mastery rate'),
                            summary: true,
                            cell: (row) => (
                                <MasteryRate rate={row.success_rate} />
                            ),
                        },
                        {
                            key: 'answered',
                            header: tr('Recorded answers'),
                            align: 'right',
                            cell: (row) => formatNumber(row.answered),
                        },
                        {
                            key: 'correct',
                            header: tr('Correct'),
                            align: 'right',
                            cell: (row) => formatNumber(row.correct),
                        },
                        {
                            key: 'wrong',
                            header: tr('Wrong'),
                            align: 'right',
                            cell: (row) => formatNumber(row.wrong),
                        },
                        {
                            key: 'players',
                            header: tr('Players'),
                            align: 'right',
                            cell: (row) => formatNumber(row.players),
                        },
                    ]}
                />
            )}
        </Panel>
    );
}

export const MASTERY_METHOD =
    'Mastery is the percentage of correct recorded answers, not a competency certification. Repeat attempts count; unrecorded answers are excluded. Grade comparisons use the grade at play time and may involve different question difficulty.';
