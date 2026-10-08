import { AbilityCard, type PlayerAbility } from '@/components/ability-card';
import {
    type AbilityHistoryPoint,
    type AbilityProgress,
    AbilityProgressSection,
} from '@/components/ability-progress';
import { NavButton } from '@/components/site-nav';
import { useTranslations } from '@/hooks/use-translations';
import PlayerLayout from '@/layouts/player-layout';
import { Head, Link } from '@inertiajs/react';
import { BrainCircuit, ChevronLeft, Gamepad2, Hourglass } from 'lucide-react';

/**
 * Dedicated full-width page of one ability analysis, opened from the short
 * link (/a/{code}) in the WhatsApp share text or the header shortcut
 * (/ability, the player's own latest analysis). Signed-in users only.
 */
export default function AbilityShow({
    ability,
    ownerName,
    progress = null,
    history = [],
}: {
    /** Null on the player's own page until an analysis has finished. */
    ability: PlayerAbility | null;
    ownerName: string;
    /** Comparison with the previous analysis; owner only, null for the first. */
    progress?: AbilityProgress | null;
    /** Owner's finished analyses (dates + average); empty for other viewers. */
    history?: AbilityHistoryPoint[];
}) {
    const { t } = useTranslations();

    return (
        <PlayerLayout title={t('abilityPage.title')}>
            <Head>
                <meta name="robots" content="noindex, nofollow" />
            </Head>
            <section
                className="auth-card flex min-w-0 flex-col gap-3 !bg-[#fff4d6] !p-4 sm:!p-6"
                aria-labelledby="ability-page-title"
                data-testid="ability-page-hero"
            >
                <Link
                    href="/dashboard"
                    prefetch
                    className="inline-flex items-center gap-1 self-start rounded-full text-sm font-bold text-[#151b2e] hover:underline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#6c5ce7]"
                    data-testid="ability-page-back"
                >
                    <ChevronLeft className="size-4" aria-hidden />
                    {t('abilityPage.back')}
                </Link>
                <h1
                    id="ability-page-title"
                    className="flex min-w-0 items-center gap-2 text-2xl font-bold tracking-tight text-balance break-words sm:text-3xl md:text-4xl"
                >
                    <BrainCircuit
                        className="size-7 shrink-0 text-[#151b2e]"
                        aria-hidden
                    />
                    <span className="min-w-0">
                        {t('abilityPage.heading', { name: ownerName })}
                    </span>
                </h1>
                <p className="text-sm text-[#151b2e]/80">
                    {t('abilityPage.intro')}
                </p>
            </section>

            {ability ? (
                <AbilityCard
                    ability={ability}
                    ownerName={ownerName}
                    defaultOpen
                    showPageLink={false}
                    title={t('abilityPage.cardTitle')}
                />
            ) : (
                <section
                    className="auth-card flex min-w-0 flex-col items-center gap-3 !p-6 text-center sm:!p-8"
                    aria-labelledby="ability-page-empty"
                    data-testid="ability-page-empty"
                >
                    <span className="grid size-14 place-items-center rounded-2xl border-2 border-[#151b2e] bg-[#cfe6ff] shadow-[2px_2px_0_#151b2e]">
                        <Hourglass className="size-7" aria-hidden />
                    </span>
                    <h2
                        id="ability-page-empty"
                        className="text-lg font-bold sm:text-xl"
                    >
                        {t('abilityPage.emptyTitle')}
                    </h2>
                    <p className="max-w-prose text-sm text-[#151b2e]/80">
                        {t('abilityPage.emptyBody')}
                    </p>
                    <NavButton
                        href="/gamelist"
                        icon={Gamepad2}
                        label={t('abilityPage.emptyCta')}
                        variant="primary"
                        testId="ability-page-play"
                    />
                </section>
            )}

            {ability && history.length > 0 && (
                <AbilityProgressSection progress={progress} history={history} />
            )}

            {ability && (
                <section
                    className="auth-card flex min-w-0 flex-col gap-3 !p-4 sm:!p-5"
                    aria-labelledby="ability-page-cta"
                    data-testid="ability-page-cta"
                >
                    <h2
                        id="ability-page-cta"
                        className="text-lg font-bold sm:text-xl"
                    >
                        {t('abilityPage.ctaTitle')}
                    </h2>
                    <p className="text-sm text-[#151b2e]/80">
                        {t('abilityPage.ctaBody')}
                    </p>
                    <div className="flex flex-wrap gap-2">
                        <NavButton
                            href="/dashboard"
                            icon={Gamepad2}
                            label={t('abilityPage.ctaPortal')}
                            variant="primary"
                            testId="ability-page-portal"
                        />
                    </div>
                </section>
            )}
        </PlayerLayout>
    );
}
