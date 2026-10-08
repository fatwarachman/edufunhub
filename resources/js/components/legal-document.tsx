import { BrandLink } from '@/components/brand-link';
import { DigitalClock } from '@/components/digital-clock';
import { BackButton, NavButton, SiteNav } from '@/components/site-nav';
import { useTranslations } from '@/hooks/use-translations';
import { type SharedData } from '@/types';
import { Head, usePage } from '@inertiajs/react';
import { FileText, Mail, ShieldCheck } from 'lucide-react';
import { useEffect } from 'react';

type LegalDocumentKey = 'privacy' | 'terms';

interface LegalSection {
    heading: string;
    paragraphs?: string[];
    items?: string[];
    contact?: boolean;
}

const documents: Record<
    LegalDocumentKey,
    { href: string; icon: typeof ShieldCheck; accent: string }
> = {
    privacy: { href: '/privacy', icon: ShieldCheck, accent: 'bg-[#bceaf2]' },
    terms: { href: '/terms', icon: FileText, accent: 'bg-[#FFF176]' },
};

/** Shared layout for the public privacy policy and terms of service pages. */
export function LegalDocument({ document }: { document: LegalDocumentKey }) {
    const { t, i18n } = useTranslations();
    const { locale } = usePage<SharedData>().props;

    useEffect(() => {
        if (locale && i18n.language !== locale) {
            i18n.changeLanguage(locale);
        }
    }, [locale, i18n]);

    const sections = t(`legal.${document}.sections`, {
        returnObjects: true,
    }) as LegalSection[];
    const other: LegalDocumentKey =
        document === 'privacy' ? 'terms' : 'privacy';
    const Icon = documents[document].icon;
    const contactEmail = t('legal.contactEmail');

    return (
        <div className="min-h-screen bg-[#FFF9E6] selection:bg-[#FF6584] selection:text-white">
            <Head title={t(`legal.${document}.title`)}>
                <meta
                    name="description"
                    content={t(`legal.${document}.metaDescription`)}
                />
            </Head>

            <header className="sticky top-0 z-40 border-b-4 border-[#1f2a44] bg-[#FFF9E6]">
                <div className="mx-auto flex min-h-20 items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
                    <div className="flex min-w-0 items-center gap-3">
                        <BackButton
                            href="/"
                            label={t('legal.backHome')}
                            iconOnly
                            external
                        />
                        <BrandLink hideWordmarkOnPhone />
                        <DigitalClock />
                    </div>
                    <SiteNav compact />
                </div>
            </header>

            <main className="w-full px-4 py-12 sm:px-6 lg:px-8">
                <div className="flex flex-col items-start gap-4">
                    <div
                        className={`flex h-14 w-14 items-center justify-center rounded-2xl border-3 border-[#1f2a44] ${documents[document].accent} shadow-[3px_3px_0px_#1f2a44]`}
                    >
                        <Icon className="h-7 w-7 stroke-[2.5] text-[#1f2a44]" />
                    </div>
                    <h1 className="font-display text-3xl font-black text-[#1f2a44] sm:text-5xl">
                        {t(`legal.${document}.title`)}
                    </h1>
                    <p className="text-sm font-bold text-slate-500">
                        {t('legal.updatedLabel')}: {t('legal.updatedDate')}
                    </p>
                    <p className="text-base leading-relaxed font-semibold text-slate-700">
                        {t(`legal.${document}.intro`)}
                    </p>
                </div>

                <article className="mt-10 flex flex-col gap-6 rounded-3xl border-3 border-[#1f2a44] bg-white p-6 shadow-[5px_5px_0px_#1f2a44] sm:p-10">
                    {sections.map((section) => (
                        <section
                            key={section.heading}
                            className="flex flex-col gap-3"
                        >
                            <h2 className="font-display text-xl font-black text-[#1f2a44]">
                                {section.heading}
                            </h2>
                            {section.paragraphs?.map((paragraph) => (
                                <p
                                    key={paragraph}
                                    className="leading-relaxed font-medium text-slate-700"
                                >
                                    {paragraph}
                                </p>
                            ))}
                            {section.items && (
                                <ul className="flex list-disc flex-col gap-2 pl-6 leading-relaxed font-medium text-slate-700 marker:text-[#FF6584]">
                                    {section.items.map((item) => (
                                        <li key={item}>{item}</li>
                                    ))}
                                </ul>
                            )}
                            {section.contact && (
                                <a
                                    href={`mailto:${contactEmail}`}
                                    className="inline-flex w-fit items-center gap-2 rounded-full border-2 border-[#1f2a44] bg-[#FFFDE6] px-4 py-1.5 font-black text-[#1f2a44] shadow-[2px_2px_0px_#1f2a44] transition-transform hover:-translate-y-0.5"
                                >
                                    <Mail className="h-4 w-4" />
                                    {contactEmail}
                                </a>
                            )}
                        </section>
                    ))}
                </article>

                <div className="mt-10 flex flex-wrap items-center gap-3">
                    <span className="text-sm font-bold text-slate-600">
                        {t('legal.seeAlso')}:
                    </span>
                    <NavButton
                        href={documents[other].href}
                        icon={documents[other].icon}
                        label={t(`legal.${other}.title`)}
                    />
                </div>
            </main>
        </div>
    );
}
