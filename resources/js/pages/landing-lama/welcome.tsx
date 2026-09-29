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
import { useGSAP } from '@gsap/react';
import { Head } from '@inertiajs/react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useRef } from 'react';

gsap.registerPlugin(ScrollTrigger, useGSAP);

export default function Welcome({
    canRegister = true,
}: {
    canRegister?: boolean;
}) {
    const landingRef = useRef<HTMLDivElement>(null);

    useGSAP(
        () => {
            const media = gsap.matchMedia();

            media.add(
                {
                    reduceMotion: '(prefers-reduced-motion: reduce)',
                    desktop: '(min-width: 1024px)',
                },
                ({ conditions }) => {
                    if (conditions?.reduceMotion) {
                        return;
                    }

                    const sections = gsap.utils.toArray<HTMLElement>(
                        '[data-gsap-section], [data-gsap-footer]',
                        landingRef.current as HTMLElement,
                    );

                    sections.forEach((section, index) => {
                        gsap.fromTo(
                            section,
                            {
                                autoAlpha: 0,
                                y: conditions?.desktop ? 36 : 20,
                            },
                            {
                                autoAlpha: 1,
                                y: 0,
                                duration: conditions?.desktop ? 0.85 : 0.7,
                                delay: index === 0 ? 0.1 : 0,
                                ease: 'power3.out',
                                overwrite: 'auto',
                                scrollTrigger: {
                                    trigger: section,
                                    start: index === 0 ? 'top 92%' : 'top 86%',
                                    once: true,
                                },
                            },
                        );
                    });

                    const staggerItems = gsap.utils.toArray<HTMLElement>(
                        '[data-gsap-stagger]',
                        landingRef.current as HTMLElement,
                    );

                    ScrollTrigger.batch(staggerItems, {
                        start: 'top 86%',
                        once: true,
                        interval: 0.08,
                        batchMax: conditions?.desktop ? 6 : 3,
                        onEnter: (items) => {
                            gsap.from(items, {
                                autoAlpha: 0,
                                y: conditions?.desktop ? 24 : 14,
                                scale: 0.98,
                                duration: 0.6,
                                ease: 'power3.out',
                                stagger: 0.08,
                                overwrite: true,
                            });
                        },
                    });

                    const heroTimeline = gsap.timeline({
                        defaults: { ease: 'power3.out' },
                    });

                    heroTimeline
                        .from('[data-gsap-hero-pill]', {
                            autoAlpha: 0,
                            y: -18,
                            duration: 0.55,
                        })
                        .from(
                            '[data-gsap-hero-title]',
                            {
                                autoAlpha: 0,
                                y: 28,
                                scale: 0.97,
                                duration: 0.8,
                            },
                            '-=0.2',
                        )
                        .from(
                            '[data-gsap-hero-copy]',
                            { autoAlpha: 0, y: 20, duration: 0.55 },
                            '-=0.4',
                        )
                        .from(
                            '[data-gsap-hero-badges] > *',
                            {
                                autoAlpha: 0,
                                y: 12,
                                duration: 0.4,
                                stagger: 0.08,
                            },
                            '-=0.25',
                        )
                        .from(
                            '[data-gsap-hero-ctas] > *',
                            {
                                autoAlpha: 0,
                                y: 16,
                                duration: 0.45,
                                stagger: 0.12,
                            },
                            '-=0.18',
                        )
                        .from(
                            '[data-gsap-hero-trust]',
                            { autoAlpha: 0, y: 12, duration: 0.4 },
                            '-=0.2',
                        )
                        .from(
                            '[data-gsap-hero-preview]',
                            {
                                autoAlpha: 0,
                                y: conditions?.desktop ? 34 : 22,
                                duration: 0.8,
                            },
                            '-=0.1',
                        );

                    gsap.to('[data-gsap-hero-bg]', {
                        y: (index) => (index + 1) * -18,
                        duration: 3.5,
                        ease: 'sine.inOut',
                        repeat: -1,
                        yoyo: true,
                        stagger: 0.35,
                    });

                    if (conditions?.desktop) {
                        gsap.to('[data-gsap-hero-ornament]', {
                            y: (index) => (index % 2 === 0 ? -18 : 18),
                            rotation: (index) => (index % 2 === 0 ? 4 : -4),
                            duration: 2.8,
                            ease: 'sine.inOut',
                            repeat: -1,
                            yoyo: true,
                            stagger: 0.25,
                        });

                        gsap.to('[data-gsap-hero-preview]', {
                            yPercent: -3,
                            ease: 'none',
                            scrollTrigger: {
                                trigger: '[data-gsap-hero-preview]',
                                start: 'top bottom',
                                end: 'bottom top',
                                scrub: 1,
                            },
                        });
                    }
                },
                landingRef,
            );

            return () => media.revert();
        },
        { scope: landingRef },
    );

    return (
        <div ref={landingRef}>
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
        </div>
    );
}
