import {
    Heart,
    Star,
} from 'lucide-react';

export function LandingTestimonials() {
    const stories = [
        {
            quote:
                'Anak saya yang tadinya malas belajar IPA dan matematika, sekarang malah tiap pulang sekolah langsung login EduFunHub. Dia bangga banget bisa bawa nama kelompok belajarnya masuk peringkat atas!',
            author: 'Ibu Ratna Dewi',
            role: 'Orang Tua Siswa Tingkat Dasar',
            initials: 'RD',
            avatarBg: 'bg-[#FF9E44]',
            rating: 5,
            tag: 'Orang Tua Siswa',
            badgeColor: 'bg-[#FF9E44]',
        },
        {
            quote:
                'Fitur ruang kelas dan pembuatan soalnya luar biasa praktis. Saya bisa bikin turnamen kuis interaktif fisika dengan format battle royale dan kuis kilat. Semua siswa aktif dan sangat antusias!',
            author: 'Bapak Hendra Wijaya, M.Pd',
            role: 'Guru Sains & Fisika Menengah',
            initials: 'HW',
            avatarBg: 'bg-[#845EC2]',
            rating: 5,
            tag: 'Guru Pengajar',
            badgeColor: 'bg-[#845EC2]',
        },
        {
            quote:
                'Kuis level perguruan tingginya menantang banget, terutama kalkulus dan logika komputasi. Main bareng teman seangkatan buat nambah poin tim di leaderboard nasional seru abis!',
            author: 'Dimas Wicaksono',
            role: 'Mahasiswa Teknik Informatika',
            initials: 'DW',
            avatarBg: 'bg-[#00C9A7]',
            rating: 5,
            tag: 'Mahasiswa',
            badgeColor: 'bg-[#00C9A7]',
        },
    ];

    return (
        <section id="testimonials" className="border-t-4 border-[#1f2a44] bg-[#FFF9E6] py-20 lg:py-28">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                {/* Section Header */}
                <div className="mx-auto max-w-3xl text-center">
                    <div className="inline-flex items-center gap-2 rounded-full border-3 border-[#1f2a44] bg-[#FF6584] px-4 py-1 text-xs font-black uppercase tracking-wider text-white shadow-[3px_3px_0px_#1f2a44]">
                        <Heart className="h-4 w-4" />
                        Kisah Sukses Komunitas
                    </div>
                    <h2 className="mt-4 font-display text-3xl font-black text-[#1f2a44] sm:text-5xl">
                        Cerita Mereka yang Belajar Jadi{' '}
                        <span className="text-[#845EC2]">Lebih Menyenangkan</span>
                    </h2>
                    <p className="mt-4 text-base font-bold text-slate-600 sm:text-lg">
                        Dipercaya oleh puluhan ribu pelajar, mahasiswa, dan ribuan pengajar di seluruh nusantara.
                    </p>
                </div>

                {/* Testimonial Cards */}
                <div className="mt-12 grid gap-6 md:grid-cols-3">
                    {stories.map((item, index) => (
                        <div
                            key={index}
                            className="flex flex-col justify-between rounded-3xl border-3 border-[#1f2a44] bg-white p-6 shadow-[5px_5px_0px_#1f2a44] transition-all hover:-translate-y-1"
                        >
                            <div>
                                <div className="flex items-center justify-between">
                                    <div className="flex gap-1">
                                        {Array.from({ length: item.rating }).map((_, i) => (
                                            <Star
                                                key={i}
                                                className="h-4 w-4 fill-[#FFF176] text-[#FF9E44]"
                                            />
                                        ))}
                                    </div>
                                    <span
                                        className={`rounded-full border border-[#1f2a44] px-2.5 py-0.5 text-[10px] font-black text-white ${item.badgeColor}`}
                                    >
                                        {item.tag}
                                    </span>
                                </div>

                                <blockquote className="mt-4 text-sm font-semibold leading-relaxed text-slate-700">
                                    "{item.quote}"
                                </blockquote>
                            </div>

                            <div className="mt-6 flex items-center gap-3 border-t-2 border-slate-100 pt-4">
                                {/* Clean Geometric Monogram Avatar */}
                                <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border-2 border-[#1f2a44] ${item.avatarBg} font-display text-sm font-black text-white shadow-[2px_2px_0px_#1f2a44]`}>
                                    {item.initials}
                                </div>
                                <div>
                                    <div className="font-display text-sm font-black text-[#1f2a44]">
                                        {item.author}
                                    </div>
                                    <div className="text-xs font-bold text-slate-500">
                                        {item.role}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}