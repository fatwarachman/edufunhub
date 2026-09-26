import {
    LandingCta,
    LandingEconomy,
    LandingFaq,
    LandingFeatures,
    LandingFooter,
    LandingHeader,
    LandingHero,
    LandingLeaderboard,
    LandingPricing,
    LandingTeachers,
    LandingTestimonials,
} from '@/components/landing';
import { Head } from '@inertiajs/react';

export default function Welcome({
    canRegister = true,
}: {
    canRegister?: boolean;
}) {
    return (
        <>
            <Head title="EduFunHub - Belajar Asik, Gamifikasi Interaktif & Anti-Bosan!">
                <meta
                    name="description"
                    content="Portal pembelajaran online gamifikasi untuk semua jenjang TK hingga Universitas. Mainkan board game, arcade, petualangan 3D, kumpulkan koin avatar, dan menangkan leaderboard sekolahmu. 100% Gratis!"
                />
                <meta
                    name="keywords"
                    content="edufunhub, game edukasi, kuis interaktif, gamifikasi belajar, leaderboard sekolah, kuis online indonesia, belajar seru"
                />
                <meta
                    property="og:title"
                    content="EduFunHub - Belajar Jadi Game Seru & Penuh Prestasi"
                />
                <meta
                    property="og:description"
                    content="Taklukkan materi pelajaran dengan petualangan game seru! Dari TK sampai Universitas, main solo atau mabar online, 100% gratis selamanya."
                />
                <meta property="og:type" content="website" />
                <link rel="preconnect" href="https://fonts.googleapis.com" />
                <link
                    rel="preconnect"
                    href="https://fonts.gstatic.com"
                    crossOrigin="anonymous"
                />
                <link
                    href="https://fonts.googleapis.com/css2?family=Fredoka:wght@400;500;600;700&family=Quicksand:wght@500;600;700;800&display=swap"
                    rel="stylesheet"
                />
            </Head>

            <div className="min-h-screen bg-[#FFF9E6] text-slate-800 selection:bg-[#FF6584] selection:text-white">
                <LandingHeader canRegister={canRegister} />
                <main>
                    <LandingHero />
                    <LandingFeatures />
                    <LandingLeaderboard />
                    <LandingEconomy />
                    <LandingTeachers />
                    <LandingPricing />
                    <LandingTestimonials />
                    <LandingFaq />
                    <LandingCta />
                </main>
                <LandingFooter />
            </div>
        </>
    );
}
