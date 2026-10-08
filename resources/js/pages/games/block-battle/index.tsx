import GameAdStrip from '@/components/ads/game-ad-strip';
import { HowToPlay } from '@/components/block-battle/how-to-play';
import {
    ACCENT,
    BlockShell,
    MODE_STYLE,
    Panel,
    useBlockAudio,
} from '@/components/block-battle/shared';
import { BB_MODES } from '@/hooks/use-block-battle';
import { useTranslations } from '@/hooks/use-translations';
import { Link } from '@inertiajs/react';
import { MonitorPlay, Play, Smartphone } from 'lucide-react';
import '../../../../css/block-battle.css';

/**
 * Block Battle entry: the teacher opens the projector arena, students open
 * the phone controller (or scan the QR code shown on the arena).
 */
export default function BlockBattleIndex() {
    const { t } = useTranslations();
    const { muted, toggleMuted } = useBlockAudio();
    const roles = [
        {
            key: 'arena',
            href: '/arena/block-battle',
            icon: MonitorPlay,
            title: t('blockBattle.roles.arenaTitle'),
            body: t('blockBattle.roles.arenaBody'),
            cta: t('blockBattle.roles.openArena'),
            tone: '#fef08a',
        },
        {
            key: 'controller',
            href: '/play/block-battle',
            icon: Smartphone,
            title: t('blockBattle.roles.controllerTitle'),
            body: t('blockBattle.roles.controllerBody'),
            cta: t('blockBattle.roles.openController'),
            tone: '#dbeafe',
        },
    ];
    return (
        <BlockShell
            title={t('blockBattle.title')}
            testId="bb-index"
            role="none"
            phase="NONE"
            muted={muted}
            onToggleMuted={toggleMuted}
            wide
        >
            <GameAdStrip />
            <div
                className="mx-auto flex w-full max-w-3xl flex-col gap-4"
                data-testid="bb-role-picker"
            >
                <h2 className="text-center font-display text-2xl font-black">
                    {t('blockBattle.roles.choose')}
                </h2>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {roles.map(
                        ({ key, href, icon: Icon, title, body, cta, tone }) => (
                            <Link
                                key={key}
                                href={href}
                                data-testid={`bb-role-${key}`}
                                className="flex min-w-0 flex-col items-start gap-3 rounded-3xl border-3 border-[#1f2a44] bg-white p-5 text-left shadow-[5px_5px_0px_#1f2a44] transition-transform hover:-translate-y-0.5 focus-visible:ring-4 focus-visible:ring-[#ca8a04]/40 focus-visible:outline-none"
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
                                                ? '#a16207'
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
                <Panel className="flex flex-col gap-3 !p-4">
                    <h3 className="font-display text-lg font-black">
                        {t('blockBattle.modesTitle')}
                    </h3>
                    <ul className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                        {BB_MODES.map((mode) => {
                            const { icon: Icon, tone } = MODE_STYLE[mode];
                            return (
                                <li
                                    key={mode}
                                    className="flex min-w-0 items-start gap-2 rounded-2xl border-2 border-[#1f2a44] p-2.5"
                                    data-testid={`bb-index-mode-${mode}`}
                                >
                                    <span
                                        className="grid size-9 shrink-0 place-items-center rounded-xl text-white"
                                        style={{ background: tone }}
                                    >
                                        <Icon
                                            className="size-5"
                                            aria-hidden="true"
                                        />
                                    </span>
                                    <span className="flex min-w-0 flex-col">
                                        <span className="font-display font-black">
                                            {t(
                                                `blockBattle.modes.${mode}.title`,
                                            )}
                                        </span>
                                        <span className="text-xs font-bold text-slate-600">
                                            {t(
                                                `blockBattle.modes.${mode}.desc`,
                                            )}
                                        </span>
                                    </span>
                                </li>
                            );
                        })}
                    </ul>
                    <p
                        className="rounded-2xl border-2 border-dashed border-[#1f2a44] px-3 py-2 text-center text-sm font-bold text-slate-700"
                        style={{ borderColor: ACCENT }}
                    >
                        {t('blockBattle.rules')}
                    </p>
                </Panel>
                <HowToPlay />
            </div>
        </BlockShell>
    );
}
