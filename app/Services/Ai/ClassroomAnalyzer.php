<?php

namespace App\Services\Ai;

use App\Ai\Agents\ClassroomAnalyst;
use App\Models\Classroom;
use Illuminate\Support\Str;
use JsonException;
use RuntimeException;
use TypeError;

/**
 * Sends classroom play data to the configured AI model and normalises the
 * reply into per-student feedback.
 */
class ClassroomAnalyzer
{
    public function __construct(private OpenAiCompatibleClient $client, private AiSettings $settings) {}

    /**
     * @return array{summary: string, students: list<array{member_id: int, feedback: string}>}
     *
     * @throws RuntimeException
     */
    public function analyze(Classroom $classroom): array
    {
        $provider = $this->client->register();
        $model = (string) $this->settings->model();

        $snapshot = $this->buildSnapshot($classroom);
        $prompt = "Data hasil belajar kelas berikut: (JSON)\n" . json_encode($snapshot, JSON_UNESCAPED_UNICODE);

        try {
            $response = (new ClassroomAnalyst)->prompt($prompt, provider: $provider, model: $model, timeout: 120);
            $reply = $response->toArray();
        } catch (TypeError|JsonException $exception) {
            throw new RuntimeException(__('ai.bad_response', ['model' => $model]), previous: $exception);
        }

        return is_array($reply) ? $this->normalize($reply) : ['summary' => '', 'students' => []];
    }

    /**
     * @param  array<string, mixed>  $reply
     * @return array{summary: string, students: list<array{member_id: int, feedback: string}>}
     */
    public function normalize(array $reply): array
    {
        $summary = Str::limit(trim(strip_tags((string) ($reply['summary'] ?? ''))), 1500, '…');
        $students = [];

        if (is_array($reply['students'] ?? null)) {
            foreach ($reply['students'] as $student) {
                if (is_array($student) && isset($student['member_id'], $student['feedback'])) {
                    $students[] = [
                        'member_id' => (int) $student['member_id'],
                        'feedback' => Str::limit(trim(strip_tags((string) $student['feedback'])), 1500, '…'),
                    ];
                }
            }
        }

        return ['summary' => $summary, 'students' => $students];
    }

    /**
     * @return array<string, mixed>
     */
    private function buildSnapshot(Classroom $classroom): array
    {
        $members = $classroom->members()
            ->whereNull('left_at')
            ->with('user.playerProfile')
            ->get();

        $students = [];
        foreach ($members as $i => $member) {
            $stats = $member->user->gameHistories()
                ->where('classroom_id', $classroom->id)
                ->selectRaw('COALESCE(SUM(correct), 0) as correct, COALESCE(SUM(wrong), 0) as wrong')
                ->first();

            $answered = (int) ($stats?->correct ?? 0) + (int) ($stats?->wrong ?? 0);
            $correct = (int) ($stats?->correct ?? 0);

            $students[] = [
                'member_label' => 'Siswa ' . ($i + 1),
                'plays' => $member->user->gameHistories()->where('classroom_id', $classroom->id)->count(),
                'answered' => $answered,
                'correct' => $correct,
                'accuracy' => $answered > 0 ? round($correct / $answered * 100, 1) : null,
                'grade' => $member->user->playerProfile?->grade,
            ];
        }

        return [
            'classroom_name' => $classroom->name,
            'total_students' => $members->count(),
            'students' => $students,
        ];
    }
}
