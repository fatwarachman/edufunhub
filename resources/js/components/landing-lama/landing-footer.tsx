import { Link } from '@inertiajs/react';
import {
    Award,
    Dice6,
    Gamepad2,
    Heart,
    MapPin,
    Shield,
    ShieldCheck,
    Sparkles,
    Trophy,
    User,
} from 'lucide-react';

export function LandingFooter() {
    const footerLinks = {
        modes: {
            title: 'Mode Permainan',
            links: [
                { label: 'Kuis Kilat Cepat', href: '#game-modes' },
                { label: 'Duel 1 vs 1 (PVP)', href: '#game-modes' },
                { label: 'Misi Tim Lintas Sekolah', href: '#game-modes' },
                { label: 'Board Game Edukatif', href: '#game-modes' },
                { label: 'Petualangan RPG 3D', href: '#game-modes' },
                { label: 'Teka-Teki & Labirin', href: '#game-modes' },
            ],
        },
        subjects: {
            title: 'Mata Pelajaran',
            links: [
                { label: 'Matematika & Kalkulus', href: '#subjects' },
                { label: 'IPA (Fisika, Biologi, Kimia)', href: '#subjects' },
                { label: 'IPS (Sejarah, Geografi)', href: '#subjects' },
                { label: 'Bahasa (Indonesia, Inggris)', href: '#subjects' },
                { label: 'Informatika & Logika Koding', href: '#subjects' },
                { label: 'Mode Campuran (Multi-Subject)', href: '#subjects' },
            ],
        },
        levels: {
            title: 'Jenjang Pendidikan',
            links: [
                { label: 'TK & PAUD Ceria', href: '#levels' },
                { label: 'SD / Madrasah Ibtidaiyah', href: '#levels' },
                { label: 'SMP / MTs', href: '#levels' },
                { label: 'SMA / SMK / MA', href: '#levels' },
                { label: 'Perguruan Tinggi / Universitas', href: '#levels' },
            ],
        },
        institutions: {
            title: 'Komunitas & Sekolah',
            links: [
                { label: 'Top Leaderboard Kampus', href: '#leaderboard' },
                { label: 'Top Leaderboard Sekolah', href: '#leaderboard' },
                { label: 'Ruang Guru & Quiz Studio', href: '#teachers' },
                { label: 'Item & Avatar Shop', href: '#economy' },
                { label: 'Tanya Jawab (FAQ)', href: '#faq' },
            ],
        },
    };

    return (
        <footer className="border-t-4 border-[#1f2a44] bg-[#1f2a44] text-white">
            <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
                <div className="grid grid-cols-1 gap-10 md:grid-cols-2 lg:grid-cols-6">
                    {/* Brand column */}
                    <div className="lg:col-span-2">
                        <Link href="/" className="flex items-center gap-3">
                            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border-3 border-white bg-[#FF9E44] shadow-[3px_3px_0px_white]">
                                <Gamepad2 className="h-6 w-6 stroke-[2.5] text-white" />
                            </div>
                            <span className="font-display text-2xl font-black text-white">
                                EduFun<span className="text-[#FF6584]">Hub</span>
                            </span>
                        </Link>

                        <p className="mt-4 max-w-sm text-sm font-semibold leading-relaxed text-white/70">
                            Portal pembelajaran online gamifikasi #1 di Indonesia. Mengubah materi pelajaran menjadi petualangan game seru agar siswa mengerti dengan tuntas tanpa rasa bosan. 100% Gratis selamanya!
                        </p>

                        <div className="mt-6 flex flex-wrap gap-2 text-xs font-bold text-white/80">
                            <span className="rounded-xl border border-white/20 bg-white/10 px-3 py-1">
                                🇮🇩 Karya Anak Bangsa
                            </span>
                            <span className="flex items-center gap-1.5 rounded-xl border border-white/20 bg-white/10 px-3 py-1">
                                <ShieldCheck className="h-4 w-4 text-[#00C9A7]" />
                                <span>Aman & Ramah Anak</span>
                            </span>
                        </div>
                    </div>

                    {/* Link columns */}
                    {Object.values(footerLinks).map((section) => (
                        <div key={section.title}>
                            <h3 className="font-display text-xs font-black uppercase tracking-wider text-[#FFF176]">
                                {section.title}
                            </h3>
                            <ul className="mt-4 space-y-2.5">
                                {section.links.map((link) => (
                                    <li key={link.label}>
                                        <a
                                            href={link.href}
                                            className="text-xs font-bold text-white/60 transition-colors hover:text-[#00C9A7]"
                                        >
                                            {link.label}
                                        </a>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>

                {/* Bottom Bar */}
                <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-8 text-xs font-bold text-white/60 sm:flex-row">
                    <p>
                        © {new Date().getFullYear()} EduFunHub Indonesia. Dikembangkan oleh{' '}
                        <span className="font-black text-[#FFF176]">fatwarachman</span>. Seluruh hak cipta dilindungi.
                    </p>
                    <p className="flex items-center gap-1 text-[#00C9A7]">
                        <span>Dibuat dengan</span>
                        <Heart className="h-3.5 w-3.5 fill-[#FF6584] text-[#FF6584]" />
                        <span>oleh <span className="font-bold text-white">fatwarachman</span> untuk kemajuan pendidikan Indonesia</span>
                    </p>
                </div>
            </div>
        </footer>
    );
}