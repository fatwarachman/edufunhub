import { Button } from '@/components/ui/button';
import { register } from '@/routes';
import { type SharedData } from '@/types';
import { Link, usePage } from '@inertiajs/react';
import { ArrowRight, Gamepad2, Sparkles, Trophy, Zap } from 'lucide-react';

export function LandingCta() {
    const { auth } = usePage<SharedData>().props;

    return (
        <section
            data-gsap-section="cta"
            className="border-t-4 border-[#1f2a44] bg-[#FFF9E6] py-16 sm:py-24"
        >
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                <div
                    data-gsap-cta-card
                    className="relative overflow-hidden rounded-3xl border-4 border-[#1f2a44] bg-[#1f2a44] p-8 text-white shadow-[8px_8px_0px_#1f2a44] sm:p-14 lg:p-16"
                >
                    {/* Background Modern Geometry Icons */}
                    <div className="pointer-events-none absolute inset-0 -z-0 opacity-15">
                        <div className="absolute top-10 left-10 flex h-24 w-24 -rotate-12 items-center justify-center rounded-3xl border-3 border-white/20 bg-white/10">
                            <Gamepad2 className="h-14 w-14 stroke-[2]" />
                        </div>
                        <div className="absolute top-12 right-12 flex h-24 w-24 rotate-12 items-center justify-center rounded-3xl border-3 border-white/20 bg-white/10">
                            <Trophy className="h-14 w-14 stroke-[2] text-[#FFF176]" />
                        </div>
                        <div className="absolute bottom-8 left-1/3 flex h-20 w-20 rotate-6 items-center justify-center rounded-2xl border-3 border-white/20 bg-white/10">
                            <Zap className="h-12 w-12 stroke-[2] text-[#00C9A7]" />
                        </div>
                    </div>

                    <div className="relative z-10 mx-auto max-w-3xl text-center">
                        <div className="mb-5 inline-flex items-center gap-2 rounded-full border-2 border-white/30 bg-white/10 px-4 py-1 text-xs font-black tracking-wider text-[#FFF176] uppercase">
                            <Sparkles className="h-4 w-4" />
                            Ayo Bergabung Bersama 50.000+ Pembelajar
                        </div>

                        <h2 className="font-display text-3xl font-black tracking-tight text-white sm:text-5xl md:text-6xl">
                            Siap Menjadi Juara di{' '}
                            <span className="text-[#FF9E44]">EduFunHub?</span>
                        </h2>

                        <p className="mt-5 text-base font-bold text-white/80 sm:text-xl">
                            Pilih avatarmu, ajak teman sekolah dan kampusmu,
                            lalu taklukkan leaderboard nasional sekarang juga.
                            100% Gratis!
                        </p>

                        <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
                            <Button
                                size="lg"
                                asChild
                                className="h-14 w-full rounded-2xl border-3 border-white bg-[#FF9E44] px-8 font-display text-lg font-black text-white shadow-[4px_4px_0px_white] transition-all hover:-translate-y-1 hover:bg-[#ff8f29] sm:w-auto"
                            >
                                <Link
                                    href={auth.user ? '/dashboard' : register()}
                                >
                                    <Gamepad2 className="mr-2 h-6 w-6 stroke-[2.5]" />
                                    Daftar & Mainkan Sekarang
                                    <ArrowRight className="ml-2 h-5 w-5" />
                                </Link>
                            </Button>
                            <Button
                                size="lg"
                                variant="outline"
                                asChild
                                className="h-14 w-full rounded-2xl border-3 border-white/40 bg-transparent px-8 font-display text-base font-black text-white hover:bg-white/10 sm:w-auto"
                            >
                                <a href="#leaderboard">
                                    <Trophy className="mr-2 h-5 w-5 text-[#FFF176]" />
                                    Lihat Ranking Sekolah
                                </a>
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}
