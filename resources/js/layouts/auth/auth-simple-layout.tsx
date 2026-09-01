import AppearanceToggleDropdown from '@/components/appearance-dropdown';
import { useTranslations } from '@/hooks/use-translations';
import { home } from '@/routes';
import { Link } from '@inertiajs/react';
import {
    ArrowLeft,
    Award,
    Flame,
    Gamepad2,
    Rocket,
    Sparkles,
    Trophy,
    Users,
} from 'lucide-react';
import { type PropsWithChildren } from 'react';

interface AuthLayoutProps {
    title?: string;
    description?: string;
}

export default function AuthSimpleLayout({
    children,
    title,
    description,
}: PropsWithChildren<AuthLayoutProps>) {
    const { t } = useTranslations();

    return (
        <div className="grid min-h-svh lg:grid-cols-2">
            {/* Left — EduFunHub playful hero panel */}
            <div className="relative hidden flex-col justify-between overflow-hidden bg-[#101828] p-10 pb-32 text-white lg:flex">
                {/* Bubble decorations */}
                <div className="pointer-events-none absolute inset-0">
                    <div className="absolute -top-16 -left-16 h-64 w-64 rounded-full bg-bubble-pink/20 blur-2xl" />
                    <div className="absolute top-1/3 -right-20 h-72 w-72 rounded-full bg-bubble-purple/25 blur-2xl" />
                    <div className="absolute bottom-0 left-1/4 h-56 w-56 rounded-full bg-bubble-green/20 blur-2xl" />
                    <div className="absolute top-16 right-10 h-24 w-24 rounded-full bg-bubble-yellow/15" />
                    <div className="absolute bottom-24 left-10 h-16 w-16 rounded-full bg-bubble-orange/20" />
                </div>

                {/* Logo & Back Link */}
                <div className="relative z-10 flex items-center justify-between">
                    <Link
                        href={home()}
                        className="flex items-center gap-2 font-semibold"
                    >
                        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-bubble-yellow text-foreground shadow-lg shadow-bubble-yellow/20">
                            <Gamepad2 className="h-4 w-4" />
                        </div>
                        <span className="font-display text-lg text-white">
                            EduFunHub
                        </span>
                    </Link>
                    <Link
                        href={home()}
                        className="flex items-center gap-2 text-sm text-white/50 transition-colors hover:text-white"
                    >
                        <ArrowLeft className="h-4 w-4" />
                        {t('auth.layout.back_to_home', 'Back to home')}
                    </Link>
                </div>

                {/* Main Content */}
                <div className="relative z-10 space-y-8">
                    <div className="space-y-4">
                        <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-medium text-white/80">
                            <Sparkles className="h-3 w-3 text-bubble-yellow" />
                            {t(
                                'auth.layout.badge',
                                'Belajar sambil seru, menang hadiah!',
                            )}
                        </div>
                        <h2 className="font-display text-4xl leading-tight font-bold text-white">
                            {t(
                                'auth.layout.hero.title_line1',
                                'Belajar Jadi Petualangan',
                            )}
                            <br />
                            <span className="text-bubble-yellow">
                                {t(
                                    'auth.layout.hero.title_line2',
                                    'Harian yang Seru!',
                                )}
                            </span>
                        </h2>
                        <p className="text-lg text-white/60">
                            {t(
                                'auth.layout.hero.description',
                                'Mainkan quiz harian, kumpulkan koin & XP, taklukkan leaderboard, dan raih reward nyata di Pulau Ilmu.',
                            )}
                        </p>
                    </div>

                    {/* Feature stats */}
                    <div className="flex flex-wrap gap-x-8 gap-y-4">
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-bubble-orange/20">
                                <Flame className="h-5 w-5 text-bubble-orange" />
                            </div>
                            <div>
                                <div className="font-display text-xl font-bold tabular-nums text-white">
                                    7-day
                                </div>
                                <div className="text-xs text-white/50">
                                    {t('auth.layout.stats.streak', 'Daily streak')}
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-bubble-pink/20">
                                <Trophy className="h-5 w-5 text-bubble-pink" />
                            </div>
                            <div>
                                <div className="font-display text-xl font-bold tabular-nums text-white">
                                    1v1
                                </div>
                                <div className="text-xs text-white/50">
                                    {t('auth.layout.stats.duel', 'Live duel')}
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-bubble-purple/20">
                                <Rocket className="h-5 w-5 text-bubble-purple" />
                            </div>
                            <div>
                                <div className="font-display text-xl font-bold tabular-nums text-white">
                                    Level
                                </div>
                                <div className="text-xs text-white/50">
                                    {t('auth.layout.stats.level', 'Naik level')}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Gamified card */}
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
                        <div className="mb-3 flex items-center gap-2">
                            <Award className="h-5 w-5 text-bubble-green" />
                            <span className="text-sm font-semibold text-white">
                                {t(
                                    'auth.layout.feature.title',
                                    'Pulau Ilmu — Petualanganmu',
                                )}
                            </span>
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                            {[
                                { label: 'Matematika Cepat', icon: '🧮', color: 'bg-bubble-blue/20' },
                                { label: 'Lab Sains & Alam', icon: '🔬', color: 'bg-bubble-green/20' },
                                { label: 'Sejarah & Dunia', icon: '🗺️', color: 'bg-bubble-orange/20' },
                            ].map((item) => (
                                <div
                                    key={item.label}
                                    className={`flex flex-col items-center gap-1 rounded-xl ${item.color} px-2 py-3`}
                                >
                                    <span className="text-xl">{item.icon}</span>
                                    <span className="text-center text-[11px] leading-tight text-white/80">
                                        {item.label}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="relative z-10 flex items-center justify-between text-xs text-white/30">
                    <span>
                        © {new Date().getFullYear()}{' '}
                        {t('auth.layout.copyright', 'EduFunHub. All rights reserved.')}
                    </span>
                    <span className="flex items-center gap-1.5">
                        <Users className="h-3.5 w-3.5" />
                        10,000+ {t('auth.layout.learners', 'pembelajar aktif')}
                    </span>
                </div>
            </div>

            {/* Right Side — Form */}
            <div className="flex flex-col">
                {/* Mobile Header */}
                <div className="flex items-center justify-between border-b p-4 lg:hidden">
                    <Link
                        href={home()}
                        className="flex items-center gap-2 font-semibold"
                    >
                        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-bubble-yellow text-foreground">
                            <Gamepad2 className="h-4 w-4" />
                        </div>
                        <span className="font-display text-lg text-foreground">
                            EduFunHub
                        </span>
                    </Link>
                    <AppearanceToggleDropdown />
                </div>

                {/* Form Container */}
                <div className="flex flex-1 items-center justify-center p-6 md:p-10">
                    <div className="w-full max-w-sm">
                        {/* Desktop Theme Toggle */}
                        <div className="mb-8 hidden justify-end lg:flex">
                            <AppearanceToggleDropdown />
                        </div>

                        <div className="flex flex-col gap-6">
                            {/* Title & Description */}
                            <div className="space-y-2 text-center lg:text-left">
                                <h1 className="font-display text-3xl font-bold tracking-tight sm:text-3xl">
                                    {title}
                                </h1>
                                <p className="text-sm text-muted-foreground">
                                    {description}
                                </p>
                            </div>

                            {/* Form Content */}
                            {children}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
