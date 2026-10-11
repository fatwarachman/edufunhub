<?php

namespace App\Services;

use App\Models\GameAccess;
use App\Models\GameHistory;
use App\Models\Question;
use App\Models\QuestionAnswer;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;

/**
 * Global data widgets for the player portal news surface.
 */
class PortalNews
{
    private const CACHE_SECONDS = 60;

    private const SUBJECT_MIN_ANSWERS = 10;

    /**
     * @return array{periods: array<string, list<array<string, mixed>>>, highestScores: list<array<string, mixed>>, subjects: array{best: list<array<string, mixed>>, weakest: list<array<string, mixed>>}, pulse: array<string, int|float>}
     */
    public function widgets(): array
    {
        return Cache::remember('portal.news.widgets', self::CACHE_SECONDS, function (): array {
            return [
                'periods' => [
                    'today' => $this->mostPlayed(1),
                    'threeDays' => $this->mostPlayed(3),
                    'sevenDays' => $this->mostPlayed(7),
                ],
                'highestScores' => $this->highestScores(),
                'subjects' => $this->subjectPerformance(),
                'pulse' => $this->pulse(),
            ];
        });
    }

    /** @return list<array{key: string, titleKey: string, icon: string, accent: string, plays: int, players: int}> */
    private function mostPlayed(int $days): array
    {
        $since = now()->subDays($days - 1)->startOfDay();
        $counts = GameAccess::query()
            ->where('accessed_at', '>=', $since)
            ->selectRaw('game_key, COUNT(*) as plays, COUNT(DISTINCT user_id) as players')
            ->groupBy('game_key')
            ->orderByDesc('plays')
            ->orderBy('game_key')
            ->limit(5)
            ->get()
            ->keyBy('game_key');

        return $this->catalogGames()
            ->filter(fn (array $game): bool => $counts->has($game['key']))
            ->map(function (array $game) use ($counts): array {
                $row = $counts->get($game['key']);

                return [
                    ...$game,
                    'plays' => (int) $row->plays,
                    'players' => (int) $row->players,
                ];
            })
            ->sortByDesc('plays')
            ->values()
            ->all();
    }

    /** @return list<array<string, mixed>> */
    private function highestScores(): array
    {
        return GameHistory::query()
            ->join('users', 'users.id', '=', 'game_histories.user_id')
            ->leftJoin('player_profiles', 'player_profiles.user_id', '=', 'game_histories.user_id')
            ->whereNull('users.disabled_at')
            ->orderByDesc('game_histories.points')
            ->orderBy('game_histories.id')
            ->limit(5)
            ->get([
                'game_histories.id',
                'game_histories.game_key',
                'game_histories.game_name',
                'game_histories.points',
                'game_histories.correct',
                'game_histories.wrong',
                'game_histories.played_at',
                'player_profiles.nickname',
                'users.name',
            ])
            ->map(fn (object $game): array => [
                'id' => (int) $game->id,
                'gameKey' => (string) $game->game_key,
                'gameName' => (string) $game->game_name,
                'player' => $game->nickname ?: $game->name,
                'points' => (int) $game->points,
                'correct' => (int) $game->correct,
                'wrong' => (int) $game->wrong,
                'playedAt' => Carbon::parse($game->played_at)->toIso8601String(),
            ])->all();
    }

    /** @return array{best: list<array<string, mixed>>, weakest: list<array<string, mixed>>} */
    private function subjectPerformance(): array
    {
        $rows = QuestionAnswer::query()
            ->join('questions', 'questions.id', '=', 'question_answers.question_id')
            ->join('subjects', 'subjects.key', '=', 'questions.subject')
            ->selectRaw('subjects.key, subjects.name_id, subjects.name_en, subjects.icon, subjects.color')
            ->selectRaw('COUNT(*) as answered')
            ->selectRaw('SUM(CASE WHEN question_answers.correct = ? THEN 1 ELSE 0 END) as correct', [true])
            ->groupBy('subjects.key', 'subjects.name_id', 'subjects.name_en', 'subjects.icon', 'subjects.color')
            ->havingRaw('COUNT(*) >= ?', [self::SUBJECT_MIN_ANSWERS])
            ->get();

        $mapped = $rows->map(fn (object $row): array => [
            'key' => (string) $row->key,
            'nameId' => (string) $row->name_id,
            'nameEn' => $row->name_en,
            'icon' => (string) $row->icon,
            'color' => (string) $row->color,
            'answered' => (int) $row->answered,
            'correct' => (int) $row->correct,
            'accuracy' => round((int) $row->correct / (int) $row->answered * 100, 1),
        ]);

        return [
            'best' => $mapped->sortByDesc('accuracy')->take(5)->values()->all(),
            'weakest' => $mapped->sortBy('accuracy')->take(5)->values()->all(),
        ];
    }

    /** @return array{totalGames: int, totalPlays: int, activePlayers: int, questions: int, playsSevenDays: int} */
    private function pulse(): array
    {
        return [
            'totalGames' => $this->catalogGames()->count(),
            'totalPlays' => (int) GameHistory::query()->count(),
            'activePlayers' => (int) GameHistory::query()->distinct('user_id')->count('user_id'),
            'questions' => (int) Question::query()->active()->count(),
            'playsSevenDays' => (int) GameHistory::query()->where('played_at', '>=', now()->subDays(6)->startOfDay())->count(),
        ];
    }

    /** @return Collection<int, array{key: string, titleKey: string, icon: string, accent: string}> */
    private function catalogGames(): Collection
    {
        return collect(config('game-catalog.categories'))
            ->flatMap(fn (array $category): array => $category['games'])
            ->map(fn (array $game): array => [
                'key' => $game['key'],
                'titleKey' => $game['titleKey'],
                'icon' => $game['icon'] ?? 'gamepad',
                'accent' => $game['accent'] ?? '#f5a623',
                'url' => $game['url'] ?? '/games/'.$game['key'],
            ])
            ->unique('key')
            ->values();
    }
}
