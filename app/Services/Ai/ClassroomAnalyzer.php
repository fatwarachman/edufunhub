<?php

namespace App\Services\Ai;

use App\Ai\Agents\ClassroomAnalyst;
use App\Models\Classroom;
use App\Models\Subject;
use App\Services\Classrooms\ClassroomReport;
use Illuminate\Support\Str;
use JsonException;
use RuntimeException;
use TypeError;

/**
 * Sends classroom play data to the configured AI model and normalises the
 * reply into a class summary plus per-student feedback.
 *
 * Students are anonymised as "Siswa N": names never leave the app. The
 * model answers with those labels, which are mapped back to member ids
 * here, so a made-up label or id can never write feedback to another row.
 */
class ClassroomAnalyzer
{
    public const MAX_STUDENTS = 60;

    public function __construct(
        private OpenAiCompatibleClient $client,
        private AiSettings $settings,
        private ClassroomReport $report,
    ) {}

    /**
     * @return array{summary: array<string, list<string>>, students: list<array{member_id: int, feedback: array<string, list<string>>}>}
     *
     * @throws RuntimeException
     */
    public function analyze(Classroom $classroom): array
    {
        $provider = $this->client->register();
        $model = (string) $this->settings->model();

        ['snapshot' => $snapshot, 'labels' => $labels] = $this->buildSnapshot($classroom);
        $prompt = "Data hasil belajar kelas berikut: (JSON)\n".json_encode($snapshot, JSON_UNESCAPED_UNICODE);

        try {
            $response = (new ClassroomAnalyst)->prompt($prompt, provider: $provider, model: $model, timeout: 120);
            $reply = $response->toArray();
        } catch (TypeError|JsonException $exception) {
            throw new RuntimeException(__('ai.bad_response', ['model' => $model]), previous: $exception);
        }

        $result = $this->normalize(is_array($reply) ? $reply : [], $labels);

        if (ClassroomAiText::isEmpty($result['summary'])) {
            throw new RuntimeException(__('ai.bad_response', ['model' => $model]));
        }

        return $result;
    }

    /**
     * Bullet sections for the class and each known student label.
     *
     * @param  array<string, mixed>  $reply
     * @param  array<string, int>  $labels  "Siswa N" => member id
     * @return array{summary: array<string, list<string>>, students: list<array{member_id: int, feedback: array<string, list<string>>}>}
     */
    public function normalize(array $reply, array $labels): array
    {
        $summary = ClassroomAiText::sections($reply['summary'] ?? null, ClassroomAiText::SUMMARY_SECTIONS);
        $students = [];
        $seen = [];

        foreach (is_array($reply['students'] ?? null) ? $reply['students'] : [] as $student) {
            if (! is_array($student)) {
                continue;
            }
            $memberId = $labels[trim((string) ($student['student'] ?? ''))] ?? null;
            $feedback = array_map(
                fn (array $points): array => array_map(fn (string $point): string => $this->withoutLabels($point), $points),
                ClassroomAiText::sections($student, ClassroomAiText::STUDENT_SECTIONS),
            );
            if ($memberId === null || isset($seen[$memberId]) || ClassroomAiText::isEmpty($feedback)) {
                continue;
            }
            $seen[$memberId] = true;
            $students[] = ['member_id' => $memberId, 'feedback' => $feedback];
        }

        return ['summary' => $summary, 'students' => $students];
    }

    /** Student points must not leak the anonymised "Siswa N" labels. */
    private function withoutLabels(string $point): string
    {
        $point = preg_replace('/^\s*Siswa \d+\s*(?:[,:]\s*)?/u', '', $point) ?? $point;
        $point = preg_replace('/\bSiswa \d+\b/u', 'kamu', $point) ?? $point;

        return mb_strtoupper(mb_substr($point, 0, 1)).mb_substr($point, 1);
    }

    /**
     * Anonymised snapshot from the classroom report, plus the label map.
     *
     * @return array{snapshot: array<string, mixed>, labels: array<string, int>}
     */
    private function buildSnapshot(Classroom $classroom): array
    {
        $report = $this->report->forClassroom($classroom);
        $names = collect(Subject::catalog())->pluck('name_id', 'key');
        $subject = fn (?string $key): string => (string) ($names[$key] ?? $key ?? '');
        $labels = [];
        $students = [];

        foreach ($report['students']->take(self::MAX_STUDENTS)->values() as $i => $student) {
            $label = 'Siswa '.($i + 1);
            $labels[$label] = (int) $student['member_id'];
            $students[] = [
                'student' => $label,
                'grade' => $student['grade'],
                'plays' => $student['plays'],
                'answered' => $student['answered'],
                'correct' => $student['correct'],
                'wrong' => $student['wrong'],
                'accuracy' => $student['accuracy'],
                'mastery' => $student['mastery'],
                'strong_subjects' => array_map($subject, $student['strengths']),
                'weak_subjects' => array_map($subject, $student['weaknesses']),
            ];
        }

        return [
            'labels' => $labels,
            'snapshot' => [
                'classroom_name' => $classroom->name,
                'total_students' => count($students),
                'summary' => $report['summary'],
                'games' => $report['games'],
                'subjects' => collect($report['subjects'])->map(fn (array $s): array => [...$s, 'key' => $subject($s['key'])])->all(),
                'topics' => collect($report['topics'])->map(fn (array $t): array => [
                    'topic' => $t['name_id'],
                    'subject' => $subject($t['subject_key']),
                    'answered' => $t['answered'],
                    'accuracy' => $t['accuracy'],
                ])->all(),
                'hardest_questions' => collect($report['questions'])->take(5)->map(fn (array $q): array => [
                    'prompt' => Str::limit((string) $q['prompt_id'], 200),
                    'subject' => $subject($q['subject']),
                    'answered' => $q['answered'],
                    'accuracy' => $q['accuracy'],
                    'most_chosen_wrong_answer' => $q['top_wrong']['text'] ?? null,
                ])->all(),
                'students' => $students,
            ],
        ];
    }
}
