<?php

namespace App\Services\Ai;

use App\Ai\Agents\AbilityAnalyst;
use App\Models\UserAbilityAssessment;
use Illuminate\Support\Str;
use JsonException;
use RuntimeException;
use TypeError;

/**
 * Sends a stored ability snapshot to the configured model and normalises the
 * reply into the shape the admin page renders.
 */
class AbilityAnalyzer
{
    public const MAX_ITEMS = 8;

    public const MAX_SUBJECTS = 15;

    public function __construct(private OpenAiCompatibleClient $client, private AbilityProfileBuilder $builder) {}

    /**
     * @return array{summary: string, strengths: list<string>, weaknesses: list<string>, subject_scores: array<string, int>, game_insights: list<string>, recommendations: list<string>, learning_style: string, progress_vs_previous: string, confidence: string}
     *
     * @throws RuntimeException
     */
    public function analyze(UserAbilityAssessment $assessment): array
    {
        $provider = $this->client->register();
        $model = (string) $assessment->model;
        $snapshot = (array) $assessment->input_snapshot;

        $prompt = "Analisa kemampuan Peserta berikut. Data (JSON):\n".$this->builder->toJson($snapshot);

        try {
            $response = (new AbilityAnalyst)->prompt($prompt, provider: $provider, model: $model, timeout: 120);
            $reply = $response->toArray();
        } catch (TypeError|JsonException $exception) {
            throw new RuntimeException(__('ai.bad_response', ['model' => $model]), previous: $exception);
        }

        return $this->normalize(is_array($reply) ? $reply : [], $snapshot);
    }

    /**
     * Keep only well-formed fields; reject a reply without a summary.
     *
     * @param  array<string, mixed>  $reply
     * @param  array<string, mixed>  $snapshot
     * @return array{summary: string, strengths: list<string>, weaknesses: list<string>, subject_scores: array<string, int>, game_insights: list<string>, recommendations: list<string>, learning_style: string, progress_vs_previous: string, confidence: string}
     *
     * @throws RuntimeException
     */
    public function normalize(array $reply, array $snapshot = []): array
    {
        $summary = $this->text($reply['summary'] ?? '', 3000);
        if (mb_strlen($summary) < 10) {
            throw new RuntimeException(__('ai.assessment_incomplete'));
        }

        $confidence = Str::lower($this->text($reply['confidence'] ?? '', 20));

        return [
            'summary' => $summary,
            'strengths' => $this->list($reply['strengths'] ?? []),
            'weaknesses' => $this->list($reply['weaknesses'] ?? []),
            'subject_scores' => $this->scores($reply['subject_scores'] ?? [], $snapshot),
            'game_insights' => $this->list($reply['game_insights'] ?? []),
            'recommendations' => $this->list($reply['recommendations'] ?? []),
            'learning_style' => $this->text($reply['learning_style'] ?? '', 800),
            'progress_vs_previous' => $this->text($reply['progress_vs_previous'] ?? '', 1200),
            'confidence' => in_array($confidence, ['rendah', 'sedang', 'tinggi'], true) ? $confidence : 'sedang',
        ];
    }

    /** @return list<string> */
    private function list(mixed $value): array
    {
        if (! is_array($value)) {
            return [];
        }

        return collect($value)
            ->map(fn (mixed $item): string => $this->text(is_array($item) ? implode(': ', array_filter($item, 'is_scalar')) : $item, 400))
            ->filter(fn (string $item): bool => $item !== '')
            ->unique()
            ->take(self::MAX_ITEMS)
            ->values()
            ->all();
    }

    /**
     * Accepts [{subject, score}] (schema) or {subject: score}; maps subject
     * names back to their keys from the snapshot.
     *
     * @param  array<string, mixed>  $snapshot
     * @return array<string, int>
     */
    private function scores(mixed $value, array $snapshot): array
    {
        if (! is_array($value)) {
            return [];
        }

        $pairs = array_is_list($value)
            ? collect($value)->filter(fn (mixed $row): bool => is_array($row))->map(fn (array $row): array => [$row['subject'] ?? $row['key'] ?? null, $row['score'] ?? null])
            : collect($value)->map(fn (mixed $score, int|string $subject): array => [$subject, $score])->values();

        $known = collect($snapshot['subjects'] ?? [])
            ->filter(fn (mixed $row): bool => is_array($row) && isset($row['key']))
            ->flatMap(fn (array $row): array => [Str::lower((string) $row['key']) => $row['key'], Str::lower((string) ($row['name'] ?? $row['key'])) => $row['key']]);

        $scores = [];
        foreach ($pairs as [$subject, $score]) {
            $label = $this->text($subject, 60);
            if ($label === '' || ! is_numeric($score)) {
                continue;
            }
            $key = (string) ($known[Str::lower($label)] ?? $label);
            $scores[$key] = max(0, min(100, (int) round((float) $score)));
            if (count($scores) >= self::MAX_SUBJECTS) {
                break;
            }
        }

        return $scores;
    }

    private function text(mixed $value, int $max): string
    {
        return Str::limit(trim(strip_tags(is_scalar($value) ? (string) $value : '')), $max, '…');
    }
}
