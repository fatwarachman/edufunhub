import GameAdStrip from '@/components/ads/game-ad-strip';
import { HowToPlay } from '@/components/turbo-trivia/how-to-play';
import {
    ACCENT,
    Panel,
    TurboShell,
    useTurboAudio,
} from '@/components/turbo-trivia/shared';
import { useTranslations } from '@/hooks/use-translations';
import { Link } from '@inertiajs/react';
import { MonitorPlay, Play, Smartphone } from 'lucide-react';
import '../../../../css/turbo-trivia.css';

/**
 * Turbo Trivia entry: the teacher opens the projector arena, students open
 * the phone controller (or scan the QR code shown on the arena).
 */
export default function TurboTriviaIndex() {
    const { t } = useTranslations();
    const { muted, toggleMuted } = useTurboAudio();
    const roles = [
        {
            key: 'arena',
            href: '/arena/turbo-trivia',
            icon: MonitorPlay,
            title: t('turboTrivia.arenaTitle'),
            body: t('turboTrivia.arenaBody'),
            cta: t('turboTrivia.openArena'),
            tone: '#fecdd3',
        },
        {
            key: 'controller',
            href: '/play/turbo-trivia',
            icon: Smartphone,
            title: t('turboTrivia.controllerTitle'),
            body: t('turboTrivia.controllerBody'),
            cta: t('turboTrivia.openController'),
            tone: '#dbeafe',
        },
    ];
    return (
        <TurboShell
            title={t('turboTrivia.title')}
            testId="turbo-trivia"
            role="none"
            phase="NONE"
            muted={muted}
            onToggleMuted={toggleMuted}
            wide
        >
            <GameAdStrip />
            <div
                className="mx-auto flex w-full max-w-3xl flex-col gap-4"
                data-testid="tt-role-picker"
            >
                <h2 className="text-center font-display text-2xl font-black">
                    {t('turboTrivia.chooseRole')}
                </h2>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {roles.map(
                        ({ key, href, icon: Icon, title, body, cta, tone }) => (
                            <Link
                                key={key}
                                href={href}
                                data-testid={`tt-role-${key}`}
                                className="flex flex-col items-start gap-3 rounded-3xl border-3 border-[#1f2a44] bg-white p-5 text-left shadow-[5px_5px_0px_#1f2a44] transition-transform hover:-translate-y-0.5 focus-visible:ring-4 focus-visible:ring-[#e11d48]/40 focus-visible:outline-none"
                            >
                                <span
                                    className="grid size-12 place-items-center rounded-2xl border-2 border-[#1f2a44]"
                                    style={{ background: tone }}
                                >
                                    <Icon
                                        className="size-6"
                                        aria-hidden="true"
                                    />
                                </span>
                                <span className="font-display text-xl font-black">
                                    {title}
                                </span>
                                <span className="text-sm font-bold text-slate-600">
                                    {body}
                                </span>
                                <span
                                    className="mt-auto inline-flex min-h-11 items-center gap-1.5 rounded-xl border-2 border-[#1f2a44] px-4 font-display text-sm font-black text-white"
                                    style={{
                                        background:
                                            key === 'arena'
                                                ? ACCENT
                                                : '#1f2a44',
                                    }}
                                >
                                    <Play
                                        className="size-4"
                                        aria-hidden="true"
                                    />
                                    {cta}
                                </span>
                            </Link>
                        ),
                    )}
                </div>
                <Panel className="!p-4 text-center text-sm font-bold text-slate-700">
                    {t('turboTrivia.rules')}
                </Panel>
                <HowToPlay />
            </div>
        </TurboShell>
    );
}
