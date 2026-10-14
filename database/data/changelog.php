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
        'version' => '0.42.0',
        'date' => '2026-10-14',
        'changes' => [
            [
                'key' => 'android-apk-download',
                'type' => 'feature',
                'title' => ['id' => 'Unduh APK Android dari kartu Pasang Aplikasi', 'en' => 'Download the Android APK from the Install the App card'],
                'body' => ['id' => 'Kartu Pasang Aplikasi di dashboard kini punya tombol Unduh APK Android berisi build aplikasi terbaru, lengkap dengan ukuran dan tanggal build. Pasang versi web (PWA) tetap tersedia untuk iPhone dan laptop.', 'en' => 'The Install the App card on the dashboard now has a Download Android APK button with the latest app build, showing its size and build date. Installing the web version (PWA) stays available for iPhone and laptops.'],
            ],
            [
                'key' => 'character-3d',
                'type' => 'feature',
                'title' => ['id' => 'Karakter dan semua item kini tampil 3D', 'en' => 'Characters and all items are now 3D'],
                'body' => ['id' => 'Karakter pemain kini berupa model 3D dengan bentuk yang sama seperti sebelumnya: kepala besar, mata berkilau, rambut, baju, dan garis tinta tebal. Semua item toko maupun yang sudah dibeli (topi, wajah, baju, punggung, senjata, perisai) ikut 3D. Animasi napas, kedip, lambaian, lompat, dan jalan tetap ada. Tampil di dashboard, toko, papan peringkat, chat, game, Flag Quest, dan ruang kelas 3D. Perangkat tanpa WebGL otomatis memakai gambar 2D.', 'en' => 'Player characters are now 3D models with the same shape as before: big head, sparkling eyes, hair, outfit and thick ink outline. Every shop and owned item (hats, face, outfits, back, weapons, shields) is 3D too. Breathing, blinking, waving, hopping and walking animations stay. Shown on the dashboard, shop, leaderboard, chat, games, Flag Quest and the 3D classroom. Devices without WebGL fall back to the 2D drawing.'],
            ],
        ],
    ],
    [
        'version' => '0.41.0',
        'date' => '2026-10-14',
        'changes' => [
            [
                'key' => 'player-feature-search',
                'type' => 'feature',
                'title' => ['id' => 'Pencarian game dan fitur untuk pemain dan guru', 'en' => 'Game and feature search for players and teachers'],
                'body' => ['id' => 'Header pemain kini punya tombol cari (juga lewat Ctrl/⌘ K dan menu di HP). Ketik nama game, halaman, atau fitur (misalnya "ular", "kelasku", "chat") lalu pilih hasilnya untuk langsung membukanya. Guru juga menemukan fitur guru seperti bank soal, impor soal, dan ruang kelas. Halaman admin tidak ikut muncul.', 'en' => 'The player header now has a search button (also Ctrl/⌘ K and the phone menu). Type a game, page or feature (for example "snake", "my classes", "chat") and pick a result to open it. Teachers also find teacher tools such as the question bank, question import and classrooms. Admin pages are not included.'],
            ],
            [
                'key' => 'chat-people-search-school-email',
                'type' => 'improvement',
                'title' => ['id' => 'Cari teman chat berdasarkan sekolah dan email', 'en' => 'Find chat partners by school or email'],
                'body' => ['id' => 'Kolom cari di modal Chat baru dan Grup baru kini juga mencocokkan nama sekolah dan email. Admin bisa mencari sebagian email; pemain lain hanya menemukan seseorang lewat email bila mengetik alamatnya lengkap, dan alamat itu tetap tidak ditampilkan.', 'en' => 'The search box in the New chat and New group pickers now also matches school names and emails. Admins can search part of an email; other players only find someone by email when they type the full address, and the address itself stays hidden.'],
            ],
        ],
    ],
    [
        'version' => '0.40.0',
        'date' => '2026-10-14',
        'changes' => [
            [
                'key' => 'admin-user-chat-button',
                'type' => 'feature',
                'title' => ['id' => 'Tombol Obrolan di profil pengguna admin', 'en' => 'Chat button on the admin user profile'],
                'body' => ['id' => 'Halaman detail pengguna di panel admin kini punya tombol Obrolan. Tombol ini membuka (atau melanjutkan) obrolan pribadi dengan pengguna tersebut dan langsung membawa ke halaman Chat dengan obrolan itu terbuka. Tombol tidak tampil di profil sendiri atau akun yang ditangguhkan.', 'en' => 'The admin user detail page now has a Chat button. It opens (or resumes) a direct chat with that user and takes you straight to the Chat page with the conversation open. It is hidden on your own profile and on suspended accounts.'],
            ],
            [
                'key' => 'chat-people-badges',
                'type' => 'improvement',
                'title' => ['id' => 'Badge sekolah, email, dan guru saat memilih teman chat', 'en' => 'School, email and teacher badges when picking who to chat with'],
                'body' => ['id' => 'Di modal Chat baru dan Grup baru, setiap nama kini menampilkan badge asal sekolah dan badge Guru bila orang itu guru, sehingga nama yang mirip mudah dibedakan. Email hanya tampil (dan bisa dicari) oleh admin, agar alamat email pemain tidak terlihat pemain lain.', 'en' => 'In the New chat and New group pickers each name now shows a school badge and a Teacher badge when the person is a teacher, so similar names are easy to tell apart. Emails are shown (and searchable) for admins only, so player addresses stay hidden from other players.'],
            ],
        ],
    ],
    [
        'version' => '0.39.0',
        'date' => '2026-10-14',
        'changes' => [
            [
                'key' => 'admin-user-teacher-subjects-card',
                'type' => 'fix',
                'title' => ['id' => 'Mata pelajaran guru pindah dari header profil', 'en' => 'Teacher subjects moved out of the profile header'],
                'body' => ['id' => 'Di halaman detail pengguna admin, pilihan mata pelajaran guru tidak lagi memenuhi kartu header profil. Kini tampil sebagai kartu sendiri di kolom kiri (hanya untuk akun guru), pilihan yang aktif diberi tanda centang, dan tombol simpan ada di dalam kartu.', 'en' => 'On the admin user detail page the teacher subject picker no longer crowds the profile header card. It is now its own card in the left column (teacher accounts only), selected subjects show a check mark, and the save button sits inside the card.'],
            ],
            [
                'key' => 'admin-teacher-request-alerts',
                'type' => 'feature',
                'title' => ['id' => 'Badge dan WhatsApp untuk request guru', 'en' => 'Badge and WhatsApp for teacher requests'],
                'body' => ['id' => 'Menu Request guru di panel admin kini menampilkan angka jumlah request yang menunggu (titik merah saat sidebar diciutkan). Setiap ada request baru, superadmin dan admin yang punya nomor WhatsApp aktif menerima pesan berisi nama pengaju, mata pelajaran, pesan, dan tautan ke halaman tinjauan. Jenis pesan ini bisa dimatikan di halaman Notifikasi WhatsApp.', 'en' => 'The Teacher requests menu in the admin panel now shows how many requests are waiting (a red dot when the sidebar is collapsed). Each new request sends superadmins and admins with an active WhatsApp number a message with the requester, subject, message and a link to the review page. This message type can be switched off on the WhatsApp notifications page.'],
            ],
        ],
    ],
    [
        'version' => '0.38.0',
        'date' => '2026-10-14',
        'changes' => [
            [
                'key' => 'classroom-own-container',
                'type' => 'improvement',
                'title' => ['id' => 'Ruang kelas 3D berjalan di container Go sendiri', 'en' => 'The 3D classroom runs in its own Go container'],
                'body' => ['id' => 'Ruang kelas 3D kini dilayani container Go terpisah (edufunhub-classroom), tidak lagi menumpang di container game, sehingga beban dan pembaruan keduanya tidak saling mengganggu.', 'en' => 'The 3D classroom is now served by a separate Go container (edufunhub-classroom) instead of sharing the game container, so load and updates of one no longer affect the other.'],
            ],
            [
                'key' => 'classroom-close-everything',
                'type' => 'feature',
                'title' => ['id' => 'Kelas ditutup, permainan dan ruang kelas siswa ikut tertutup', 'en' => 'Closing a class also closes students\' games and classroom'],
                'body' => ['id' => 'Saat guru mengakhiri kelas atau waktunya habis, semua ruang permainan kelas itu langsung ditutup (poin yang sudah didapat tetap dihitung), siswa dikeluarkan dari ruang kelas 3D, dan halaman game atau kelas yang sedang dibuka siswa otomatis berpindah ke layar "Ruang sudah selesai" dengan tombol ke laporan di Kelasku.', 'en' => 'When the teacher ends a class or its time runs out, every game room of that class closes at once (points already earned still count), students are removed from the 3D classroom, and any open game or classroom page switches to the "class ended" screen with a link to the report in My classes.'],
            ],
        ],
    ],
    [
        'version' => '0.37.0',
        'date' => '2026-10-14',
        'changes' => [
            [
                'key' => 'classroom-world-waiting-chats',
                'type' => 'feature',
                'title' => ['id' => 'Daftar chat menunggu balasan di ruang kelas 3D', 'en' => 'Waiting chats list in the 3D classroom'],
                'body' => ['id' => 'Pesan pribadi dari guru atau teman sekelas langsung menambah angka di atas kepala avatar pengirim dan angka total di atas kepala sendiri, walau pengirim tidak ada di ruangan. Mengetuk angka (atau tombol kotak masuk) membuka daftar chat yang belum dijawab per pengirim, yang bisa langsung dibalas atau ditandai dibaca tanpa pindah ke halaman Chat. Daftar diambil dari server sehingga tetap benar setelah memuat ulang.', 'en' => 'Direct messages from the teacher or classmates instantly raise a count above the sender\'s avatar and a total above your own head, even when the sender is not in the room. Tapping a count (or the inbox button) opens the unanswered chats per sender, which can be answered or marked read right there without leaving for the Chat page. The list comes from the server, so it stays right after a reload.'],
            ],
            [
                'key' => 'classroom-world-keep-position',
                'type' => 'fix',
                'title' => ['id' => 'Posisi avatar tidak lagi kembali ke pintu', 'en' => 'Avatar no longer jumps back to the door'],
                'body' => ['id' => 'Saat browser di-minimize, koneksi terputus sebentar, halaman dimuat ulang, atau kembali dari game, avatar muncul lagi di tempat terakhir berdiri (diingat hingga 2 jam), bukan di pintu masuk.', 'en' => 'After minimising the browser, a short connection drop, a page reload or coming back from a game, the avatar reappears where it last stood (remembered for up to 2 hours) instead of at the entrance.'],
            ],
        ],
    ],
    [
        'version' => '0.36.1',
        'date' => '2026-10-14',
        'changes' => [
            [
                'key' => 'classroom-world-chat-unread',
                'type' => 'improvement',
                'title' => ['id' => 'Chat di ruang kelas tidak lagi memunculkan modal', 'en' => 'Classroom chat no longer pops a modal'],
                'body' => ['id' => 'Di ruang kelas 3D, pesan pribadi dari orang yang ada di ruangan tidak lagi tampil sebagai modal dan tidak mengarahkan ke halaman Chat. Bila obrolan dengan orang itu sedang terbuka, pesan tampil di balon di atas kepalanya; bila tertutup, muncul angka pesan belum dibaca di atas kepala avatarnya yang hilang saat obrolan dibuka.', 'en' => 'In the 3D classroom, direct messages from people in the room no longer show as a modal or send you to the Chat page. When the conversation with that person is open the message shows in a bubble over their head; when it is closed an unread count floats above their avatar and clears once the conversation is opened.'],
            ],
        ],
    ],
    [
        'version' => '0.36.0',
        'date' => '2026-10-14',
        'changes' => [
            [
                'key' => 'classroom-play-limit',
                'type' => 'feature',
                'title' => ['id' => 'Batas main per game di ruang kelas', 'en' => 'Per game play limit in classrooms'],
                'body' => ['id' => 'Saat memilih game untuk ruang kelas, guru bisa mengatur maksimal berapa kali tiap siswa boleh memainkan game itu (kosong = tanpa batas). Batas dicek di server: halaman game dialihkan kembali ke ruang kelas bila jatah habis, dan hasil di atas batas tidak dihitung ke kelas. Sisa jatah tampil di bilik ruang 3D, halaman kelas, dan Kelasku.', 'en' => 'When picking classroom games, teachers can set how many times each student may play a game (empty = unlimited). The limit is enforced on the server: the game page sends the student back to the classroom once used up, and results above the limit do not count for the class. Remaining plays show in the 3D booth, the classroom page and My classes.'],
            ],
            [
                'key' => 'classroom-announcements',
                'type' => 'feature',
                'title' => ['id' => 'Pengumuman ruang kelas', 'en' => 'Classroom announcements'],
                'body' => ['id' => 'Guru bisa mengirim pengumuman dari tab Live dengan durasi tampil 5 detik sampai 10 menit. Pengumuman muncul langsung sebagai popup di layar semua peserta aktif, termasuk di ruang 3D, tidak bisa ditutup siswa, dan hilang otomatis saat waktunya habis atau saat guru menghentikannya.', 'en' => 'Teachers can send announcements from the Live tab with a display time of 5 seconds to 10 minutes. They pop up instantly on every active participant\'s screen, including the 3D room, cannot be closed by students, and disappear automatically when time is up or the teacher stops them.'],
            ],
            [
                'key' => 'classroom-world-chat-replies',
                'type' => 'fix',
                'title' => ['id' => 'Balasan dari halaman Chat tampil di balon ruang kelas', 'en' => 'Replies from the Chat page show as classroom bubbles'],
                'body' => ['id' => 'Balasan yang dikirim lewat halaman Chat kini muncul sebagai balon di atas avatar pengirim di ruang kelas 3D dan masuk ke panel obrolan.', 'en' => 'Replies sent from the Chat page now appear as a bubble over the sender\'s avatar in the 3D classroom and in the chat panel.'],
            ],
            [
                'key' => 'classroom-world-booth-icons',
                'type' => 'improvement',
                'title' => ['id' => 'Ikon game di papan bilik dan sapaan guru', 'en' => 'Game icons on booth signs and teacher greeting'],
                'body' => ['id' => 'Papan nama bilik game di ruang kelas 3D kini menampilkan ikon game di samping judulnya. Panel obrolan guru menampilkan ajakan "Sapa para peserta kelas!".', 'en' => 'Game booth signs in the 3D classroom now show the game icon next to the title. The teacher chat panel shows "Say hi to your class participants!".'],
            ],
        ],
    ],
    [
        'version' => '0.35.0',
        'date' => '2026-10-13',
        'changes' => [
            [
                'key' => 'my-classrooms',
                'type' => 'feature',
                'title' => ['id' => 'Kelasku: kelas, soal, permainan, nilai, dan analisa diri', 'en' => 'My classes: classes, questions, games, scores and self analysis'],
                'body' => ['id' => 'Menu baru Kelasku (Akun → Kelasku) menampilkan semua kelas yang pernah diikuti beserta poin, peringkat, akurasi, dan penguasaan, dengan pencarian dan filter status. Detail tiap kelas punya tab Nilai, Permainan (hasil per game dan riwayat main), Soal (pilihanmu, status benar/salah, pencarian, dan filter), serta Analisa (analisa diri per mata pelajaran dan topik, saran AI dan catatan guru bila laporan sudah dibagikan). Kunci jawaban dan penjelasan baru terbuka setelah kelas selesai agar tidak bisa dipakai menyontek.', 'en' => 'The new My classes menu (Account → My classes) lists every classroom joined with points, rank, accuracy and mastery, with search and a status filter. Each class has Scores, Games (per game results and play history), Questions (your pick, right/wrong status, search and filters) and Analysis tabs (self analysis per subject and topic, AI tips and teacher note once the report is shared). Answer keys and explanations only unlock after the class ends so they cannot be used to cheat.'],
            ],
            [
                'key' => 'feature-search-classroom-link',
                'type' => 'fix',
                'title' => ['id' => 'Pencarian fitur Ruang Kelas pemain tidak lagi 404', 'en' => 'Player Classroom feature search no longer 404s'],
                'body' => ['id' => 'Hasil pencarian fitur untuk ruang kelas pemain kini membuka Kelasku, bukan halaman yang tidak ada.', 'en' => 'The player classroom feature search result now opens My classes instead of a missing page.'],
            ],
        ],
    ],
    [
        'version' => '0.34.0',
        'date' => '2026-10-13',
        'changes' => [
            [
                'key' => 'classroom-world-teacher-avatar',
                'type' => 'feature',
                'title' => ['id' => 'Avatar guru di meja guru ruang kelas 3D', 'en' => 'Teacher avatar at the teacher desk in the 3D classroom'],
                'body' => ['id' => 'Avatar guru kini tampil di meja guru lengkap dengan lencana Guru, sesuai karakter guru. Guru juga bisa masuk ruang kelas 3D dari halaman ruang kelasnya dan berjalan bersama siswa; guru tidak masuk bilik game.', 'en' => 'The teacher avatar now stands at the teacher desk with a Teacher badge, using the teacher\'s own character. Teachers can also enter the 3D classroom from their classroom page and walk among students; teachers do not enter game booths.'],
            ],
            [
                'key' => 'classroom-world-proximity-chat',
                'type' => 'feature',
                'title' => ['id' => 'Ngobrol saat avatar berdekatan', 'en' => 'Chat when avatars are close'],
                'body' => ['id' => 'Saat avatar mendekati teman atau guru, muncul tombol Ngobrol. Pesannya tampil sebagai balon di atas avatar pengirim, hanya terlihat oleh pengirim dan penerima, dan otomatis tersimpan di halaman Chat sebagai obrolan pribadi. Hanya anggota kelas yang sama dan guru kelas itu yang bisa saling mengobrol.', 'en' => 'Walking close to a classmate or the teacher shows a Chat button. Messages appear as a bubble over the sender\'s avatar, are seen only by the sender and recipient, and are saved automatically to the Chat page as a direct conversation. Only members of the same classroom and its teacher can chat with each other.'],
            ],
        ],
    ],
    [
        'version' => '0.33.1',
        'date' => '2026-10-13',
        'changes' => [
            [
                'key' => 'classroom-game-detail-only',
                'type' => 'improvement',
                'title' => ['id' => 'Daftar game di halaman kelas hanya menampilkan penjelasan', 'en' => 'Classroom page game list only shows details'],
                'body' => ['id' => 'Di halaman ruang kelas siswa, game tidak lagi bisa dimulai langsung dari daftar permainan. Mengetuk game kini membuka penjelasan game (deskripsi, jenjang kelas, jumlah pemain, poin, jumlah soal) beserta petunjuk untuk bermain lewat bilik di ruang kelas 3D dan tombol Masuk Ruangan.', 'en' => 'On the student classroom page, games can no longer be started straight from the game list. Tapping a game now opens its details (description, grades, players, points, question count) with a hint to play from its booth in the 3D classroom and an Enter Room button.'],
            ],
            [
                'key' => 'admin-user-teacher-subjects-teachers-only',
                'type' => 'fix',
                'title' => ['id' => 'Pilihan mata pelajaran guru hanya untuk akun guru', 'en' => 'Teacher subject picker only for teacher accounts'],
                'body' => ['id' => 'Di halaman profil pengguna admin, bagian Mata pelajaran guru tidak lagi muncul pada akun peserta; bagian ini hanya tampil untuk akun guru, dengan nama mata pelajaran mengikuti bahasa admin.', 'en' => 'On the admin user profile page, the Teacher subjects section no longer shows on learner accounts; it only shows for teachers, with subject names in the admin language.'],
            ],
        ],
    ],
    [
        'version' => '0.33.0',
        'date' => '2026-10-13',
        'changes' => [
            [
                'key' => 'classroom-hostless-games',
                'type' => 'feature',
                'title' => ['id' => 'Game layar host tanpa layar host di ruang kelas', 'en' => 'Host-screen games without a host screen in classrooms'],
                'body' => ['id' => 'Lantai Runtuh, Turbo Trivia, Tetris Kuis, Monster Café, Peti Emas Misteri, dan Order Rush yang dibuka dari ruang kelas tidak lagi butuh layar host. Siswa pertama menjadi kapten yang mengatur, memulai, dan menghentikan permainan sambil tetap ikut bermain; teman sekelas otomatis masuk ke ruang yang sama tanpa PIN. Bila kapten keluar, peran kapten pindah ke pemain lain. Hanya anggota kelas itu yang bisa masuk, dan keluar dari permainan kembali ke ruang kelas.', 'en' => 'Floor Drop, Turbo Trivia, Block Battle, Monster Café, Economy Heist and Order Rush opened from a classroom no longer need a host screen. The first student becomes the captain who sets up, starts and stops the game while still playing; classmates join the same room automatically without a PIN. If the captain leaves, another player takes over. Only members of that classroom can join, and leaving returns to the classroom.'],
            ],
            [
                'key' => 'classroom-participants-page',
                'type' => 'feature',
                'title' => ['id' => 'Halaman daftar peserta ruang kelas', 'en' => 'Classroom participants page'],
                'body' => ['id' => 'Tab Analisis kini punya tombol menuju halaman khusus daftar peserta: podium nilai tertinggi, ringkasan kelas, pencarian langsung, filter penguasaan dan status main, pengurutan, ekspor CSV, tombol bagikan laporan, serta detail per siswa dengan analisa AI.', 'en' => 'The Analysis tab now links to a dedicated participants page: top score podium, class summary, live search, mastery and play status filters, sorting, CSV export, report sharing and per-student details with the AI analysis.'],
            ],
            [
                'key' => 'classroom-world-dynamic-size',
                'type' => 'improvement',
                'title' => ['id' => 'Ruang kelas 3D menyesuaikan jumlah peserta', 'en' => '3D classroom scales with class size'],
                'body' => ['id' => 'Ukuran ruang kelas 3D, jumlah meja, posisi bilik game, jendela, dan kamera kini mengikuti kapasitas peserta kelas (1 meja untuk 2 siswa, hingga 200 siswa), sehingga avatar tidak menumpuk saat pesertanya banyak.', 'en' => 'The 3D classroom size, desk count, game booth positions, windows and camera now follow the class capacity (one desk per two students, up to 200 students), so avatars no longer pile up in large classes.'],
            ],
        ],
    ],
    [
        'version' => '0.32.0',
        'date' => '2026-10-13',
        'changes' => [
            [
                'key' => 'classroom-game-rooms',
                'type' => 'feature',
                'title' => ['id' => 'Ruang game khusus ruang kelas tanpa PIN', 'en' => 'Classroom game rooms without a PIN'],
                'body' => ['id' => 'Game multiplayer yang dibuka dari ruang kelas (Ular Tangga, Duel Kuis Kelas, Teka-Teki Silang, Ping Pong, Main Ular, Pasar Matematika, Taman Angka & Huruf, Jelajah Indonesia, Lab Mini) kini langsung memasukkan siswa ke ruang tunggu bersama kelasnya tanpa memasukkan PIN. Daftar teman yang sudah masuk langsung terlihat; pemain pertama menjadi host dan bisa menekan Mulai saat jumlah pemain cukup. Ruang ini hanya bisa dimasuki anggota aktif kelas yang sama (dicek dari token server), tidak muncul di pencarian PIN, dan tidak menerima pemain satu perangkat. Keluar dari permainan atau ruang tunggu langsung kembali ke ruang kelas.', 'en' => 'Multiplayer games opened from a classroom (Snakes & Ladders, Class Quiz Duel, Crossword, Ping Pong, Snake, Market Math, Number Garden, Explore Indonesia, Mini Lab) now place students straight into their classroom\'s shared waiting room without a PIN. Classmates who joined are listed right away; the first player is the host and can press Start once enough players are in. Only active members of the same classroom can join (checked from the server token); the room does not show up in PIN lookup and takes no same-device players. Leaving the game or the waiting room returns to the classroom.'],
            ],
            [
                'key' => 'classroom-report-accordion-fix',
                'type' => 'fix',
                'title' => ['id' => 'Akordion laporan peserta menampilkan hasil analisa', 'en' => 'Participant report accordion shows the analysis'],
                'body' => ['id' => 'Di tab Analisis ruang kelas, akordion setiap peserta kini terbuka dan tertutup dengan halus serta menampilkan jumlah main, soal terjawab, benar, salah, poin, peringkat, mapel kuat dan lemah, serta poin-poin analisa AI siswa tersebut.', 'en' => 'On the classroom Analysis tab, each participant accordion now opens and closes smoothly and shows plays, answered, correct, wrong, points, rank, strong and weak subjects and the student\'s AI analysis points.'],
            ],
            [
                'key' => 'classroom-join-game-names',
                'type' => 'fix',
                'title' => ['id' => 'Daftar game di halaman masuk kelas tampil benar', 'en' => 'Game list on the classroom join page shows correctly'],
                'body' => ['id' => 'Saat siswa pertama kali membuka ruang kelas, daftar permainannya kini tampil dengan nama game yang benar dan halaman tidak lagi kosong karena error.', 'en' => 'When a student first opens a classroom, the game list now shows the proper game names and the page no longer turns blank from an error.'],
            ],
        ],
    ],
    [
        'version' => '0.31.7',
        'date' => '2026-10-13',
        'changes' => [
            [
                'key' => 'classroom-feedback-accordion',
                'type' => 'improvement',
                'title' => ['id' => 'Umpan balik AI per siswa jadi akordion', 'en' => 'Per-student AI feedback as an accordion'],
                'body' => ['id' => 'Di tab AI ruang kelas, umpan balik setiap siswa kini tampil sebagai akordion yang terbuka dan tertutup dengan animasi halus. Baris judul menampilkan nama, jumlah poin, dan tingkat penguasaan; tersedia tombol Buka semua / Tutup semua. Kartu PIN kini rata tengah.', 'en' => 'On the classroom AI tab, each student\'s feedback is now a smoothly animated accordion. The header shows the name, number of points and mastery level, with an Expand all / Collapse all button. The PIN card is now centered.'],
            ],
            [
                'key' => 'teacher-game-names',
                'type' => 'fix',
                'title' => ['id' => 'Nama game di form soal guru tampil benar', 'en' => 'Game names show correctly in the teacher question form'],
                'body' => ['id' => 'Pilihan "Tampilkan di permainan" pada form buat/edit soal, statistik Bank Soal, detail soal, dan analisa kelas kini memakai nama resmi game (misalnya Pasar Matematika, Lantai Runtuh, Turbo Trivia), bukan kode teks seperti teacher.games.market-math.', 'en' => 'The "Show in games" options in the question form, Question Bank stats, question detail and classroom analysis now use the official game names (e.g. Market Math, Floor Drop, Turbo Trivia) instead of text codes like teacher.games.market-math.'],
            ],
        ],
    ],
    [
        'version' => '0.31.6',
        'date' => '2026-10-13',
        'changes' => [
            [
                'key' => 'teacher-questions-compact-stats',
                'type' => 'improvement',
                'title' => ['id' => 'Kotak statistik Bank Soal dua kolom di HP', 'en' => 'Question Bank stat boxes in two columns on phones'],
                'body' => ['id' => 'Di halaman Bank Soal guru, kotak Soal dibuat, Dipakai, Jawaban benar, dan Jawaban salah kini tampil dua kolom per baris di HP dengan ikon dan teks yang lebih ringkas; kotak Kompensasi tampil selebar baris. Kotak tarif kompensasi per jenjang juga dua kolom, dan nominal besar turun ke baris berikutnya tanpa keluar kotak. Halaman detail soal memakai gaya yang sama.', 'en' => 'On the teacher Question Bank page, the Questions created, Used, Correct and Wrong answer boxes now show two per row on phones with tighter icons and text; the Compensation box spans the row. The per-level compensation rate boxes also use two columns, and large amounts wrap to the next line instead of overflowing. The question detail page uses the same style.'],
            ],
        ],
    ],
    [
        'version' => '0.31.5',
        'date' => '2026-10-13',
        'changes' => [
            [
                'key' => 'classroom-compact-stats',
                'type' => 'improvement',
                'title' => ['id' => 'Kotak statistik ruang kelas lebih ringkas', 'en' => 'More compact classroom stat boxes'],
                'body' => ['id' => 'Di HP, kotak Anggota, Online, dan Bermain pada tab Live kini tampil berjajar tiga dalam satu baris, dan kotak tab Analisis tampil dua kolom, tidak lagi satu kotak per baris. Ikon dan angka berada sejajar sehingga kotak lebih pendek. Kartu per permainan menampilkan nama game utuh dengan ringkasan main, pemain, dan akurasi dalam tiga kotak kecil.', 'en' => 'On phones, the Members, Online and Playing boxes on the Live tab now sit three in a row, and the Analysis tab boxes use two columns instead of one box per row. Icons sit next to the numbers so boxes are shorter. Per-game cards show the full game name with plays, players and accuracy in three small tiles.'],
            ],
        ],
    ],
    [
        'version' => '0.31.4',
        'date' => '2026-10-13',
        'changes' => [
            [
                'key' => 'classroom-ai-bullets',
                'type' => 'improvement',
                'title' => ['id' => 'Analisa AI ruang kelas dalam bentuk poin-poin', 'en' => 'Classroom AI analysis as bullet points'],
                'body' => ['id' => 'Ringkasan AI kini dibagi per bagian (Gambaran umum, Sudah kuat, Perlu ditingkatkan, Miskonsepsi, Tindak lanjut), masing-masing berisi poin singkat. Umpan balik per siswa juga berpoin (Sudah kuat, Perlu ditingkatkan, Saran latihan) dan menyapa siswa dengan "kamu" tanpa label siswa. Bagian yang kosong tidak ditampilkan. Analisa lama yang masih berupa paragraf otomatis dipecah menjadi poin. Halaman laporan siswa yang dibagikan guru tidak lagi kosong dan kini menampilkan peringkat, poin per game, serta perbandingan dengan rata-rata kelas.', 'en' => 'The AI summary is now split into sections (Overview, Strengths, Needs work, Misconceptions, Next steps), each with short bullet points. Per-student feedback is also in bullets (Strengths, Needs work, Practice tips) and addresses the student directly without student labels. Empty sections are hidden. Older paragraph analyses are automatically split into points. The report page a teacher shares with a student no longer shows blank and now includes rank, points per game and comparison with the class average.'],
            ],
        ],
    ],
    [
        'version' => '0.31.3',
        'date' => '2026-10-13',
        'changes' => [
            [
                'key' => 'teacher-tabs-responsive',
                'type' => 'improvement',
                'title' => ['id' => 'Menu Bank Soal, Materi, Ruang Kelas mengikuti lebar layar', 'en' => 'Question Bank, Topics, Classrooms menu fits the screen'],
                'body' => ['id' => 'Menu bagian guru (Bank Soal, Materi, Ruang Kelas) kini selebar halaman dalam satu baris dengan tiga tombol sama besar, tidak lagi sempit dan terlipat dua baris. Di HP ikon tampil di atas teks agar label tetap terbaca. Di halaman ruang kelas menu ini berada di atas judul dengan jarak yang rapi, dan tab Live, Analisis, AI memakai gaya yang sama.', 'en' => 'The teacher section menu (Question Bank, Topics, Classrooms) now spans the page in one row with three equal buttons instead of a narrow two-row box. On phones the icon sits above the text so labels stay readable. On the classroom page the menu sits above the title with proper spacing, and the Live, Analysis, AI tabs use the same style.'],
            ],
        ],
    ],
    [
        'version' => '0.31.2',
        'date' => '2026-10-13',
        'changes' => [
            [
                'key' => 'classroom-analysis-fix',
                'type' => 'fix',
                'title' => ['id' => 'Analisa ruang kelas tampil benar', 'en' => 'Classroom analysis shows correctly'],
                'body' => ['id' => 'Kartu Analisa di halaman guru kini menampilkan kalimat yang bisa dibaca (bukan kode teks) dengan nama mapel dan persentase yang benar. Halaman guru tidak lagi error saat ada soal yang dijawab berkali-kali. Tombol Bagikan, Bagikan semua (dengan catatan guru), dan Keluarkan siswa kembali berfungsi. Laporan siswa kini berisi peringkat, jumlah salah, serta mapel kuat dan lemah tiap siswa.', 'en' => 'The Analysis card on the teacher page now shows readable sentences (not text codes) with correct subject names and percentages. The teacher page no longer errors when a question was answered many times. The Share, Share all (with a teacher note) and Remove student buttons work again. Student rows now include rank, wrong answers, and each student\'s strong and weak subjects.'],
            ],
            [
                'key' => 'classroom-ai-analysis',
                'type' => 'improvement',
                'title' => ['id' => 'Analisa AI ruang kelas lebih lengkap dan aman', 'en' => 'Richer and safer classroom AI analysis'],
                'body' => ['id' => 'Analisa AI kini membaca hasil per game, per mapel, per topik, soal tersulit, dan jawaban salah yang paling sering dipilih, lalu menulis ringkasan, saran tindak lanjut, dan umpan balik untuk setiap siswa. Nama siswa tetap disamarkan, umpan balik dipasangkan ke siswa lewat label (AI tidak bisa menulis ke siswa lain), teks dibersihkan, dan analisa ulang mengganti umpan balik lama. Tab AI menjelaskan kenapa tombol tidak aktif, menampilkan status proses, pesan gagal, dan waktu analisa, serta bisa menjalankan analisa ulang.', 'en' => 'AI analysis now reads results per game, subject and topic, the hardest questions and the most chosen wrong answers, then writes a summary, follow-up advice and feedback for every student. Student names stay hidden, feedback is matched to students by label (the AI cannot write to another student), text is cleaned, and a new analysis replaces old feedback. The AI tab explains why the button is disabled, shows progress, errors and the analysis time, and can run the analysis again.'],
            ],
        ],
    ],
    [
        'version' => '0.31.1',
        'date' => '2026-10-13',
        'changes' => [
            [
                'key' => 'classroom-game-back',
                'type' => 'fix',
                'title' => ['id' => 'Game di ruang kelas kembali ke ruang kelas', 'en' => 'Classroom games go back to the classroom'],
                'body' => ['id' => 'Tombol kembali di game (header dan layar hasil) kini membawa siswa ke ruang kelasnya bila game itu dibuka dari ruang kelas aktif yang memilih game tersebut, bukan ke portal. Game di luar ruang kelas tetap kembali ke portal.', 'en' => 'The back button in games (header and result screen) now takes students to their classroom when the game was opened from an active classroom that picked it, instead of the portal. Games outside a classroom still go back to the portal.'],
            ],
        ],
    ],
    [
        'version' => '0.31.0',
        'date' => '2026-10-13',
        'changes' => [
            [
                'key' => 'classroom-3d-world',
                'type' => 'feature',
                'title' => ['id' => 'Ruang kelas 3D dengan avatar, obrolan, dan bilik permainan', 'en' => '3D classroom with avatars, chat and game booths'],
                'body' => ['id' => 'Siswa kini bisa menekan "Masuk Ruangan" untuk menjelajahi ruang kelas 3D bersama teman. Avatar mengikuti tampilan dan item di pengaturan karakter, setiap avatar punya lencana nama mengambang, dan siswa bisa mengobrol lewat balon chat serta emote. Bilik permainan pilihan guru ada di dalam ruangan: masuk ke bilik untuk memainkan gamenya. Bar informasi menampilkan nilai, jumlah permainan, peringkat, dan papan peringkat kelas. Di HP, ruangan bisa digeser dan dijelajahi dengan joystick seperti game pada umumnya. Posisi, tabrakan, bilik, dan chat (disaring dan dibatasi) diatur server Go; siswa yang dikeluarkan atau keluar langsung diputus dari ruangan.', 'en' => 'Students can press "Enter the Room" to explore a 3D classroom with friends. Avatars follow the look and items from the character settings, each avatar has a floating name badge, and students chat with speech bubbles and emotes. The game booths the teacher picked stand in the room: step into a booth to play its game. An info bar shows points, games played, rank and the class leaderboard. On phones the room can be dragged and explored with a joystick like a regular game. Positions, collisions, booths and chat (filtered and rate limited) are run by the Go server; removed or leaving students are disconnected from the room right away.'],
            ],
            [
                'key' => 'classroom-join-fix',
                'type' => 'fix',
                'title' => ['id' => 'Tombol masuk dan keluar ruang kelas berfungsi kembali', 'en' => 'Classroom join and leave buttons work again'],
                'body' => ['id' => 'Tombol masuk/keluar di halaman ruang kelas siswa memakai alamat yang benar, setelah masuk siswa tetap di halaman kelas, dan daftar permainan kelas tampil lengkap dengan jumlah soal.', 'en' => 'The join/leave buttons on the student classroom page use the right address, students stay on the classroom page after joining, and the class game list shows with question counts.'],
            ],
        ],
    ],
    [
        'version' => '0.30.0',
        'date' => '2026-10-13',
        'changes' => [
            [
                'key' => 'admin-questions-live-search',
                'type' => 'feature',
                'title' => ['id' => 'Pencarian langsung di Bank Soal', 'en' => 'Live search in the Question Bank'],
                'body' => ['id' => 'Bank Soal admin punya pencarian langsung: saran soal muncul saat mengetik (teks Indonesia, Inggris, atau kunci soal) dengan sorotan kata, navigasi keyboard, pintasan "/", dan tombol lihat semua hasil. Pencarian di daftar soal juga menyorot kata yang cocok.', 'en' => 'The admin Question Bank has live search: matching questions appear while typing (Indonesian or English text, or the question key) with highlighted matches, keyboard navigation, a "/" shortcut and a show-all-results button. The question list search highlights matches too.'],
            ],
            [
                'key' => 'admin-questions-restyle',
                'type' => 'improvement',
                'title' => ['id' => 'Tampilan baru Bank Soal', 'en' => 'Refreshed Question Bank layout'],
                'body' => ['id' => 'Ringkasan soal tampil sebagai kartu statistik, kartu mata pelajaran memakai ikon dan warna katalog mapel dengan bar soal aktif, dan semua filter daftar soal digabung dalam satu panel.', 'en' => 'Question totals show as stat cards, subject cards use the subject catalog icon and colour with an active-question bar, and all list filters are grouped in one panel.'],
            ],
        ],
    ],
    [
        'version' => '0.29.4',
        'date' => '2026-10-13',
        'changes' => [
            [
                'key' => 'admin-roles-accordion',
                'type' => 'improvement',
                'title' => ['id' => 'Halaman peran bergaya akordion dengan daftar izin', 'en' => 'Accordion roles page with permission lists'],
                'body' => ['id' => 'Halaman Peran admin kini tampil sebagai akordion. Setiap peran dapat dibuka untuk melihat izinnya yang dikelompokkan per modul, lengkap dengan jumlah pengguna, cakupan izin, serta tombol buka/tutup semua.', 'en' => 'The admin Roles page now uses an accordion. Each role expands to show its permissions grouped by module, with user count, permission coverage and an expand/collapse all button.'],
            ],
        ],
    ],
    [
        'version' => '0.29.3',
        'date' => '2026-10-12',
        'changes' => [
            [
                'key' => 'admin-generate-grade-level-panels',
                'type' => 'improvement',
                'title' => ['id' => 'Panel kelas dan tingkat soal di Buat soal AI', 'en' => 'Grade and level panels in AI generation'],
                'body' => ['id' => 'Pilihan kelas dikelompokkan per jenjang TK, SD, SMP, SMA dengan pilih per jenjang. Tingkat soal tampil sebagai kartu dengan penjelasan, bintang, poin, dan pengatur jumlah soal.', 'en' => 'Grades are grouped by TK, SD, SMP and SMA with per-stage picking. Question levels show as cards with a description, stars, points and a question amount stepper.'],
            ],
        ],
    ],
    [
        'version' => '0.29.2',
        'date' => '2026-10-12',
        'changes' => [
            [
                'key' => 'admin-generate-game-picker-search',
                'type' => 'improvement',
                'title' => ['id' => 'Pemilih game dengan pencarian di Buat soal AI', 'en' => 'Searchable game picker in AI generation'],
                'body' => ['id' => 'Bagian Gunakan di game kini berupa panel lebar dengan pencarian langsung, grid beberapa kolom, penghitung terpilih, dan tombol pilih yang tampil, tanpa menumpuk ke bawah.', 'en' => 'The Use in games section is now a full-width panel with live search, a multi-column grid, a picked counter, and pick-shown controls instead of a tall stacked list.'],
            ],
        ],
    ],
    [
        'version' => '0.29.1',
        'date' => '2026-10-12',
        'changes' => [
            [
                'key' => 'admin-generate-subject-accordion-style',
                'type' => 'improvement',
                'title' => ['id' => 'Akordeon per mapel di Buat soal AI', 'en' => 'Per-subject accordion in AI generation'],
                'body' => ['id' => 'Setiap mapel kini menjadi kartu akordeon sendiri dengan ikon, warna, ringkasan topik terpilih, serta tombol buka/tutup semua.', 'en' => 'Each subject is now its own accordion card with icon, colour, picked-topic summary, and expand/collapse all controls.'],
            ],
        ],
    ],
    [
        'version' => '0.29.0',
        'date' => '2026-10-12',
        'changes' => [
            [
                'key' => 'admin-topic-tree-generation',
                'type' => 'feature',
                'title' => ['id' => 'Pohon mapel & topik untuk soal AI', 'en' => 'Subject & topic tree for AI questions'],
                'body' => ['id' => 'Topik tampil sebagai anak mapel dengan akordeon di halaman Mapel. Buat soal AI kini memilih mapel atau topik: mapel penuh membuat soal untuk semua topiknya, topik terpilih hanya untuk topik itu.', 'en' => 'Topics show as children of each subject in a smooth accordion on the Subjects page. AI generation now picks subjects or topics: a whole subject covers all its topics, single topics cover only themselves.'],
            ],
        ],
    ],
    [
        'version' => '0.28.0',
        'date' => '2026-10-12',
        'changes' => [
            [
                'key' => 'admin-topic-focused-ai-generation',
                'type' => 'feature',
                'title' => ['id' => 'Topik mapel dan soal AI per topik', 'en' => 'Subject topics and topic-focused AI questions'],
                'body' => ['id' => 'Admin dapat menambah topik beserta deskripsi materi di halaman Mapel, lalu memilih mapel dan topik saat membuat soal dengan AI agar soal fokus pada topik tersebut.', 'en' => 'Admins can add topics with a material description on the Subjects page, then pick a subject and topic when generating AI questions so they stay focused on that topic.'],
            ],
        ],
    ],
    [
        'version' => '0.27.6',
        'date' => '2026-10-12',
        'changes' => [
            [
                'key' => 'classroom-question-filter-flow',
                'type' => 'fix',
                'title' => ['id' => 'Alur filter soal ruang kelas', 'en' => 'Classroom question filter flow'],
                'body' => ['id' => 'Soal baru dimuat setelah mapel dipilih, lalu hasil menyempit berdasarkan topik, tingkat, kelas, pencarian, dan filter lain.', 'en' => 'Questions load after a subject is selected, then narrow by topic, level, grade, search, and other filters.'],
            ],
        ],
    ],
    [
        'version' => '0.27.4',
        'date' => '2026-10-12',
        'changes' => [
            [
                'key' => 'classroom-question-settings-summary',
                'type' => 'improvement',
                'title' => ['id' => 'Ringkasan pengaturan soal di ruang kelas', 'en' => 'Show question settings in classroom'],
                'body' => ['id' => 'Soal yang dipilih kini menampilkan mapel, topik, tingkat kesulitan, dan kelas sasaran.', 'en' => 'Selected questions now show subject, topic, difficulty level, and target grade.'],
            ],
        ],
    ],
    [
        'version' => '0.27.3',
        'date' => '2026-10-12',
        'changes' => [
            [
                'key' => 'admin-mobile-card-layout-fix',
                'type' => 'fix',
                'title' => ['id' => 'Perbaikan kartu admin di mobile', 'en' => 'Fix admin cards on mobile'],
                'body' => ['id' => 'Kartu dashboard admin kini mengikuti lebar layar mobile dan tidak saling menumpuk atau meluber.', 'en' => 'Admin dashboard cards now fit mobile screen width without overlapping or overflowing.'],
            ],
        ],
    ],
    [
        'version' => '0.27.2',
        'date' => '2026-10-12',
        'changes' => [
            [
                'key' => 'teacher-classroom-detail-render-fix',
                'type' => 'fix',
                'title' => ['id' => 'Perbaikan halaman detail ruang kelas guru', 'en' => 'Fix teacher classroom detail page'],
                'body' => ['id' => 'Halaman detail ruang kelas kini menerima jalur undangan dan status AI yang diperlukan agar tidak blank setelah kelas dibuat.', 'en' => 'The classroom detail page now receives the invite path and AI status required to render after classroom creation.'],
            ],
        ],
    ],
    [
        'version' => '0.27.1',
        'date' => '2026-10-12',
        'changes' => [
            [
                'key' => 'teacher-classroom-header-navigation',
                'type' => 'improvement',
                'title' => ['id' => 'Navigasi ruang kelas di halaman guru', 'en' => 'Classroom navigation on teacher page'],
                'body' => ['id' => 'Tombol Ruang Kelas kini sejajar dengan tombol impor dan buat soal di halaman bank soal guru.', 'en' => 'The Classroom button now sits alongside Import and Create question on the teacher question bank page.'],
            ],
        ],
    ],
    [
        'version' => '0.27.0',
        'date' => '2026-10-11',
        'changes' => [
            [
                'key' => 'teacher-access-requests-and-subject-scopes',
                'type' => 'feature',
                'title' => ['id' => 'Request guru dan pembatasan mata pelajaran', 'en' => 'Teacher access requests and subject scopes'],
                'body' => ['id' => 'Pengguna dapat request menjadi guru. Admin dapat menyetujui request, menetapkan semua atau mata pelajaran tertentu, dan portal pembuatan soal hanya menampilkan mata pelajaran yang ditugaskan.', 'en' => 'Users can request teacher access. Admins can approve requests, assign all or selected subjects, and the question authoring portal only shows assigned subjects.'],
            ],
        ],
    ],
    [
        'version' => '0.26.1',
        'date' => '2026-10-11',
        'changes' => [
            [
                'key' => 'teacher-topics-production-render-fix',
                'type' => 'fix',
                'title' => ['id' => 'Perbaikan halaman topik guru', 'en' => 'Fix teacher topics page rendering'],
                'body' => ['id' => 'Halaman topik guru kini merender aman di produksi dengan struktur tombol valid dan nama mata pelajaran dari data halaman.', 'en' => 'The teacher topics page now renders safely in production with valid button structure and subject names from page data.'],
            ],
        ],
    ],
    [
        'version' => '0.26.0',
        'date' => '2026-10-11',
        'changes' => [
            [
                'key' => 'player-account-about-link',
                'type' => 'feature',
                'title' => ['id' => 'Menu Tentang di Akun pemain', 'en' => 'About link in player account menu'],
                'body' => ['id' => 'Menu Akun pemain kini menyediakan tautan Tentang ke halaman /about tepat di atas tombol Keluar.', 'en' => 'The player Account menu now provides an About link to /about directly above the Log out button.'],
            ],
        ],
    ],
    [
        'version' => '0.25.0',
        'date' => '2026-10-11',
        'changes' => [
            [
                'key' => 'portal-school-ranking-pin-dialog',
                'type' => 'feature',
                'title' => ['id' => 'Peringkat sekolah dan modal PIN di portal', 'en' => 'School ranking and PIN dialog on portal'],
                'body' => ['id' => 'Portal kini menampilkan sekolah terbaik berdasarkan akumulasi poin pemain dan membuka modal PIN saat field PIN disentuh.', 'en' => 'The portal now shows top schools by accumulated player points and opens a PIN dialog when the PIN field receives focus.'],
            ],
        ],
    ],
    [
        'version' => '0.24.2',
        'date' => '2026-10-11',
        'changes' => [
            [
                'key' => 'portal-clickable-items',
                'type' => 'improvement',
                'title' => ['id' => 'Item portal dapat diklik', 'en' => 'Portal items are clickable'],
                'body' => ['id' => 'Kartu statistik, game populer, skor tertinggi, performa mata pelajaran, judul game, dan riwayat permainan kini memiliki navigasi langsung.', 'en' => 'Stats cards, popular games, top scores, subject performance, game titles, and play history now provide direct navigation.'],
            ],
        ],
    ],
    [
        'version' => '0.24.0',
        'date' => '2026-10-11',
        'changes' => [
            [
                'key' => 'dynamic-news-portal',
                'type' => 'feature',
                'title' => ['id' => 'Portal data dinamis EduFunHub', 'en' => 'Dynamic EduFunHub data portal'],
                'body' => ['id' => 'Portal pemain kini menampilkan tren game berdasarkan periode, skor tertinggi sepanjang masa, performa mata pelajaran, dan ringkasan aktivitas EduFunHub.', 'en' => 'The player portal now shows period-based game trends, all-time highest scores, subject performance, and an EduFunHub activity pulse.'],
            ],
        ],
    ],
    [
        'version' => '0.23.4',
        'date' => '2026-10-11',
        'changes' => [
            [
                'key' => 'teacher-stat-card-inline-value',
                'type' => 'improvement',
                'title' => ['id' => 'Ikon dan angka statistik guru satu baris', 'en' => 'Teacher stat icons and values on one line'],
                'body' => ['id' => 'Kartu statistik guru kini menampilkan ikon dan angka dalam satu baris agar lebih ringkas dan mudah dipindai.', 'en' => 'Teacher stat cards now show icons and values on one line for a more compact, scannable layout.'],
            ],
        ],
    ],
    [
        'version' => '0.23.3',
        'date' => '2026-10-11',
        'changes' => [
            [
                'key' => 'teacher-topics-render-data',
                'type' => 'fix',
                'title' => ['id' => 'Perbaikan render data Materi guru', 'en' => 'Fix teacher topics data rendering'],
                'body' => ['id' => 'Halaman Materi guru memakai data mata pelajaran dari props halaman secara langsung agar tidak blank saat katalog bersama belum siap.', 'en' => 'Teacher Topics now reads subject data directly from page props so it does not go blank when the shared catalog is not ready.'],
            ],
        ],
    ],
    [
        'version' => '0.23.2',
        'date' => '2026-10-11',
        'changes' => [
            [
                'key' => 'teacher-topics-blank-page',
                'type' => 'fix',
                'title' => ['id' => 'Perbaikan halaman Materi guru yang blank', 'en' => 'Fix blank teacher topics page'],
                'body' => ['id' => 'Halaman Materi guru kembali merender normal dan tombol tambah materi tidak lagi memakai tombol bersarang.', 'en' => 'Teacher Topics renders normally again and the add-topic control no longer uses nested buttons.'],
            ],
        ],
    ],
    [
        'version' => '0.23.1',
        'date' => '2026-10-11',
        'changes' => [
            [
                'key' => 'teacher-classroom-menu',
                'type' => 'fix',
                'title' => ['id' => 'Menu ruang kelas guru di navigasi', 'en' => 'Teacher classroom menu in navigation'],
                'body' => ['id' => 'Guru kini bisa membuka fitur Ruang Kelas langsung dari menu Akun di navigasi utama.', 'en' => 'Teachers can now open Classrooms directly from the Account menu in the main navigation.'],
            ],
        ],
    ],
    [
        'version' => '0.23.0',
        'date' => '2026-10-11',
        'changes' => [
            [
                'key' => 'solo-game-filter',
                'type' => 'feature',
                'title' => ['id' => 'Filter game sendiri di halaman game', 'en' => 'Solo game filter on gamelist page'],
                'body' => ['id' => 'Tombol filter baru "Sendiri" di /gamelist menampilkan game yang bisa dimainkan solo (min_players=1).', 'en' => 'New "Solo" filter button on /gamelist shows games playable solo (min_players=1).'],
            ],
            [
                'key' => 'piechart-hover-fix',
                'type' => 'fix',
                'title' => ['id' => 'Perbaikan efek hover PieChart', 'en' => 'PieChart hover effect fix'],
                'body' => ['id' => 'Efek hover PieChart di halaman analisa subject diperbaiki jadi membesarkan slice saja tanpa merusak bentuk donut.', 'en' => 'PieChart hover effect on subject analysis pages fixed to only enlarge the slice without breaking the donut shape.'],
            ],
        ],
    ],
    [
        'version' => '0.22.0',
        'date' => '2026-10-11',
        'changes' => [
            [
                'key' => 'subject-topics',
                'type' => 'feature',
                'title' => ['id' => 'Sub subject dan materi per pelajaran', 'en' => 'Subject topics and materials'],
                'body' => ['id' => 'Setiap mata pelajaran kini bisa punya sub subject (materi) dengan deskripsi teks. Admin dan guru bisa menambah, mengedit, dan menghapus materi. AI membuat soal berdasarkan materi yang dipilih.', 'en' => 'Every subject can now have sub-subjects (topics) with descriptive text. Admins and teachers can add, edit and delete topics. The AI generates questions based on the chosen topic.'],
            ],
            [
                'key' => 'teacher-level-topic-game-picker',
                'type' => 'feature',
                'title' => ['id' => 'Guru pilih level, sub subject, dan game saat buat soal', 'en' => 'Teacher picks level, topic and games when creating questions'],
                'body' => ['id' => 'Guru bisa memilih tingkat kesulitan (Mudah/Menengah/Sulit), sub subject (materi), dan game mana yang memakai soal tersebut, plus halaman analisa soal guru identik dengan analisa soal AI tanpa data pribadi.', 'en' => 'Teachers can set question difficulty (Easy/Intermediate/Hard), choose a topic (material) and pick which games use the question, plus a teacher question analysis page identical to the AI analysis without personal data.'],
            ],
            [
                'key' => 'teacher-classrooms',
                'type' => 'feature',
                'title' => ['id' => 'Ruang kelas guru dengan PIN, jadwal, dan pemantauan live', 'en' => 'Teacher classrooms with PIN, schedule and live monitoring'],
                'body' => ['id' => 'Guru bisa membuat ruangan dengan PIN 6 digit, memilih game dan soal per game, menentukan jadwal aktif dan durasi. Pemantauan live: siapa masuk, sedang bermain apa, skor. Setelah selesai: analisa per game, per mapel, per topik, soal tersulit, wawasan, dan AI. Laporan per siswa bisa dibagikan ke masing-masing siswa lewat notifikasi in-app. Layanan game Go memakai soal pilihan guru secara eksklusif di ruangan.', 'en' => 'Teachers can create rooms with a 6-digit PIN, pick games and questions per game, set the active window and duration. Live monitoring: who is in, what they are playing, scores. Post-game: analysis per game, subject, topic, hardest questions, insights and AI. Per-student reports can be shared via in-app notification. The Go game service uses the teacher\'s picked questions exclusively in the room.'],
            ],
        ],
    ],
    [
        'version' => '0.21.0',
        'date' => '2026-10-11',
        'changes' => [
            [
                'key' => 'classroom-pages',
                'type' => 'feature',
                'title' => ['id' => 'Halaman ruang kelas live & portal siswa', 'en' => 'Classroom live monitor & student portal pages'],
                'body' => ['id' => 'Halaman baru: monitor live ruang kelas guru (KPI, tabel anggota, bagikan, analisis AI), portal siswa masuk PIN, laporan pribadi siswa, analisis soal guru, dan manajemen topik.', 'en' => 'New pages: teacher classroom live monitor (KPIs, member table, share, AI analysis), student PIN portal, student personal report, teacher question analysis, and topic management.'],
            ],
        ],
    ],
    [
        'version' => '0.20.0',
        'date' => '2026-10-10',
        'changes' => [
            [
                'key' => 'subject-mastery-analysis',
                'type' => 'feature',
                'title' => ['id' => 'Analisa penguasaan materi per subject', 'en' => 'Subject mastery analysis'],
                'body' => ['id' => 'Halaman analisa subject menampilkan penguasaan materi, kelas unggulan, perbandingan tingkat soal dan permainan, serta soal yang perlu perhatian berdasarkan jawaban tercatat.', 'en' => 'Subject analysis shows mastery rates, leading grades, question-level and game comparisons, and questions needing attention based on recorded answers.'],
            ],
            [
                'key' => 'screen-time-cell-details',
                'type' => 'improvement',
                'title' => ['id' => 'Tooltip detail aktivitas layar', 'en' => 'Screen activity detail tooltips'],
                'body' => ['id' => 'Kotak aktivitas layar menampilkan hari, rentang jam, total waktu aktif, dan porsi periode melalui hover, fokus keyboard, atau ketukan.', 'en' => 'Screen activity cells show weekday, hour range, total active time, and period share on hover, keyboard focus, or tap.'],
            ],
        ],
    ],
    [
        'version' => '0.19.1',
        'date' => '2026-10-10',
        'changes' => [
            [
                'key' => 'nav-landing-link',
                'type' => 'improvement',
                'title' => [
                    'id' => 'Menu Landing di navigasi pemain',
                    'en' => 'Landing link in the player navigation',
                ],
                'body' => [
                    'id' => 'Pemain yang sudah masuk kini punya menu Landing di urutan pertama navigasi atas (dan di panel Menu pada HP) untuk kembali ke halaman landing EduFunHub.',
                    'en' => 'Signed-in players now get a Landing link first in the top navigation (and in the phone Menu panel) to go back to the EduFunHub landing page.',
                ],
            ],
        ],
    ],
    [
        'version' => '0.19.0',
        'date' => '2026-10-10',
        'changes' => [
            [
                'key' => 'auto-ability-analysis',
                'type' => 'feature',
                'title' => [
                    'id' => 'Analisa kemampuan AI otomatis per jumlah soal harian',
                    'en' => 'Automatic AI ability analysis by daily answered questions',
                ],
                'body' => [
                    'id' => 'AI kini menganalisa kemampuan pemain secara otomatis begitu ia menjawab 100 soal dalam satu hari (WIB), lalu setiap 150 soal berikutnya di hari yang sama (soal ke-100, 250, 400, …). Hitungan mulai lagi dari 0 setiap pukul 00.00. Hasilnya langsung dikirim ke WhatsApp pemain, lengkap dengan naik turun nilai per mata pelajaran dan rata-rata dibanding analisa terakhir (di hari yang sama maupun hari sebelumnya), plus cerita perkembangan dari AI. Super admin bisa menyalakan/mematikan fitur ini dan mengubah angka 100/150 di Pengaturan AI; riwayat analisa memberi label Otomatis.',
                    'en' => 'The AI now analyses a player automatically once they answer 100 questions in one day (Jakarta time), then every 150 more on the same day (question 100, 250, 400, …). The count restarts at midnight. The result goes straight to the player\'s WhatsApp with the score change per subject and on average against the latest analysis (same day or earlier), plus the AI\'s progress story. Super admins can turn it on or off and change the 100/150 thresholds in AI Settings; the analysis history labels these runs Automatic.',
                ],
            ],
        ],
    ],
    [
        'version' => '0.18.0',
        'date' => '2026-10-10',
        'changes' => [
            [
                'key' => 'multi-subject-games',
                'type' => 'feature',
                'title' => [
                    'id' => 'Pilih beberapa mata pelajaran sekaligus di game',
                    'en' => 'Pick several subjects at once in games',
                ],
                'body' => [
                    'id' => 'Pemilih mata pelajaran di semua game kini bisa memilih lebih dari satu mata pelajaran (misalnya Matematika + IPA), tidak hanya satu atau Campuran (semua). Ketuk mata pelajaran untuk menambah atau melepasnya; jika semua dilepas, kembali ke Campuran. Soal hanya diambil dari mata pelajaran yang dipilih, dan soal hitungan otomatis hanya muncul bila Matematika ikut dipilih.',
                    'en' => 'The subject picker in every game now accepts more than one subject (for example Math + Science), not just one or Mixed (all). Tap a subject to add or remove it; clearing them all returns to Mixed. Questions come only from the chosen subjects, and generated arithmetic appears only when Math is among them.',
                ],
            ],
        ],
    ],
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
