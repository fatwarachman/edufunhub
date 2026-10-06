import { useTranslations } from '@/hooks/use-translations';

/**
 * "edufunhub.com" wordmark with the tagline stacked underneath. Rendered
 * inside `.auth-brand` links next to the brand mark. `hideOnPhone` hides the
 * whole block below 480px where the header needs the room for navigation.
 */
export function BrandWordmark({ hideOnPhone }: { hideOnPhone?: boolean }) {
    const { t } = useTranslations();

    return (
        <span
            className={['edu-brand-wordmark', hideOnPhone && 'edu-brand-text']
                .filter(Boolean)
                .join(' ')}
            data-testid="brand-wordmark"
        >
            <span className="edu-brand-name">
                edufun<span>hub</span>.com
            </span>
            <span className="edu-brand-tagline">{t('brand.tagline')}</span>
        </span>
    );
}
