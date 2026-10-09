<?php

/*
|--------------------------------------------------------------------------
| EduFunHub changelog (source of truth)
|--------------------------------------------------------------------------
|
| Every change shipped to the app is recorded here, newest release first,
| and loaded into the admin changelog page by `php artisan changelog:sync`
| (the container entrypoint runs it on every boot).
|
| Versions follow Semantic Versioning 2.0.0 (https://semver.org), starting
| at 0.0.0. While the major version is 0:
|   - MINOR (0.x.0) for new features or behaviour changes,
|   - PATCH (0.0.x) for fixes and small UI tweaks.
| Bump MAJOR (1.0.0) only for the first stable public release or for
| breaking changes after it.
|
| Change types: feature (Fitur baru), improvement (Peningkatan),
| fix (Perbaikan). Each change needs a unique `key` within its release and
| Indonesian (`id`) plus English (`en`) copy.
|
*/

return [
    [
        'version' => '0.3.1',
        'date' => '2026-10-09',
        'changes' => [
            [
                'key' => 'development-guidelines',
                'type' => 'improvement',
                'title' => [
                    'id' => 'Panduan desain dan teknis untuk semua pengembang',
                    'en' => 'Design and technical guidelines for every developer',
                ],
                'body' => [
                    'id' => 'Panduan baru di docs/guidelines menyatukan cara membuat game, fitur, gaya tampilan, dan menu: palet warna, tipografi, komponen bersama, resep game Go + Laravel + React, registrasi menu, terjemahan, serta langkah uji dan changelog. Semua pengembang dan agen AI memakai gaya yang sama sehingga tampilan dan perilaku aplikasi tetap konsisten.',
                    'en' => 'New guidelines in docs/guidelines unify how games, features, styles, and menus are built: colour palette, typography, shared components, the Go + Laravel + React game recipe, menu registration, translations, and test and changelog steps. Every developer and AI agent follows the same style, so the app keeps a consistent look and behaviour.',
                ],
            ],
        ],
    ],
    [
        'version' => '0.3.0',
        'date' => '2026-10-09',
        'changes' => [
            [
                'key' => 'main-ular-game',
                'type' => 'feature',
                'title' => [
                    'id' => 'Game baru: Main Ular (kuis potong ekor)',
                    'en' => 'New game: Main Ular (tail-cut quiz)',
                ],
                'body' => [
                    'id' => 'Ular mulai dengan ekor 15 ruas; pilihan jawaban A–D tersebar sebagai makanan. Jawaban benar memotong 3 ruas, salah atau waktu habis menambah 4 ruas, ekor habis berarti menang. Main sendiri atau undang sampai 3 teman lewat PIN/link, dengan mode Satu Arena (berebut soal yang sama) atau Arena Terpisah (soal sendiri dan serangan beban ke lawan). Wasit permainan berjalan di server Go, poin dicatat otomatis, dan tersedia tutorial interaktif, video, serta slide.',
                    'en' => 'Snakes start with a 15-segment tail; answer options A–D lie on the grid as food. A correct answer cuts 3 segments, a wrong one or a timeout adds 4, and clearing the tail wins. Play alone or invite up to 3 friends by PIN/link, in Shared Arena (race for the same question) or Split Arenas (own questions and junk attacks on opponents). The Go game server referees every move, points are recorded automatically, and an interactive tutorial, video and slides are included.',
                ],
            ],
        ],
    ],
    [
        'version' => '0.2.2',
        'date' => '2026-10-09',
        'changes' => [
            [
                'key' => 'repeated-question-reshuffle',
                'type' => 'improvement',
                'title' => [
                    'id' => 'Soal yang muncul ulang memakai urutan jawaban baru',
                    'en' => 'Repeated questions get a new answer order',
                ],
                'body' => [
                    'id' => 'Jika bank soal masih sedikit dan sebuah soal muncul lebih dari sekali dalam satu permainan, urutan pilihan jawabannya diacak ulang: jawaban benar dipindah ke posisi yang belum pernah dipakai (minimal tidak di posisi sebelumnya), sehingga pemain tidak bisa sekadar menghafal posisi.',
                    'en' => 'When the question bank is still small and a question appears more than once in one game, its options are reshuffled: the correct answer moves to a position not used before (at least never its previous one), so players cannot just memorise the position.',
                ],
            ],
        ],
    ],
    [
        'version' => '0.2.1',
        'date' => '2026-10-09',
        'changes' => [
            [
                'key' => 'changelog-summary-cards',
                'type' => 'improvement',
                'title' => [
                    'id' => 'Kartu ringkasan Changelog lebih rapi',
                    'en' => 'Tidier Changelog summary cards',
                ],
                'body' => [
                    'id' => 'Kartu ringkasan Changelog kini bergaya sama dengan kartu KPI dashboard (ikon berwarna lembut, angka besar, bar porsi) dan sekaligus menjadi filter jenis perubahan.',
                    'en' => 'The Changelog summary cards now match the dashboard KPI cards (soft tinted icons, large figures, share bar) and double as the change-type filter.',
                ],
            ],
        ],
    ],
    [
        'version' => '0.2.0',
        'date' => '2026-10-09',
        'changes' => [
            [
                'key' => 'admin-changelog-page',
                'type' => 'feature',
                'title' => [
                    'id' => 'Halaman Changelog di dashboard admin',
                    'en' => 'Changelog page in the admin dashboard',
                ],
                'body' => [
                    'id' => 'Menu baru Changelog mencatat setiap perubahan aplikasi per versi (Semantic Versioning, mulai 0.0.0). Super admin juga dapat menambah catatan manual.',
                    'en' => 'A new Changelog menu records every app change per version (Semantic Versioning, starting at 0.0.0). Super admins can also add manual notes.',
                ],
            ],
        ],
    ],
    [
        'version' => '0.1.0',
        'date' => '2026-10-09',
        'changes' => [
            [
                'key' => 'monster-cafe-long-durations',
                'type' => 'feature',
                'title' => [
                    'id' => 'Monster Café: durasi 10 dan 15 menit',
                    'en' => 'Monster Café: 10 and 15 minute games',
                ],
                'body' => [
                    'id' => 'Host kelas dan mode solo kini dapat memilih lama permainan 3, 5, 7, 10, atau 15 menit.',
                    'en' => 'Classroom hosts and solo mode can now pick a game length of 3, 5, 7, 10 or 15 minutes.',
                ],
            ],
        ],
    ],
    [
        'version' => '0.0.2',
        'date' => '2026-10-09',
        'changes' => [
            [
                'key' => 'header-clock-left-aligned',
                'type' => 'improvement',
                'title' => [
                    'id' => 'Jam di header rata kiri',
                    'en' => 'Header clock left-aligned',
                ],
                'body' => [
                    'id' => 'Jam dan tanggal di badge waktu header kini rata kiri di semua halaman dan header game.',
                    'en' => 'The time and date in the header clock badge are now left-aligned on every page and game header.',
                ],
            ],
        ],
    ],
    [
        'version' => '0.0.1',
        'date' => '2026-10-09',
        'changes' => [
            [
                'key' => 'crossword-dashboard-stats',
                'type' => 'fix',
                'title' => [
                    'id' => 'Statistik Crossword tampil di dashboard admin',
                    'en' => 'Crossword statistics shown on the admin dashboard',
                ],
                'body' => [
                    'id' => 'Crossword, Port Sorter, dan Order Rush tidak lagi berlabel "Demo · tidak dilacak": hasilnya dilaporkan server game, jadi jumlah pemain, permainan, dan tingkat keberhasilan kini tampil.',
                    'en' => 'Crossword, Port Sorter and Order Rush are no longer labelled "Demo · not tracked": the game server reports their results, so players, plays and success rate now show.',
                ],
            ],
            [
                'key' => 'admin-brand-logo',
                'type' => 'improvement',
                'title' => [
                    'id' => 'Logo EduFunHub di sidebar admin',
                    'en' => 'EduFunHub logo in the admin sidebar',
                ],
                'body' => [
                    'id' => 'Ikon bawaan template di sidebar admin diganti logo resmi EduFunHub.',
                    'en' => 'The starter template icon in the admin sidebar is replaced by the official EduFunHub logo.',
                ],
            ],
        ],
    ],
    [
        'version' => '0.0.0',
        'date' => '2026-10-09',
        'changes' => [
            [
                'key' => 'baseline',
                'type' => 'feature',
                'title' => [
                    'id' => 'Versi awal pencatatan',
                    'en' => 'Changelog baseline',
                ],
                'body' => [
                    'id' => 'Titik awal versi EduFunHub: portal pemain, dashboard admin, bank soal, dan seluruh game yang sudah berjalan sampai 9 Oktober 2026.',
                    'en' => 'Starting point of EduFunHub versioning: the player portal, admin dashboard, question bank and every game live as of 9 October 2026.',
                ],
            ],
        ],
    ],
];
