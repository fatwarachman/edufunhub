import {
    Binary,
    BookOpen,
    Boxes,
    Calculator,
    Compass,
    Dice6,
    Gamepad2,
    Globe2,
    GraduationCap,
    Languages,
    Library,
    Microscope,
    Palette,
    Puzzle,
    Shuffle,
    Sparkles,
    Swords,
    Timer,
    Users,
} from 'lucide-react';
import { useState } from 'react';

export function LandingFeatures() {
    // 6 Variasi Game & Aktivitas Seru (Fun First!)
    const [gameModeFilter, setGameModeFilter] = useState<
        'all' | 'solo' | 'social' | 'quest'
    >('all');

    const gameModes = [
        {
            category: 'social',
            title: 'Kuis Interaktif Kilat (Fast-Paced Quiz)',
            badge: 'Serba Cepat & Live',
            desc: 'Adu kecepatan dan ketepatan menjawab soal berdurasi detik dengan live leaderboard dinamis! Suasana menegangkan dan seru bersama puluhan pemain secara instan.',
            icon: Timer,
            color: 'bg-[#FF9E44]',
            tag: 'Adrenalin Tinggi',
        },
        {
            category: 'social',
            title: 'Duel 1 vs 1 & Perkenalan Sahabat Baru',
            badge: 'PVP & Social Network',
            desc: 'Berkenalan dengan sesama pelajar se-Indonesia, tambahkan teman, lalu tantang duel otak secara langsung untuk membuktikan siapa penguasa mata pelajaran!',
            icon: Swords,
            color: 'bg-[#FF6584]',
            tag: 'Duel & Pertemanan',
        },
        {
            category: 'social',
            title: 'Misi Tim Lintas Komunitas (Co-Op Squad)',
            badge: 'Kolaborasi Tanpa Batas',
            desc: 'Bentuk tim impian bersama teman dari wilayah mana pun tanpa sekat. Bahu-membahu memecahkan teka-teki gabungan dan tantangan kurikulum bersama!',
            icon: Users,
            color: 'bg-[#00C9A7]',
            tag: 'Mabar Kolaboratif',
        },
        {
            category: 'solo',
            title: 'Board Game Edukatif Seru',
            badge: 'Taktik & Giliran',
            desc: 'Model monopoli dan ludo ilmu pengetahuan. Lempar dadu, beli petak mata pelajaran, dan jawab kuis untuk kuasai teritori serta menangkan match!',
            icon: Dice6,
            color: 'bg-[#FFF176]',
            tag: 'Strategi Santai',
        },
        {
            category: 'quest',
            title: 'Petualangan 3D (RPG Quest)',
            badge: 'Open-World Quest',
            desc: 'Eksplorasi dunia fantasi edukatif 3D! Temukan NPC profesor, selesaikan misteri laboratorium sains, buka dungeon pengetahuan, dan kumpulkan poin besar.',
            icon: Compass,
            color: 'bg-[#845EC2]',
            tag: 'Petualangan Luas',
        },
        {
            category: 'solo',
            title: 'Teka-Teki & Mini-Game Otak',
            badge: 'Asah Logika Kritis',
            desc: 'Teka-teki silang digital, puzzle logika fisika, sandi matematika, dan simulasi senyawa kimia interaktif dengan mekanisme drag-and-drop intuitif.',
            icon: Puzzle,
            color: 'bg-[#FFF3E8]',
            tag: 'Logika & Asah Otak',
        },
    ];

    // Subjects Available
    const subjects = [
        {
            name: 'Matematika & Berhitung',
            icon: Calculator,
            color: 'bg-[#FF9E44]',
            desc: 'Aritmatika dasar, aljabar, geometri, statistika, hingga kalkulus diferensial.',
            topics: ['Aritmatika', 'Aljabar', 'Geometri', 'Kalkulus'],
        },
        {
            name: 'Ilmu Pengetahuan Alam (IPA)',
            icon: Microscope,
            color: 'bg-[#00C9A7]',
            desc: 'Fisika gerak & gaya, biologi ekosistem & anatomi, serta reaksi kimia molekuler.',
            topics: ['Fisika', 'Biologi', 'Kimia', 'Astronomi'],
        },
        {
            name: 'Ilmu Pengetahuan Sosial (IPS)',
            icon: Globe2,
            color: 'bg-[#845EC2]',
            desc: 'Sejarah peradaban nusantara & dunia, geografi kepulauan, dan dinamika sosiologi.',
            topics: ['Sejarah', 'Geografi', 'Sosiologi', 'Ekonomi'],
        },
        {
            name: 'Bahasa & Sastra',
            icon: Languages,
            color: 'bg-[#FF6584]',
            desc: 'Bahasa Indonesia, tata bahasa Inggris (TOEFL prep), dan kosa kata percakapan.',
            topics: ['B. Indonesia', 'B. Inggris', 'Kosakata', 'Literasi'],
        },
        {
            name: 'Informatika & Koding Logika',
            icon: Binary,
            color: 'bg-[#FFF176]',
            desc: 'Algoritma logika, struktur data, pengenalan Python, dan keamanan siber dasar.',
            topics: ['Algoritma', 'Logika Koding', 'Data', 'Siber'],
        },
        {
            name: 'Pendidikan Karakter & Umum',
            icon: Library,
            color: 'bg-[#FFEBF0]',
            desc: 'Wawasan kebangsaan, etika kewarganegaraan, dan pengetahuan umum populer.',
            topics: ['Pancasila', 'Kewarganegaraan', 'Umum', 'Wawasan'],
        },
    ];

    // Education Levels Covered
    const levels = [
        {
            level: 'TK & PAUD',
            desc: 'Mengenal huruf, angka, warna, dan hewan lewat animasi ceria.',
            icon: Palette,
            iconColor: 'text-[#FF9E44]',
            color: 'border-[#FFF176] bg-[#FFFDE6]',
        },
        {
            level: 'SD / Madrasah',
            desc: 'Matematika dasar, IPA, IPS, Bahasa, dan cerita petualangan seru.',
            icon: BookOpen,
            iconColor: 'text-[#00C9A7]',
            color: 'border-[#FF9E44] bg-[#FFF3E8]',
        },
        {
            level: 'SMP / MTs',
            desc: 'Aljabar, biologi sel, fisika gerak, sejarah dunia, dan coding.',
            icon: Boxes,
            iconColor: 'text-[#845EC2]',
            color: 'border-[#00C9A7] bg-[#E8FAF6]',
        },
        {
            level: 'SMA / SMK / MA',
            desc: 'Kalkulus, kimia organik, sosiologi, UTBK-SNBT, dan kejuruan.',
            icon: Microscope,
            iconColor: 'text-[#FF6584]',
            color: 'border-[#845EC2] bg-[#F4EEFB]',
        },
        {
            level: 'Perguruan Tinggi',
            desc: 'Logika matematika tingkat lanjut, riset jurnal, ekonomi makro.',
            icon: GraduationCap,
            iconColor: 'text-[#1f2a44]',
            color: 'border-[#FF6584] bg-[#FFEBF0]',
        },
    ];

    return (
        <div className="space-y-24 bg-white py-20 lg:py-28">
            {/* UTAMA: Mode Game & Keseruan Bermain (FUN FIRST!) */}
            <section
                id="game-modes"
                data-gsap-section="game-modes"
                className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8"
            >
                <div className="mx-auto max-w-3xl text-center">
                    <div className="inline-flex items-center gap-2 rounded-full border-3 border-[#1f2a44] bg-[#FFF176] px-4 py-1 text-xs font-black tracking-wider text-[#1f2a44] uppercase shadow-[3px_3px_0px_#1f2a44]">
                        <Gamepad2 className="h-4 w-4" />
                        Mainkan Game-nya, Lupakan Bosannya!
                    </div>
                    <h2 className="mt-4 font-display text-3xl font-black text-[#1f2a44] sm:text-5xl">
                        Sensasi Game Mabar,{' '}
                        <span className="text-[#FF9E44]">
                            Belajar Jadi Nagih!
                        </span>
                    </h2>
                    <p className="mt-4 text-base font-bold text-slate-600 sm:text-lg">
                        Tinggalkan modul tebal yang bikin mengantuk. Rasakan
                        adrenalin kuis kilat, keseruan duel 1 vs 1, serunya
                        mabar squad tim, dan petualangan 3D penuh reward poin!
                    </p>
                </div>

                <div
                    className="mt-10 flex flex-wrap justify-center gap-2"
                    role="group"
                    aria-label="Filter mode game"
                >
                    {[
                        { key: 'all', label: 'Semua Mode' },
                        { key: 'solo', label: 'Main Solo' },
                        { key: 'social', label: 'Duel & Mabar' },
                        { key: 'quest', label: 'Quest & Petualangan' },
                    ].map((filter) => (
                        <button
                            key={filter.key}
                            type="button"
                            onClick={() =>
                                setGameModeFilter(
                                    filter.key as typeof gameModeFilter,
                                )
                            }
                            className={`rounded-xl border-2 border-[#1f2a44] px-4 py-2 text-xs font-black transition-all focus-visible:ring-2 focus-visible:ring-[#845EC2] focus-visible:ring-offset-2 ${
                                gameModeFilter === filter.key
                                    ? 'bg-[#1f2a44] text-white shadow-[3px_3px_0px_#FF9E44]'
                                    : 'bg-white text-[#1f2a44] shadow-[2px_2px_0px_#1f2a44] hover:-translate-y-0.5 hover:bg-[#FFF176]'
                            }`}
                        >
                            {filter.label}
                        </button>
                    ))}
                </div>

                <div className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {gameModes
                        .filter(
                            (mode) =>
                                gameModeFilter === 'all' ||
                                mode.category === gameModeFilter,
                        )
                        .map((m, i) => {
                            const Icon = m.icon;
                            return (
                                <div
                                    key={i}
                                    data-gsap-stagger="feature-card"
                                    className="group relative flex flex-col justify-between rounded-3xl border-3 border-[#1f2a44] bg-[#FFF9E6] p-6 shadow-[5px_5px_0px_#1f2a44] transition-all hover:-translate-y-1.5 hover:shadow-[8px_8px_0px_#1f2a44]"
                                >
                                    <div>
                                        <div className="flex items-center justify-between">
                                            <div
                                                className={`flex h-14 w-14 items-center justify-center rounded-2xl border-3 border-[#1f2a44] ${m.color} shadow-[3px_3px_0px_#1f2a44]`}
                                            >
                                                <Icon className="h-7 w-7 stroke-[2.5] text-[#1f2a44]" />
                                            </div>
                                            <span className="rounded-full border-2 border-[#1f2a44] bg-white px-3 py-0.5 text-xs font-black text-[#1f2a44] shadow-[1.5px_1.5px_0px_#1f2a44]">
                                                {m.tag}
                                            </span>
                                        </div>
                                        <h3 className="mt-5 font-display text-xl font-black text-[#1f2a44]">
                                            {m.title}
                                        </h3>
                                        <div className="mt-1 text-xs font-bold text-[#845EC2]">
                                            {m.badge}
                                        </div>
                                        <p className="mt-3 text-sm leading-relaxed font-semibold text-slate-600">
                                            {m.desc}
                                        </p>
                                    </div>
                                    <div className="mt-6 flex items-center justify-between border-t-2 border-[#1f2a44]/10 pt-4 text-xs font-bold text-[#1f2a44]">
                                        <span className="flex items-center gap-1.5 text-[#FF9E44]">
                                            <Sparkles className="h-4 w-4" />
                                            <span>Multiplayer Online</span>
                                        </span>
                                        <span className="rounded-md border border-[#1f2a44] bg-[#FFF176] px-2 py-0.5 text-[10px] font-black">
                                            +Poin Akumulasi
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                </div>
            </section>

            {/* KEDUA: Jenjang Pendidikan & Kesulitan Adaptif */}
            <section
                id="levels"
                data-gsap-section="levels"
                className="border-y-4 border-[#1f2a44] bg-[#FFF9E6] py-16"
            >
                <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                    <div className="mx-auto max-w-3xl text-center">
                        <div className="inline-flex items-center gap-2 rounded-full border-3 border-[#1f2a44] bg-[#00C9A7] px-4 py-1 text-xs font-black tracking-wider text-[#1f2a44] uppercase shadow-[3px_3px_0px_#1f2a44]">
                            <GraduationCap className="h-4 w-4" />
                            Level Game Menyesuaikan Usiamu
                        </div>
                        <h2 className="mt-4 font-display text-3xl font-black text-[#1f2a44] sm:text-5xl">
                            Tantangan Pas untuk Semua:{' '}
                            <span className="text-[#845EC2]">
                                TK Hingga Kampus
                            </span>
                        </h2>
                        <p className="mt-3 text-base font-bold text-slate-600 sm:text-lg">
                            Tingkat kesulitan game otomatis dikalibrasi sesuai
                            jenjang pemain. Game tetap adil, seru, dan relevan
                            dengan kemampuanmu!
                        </p>
                    </div>

                    <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                        {levels.map((lvl, idx) => {
                            const LvlIcon = lvl.icon;
                            return (
                                <div
                                    key={idx}
                                    data-gsap-stagger="level-card"
                                    className={`rounded-2xl border-3 border-[#1f2a44] p-5 shadow-[4px_4px_0px_#1f2a44] transition-all hover:-translate-y-1 ${lvl.color}`}
                                >
                                    <div className="flex h-12 w-12 items-center justify-center rounded-xl border-2 border-[#1f2a44] bg-white shadow-[2px_2px_0px_#1f2a44]">
                                        <LvlIcon
                                            className={`h-6 w-6 stroke-[2.5] ${lvl.iconColor}`}
                                        />
                                    </div>
                                    <h3 className="mt-3 font-display text-lg font-black text-[#1f2a44]">
                                        {lvl.level}
                                    </h3>
                                    <p className="mt-2 text-xs leading-relaxed font-semibold text-slate-600">
                                        {lvl.desc}
                                    </p>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </section>

            {/* KETIGA: Subject Pelajaran Sebagai Bahan Gameplay */}
            <section
                id="subjects"
                data-gsap-section="subjects"
                className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8"
            >
                <div className="mx-auto max-w-3xl text-center">
                    <div className="inline-flex items-center gap-2 rounded-full border-3 border-[#1f2a44] bg-[#00C9A7] px-4 py-1 text-xs font-black tracking-wider text-[#1f2a44] uppercase shadow-[3px_3px_0px_#1f2a44]">
                        <BookOpen className="h-4 w-4" />
                        Pilihan Arena Materi
                    </div>
                    <h2 className="mt-4 font-display text-3xl font-black text-[#1f2a44] sm:text-5xl">
                        Pilih 1 Pelajaran Saja atau{' '}
                        <span className="text-[#FF6584]">
                            Mode Campuran Seru!
                        </span>
                    </h2>
                    <p className="mt-4 text-base font-bold text-slate-600 sm:text-lg">
                        Mau duel khusus rumus Matematika? Bisa! Mau party game
                        heboh dengan <strong>soal campuran silang</strong> (IPA
                        + IPS + Bahasa + Koding) dalam satu ronde? Rasakan
                        fleksibilitas bermain tanpa batas!
                    </p>
                </div>

                {/* Adaptive Difficulty & Mixed Subject Feature Box */}
                <div className="mt-10 grid gap-6 md:grid-cols-2">
                    <div className="flex items-start gap-4 rounded-3xl border-3 border-[#1f2a44] bg-[#FFFDE6] p-6 shadow-[4px_4px_0px_#1f2a44]">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border-2 border-[#1f2a44] bg-[#FF9E44] shadow-[2px_2px_0px_#1f2a44]">
                            <Shuffle className="h-6 w-6 text-white" />
                        </div>
                        <div>
                            <h4 className="font-display text-base font-black text-[#1f2a44]">
                                Format Soal Tunggal atau Campuran (Mix Subjects)
                            </h4>
                            <p className="mt-1 text-xs leading-relaxed font-semibold text-slate-600">
                                Pilih bermain 1 mata pelajaran spesifik untuk
                                latihan ulangan, atau aktifkan{' '}
                                <strong>Mode Campuran Acak</strong> untuk adu
                                wawasan komprehensif yang penuh kejutan!
                            </p>
                        </div>
                    </div>

                    <div className="flex items-start gap-4 rounded-3xl border-3 border-[#1f2a44] bg-[#E8FAF6] p-6 shadow-[4px_4px_0px_#1f2a44]">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border-2 border-[#1f2a44] bg-[#00C9A7] shadow-[2px_2px_0px_#1f2a44]">
                            <GraduationCap className="h-6 w-6 text-[#1f2a44]" />
                        </div>
                        <div>
                            <h4 className="font-display text-base font-black text-[#1f2a44]">
                                Tingkat Kesulitan Otomatis Terkalibrasi
                            </h4>
                            <p className="mt-1 text-xs leading-relaxed font-semibold text-slate-600">
                                Sistem AI engine EduFunHub menyesuaikan
                                kompleksitas pertanyaan berdasarkan jenjang
                                pemain, menjaga gameplay tetap menantang namun
                                tidak membuat frustrasi.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Subject Cards Grid */}
                <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                    {subjects.map((sub, idx) => {
                        const SubIcon = sub.icon;
                        return (
                            <div
                                key={idx}
                                data-gsap-stagger="subject-card"
                                className="flex flex-col justify-between rounded-3xl border-3 border-[#1f2a44] bg-[#FFF9E6] p-6 shadow-[5px_5px_0px_#1f2a44] transition-all hover:-translate-y-1"
                            >
                                <div>
                                    <div className="flex items-center justify-between">
                                        <div
                                            className={`flex h-12 w-12 items-center justify-center rounded-2xl border-2 border-[#1f2a44] ${sub.color} shadow-[2px_2px_0px_#1f2a44]`}
                                        >
                                            <SubIcon className="h-6 w-6 text-[#1f2a44]" />
                                        </div>
                                        <span className="rounded-full border border-[#1f2a44] bg-white px-2.5 py-0.5 text-[10px] font-black text-[#1f2a44]">
                                            Semua Jenjang
                                        </span>
                                    </div>
                                    <h3 className="mt-4 font-display text-lg font-black text-[#1f2a44]">
                                        {sub.name}
                                    </h3>
                                    <p className="mt-1.5 text-xs leading-relaxed font-semibold text-slate-600">
                                        {sub.desc}
                                    </p>
                                </div>

                                <div className="mt-5 flex flex-wrap gap-1.5 border-t-2 border-[#1f2a44]/10 pt-3">
                                    {sub.topics.map((t, i) => (
                                        <span
                                            key={i}
                                            className="rounded-md border border-[#1f2a44] bg-white px-2 py-0.5 text-[10px] font-bold text-[#1f2a44]"
                                        >
                                            {t}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </section>
        </div>
    );
}
