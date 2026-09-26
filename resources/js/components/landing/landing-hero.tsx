import { Button } from '@/components/ui/button';
import { register } from '@/routes';
import { type SharedData } from '@/types';
import { Link, usePage } from '@inertiajs/react';
import {
    ArrowRight,
    Award,
    Baby,
    BookOpen,
    CheckCircle2,
    Clock,
    Coins,
    Crown,
    Flame,
    Gamepad2,
    GraduationCap,
    Heart,
    School,
    Shield,
    Sparkles,
    Star,
    Swords,
    Trophy,
    Users,
    Zap,
} from 'lucide-react';
import { useState } from 'react';

export function LandingHero() {
    const { auth } = usePage<SharedData>().props;
    const [heroLevelTab, setHeroLevelTab] = useState<'tk' | 'sd1' | 'univ'>('tk');

    const quickStats = [
        {
            icon: Users,
            value: '50.000+',
            label: 'Siswa & Mahasiswa',
            color: 'bg-[#FFF176]',
        },
        {
            icon: School,
            value: '1.200+',
            label: 'Sekolah & Kampus',
            color: 'bg-[#00C9A7]',
        },
        {
            icon: Gamepad2,
            value: '5 Mode',
            label: 'Game Interaktif',
            color: 'bg-[#FF9E44]',
        },
        {
            icon: Shield,
            value: '100% GRATIS',
            label: 'Selamanya Tanpa Biaya',
            color: 'bg-[#FF6584]',
        },
    ];

    const badges = [
        '100% GRATIS SELAMANYA',
        'Jenjang TK s/d Universitas',
        'Multiplayer & Solo Quest',
        'Koin & Item Shop RPG',
        'Leaderboard Bergengsi Sekolah',
    ];

    // Bank Soal Contoh Interaktif Hero (TK, SD Kelas 1, dan Tingkat Lanjut)
    const heroQuestions = {
        tk: {
            title: 'Taman Kanak-Kanak & PAUD • Berhitung Ceria',
            question: '🍎 Ada 3 buah apel manis di keranjang. Ibu menambah lagi 2 buah apel. Sekarang ada berapa apel?',
            badge: 'TK / PAUD',
            badgeBg: 'bg-[#FF9E44]',
            options: [
                { key: 'A', text: '4 Apel', correct: false },
                { key: 'B', text: '5 Apel (3 + 2 = 5)', correct: true },
                { key: 'C', text: '6 Apel', correct: false },
                { key: 'D', text: '2 Apel', correct: false },
            ],
            bonus: '+50 Koin Ceria & Stiker Bintang Emas!',
        },
        sd1: {
            title: 'SD Kelas 1 • Pengenalan Huruf & Kata',
            question: '🦁 Lengkapi huruf yang hilang untuk nama hewan raja hutan ini: "S - I - N - G - [...]"',
            badge: 'SD Kelas 1',
            badgeBg: 'bg-[#00C9A7]',
            options: [
                { key: 'A', text: 'Huruf "A" (SINGA)', correct: true },
                { key: 'B', text: 'Huruf "O" (SINGO)', correct: false },
                { key: 'C', text: 'Huruf "U" (SINGU)', correct: false },
                { key: 'D', text: 'Huruf "E" (SINGE)', correct: false },
            ],
            bonus: '+75 Poin Pengetahuan & Badge Pembaca Cilik!',
        },
        univ: {
            title: 'Fisika Terapan • Level Lanjut / SMA',
            question: '"Jika sebuah satelit mengorbit Bumi pada ketinggian tetap, gaya apa yang bertindak sebagai gaya sentripetalnya?"',
            badge: 'SMA / Universitas',
            badgeBg: 'bg-[#845EC2]',
            options: [
                { key: 'A', text: 'Gaya Gravitasi Bumi', correct: true },
                { key: 'B', text: 'Gaya Magnetik Polar', correct: false },
                { key: 'C', text: 'Gaya Dorong Roket', correct: false },
                { key: 'D', text: 'Gaya Gesek Atmosfer', correct: false },
            ],
            bonus: '+150 XP jika kamu menang ronde ini!',
        },
    };

    const activeQuestionData = heroQuestions[heroLevelTab];

    return (
        <section className="relative overflow-hidden bg-[#FFF9E6] pt-12 pb-20 lg:pt-16 lg:pb-28">
            {/* Animated Background Doodles & Dots */}
            <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
                <div className="absolute top-10 left-10 h-72 w-72 rounded-full bg-[#FFF176]/40 blur-3xl" />
                <div className="absolute top-40 right-10 h-96 w-96 rounded-full bg-[#FF6584]/20 blur-3xl" />
                <div className="absolute -bottom-10 left-1/3 h-80 w-80 rounded-full bg-[#00C9A7]/25 blur-3xl" />

                {/* Floating Geometric Ornaments */}
                <div className="animate-float absolute top-24 left-8 hidden lg:block">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl border-3 border-[#1f2a44] bg-[#FFF176] shadow-[3px_3px_0px_#1f2a44]">
                        <Coins className="h-7 w-7 text-[#FF9E44]" />
                    </div>
                </div>
                <div
                    className="animate-float absolute top-36 right-12 hidden lg:block"
                    style={{ animationDelay: '1.2s' }}
                >
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl border-3 border-[#1f2a44] bg-[#845EC2] shadow-[3px_3px_0px_#1f2a44]">
                        <Crown className="h-8 w-8 text-[#FFF176]" />
                    </div>
                </div>
                <div
                    className="animate-wiggle absolute bottom-20 left-16 hidden lg:block"
                    style={{ animationDelay: '0.8s' }}
                >
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl border-3 border-[#1f2a44] bg-[#FF6584] shadow-[3px_3px_0px_#1f2a44]">
                        <Flame className="h-6 w-6 text-white" />
                    </div>
                </div>
            </div>

            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                {/* Hero Header Pill: 100% Gratis Dikedepankan */}
                <div className="mx-auto max-w-4xl text-center">
                    <div className="inline-flex flex-wrap items-center justify-center gap-2 rounded-full border-3 border-[#1f2a44] bg-[#FFF176] px-4 py-1.5 shadow-[3px_3px_0px_#1f2a44]">
                        <span className="rounded-full border-2 border-[#1f2a44] bg-[#FF6584] px-2.5 py-0.5 font-display text-xs font-black text-white shadow-[1px_1px_0px_#1f2a44]">
                            100% GRATIS SELAMANYA
                        </span>
                        <Sparkles className="h-4 w-4 text-[#FF9E44]" />
                        <span className="font-display text-xs font-black tracking-wide text-[#1f2a44] sm:text-sm">
                            PORTAL GAME EDUKASI #1 DI INDONESIA • TANPA BIAYA
                        </span>
                    </div>

                    {/* Headline */}
                    <h1 className="mt-6 font-display text-4xl font-black tracking-tight text-[#1f2a44] sm:text-6xl lg:text-7xl">
                        Belajar Jadi{' '}
                        <span className="relative inline-block text-[#FF9E44]">
                            Game Seru
                            <svg
                                className="absolute -bottom-2 left-0 w-full text-[#FF6584]"
                                height="12"
                                viewBox="0 0 100 12"
                                preserveAspectRatio="none"
                            >
                                <path
                                    d="M0,8 Q50,0 100,8"
                                    stroke="currentColor"
                                    strokeWidth="6"
                                    fill="none"
                                    strokeLinecap="round"
                                />
                            </svg>
                        </span>
                        , <br className="hidden sm:inline" />
                        Paham Materi{' '}
                        <span className="text-[#845EC2]">Tanpa Bosan!</span>
                    </h1>

                    {/* Subheadline */}
                    <p className="mx-auto mt-6 max-w-2xl text-lg font-bold leading-relaxed text-slate-700 sm:text-xl">
                        Mulai dari adik-adik <span className="text-[#FF6584]">TK & SD Kelas 1</span> hingga tingkat <span className="text-[#845EC2]">Universitas</span>, taklukkan kuis kilat, board game, dan quest edukasi. <strong className="text-[#1f2a44] underline decoration-[#00C9A7] decoration-4">100% Bebas Biaya</strong>, main solo atau mabar, kumpulkan poin dan harumkan nama sekolahmu!
                    </p>

                    {/* Badges Pill */}
                    <div className="mt-6 flex flex-wrap justify-center gap-2 sm:gap-3">
                        {badges.map((b) => (
                            <span
                                key={b}
                                className="flex items-center gap-1.5 rounded-xl border-2 border-[#1f2a44] bg-white px-3 py-1 text-xs font-black text-[#1f2a44] shadow-[2px_2px_0px_#1f2a44]"
                            >
                                <Sparkles className="h-3.5 w-3.5 text-[#FF9E44]" />
                                <span>{b}</span>
                            </span>
                        ))}
                    </div>

                    {/* CTAs */}
                    <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
                        <Button
                            size="lg"
                            asChild
                            className="h-14 w-full rounded-2xl border-3 border-[#1f2a44] bg-[#FF9E44] px-8 font-display text-lg font-black text-white shadow-[5px_5px_0px_#1f2a44] transition-all hover:-translate-y-1 hover:bg-[#ff8f29] hover:shadow-[7px_7px_0px_#1f2a44] active:translate-y-0 active:shadow-[2px_2px_0px_#1f2a44] sm:w-auto"
                        >
                            <Link href={auth.user ? '/dashboard' : register()}>
                                <Gamepad2 className="mr-2 h-6 w-6 stroke-[2.5]" />
                                Mainkan Sekarang — 100% Gratis!
                                <ArrowRight className="ml-2 h-5 w-5" />
                            </Link>
                        </Button>
                        <Button
                            size="lg"
                            variant="outline"
                            asChild
                            className="h-14 w-full rounded-2xl border-3 border-[#1f2a44] bg-white px-8 font-display text-base font-black text-[#1f2a44] shadow-[4px_4px_0px_#1f2a44] transition-all hover:-translate-y-0.5 hover:bg-slate-50 hover:shadow-[6px_6px_0px_#1f2a44] sm:w-auto"
                        >
                            <a href="#leaderboard">
                                <Trophy className="mr-2 h-5 w-5 text-[#FF9E44]" />
                                Cek Leaderboard Sekolah
                            </a>
                        </Button>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center justify-center gap-3 text-xs font-bold text-slate-600">
                        <span className="flex items-center gap-1 rounded-md border border-[#1f2a44] bg-[#E8FAF6] px-2 py-0.5 text-[#00C9A7]">
                            <Shield className="h-3.5 w-3.5" />
                            100% Gratis Tanpa Syarat
                        </span>
                        <span>•</span>
                        <span>Tanpa biaya langganan</span>
                        <span>•</span>
                        <span>Tanpa kartu kredit</span>
                        <span>•</span>
                        <span>Aman & Ramah Anak</span>
                    </div>
                </div>

                {/* Interactive Gaming Window Preview (Roblox/RPG Style Mockup) */}
                <div className="relative mx-auto mt-12 max-w-5xl">
                    <div className="overflow-hidden rounded-3xl border-4 border-[#1f2a44] bg-white shadow-[8px_8px_0px_#1f2a44]">
                        {/* Game Topbar Chrome */}
                        <div className="flex flex-wrap items-center justify-between border-b-4 border-[#1f2a44] bg-[#1f2a44] px-4 py-3 text-white">
                            <div className="flex items-center gap-2">
                                <span className="h-3.5 w-3.5 rounded-full border border-black bg-[#FF6584]" />
                                <span className="h-3.5 w-3.5 rounded-full border border-black bg-[#FFF176]" />
                                <span className="h-3.5 w-3.5 rounded-full border border-black bg-[#00C9A7]" />
                                <span className="ml-3 font-display text-xs font-black tracking-wider text-[#FFF176] uppercase">
                                    EduFunHub Arena • Pilihan Contoh Soal Jenjang
                                </span>
                            </div>
                            <div className="flex items-center gap-3 text-xs font-bold">
                                <div className="flex items-center gap-1.5 rounded-xl border border-white/20 bg-white/10 px-2.5 py-1">
                                    <Coins className="h-4 w-4 text-[#FFF176]" />
                                    <span>2.450 Poin Gratis</span>
                                </div>
                                <div className="flex items-center gap-1.5 rounded-xl border border-white/20 bg-white/10 px-2.5 py-1">
                                    <Flame className="h-4 w-4 text-[#FF9E44]" />
                                    <span>Streak 14 Hari 🔥</span>
                                </div>
                            </div>
                        </div>

                        {/* Level Switcher Tab: TK, SD Kelas 1, Universitas */}
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b-3 border-[#1f2a44] bg-[#FFFDE6] px-4 py-3">
                            <span className="text-xs font-black uppercase text-[#1f2a44]">
                                🎯 Klik Jenjang untuk Mencoba Soal:
                            </span>
                            <div className="flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    onClick={() => setHeroLevelTab('tk')}
                                    className={`flex items-center gap-1.5 rounded-xl border-2 border-[#1f2a44] px-3.5 py-1.5 text-xs font-black transition-all cursor-pointer ${
                                        heroLevelTab === 'tk'
                                            ? 'bg-[#FF9E44] text-white shadow-[2px_2px_0px_#1f2a44]'
                                            : 'bg-white text-[#1f2a44] hover:bg-slate-50'
                                    }`}
                                >
                                    <Baby className="h-3.5 w-3.5" />
                                    Contoh Soal TK / PAUD
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setHeroLevelTab('sd1')}
                                    className={`flex items-center gap-1.5 rounded-xl border-2 border-[#1f2a44] px-3.5 py-1.5 text-xs font-black transition-all cursor-pointer ${
                                        heroLevelTab === 'sd1'
                                            ? 'bg-[#00C9A7] text-[#1f2a44] shadow-[2px_2px_0px_#1f2a44]'
                                            : 'bg-white text-[#1f2a44] hover:bg-slate-50'
                                    }`}
                                >
                                    <BookOpen className="h-3.5 w-3.5" />
                                    Contoh Soal SD Kelas 1
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setHeroLevelTab('univ')}
                                    className={`flex items-center gap-1.5 rounded-xl border-2 border-[#1f2a44] px-3.5 py-1.5 text-xs font-black transition-all cursor-pointer ${
                                        heroLevelTab === 'univ'
                                            ? 'bg-[#845EC2] text-white shadow-[2px_2px_0px_#1f2a44]'
                                            : 'bg-white text-[#1f2a44] hover:bg-slate-50'
                                    }`}
                                >
                                    <GraduationCap className="h-3.5 w-3.5" />
                                    Tingkat Lanjut
                                </button>
                            </div>
                        </div>

                        {/* Game Arena Graphic Simulation */}
                        <div className="relative bg-gradient-to-b from-[#e3f4ff] via-[#FFF9E6] to-[#ffe9c9] p-6 sm:p-10">
                            {/* In-game HUD */}
                            <div className="grid gap-6 md:grid-cols-12">
                                {/* Left Side: Player Avatar & Stats */}
                                <div className="space-y-4 md:col-span-4">
                                    <div className="rounded-2xl border-3 border-[#1f2a44] bg-white p-4 shadow-[4px_4px_0px_#1f2a44]">
                                        <div className="flex items-center gap-3">
                                            <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl border-3 border-[#1f2a44] bg-[#00C9A7] text-white shadow-[3px_3px_0px_#1f2a44]">
                                                {/* Modern Geometric Gamer Avatar */}
                                                <svg
                                                    viewBox="0 0 48 48"
                                                    className="h-10 w-10 drop-shadow-sm"
                                                    fill="none"
                                                    xmlns="http://www.w3.org/2000/svg"
                                                >
                                                    <circle cx="24" cy="24" r="20" fill="#1f2a44" />
                                                    <rect x="14" y="16" width="20" height="15" rx="5" fill="#FFF176" stroke="#1f2a44" strokeWidth="2" />
                                                    <circle cx="20" cy="22" r="2.5" fill="#1f2a44" />
                                                    <circle cx="28" cy="22" r="2.5" fill="#1f2a44" />
                                                    <path d="M21 27 C22.5 28.5 25.5 28.5 27 27" stroke="#1f2a44" strokeWidth="2" strokeLinecap="round" />
                                                    <rect x="11" y="20" width="3" height="7" rx="1.5" fill="#FF6584" />
                                                    <rect x="34" y="20" width="3" height="7" rx="1.5" fill="#FF6584" />
                                                    <path d="M18 16 L20 11 L28 11 L30 16" stroke="#FF6584" strokeWidth="2.5" strokeLinecap="round" />
                                                    <path d="M12 40 C14 34 20 33 24 33 C28 33 34 34 36 40" fill="#00C9A7" stroke="#1f2a44" strokeWidth="2" />
                                                </svg>
                                                <span className="absolute -top-2 -right-2 rounded-full border-2 border-[#1f2a44] bg-[#FFF176] px-1.5 text-[10px] font-black text-[#1f2a44]">
                                                    Lv.18
                                                </span>
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-1 font-display text-base font-black text-[#1f2a44]">
                                                    Budi_Juara
                                                    <Crown className="h-4 w-4 text-[#FF9E44]" />
                                                </div>
                                                <div className="text-xs font-bold text-slate-500">
                                                    Gugus Sains Mandiri
                                                </div>
                                                <div className="mt-1 flex items-center gap-1 text-[11px] font-black text-[#845EC2]">
                                                    <Award className="h-3.5 w-3.5" />
                                                    Peringkat #3 Se-Provinsi
                                                </div>
                                            </div>
                                        </div>

                                        {/* EXP Bar */}
                                        <div className="mt-3">
                                            <div className="flex justify-between text-[11px] font-bold text-slate-600">
                                                <span>EXP Menuju Lv.19</span>
                                                <span>8.420 / 10.000 XP</span>
                                            </div>
                                            <div className="mt-1 h-3 w-full overflow-hidden rounded-full border-2 border-[#1f2a44] bg-slate-100">
                                                <div className="h-full w-[84%] bg-[#00C9A7]" />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Inventory & Items Box */}
                                    <div className="rounded-2xl border-3 border-[#1f2a44] bg-white p-4 shadow-[4px_4px_0px_#1f2a44]">
                                        <div className="font-display text-xs font-black uppercase tracking-wider text-[#1f2a44]">
                                            🎒 Item Karakter Aktif
                                        </div>
                                        <div className="mt-2.5 grid grid-cols-4 gap-2">
                                            {[
                                                { icon: Crown, label: 'Mahkota Emas', color: 'text-[#FF9E44]' },
                                                { icon: Zap, label: 'Speed Boost', color: 'text-[#00C9A7]' },
                                                { icon: Shield, label: 'Shield 2x', color: 'text-[#845EC2]' },
                                                { icon: Sparkles, label: 'Hint Mistis', color: 'text-[#FF6584]' },
                                            ].map((item, i) => {
                                                const ItemIcon = item.icon;
                                                return (
                                                    <div
                                                        key={i}
                                                        className="flex flex-col items-center justify-center rounded-xl border-2 border-[#1f2a44] bg-[#FFF9E6] p-2 text-center shadow-[2px_2px_0px_#1f2a44]"
                                                    >
                                                        <ItemIcon className={`h-6 w-6 stroke-[2.5] ${item.color}`} />
                                                        <span className="mt-1 text-[9px] font-bold text-slate-700">
                                                            {item.label}
                                                        </span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>

                                {/* Center/Right: Live Arena Match View */}
                                <div className="md:col-span-8">
                                    <div className="flex h-full flex-col justify-between rounded-2xl border-3 border-[#1f2a44] bg-white p-5 shadow-[5px_5px_0px_#1f2a44]">
                                        {/* Arena Match Header */}
                                        <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-slate-100 pb-3">
                                            <div className="flex items-center gap-2">
                                                <div className={`rounded-xl border-2 border-[#1f2a44] ${activeQuestionData.badgeBg} px-3 py-1 font-display text-xs font-black text-white shadow-[2px_2px_0px_#1f2a44]`}>
                                                    {activeQuestionData.badge}
                                                </div>
                                                <span className="text-xs font-bold text-slate-500">
                                                    Mode: Kuis Cepat Interaktif
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-1.5 rounded-full border-2 border-[#1f2a44] bg-[#FFF176] px-3 py-0.5 text-xs font-black text-[#1f2a44]">
                                                <Clock className="h-3.5 w-3.5" />
                                                <span>Sisa Waktu: 00:30</span>
                                            </div>
                                        </div>

                                        {/* Question Box */}
                                        <div className="my-4 rounded-2xl border-2 border-[#1f2a44] bg-[#FFF9E6] p-4 text-center">
                                            <div className="text-xs font-black uppercase tracking-wider text-[#845EC2]">
                                                {activeQuestionData.title}
                                            </div>
                                            <div className="mt-2 font-display text-lg font-black text-[#1f2a44] sm:text-xl">
                                                {activeQuestionData.question}
                                            </div>
                                        </div>

                                        {/* Options (Game Buttons) */}
                                        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                                            {activeQuestionData.options.map((opt) => (
                                                <div
                                                    key={opt.key}
                                                    className={`flex items-center gap-3 rounded-xl border-2 border-[#1f2a44] p-3 text-left transition-all ${
                                                        opt.correct
                                                            ? 'bg-[#00C9A7]/20 border-[#00C9A7] shadow-[2px_2px_0px_#00C9A7]'
                                                            : 'bg-white shadow-[2px_2px_0px_#1f2a44]'
                                                    }`}
                                                >
                                                    <span
                                                        className={`flex h-7 w-7 items-center justify-center rounded-lg border-2 border-[#1f2a44] font-display text-xs font-black ${
                                                            opt.correct
                                                                ? 'bg-[#00C9A7] text-[#1f2a44]'
                                                                : 'bg-[#FFF176] text-[#1f2a44]'
                                                        }`}
                                                    >
                                                        {opt.key}
                                                    </span>
                                                    <span className="text-xs font-bold text-[#1f2a44]">
                                                        {opt.text}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>

                                        {/* Bottom Live Opponents Status */}
                                        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600">
                                            <div className="flex items-center gap-2">
                                                <Swords className="h-4 w-4 text-[#FF6584]" />
                                                <span>Mabar Online: 12 Pemain Berpartisipasi</span>
                                            </div>
                                            <span className="font-black text-[#00C9A7]">
                                                {activeQuestionData.bonus}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Bottom Quick Stats */}
                <div className="mx-auto mt-12 grid max-w-5xl grid-cols-2 gap-4 sm:grid-cols-4">
                    {quickStats.map((st, i) => {
                        const Icon = st.icon;
                        return (
                            <div
                                key={i}
                                className="flex items-center gap-3 rounded-2xl border-3 border-[#1f2a44] bg-white p-4 shadow-[4px_4px_0px_#1f2a44]"
                            >
                                <div
                                    className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border-2 border-[#1f2a44] ${st.color} shadow-[2px_2px_0px_#1f2a44]`}
                                >
                                    <Icon className="h-6 w-6 stroke-[2.5] text-[#1f2a44]" />
                                </div>
                                <div>
                                    <div className="font-display text-xl font-black text-[#1f2a44] sm:text-2xl">
                                        {st.value}
                                    </div>
                                    <div className="text-xs font-bold text-slate-600">
                                        {st.label}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </section>
    );
}