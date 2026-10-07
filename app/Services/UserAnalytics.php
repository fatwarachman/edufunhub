<?php

namespace App\Services;

use App\Models\GameHistory;
use App\Models\LoginActivity;
use App\Models\PlayerProfile;
use App\Models\PointLedger;
use App\Models\QuestionAnswer;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Str;
use Spatie\Activitylog\Models\Activity;

/**
 * Read model for the admin dashboard, user demographics and the user detail page.
 *
 * Demographics use the player's current profile (birth date, grade, school);
 * game numbers come from recorded game histories.
 */
class UserAnalytics
{
    /** Ages shown individually; younger and older players fall into edge buckets. */
    public const AGE_MIN = 5;

    public const AGE_MAX = 19;

    /** Games listed in the dashboard "Games" panel (most played first). */
    public const DASHBOARD_TOP_GAMES = 5;

    public function __construct(private GameAnalytics $games) {}

    /**
     * Everything the admin dashboard renders.
     *
     * @return array<string, mixed>
     */
    public function dashboard(): array
    {
        $today = now()->startOfDay();
        $weekAgo = now()->subDays(7);
        $twoWeeksAgo = now()->subDays(14);

        $plays7 = GameHistory::query()->where('played_at', '>=', $weekAgo)->count();
        $playsPrev7 = GameHistory::query()->whereBetween('played_at', [$twoWeeksAgo, $weekAgo])->count();
        $signups7 = User::query()->where('created_at', '>=', $weekAgo)->count();
        $signupsPrev7 = User::query()->whereBetween('created_at', [$twoWeeksAgo, $weekAgo])->count();
        $active7 = GameHistory::query()->where('played_at', '>=', $weekAgo)->distinct()->count('user_id');
        $activePrev7 = GameHistory::query()->whereBetween('played_at', [$twoWeeksAgo, $weekAgo])->distinct()->count('user_id');

        $totals = GameHistory::query()
            ->selectRaw('COUNT(*) as plays, SUM(points) as points, SUM(correct) as correct, SUM(wrong) as wrong, COUNT(DISTINCT user_id) as players')
            ->first();

        $profiles = $this->profileRows();
        $daily = $this->dailySeries(30);

        return [
            'kpis' => [
                'users' => User::query()->count(),
                'signups_today' => User::query()->where('created_at', '>=', $today)->count(),
                'signups_7d' => $signups7,
                'signups_delta' => $this->delta($signups7, $signupsPrev7),
                'plays' => (int) $totals->plays,
                'plays_today' => GameHistory::query()->where('played_at', '>=', $today)->count(),
                'plays_7d' => $plays7,
                'plays_delta' => $this->delta($plays7, $playsPrev7),
                'players' => (int) $totals->players,
                'active_players_7d' => $active7,
                'active_delta' => $this->delta($active7, $activePrev7),
                'points' => (int) $totals->points,
                'accuracy' => $this->percent((int) $totals->correct, (int) $totals->correct + (int) $totals->wrong),
                'online_15m' => User::query()->where('last_seen_at', '>=', now()->subMinutes(15))->count(),
                'profile_complete' => $profiles->filter(fn (array $p): bool => $p['complete'])->count(),
                'profiles' => $profiles->count(),
                'schools' => $profiles->pluck('school_key')->filter()->unique()->count(),
            ],
            'daily' => $daily,
            'games' => collect($this->games->overview())
                ->sortByDesc('plays')
                ->take(self::DASHBOARD_TOP_GAMES)
                ->values()
                ->map(fn (array $game): array => [
                    'key' => $game['key'],
                    'accent' => $game['accent'],
                    'plays' => $game['plays'],
                    'players' => $game['players'],
                    'success_rate' => $game['success_rate'],
                    'tracked' => $game['tracked'],
                ])->all(),
            'levels' => $this->levelSplit($profiles),
            'grades' => collect(range(1, 12))->map(fn (int $grade): array => [
                'grade' => $grade,
                'users' => $profiles->where('grade', $grade)->count(),
            ])->all(),
            'ages' => $this->ageHistogram($profiles),
            'recentPlays' => $this->recentPlays(8),
            'recentUsers' => $this->recentUsers(6),
        ];
    }

    /**
     * Demographic statistics for the user statistics page.
     *
     * @param  array{level?: ?string, school?: ?string}  $filters
     * @return array<string, mixed>
     */
    public function demographics(array $filters): array
    {
        $profiles = $this->profileRows();
        $level = (string) ($filters['level'] ?? '');
        $school = trim((string) ($filters['school'] ?? ''));

        if (isset(GameAnalytics::LEVELS[$level])) {
            [$min, $max] = GameAnalytics::LEVELS[$level];
            $profiles = $profiles->filter(fn (array $p): bool => $p['grade'] !== null && $p['grade'] >= $min && $p['grade'] <= $max);
        }
        if ($school !== '') {
            $needle = Str::lower($school);
            $profiles = $profiles->filter(fn (array $p): bool => $p['school_key'] !== null && str_contains($p['school_key'], $needle));
        }

        $profiles = $profiles->values();
        $activity = $this->activityByUser($profiles->pluck('user_id'));
        $rows = $profiles->map(fn (array $p): array => [...$p, ...($activity[$p['user_id']] ?? $this->emptyActivity())]);

        $ages = $rows->pluck('age')->filter(fn (?int $age): bool => $age !== null);

        return [
            'summary' => [
                'users' => $rows->count(),
                'complete' => $rows->where('complete', true)->count(),
                'players' => $rows->where('plays', '>', 0)->count(),
                'active_30d' => $rows->filter(fn (array $r): bool => $r['last_played_at'] !== null && $r['last_played_at'] >= now()->subDays(30)->toIso8601String())->count(),
                'schools' => $rows->pluck('school_key')->filter()->unique()->count(),
                'avg_age' => $ages->isEmpty() ? null : round($ages->avg(), 1),
                'median_age' => $ages->isEmpty() ? null : $ages->median(),
                'plays' => (int) $rows->sum('plays'),
            ],
            'byLevel' => collect([...array_keys(GameAnalytics::LEVELS), 'unknown'])->map(fn (string $key): array => $this->segment(
                $key,
                $rows->filter(fn (array $r): bool => $this->levelFor($r['grade']) === $key),
            ))->all(),
            'byGrade' => collect(range(1, 12))->map(fn (int $grade): array => $this->segment((string) $grade, $rows->where('grade', $grade)))
                ->push($this->segment('unknown', $rows->whereNull('grade')))
                ->all(),
            'byAge' => $this->ageSegments($rows),
            'byAgeGroup' => collect(GameAnalytics::AGE_GROUPS)->map(fn (array $range, string $label): array => $this->segment(
                $label,
                $rows->filter(fn (array $r): bool => $r['age'] !== null && $r['age'] >= $range[0] && $r['age'] <= $range[1]),
            ))->values()->push($this->segment('unknown', $rows->whereNull('age')))->all(),
            'bySchool' => $this->schoolSegments($rows),
            'matrix' => $this->gradeAgeMatrix($rows),
        ];
    }

    /**
     * Everything the admin user detail page renders besides the user record.
     *
     * @return array<string, mixed>
     */
    public function userDetail(User $user): array
    {
        $histories = GameHistory::query()->where('user_id', $user->id);

        $totals = (clone $histories)
            ->selectRaw('COUNT(*) as plays, SUM(points) as points, MAX(points) as best, SUM(correct) as correct, SUM(wrong) as wrong, SUM(duration_seconds) as duration, MIN(played_at) as first_played_at, MAX(played_at) as last_played_at')
            ->selectRaw('SUM(CASE WHEN correct IS NOT NULL AND (correct + wrong) > 0 AND correct * 100 > ? * (correct + wrong) THEN 1 ELSE 0 END) as passed', [GameAnalytics::PASS_PERCENT])
            ->selectRaw('SUM(CASE WHEN correct IS NOT NULL AND (correct + wrong) > 0 THEN 1 ELSE 0 END) as scored')
            ->first();

        $ledgerPoints = (int) PointLedger::query()->where('user_id', $user->id)->where('points', '>', 0)->sum('points');
        $spent = (int) -PointLedger::query()->where('user_id', $user->id)->where('points', '<', 0)->sum('points');

        return [
            'stats' => [
                'plays' => (int) $totals->plays,
                'game_points' => (int) $totals->points,
                'points' => $ledgerPoints,
                'spent_points' => $spent,
                'balance' => $ledgerPoints - $spent,
                'best' => (int) $totals->best,
                'accuracy' => $this->percent((int) $totals->correct, (int) $totals->correct + (int) $totals->wrong),
                'success_rate' => $this->percent((int) $totals->passed, (int) $totals->scored),
                'correct' => (int) $totals->correct,
                'wrong' => (int) $totals->wrong,
                'play_seconds' => (int) $totals->duration,
                'first_played_at' => $totals->first_played_at ? Carbon::parse($totals->first_played_at)->toIso8601String() : null,
                'last_played_at' => $totals->last_played_at ? Carbon::parse($totals->last_played_at)->toIso8601String() : null,
                'rank' => $this->rankFor($user, $ledgerPoints - $spent),
                'logins' => LoginActivity::query()->where('user_id', $user->id)->where('is_successful', true)->count(),
                'failed_logins' => LoginActivity::query()->where('user_id', $user->id)->where('is_successful', false)->count(),
            ],
            'perGame' => (clone $histories)
                ->selectRaw('game_key, COUNT(*) as plays, SUM(points) as points, MAX(points) as best, SUM(correct) as correct, SUM(wrong) as wrong, SUM(duration_seconds) as seconds, MAX(played_at) as last_played_at')
                ->groupBy('game_key')
                ->orderByDesc('plays')
                ->get()
                ->map(fn ($row): array => [
                    'key' => $row->game_key,
                    'plays' => (int) $row->plays,
                    'points' => (int) $row->points,
                    'best' => (int) $row->best,
                    'accuracy' => $this->percent((int) $row->correct, (int) $row->correct + (int) $row->wrong),
                    'play_seconds' => (int) $row->seconds,
                    'last_played_at' => Carbon::parse($row->last_played_at)->toIso8601String(),
                ])->all(),
            'daily' => $this->userDaily($user, 30),
            'trend' => (clone $histories)
                ->whereNotNull('correct')
                ->latest('played_at')
                ->limit(20)
                ->get(['id', 'game_key', 'points', 'correct', 'wrong', 'played_at'])
                ->reverse()
                ->values()
                ->map(fn (GameHistory $h): array => [
                    'id' => $h->id,
                    'game' => $h->game_key,
                    'points' => $h->points,
                    'accuracy' => $h->accuracy(),
                    'played_at' => $h->played_at->toIso8601String(),
                ])->all(),
            'subjects' => $this->subjectMastery($user),
            'ledger' => PointLedger::query()->where('user_id', $user->id)->latest('id')->limit(15)
                ->get(['id', 'points', 'reason', 'created_at'])
                ->map(fn (PointLedger $entry): array => [
                    'id' => $entry->id,
                    'points' => $entry->points,
                    'reason' => $entry->reason,
                    'created_at' => $entry->created_at?->toIso8601String(),
                ])->all(),
            'logins' => LoginActivity::query()->where('user_id', $user->id)->latest('login_at')->limit(15)->get()
                ->map(fn (LoginActivity $login): array => [
                    'id' => $login->id,
                    'ip_address' => $login->ip_address,
                    'device' => $login->parsedDevice(),
                    'is_successful' => $login->is_successful,
                    'login_at' => $login->login_at->toIso8601String(),
                ])->all(),
        ];
    }

    /**
     * Activity log entries about the user or performed by the user.
     *
     * @return list<array<string, mixed>>
     */
    public function activityFor(User $user, int $limit = 40): array
    {
        return Activity::query()
            ->with('causer')
            ->where(function (Builder $query) use ($user): void {
                $query->where(fn (Builder $q) => $q->where('subject_type', User::class)->where('subject_id', $user->id))
                    ->orWhere(fn (Builder $q) => $q->where('causer_type', User::class)->where('causer_id', $user->id));
            })
            ->tap(fn (Builder $query) => UserActivity::withoutHeartbeats($query))
            ->latest('id')
            ->limit($limit)
            ->get()
            ->map(fn (Activity $activity): array => [
                'id' => $activity->id,
                'log_name' => $activity->log_name,
                'description' => $activity->description,
                'event' => $activity->event,
                'subject_type' => $activity->subject_type ? class_basename($activity->subject_type) : null,
                'subject_id' => $activity->subject_id,
                'by_self' => $activity->causer_type === User::class && (int) $activity->causer_id === $user->id,
                'causer_name' => $activity->causer?->name,
                'changes' => $this->changedFields($activity),
                'properties' => UserActivity::displayProperties($activity),
                'created_at' => $activity->created_at?->toIso8601String(),
            ])->all();
    }

    /**
     * Profile rows of all registered players, keyed by user.
     *
     * @return Collection<int, array{user_id: int, grade: ?int, age: ?int, school: ?string, school_key: ?string, complete: bool}>
     */
    private function profileRows(): Collection
    {
        return PlayerProfile::query()
            ->whereIn('user_id', User::query()->select('id')->where('is_superadmin', false))
            ->get(['user_id', 'grade', 'birth_date', 'school_name'])
            ->map(function (PlayerProfile $profile): array {
                $school = $profile->school_name !== null ? Str::squish($profile->school_name) : null;

                return [
                    'user_id' => $profile->user_id,
                    'grade' => $profile->grade,
                    'age' => $profile->birth_date?->age,
                    'school' => $school ?: null,
                    'school_key' => $school ? Str::lower($school) : null,
                    'complete' => $profile->grade !== null && $profile->birth_date !== null && filled($school),
                ];
            });
    }

    /**
     * Game activity aggregated per user.
     *
     * @param  Collection<int, int>  $userIds
     * @return array<int, array{plays: int, points: int, correct: int, wrong: int, last_played_at: ?string}>
     */
    private function activityByUser(Collection $userIds): array
    {
        if ($userIds->isEmpty()) {
            return [];
        }

        return GameHistory::query()
            ->whereIn('user_id', $userIds)
            ->selectRaw('user_id, COUNT(*) as plays, SUM(points) as points, SUM(correct) as correct, SUM(wrong) as wrong, MAX(played_at) as last_played_at')
            ->groupBy('user_id')
            ->get()
            ->mapWithKeys(fn ($row): array => [(int) $row->user_id => [
                'plays' => (int) $row->plays,
                'points' => (int) $row->points,
                'correct' => (int) $row->correct,
                'wrong' => (int) $row->wrong,
                'last_played_at' => Carbon::parse($row->last_played_at)->toIso8601String(),
            ]])->all();
    }

    /** @return array{plays: int, points: int, correct: int, wrong: int, last_played_at: null} */
    private function emptyActivity(): array
    {
        return ['plays' => 0, 'points' => 0, 'correct' => 0, 'wrong' => 0, 'last_played_at' => null];
    }

    /**
     * @param  Collection<int, array<string, mixed>>  $rows
     * @return array<string, mixed>
     */
    private function segment(string $label, Collection $rows): array
    {
        $correct = (int) $rows->sum('correct');
        $wrong = (int) $rows->sum('wrong');
        $players = $rows->where('plays', '>', 0)->count();
        $ages = $rows->pluck('age')->filter(fn (?int $age): bool => $age !== null);

        return [
            'label' => $label,
            'users' => $rows->count(),
            'players' => $players,
            'plays' => (int) $rows->sum('plays'),
            'points' => (int) $rows->sum('points'),
            'avg_points' => $players > 0 ? round($rows->sum('points') / $players, 1) : 0,
            'accuracy' => $this->percent($correct, $correct + $wrong),
            'avg_age' => $ages->isEmpty() ? null : round($ages->avg(), 1),
        ];
    }

    /**
     * @param  Collection<int, array<string, mixed>>  $rows
     * @return list<array<string, mixed>>
     */
    private function ageSegments(Collection $rows): array
    {
        $segments = [$this->segment('≤'.self::AGE_MIN, $rows->filter(fn (array $r): bool => $r['age'] !== null && $r['age'] <= self::AGE_MIN))];

        foreach (range(self::AGE_MIN + 1, self::AGE_MAX - 1) as $age) {
            $segments[] = $this->segment((string) $age, $rows->where('age', $age));
        }

        $segments[] = $this->segment(self::AGE_MAX.'+', $rows->filter(fn (array $r): bool => $r['age'] !== null && $r['age'] >= self::AGE_MAX));
        $segments[] = $this->segment('unknown', $rows->whereNull('age'));

        return $segments;
    }

    /**
     * @param  Collection<int, array<string, mixed>>  $rows
     * @return list<array<string, mixed>>
     */
    private function schoolSegments(Collection $rows): array
    {
        return $rows->whereNotNull('school_key')
            ->groupBy('school_key')
            ->map(function (Collection $group): array {
                $grades = $group->pluck('grade')->filter();

                return [
                    ...$this->segment((string) $group->pluck('school')->countBy()->sortDesc()->keys()->first(), $group),
                    'grade_min' => $grades->min(),
                    'grade_max' => $grades->max(),
                    'levels' => $group->map(fn (array $r): string => $this->levelFor($r['grade']))->countBy()->all(),
                ];
            })
            ->sortByDesc('users')
            ->values()
            ->take(200)
            ->all();
    }

    /**
     * Users per grade (rows) and age group (columns).
     *
     * @param  Collection<int, array<string, mixed>>  $rows
     * @return array{columns: list<string>, rows: list<array{grade: int, counts: list<int>}>}
     */
    private function gradeAgeMatrix(Collection $rows): array
    {
        $groups = GameAnalytics::AGE_GROUPS;

        return [
            'columns' => array_keys($groups),
            'rows' => collect(range(1, 12))->map(fn (int $grade): array => [
                'grade' => $grade,
                'counts' => collect($groups)->map(fn (array $range): int => $rows
                    ->where('grade', $grade)
                    ->filter(fn (array $r): bool => $r['age'] !== null && $r['age'] >= $range[0] && $r['age'] <= $range[1])
                    ->count())->values()->all(),
            ])->all(),
        ];
    }

    /**
     * @param  Collection<int, array<string, mixed>>  $profiles
     * @return list<array{key: string, users: int}>
     */
    private function levelSplit(Collection $profiles): array
    {
        return collect([...array_keys(GameAnalytics::LEVELS), 'unknown'])->map(fn (string $key): array => [
            'key' => $key,
            'users' => $profiles->filter(fn (array $p): bool => $this->levelFor($p['grade']) === $key)->count(),
        ])->all();
    }

    /**
     * @param  Collection<int, array<string, mixed>>  $profiles
     * @return list<array{label: string, users: int}>
     */
    private function ageHistogram(Collection $profiles): array
    {
        return collect(GameAnalytics::AGE_GROUPS)->map(fn (array $range, string $label): array => [
            'label' => $label,
            'users' => $profiles->filter(fn (array $p): bool => $p['age'] !== null && $p['age'] >= $range[0] && $p['age'] <= $range[1])->count(),
        ])->values()->all();
    }

    private function levelFor(?int $grade): string
    {
        foreach (GameAnalytics::LEVELS as $key => [$min, $max]) {
            if ($grade !== null && $grade >= $min && $grade <= $max) {
                return $key;
            }
        }

        return 'unknown';
    }

    /** @return list<array{date: string, signups: int, plays: int, players: int, points: int}> */
    private function dailySeries(int $days): array
    {
        $from = now()->subDays($days - 1)->startOfDay();
        $signups = User::query()->where('created_at', '>=', $from)->pluck('created_at')
            ->countBy(fn (Carbon $date): string => $date->toDateString());
        $plays = GameHistory::query()->where('played_at', '>=', $from)->get(['played_at', 'user_id', 'points'])
            ->groupBy(fn (GameHistory $h): string => $h->played_at->toDateString());

        return collect(range($days - 1, 0))->map(function (int $ago) use ($signups, $plays): array {
            $date = now()->subDays($ago)->toDateString();
            $day = $plays->get($date, collect());

            return [
                'date' => $date,
                'signups' => (int) $signups->get($date, 0),
                'plays' => $day->count(),
                'players' => $day->pluck('user_id')->unique()->count(),
                'points' => (int) $day->sum('points'),
            ];
        })->all();
    }

    /** @return list<array{date: string, plays: int, points: int}> */
    private function userDaily(User $user, int $days): array
    {
        $plays = GameHistory::query()
            ->where('user_id', $user->id)
            ->where('played_at', '>=', now()->subDays($days - 1)->startOfDay())
            ->get(['played_at', 'points'])
            ->groupBy(fn (GameHistory $h): string => $h->played_at->toDateString());

        return collect(range($days - 1, 0))->map(function (int $ago) use ($plays): array {
            $date = now()->subDays($ago)->toDateString();
            $day = $plays->get($date, collect());

            return ['date' => $date, 'plays' => $day->count(), 'points' => (int) $day->sum('points')];
        })->all();
    }

    /** @return list<array<string, mixed>> */
    private function recentPlays(int $limit): array
    {
        return GameHistory::query()
            ->with('user:id,name')
            ->latest('played_at')
            ->latest('id')
            ->limit($limit)
            ->get()
            ->map(fn (GameHistory $h): array => [
                'id' => $h->id,
                'user_id' => $h->user_id,
                'name' => $h->user?->name,
                'game' => $h->game_key,
                'points' => $h->points,
                'accuracy' => $h->accuracy(),
                'played_at' => $h->played_at->toIso8601String(),
            ])->all();
    }

    /** @return list<array<string, mixed>> */
    private function recentUsers(int $limit): array
    {
        return User::query()
            ->with('playerProfile:id,user_id,grade,birth_date,school_name')
            ->latest('id')
            ->limit($limit)
            ->get()
            ->map(fn (User $user): array => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'avatar_url' => $user->avatar_url,
                'grade' => $user->playerProfile?->grade,
                'age' => $user->playerProfile?->age,
                'school_name' => $user->playerProfile?->school_name,
                'created_at' => $user->created_at?->toIso8601String(),
            ])->all();
    }

    /** @return list<array{subject: string, answered: int, accuracy: ?float}> */
    private function subjectMastery(User $user): array
    {
        return QuestionAnswer::query()
            ->join('questions', 'questions.id', '=', 'question_answers.question_id')
            ->whereIn('question_answers.game_history_id', GameHistory::query()->select('id')->where('user_id', $user->id))
            ->selectRaw('questions.subject as subject, COUNT(*) as answered, SUM(CASE WHEN question_answers.correct THEN 1 ELSE 0 END) as correct')
            ->groupBy('questions.subject')
            ->get()
            ->map(fn ($row): array => [
                'subject' => $row->subject,
                'answered' => (int) $row->answered,
                'accuracy' => $this->percent((int) $row->correct, (int) $row->answered),
            ])
            ->sortByDesc('answered')
            ->values()
            ->all();
    }

    /** Position among active players by total points, or null when the user has none. */
    private function rankFor(User $user, int $points): ?int
    {
        if ($points <= 0) {
            return null;
        }

        $ahead = PointLedger::query()
            ->whereIn('user_id', User::query()->select('id')->whereNull('disabled_at'))
            ->groupBy('user_id')
            ->havingRaw('SUM(points) > ?', [$points])
            ->select('user_id')
            ->get()
            ->count();

        return $ahead + 1;
    }

    /** @return list<array{field: string, old: mixed, new: mixed}> */
    private function changedFields(Activity $activity): array
    {
        $new = (array) ($activity->properties['attributes'] ?? []);
        $old = (array) ($activity->properties['old'] ?? []);

        return collect($new)
            ->except(['password', 'remember_token', 'two_factor_secret', 'two_factor_recovery_codes', 'updated_at', 'last_seen_at'])
            ->map(fn (mixed $value, string $field): array => ['field' => $field, 'old' => $old[$field] ?? null, 'new' => $value])
            ->values()
            ->take(8)
            ->all();
    }

    private function delta(int $current, int $previous): ?float
    {
        if ($previous === 0) {
            return $current > 0 ? 100.0 : null;
        }

        return round(($current - $previous) / $previous * 100, 1);
    }

    private function percent(int $part, int $whole): ?float
    {
        return $whole > 0 ? round($part / $whole * 100, 1) : null;
    }
}
