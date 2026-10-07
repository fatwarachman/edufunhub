<?php

namespace App\Http\Controllers;

use App\Models\GameHistory;
use App\Models\PlayerProfile;
use App\Models\User;
use App\Models\UserAbilityAssessment;
use App\Services\CharacterShop;
use App\Services\PlayerBadges;
use App\Services\PlayerDashboardStats;
use App\Services\PlayerPortal;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class UserDashboardController extends Controller
{
    public function __invoke(Request $request, PlayerPortal $portal, CharacterShop $shop, PlayerBadges $badges, PlayerDashboardStats $stats): Response
    {
        $user = $request->user();
        $profile = $user->playerProfile()->first() ?? new PlayerProfile;
        $points = $portal->totalPoints($user);
        $history = $user->gameHistories()->orderByDesc('played_at')->orderByDesc('id')->paginate(10);

        return Inertia::render('user/dashboard', [
            'points' => $points,
            'balance' => $portal->balance($user),
            'character' => $profile->character(),
            'vault' => $shop->vault($user, $user->locale === 'en' ? 'en' : 'id'),
            'grade' => $profile->grade,
            'playerDetails' => [
                'birth_date' => $profile->birth_date?->toDateString(),
                'school_name' => $profile->school_name,
                'school_city' => $profile->school_city,
            ],
            'categories' => $portal->catalog($profile->grade),
            'progress' => $portal->progress($points),
            'rank' => $portal->rankOf($user, $points),
            'badges' => $badges->summary($user),
            'history' => $history->getCollection()->map(fn (GameHistory $game): array => [
                'id' => $game->id,
                'game_key' => $game->game_key,
                'game_name' => $game->game_name,
                'points' => $game->points,
                'correct' => $game->correct,
                'wrong' => $game->wrong,
                'duration_seconds' => $game->duration_seconds,
                'played_at' => $game->played_at->toIso8601String(),
            ])->all(),
            'historyPagination' => [
                'current_page' => $history->currentPage(),
                'last_page' => $history->lastPage(),
                'total' => $history->total(),
                'prev_page_url' => $history->previousPageUrl(),
                'next_page_url' => $history->nextPageUrl(),
            ],
            'leaderboards' => Inertia::defer(fn (): array => $portal->leaderboards($user), 'board'),
            'stats' => Inertia::defer(fn (): array => $stats->for($user), 'stats'),
            'ability' => Inertia::defer(fn (): ?array => $this->latestAbility($user), 'stats'),
        ]);
    }

    /**
     * The player's latest finished AI analysis, without the model input,
     * model name or requester (those stay on the admin page).
     *
     * @return array{analyzed_at: ?string, summary: string, strengths: list<string>, weaknesses: list<string>, subject_scores: array<string, int>, recommendations: list<string>, learning_style: string, progress_vs_previous: string}|null
     */
    private function latestAbility(User $user): ?array
    {
        $assessment = UserAbilityAssessment::query()
            ->select(['id', 'user_id', 'result', 'updated_at'])
            ->where('user_id', $user->id)
            ->where('status', UserAbilityAssessment::DONE)
            ->latest('updated_at')
            ->latest('id')
            ->first();
        $result = $assessment?->result;

        if (! is_array($result) || ! is_string($result['summary'] ?? null)) {
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
        ];
    }
}
