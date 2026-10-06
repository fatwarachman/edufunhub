<?php

namespace App\Services;

use App\Models\GameHistory;
use App\Models\QuestionAnswer;
use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;

/**
 * Personal play analytics for the player dashboard: totals, accuracy per
 * subject and per game, recent activity and time played. Every figure comes
 * from aggregate queries over the player's own game history.
 */
class PlayerDashboardStats
{
    /** Days shown in the activity chart. */
    public const ACTIVITY_DAYS = 14;

    /** Seconds the computed stats are cached per player (the key also changes with every new result). */
    public const CACHE_SECONDS = 60;

    /**
     * @return array{
     *     totals: array{plays: int, points: int, correct: int, wrong: int, accuracy: float|null, seconds: int, games: int},
     *     subjects: list<array{subject: string, answered: int, correct: int, accuracy: float}>,
     *     games: list<array{key: string, titleKey: string|null, name: string, url: string|null, icon: string, accent: string, plays: int, points: int, bestScore: int, accuracy: float|null, seconds: int, lastPlayedAt: string}>,
     *     activity: list<array{date: string, plays: int, points: int}>,
     *     favouriteGame: string|null,
     *     activityDays: int
     * }
     */
    public function for(User $user): array
    {
        $latest = (int) $user->gameHistories()->max('id');

        return Cache::remember(
            "player-dashboard-stats:{$user->id}:{$latest}",
            self::CACHE_SECONDS,
            fn (): array => $this->compute($user),
        );
    }

    /**
     * @return array<string, mixed>
     */
    private function compute(User $user): array
    {
        $games = $this->games($user);
        $correct = array_sum(array_column($games, 'correct'));
        $wrong = array_sum(array_column($games, 'wrong'));
        $favourite = collect($games)->sortByDesc('plays')->first();

        return [
            'totals' => [
                'plays' => array_sum(array_column($games, 'plays')),
                'points' => array_sum(array_column($games, 'points')),
                'correct' => $correct,
                'wrong' => $wrong,
                'accuracy' => $this->percent($correct, $correct + $wrong),
                'seconds' => array_sum(array_column($games, 'seconds')),
                'games' => count($games),
            ],
            'subjects' => $this->subjects($user),
            'games' => array_map(function (array $game): array {
                unset($game['correct'], $game['wrong']);

                return $game;
            }, $games),
            'activity' => $this->activity($user),
            'favouriteGame' => $favourite['key'] ?? null,
            'activityDays' => self::ACTIVITY_DAYS,
        ];
    }

    /**
     * Per-game aggregates, most recently played first.
     *
     * @return list<array{key: string, titleKey: string|null, name: string, url: string|null, icon: string, accent: string, plays: int, points: int, bestScore: int, correct: int, wrong: int, accuracy: float|null, seconds: int, lastPlayedAt: string}>
     */
    private function games(User $user): array
    {
        $catalog = $this->catalogByKey();

        return GameHistory::query()
            ->where('user_id', $user->id)
            ->groupBy('game_key')
            ->selectRaw('game_key, MAX(game_name) as game_name, COUNT(*) as plays, SUM(points) as points, MAX(points) as best_score')
            ->selectRaw('SUM(COALESCE(correct, 0)) as correct_total, SUM(COALESCE(wrong, 0)) as wrong_total')
            ->selectRaw('SUM(COALESCE(duration_seconds, 0)) as seconds, MAX(played_at) as last_played_at')
            ->orderByDesc('last_played_at')
            ->get()
            ->map(function (GameHistory $row) use ($catalog): array {
                $entry = $catalog[$row->game_key] ?? null;
                $correct = (int) $row->getAttribute('correct_total');
                $wrong = (int) $row->getAttribute('wrong_total');

                return [
                    'key' => (string) $row->game_key,
                    'titleKey' => $entry['titleKey'] ?? null,
                    'name' => (string) $row->game_name,
                    'url' => $entry['url'] ?? null,
                    'icon' => $entry['icon'] ?? 'gamepad',
                    'accent' => $entry['accent'] ?? '#f5a623',
                    'plays' => (int) $row->getAttribute('plays'),
                    'points' => (int) $row->getAttribute('points'),
                    'bestScore' => (int) $row->getAttribute('best_score'),
                    'correct' => $correct,
                    'wrong' => $wrong,
                    'accuracy' => $this->percent($correct, $correct + $wrong),
                    'seconds' => (int) $row->getAttribute('seconds'),
                    'lastPlayedAt' => Carbon::parse($row->getAttribute('last_played_at'))->toIso8601String(),
                ];
            })
            ->values()
            ->all();
    }

    /**
     * Answer accuracy per subject from the recorded question answers.
     *
     * @return list<array{subject: string, answered: int, correct: int, accuracy: float}>
     */
    private function subjects(User $user): array
    {
        return QuestionAnswer::query()
            ->join('game_histories', 'game_histories.id', '=', 'question_answers.game_history_id')
            ->join('questions', 'questions.id', '=', 'question_answers.question_id')
            ->where('game_histories.user_id', $user->id)
            ->groupBy('questions.subject')
            ->selectRaw('questions.subject as subject, COUNT(*) as answered, SUM(CASE WHEN question_answers.correct THEN 1 ELSE 0 END) as correct_total')
            ->orderByDesc('answered')
            ->get()
            ->map(fn (QuestionAnswer $row): array => [
                'subject' => (string) $row->getAttribute('subject'),
                'answered' => (int) $row->getAttribute('answered'),
                'correct' => (int) $row->getAttribute('correct_total'),
                'accuracy' => (float) $this->percent((int) $row->getAttribute('correct_total'), (int) $row->getAttribute('answered')),
            ])
            ->values()
            ->all();
    }

    /**
     * Plays and points per day for the last N days (oldest first, empty days included).
     *
     * @return list<array{date: string, plays: int, points: int}>
     */
    private function activity(User $user): array
    {
        $timezone = (string) config('app.timezone');
        $start = Carbon::now($timezone)->startOfDay()->subDays(self::ACTIVITY_DAYS - 1);

        $byDay = GameHistory::query()
            ->where('user_id', $user->id)
            ->where('played_at', '>=', $start->copy()->utc())
            ->get(['played_at', 'points'])
            ->groupBy(fn (GameHistory $history): string => $history->played_at->setTimezone($timezone)->toDateString());

        return collect(range(0, self::ACTIVITY_DAYS - 1))->map(function (int $offset) use ($start, $byDay): array {
            $date = $start->copy()->addDays($offset)->toDateString();
            $rows = $byDay->get($date, collect());

            return ['date' => $date, 'plays' => $rows->count(), 'points' => (int) $rows->sum('points')];
        })->all();
    }

    /**
     * @return array<string, array{titleKey: string, url: string, icon: string, accent: string}>
     */
    private function catalogByKey(): array
    {
        $games = [];
        foreach (config('game-catalog.categories') as $category) {
            foreach ($category['games'] as $game) {
                $games[$game['key']] = [
                    'titleKey' => $game['titleKey'],
                    'url' => route($game['route'], absolute: false),
                    'icon' => $game['icon'] ?? 'gamepad',
                    'accent' => $game['accent'] ?? '#f5a623',
                ];
            }
        }

        return $games;
    }

    private function percent(int $part, int $total): ?float
    {
        return $total > 0 ? round($part / $total * 100, 1) : null;
    }
}
