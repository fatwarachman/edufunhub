<?php

namespace App\Services\Ai;

use App\Ai\Agents\QuestionWriter;
use App\Models\Question;
use App\Models\QuestionGeneration;
use App\Models\Subject;
use App\Models\SubjectTopic;
use App\Services\QuestionVisual;
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
    /** How hard each question level should be within its grade. */
    private const LEVEL_GUIDE = [
        Question::LEVEL_EASY => 'easy: basic recall and simple facts most students of this grade already know.',
        Question::LEVEL_MEDIUM => 'medium: needs understanding or one reasoning step, still within this grade curriculum.',
        Question::LEVEL_EXPERT => 'expert: challenging for this grade, multi-step reasoning or deeper knowledge, still fair for strong students of this grade.',
    ];

    /** Topic the next run focuses on; null keeps the request topic or the whole subject. */
    private ?SubjectTopic $topic = null;

    private bool $topicSet = false;

    /** Extra instruction for TK and SD: picture questions built from emoji. */
    private const PICTURE_GUIDE = "Picture questions (TK and SD): make about half of the questions picture questions.\n"
        ."- picture: a list of 1-20 emoji shown above the question, e.g. counting [\"🍎\",\"🍎\",\"🍎\"] for \"Ada berapa apel?\", or [\"🐘\"] for \"Hewan apa ini?\".\n"
        ."- option_emoji: optional, one emoji per option in the same order (e.g. [\"🐟\",\"🐈\",\"🐔\",\"🐄\"]) when the answers are things that have an emoji.\n"
        ."- Use only real single emoji, never letters or numbers inside picture/option_emoji. The question text must still make sense and must match the picture exactly (count carefully).\n"
        ."- Leave picture and option_emoji empty for questions that do not need a picture.\n";

    public function __construct(private OpenAiCompatibleClient $client, private AiSettings $settings) {}

    /** Focus the next generate() call on one topic (null = whole subject). */
    public function forTopic(?SubjectTopic $topic): static
    {
        $this->topic = $topic;
        $this->topicSet = true;

        return $this;
    }

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
        $topic = $this->topicSet
            ? $this->topic
            : ($generation->topic_id !== null ? SubjectTopic::query()->find($generation->topic_id) : null);
        $this->topic = null;
        $this->topicSet = false;

        while ($created < $count) {
            if ($shouldStop !== null && $shouldStop()) {
                return ['created' => $created, 'skipped' => $skipped, 'stopped' => true];
            }
            $want = min(QuestionGeneration::BATCH, $count - $created);
            $items = $this->ask($provider, $generation->model, $subject, $grade, $want, Question::normalizeLevel($generation->level), $topic);
            if ($items === []) {
                break;
            }
            foreach ($items as $item) {
                if ($created >= $count) {
                    break;
                }
                $clean = $this->clean($item, self::picturesAllowed($grade));
                if ($clean === null || $this->isDuplicate($clean['prompt_id'], $subject, $grade)) {
                    $skipped++;

                    continue;
                }
                Question::query()->create([
                    ...$clean,
                    'key' => 'ai-'.Str::lower(Str::random(10)),
                    'type' => Question::TYPE_CHOICE,
                    'subject' => $subject,
                    'topic_id' => $topic?->id,
                    'band' => Question::bandForGrades([$grade]),
                    'grades' => [$grade],
                    'level' => Question::normalizeLevel($generation->level),
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
    private function ask(string $provider, string $model, string $subject, int $grade, int $count, int $level = Question::LEVEL_EASY, ?SubjectTopic $topic = null): array
    {
        $avoid = Question::query()
            ->where('subject', $subject)
            ->where('band', Question::bandForGrades([$grade]))
            ->when($topic !== null, fn ($query) => $query->where('topic_id', $topic->id))
            ->latest('id')
            ->limit(40)
            ->pluck('prompt_id')
            ->map(fn (string $prompt): string => '- '.Str::limit($prompt, 120))
            ->implode("\n");

        $gradeLabel = $grade === Question::KINDERGARTEN ? 'TK (kindergarten, age 4-6)' : "kelas {$grade} (grade {$grade})";
        $prompt = "Write {$count} new multiple choice questions.\nSubject: ".Subject::aiDescription($subject)."\nGrade: {$gradeLabel}\n"
            .($topic !== null ? $this->topicFocus($topic) : '')
            .(self::picturesAllowed($grade) ? self::PICTURE_GUIDE : "Do not use emoji pictures (picture and option_emoji stay empty).\n")
            .'Difficulty: '.self::LEVEL_GUIDE[$level]."\n"
            .($avoid !== '' ? "Avoid these existing questions:\n{$avoid}\n" : '');

        try {
            $response = (new QuestionWriter)->prompt($prompt, provider: $provider, model: $model, timeout: 120);
        } catch (TypeError|JsonException $exception) {
            throw new RuntimeException(__('ai.bad_response', ['model' => $model]), previous: $exception);
        }
        $questions = $response['questions'] ?? null;

        return is_array($questions) ? array_values($questions) : [];
    }

    /** Instruction that keeps every question inside one topic and its material. */
    private function topicFocus(SubjectTopic $topic): string
    {
        $name = trim($topic->name_id.($topic->name_en ? " ({$topic->name_en})" : ''));
        $material = trim((string) $topic->material);

        return "Topic: {$name}\nEvery question must be about this topic only.\n"
            .($material !== '' ? "Topic material and scope:\n".Str::limit($material, SubjectTopic::MAX_MATERIAL, '')."\n" : '');
    }

    /**
     * @return array{prompt_id: string, prompt_en: ?string, visual: array<string, mixed>|null, options: list<array{id: string, en: string}>, answer: int, hint_id: ?string, hint_en: ?string}|null
     */
    private function clean(mixed $item, bool $pictures = false): ?array
    {
        if (! is_array($item)) {
            return null;
        }
        $item = $pictures ? $this->withPictures($item) : $item;
        $text = fn (mixed $value, int $max): string => Str::limit(trim(strip_tags((string) (is_scalar($value) ? $value : ''))), $max, '');
        $promptId = $text($item['prompt_id'] ?? '', 500);
        $options = collect(is_array($item['options'] ?? null) ? $item['options'] : [])
            ->map(fn ($option): array => array_filter([
                'id' => $text(is_array($option) ? ($option['id'] ?? '') : $option, 150),
                'en' => $text(is_array($option) ? ($option['en'] ?? '') : '', 150),
                'emoji' => is_array($option) ? ($option['emoji'] ?? null) : null,
            ], fn (mixed $value): bool => $value !== null))
            ->values();
        $answer = filter_var($item['answer'] ?? null, FILTER_VALIDATE_INT);

        $unique = $options->pluck('id')->map(fn (string $id): string => mb_strtolower($id))->unique()->count();
        if (mb_strlen($promptId) < 8 || $options->count() < 3 || $options->count() > 6 || $unique !== $options->count()
            || $options->contains(fn (array $option): bool => $option['id'] === '')
            || $answer === false || $answer < 0 || $answer >= $options->count()) {
            return null;
        }

        $visual = $pictures && isset($item['visual']) ? $item['visual'] : null;
        $optionsOut = $options->map(function (array $option): array {
            $emoji = $option['emoji'] ?? null;
            unset($option['emoji']);
            if (is_string($emoji) && $emoji !== '') {
                $option['id'] = trim($emoji.' '.$option['id']);
                $option['en'] = trim($emoji.' '.$option['en']);
            }

            return $option;
        });

        return [
            'prompt_id' => $promptId,
            'prompt_en' => $text($item['prompt_en'] ?? '', 500) ?: null,
            'visual' => $visual,
            'options' => $optionsOut->all(),
            'answer' => $answer,
            'hint_id' => $text($item['hint_id'] ?? '', 300) ?: null,
            'hint_en' => $text($item['hint_en'] ?? '', 300) ?: null,
        ];
    }

    /** TK and SD (grades 0-6) may get emoji pictures; older grades stay text only. */
    public static function picturesAllowed(int $grade): bool
    {
        return $grade >= Question::KINDERGARTEN && $grade <= 6;
    }

    /**
     * Turns the writer's `picture` emoji list into a validated emoji visual and
     * keeps one emoji per option; anything that is not a plain emoji is dropped.
     *
     * @param  array<string, mixed>  $item
     * @return array<string, mixed>
     */
    private function withPictures(array $item): array
    {
        $isEmoji = fn (mixed $value): bool => is_string($value)
            && ($value = trim($value)) !== ''
            && mb_strlen($value) <= QuestionVisual::MAX_EMOJI_LENGTH
            && preg_match('/[<>\p{L}\p{N}\s]/u', $value) !== 1
            && preg_match('/\p{So}|\p{Sk}|[\x{1F000}-\x{1FAFF}]/u', $value) === 1;

        $picture = array_values(array_filter(array_slice((array) ($item['picture'] ?? []), 0, QuestionVisual::MAX_EMOJI), $isEmoji));
        $item['visual'] = $picture === [] ? null : QuestionVisual::normalize(['kind' => 'emoji', 'items' => $picture]);

        if (is_array($item['options'] ?? null)) {
            $emoji = (array) ($item['option_emoji'] ?? []);
            $item['options'] = array_map(function (mixed $option, int $index) use ($emoji, $isEmoji): mixed {
                if (is_array($option) && $isEmoji($emoji[$index] ?? null)) {
                    $option['emoji'] = trim((string) $emoji[$index]);
                }

                return $option;
            }, $item['options'], array_keys($item['options']));
        }

        return $item;
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
