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
        'version' => '0.17.0',
        'date' => '2026-10-10',
        'changes' => [
            [
                'key' => 'admin-hottest-games',
                'type' => 'feature',
                'title' => [
                    'id' => 'Halaman Game Terpopuler Hari Ini di admin',
                    'en' => 'Hottest Games Today page in the admin panel',
                ],
                'body' => [
                    'id' => 'Menu baru Analitik > Game terpopuler menampilkan peringkat game hari ini (zona waktu Asia/Jakarta): jumlah dimainkan, jumlah pemain, akurasi, durasi rata-rata, dan jam terakhir dimainkan, plus 3 game teratas untuk 14 hari sebelumnya. Tanggal bisa dipilih atau digeser per hari. Klik game untuk membuka detail game itu pada hari tersebut: grafik per jam, daftar pemain, sekolah, dan setiap permainan yang bisa dibuka sampai soalnya. Dasbor admin juga punya tautan "Terpopuler hari ini".',
                    'en' => 'A new Analytics > Hottest games menu ranks today\'s games (Asia/Jakarta time): plays, players, accuracy, average duration and last played time, plus the top 3 games of each of the 14 previous days. Pick any day or step day by day. Click a game to open its detail for that day: plays per hour, players, schools and every play, down to its questions. The admin dashboard links to it with "Hottest today".',
                ],
            ],
        ],
    ],
    [
        'version' => '0.16.0',
        'date' => '2026-10-10',
        'changes' => [
            [
                'key' => 'admin-users-search-fields',
                'type' => 'feature',
                'title' => [
                    'id' => 'Cari pengguna berdasarkan nama, sekolah, email, atau nomor telepon',
                    'en' => 'Search users by name, school, email or phone number',
                ],
                'body' => [
                    'id' => 'Halaman Pengguna di admin kini punya pilihan "Cari berdasarkan": semua kolom, nama (termasuk nama panggilan pemain), sekolah, email, atau nomor telepon. Nomor bisa diketik dengan format 0812…, +62 812-…, atau 62812…, dan nomor WhatsApp pengguna tampil di bawah email.',
                    'en' => 'The admin Users page now has a "Search by" option: all fields, name (including the player nickname), school, email or phone number. Numbers can be typed as 0812…, +62 812-… or 62812…, and the user WhatsApp number is shown under the email.',
                ],
            ],
        ],
    ],
    [
        'version' => '0.15.1',
        'date' => '2026-10-10',
        'changes' => [
            [
                'key' => 'gamelist-header-mobile-two-lines',
                'type' => 'improvement',
                'title' => [
                    'id' => 'Judul Arena Game rapi di HP',
                    'en' => 'Tidier Arena Game title on phones',
                ],
                'body' => [
                    'id' => 'Di HP, judul "Arena Game" dan "EduFunHub" pada halaman daftar game kini tampil dalam dua baris dengan huruf lebih kecil, sehingga terbaca utuh tanpa terpotong. Tampilan tablet dan desktop tidak berubah.',
                    'en' => 'On phones, the "Arena Game" and "EduFunHub" title on the game list now shows on two lines in a smaller size, so it is read in full without being cut off. Tablet and desktop layouts are unchanged.',
                ],
            ],
        ],
    ],
    [
        'version' => '0.15.0',
        'date' => '2026-10-10',
        'changes' => [
            [
                'key' => 'tkj-game-flag',
                'type' => 'feature',
                'title' => [
                    'id' => 'Tanda TKJ pada game jaringan',
                    'en' => 'TKJ flag on networking games',
                ],
                'body' => [
                    'id' => 'Order Rush dan Pilah Port & Protokol kini ditandai lencana TKJ di daftar game, menu game, dan portal. Daftar game punya filter baru "Edisi TKJ" untuk menampilkan semua game Teknik Komputer dan Jaringan sekaligus.',
                    'en' => 'Order Rush and Port Sorter now carry a TKJ badge in the game list, the game menu and the portal. The game list has a new "TKJ edition" filter that shows every computer and network engineering game at once.',
                ],
            ],
            [
                'key' => 'tkj-visual-questions',
                'type' => 'feature',
                'title' => [
                    'id' => '18 soal TKJ bergambar',
                    'en' => '18 illustrated TKJ questions',
                ],
                'body' => [
                    'id' => 'Mata pelajaran baru TKJ untuk kelas 10–12 dengan 18 soal bervisual: susunan kabel UTP T568A/T568B dan core fiber, diagram topologi (star, bus, ring, mesh, tree), serta tampilan terminal (ping, ipconfig, tracert, nslookup, MikroTik). Soal dibagikan ke semua game kuis.',
                    'en' => 'A new TKJ subject for grades 10–12 with 18 illustrated questions: UTP T568A/T568B wiring and fibre cores, topology diagrams (star, bus, ring, mesh, tree) and console output (ping, ipconfig, tracert, nslookup, MikroTik). The questions go to every quiz game.',
                ],
            ],
            [
                'key' => 'question-visual-editor',
                'type' => 'feature',
                'title' => [
                    'id' => 'Buat soal bergambar di Bank Soal',
                    'en' => 'Create illustrated questions in the Question Bank',
                ],
                'body' => [
                    'id' => 'Form soal admin punya bagian Visual: unggah gambar (JPG/PNG/WEBP), atau susun kabel dengan templat T568A/T568B/fiber, pilih topologi, atau tulis keluaran terminal, lengkap dengan pratinjau persis seperti di game. Visual tampil di atas soal pada semua game kuis, dan layanan game Go meneruskannya tanpa membocorkan kunci jawaban.',
                    'en' => 'The admin question form has a Visual section: upload a picture (JPG/PNG/WEBP), or build a cable with T568A/T568B/fibre presets, pick a topology or write console output, with a preview identical to the game. Visuals appear above the question in every quiz game, and the Go game service passes them on without leaking the answer.',
                ],
            ],
        ],
    ],
    [
        'version' => '0.14.1',
        'date' => '2026-10-10',
        'changes' => [
            [
                'key' => 'gamelist-remove-pin-join',
                'type' => 'improvement',
                'title' => [
                    'id' => 'Kartu masuk dengan PIN dihapus dari daftar game',
                    'en' => 'PIN join card removed from the game list',
                ],
                'body' => [
                    'id' => 'Halaman daftar game tidak lagi menampilkan kartu masuk permainan dengan PIN agar pemain baru tidak bingung dan bisa langsung memilih game untuk main sendiri. Masuk dengan PIN tetap tersedia lewat tombol di menu navigasi.',
                    'en' => 'The game list no longer shows the join-by-PIN card so new players are not confused and can pick a game to play solo right away. Joining by PIN is still available from the navigation menu button.',
                ],
            ],
        ],
    ],
    [
        'version' => '0.14.0',
        'date' => '2026-10-10',
        'changes' => [
            [
                'key' => 'wizard-birth-date-mobile',
                'type' => 'fix',
                'title' => [
                    'id' => 'Tanggal lahir di wizard bisa diisi di HP',
                    'en' => 'Birth date in the wizard works on phones',
                ],
                'body' => [
                    'id' => 'Kolom tanggal lahir di wizard login pertama, kartu data pemain, dan profil kini memakai pilihan Tanggal, Bulan, dan Tahun, sehingga bisa diisi di semua HP tanpa bergantung pada kalender bawaan browser.',
                    'en' => 'The birth date field in the first-login wizard, the player details card and the profile now uses Day, Month and Year pickers, so it can be filled on every phone without relying on the browser date picker.',
                ],
            ],
            [
                'key' => 'modals-centered',
                'type' => 'improvement',
                'title' => [
                    'id' => 'Semua modal tampil di tengah layar',
                    'en' => 'All modals open in the centre of the screen',
                ],
                'body' => [
                    'id' => 'Modal seperti ucapan selamat di akhir permainan, wizard profil, gabung dengan PIN, kontrol host, chat, dan papan peringkat kini tampil di tengah layar juga di HP, dengan isi yang bisa digulir bila panjang.',
                    'en' => 'Modals such as the end-of-game congratulations, the profile wizard, join by PIN, host controls, chat and the leaderboard now open in the centre of the screen on phones too, with scrollable content when long.',
                ],
            ],
            [
                'key' => 'admin-player-details-before-wizard',
                'type' => 'feature',
                'title' => [
                    'id' => 'Admin bisa mengatur sekolah, kelas, dan tanggal lahir pengguna',
                    'en' => 'Admins can set a user\'s school, grade and birth date',
                ],
                'body' => [
                    'id' => 'Super admin bisa mengisi kelas, sekolah, dan tanggal lahir dari halaman detail pengguna, meski pengguna belum menjalankan wizard atau belum punya profil pelajar. Data ini otomatis terisi di wizard pengguna, dan setiap perubahan tercatat di log aktivitas.',
                    'en' => 'Super admins can fill in the grade, school and birth date from the user detail page, even before the user has run the wizard or has a learner profile. The data prefills the user\'s wizard, and every change is recorded in the activity log.',
                ],
            ],
            [
                'key' => 'device-usage-games-page',
                'type' => 'feature',
                'title' => [
                    'id' => 'Halaman lengkap perangkat per game',
                    'en' => 'Full device usage per game page',
                ],
                'body' => [
                    'id' => 'Panel Per game & browser di dasbor admin kini menampilkan 5 game teratas dengan tombol Lihat semua, yang membuka halaman berisi semua game beserta pembagian perangkat dan browser masing-masing.',
                    'en' => 'The Per game & browser panel on the admin dashboard now shows the top 5 games with a See all button that opens a page listing every game with its device and browser split.',
                ],
            ],
            [
                'key' => 'landing-start-only',
                'type' => 'improvement',
                'title' => [
                    'id' => 'Masuk dan daftar lewat tombol Mulai Main',
                    'en' => 'Sign in and sign up through the Start playing button',
                ],
                'body' => [
                    'id' => 'Tombol Masuk dihapus dari header dan menu HP di landing page. Pengguna masuk atau mendaftar cukup lewat tombol Mulai Main.',
                    'en' => 'The Sign in button was removed from the landing page header and phone menu. Users sign in or sign up through the Start playing button.',
                ],
            ],
            [
                'key' => 'email-registration-toggle',
                'type' => 'feature',
                'title' => [
                    'id' => 'Pendaftaran dengan email bisa diaktifkan',
                    'en' => 'Email sign-up can be turned on',
                ],
                'body' => [
                    'id' => 'Super admin bisa mengaktifkan pendaftaran dengan email dan kata sandi di Pengaturan, tab Registration (nonaktif secara bawaan). Saat aktif, halaman daftar menampilkan formulir email di samping Google, dan akun baru langsung diarahkan ke wizard profil.',
                    'en' => 'Super admins can turn on email and password sign-up in Settings, Registration tab (off by default). When on, the sign-up page shows an email form next to Google, and new accounts go straight to the profile wizard.',
                ],
            ],
            [
                'key' => 'about-page',
                'type' => 'feature',
                'title' => [
                    'id' => 'Halaman Tentang EduFunHub',
                    'en' => 'About EduFunHub page',
                ],
                'body' => [
                    'id' => 'Footer landing page kini punya tautan Tentang EduFunHub yang membuka halaman latar belakang EduFunHub dengan gaya yang sama seperti landing page.',
                    'en' => 'The landing page footer now has an About EduFunHub link that opens a page on the background of EduFunHub, styled like the landing page.',
                ],
            ],
        ],
    ],
    [
        'version' => '0.13.0',
        'date' => '2026-10-10',
        'changes' => [
            [
                'key' => 'database-backup',
                'type' => 'feature',
                'title' => [
                    'id' => 'Backup database lokal dan FTP',
                    'en' => 'Local and FTP database backups',
                ],
                'body' => [
                    'id' => 'Superadmin kini punya halaman Backup Database (/admin/backups) untuk full backup seluruh database ke file .sql.gz: backup manual dengan sekali klik dan backup otomatis terjadwal (harian atau mingguan). Tujuan backup bisa lokal, server FTP/FTPS, atau keduanya, lengkap dengan tes koneksi, batas jumlah file yang disimpan, riwayat, unduh, dan hapus. Kata sandi FTP disimpan terenkripsi.',
                    'en' => 'Superadmins now have a Database Backup page (/admin/backups) for full backups of the whole database to a .sql.gz file: one-click manual backups and scheduled automatic backups (daily or weekly). Backups go to local storage, an FTP/FTPS server, or both, with a connection test, retention limit, history, download and delete. The FTP password is stored encrypted.',
                ],
            ],
        ],
    ],
    [
        'version' => '0.12.0',
        'date' => '2026-10-10',
        'changes' => [
            [
                'key' => 'profile-photo-upload',
                'type' => 'feature',
                'title' => [
                    'id' => 'Unggah foto profil',
                    'en' => 'Profile photo upload',
                ],
                'body' => [
                    'id' => 'Pemain bisa mengunggah, mengganti, atau menghapus foto profil di halaman Profil (JPG, PNG, atau WEBP, maks. 2 MB, otomatis dipotong persegi). Foto tampil di daftar pengguna dan halaman detail pengguna di panel admin.',
                    'en' => 'Players can upload, change or remove a profile photo on the Profile page (JPG, PNG or WEBP, max 2 MB, cropped to a square automatically). The photo shows in the user list and on the user detail page in the admin panel.',
                ],
            ],
            [
                'key' => 'admin-game-play-detail',
                'type' => 'feature',
                'title' => [
                    'id' => 'Detail permainan di riwayat game pengguna',
                    'en' => 'Game details in the user game history',
                ],
                'body' => [
                    'id' => 'Baris di tab Riwayat game pada detail pengguna kini bisa diklik untuk membuka halaman detail permainan: poin, akurasi, durasi, benar beruntun, peringkat, soal per mata pelajaran, tingkat soal, perbandingan dengan permainan lain, pertandingan, dan daftar soal beserta kunci jawabannya.',
                    'en' => 'Rows in the Game history tab of the user detail page now open a game details page: points, accuracy, duration, streak, rank, questions by subject, question levels, comparison with other plays, the match, and the list of questions with their answer key.',
                ],
            ],
            [
                'key' => 'admin-breadcrumbs',
                'type' => 'feature',
                'title' => [
                    'id' => 'Breadcrumb di panel admin',
                    'en' => 'Breadcrumbs in the admin panel',
                ],
                'body' => [
                    'id' => 'Setiap halaman admin kini menampilkan jejak navigasi (Dasbor › menu › halaman) sehingga halaman sebelumnya bisa dibuka dengan sekali klik.',
                    'en' => 'Every admin page now shows a navigation trail (Dashboard › menu › page), so earlier pages are one click away.',
                ],
            ],
            [
                'key' => 'chart-tooltip-sticks',
                'type' => 'fix',
                'title' => [
                    'id' => 'Tooltip grafik tidak lagi menempel',
                    'en' => 'Chart tooltips no longer stick',
                ],
                'body' => [
                    'id' => 'Tooltip grafik di panel admin tidak lagi tetap muncul setelah mengurutkan tabel atau mengklik, walaupun kursor sudah tidak di atas grafik. Avatar pengguna di daftar pengguna admin juga kini tampil, dan label kolom Dimainkan diperbaiki.',
                    'en' => 'Chart tooltips in the admin panel no longer stay visible after sorting a table or clicking once the pointer has left the chart. User avatars now show in the admin user list, and the Played column label is fixed.',
                ],
            ],
        ],
    ],
    [
        'version' => '0.11.0',
        'date' => '2026-10-09',
        'changes' => [
            [
                'key' => 'android-play-store-app',
                'type' => 'feature',
                'title' => [
                    'id' => 'Aplikasi Android untuk Google Play',
                    'en' => 'Android app for Google Play',
                ],
                'body' => [
                    'id' => 'EduFunHub kini punya aplikasi Android (Trusted Web Activity) yang terbuka layar penuh tanpa bilah alamat Chrome, siap diunggah ke Google Play. Situs menerbitkan /.well-known/assetlinks.json dari pengaturan ANDROID_PACKAGE_NAME dan ANDROID_SHA256_CERT_FINGERPRINTS sebagai bukti kepemilikan aplikasi, dan manifest web menautkan aplikasi Play Store.',
                    'en' => 'EduFunHub now has an Android app (Trusted Web Activity) that opens full screen without the Chrome address bar, ready to upload to Google Play. The site publishes /.well-known/assetlinks.json from the ANDROID_PACKAGE_NAME and ANDROID_SHA256_CERT_FINGERPRINTS settings to prove app ownership, and the web manifest links the Play Store app.',
                ],
            ],
        ],
    ],
    [
        'version' => '0.10.1',
        'date' => '2026-10-09',
        'changes' => [
            [
                'key' => 'whatsapp-skipped-log',
                'type' => 'fix',
                'title' => [
                    'id' => 'Pesan WhatsApp yang tertahan saklar kini tercatat di log',
                    'en' => 'WhatsApp messages blocked by a switch are now logged',
                ],
                'body' => [
                    'id' => 'Saat notifikasi WhatsApp atau jenis pesannya dimatikan, pesan tidak lagi hilang tanpa jejak: tercatat berstatus Dilewati beserta alasannya, dan halaman Notifikasi WhatsApp menampilkan peringatan selama saklar utama mati. Sapaan selamat datang yang tertahan tetap menunggu dan bisa dikirim susulan dengan perintah whatsapp:send-pending-welcome.',
                    'en' => 'When WhatsApp notifications or a message type are switched off, messages no longer vanish silently: they are logged as Skipped with the reason, and the WhatsApp Notifications page shows a warning while the master switch is off. A blocked welcome greeting stays pending and can be sent later with the whatsapp:send-pending-welcome command.',
                ],
            ],
        ],
    ],
    [
        'version' => '0.10.0',
        'date' => '2026-10-09',
        'changes' => [
            [
                'key' => 'whatsapp-log-page',
                'type' => 'feature',
                'title' => [
                    'id' => 'Halaman Log WhatsApp dengan detail pesan',
                    'en' => 'WhatsApp Log page with message details',
                ],
                'body' => [
                    'id' => 'Menu baru Log WhatsApp di bawah Notifikasi WhatsApp. Tabel semua pesan dengan tab status, filter peristiwa dan tanggal, serta pencarian nama, email, nomor, atau isi pesan. Klik baris untuk membuka modal detail: penerima, nomor tersamar, isi pesan, waktu dibuat/terkirim, ID pesan penyedia, alasan gagal, dan tombol kirim ulang.',
                    'en' => 'New WhatsApp Log menu under WhatsApp Notifications. A table of every message with status tabs, event and date filters and a search on name, email, number or message text. Click a row to open the detail modal: recipient, masked number, message text, created/sent times, provider message ID, failure reason and a retry button.',
                ],
            ],
            [
                'key' => 'whatsapp-settings-cards',
                'type' => 'improvement',
                'title' => [
                    'id' => 'Kartu ringkasan WhatsApp yang lebih informatif',
                    'en' => 'More informative WhatsApp summary cards',
                ],
                'body' => [
                    'id' => 'Halaman Notifikasi WhatsApp kini memakai kartu bergaya dashboard: grafik harian terkirim dan gagal 7 hari, perbandingan dengan 7 hari sebelumnya, tingkat terkirim, porsi pemain yang menerima pesan, dan isi antrean. Daftar pesan terbaru diringkas menjadi 5 baris yang bisa diklik untuk melihat detail.',
                    'en' => 'The WhatsApp Notifications page now uses dashboard-style cards: 7-day daily sent and failed charts, the change against the 7 days before, the delivery rate, the share of players receiving messages and the queue. Recent messages are trimmed to 5 clickable rows that open the detail.',
                ],
            ],
        ],
    ],
    [
        'version' => '0.9.0',
        'date' => '2026-10-09',
        'changes' => [
            [
                'key' => 'whatsapp-number-unique',
                'type' => 'improvement',
                'title' => [
                    'id' => 'Nomor WhatsApp wajib diawali 0, 62, atau +62 dan tidak boleh dipakai dua akun',
                    'en' => 'WhatsApp numbers must start with 0, 62 or +62 and cannot be shared by two accounts',
                ],
                'body' => [
                    'id' => 'Nomor di wizard profil dan halaman profil hanya diterima dengan awalan 0, 62, atau +62, lalu disimpan dalam format 62. Satu nomor hanya boleh dimiliki satu akun, apa pun format penulisannya. Nomor ganda yang sudah ada tetap dipegang akun terlama; akun lainnya diminta mengisi nomor baru lewat wizard.',
                    'en' => 'The profile wizard and profile page only accept numbers starting with 0, 62 or +62, stored in the 62 form. One number can belong to one account only, whatever way it is written. Existing duplicates stay with the oldest account; the others are asked for a new number through the wizard.',
                ],
            ],
        ],
    ],
    [
        'version' => '0.8.0',
        'date' => '2026-10-09',
        'changes' => [
            [
                'key' => 'first-login-profile-wizard',
                'type' => 'feature',
                'title' => [
                    'id' => 'Wizard profil wajib saat pertama kali masuk',
                    'en' => 'Mandatory profile wizard on first login',
                ],
                'body' => [
                    'id' => 'Pemain yang baru daftar langsung melihat jendela isian 3 langkah: nama lengkap dan tanggal lahir, kelas dan sekolah terakhir, lalu nomor WhatsApp. Jendela ini tidak bisa ditutup sampai data tersimpan (pilihan lain hanya keluar akun). Akun lama, admin, dan guru tidak terkena.',
                    'en' => 'Newly registered players see a 3-step form right away: full name and date of birth, grade and last school, then a WhatsApp number. It cannot be closed until the data is saved (the only other option is logging out). Existing, admin and teacher accounts are not affected.',
                ],
            ],
        ],
    ],
    [
        'version' => '0.7.0',
        'date' => '2026-10-09',
        'changes' => [
            [
                'key' => 'snake-read-then-hunt',
                'type' => 'feature',
                'title' => [
                    'id' => 'Main Ular: baca soal 30 detik dulu, baru ular bergerak',
                    'en' => 'Snake: read the question for 30 seconds before the snakes move',
                ],
                'body' => [
                    'id' => 'Setiap soal baru, semua ular diam 30 detik supaya pemain bisa membaca soal dan melihat letak jawaban. Setelah itu ular bergerak dan pemain mengarahkannya ke bola jawaban yang benar. Begitu ular memakan jawaban (benar atau salah) atau waktu habis, ular diam lagi untuk soal berikutnya. Tombol "Sudah siap" memulai lebih cepat; di ruang bersama ular bergerak saat semua pemain siap.',
                    'en' => 'With every new question all snakes stay still for 30 seconds so players can read it and see where the answers are. Then the snakes move and players steer to the right answer ball. As soon as a snake eats an answer (right or wrong) or time runs out, the snakes freeze again for the next question. "I\'m ready" starts sooner; in a shared room the snakes move once every player is ready.',
                ],
            ],
            [
                'key' => 'snake-cartoon-look',
                'type' => 'improvement',
                'title' => [
                    'id' => 'Main Ular: arena lebih besar, bola jawaban besar, ular kartun',
                    'en' => 'Snake: bigger arena, big answer balls, cartoon snakes',
                ],
                'body' => [
                    'id' => 'Arena bermain diperbesar (kotak lebih sedikit dan lebih lebar), bola jawaban A–D kini bulat besar berwarna dengan huruf jelas, dan ular digambar kartun: badan menyambung mulus dan meruncing ke ekor, bercorak, dengan kepala bermata besar, pipi, senyum, dan lidah bercabang.',
                    'en' => 'The play area is bigger (fewer, larger cells), answer balls A–D are big coloured circles with clear letters, and the snakes are cartoon style: one smooth body tapering to the tail, with patterns and a head with big eyes, cheeks, a smile and a forked tongue.',
                ],
            ],
        ],
    ],
    [
        'version' => '0.6.0',
        'date' => '2026-10-09',
        'changes' => [
            [
                'key' => 'ability-analysis-whatsapp-report',
                'type' => 'feature',
                'title' => [
                    'id' => 'Hasil analisa kemampuan langsung dikirim lengkap ke WhatsApp',
                    'en' => 'Ability analysis results go straight to WhatsApp in full',
                ],
                'body' => [
                    'id' => 'Begitu analisa kemampuan (AI) selesai, sistem langsung mengirim hasilnya ke nomor WhatsApp pemain: ringkasan, nilai per mapel, kekuatan, yang perlu ditingkatkan, saran belajar bernomor, gaya belajar, perkembangan, dan link halaman analisa. Pesan ditulis sesuai bahasa pemain.',
                    'en' => 'As soon as an AI ability analysis finishes, the result is sent to the player\'s WhatsApp number: summary, score per subject, strengths, room to grow, numbered study tips, learning style, progress and the link to the analysis page. The message follows the player\'s language.',
                ],
            ],
            [
                'key' => 'profile-edit-button',
                'type' => 'improvement',
                'title' => [
                    'id' => 'Tombol Ubah di halaman profil agar data tidak berubah tanpa sengaja',
                    'en' => 'Edit button on the profile page so data is not changed by accident',
                ],
                'body' => [
                    'id' => 'Data akun, data peserta (tanggal lahir, sekolah, nomor WhatsApp) serta kelas dan level soal kini tampil sebagai data saja. Formulir baru terbuka setelah menekan Ubah, dan Batal mengembalikan isian semula. Bila data belum lengkap, formulir langsung terbuka.',
                    'en' => 'Account data, participant details (date of birth, school, WhatsApp number) and grade and question level are now shown read-only. The form opens only after tapping Edit, and Cancel restores the saved values. When details are incomplete, the form opens right away.',
                ],
            ],
        ],
    ],
    [
        'version' => '0.5.0',
        'date' => '2026-10-09',
        'changes' => [
            [
                'key' => 'whatsapp-notifications',
                'type' => 'feature',
                'title' => [
                    'id' => 'Notifikasi WhatsApp: sapaan pemain baru, hasil analisa, dan permintaan pertemanan',
                    'en' => 'WhatsApp notifications: new player greeting, analysis results and friend requests',
                ],
                'body' => [
                    'id' => 'Pemain bisa mengisi nomor WhatsApp (boleh nomor orang tua) bersama data sekolah. Nomor itu menerima sapaan selamat datang, ringkasan analisa kemampuan belajar beserta link-nya, dan kabar saat ada yang ingin berteman. Pemain bisa mematikan pesan WhatsApp kapan saja.',
                    'en' => 'Players can enter a WhatsApp number (a parent\'s number is fine) together with their school details. It receives a welcome greeting, a summary of the learning ability analysis with its link, and a message when someone wants to be their friend. Players can turn WhatsApp messages off at any time.',
                ],
            ],
            [
                'key' => 'whatsapp-admin-page',
                'type' => 'feature',
                'title' => [
                    'id' => 'Halaman admin Notifikasi WhatsApp dengan scan QR',
                    'en' => 'WhatsApp Notifications admin page with QR scan',
                ],
                'body' => [
                    'id' => 'Super admin menghubungkan nomor WhatsApp pengirim dengan scan QR code atau kode pairing, menyalakan atau mematikan tiap jenis pesan, mengirim pesan uji, dan melihat log pengiriman dengan nomor yang disamarkan. Pesan gagal bisa dikirim ulang. Sistem ini siap ditambah jenis notifikasi baru.',
                    'en' => 'Super admins link the sender WhatsApp number by scanning a QR code or with a pairing code, switch each message type on or off, send a test message and see the delivery log with masked numbers. Failed messages can be retried. New notification types can be added to the same system.',
                ],
            ],
        ],
    ],
    [
        'version' => '0.4.0',
        'date' => '2026-10-09',
        'changes' => [
            [
                'key' => 'universal-game-pin',
                'type' => 'feature',
                'title' => [
                    'id' => 'Kolom PIN di setiap game menerima PIN game apa pun',
                    'en' => 'The PIN field in every game accepts any game\'s PIN',
                ],
                'body' => [
                    'id' => 'Kolom PIN di halaman game kini sama dengan kolom PIN di menu. PIN ruang game ini langsung bergabung di tempat, sedangkan PIN milik game lain langsung membuka game tersebut, jadi pemain tidak perlu tahu PIN itu untuk game apa.',
                    'en' => 'The PIN field on game pages now matches the one in the menu. A PIN of this game joins right there, while a PIN from another game opens that game straight away, so players do not need to know which game a PIN belongs to.',
                ],
            ],
            [
                'key' => 'same-grade-badge',
                'type' => 'feature',
                'title' => [
                    'id' => 'Badge "Disarankan sekelas" di daftar game',
                    'en' => '"Best with same grade" badge in the game list',
                ],
                'body' => [
                    'id' => 'Game multiplayer di daftar game memberi badge informasi bahwa permainan paling adil dimainkan bersama teman sekelas, supaya murid kelas 1 tidak tiba-tiba melawan kelas 12. Ini hanya informasi; pemain beda kelas tetap boleh bermain bersama.',
                    'en' => 'Multiplayer games in the game list show an info badge that they play fairest with classmates of the same grade, so a grade 1 pupil is not matched against grade 12 by surprise. It is information only; mixed grades can still play together.',
                ],
            ],
        ],
    ],
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
