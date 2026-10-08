<?php

namespace App\Services;

use App\Models\User;
use App\Models\UserAbilityAssessment;
use Illuminate\Support\Str;

/**
 * Player-facing view of a finished ability analysis: the latest one for the
 * dashboard and the shareable page. Admin-only data (model, input snapshot,
 * requester, confidence, raw insights) never leaves this class.
 */
class PlayerAbility
{
    /** Length of the random short-link code. */
    public const CODE_LENGTH = 8;

    /** Finished analyses listed in the player's progress history. */
    public const HISTORY = 10;

    public function __construct(private AbilityComparison $comparison) {}

    public function latestFor(User $user): ?UserAbilityAssessment
    {
        return UserAbilityAssessment::query()
            ->select(['id', 'user_id', 'status', 'share_code', 'result', 'created_at', 'updated_at'])
            ->where('user_id', $user->id)
            ->where('status', UserAbilityAssessment::DONE)
            ->latest('created_at')
            ->latest('id')
            ->first();
    }

    /**
     * Short relative link (/a/{code}) to the analysis page. The random code
     * is created on first share, so pages cannot be found by counting ids.
     */
    public function shareUrl(UserAbilityAssessment $assessment): string
    {
        if ($assessment->share_code === null) {
            do {
                $code = Str::random(self::CODE_LENGTH);
            } while (UserAbilityAssessment::query()->where('share_code', $code)->exists());

            $assessment->timestamps = false;
            $assessment->forceFill(['share_code' => $code])->saveQuietly();
            $assessment->timestamps = true;
        }

        return route('ability.show', ['code' => $assessment->share_code], absolute: false);
    }

    public function findByCode(string $code): ?UserAbilityAssessment
    {
        return UserAbilityAssessment::query()->where('share_code', $code)->first();
    }

    /**
     * @return array{analyzed_at: ?string, summary: string, strengths: list<string>, weaknesses: list<string>, subject_scores: array<string, int>, recommendations: list<string>, learning_style: string, progress_vs_previous: string, share_url: string}|null
     */
    public function present(?UserAbilityAssessment $assessment): ?array
    {
        $result = $assessment?->result;

        if ($assessment?->status !== UserAbilityAssessment::DONE || ! is_array($result) || ! is_string($result['summary'] ?? null)) {
            return null;
        }

        $list = fn (string $key): array => array_values(array_filter((array) ($result[$key] ?? []), 'is_string'));

        return [
            'analyzed_at' => $assessment->updated_at?->toIso8601String(),
            'summary' => $result['summary'],
            'strengths' => $list('strengths'),
            'weaknesses' => $list('weaknesses'),
            'subject_scores' => array_map('intval', array_filter((array) ($result['subject_scores'] ?? []), 'is_numeric')),
            'recommendations' => $list('recommendations'),
            'learning_style' => (string) ($result['learning_style'] ?? ''),
            'progress_vs_previous' => (string) ($result['progress_vs_previous'] ?? ''),
            'share_url' => $this->shareUrl($assessment),
        ];
    }

    /**
     * Player-facing progress of an analysis against the finished one before
     * it of the same player: subject deltas and a short text. Null for the
     * first analysis. Ids, model and confidence are left out.
     *
     * @return array{previous_date: ?string, previous_average: ?float, current_average: ?float, average_delta: ?float, direction: string, subjects: list<array{subject: string, previous: ?int, current: ?int, delta: ?int, direction: string}>, strengths_gained: list<string>, weaknesses_resolved: list<string>, text: string}|null
     */
    public function progress(?UserAbilityAssessment $assessment): ?array
    {
        $comparison = $this->comparison->withPrevious($assessment);
        if ($comparison === null) {
            return null;
        }

        return [
            'previous_date' => $comparison['previous']['date'],
            'previous_average' => $comparison['previous']['average'],
            'current_average' => $comparison['current']['average'],
            'average_delta' => $comparison['average_delta'],
            'direction' => $comparison['direction'],
            'subjects' => $comparison['subjects'],
            'strengths_gained' => $comparison['strengths_gained'],
            'weaknesses_resolved' => $comparison['weaknesses_resolved'],
            'text' => $this->comparison->describe($comparison),
        ];
    }

    /**
     * Dates and average scores of the player's finished analyses (newest
     * first); `current` marks the analysis on screen.
     *
     * @return list<array{date: ?string, average: ?float, current: bool}>
     */
    public function history(?UserAbilityAssessment $assessment): array
    {
        if ($assessment === null) {
            return [];
        }

        return $this->comparison->finished($assessment->user_id, self::HISTORY)
            ->map(fn (UserAbilityAssessment $item): array => [
                'date' => $item->created_at?->toIso8601String(),
                'average' => AbilityComparison::average(AbilityComparison::scores($item->result)),
                'current' => $item->id === $assessment->id,
            ])
            ->values()
            ->all();
    }
}
