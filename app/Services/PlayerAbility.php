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

    public function latestFor(User $user): ?UserAbilityAssessment
    {
        return UserAbilityAssessment::query()
            ->select(['id', 'user_id', 'status', 'share_code', 'result', 'updated_at'])
            ->where('user_id', $user->id)
            ->where('status', UserAbilityAssessment::DONE)
            ->latest('updated_at')
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

            $assessment->forceFill(['share_code' => $code])->saveQuietly();
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
}
