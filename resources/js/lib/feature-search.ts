export interface FeatureSearchEntry {
    href: string;
    title: string;
    group: string;
    keywords: string;
    superadminOnly?: boolean;
    teacherOnly?: boolean;
}

export function searchFeatures(
    entries: FeatureSearchEntry[],
    query: string,
    access: { superadmin: boolean; teacher: boolean },
): FeatureSearchEntry[] {
    const normalize = (value: string) =>
        value.normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase();
    const words = normalize(query).trim().split(/\s+/).filter(Boolean);
    const seen = new Set<string>();

    return entries.filter((entry) => {
        if (entry.superadminOnly && !access.superadmin) return false;
        if (entry.teacherOnly && !access.teacher) return false;
        if (seen.has(entry.href)) return false;
        seen.add(entry.href);
        const haystack = normalize(
            `${entry.title} ${entry.group} ${entry.keywords}`,
        );
        return words.every((word) => haystack.includes(word));
    });
}
