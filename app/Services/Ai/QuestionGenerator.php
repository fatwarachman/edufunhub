<?php

namespace App\Services\Ai;

use App\Ai\Agents\QuestionWriter;
use App\Models\Question;
use App\Models\QuestionGeneration;
use App\Models\Subject;
use Closure;
use Illuminate\Support\Str;
use JsonException;
use RuntimeException;
use TypeError;

/**
 * Asks the configured model for questions of one subject and grade, validates
 * every item and stores the good ones as AI-created questions.
 */
class QuestionGenerator
{
    /** @var array<string, string> */
    public function __construct(private OpenAiCompatibleClient $client, private AiSettings $settings) {}

    /**
     * @param  (Closure(int, int): void)|null  $onProgress  called with the created and skipped totals after every batch
     * @param  (Closure(): bool)|null  $shouldStop  checked before every batch; true ends the run early and keeps the saved questions
     * @return array{created: int, skipped: int, stopped: bool}
     *
     * @throws RuntimeException
     */
    public function generate(QuestionGeneration $generation, string $subject, int $grade, int $count, ?Closure $onProgress = null, ?Closure $shouldStop = null): array
    {
        $provider = $this->client->register();
        $created = 0;
        $skipped = 0;

        while ($created < $count) {
            if ($shouldStop !== null && $shouldStop()) {
                return ['created' => $created, 'skipped' => $skipped, 'stopped' => true];
            }
            $want = min(QuestionGeneration::BATCH, $count - $created);
            $items = $this->ask($provider, $generation->model, $subject, $grade, $want);
            if ($items === []) {
                break;
            }
            foreach ($items as $item) {
                if ($created >= $count) {
                    break;
                }
                $clean = $this->clean($item);
                if ($clean === null || $this->isDuplicate($clean['prompt_id'], $subject, $grade)) {
                    $skipped++;

                    continue;
                }
                Question::query()->create([
                    ...$clean,
                    'key' => 'ai-'.Str::lower(Str::random(10)),
                    'type' => Question::TYPE_CHOICE,
                    'subject' => $subject,
                    'band' => Question::bandForGrades([$grade]),
                    'grades' => [$grade],
                    'games' => $generation->games,
                    'is_active' => $generation->activate,
                    'source' => Question::SOURCE_AI,
                    'generation_id' => $generation->id,
                    'created_by' => $generation->requested_by,
                    'updated_by' => $generation->requested_by,
                ]);
                $created++;
            }
            if ($onProgress !== null) {
                $onProgress($created, $skipped);
            }
            if ($skipped > $count * 2) {
                break;
            }
        }

        return ['created' => $created, 'skipped' => $skipped, 'stopped' => false];
    }

    /** @return list<mixed> */
    private function ask(string $provider, string $model, string $subject, int $grade, int $count): array
    {
        $avoid = Question::query()
            ->where('subject', $subject)
            ->where('band', Question::bandForGrades([$grade]))
            ->latest('id')
            ->limit(40)
            ->pluck('prompt_id')
            ->map(fn (string $prompt): string => '- '.Str::limit($prompt, 120))
            ->implode("\n");

        $gradeLabel = $grade === Question::KINDERGARTEN ? 'TK (kindergarten, age 4-6)' : "kelas {$grade} (grade {$grade})";
        $prompt = "Write {$count} new multiple choice questions.\nSubject: ".Subject::aiDescription($subject)."\nGrade: {$gradeLabel}\n"
            .($avoid !== '' ? "Avoid these existing questions:\n{$avoid}\n" : '');

        try {
            $response = (new QuestionWriter)->prompt($prompt, provider: $provider, model: $model, timeout: 120);
        } catch (TypeError|JsonException $exception) {
            throw new RuntimeException(__('ai.bad_response', ['model' => $model]), previous: $exception);
        }
        $questions = $response['questions'] ?? null;

        return is_array($questions) ? array_values($questions) : [];
    }

    /**
     * @return array{prompt_id: string, prompt_en: string, options: list<array{id: string, en: string}>, answer: int, hint_id: ?string, hint_en: ?string}|null
     */
    private function clean(mixed $item): ?array
    {
        if (! is_array($item)) {
            return null;
        }
        $text = fn (mixed $value, int $max): string => Str::limit(trim(strip_tags((string) (is_scalar($value) ? $value : ''))), $max, '');
        $promptId = $text($item['prompt_id'] ?? '', 500);
        $options = collect(is_array($item['options'] ?? null) ? $item['options'] : [])
            ->map(fn ($option): array => ['id' => $text(is_array($option) ? ($option['id'] ?? '') : $option, 150), 'en' => $text(is_array($option) ? ($option['en'] ?? '') : '', 150)])
            ->values();
        $answer = filter_var($item['answer'] ?? null, FILTER_VALIDATE_INT);

        $unique = $options->pluck('id')->map(fn (string $id): string => mb_strtolower($id))->unique()->count();
        if (mb_strlen($promptId) < 8 || $options->count() < 3 || $options->count() > 6 || $unique !== $options->count()
            || $options->contains(fn (array $option): bool => $option['id'] === '')
            || $answer === false || $answer < 0 || $answer >= $options->count()) {
            return null;
        }

        return [
            'prompt_id' => $promptId,
            'prompt_en' => $text($item['prompt_en'] ?? '', 500) ?: null,
            'options' => $options->all(),
            'answer' => $answer,
            'hint_id' => $text($item['hint_id'] ?? '', 300) ?: null,
            'hint_en' => $text($item['hint_en'] ?? '', 300) ?: null,
        ];
    }

    private function isDuplicate(string $prompt, string $subject, int $grade): bool
    {
        return Question::query()
            ->where('subject', $subject)
            ->where('band', Question::bandForGrades([$grade]))
            ->whereRaw('LOWER(prompt_id) = ?', [mb_strtolower($prompt)])
            ->exists();
    }
}
