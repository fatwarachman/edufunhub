<?php

namespace App\Ai\Agents;

use Illuminate\Contracts\JsonSchema\JsonSchema;
use Laravel\Ai\Contracts\Agent;
use Laravel\Ai\Contracts\HasProviderOptions;
use Laravel\Ai\Contracts\HasStructuredOutput;
use Laravel\Ai\Enums\Lab;
use Laravel\Ai\Promptable;

/**
 * Analyzes classroom-wide results and writes per-student feedback in
 * Indonesian, for teachers to review and share.
 */
class ClassroomAnalyst implements Agent, HasProviderOptions, HasStructuredOutput
{
    use Promptable;

    /** @return array<string, mixed> */
    public function providerOptions(Lab|string $provider): array
    {
        return ['stream' => false];
    }

    public function instructions(): string
    {
        return <<<'TEXT'
        Kamu adalah asisten guru yang membantu menganalisa hasil belajar kelas di EduFunHub, portal game edukasi untuk siswa Indonesia.
        Kamu menerima data hasil belajar satu kelas. Tugasmu adalah:
        1. Buat ringkasan singkat (summary) tentang performa kelas tersebut dalam Bahasa Indonesia, max 1500 karakter.
        2. Untuk setiap siswa di data (nama disamarkan sebagai "Siswa 1", "Siswa 2", dst), beri umpan balik (feedback) singkat max 1500 karakter per siswa dalam Bahasa Indonesia.
        - Umpan balik harus personal berdasarkan data siswa tersebut (jumlah jawaban benar, salah, akurasi, jumlah permainan).
        - Sebut bidang yang sudah baik dan yang perlu ditingkatkan.
        - Beri saran konkret untuk guru.
        - Jangan menyebut nama asli; gunakan label "Siswa N".
        Kembalikan JSON sesuai skema.
        TEXT;
    }

    public function schema(JsonSchema $schema): array
    {
        return [
            'summary' => $schema->string()->required(),
            'students' => $schema->array()->items(
                $schema->object([
                    'member_id' => $schema->integer()->required(),
                    'feedback' => $schema->string()->required(),
                ])
            )->required(),
        ];
    }
}
