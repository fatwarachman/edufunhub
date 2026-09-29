import { ChevronDown, HelpCircle } from 'lucide-react';
import { useState } from 'react';

export function LandingFaq() {
    const [openIndex, setOpenIndex] = useState<number | null>(0);

    const faqs = [
        {
            question: 'Apa itu EduFunHub dan bagaimana cara kerjanya?',
            answer:
                'EduFunHub adalah portal pembelajaran online berbasis gamifikasi interaktif. Materi pelajaran disajikan dalam bentuk gameplay seperti Kuis Kilat Cepat, Duel 1 vs 1, Misi Tim Kolaboratif, Board Game, Arcade, dan Petualangan 3D. Setiap jawaban benar menghasilkan poin yang langsung terakumulasi ke akunmu.',
        },
        {
            question: 'Bagaimana fungsi poin akumulasi dan item shop?',
            answer:
                'Setiap poin yang kamu peroleh dari seluruh tantangan, kuis kilat, dan duel otomatis terakumulasi. Poin ini digunakan di Item Shop untuk mendandani karakter avatar 3D-mu (kostum mecha, sayap aura, topi, aksesori) dan membeli booster tantangan.',
        },
        {
            question: 'Apakah peserta bisa saling berkenalan dan duel?',
            answer:
                'Tentu saja! Kamu dapat menemukan teman baru sesama pelajar dari berbagai daerah, saling menambahkan daftar teman, mengirim pesan ramah, dan langsung menantang duel 1 vs 1 secara real-time untuk menguji penguasaan materi pelajaran.',
        },
        {
            question: 'Bisakah saya membentuk tim bersama peserta dari sekolah lain?',
            answer:
                'Bisa banget! EduFunHub mendukung mode Co-Op Squad lintas sekolah. Kamu bebas mengundang sahabat dari sekolah atau kampus mana pun untuk membentuk satu regu dan bersama-sama menaklukkan quest atau turnamen akbar.',
        },
        {
            question: 'Apakah ada kuis interaktif cepat (fast-paced)?',
            answer:
                'Ya! Tersedia mode Kuis Interaktif Kilat dengan durasi hitungan detik per soal, diiringi audio dinamis dan live scoreboard real-time. Mode ini sangat memacu adrenalin dan mengasah ketangkasan berpikir cepat.',
        },
        {
            question: 'Apakah EduFunHub benar-benar 100% gratis & no pay-to-win?',
            answer:
                '100% gratis tanpa biaya tersembunyi! Tidak ada sistem pay-to-win. Kemenangan dan peringkat di leaderboard nasional murni ditentukan oleh ketekunan belajar dan ketepatan menjawab soal.',
        },
        {
            question: 'Bagaimana cara guru mendapatkan penghasilan tambahan?',
            answer:
                'Guru dan dosen dapat merancang paket soal kreatif dan berkualitas di Quiz Studio. Setiap kali paket soal dimainkan dan diapresiasi oleh ribuan pelajar, pembuat soal akan menerima royalti koin dan insentif finansial yang dapat dicairkan secara transparan.',
        },
    ];

    return (
        <section id="faq" className="bg-white py-20 lg:py-28">
            <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
                {/* Section Header */}
                <div className="text-center">
                    <div className="inline-flex items-center gap-2 rounded-full border-3 border-[#1f2a44] bg-[#FFF176] px-4 py-1 text-xs font-black uppercase tracking-wider text-[#1f2a44] shadow-[3px_3px_0px_#1f2a44]">
                        <HelpCircle className="h-4 w-4" />
                        Tanya Jawab Seputar EduFunHub
                    </div>
                    <h2 className="mt-4 font-display text-3xl font-black text-[#1f2a44] sm:text-5xl">
                        Pertanyaan yang Sering{' '}
                        <span className="text-[#FF9E44]">Diajukan</span>
                    </h2>
                    <p className="mt-4 text-base font-bold text-slate-600 sm:text-lg">
                        Punya pertanyaan lain? Tim EduFunHub dan komunitas pengajar kami siap membantu kapan saja.
                    </p>
                </div>

                {/* FAQ Accordion with Smooth Grid Animation */}
                <div className="mt-12 space-y-4">
                    {faqs.map((faq, index) => {
                        const isOpen = openIndex === index;
                        return (
                            <div
                                key={index}
                                className={`overflow-hidden rounded-2xl border-3 border-[#1f2a44] transition-all duration-300 ease-out ${
                                    isOpen
                                        ? 'bg-[#FFF9E6] shadow-[5px_5px_0px_#1f2a44]'
                                        : 'bg-white shadow-[3px_3px_0px_#1f2a44] hover:shadow-[4px_4px_0px_#1f2a44]'
                                }`}
                            >
                                <button
                                    type="button"
                                    onClick={() =>
                                        setOpenIndex(isOpen ? null : index)
                                    }
                                    className="flex w-full items-center justify-between p-5 text-left font-display text-base font-black text-[#1f2a44] sm:text-lg cursor-pointer select-none"
                                >
                                    <span className="pr-4">{faq.question}</span>
                                    <div
                                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border-2 border-[#1f2a44] bg-white transition-all duration-300 ease-out ${
                                            isOpen
                                                ? 'rotate-180 bg-[#FF9E44] text-white shadow-[1px_1px_0px_#1f2a44]'
                                                : 'text-[#1f2a44]'
                                        }`}
                                    >
                                        <ChevronDown className="h-5 w-5" />
                                    </div>
                                </button>
                                <div
                                    className={`grid transition-all duration-300 ease-in-out ${
                                        isOpen
                                            ? 'grid-rows-[1fr] opacity-100'
                                            : 'grid-rows-[0fr] opacity-0'
                                    }`}
                                >
                                    <div className="overflow-hidden">
                                        <div className="border-t-2 border-[#1f2a44]/15 px-5 pb-5 pt-3">
                                            <p className="text-sm font-semibold leading-relaxed text-slate-700 sm:text-base">
                                                {faq.answer}
                                            </p>
                                        </div>
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