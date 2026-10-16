<?php

namespace App\Services;

use App\Models\User;
use App\Models\UserAbilityAssessment;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Query\Expression;
use Illuminate\Support\Carbon;

/**
 * Per-account learning progress for the super admin: how many games each
 * account played, how many questions it answered, and whether an AI ability
 * analysis exists. Shared by the admin page and the AI assistant so both read
 * the same numbers.
 *
 * Answered questions come from `game_histories.correct + wrong` (reported by
 * the game server per finished game); plays without answer counts add nothing.
 */
class PlayerProgressReport
{
    public const PER_PAGE = 20;

    /** @var list<string> */
    public const SORTS = ['last_played', 'plays', 'answered', 'points', 'name'];

    /** @var list<string> */
    public const AI_FILTERS = ['analyzed', 'not_analyzed', 'pending', 'failed'];

    /** @var list<string> */
    public const ACTIVITY_FILTERS = ['played', 'never_played'];

    /**
     * @param  array{search?: ?string, ai?: ?string, activity?: ?string, sort?: ?string, direction?: ?string, user_id?: ?int}  $filters
     * @return LengthAwarePaginator<int, array<string, mixed>>
     */
    public function paginate(array $filters, int $perPage = self::PER_PAGE): LengthAwarePaginator
    {
        $paginator = $this->query($filters)->paginate($perPage)->withQueryString();
        $paginator->setCollection($paginator->getCollection()->map(fn (User $user): array => $this->present($user)));

        return $paginator;
    }

    /**
     * Rows without pagination (AI assistant), at most $limit.
     *
     * @param  array{search?: ?string, ai?: ?string, activity?: ?string, sort?: ?string, direction?: ?string, user_id?: ?int}  $filters
     * @return list<array<string, mixed>>
     */
    public function rows(array $filters, int $limit = 20): array
    {
        return $this->query($filters)->limit($limit)->get()->map(fn (User $user): array => $this->present($user))->values()->all();
    }

    /**
     * Totals over every non-superadmin account (not affected by filters).
     *
     * @return array{accounts: int, played: int, never_played: int, analyzed: int, not_analyzed: int, pending: int, plays: int, answered: int, correct: int, accuracy: ?float}
     */
    public function summary(): array
    {
        $accounts = $this->accounts();
        $total = (clone $accounts)->count();
        $played = (clone $accounts)->whereHas('gameHistories')->count();
        $analyzed = (clone $accounts)->whereHas('abilityAssessments', fn (Builder $query) => $query->where('status', UserAbilityAssessment::DONE))->count();
        $pending = (clone $accounts)->whereHas('abilityAssessments', fn (Builder $query) => $query->running())->count();
        $stats = User::query()
            ->where('users.is_superadmin', false)
            ->join('game_histories', 'game_histories.user_id', '=', 'users.id')
            ->selectRaw('COUNT(game_histories.id) AS plays, COALESCE(SUM(game_histories.correct), 0) AS correct, COALESCE(SUM(game_histories.wrong), 0) AS wrong')
            ->toBase()
            ->first();
        $correct = (int) ($stats->correct ?? 0);
        $answered = $correct + (int) ($stats->wrong ?? 0);

        return [
            'accounts' => $total,
            'played' => $played,
            'never_played' => $total - $played,
            'analyzed' => $analyzed,
            'not_analyzed' => $total - $analyzed,
            'pending' => $pending,
            'plays' => (int) ($stats->plays ?? 0),
            'answered' => $answered,
            'correct' => $correct,
            'accuracy' => $answered > 0 ? round($correct / $answered * 100, 1) : null,
        ];
    }

    /** @return Builder<User> */
    private function accounts(): Builder
    {
        return User::query()->where('is_superadmin', false);
    }

    /**
     * @param  array{search?: ?string, ai?: ?string, activity?: ?string, sort?: ?string, direction?: ?string, user_id?: ?int}  $filters
     * @return Builder<User>
     */
    private function query(array $filters): Builder
    {
        $done = fn (Builder $query) => $query->where('status', UserAbilityAssessment::DONE);
        $search = $filters['search'] ?? null;
        $sort = in_array($filters['sort'] ?? null, self::SORTS, true) ? $filters['sort'] : 'last_played';
        $direction = ($filters['direction'] ?? null) === 'asc' ? 'asc' : 'desc';

        return $this->accounts()
            ->select(['users.id', 'users.name', 'users.avatar_url', 'users.created_at', 'users.last_seen_at', 'users.disabled_at'])
            ->with([
                'playerProfile:id,user_id,nickname,grade,school_name',
                'latestAbilityAssessment' => fn ($query) => $query->select(['user_ability_assessments.id', 'user_ability_assessments.user_id', 'user_ability_assessments.status', 'user_ability_assessments.trigger', 'user_ability_assessments.result', 'user_ability_assessments.created_at']),
            ])
            ->withCount([
                'gameHistories as plays',
                'abilityAssessments as analyses' => $done,
                'classroomMembers as classrooms',
                'badges',
            ])
            ->withAggregate('gameHistories as games', new Expression('DISTINCT game_key'), 'count')
            ->withAggregate('gameHistories as answered', new Expression('COALESCE(correct, 0) + COALESCE(wrong, 0)'), 'sum')
            ->withSum('gameHistories as correct', 'correct')
            ->withSum('gameHistories as wrong', 'wrong')
            ->withSum('gameHistories as seconds', 'duration_seconds')
            ->withSum('gameHistories as game_points', 'points')
            ->withMax('gameHistories as last_played_at', 'played_at')
            ->withMax(['abilityAssessments as analyzed_at' => $done], 'created_at')
            ->withSum('pointLedgers as account_points', 'points')
            ->when($filters['user_id'] ?? null, fn (Builder $query, int $id) => $query->whereKey($id))
            ->when($search, function (Builder $query, string $search): void {
                $term = '%'.addcslashes($search, '%_\\').'%';
                $query->where(fn (Builder $query) => $query
                    ->where('users.name', 'like', $term)
                    ->orWhereHas('playerProfile', fn (Builder $profile) => $profile->where('nickname', 'like', $term)->orWhere('school_name', 'like', $term)));
            })
            ->when(($filters['ai'] ?? null) === 'analyzed', fn (Builder $query) => $query->whereHas('abilityAssessments', $done))
            ->when(($filters['ai'] ?? null) === 'not_analyzed', fn (Builder $query) => $query->whereDoesntHave('abilityAssessments', $done))
            ->when(($filters['ai'] ?? null) === 'pending', fn (Builder $query) => $query->whereHas('abilityAssessments', fn (Builder $query) => $query->running()))
            ->when(($filters['ai'] ?? null) === 'failed', fn (Builder $query) => $query->whereHas('latestAbilityAssessment', fn (Builder $query) => $query->where('status', UserAbilityAssessment::FAILED)))
            ->when(($filters['activity'] ?? null) === 'played', fn (Builder $query) => $query->whereHas('gameHistories'))
            ->when(($filters['activity'] ?? null) === 'never_played', fn (Builder $query) => $query->whereDoesntHave('gameHistories'))
            ->when($sort === 'name', fn (Builder $query) => $query->orderBy('users.name', $direction))
            ->when($sort === 'plays', fn (Builder $query) => $query->orderBy('plays', $direction))
            ->when($sort === 'answered', fn (Builder $query) => $query->orderBy('answered', $direction))
            ->when($sort === 'points', fn (Builder $query) => $query->orderBy('account_points', $direction))
            ->when($sort === 'last_played', fn (Builder $query) => $query->orderBy('last_played_at', $direction))
            ->orderBy('users.id');
    }

    /** @return array<string, mixed> */
    private function present(User $user): array
    {
        $correct = (int) $user->getAttribute('correct');
        $answered = (int) $user->getAttribute('answered');
        $latest = $user->latestAbilityAssessment;
        $status = match (true) {
            $latest === null => 'none',
            $latest->status === UserAbilityAssessment::PENDING && $latest->created_at?->lt(now()->subMinutes(UserAbilityAssessment::STALE_MINUTES)) => UserAbilityAssessment::FAILED,
            default => $latest->status,
        };
        $done = $latest?->status === UserAbilityAssessment::DONE ? $latest : null;
        $lastPlayed = $user->getAttribute('last_played_at');
        $analyzedAt = $user->getAttribute('analyzed_at');

        return [
            'id' => $user->id,
            'name' => $user->name,
            'nickname' => $user->playerProfile?->nickname,
            'avatar_url' => $user->avatar_url,
            'grade' => $user->playerProfile?->grade,
            'school_name' => $user->playerProfile?->school_name,
            'disabled' => $user->disabled_at !== null,
            'joined_at' => $user->created_at?->toIso8601String(),
            'last_seen_at' => $user->last_seen_at?->toIso8601String(),
            'plays' => (int) $user->getAttribute('plays'),
            'games' => (int) $user->getAttribute('games'),
            'answered' => $answered,
            'correct' => $correct,
            'wrong' => (int) $user->getAttribute('wrong'),
            'accuracy' => $answered > 0 ? round($correct / $answered * 100, 1) : null,
            'seconds' => (int) $user->getAttribute('seconds'),
            'game_points' => (int) $user->getAttribute('game_points'),
            'account_points' => (int) $user->getAttribute('account_points'),
            'classrooms' => (int) $user->getAttribute('classrooms'),
            'badges' => (int) $user->getAttribute('badges_count'),
            'last_played_at' => $lastPlayed ? Carbon::parse($lastPlayed)->toIso8601String() : null,
            'ai' => [
                'status' => $status,
                'analyses' => (int) $user->getAttribute('analyses'),
                'analyzed_at' => $analyzedAt ? Carbon::parse($analyzedAt)->toIso8601String() : null,
                'summary' => $done ? mb_substr((string) ($done->result['summary'] ?? ''), 0, 400) : null,
                'confidence' => $done ? ($done->result['confidence'] ?? null) : null,
            ],
        ];
    }
}
