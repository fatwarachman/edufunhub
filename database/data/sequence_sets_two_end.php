<?php

/**
 * Two-end TKJ cable sets (Order Rush): a patch cable crimped on both sides.
 * Items list end A then end B. Mirrors services/game/internal/orderrush
 * BuiltinSets (utp-straight, utp-cross).
 *
 * @return list<array{key: string, category: string, kind: string, title_id: string, title_en: string, description_id: string, description_en: string, ends: list<array{id: string, en: string}>, items: list<array{label_id: string, label_en: string, color: string, stripe?: string}>, sort_order: int}>
 */
return [
    [
        'key' => 'utp-straight',
        'category' => 'UTP_STRAIGHT',
        'kind' => 'cable',
        'title_id' => 'Kabel Straight (T568B ↔ T568B)',
        'title_en' => 'Straight cable (T568B ↔ T568B)',
        'description_id' => 'Crimping kedua ujung: PC ke switch/router. Ujung A dan B sama-sama T568B.',
        'description_en' => 'Crimp both ends: PC to switch/router. Ends A and B are both T568B.',
        'ends' => [
            ['id' => 'Ujung A (T568B)', 'en' => 'End A (T568B)'],
            ['id' => 'Ujung B (T568B)', 'en' => 'End B (T568B)'],
        ],
        'items' => [
            ['label_id' => 'Putih-Orange', 'label_en' => 'White-Orange', 'color' => '#f8fafc', 'stripe' => '#f97316'],
            ['label_id' => 'Orange', 'label_en' => 'Orange', 'color' => '#f97316'],
            ['label_id' => 'Putih-Hijau', 'label_en' => 'White-Green', 'color' => '#f8fafc', 'stripe' => '#16a34a'],
            ['label_id' => 'Biru', 'label_en' => 'Blue', 'color' => '#2563eb'],
            ['label_id' => 'Putih-Biru', 'label_en' => 'White-Blue', 'color' => '#f8fafc', 'stripe' => '#2563eb'],
            ['label_id' => 'Hijau', 'label_en' => 'Green', 'color' => '#16a34a'],
            ['label_id' => 'Putih-Cokelat', 'label_en' => 'White-Brown', 'color' => '#f8fafc', 'stripe' => '#7c4a1e'],
            ['label_id' => 'Cokelat', 'label_en' => 'Brown', 'color' => '#7c4a1e'],
            ['label_id' => 'Putih-Orange', 'label_en' => 'White-Orange', 'color' => '#f8fafc', 'stripe' => '#f97316'],
            ['label_id' => 'Orange', 'label_en' => 'Orange', 'color' => '#f97316'],
            ['label_id' => 'Putih-Hijau', 'label_en' => 'White-Green', 'color' => '#f8fafc', 'stripe' => '#16a34a'],
            ['label_id' => 'Biru', 'label_en' => 'Blue', 'color' => '#2563eb'],
            ['label_id' => 'Putih-Biru', 'label_en' => 'White-Blue', 'color' => '#f8fafc', 'stripe' => '#2563eb'],
            ['label_id' => 'Hijau', 'label_en' => 'Green', 'color' => '#16a34a'],
            ['label_id' => 'Putih-Cokelat', 'label_en' => 'White-Brown', 'color' => '#f8fafc', 'stripe' => '#7c4a1e'],
            ['label_id' => 'Cokelat', 'label_en' => 'Brown', 'color' => '#7c4a1e'],
        ],
        'sort_order' => 22,
    ],
    [
        'key' => 'utp-cross',
        'category' => 'UTP_CROSS',
        'kind' => 'cable',
        'title_id' => 'Kabel Cross (T568B ↔ T568A)',
        'title_en' => 'Crossover cable (T568B ↔ T568A)',
        'description_id' => 'Crimping kedua ujung: PC ke PC, switch ke switch. Ujung A T568B, ujung B T568A.',
        'description_en' => 'Crimp both ends: PC to PC, switch to switch. End A is T568B, end B is T568A.',
        'ends' => [
            ['id' => 'Ujung A (T568B)', 'en' => 'End A (T568B)'],
            ['id' => 'Ujung B (T568A)', 'en' => 'End B (T568A)'],
        ],
        'items' => [
            ['label_id' => 'Putih-Orange', 'label_en' => 'White-Orange', 'color' => '#f8fafc', 'stripe' => '#f97316'],
            ['label_id' => 'Orange', 'label_en' => 'Orange', 'color' => '#f97316'],
            ['label_id' => 'Putih-Hijau', 'label_en' => 'White-Green', 'color' => '#f8fafc', 'stripe' => '#16a34a'],
            ['label_id' => 'Biru', 'label_en' => 'Blue', 'color' => '#2563eb'],
            ['label_id' => 'Putih-Biru', 'label_en' => 'White-Blue', 'color' => '#f8fafc', 'stripe' => '#2563eb'],
            ['label_id' => 'Hijau', 'label_en' => 'Green', 'color' => '#16a34a'],
            ['label_id' => 'Putih-Cokelat', 'label_en' => 'White-Brown', 'color' => '#f8fafc', 'stripe' => '#7c4a1e'],
            ['label_id' => 'Cokelat', 'label_en' => 'Brown', 'color' => '#7c4a1e'],
            ['label_id' => 'Putih-Hijau', 'label_en' => 'White-Green', 'color' => '#f8fafc', 'stripe' => '#16a34a'],
            ['label_id' => 'Hijau', 'label_en' => 'Green', 'color' => '#16a34a'],
            ['label_id' => 'Putih-Orange', 'label_en' => 'White-Orange', 'color' => '#f8fafc', 'stripe' => '#f97316'],
            ['label_id' => 'Biru', 'label_en' => 'Blue', 'color' => '#2563eb'],
            ['label_id' => 'Putih-Biru', 'label_en' => 'White-Blue', 'color' => '#f8fafc', 'stripe' => '#2563eb'],
            ['label_id' => 'Orange', 'label_en' => 'Orange', 'color' => '#f97316'],
            ['label_id' => 'Putih-Cokelat', 'label_en' => 'White-Brown', 'color' => '#f8fafc', 'stripe' => '#7c4a1e'],
            ['label_id' => 'Cokelat', 'label_en' => 'Brown', 'color' => '#7c4a1e'],
        ],
        'sort_order' => 24,
    ],
];
