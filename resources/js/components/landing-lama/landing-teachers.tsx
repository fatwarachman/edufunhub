import { Button } from '@/components/ui/button';
import { register } from '@/routes';
import { Link } from '@inertiajs/react';
import {
    Award,
    Banknote,
    CheckCircle2,
    GraduationCap,
    PenTool,
    Sparkles,
    Video,
} from 'lucide-react';

export function LandingTeachers() {
    const teacherPerks = [
        {
            icon: Banknote,
            title: 'Monetisasi Soal & Penghasilan Tambahan',
            desc: 'Guru dan dosen mendapatkan insentif finansial & royalti koin nyata dari setiap paket soal kreatif berbobot yang dimainkan dan diapresiasi ribuan siswa.',
            color: 'bg-[#00C9A7]',
        },
        {
            icon: PenTool,
            title: 'Quiz Studio Kreatif & Soal Cepat',
            desc: 'Rancang kuis interaktif multimedia, teka-teki logika, hingga sesi kuis cepat kompetitif dengan timer presisi dan live scoreboard dinamis.',
            color: 'bg-[#FF9E44]',
        },
        {
            icon: Video,
            title: 'Ruang Kelas Live Interaktif',
            desc: 'Sesi tatap muka virtual langsung di portal! Guru memimpin room kuis bersama puluhan murid sekaligus dengan kode PIN instan.',
            color: 'bg-[#845EC2]',
        },
        {
            icon: Award,
            title: 'Apresiasi & Reputasi Pengajar',
            desc: 'Dapatkan lencana resmi "Master Educator" dan bangun portofolio materi pengajaran digital berskala nasional di hadapan ratusan instansi.',
            color: 'bg-[#FF6584]',
        },
    ];

    return (
        <section
            id="teachers"
            data-gsap-section="teachers"
            className="bg-white py-20 lg:py-28"
        >
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                <div className="grid items-center gap-12 lg:grid-cols-12">
                    {/* Left Copy */}
                    <div className="lg:col-span-6">
                        <div className="inline-flex items-center gap-2 rounded-full border-3 border-[#1f2a44] bg-[#845EC2] px-4 py-1 text-xs font-black tracking-wider text-white uppercase shadow-[3px_3px_0px_#1f2a44]">
                            <GraduationCap className="h-4 w-4" />
                            Pemberdayaan Guru & Dosen
                        </div>

                        <h2 className="mt-5 font-display text-3xl font-black text-[#1f2a44] sm:text-5xl">
                            Ruang Kreatif &{' '}
                            <span className="text-[#00C9A7]">
                                Penghasilan Tambahan
                            </span>{' '}
                            Guru
                        </h2>

                        <p className="mt-4 text-base leading-relaxed font-bold text-slate-700 sm:text-lg">
                            EduFunHub bukan hanya arena bermain siswa, tapi juga
                            ekosistem pengajaran masa depan yang menghargai
                            karya intelektual pendidik. Guru dan dosen dapat
                            memonetisasi konten kuis kreatif, mengadakan kelas
                            interaktif langsung, dan mengumpulkan penghasilan
                            tambahan secara transparan.
                        </p>

                        <div className="mt-8 space-y-4">
                            {[
                                'Penghasilan tambahan dan royalti koin dari setiap soal kreatif yang dimainkan',
                                'Ruang kelas privat interaktif dengan PIN room khusus kelasmu',
                                'Kuis interaktif kilat live dengan leaderboard dan evaluasi real-time',
                                'Analitik perkembangan pemahaman materi akurat per individu siswa',
                            ].map((text, i) => (
                                <div
                                    key={i}
                                    className="flex items-center gap-3"
                                >
                                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-[#1f2a44] bg-[#00C9A7] shadow-[1.5px_1.5px_0px_#1f2a44]">
                                        <CheckCircle2 className="h-4 w-4 stroke-[3] text-[#1f2a44]" />
                                    </div>
                                    <span className="text-sm font-bold text-slate-700">
                                        {text}
                                    </span>
                                </div>
                            ))}
                        </div>

                        <div className="mt-10">
                            <Button
                                asChild
                                size="lg"
                                className="h-14 rounded-2xl border-3 border-[#1f2a44] bg-[#845EC2] px-8 font-display text-base font-black text-white shadow-[4px_4px_0px_#1f2a44] transition-all hover:-translate-y-1 hover:bg-[#724db3] hover:shadow-[6px_6px_0px_#1f2a44]"
                            >
                                <Link href={register()}>
                                    <Sparkles className="mr-2 h-5 w-5" />
                                    Daftar Sebagai Pengajar & Mulai Buat Soal
                                </Link>
                            </Button>
                        </div>
                    </div>

                    {/* Right Interactive Card Deck */}
                    <div className="lg:col-span-6">
                        <div className="rounded-3xl border-4 border-[#1f2a44] bg-[#FFF9E6] p-6 shadow-[8px_8px_0px_#1f2a44] sm:p-8">
                            <div className="flex items-center justify-between border-b-3 border-[#1f2a44] pb-4">
                                <div className="flex items-center gap-3">
                                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl border-2 border-[#1f2a44] bg-[#FFF176] shadow-[2px_2px_0px_#1f2a44]">
                                        <Banknote className="h-6 w-6 text-[#1f2a44]" />
                                    </div>
                                    <div>
                                        <div className="font-display text-lg font-black text-[#1f2a44]">
                                            Studio & Penghasilan Guru
                                        </div>
                                        <div className="text-xs font-bold text-slate-500">
                                            Kompensasi Karya & Fitur Interaktif
                                            Pengajar
                                        </div>
                                    </div>
                                </div>
                                <span className="rounded-full border-2 border-[#1f2a44] bg-[#00C9A7] px-3 py-0.5 text-xs font-black text-[#1f2a44]">
                                    Terbuka
                                </span>
                            </div>

                            <div className="mt-6 grid gap-4 sm:grid-cols-2">
                                {teacherPerks.map((perk, idx) => {
                                    const Icon = perk.icon;
                                    return (
                                        <div
                                            key={idx}
                                            data-gsap-stagger="teacher-card"
                                            className="flex flex-col justify-between rounded-2xl border-3 border-[#1f2a44] bg-white p-4 shadow-[3px_3px_0px_#1f2a44]"
                                        >
                                            <div>
                                                <div
                                                    className={`flex h-10 w-10 items-center justify-center rounded-xl border-2 border-[#1f2a44] ${perk.color} shadow-[2px_2px_0px_#1f2a44]`}
                                                >
                                                    <Icon className="h-5 w-5 text-white" />
                                                </div>
                                                <h4 className="mt-3 font-display text-sm font-black text-[#1f2a44]">
                                                    {perk.title}
                                                </h4>
                                                <p className="mt-1 text-xs leading-relaxed font-semibold text-slate-600">
                                                    {perk.desc}
                                                </p>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Simulated Classroom Interaction */}
                            <div className="mt-6 rounded-2xl border-2 border-[#1f2a44] bg-white p-4 shadow-[2px_2px_0px_#1f2a44]">
                                <div className="flex items-center gap-3">
                                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border-2 border-[#1f2a44] bg-[#FF9E44] font-display text-xs font-black text-white shadow-[1.5px_1.5px_0px_#1f2a44]">
                                        BA
                                    </div>
                                    <div className="flex-1">
                                        <div className="text-xs font-black text-[#1f2a44]">
                                            Bu Anita, S.Pd • Guru Fisika
                                        </div>
                                        <div className="text-[11px] font-bold text-slate-500">
                                            "Kuis Cepat Dinamika Gerak dibuka!
                                            Soal dimainkan 1.250 siswa — royalti
                                            reward masuk ke saldo."
                                        </div>
                                    </div>
                                    <div className="rounded-xl border border-[#1f2a44] bg-[#00C9A7]/20 px-2.5 py-1 text-[11px] font-black text-[#008f75]">
                                        +Rp 350.000
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}
