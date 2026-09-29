import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { dashboard, login, register } from '@/routes';
import { type SharedData } from '@/types';
import { Link, usePage } from '@inertiajs/react';
import {
    Gamepad2,
    GraduationCap,
    Menu,
    Sparkles,
    Trophy,
    Zap,
} from 'lucide-react';
import { useState } from 'react';

interface LandingHeaderProps {
    canRegister?: boolean;
}

export function LandingHeader({ canRegister = true }: LandingHeaderProps) {
    const { auth } = usePage<SharedData>().props;
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    const navLinks = [
        {
            href: '/gamelist',
            label: 'Daftar Game',
            icon: Gamepad2,
            isRoute: true,
        },
        { href: '#game-modes', label: 'Mode Game', icon: Zap },
        { href: '#leaderboard', label: 'Top Komunitas', icon: Trophy },
        { href: '#teachers', label: 'Ruang Guru', icon: GraduationCap },
        { href: '#faq', label: 'FAQ', icon: Sparkles },
    ];

    const scrollTo = (href: string) => {
        const el = document.querySelector(href);
        if (el) {
            const headerOffset = 92;
            const top =
                el.getBoundingClientRect().top + window.scrollY - headerOffset;

            window.scrollTo({ top, behavior: 'smooth' });
        }
        setMobileMenuOpen(false);
    };

    return (
        <header className="sticky top-0 z-50 w-full border-b-4 border-[#1f2a44] bg-[#FFF9E6]/95 backdrop-blur-md">
            <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
                {/* Logo & Brand */}
                <Link href="/" className="group flex items-center gap-3">
                    <div className="relative flex h-12 w-12 items-center justify-center rounded-2xl border-3 border-[#1f2a44] bg-[#FF9E44] shadow-[3px_3px_0px_#1f2a44] transition-all duration-200 group-hover:-translate-y-0.5 group-hover:shadow-[5px_5px_0px_#1f2a44]">
                        <Gamepad2 className="h-6 w-6 stroke-[2.5] text-white" />
                        <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#00C9A7] opacity-75"></span>
                            <span className="relative inline-flex h-4 w-4 rounded-full border-2 border-[#1f2a44] bg-[#00C9A7]"></span>
                        </span>
                    </div>
                    <div className="flex flex-col">
                        <div className="flex items-center gap-1.5">
                            <span className="font-display text-2xl font-black tracking-tight text-[#1f2a44]">
                                EduFun
                                <span className="text-[#FF6584]">Hub</span>
                            </span>
                            <span className="rounded-full border-2 border-[#1f2a44] bg-[#FFF176] px-2 py-0.5 text-[10px] font-black tracking-wider text-[#1f2a44] uppercase shadow-[1.5px_1.5px_0px_#1f2a44]">
                                100% Free
                            </span>
                        </div>
                        <span className="text-xs font-bold text-slate-600">
                            Bermain • Belajar • Berprestasi
                        </span>
                    </div>
                </Link>

                {/* Desktop Nav */}
                <nav className="hidden items-center gap-1 lg:flex">
                    {navLinks.map((link) => {
                        const Icon = link.icon;
                        if (link.isRoute) {
                            return (
                                <Link
                                    key={link.href}
                                    href={link.href}
                                    className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-bold text-[#1f2a44] transition-all hover:bg-white hover:text-[#845EC2] hover:shadow-[2px_2px_0px_#1f2a44]"
                                >
                                    <Icon className="h-4 w-4 stroke-[2.5] text-[#FF9E44]" />
                                    <span>{link.label}</span>
                                </Link>
                            );
                        }
                        return (
                            <a
                                key={link.href}
                                href={link.href}
                                onClick={(e) => {
                                    e.preventDefault();
                                    scrollTo(link.href);
                                }}
                                className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-bold text-[#1f2a44] transition-all hover:bg-white hover:text-[#845EC2] hover:shadow-[2px_2px_0px_#1f2a44]"
                            >
                                <Icon className="h-4 w-4 stroke-[2.5] text-[#FF9E44]" />
                                <span>{link.label}</span>
                            </a>
                        );
                    })}
                </nav>

                {/* CTA Buttons */}
                <div className="hidden items-center gap-3 md:flex">
                    {auth.user ? (
                        <Button
                            asChild
                            className="rounded-2xl border-3 border-[#1f2a44] bg-[#00C9A7] px-6 py-2.5 font-display text-base font-black text-[#1f2a44] shadow-[4px_4px_0px_#1f2a44] transition-all hover:-translate-y-0.5 hover:bg-[#00C9A7]/90 hover:shadow-[6px_6px_0px_#1f2a44] active:translate-y-0 active:shadow-[2px_2px_0px_#1f2a44]"
                        >
                            <Link href={dashboard()}>
                                <Gamepad2 className="mr-2 h-5 w-5" />
                                Masuk ke Portal
                            </Link>
                        </Button>
                    ) : (
                        <>
                            <Button
                                variant="ghost"
                                asChild
                                className="rounded-2xl border-2 border-transparent px-4 py-2 font-bold text-[#1f2a44] hover:border-[#1f2a44] hover:bg-white hover:shadow-[3px_3px_0px_#1f2a44]"
                            >
                                <Link href={login()}>Masuk</Link>
                            </Button>
                            {canRegister && (
                                <Button
                                    asChild
                                    className="rounded-2xl border-3 border-[#1f2a44] bg-[#FF9E44] px-6 py-2.5 font-display text-base font-black text-white shadow-[4px_4px_0px_#1f2a44] transition-all hover:-translate-y-0.5 hover:bg-[#ff8f29] hover:shadow-[6px_6px_0px_#1f2a44] active:translate-y-0 active:shadow-[2px_2px_0px_#1f2a44]"
                                >
                                    <Link href={register()}>
                                        <Sparkles className="mr-2 h-4 w-4" />
                                        Mulai Main Gratis!
                                    </Link>
                                </Button>
                            )}
                        </>
                    )}
                </div>

                {/* Mobile Hamburger */}
                <div className="flex items-center gap-2 lg:hidden">
                    <Button
                        asChild
                        size="sm"
                        className="rounded-xl border-2 border-[#1f2a44] bg-[#FF9E44] px-3 font-display font-black text-white shadow-[2px_2px_0px_#1f2a44] hover:bg-[#ff8f29]"
                    >
                        <Link href={auth.user ? dashboard() : register()}>
                            <Gamepad2 className="mr-1.5 h-4 w-4" />
                            Main
                        </Link>
                    </Button>
                    <Sheet
                        open={mobileMenuOpen}
                        onOpenChange={setMobileMenuOpen}
                    >
                        <SheetTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="rounded-2xl border-2 border-[#1f2a44] bg-white shadow-[2px_2px_0px_#1f2a44]"
                            >
                                <Menu className="h-6 w-6 text-[#1f2a44]" />
                                <span className="sr-only">Buka menu</span>
                            </Button>
                        </SheetTrigger>
                        <SheetContent
                            side="right"
                            className="w-full border-l-4 border-[#1f2a44] bg-[#FFF9E6] p-6 sm:max-w-sm"
                        >
                            <div className="flex flex-col gap-6 pt-4">
                                <div className="flex items-center gap-3">
                                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl border-3 border-[#1f2a44] bg-[#FF9E44] shadow-[3px_3px_0px_#1f2a44]">
                                        <Gamepad2 className="h-6 w-6 text-white" />
                                    </div>
                                    <div className="font-display text-xl font-black text-[#1f2a44]">
                                        EduFun
                                        <span className="text-[#FF6584]">
                                            Hub
                                        </span>
                                    </div>
                                </div>

                                <div className="h-1 w-full rounded-full bg-[#1f2a44]/10" />

                                <nav className="flex flex-col gap-2">
                                    {navLinks.map((link) => {
                                        const Icon = link.icon;
                                        if (link.isRoute) {
                                            return (
                                                <Link
                                                    key={link.href}
                                                    href={link.href}
                                                    onClick={() =>
                                                        setMobileMenuOpen(false)
                                                    }
                                                    className="flex items-center gap-3 rounded-2xl border-2 border-transparent px-4 py-3 text-base font-bold text-[#1f2a44] transition-all hover:border-[#1f2a44] hover:bg-white hover:shadow-[3px_3px_0px_#1f2a44]"
                                                >
                                                    <Icon className="h-5 w-5 text-[#FF9E44]" />
                                                    <span>{link.label}</span>
                                                </Link>
                                            );
                                        }
                                        return (
                                            <a
                                                key={link.href}
                                                href={link.href}
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    scrollTo(link.href);
                                                }}
                                                className="flex items-center gap-3 rounded-2xl border-2 border-transparent px-4 py-3 text-base font-bold text-[#1f2a44] transition-all hover:border-[#1f2a44] hover:bg-white hover:shadow-[3px_3px_0px_#1f2a44]"
                                            >
                                                <Icon className="h-5 w-5 text-[#FF9E44]" />
                                                <span>{link.label}</span>
                                            </a>
                                        );
                                    })}
                                </nav>

                                <div className="mt-4 flex flex-col gap-3">
                                    {auth.user ? (
                                        <Button
                                            asChild
                                            className="w-full rounded-2xl border-3 border-[#1f2a44] bg-[#00C9A7] py-6 font-display text-lg font-black text-[#1f2a44] shadow-[4px_4px_0px_#1f2a44]"
                                        >
                                            <Link href={dashboard()}>
                                                Masuk ke Portal
                                            </Link>
                                        </Button>
                                    ) : (
                                        <>
                                            <Button
                                                variant="outline"
                                                asChild
                                                className="w-full rounded-2xl border-3 border-[#1f2a44] bg-white py-5 font-bold text-[#1f2a44] shadow-[3px_3px_0px_#1f2a44]"
                                            >
                                                <Link href={login()}>
                                                    Masuk
                                                </Link>
                                            </Button>
                                            {canRegister && (
                                                <Button
                                                    asChild
                                                    className="w-full rounded-2xl border-3 border-[#1f2a44] bg-[#FF9E44] py-6 font-display text-lg font-black text-white shadow-[4px_4px_0px_#1f2a44]"
                                                >
                                                    <Link href={register()}>
                                                        Daftar Gratis Sekarang!
                                                    </Link>
                                                </Button>
                                            )}
                                        </>
                                    )}
                                </div>
                            </div>
                        </SheetContent>
                    </Sheet>
                </div>
            </div>
        </header>
    );
}
