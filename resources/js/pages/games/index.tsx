import { Button } from '@/components/ui/button';
import { Head, Link } from '@inertiajs/react';
import {
    ArrowLeft,
    Compass,
    Dice6,
    Gamepad2,
    Plane,
    Play,
    Puzzle,
    Swords,
    Timer,
    Users,
} from 'lucide-react';

export default function GameList() {
    const games = [
        {
            id: 'sky-quiz',
            title: 'Sukhoi Sky Quiz',
            badge: 'Terbang, Pilih & Tembak',
            desc: 'Pilot jet Sukhoi: terbang mengambil jawaban benar dan tembak drone, rintangan, serta jawaban salah. Soal campuran untuk kelas 1–4 SD.',
            icon: Plane,
            color: 'bg-[#bceaf2]',
            tag: 'Kelas 1–4 SD',
            route: '/games/sky-quiz',
            status: 'Demo siap dimainkan',
            playable: true,
        },
        {
            id: 'snakes-and-ladders',
            title: 'Ular Tangga Edukasi (Multiplayer)',
            badge: 'Board Game Edukatif',
            desc: 'Papan ular tangga 100 petak dengan 30 bank pertanyaan acak berbagai mata pelajaran (Matematika, Sains, Bahasa, Logika). Lempar dadu, jawab kuis untuk melangkah dengan animasi bertahap!',
            icon: Dice6,
            color: 'bg-[#FFF176]',
            tag: '2-4 Pemain',
            route: '/games/snakes-and-ladders',
            status: 'Tersedia Sekarang',
            playable: true,
        },
        {
            id: 'fast-quiz',
            title: 'Kuis Interaktif Kilat',
            badge: 'Live Adrenalin',
            desc: 'Adu kecepatan dan ketepatan menjawab soal berdurasi detik dengan live leaderboard dinamis.',
            icon: Timer,
            color: 'bg-[#FF9E44]',
            tag: 'Multiplayer Live',
            route: '/games/snakes-and-ladders',
            status: 'Demo Board Tersedia',
            playable: true,
        },
        {
            id: 'duel-1v1',
            title: 'Duel Otak 1 vs 1',
            badge: 'PVP Real-Time',
            desc: 'Tantang teman atau pemain acak se-Indonesia dalam duel 5 soal sengit untuk merebut gelar juara.',
            icon: Swords,
            color: 'bg-[#FF6584]',
            tag: 'Duel 1 vs 1',
            route: '/games/snakes-and-ladders',
            status: 'Demo Board Tersedia',
            playable: true,
        },
        {
            id: 'coop-squad',
            title: 'Misi Tim Lintas Komunitas',
            badge: 'Kolaborasi Squad',
            desc: 'Bentuk regu 4 pemain dan taklukkan teka-teki gabungan serta quest kurikulum bersama.',
            icon: Users,
            color: 'bg-[#00C9A7]',
            tag: 'Mabar Regu',
            route: '/games/snakes-and-ladders',
            status: 'Demo Board Tersedia',
            playable: true,
        },
        {
            id: 'rpg-quest',
            title: 'Petualangan 3D (RPG Quest)',
            badge: 'Open-World',
            desc: 'Eksplorasi laboratorium rahasia sains, selesaikan misteri sejarah, dan kumpulkan koin reward.',
            icon: Compass,
            color: 'bg-[#845EC2]',
            tag: 'Quest Solo / Co-Op',
            route: '/games/snakes-and-ladders',
            status: 'Demo Board Tersedia',
            playable: true,
        },
        {
            id: 'brain-puzzle',
            title: 'Teka-Teki & Logika Asah Otak',
            badge: 'Logika Kritis',
            desc: 'Puzzle fisika interaktif, teka-teki silang kata ilmiah, dan decoding logika komputer.',
            icon: Puzzle,
            color: 'bg-[#FFF3E8]',
            tag: 'Asah Otak',
            route: '/games/snakes-and-ladders',
            status: 'Demo Board Tersedia',
            playable: true,
        },
    ];

    return (
        <div className="min-h-screen bg-[#FFF9E6] selection:bg-[#FF6584] selection:text-white">
            <Head title="Daftar Permainan Edukasi - EduFunHub">
                <meta
                    name="description"
                    content="Koleksi permainan edukasi interaktif EduFunHub: Board Game Ular Tangga, Kuis Kilat, Duel 1v1, Mabar Tim, dan RPG 3D."
                />
            </Head>

            {/* Header */}
            <header className="sticky top-0 z-40 border-b-4 border-[#1f2a44] bg-[#FFF9E6]/95 backdrop-blur-md">
                <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
                    <div className="flex items-center gap-3">
                        <Link
                            href="/"
                            className="flex h-11 w-11 items-center justify-center rounded-2xl border-3 border-[#1f2a44] bg-white shadow-[3px_3px_0px_#1f2a44] transition-all hover:-translate-y-0.5"
                        >
                            <ArrowLeft className="h-5 w-5 text-[#1f2a44]" />
                        </Link>
                        <div className="flex flex-col">
                            <span className="font-display text-xl font-black text-[#1f2a44] sm:text-2xl">
                                Arena Game{' '}
                                <span className="text-[#FF9E44]">
                                    EduFunHub
                                </span>
                            </span>
                            <span className="text-xs font-bold text-slate-600">
                                edufunhub.com/gamelist • Pilih & Mainkan Game
                                Edukatif
                            </span>
                        </div>
                    </div>

                    <Button
                        asChild
                        className="rounded-2xl border-3 border-[#1f2a44] bg-[#FF9E44] px-5 py-2 font-display text-sm font-black text-white shadow-[3px_3px_0px_#1f2a44] hover:bg-[#ff8f29]"
                    >
                        <Link href="/games/snakes-and-ladders">
                            <Dice6 className="mr-2 h-4 w-4" />
                            Main Ular Tangga
                        </Link>
                    </Button>
                </div>
            </header>

            <main className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
                <div className="text-center">
                    <div className="inline-flex items-center gap-2 rounded-full border-3 border-[#1f2a44] bg-[#FFF176] px-4 py-1 text-xs font-black tracking-wider text-[#1f2a44] uppercase shadow-[3px_3px_0px_#1f2a44]">
                        <Gamepad2 className="h-4 w-4" />
                        Pilihan Mode & Permainan Interaktif
                    </div>
                    <h1 className="mt-4 font-display text-3xl font-black text-[#1f2a44] sm:text-5xl">
                        Daftar Permainan{' '}
                        <span className="text-[#FF6584]">Edukatif</span>
                    </h1>
                    <p className="mt-3 text-base font-bold text-slate-600 sm:text-lg">
                        Semua game terbuka sesuai dengan akumulasi poin dan
                        level peserta. Pilih tantanganmu dan mulai bermain!
                    </p>
                </div>

                <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {games.map((g) => {
                        const Icon = g.icon;
                        return (
                            <div
                                key={g.id}
                                className="flex flex-col justify-between rounded-3xl border-3 border-[#1f2a44] bg-white p-6 shadow-[5px_5px_0px_#1f2a44] transition-all hover:-translate-y-1.5 hover:shadow-[8px_8px_0px_#1f2a44]"
                            >
                                <div>
                                    <div className="flex items-center justify-between">
                                        <div
                                            className={`flex h-14 w-14 items-center justify-center rounded-2xl border-3 border-[#1f2a44] ${g.color} shadow-[3px_3px_0px_#1f2a44]`}
                                        >
                                            <Icon className="h-7 w-7 stroke-[2.5] text-[#1f2a44]" />
                                        </div>
                                        <span className="rounded-full border-2 border-[#1f2a44] bg-[#FFFDE6] px-3 py-0.5 text-xs font-black text-[#1f2a44] shadow-[1.5px_1.5px_0px_#1f2a44]">
                                            {g.tag}
                                        </span>
                                    </div>

                                    <h3 className="mt-5 font-display text-xl font-black text-[#1f2a44]">
                                        {g.title}
                                    </h3>
                                    <div className="mt-1 text-xs font-bold text-[#845EC2]">
                                        {g.badge}
                                    </div>
                                    <p className="mt-3 text-sm leading-relaxed font-semibold text-slate-600">
                                        {g.desc}
                                    </p>
                                </div>

                                <div className="mt-6 border-t-2 border-[#1f2a44]/10 pt-4">
                                    <Button
                                        asChild
                                        className="w-full rounded-2xl border-3 border-[#1f2a44] bg-[#00C9A7] py-5 font-display text-base font-black text-[#1f2a44] shadow-[3px_3px_0px_#1f2a44] hover:bg-[#00C9A7]/90 hover:shadow-[5px_5px_0px_#1f2a44]"
                                    >
                                        <Link href={g.route}>
                                            <Play className="mr-2 h-4 w-4 fill-[#1f2a44]" />
                                            Mainkan Sekarang
                                        </Link>
                                    </Button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </main>
        </div>
    );
}
