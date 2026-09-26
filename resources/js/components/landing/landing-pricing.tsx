import { Button } from '@/components/ui/button';
import { register } from '@/routes';
import { type SharedData } from '@/types';
import { Link, usePage } from '@inertiajs/react';
import {
    ArrowRight,
    Check,
    Coins,
    Crown,
    Gift,
    HeartHandshake,
    ShieldCheck,
    Sparkles,
    Trophy,
    Users,
} from 'lucide-react';

export function LandingPricing() {
    const { auth } = usePage<SharedData>().props;

    const freeBenefits = [
        'Semua mode game terbuka penuh sesuai point dan level peserta',
        'Akses materi dari jenjang TK hingga Universitas',
        'Fitur multiplayer arena & live matchmaking',
        'Akumulasi poin & leaderboard sekolah/kampus',
        'Kustomisasi avatar dengan koin hasil belajar',
        'Ruang kelas dan studio pembuatan soal bagi guru',
    ];

    return (
        <section id="pricing" className="border-t-4 border-[#1f2a44] bg-white py-20 lg:py-28">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                {/* Section Header */}
                <div className="mx-auto max-w-3xl text-center">
                    <div className="inline-flex items-center gap-2 rounded-full border-3 border-[#1f2a44] bg-[#00C9A7] px-4 py-1 text-xs font-black uppercase tracking-wider text-[#1f2a44] shadow-[3px_3px_0px_#1f2a44]">
                        <Gift className="h-4 w-4" />
                        Akses Pendidikan Terbuka
                    </div>
                    <h2 className="mt-4 font-display text-3xl font-black text-[#1f2a44] sm:text-5xl">
                        100% Gratis Untuk{' '}
                        <span className="text-[#00C9A7]">Semua Pengguna!</span>
                    </h2>
                    <p className="mt-4 text-base font-bold text-slate-600 sm:text-lg">
                        Pendidikan berkualitas harus dapat diakses oleh setiap anak bangsa. Tanpa langganan bulanan, tanpa biaya tersembunyi, dan tanpa paywall materi.
                    </p>
                </div>

                {/* Big Free Card */}
                <div className="mx-auto mt-12 max-w-3xl rounded-3xl border-4 border-[#1f2a44] bg-[#FFF9E6] p-8 shadow-[8px_8px_0px_#1f2a44] sm:p-12">
                    <div className="flex flex-col items-center justify-between gap-6 border-b-3 border-[#1f2a44] pb-8 text-center sm:flex-row sm:text-left">
                        <div>
                            <span className="rounded-full border-2 border-[#1f2a44] bg-[#FFF176] px-3 py-1 font-display text-xs font-black text-[#1f2a44]">
                                EDUFUN FOREVER TIER
                            </span>
                            <h3 className="mt-3 font-display text-3xl font-black text-[#1f2a44] sm:text-4xl">
                                Akses Penuh Pelajar & Guru
                            </h3>
                            <p className="text-sm font-bold text-slate-600">
                                Berlaku seumur hidup untuk seluruh sekolah se-Indonesia
                            </p>
                        </div>
                        <div className="rounded-2xl border-3 border-[#1f2a44] bg-white px-6 py-4 text-center shadow-[4px_4px_0px_#1f2a44]">
                            <div className="font-display text-4xl font-black text-[#00C9A7] sm:text-5xl">
                                Rp 0
                            </div>
                            <div className="text-xs font-black uppercase tracking-wider text-[#1f2a44]">
                                Gratis Selamanya
                            </div>
                        </div>
                    </div>

                    <div className="mt-8">
                        <div className="font-display text-base font-black text-[#1f2a44]">
                            Fitur Lengkap Yang Kamu Dapatkan:
                        </div>
                        <div className="mt-4 grid gap-3 sm:grid-cols-2">
                            {freeBenefits.map((benefit, i) => (
                                <div key={i} className="flex items-start gap-2.5">
                                    <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-[#1f2a44] bg-[#00C9A7]">
                                        <Check className="h-3.5 w-3.5 stroke-[3] text-[#1f2a44]" />
                                    </div>
                                    <span className="text-xs font-bold text-slate-700 sm:text-sm">
                                        {benefit}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
                        <Button
                            size="lg"
                            asChild
                            className="h-14 w-full rounded-2xl border-3 border-[#1f2a44] bg-[#FF9E44] px-8 font-display text-lg font-black text-white shadow-[4px_4px_0px_#1f2a44] transition-all hover:-translate-y-1 hover:bg-[#ff8f29] hover:shadow-[6px_6px_0px_#1f2a44] sm:w-auto"
                        >
                            <Link href={auth.user ? '/dashboard' : register()}>
                                <Sparkles className="mr-2 h-5 w-5" />
                                Buat Akun & Mulai Main Gratis
                                <ArrowRight className="ml-2 h-5 w-5" />
                            </Link>
                        </Button>
                    </div>
                </div>
            </div>
        </section>
    );
}
