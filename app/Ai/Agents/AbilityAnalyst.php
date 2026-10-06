<?php

namespace App\Ai\Agents;

use Illuminate\Contracts\JsonSchema\JsonSchema;
use Laravel\Ai\Contracts\Agent;
use Laravel\Ai\Contracts\HasProviderOptions;
use Laravel\Ai\Contracts\HasStructuredOutput;
use Laravel\Ai\Enums\Lab;
use Laravel\Ai\Promptable;

/**
 * Reads a player's aggregated game results and writes an ability analysis
 * for teachers and parents, in Indonesian.
 */
class AbilityAnalyst implements Agent, HasProviderOptions, HasStructuredOutput
{
    use Promptable;

    /**
     * One JSON reply: some OpenAI-compatible gateways stream unless told otherwise.
     *
     * @return array<string, mixed>
     */
    public function providerOptions(Lab|string $provider): array
    {
        return ['stream' => false];
    }

    public function instructions(): string
    {
        return <<<'TEXT'
        Kamu adalah psikolog pendidikan dan guru berpengalaman untuk EduFunHub, portal game edukasi bagi siswa Indonesia (TK, SD, SMP, SMA, Kurikulum Merdeka).
        Kamu menerima data JSON hasil bermain seorang peserta (disebut "Peserta"; identitas disamarkan). Tugasmu: analisa kemampuan belajarnya.
        Aturan:
        - Tulis seluruh jawaban dalam Bahasa Indonesia yang hangat, jelas dan mudah dipahami guru serta orang tua.
        - Jelaskan secara rinci dengan mempertimbangkan usia dan kelas Peserta: bandingkan dengan apa yang wajar untuk usia/kelas itu dan dengan rata-rata teman sekelas (peer_accuracy) bila ada.
        - Dasarkan setiap kesimpulan pada angka di data (akurasi, jumlah soal, tren 30 hari, tingkat kesulitan, konsistensi). Sebut angkanya bila membantu. Jangan mengarang data yang tidak ada.
        - Jika data sedikit (sedikit permainan atau soal), katakan itu dan turunkan confidence.
        - Bila ada previous_assessments, bandingkan perkembangan sejak analisa sebelumnya di progress_vs_previous; jika tidak ada, tulis bahwa ini analisa pertama.
        - subject_scores: skor kemampuan 0-100 per mata pelajaran yang ada di data (pakai key mata pelajaran dari data), berdasarkan akurasi, jumlah soal dan tingkat kesulitan.
        - strengths dan weaknesses: 2-5 poin singkat dan spesifik.
        - game_insights: 1-5 pengamatan per permainan (pola main, kecepatan, tren).
        - recommendations: 3-6 saran konkret untuk guru/orang tua (kegiatan, durasi, jenis latihan, permainan yang cocok).
        - learning_style: perkiraan gaya belajar beserta alasannya, singkat.
        - confidence: "rendah", "sedang" atau "tinggi" sesuai banyaknya data.
        - Bersikap positif dan membangun; jangan memberi label negatif atau diagnosis medis.
        Kembalikan JSON saja sesuai skema.
        TEXT;
    }

    public function schema(JsonSchema $schema): array
    {
        return [
            'summary' => $schema->string()->required(),
            'strengths' => $schema->array()->items($schema->string())->required(),
            'weaknesses' => $schema->array()->items($schema->string())->required(),
            'subject_scores' => $schema->array()->items($schema->object([
                'subject' => $schema->string()->required(),
                'score' => $schema->integer()->min(0)->max(100)->required(),
            ]))->required(),
            'game_insights' => $schema->array()->items($schema->string())->required(),
            'recommendations' => $schema->array()->items($schema->string())->required(),
            'learning_style' => $schema->string()->required(),
            'progress_vs_previous' => $schema->string()->required(),
            'confidence' => $schema->string()->enum(['rendah', 'sedang', 'tinggi'])->required(),
        ];
    }
}
