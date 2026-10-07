import { type PlayerAbility } from '@/components/ability-card';
import { type TFunction } from 'i18next';

/**
 * WhatsApp text of an ability analysis: one emoji-headed section per field,
 * one item per line, and exactly one link (the short analysis page). Shared
 * by the player card and the admin user page.
 */
export function buildAbilityShareText(
    ability: Pick<
        PlayerAbility,
        | 'summary'
        | 'strengths'
        | 'weaknesses'
        | 'subject_scores'
        | 'recommendations'
        | 'learning_style'
        | 'progress_vs_previous'
    >,
    {
        t,
        subjectName,
        ownerName,
        date,
        shareUrl,
    }: {
        t: TFunction;
        subjectName: (key: string) => string;
        ownerName: string;
        date: string | null;
        shareUrl: string;
    },
): string {
    const section = (emoji: string, label: string) => `${emoji} *${label}*`;
    const clean = (item: string) => item.trim().replace(/[.;,]+$/, '');
    const scoreDot = (score: number) =>
        score >= 80 ? '🟢' : score >= 60 ? '🟡' : '🔴';
    const keycap = (index: number) =>
        index < 9 ? `${index + 1}\uFE0F\u20E3` : `${index + 1}.`;
    const scores = Object.entries(ability.subject_scores).sort(
        (a, b) => b[1] - a[1],
    );

    const lines = [section('📊', t('playerDash.ability.shareTitle'))];
    if (ownerName !== '') {
        lines.push(`👤 ${ownerName}`);
    }
    if (date) {
        lines.push(`📅 ${t('playerDash.ability.date', { date })}`);
    }
    lines.push(
        '',
        section('📝', t('playerDash.ability.shareSummary')),
        ability.summary.trim(),
    );
    if (scores.length > 0) {
        lines.push(
            '',
            section('🎯', t('playerDash.ability.shareScores')),
            ...scores.map(
                ([subject, score]) =>
                    `${scoreDot(score)} ${subjectName(subject)}: *${score}*`,
            ),
        );
    }
    if (ability.strengths.length > 0) {
        lines.push(
            '',
            section('💪', t('playerDash.ability.shareStrengths')),
            ...ability.strengths.map((item) => `✅ ${clean(item)}`),
        );
    }
    if (ability.weaknesses.length > 0) {
        lines.push(
            '',
            section('🌱', t('playerDash.ability.shareGrowth')),
            ...ability.weaknesses.map((item) => `📌 ${clean(item)}`),
        );
    }
    if (ability.recommendations.length > 0) {
        lines.push(
            '',
            section('💡', t('playerDash.ability.tips')),
            ...ability.recommendations.map(
                (item, index) => `${keycap(index)} ${clean(item)}`,
            ),
        );
    }
    if (ability.learning_style.trim() !== '') {
        lines.push(
            '',
            section('🧠', t('playerDash.ability.style')),
            ability.learning_style.trim(),
        );
    }
    if (ability.progress_vs_previous.trim() !== '') {
        lines.push(
            '',
            section('📈', t('playerDash.ability.progress')),
            ability.progress_vs_previous.trim(),
        );
    }
    lines.push(
        '',
        `🔗 ${t('playerDash.ability.shareFooter', { url: shareUrl })}`,
    );

    return lines.join('\n');
}
