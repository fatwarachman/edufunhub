<?php

return [
    'flash' => [
        'created' => 'Mata pelajaran “:name” ditambahkan.',
        'updated' => 'Mata pelajaran “:name” disimpan.',
        'shown' => 'Mata pelajaran “:name” tampil lagi di game.',
        'hidden' => 'Mata pelajaran “:name” disembunyikan dari game.',
        'deleted' => 'Mata pelajaran “:name” dihapus.',
    ],
    'validation' => [
        'key_required' => 'Isi nama atau kunci mata pelajaran.',
        'key_format' => 'Kunci hanya boleh huruf kecil, angka, dan tanda hubung (2–30 karakter, diawali huruf).',
        'key_reserved' => 'Kunci ini dipakai untuk pilihan campuran.',
        'key_taken' => 'Kunci ini sudah dipakai mata pelajaran lain.',
        'name_required' => 'Isi nama mata pelajaran dalam bahasa Indonesia.',
        'name_taken' => 'Nama ini sudah dipakai mata pelajaran lain.',
        'color' => 'Pilih warna yang valid.',
        'system_delete' => 'Mata pelajaran bawaan tidak bisa dihapus. Sembunyikan saja.',
        'has_questions' => 'Mata pelajaran ini masih punya :count soal. Pindahkan atau hapus soalnya dulu, atau sembunyikan mata pelajarannya.',
        'last_active' => 'Minimal satu mata pelajaran harus tetap tampil di game.',
    ],
];
