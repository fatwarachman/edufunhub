import {
    Coffee,
    Crown,
    GraduationCap,
    MapPin,
    Medal,
    PartyPopper,
    School,
    Sparkles,
    Trophy,
    Users,
} from 'lucide-react';
import { useState } from 'react';

export function LandingLeaderboard() {
    const [tab, setTab] = useState<'campus' | 'school' | 'player'>('school');

    // Generic fictional institution names (No real-world school/campus names)
    const topCampuses = [
        {
            rank: 1,
            name: 'Akademi Sains Garuda Nusantara',
            location: 'Wilayah Barat',
            points: '1.428.950 Poin',
            players: '482 Mahasiswa',
            badge: 'Juara Nasional',
            color: 'bg-[#FFF176]',
            badgeColor: 'bg-[#FF9E44]',
        },
        {
            rank: 2,
            name: 'Institut Teknologi Cakrawala',
            location: 'Wilayah Tengah',
            points: '1.385.200 Poin',
            players: '512 Mahasiswa',
            badge: 'Runner Up',
            color: 'bg-slate-100',
            badgeColor: 'bg-[#00C9A7]',
        },
        {
            rank: 3,
            name: 'Universitas Nusa Cendekia',
            location: 'Wilayah Selatan',
            points: '1.294.100 Poin',
            players: '420 Mahasiswa',
            badge: 'Top 3',
            color: 'bg-[#FFF3E8]',
            badgeColor: 'bg-[#845EC2]',
        },
        {
            rank: 4,
            name: 'Politeknik Kreasi Digital Mandiri',
            location: 'Wilayah Timur',
            points: '984.300 Poin',
            players: '315 Mahasiswa',
            badge: 'Top 10',
            color: 'bg-white',
            badgeColor: 'bg-slate-400',
        },
        {
            rank: 5,
            name: 'Universitas Riset Maritim Merdeka',
            location: 'Wilayah Utara',
            points: '892.400 Poin',
            players: '298 Mahasiswa',
            badge: 'Top 10',
            color: 'bg-white',
            badgeColor: 'bg-slate-400',
        },
    ];

    const topSchools = [
        {
            rank: 1,
            name: 'Sekolah Menengah Bintang Prestasi',
            location: 'Gugus Cendekia',
            points: '942.150 Poin',
            players: '240 Siswa',
            badge: 'Peringkat #1',
            color: 'bg-[#FFF176]',
            badgeColor: 'bg-[#FF9E44]',
        },
        {
            rank: 2,
            name: 'Pusat Belajar Tunas Bangsa Mandiri',
            location: 'Gugus Juara',
            points: '918.400 Poin',
            players: '225 Siswa',
            badge: 'Peringkat #2',
            color: 'bg-slate-100',
            badgeColor: 'bg-[#00C9A7]',
        },
        {
            rank: 3,
            name: 'Akademi Muda Generasi Maju',
            location: 'Gugus Inovatif',
            points: '899.700 Poin',
            players: '210 Siswa',
            badge: 'Peringkat #3',
            color: 'bg-[#FFF3E8]',
            badgeColor: 'bg-[#845EC2]',
        },
        {
            rank: 4,
            name: 'Lembaga Pendidikan Surya Utama',
            location: 'Gugus Pelopor',
            points: '782.300 Poin',
            players: '190 Siswa',
            badge: 'Top 5',
            color: 'bg-white',
            badgeColor: 'bg-slate-400',
        },
        {
            rank: 5,
            name: 'Sekolah Harapan Insan Madani',
            location: 'Gugus Cemerlang',
            points: '745.900 Poin',
            players: '175 Siswa',
            badge: 'Top 5',
            color: 'bg-white',
            badgeColor: 'bg-slate-400',
        },
    ];

    const topPlayers = [
        {
            rank: 1,
            name: 'Faiz Ramadhan',
            school: 'Akademi Sains Garuda Nusantara',
            avatar: 'FR',
            avatarBg: 'bg-[#FF9E44]',
            points: '98.450 Poin',
            level: 'Lv.45 Archmage',
            badge: 'Grand Champion',
            color: 'bg-[#FFF176]',
        },
        {
            rank: 2,
            name: 'Clarissa Zahra',
            school: 'Sekolah Menengah Bintang Prestasi',
            avatar: 'CZ',
            avatarBg: 'bg-[#00C9A7]',
            points: '94.200 Poin',
            level: 'Lv.42 Scholar Queen',
            badge: 'Diamond Master',
            color: 'bg-slate-100',
        },
        {
            rank: 3,
            name: 'Rizki Dwi Putra',
            school: 'Universitas Nusa Cendekia',
            avatar: 'RD',
            avatarBg: 'bg-[#845EC2]',
            points: '91.800 Poin',
            level: 'Lv.39 Cyber Knight',
            badge: 'Platinum Ace',
            color: 'bg-[#FFF3E8]',
        },
    ];

    return (
        <section
            id="leaderboard"
            className="border-b-4 border-[#1f2a44] bg-[#FFF9E6] py-20 lg:py-28"
        >
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                {/* Header */}
                <div className="mx-auto max-w-3xl text-center">
                    <div className="inline-flex items-center gap-2 rounded-full border-3 border-[#1f2a44] bg-[#FF9E44] px-4 py-1 text-xs font-black tracking-wider text-white uppercase shadow-[3px_3px_0px_#1f2a44]">
                        <Trophy className="h-4 w-4" />
                        Arena Prestasi Lembaga
                    </div>
                    <h2 className="mt-4 font-display text-3xl font-black text-[#1f2a44] sm:text-5xl">
                        Harumkan Nama{' '}
                        <span className="text-[#FF6584]">Sekolahmu!</span>
                    </h2>
                    <p className="mt-4 text-base font-bold text-slate-600 sm:text-lg">
                        Daftarkan sekolah tempat kamu menuntut ilmu saat ini.
                        Setiap poin yang kamu menangkan di arena game langsung
                        mendongkrak posisi sekolahmu di papan peringkat
                        nasional!
                    </p>
                </div>

                {/* Tabs */}
                <div className="mt-10 flex justify-center">
                    <div className="inline-flex flex-wrap justify-center rounded-2xl border-3 border-[#1f2a44] bg-white p-1.5 shadow-[4px_4px_0px_#1f2a44]">
                        <button
                            onClick={() => setTab('campus')}
                            className={`flex cursor-pointer items-center gap-2 rounded-xl px-5 py-2.5 font-display text-sm font-black transition-all ${
                                tab === 'campus'
                                    ? 'border-2 border-[#1f2a44] bg-[#FF9E44] text-white shadow-[2px_2px_0px_#1f2a44]'
                                    : 'text-[#1f2a44] hover:bg-slate-100'
                            }`}
                        >
                            <GraduationCap className="h-4 w-4" />
                            Top Perguruan Tinggi
                        </button>
                        <button
                            onClick={() => setTab('school')}
                            className={`flex cursor-pointer items-center gap-2 rounded-xl px-5 py-2.5 font-display text-sm font-black transition-all ${
                                tab === 'school'
                                    ? 'border-2 border-[#1f2a44] bg-[#00C9A7] text-[#1f2a44] shadow-[2px_2px_0px_#1f2a44]'
                                    : 'text-[#1f2a44] hover:bg-slate-100'
                            }`}
                        >
                            <School className="h-4 w-4" />
                            Top Sekolah & Lembaga
                        </button>
                        <button
                            onClick={() => setTab('player')}
                            className={`flex cursor-pointer items-center gap-2 rounded-xl px-5 py-2.5 font-display text-sm font-black transition-all ${
                                tab === 'player'
                                    ? 'border-2 border-[#1f2a44] bg-[#845EC2] text-white shadow-[2px_2px_0px_#1f2a44]'
                                    : 'text-[#1f2a44] hover:bg-slate-100'
                            }`}
                        >
                            <Crown className="h-4 w-4" />
                            Top Skor Pemain
                        </button>
                    </div>
                </div>

                <div
                    className="mx-auto mt-10 max-w-4xl"
                    aria-label="Podium tiga besar"
                >
                    <p className="mb-6 text-center text-xs font-bold text-slate-500">
                        Contoh podium • Data ilustrasi, bukan peringkat sekolah
                        sebenarnya
                    </p>
                    <div className="grid grid-cols-3 items-end gap-2 sm:gap-5">
                        {[1, 0, 2].map((index) => {
                            const item = (
                                tab === 'player'
                                    ? topPlayers
                                    : tab === 'campus'
                                      ? topCampuses
                                      : topSchools
                            )[index];
                            return (
                                <div
                                    key={`${tab}-${item.rank}`}
                                    className="flex min-w-0 flex-col items-center gap-3 text-center"
                                >
                                    <div
                                        className={`flex size-12 items-center justify-center rounded-2xl border-2 border-[#1f2a44] sm:size-16 ${item.color}`}
                                    >
                                        {item.rank === 1 ? (
                                            <Crown className="size-8 text-amber-600" />
                                        ) : (
                                            <Medal className="size-7 text-[#1f2a44]" />
                                        )}
                                    </div>
                                    <h3 className="min-h-16 text-xs font-black break-words text-[#1f2a44] sm:min-h-12 sm:text-base">
                                        {item.name}
                                    </h3>
                                    <span className="text-[10px] font-bold text-[#845EC2] sm:text-sm">
                                        {item.points}
                                    </span>
                                    <div
                                        className={`flex w-full items-center justify-center rounded-t-2xl border-3 border-[#1f2a44] font-display text-4xl font-black text-[#1f2a44] shadow-[4px_4px_0_#1f2a44] ${item.rank === 1 ? 'h-40 bg-[#FFF176]' : item.rank === 2 ? 'h-28 bg-[#cddde9]' : 'h-20 bg-[#ffd6b0]'}`}
                                    >
                                        {item.rank}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Table or Cards */}
                <div className="mx-auto mt-10 max-w-4xl">
                    {tab === 'player' ? (
                        <div className="grid gap-4 sm:grid-cols-3">
                            {topPlayers.map((p) => (
                                <div
                                    key={p.rank}
                                    className={`relative flex flex-col items-center rounded-3xl border-3 border-[#1f2a44] p-6 text-center shadow-[5px_5px_0px_#1f2a44] ${p.color}`}
                                >
                                    <div className="absolute -top-3.5 rounded-full border-2 border-[#1f2a44] bg-[#1f2a44] px-3 py-0.5 text-xs font-black text-[#FFF176]">
                                        RANK #{p.rank}
                                    </div>
                                    <div
                                        className={`mt-2 flex h-20 w-20 items-center justify-center rounded-2xl border-3 border-[#1f2a44] ${p.avatarBg} font-display text-xl font-black text-white shadow-[3px_3px_0px_#1f2a44]`}
                                    >
                                        {p.avatar}
                                    </div>
                                    <h3 className="mt-4 font-display text-lg font-black text-[#1f2a44]">
                                        {p.name}
                                    </h3>
                                    <div className="text-xs font-bold text-slate-600">
                                        {p.school}
                                    </div>
                                    <div className="mt-3 rounded-full border-2 border-[#1f2a44] bg-white px-3 py-1 text-xs font-black text-[#845EC2]">
                                        {p.level}
                                    </div>
                                    <div className="mt-2 font-display text-xl font-black text-[#FF6584]">
                                        {p.points}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {(tab === 'campus' ? topCampuses : topSchools).map(
                                (item) => (
                                    <div
                                        key={item.rank}
                                        className={`flex flex-wrap items-center justify-between gap-4 rounded-2xl border-3 border-[#1f2a44] p-4 shadow-[4px_4px_0px_#1f2a44] transition-all hover:-translate-y-0.5 sm:p-5 ${item.color}`}
                                    >
                                        <div className="flex items-center gap-4">
                                            {/* Clean Vector Rank Badge */}
                                            <div
                                                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border-2 border-[#1f2a44] font-display text-base font-black ${
                                                    item.rank === 1
                                                        ? 'bg-[#FF9E44] text-white'
                                                        : item.rank === 2
                                                          ? 'bg-[#00C9A7] text-[#1f2a44]'
                                                          : item.rank === 3
                                                            ? 'bg-[#FFF176] text-[#1f2a44]'
                                                            : 'bg-white text-[#1f2a44]'
                                                } shadow-[2px_2px_0px_#1f2a44]`}
                                            >
                                                {item.rank <= 3 ? (
                                                    <div className="flex flex-col items-center leading-none">
                                                        <Medal className="h-4 w-4" />
                                                        <span className="text-[11px]">
                                                            #{item.rank}
                                                        </span>
                                                    </div>
                                                ) : (
                                                    <span>#{item.rank}</span>
                                                )}
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <h3 className="font-display text-base font-black text-[#1f2a44] sm:text-lg">
                                                        {item.name}
                                                    </h3>
                                                    <span
                                                        className={`hidden rounded-md border border-[#1f2a44] px-2 py-0.5 text-[10px] font-black text-white sm:inline-block ${item.badgeColor}`}
                                                    >
                                                        {item.badge}
                                                    </span>
                                                </div>
                                                <div className="mt-1 flex items-center gap-3 text-xs font-bold text-slate-500">
                                                    <span className="flex items-center gap-1">
                                                        <MapPin className="h-3.5 w-3.5 text-[#FF6584]" />
                                                        {item.location}
                                                    </span>
                                                    <span>•</span>
                                                    <span className="flex items-center gap-1">
                                                        <Users className="h-3.5 w-3.5 text-[#845EC2]" />
                                                        {item.players}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="text-right">
                                            <div className="font-display text-lg font-black text-[#1f2a44] sm:text-xl">
                                                {item.points}
                                            </div>
                                            <div className="text-[11px] font-bold text-[#00C9A7]">
                                                Akumulasi Semua Pemain
                                            </div>
                                        </div>
                                    </div>
                                ),
                            )}
                        </div>
                    )}

                    {/* Notice for Institutions */}
                    <div className="mt-8 flex flex-col items-center justify-center rounded-3xl border-3 border-[#1f2a44] bg-[#845EC2]/10 p-6 text-center sm:flex-row sm:gap-4 sm:text-left">
                        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border-2 border-[#1f2a44] bg-white shadow-[2px_2px_0px_#1f2a44]">
                            <School className="h-7 w-7 text-[#845EC2]" />
                        </div>
                        <div>
                            <h4 className="font-display text-lg font-black text-[#1f2a44]">
                                Ingin Mendaftarkan Institusi atau Komunitas
                                Belajarmu?
                            </h4>
                            <p className="mt-1 text-xs font-bold text-slate-600 sm:text-sm">
                                Semua institusi dan kelompok belajar dapat
                                mendaftarkan anggotanya secara mandiri dan
                                gratis. Hubungi kami untuk integrasi ruang kelas
                                khusus pengajar!
                            </p>
                        </div>
                    </div>
                </div>

                {/* Section Baru: Event Offline Maen Bareng & Beasiswa Universitas Pendukung */}
                <div className="mx-auto mt-14 grid max-w-5xl gap-6 md:grid-cols-2">
                    {/* Card 1: Event Offline & Kopi Darat */}
                    <div className="flex flex-col justify-between rounded-3xl border-3 border-[#1f2a44] bg-white p-7 shadow-[6px_6px_0px_#1f2a44]">
                        <div>
                            <div className="inline-flex items-center gap-2 rounded-full border-2 border-[#1f2a44] bg-[#FF9E44] px-3.5 py-1 text-xs font-black text-white uppercase shadow-[2px_2px_0px_#1f2a44]">
                                <Coffee className="h-4 w-4" />
                                Komunitas & Kopi Darat
                            </div>
                            <h3 className="mt-4 font-display text-2xl font-black text-[#1f2a44]">
                                Event Offline "Maen Bareng" & Kopdar Komunitas
                            </h3>
                            <p className="mt-3 text-sm leading-relaxed font-semibold text-slate-600">
                                Belajar seru tidak hanya di depan layar!
                                EduFunHub secara rutin menghelat agenda kopi
                                darat (kopdar) dan temu komunitas di berbagai
                                kota:
                            </p>
                            <ul className="mt-4 space-y-2 text-xs font-bold text-slate-700">
                                <li className="flex items-center gap-2">
                                    <div className="h-2 w-2 rounded-full bg-[#FF9E44]" />
                                    <span>
                                        Turnamen kuis interaktif langsung (LAN
                                        Party edukasi)
                                    </span>
                                </li>
                                <li className="flex items-center gap-2">
                                    <div className="h-2 w-2 rounded-full bg-[#FF9E44]" />
                                    <span>
                                        Sharing session & bertukar pengalaman
                                        antarpelajar
                                    </span>
                                </li>
                                <li className="flex items-center gap-2">
                                    <div className="h-2 w-2 rounded-full bg-[#FF9E44]" />
                                    <span>
                                        Meetup antarpengajar untuk workshop
                                        perancangan soal kreatif
                                    </span>
                                </li>
                            </ul>
                        </div>
                        <div className="mt-6 flex items-center gap-2 border-t-2 border-slate-100 pt-4 text-xs font-black text-[#FF9E44]">
                            <PartyPopper className="h-4 w-4" />
                            <span>
                                Kopdar Terdekat: Jadwal diumumkan di kanal
                                komunitas
                            </span>
                        </div>
                    </div>

                    {/* Card 2: Kesempatan Beasiswa Universitas Pendukung */}
                    <div className="flex flex-col justify-between rounded-3xl border-3 border-[#1f2a44] bg-white p-7 shadow-[6px_6px_0px_#1f2a44]">
                        <div>
                            <div className="inline-flex items-center gap-2 rounded-full border-2 border-[#1f2a44] bg-[#00C9A7] px-3.5 py-1 text-xs font-black text-[#1f2a44] uppercase shadow-[2px_2px_0px_#1f2a44]">
                                <GraduationCap className="h-4 w-4" />
                                Jalur Prestasi Akademik
                            </div>
                            <h3 className="mt-4 font-display text-2xl font-black text-[#1f2a44]">
                                Raih Peluang Beasiswa dari Universitas Pendukung
                            </h3>
                            <p className="mt-3 text-sm leading-relaxed font-semibold text-slate-600">
                                Prestasi dan poin akumulasimu diakui secara
                                nyata. Sejumlah universitas dan yayasan
                                pendidikan mitra memantau papan leaderboard
                                nasional untuk menjaring bibit unggul:
                            </p>
                            <ul className="mt-4 space-y-2 text-xs font-bold text-slate-700">
                                <li className="flex items-center gap-2">
                                    <div className="h-2 w-2 rounded-full bg-[#00C9A7]" />
                                    <span>
                                        Rekomendasi jalur beasiswa prestasi bagi
                                        Top Leaderboard
                                    </span>
                                </li>
                                <li className="flex items-center gap-2">
                                    <div className="h-2 w-2 rounded-full bg-[#00C9A7]" />
                                    <span>
                                        Program mentorship & bimbingan masuk
                                        perguruan tinggi
                                    </span>
                                </li>
                                <li className="flex items-center gap-2">
                                    <div className="h-2 w-2 rounded-full bg-[#00C9A7]" />
                                    <span>
                                        Sertifikat portofolio digital resmi
                                        pencapaian belajar
                                    </span>
                                </li>
                            </ul>
                        </div>
                        <div className="mt-6 flex items-center gap-2 border-t-2 border-slate-100 pt-4 text-xs font-black text-[#008f75]">
                            <Sparkles className="h-4 w-4" />
                            <span>
                                Peluang Terbuka: Seleksi berkala berdasarkan
                                akumulasi skor
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}
