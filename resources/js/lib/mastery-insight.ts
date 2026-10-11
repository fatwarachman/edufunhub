export function masteryInsight(
    answered: number,
    correct: number,
): 'empty' | 'limited' | 'strong' | 'developing' | 'priority' {
    if (answered <= 0) return 'empty';
    if (answered < 10) return 'limited';
    const rate = correct / answered;
    if (rate >= 0.75) return 'strong';
    if (rate >= 0.5) return 'developing';
    return 'priority';
}
