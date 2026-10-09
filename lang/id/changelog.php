<?php

return [
    'flash' => [
        'created' => 'Catatan changelog versi :version ditambahkan.',
        'updated' => 'Catatan changelog versi :version disimpan.',
        'deleted' => 'Catatan changelog versi :version dihapus.',
    ],
    'validation' => [
        'version_required' => 'Isi nomor versi.',
        'version_format' => 'Versi harus mengikuti Semantic Versioning, misalnya 0.1.0 atau 1.0.0-beta.1.',
        'title_required' => 'Isi judul perubahan.',
        'body_required' => 'Isi keterangan perubahan.',
        'type' => 'Pilih jenis perubahan: fitur baru, peningkatan, atau perbaikan.',
        'recorded' => 'Perubahan ini tercatat otomatis dari riwayat rilis dan tidak dapat diubah atau dihapus di sini.',
    ],
];
