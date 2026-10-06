import i18n from '@/lib/i18n';

import indonesianAdmin from '../locales/id-admin.json';

const indonesian: Record<string, string> = indonesianAdmin;

/**
 * Admin panel copy is written in English in the components and translated
 * here by exact source text, so the panel follows the account language
 * (Indonesian by default). Templates use `{0}`, `{1}` … for dynamic values.
 * Non-string values pass through unchanged.
 */
export function tr<T>(text: T, values: unknown[] = []): T {
    if (typeof text !== 'string') {
        return text;
    }

    const template = i18n.language?.startsWith('id')
        ? (indonesian[text] ?? text)
        : text;

    if (values.length === 0) {
        return template as T;
    }

    return template.replace(/\{(\d+)\}/g, (match, index: string) =>
        String(values[Number(index)] ?? ''),
    ) as T;
}

/** Date/number locale for the admin panel, following the account language. */
export function adminLocale(): string {
    return i18n.language?.startsWith('id') ? 'id-ID' : 'en-GB';
}
