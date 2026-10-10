<?php

return [
    'events' => [
        'welcome' => "Halo :name! 👋\n\nSelamat datang di *:app*. Nomor WhatsApp ini sudah tersimpan, jadi kami akan mengabari kamu tentang hasil analisa belajar, permintaan pertemanan, dan info penting lainnya.\n\nYuk lanjut main sambil belajar: :url\n\nTidak mau menerima pesan WhatsApp? Matikan di halaman profil.",
        'ability_analysis' => "Halo :name! 📊\n\nAnalisa kemampuan belajar kamu sudah selesai.\n\n*Ringkasan*\n:summary\n\n*Kekuatan kamu*\n:strengths\n\n*Saran belajar*\n:tips\n\nLihat analisa lengkapnya: :link",
        'friend_request' => "Halo :name! 🤝\n\n*:from* ingin berteman denganmu di :app.\n\nTerima atau tolak permintaannya di sini: :link",
        'test' => 'Pesan uji dari *:app*. Jika pesan ini masuk, notifikasi WhatsApp sudah tersambung. ✅',
    ],
    'ability' => [
        'greeting' => 'Halo :name! Hasil analisa kemampuan belajarmu sudah keluar. 🎉',
        'title' => 'Hasil Analisa EduFunHub',
        'date' => 'Dianalisa :date',
        'summary' => 'Ringkasan',
        'scores' => 'Nilai per mapel',
        'strengths' => 'Kekuatan',
        'growth' => 'Perlu ditingkatkan',
        'tips' => 'Saran belajar',
        'style' => 'Gaya belajar',
        'progress' => 'Perkembangan sejak analisa sebelumnya',
        'footer' => 'Lihat hasil analisa lengkap: :url',
    ],
    'validation' => [
        'number' => 'Nomor WhatsApp tidak valid. Contoh: 081234567890.',
        'player_number' => 'Nomor WhatsApp harus diawali 0, 62, atau +62. Contoh: 081234567890.',
        'taken' => 'Nomor WhatsApp ini sudah dipakai akun lain.',
        'filter' => 'Filter log tidak valid.',
        'events' => 'Pengaturan notifikasi tidak valid.',
    ],
    'errors' => [
        'not_configured' => 'Layanan WhatsApp belum dikonfigurasi.',
        'unreachable' => 'Container WhatsApp (GOWA) tidak bisa dihubungi.',
        'unauthorized' => 'Login ke container WhatsApp ditolak. Periksa WHATSAPP_GOWA_USER dan WHATSAPP_GOWA_PASSWORD.',
        'not_logged_in' => 'Nomor WhatsApp pengirim belum tersambung. Scan QR di halaman Notifikasi WhatsApp.',
        'gateway' => 'WhatsApp menolak permintaan: :message',
        'no_qr' => 'QR code belum tersedia. Coba lagi beberapa detik lagi.',
        'no_code' => 'Kode pairing tidak diterima dari WhatsApp.',
        'send_failed' => 'Pesan WhatsApp gagal dikirim.',
    ],
    'skipped' => [
        'master_off' => 'Tidak dikirim: saklar utama notifikasi WhatsApp sedang mati.',
        'event_off' => 'Tidak dikirim: jenis pesan ini sedang dimatikan.',
    ],
    'flash' => [
        'settings_saved' => 'Pengaturan notifikasi WhatsApp tersimpan.',
        'logged_out' => 'Nomor WhatsApp pengirim diputus.',
        'reconnected' => 'Menyambung ulang ke WhatsApp.',
        'test_queued' => 'Pesan uji dikirim ke antrean.',
        'retried' => 'Pesan dikirim ulang ke antrean.',
    ],
];
