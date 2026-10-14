import { useTranslations } from '@/hooks/use-translations';
import { cn } from '@/lib/utils';
import {
    AlertTriangle,
    CheckCircle2,
    ClipboardList,
    Lightbulb,
    ListChecks,
    TrendingUp,
    type LucideIcon,
} from 'lucide-react';
import type { AiSections } from './types';

/** Section look: icon, tile colour and translation key. */
const SECTION_STYLE: Record<string, { icon: LucideIcon; tile: string }> = {
    overview: { icon: ClipboardList, tile: 'bg-[#efeaff]' },
    strengths: { icon: CheckCircle2, tile: 'bg-[#dff7ea]' },
    weaknesses: { icon: TrendingUp, tile: 'bg-[#ffe1e6]' },
    improve: { icon: TrendingUp, tile: 'bg-[#ffe1e6]' },
    misconceptions: { icon: AlertTriangle, tile: 'bg-[#fff0cf]' },
    actions: { icon: ListChecks, tile: 'bg-[#dbeafe]' },
    tips: { icon: Lightbulb, tile: 'bg-[#fff0cf]' },
};

/**
 * AI analysis as titled bullet lists (class summary or student feedback).
 * Empty sections are skipped; text is rendered as plain text only.
 */
export function AiPoints({
    sections,
    order,
    compact = false,
    testId,
}: {
    sections: AiSections;
    order: readonly string[];
    compact?: boolean;
    testId?: string;
}) {
    const { t } = useTranslations();
    const visible = order.filter((key) => (sections[key]?.length ?? 0) > 0);

    return (
        <div
            className={cn(
                'grid gap-3',
                !compact && visible.length > 1 && 'md:grid-cols-2',
            )}
            data-testid={testId}
        >
            {visible.map((key) => {
                const style = SECTION_STYLE[key] ?? SECTION_STYLE.overview;
                const Icon = style.icon;
                return (
                    <section
                        key={key}
                        className={cn(
                            'flex min-w-0 flex-col gap-2',
                            !compact &&
                                'rounded-xl border-2 border-[#1f2a44] bg-white p-3',
                            !compact &&
                                key === 'overview' &&
                                visible.length > 1 &&
                                'md:col-span-2',
                        )}
                        data-testid={testId ? `${testId}-${key}` : undefined}
                    >
                        <h4 className="flex items-center gap-2 text-sm font-bold">
                            <span
                                className={cn(
                                    'grid size-7 shrink-0 place-items-center rounded-lg border-2 border-[#1f2a44]',
                                    style.tile,
                                )}
                            >
                                <Icon className="size-4" aria-hidden="true" />
                            </span>
                            {t(`classroom.ai.section.${key}`)}
                        </h4>
                        <ul className="flex flex-col gap-1.5 pl-[11px] text-sm leading-relaxed">
                            {sections[key].map((point, i) => (
                                <li key={i} className="flex gap-2">
                                    <span
                                        className="mt-[0.55em] size-1.5 shrink-0 rounded-full bg-[#1f2a44]"
                                        aria-hidden="true"
                                    />
                                    <span className="min-w-0 text-pretty break-words">
                                        {point}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </section>
                );
            })}
        </div>
    );
}

export const SUMMARY_SECTIONS = [
    'overview',
    'strengths',
    'weaknesses',
    'misconceptions',
    'actions',
] as const;

export const STUDENT_SECTIONS = ['strengths', 'improve', 'tips'] as const;
