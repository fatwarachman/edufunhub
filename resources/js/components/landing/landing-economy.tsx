import { Coins, Gift, Shield, Shirt } from 'lucide-react';

export function LandingEconomy() {
    return (
        <section
            id="economy"
            data-gsap-section="economy"
            className="border-t-4 border-[#1f2a44] bg-[#FFF9E6] py-20 lg:py-28"
        >
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                {/* Header Section */}
                <div className="mx-auto max-w-3xl text-center">
                    <div className="inline-flex items-center gap-2 rounded-full border-3 border-[#1f2a44] bg-[#FFF176] px-4 py-1 text-xs font-black tracking-wider text-[#1f2a44] uppercase shadow-[3px_3px_0px_#1f2a44]">
                        <Coins className="h-4 w-4 text-[#FF9E44]" />
                        Ekonomi Poin, Kustomisasi Karakter & Item Shop
                    </div>
                    <h2 className="mt-4 font-display text-3xl font-black text-[#1f2a44] sm:text-5xl">
                        Dandani Karaktermu dengan{' '}
                        <span className="text-[#FF9E44]">Poin Akumulasi</span>{' '}
                        Misi!
                    </h2>
                    <p className="mt-4 text-base font-bold text-slate-600 sm:text-lg">
                        Setiap poin yang kamu raih dari kuis kilat, duel 1 vs 1,
                        teka-teki logika, dan petualangan tim otomatis
                        terakumulasi. Gunakan poinmu untuk membeli kostum
                        avatar, sayap aura, dan item kosmetik keren di Item
                        Shop!
                    </p>
                </div>

                {/* 4 Cards Showcase */}
                <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                    {/* Item 1: Kostum Cyber Mecha */}
                    <div
                        data-gsap-stagger="economy-card"
                        className="group flex flex-col justify-between rounded-3xl border-3 border-[#1f2a44] bg-white p-5 shadow-[5px_5px_0px_#1f2a44] transition-all hover:-translate-y-1.5 hover:shadow-[7px_7px_0px_#1f2a44]"
                    >
                        <div>
                            <div className="flex items-center justify-between">
                                <span className="rounded-full border border-[#1f2a44] bg-[#FF9E44] px-2.5 py-0.5 text-[10px] font-black text-white uppercase">
                                    LEGENDARY
                                </span>
                                <span className="text-xs font-bold text-slate-500">
                                    Avatar Skin
                                </span>
                            </div>

                            {/* Modern Vector Cyber Mecha Artwork */}
                            <div className="my-4 flex h-36 items-center justify-center rounded-2xl border-2 border-[#1f2a44] bg-[#EAF5FF] shadow-[2px_2px_0px_#1f2a44] transition-transform group-hover:scale-105">
                                <svg
                                    className="h-24 w-24"
                                    viewBox="0 0 96 96"
                                    fill="none"
                                    xmlns="http://www.w3.org/2000/svg"
                                >
                                    <circle
                                        cx="48"
                                        cy="48"
                                        r="38"
                                        fill="#D3E9FF"
                                        stroke="#1f2a44"
                                        strokeWidth="2.5"
                                    />
                                    <path
                                        d="M48 10V22"
                                        stroke="#1f2a44"
                                        strokeWidth="3"
                                        strokeLinecap="round"
                                    />
                                    <circle
                                        cx="48"
                                        cy="10"
                                        r="4"
                                        fill="#FF6584"
                                        stroke="#1f2a44"
                                        strokeWidth="2"
                                    />
                                    <path
                                        d="M26 36C26 25 35 22 48 22C61 22 70 25 70 36V58C70 68 59 74 48 74C37 74 26 68 26 58V36Z"
                                        fill="#1f2a44"
                                    />
                                    <rect
                                        x="20"
                                        y="38"
                                        width="8"
                                        height="20"
                                        rx="4"
                                        fill="#FF9E44"
                                        stroke="#1f2a44"
                                        strokeWidth="2"
                                    />
                                    <rect
                                        x="68"
                                        y="38"
                                        width="8"
                                        height="20"
                                        rx="4"
                                        fill="#FF9E44"
                                        stroke="#1f2a44"
                                        strokeWidth="2"
                                    />
                                    <rect
                                        x="30"
                                        y="36"
                                        width="36"
                                        height="18"
                                        rx="6"
                                        fill="#00C9A7"
                                        stroke="#1f2a44"
                                        strokeWidth="2.5"
                                    />
                                    <ellipse
                                        cx="40"
                                        cy="45"
                                        rx="4"
                                        ry="2"
                                        fill="#FFF176"
                                    />
                                    <ellipse
                                        cx="56"
                                        cy="45"
                                        rx="4"
                                        ry="2"
                                        fill="#FFF176"
                                    />
                                    <path
                                        d="M38 60H58L54 68H42L38 60Z"
                                        fill="#FFF176"
                                        stroke="#1f2a44"
                                        strokeWidth="2"
                                    />
                                    <line
                                        x1="44"
                                        y1="62"
                                        x2="44"
                                        y2="66"
                                        stroke="#1f2a44"
                                        strokeWidth="1.5"
                                    />
                                    <line
                                        x1="48"
                                        y1="62"
                                        x2="48"
                                        y2="66"
                                        stroke="#1f2a44"
                                        strokeWidth="1.5"
                                    />
                                    <line
                                        x1="52"
                                        y1="62"
                                        x2="52"
                                        y2="66"
                                        stroke="#1f2a44"
                                        strokeWidth="1.5"
                                    />
                                    <path
                                        d="M72 18L74 23L79 25L74 27L72 32L70 27L65 25L70 23L72 18Z"
                                        fill="#FFF176"
                                    />
                                </svg>
                            </div>

                            <h3 className="font-display text-base font-black text-[#1f2a44]">
                                Kostum Cyber Mecha
                            </h3>
                            <p className="mt-1 text-xs leading-relaxed font-semibold text-slate-600">
                                Dandani karakter avatar 3D-mu dengan visor
                                futuristik neon dan set armor robot berteknologi
                                tinggi.
                            </p>
                        </div>

                        <div className="mt-4 flex items-center justify-between border-t-2 border-slate-100 pt-3">
                            <div className="flex items-center gap-1.5 font-display text-sm font-black text-[#FF9E44]">
                                <Coins className="h-4 w-4" />
                                <span>1.200 Poin</span>
                            </div>
                            <span className="rounded-xl border border-[#1f2a44] bg-[#FFF9E6] px-2.5 py-1 text-[11px] font-bold text-[#1f2a44]">
                                Beli dgn Poin Misi
                            </span>
                        </div>
                    </div>

                    {/* Item 2: Sayap Phoenix Emas */}
                    <div
                        data-gsap-stagger="economy-card"
                        className="group flex flex-col justify-between rounded-3xl border-3 border-[#1f2a44] bg-white p-5 shadow-[5px_5px_0px_#1f2a44] transition-all hover:-translate-y-1.5 hover:shadow-[7px_7px_0px_#1f2a44]"
                    >
                        <div>
                            <div className="flex items-center justify-between">
                                <span className="rounded-full border border-[#1f2a44] bg-[#845EC2] px-2.5 py-0.5 text-[10px] font-black text-white uppercase">
                                    EPIC
                                </span>
                                <span className="text-xs font-bold text-slate-500">
                                    Aksesoris Efek
                                </span>
                            </div>

                            {/* Modern Vector Phoenix Wings Artwork */}
                            <div className="my-4 flex h-36 items-center justify-center rounded-2xl border-2 border-[#1f2a44] bg-[#FFF6E5] shadow-[2px_2px_0px_#1f2a44] transition-transform group-hover:scale-105">
                                <svg
                                    className="h-24 w-24"
                                    viewBox="0 0 96 96"
                                    fill="none"
                                    xmlns="http://www.w3.org/2000/svg"
                                >
                                    <circle
                                        cx="48"
                                        cy="48"
                                        r="38"
                                        fill="#FFE3B3"
                                        stroke="#1f2a44"
                                        strokeWidth="2.5"
                                    />
                                    <path
                                        d="M44 48C36 34 22 28 12 32C10 44 18 56 34 58C24 64 22 72 26 78C34 76 42 66 44 58"
                                        fill="#FF9E44"
                                        stroke="#1f2a44"
                                        strokeWidth="2.5"
                                        strokeLinejoin="round"
                                    />
                                    <path
                                        d="M42 46C36 36 26 34 18 36C18 44 26 50 36 52"
                                        fill="#FFF176"
                                        stroke="#1f2a44"
                                        strokeWidth="2"
                                        strokeLinejoin="round"
                                    />
                                    <path
                                        d="M52 48C60 34 74 28 84 32C86 44 78 56 62 58C72 64 74 72 70 78C62 76 54 66 52 58"
                                        fill="#FF9E44"
                                        stroke="#1f2a44"
                                        strokeWidth="2.5"
                                        strokeLinejoin="round"
                                    />
                                    <path
                                        d="M54 46C60 36 70 34 78 36C78 44 70 50 60 52"
                                        fill="#FFF176"
                                        stroke="#1f2a44"
                                        strokeWidth="2"
                                        strokeLinejoin="round"
                                    />
                                    <polygon
                                        points="48,34 54,46 48,58 42,46"
                                        fill="#FF6584"
                                        stroke="#1f2a44"
                                        strokeWidth="2.5"
                                    />
                                    <circle
                                        cx="48"
                                        cy="46"
                                        r="2.5"
                                        fill="#FFF176"
                                    />
                                    <circle
                                        cx="48"
                                        cy="22"
                                        r="2.5"
                                        fill="#FF9E44"
                                    />
                                    <circle
                                        cx="30"
                                        cy="24"
                                        r="2"
                                        fill="#FF6584"
                                    />
                                    <circle
                                        cx="66"
                                        cy="24"
                                        r="2"
                                        fill="#FF6584"
                                    />
                                </svg>
                            </div>

                            <h3 className="font-display text-base font-black text-[#1f2a44]">
                                Sayap Phoenix Emas
                            </h3>
                            <p className="mt-1 text-xs leading-relaxed font-semibold text-slate-600">
                                Aksesoris punggung bercahaya api emas saat kamu
                                menjawab soal kuis cepat dengan streak sempurna.
                            </p>
                        </div>

                        <div className="mt-4 flex items-center justify-between border-t-2 border-slate-100 pt-3">
                            <div className="flex items-center gap-1.5 font-display text-sm font-black text-[#FF9E44]">
                                <Coins className="h-4 w-4" />
                                <span>850 Poin</span>
                            </div>
                            <span className="rounded-xl border border-[#1f2a44] bg-[#FFF9E6] px-2.5 py-1 text-[11px] font-bold text-[#1f2a44]">
                                Beli dgn Poin Misi
                            </span>
                        </div>
                    </div>

                    {/* Item 3: Potion 2x Booster */}
                    <div
                        data-gsap-stagger="economy-card"
                        className="group flex flex-col justify-between rounded-3xl border-3 border-[#1f2a44] bg-white p-5 shadow-[5px_5px_0px_#1f2a44] transition-all hover:-translate-y-1.5 hover:shadow-[7px_7px_0px_#1f2a44]"
                    >
                        <div>
                            <div className="flex items-center justify-between">
                                <span className="rounded-full border border-[#1f2a44] bg-[#00C9A7] px-2.5 py-0.5 text-[10px] font-black text-[#1f2a44] uppercase">
                                    RARE
                                </span>
                                <span className="text-xs font-bold text-slate-500">
                                    Item Tempur
                                </span>
                            </div>

                            {/* Modern Vector Alchemist Potion Artwork */}
                            <div className="my-4 flex h-36 items-center justify-center rounded-2xl border-2 border-[#1f2a44] bg-[#E8FAF6] shadow-[2px_2px_0px_#1f2a44] transition-transform group-hover:scale-105">
                                <svg
                                    className="h-24 w-24"
                                    viewBox="0 0 96 96"
                                    fill="none"
                                    xmlns="http://www.w3.org/2000/svg"
                                >
                                    <circle
                                        cx="48"
                                        cy="48"
                                        r="38"
                                        fill="#C5F3E9"
                                        stroke="#1f2a44"
                                        strokeWidth="2.5"
                                    />
                                    <rect
                                        x="42"
                                        y="16"
                                        width="12"
                                        height="8"
                                        rx="2"
                                        fill="#FF9E44"
                                        stroke="#1f2a44"
                                        strokeWidth="2.5"
                                    />
                                    <path
                                        d="M40 24H56V32H40V24Z"
                                        fill="#EAF5FF"
                                        stroke="#1f2a44"
                                        strokeWidth="2.5"
                                    />
                                    <path
                                        d="M40 32L24 64C21 70 25 78 33 78H63C71 78 75 70 72 64L56 32H40Z"
                                        fill="#EAF5FF"
                                        stroke="#1f2a44"
                                        strokeWidth="2.5"
                                    />
                                    <path
                                        d="M29 60L26 66C24 71 27 76 33 76H63C69 76 72 71 70 66L67 60C62 63 56 61 48 61C40 61 34 63 29 60Z"
                                        fill="#00C9A7"
                                    />
                                    <path
                                        d="M29 60C34 63 40 61 48 61C56 61 62 63 67 60"
                                        stroke="#1f2a44"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                    />
                                    <rect
                                        x="39"
                                        y="65"
                                        width="18"
                                        height="9"
                                        rx="3"
                                        fill="#FFF176"
                                        stroke="#1f2a44"
                                        strokeWidth="1.5"
                                    />
                                    <text
                                        x="48"
                                        y="72"
                                        fill="#1f2a44"
                                        fontSize="8"
                                        fontWeight="900"
                                        textAnchor="middle"
                                        fontFamily="sans-serif"
                                    >
                                        2X
                                    </text>
                                    <circle
                                        cx="42"
                                        cy="50"
                                        r="3"
                                        fill="#FFF176"
                                        stroke="#1f2a44"
                                        strokeWidth="1.5"
                                    />
                                    <circle
                                        cx="52"
                                        cy="46"
                                        r="2"
                                        fill="#FFF176"
                                        stroke="#1f2a44"
                                        strokeWidth="1"
                                    />
                                    <circle
                                        cx="48"
                                        cy="38"
                                        r="1.5"
                                        fill="#FFF176"
                                    />
                                    <path
                                        d="M30 60L42 36"
                                        stroke="white"
                                        strokeWidth="2.5"
                                        strokeLinecap="round"
                                    />
                                </svg>
                            </div>

                            <h3 className="font-display text-base font-black text-[#1f2a44]">
                                Potion 2x Poin Booster
                            </h3>
                            <p className="mt-1 text-xs leading-relaxed font-semibold text-slate-600">
                                Gandakan poin yang didapat dari setiap duel kuis
                                dan tantangan materi selama 24 jam penuh.
                            </p>
                        </div>

                        <div className="mt-4 flex items-center justify-between border-t-2 border-slate-100 pt-3">
                            <div className="flex items-center gap-1.5 font-display text-sm font-black text-[#FF9E44]">
                                <Coins className="h-4 w-4" />
                                <span>300 Poin</span>
                            </div>
                            <span className="rounded-xl border border-[#1f2a44] bg-[#FFF9E6] px-2.5 py-1 text-[11px] font-bold text-[#1f2a44]">
                                Beli dgn Poin Misi
                            </span>
                        </div>
                    </div>

                    {/* Item 4: Badge Cendekiawan Sejati */}
                    <div
                        data-gsap-stagger="economy-card"
                        className="group flex flex-col justify-between rounded-3xl border-3 border-[#1f2a44] bg-white p-5 shadow-[5px_5px_0px_#1f2a44] transition-all hover:-translate-y-1.5 hover:shadow-[7px_7px_0px_#1f2a44]"
                    >
                        <div>
                            <div className="flex items-center justify-between">
                                <span className="rounded-full border border-[#1f2a44] bg-[#FF6584] px-2.5 py-0.5 text-[10px] font-black text-white uppercase">
                                    EXCLUSIVE
                                </span>
                                <span className="text-xs font-bold text-slate-500">
                                    Gelar Profil
                                </span>
                            </div>

                            {/* Modern Vector Academic Star Medal */}
                            <div className="my-4 flex h-36 items-center justify-center rounded-2xl border-2 border-[#1f2a44] bg-[#FFEBF0] shadow-[2px_2px_0px_#1f2a44] transition-transform group-hover:scale-105">
                                <svg
                                    className="h-24 w-24"
                                    viewBox="0 0 96 96"
                                    fill="none"
                                    xmlns="http://www.w3.org/2000/svg"
                                >
                                    <circle
                                        cx="48"
                                        cy="48"
                                        r="38"
                                        fill="#FFD4DF"
                                        stroke="#1f2a44"
                                        strokeWidth="2.5"
                                    />
                                    <path
                                        d="M34 16L40 40H30L34 16Z"
                                        fill="#FF6584"
                                        stroke="#1f2a44"
                                        strokeWidth="2"
                                    />
                                    <path
                                        d="M62 16L56 40H66L62 16Z"
                                        fill="#FF6584"
                                        stroke="#1f2a44"
                                        strokeWidth="2"
                                    />
                                    <path
                                        d="M48 16L48 40H38L42 16H48Z"
                                        fill="#845EC2"
                                        stroke="#1f2a44"
                                        strokeWidth="2"
                                    />
                                    <path
                                        d="M48 16L48 40H58L54 16H48Z"
                                        fill="#845EC2"
                                        stroke="#1f2a44"
                                        strokeWidth="2"
                                    />
                                    <circle
                                        cx="48"
                                        cy="54"
                                        r="22"
                                        fill="#FF9E44"
                                        stroke="#1f2a44"
                                        strokeWidth="2.5"
                                    />
                                    <circle
                                        cx="48"
                                        cy="54"
                                        r="18"
                                        fill="#FFF176"
                                        stroke="#1f2a44"
                                        strokeWidth="2"
                                    />
                                    <path
                                        d="M48 40L51.5 48.5L60.5 49L53.5 55L56 63.5L48 58.5L40 63.5L42.5 55L35.5 49L44.5 48.5L48 40Z"
                                        fill="#FF6584"
                                        stroke="#1f2a44"
                                        strokeWidth="2"
                                        strokeLinejoin="round"
                                    />
                                    <circle
                                        cx="48"
                                        cy="53"
                                        r="3"
                                        fill="#FFF176"
                                    />
                                    <path
                                        d="M72 38L74 43L79 45L74 47L72 52L70 47L65 45L70 43L72 38Z"
                                        fill="#FF9E44"
                                    />
                                </svg>
                            </div>

                            <h3 className="font-display text-base font-black text-[#1f2a44]">
                                Badge "Cendekiawan Sejati"
                            </h3>
                            <p className="mt-1 text-xs leading-relaxed font-semibold text-slate-600">
                                Lencana kehormatan eksklusif yang membedakan
                                pemain berprestasi tinggi di leaderboard
                                nasional.
                            </p>
                        </div>

                        <div className="mt-4 flex items-center justify-between border-t-2 border-slate-100 pt-3">
                            <div className="flex items-center gap-1.5 font-display text-sm font-black text-[#FF9E44]">
                                <Coins className="h-4 w-4" />
                                <span>500 Poin</span>
                            </div>
                            <span className="rounded-xl border border-[#1f2a44] bg-[#FFF9E6] px-2.5 py-1 text-[11px] font-bold text-[#1f2a44]">
                                Beli dgn Poin Misi
                            </span>
                        </div>
                    </div>
                </div>

                {/* 3 Core Highlights */}
                <div className="mt-12 grid gap-6 sm:grid-cols-3">
                    <div
                        data-gsap-stagger="economy-highlight"
                        className="flex items-start gap-4 rounded-3xl border-3 border-[#1f2a44] bg-white p-5 shadow-[4px_4px_0px_#1f2a44]"
                    >
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border-2 border-[#1f2a44] bg-[#FFF176] shadow-[2px_2px_0px_#1f2a44]">
                            <Shirt className="h-6 w-6 text-[#1f2a44]" />
                        </div>
                        <div>
                            <h4 className="font-display text-sm font-black text-[#1f2a44]">
                                Kustomisasi Karakter Bebas
                            </h4>
                            <p className="mt-1 text-xs leading-relaxed font-semibold text-slate-600">
                                Dandani pakaian, aksesori, topi, dan aura
                                karakter sesukamu untuk tampil percaya diri saat
                                bermain bersama teman.
                            </p>
                        </div>
                    </div>

                    <div
                        data-gsap-stagger="economy-highlight"
                        className="flex items-start gap-4 rounded-3xl border-3 border-[#1f2a44] bg-white p-5 shadow-[4px_4px_0px_#1f2a44]"
                    >
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border-2 border-[#1f2a44] bg-[#00C9A7] shadow-[2px_2px_0px_#1f2a44]">
                            <Coins className="h-6 w-6 text-[#1f2a44]" />
                        </div>
                        <div>
                            <h4 className="font-display text-sm font-black text-[#1f2a44]">
                                Akumulasi Semua Poin
                            </h4>
                            <p className="mt-1 text-xs leading-relaxed font-semibold text-slate-600">
                                Setiap jawaban benar di kuis kilat, duel 1 vs 1,
                                dan tantangan tim diakumulasikan ke saldo akunmu
                                dan almamater.
                            </p>
                        </div>
                    </div>

                    <div
                        data-gsap-stagger="economy-highlight"
                        className="flex items-start gap-4 rounded-3xl border-3 border-[#1f2a44] bg-white p-5 shadow-[4px_4px_0px_#1f2a44]"
                    >
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border-2 border-[#1f2a44] bg-[#FF6584] shadow-[2px_2px_0px_#1f2a44]">
                            <Shield className="h-6 w-6 text-white" />
                        </div>
                        <div>
                            <h4 className="font-display text-sm font-black text-[#1f2a44]">
                                Murni Berbasis Prestasi Belajar
                            </h4>
                            <p className="mt-1 text-xs leading-relaxed font-semibold text-slate-600">
                                Tidak ada sistem pay-to-win. Poin murni didapat
                                dari ketekunan menyelesaikan misi soal dan
                                tantangan edukasi.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Notice Box */}
                <div className="mx-auto mt-12 max-w-2xl rounded-3xl border-3 border-[#1f2a44] bg-white p-6 text-center shadow-[6px_6px_0px_#1f2a44]">
                    <div className="flex items-center justify-center gap-2">
                        <Gift className="h-6 w-6 text-[#FF6584]" />
                        <h4 className="font-display text-lg font-black text-[#1f2a44]">
                            Dapatkan Poin Sekarang, Dandani Avatar-mu!
                        </h4>
                    </div>
                    <p className="mt-2 text-xs leading-relaxed font-bold text-slate-600 sm:text-sm">
                        Mulai mainkan kuis interaktif kilat, tantang duel teman
                        seangkatan, dan gabung tim sekolah untuk mengumpulkan
                        poin sebanyak-banyaknya!
                    </p>
                </div>
            </div>
        </section>
    );
}
