<?php

namespace App\Services\Ai;

use App\Models\AdDailyStat;
use App\Models\GameHistory;
use App\Models\GameMatch;
use App\Models\PointLedger;
use App\Models\Question;
use App\Models\QuestionAnswer;
use App\Models\ScreenTimeDaily;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/** Request-local, read-only projections. Never serialize complete models. */
class AdminAssistantData
{
    public const OPERATIONS = ['catalog', 'players', 'player', 'results', 'matches', 'points', 'questions', 'screen_time', 'ads', 'leaderboard'];

    /** @var array<string, array{label: string, url: string}> */
    private array $retrievedSources = [];

    private int $queries = 0;

    public function __construct(private User $actor) {}

    public function authorize(): void
    {
        abort_unless($this->actor->is_superadmin && User::query()->whereKey($this->actor->id)->where('is_superadmin', true)->whereNull('disabled_at')->exists(), 403);
    }

    /** @return list<array{label: string, url: string}> */
    public function sources(): array
    {
        return array_values($this->retrievedSources);
    }

    /** @param array<string, mixed> $input
     * @return array<string, mixed>
     */
    public function query(array $input): array
    {
        $this->authorize();
        if (++$this->queries > 12) {
            throw ValidationException::withMessages(['operation' => __('ai_assistant.query_limit')]);
        }

        $gameKeys = collect(config('game-catalog.categories', []))->flatMap(fn (array $category): array => $category['games'])->pluck('key')->all();
        $validated = Validator::make(['query' => $input], [
            'query' => ['required', 'array:operation,search,user_id,game,from,to'],
            'query.operation' => ['required', Rule::in(self::OPERATIONS)],
            'query.search' => ['sometimes', 'string', 'min:2', 'max:100'],
            'query.user_id' => ['sometimes', 'integer', 'min:1'],
            'query.game' => ['sometimes', Rule::in($gameKeys)],
            'query.from' => ['sometimes', 'date_format:Y-m-d'],
            'query.to' => ['sometimes', 'date_format:Y-m-d'],
        ])->validate()['query'];
        $operation = $validated['operation'];
        $allowed = match ($operation) {
            'catalog' => [],
            'players' => ['search'],
            'player' => ['user_id', 'from', 'to'],
            'results', 'matches' => ['game', 'user_id', 'from', 'to'],
            'points', 'screen_time' => ['user_id', 'from', 'to'],
            'ads' => ['game', 'from', 'to'],
            'questions', 'leaderboard' => ['from', 'to'],
        };
        if (array_diff(array_keys($validated), ['operation', ...$allowed]) !== [] || ($operation === 'player' && ! isset($validated['user_id']))) {
            throw ValidationException::withMessages(['query' => __('ai_assistant.invalid_filter')]);
        }
        $from = CarbonImmutable::parse($validated['from'] ?? now()->subDays(29)->toDateString())->startOfDay();
        $to = CarbonImmutable::parse($validated['to'] ?? now()->toDateString())->endOfDay();
        if ($from->gt($to) || $from->diffInDays($to) > 366) {
            throw ValidationException::withMessages(['from' => __('ai_assistant.invalid_range')]);
        }
        $range = ['from' => $from->toDateString(), 'to' => $to->toDateString(), 'timezone' => config('app.timezone')];
        $userId = isset($validated['user_id']) ? (int) $validated['user_id'] : null;
        $game = $validated['game'] ?? null;
        $data = match ($operation) {
            'catalog' => ['games' => collect(config('game-catalog.categories', []))->flatMap(fn (array $category): array => $category['games'])->map(fn (array $row): array => array_intersect_key($row, array_flip(['key', 'min_grade', 'max_grade', 'min_players', 'max_players', 'awards_points', 'multiplayer', 'released_at'])))->values()->all()],
            'players' => $this->players($validated['search'] ?? null),
            'player' => $this->player($userId, $from, $to),
            'results' => $this->results($from, $to, $userId, $game),
            'matches' => $this->matches($from, $to, $userId, $game),
            'points' => $this->points($from, $to, $userId),
            'questions' => $this->questions($from, $to),
            'screen_time' => $this->screenTime($from, $to, $userId),
            'ads' => $this->ads($from, $to, $game),
            'leaderboard' => $this->leaderboard(isset($validated['from']) || isset($validated['to']) ? [$from, $to] : null),
        };
        $route = match ($operation) {
            'catalog', 'results' => 'admin.games.index',
            'players' => 'admin.users.index',
            'player' => 'admin.users.show',
            'matches' => 'admin.matches.index',
            'points', 'leaderboard' => 'admin.leaderboard.index',
            'questions' => 'admin.questions.index',
            'screen_time' => 'admin.screen-time.index',
            'ads' => 'admin.ads.index',
        };
        $source = ['label' => __('ai_assistant.sources.'.$operation), 'url' => route($route, $operation === 'player' ? ['user' => $userId] : [], false)];
        $this->retrievedSources[$source['url']] = $source;

        return ['data' => $data, 'range' => $range, 'queried_at' => now()->toIso8601String(), 'source' => $source];
    }

    /**
     * Top accounts by signed point-ledger balance; all-time unless a range is given.
     *
     * @param  array{0: CarbonImmutable, 1: CarbonImmutable}|null  $range
     * @return array<string, mixed>
     */
    private function leaderboard(?array $range): array
    {
        $rows = PointLedger::query()
            ->select('user_id')
            ->selectRaw('SUM(points) AS net_points, SUM(CASE WHEN points > 0 THEN points ELSE 0 END) AS earned')
            ->whereHas('user', fn (Builder $user) => $user->whereNull('disabled_at'))
            ->when($range, fn (Builder $query) => $query->whereBetween('created_at', $range))
            ->groupBy('user_id')
            ->orderByDesc('net_points')
            ->orderBy('user_id')
            ->limit(10)
            ->get();
        $users = User::query()->select(['id', 'name', 'created_at'])
            ->with('playerProfile:id,user_id,nickname,grade,school_name,school_city')
            ->whereKey($rows->pluck('user_id'))
            ->get()
            ->keyBy('id');

        return [
            'scope' => $range ? 'range' : 'all_time',
            'players' => $rows->values()->map(fn (PointLedger $row, int $index): array => [
                'rank' => $index + 1,
                'player' => $users->has($row->user_id) ? $this->presentPlayer($users[$row->user_id]) : ['id' => (int) $row->user_id],
                'net_points' => (int) $row->getAttribute('net_points'),
                'earned' => (int) $row->getAttribute('earned'),
            ])->all(),
            'limit' => 10,
        ];
    }

    /** @return array<string, mixed> */
    private function players(?string $search): array
    {
        $query = User::query()->select(['id', 'name', 'created_at'])
            ->with('playerProfile:id,user_id,nickname,grade,school_name,school_city');
        if ($search !== null) {
            $term = '%'.addcslashes($search, '%_\\').'%';
            $query->where(fn (Builder $query) => $query->where('name', 'like', $term)->orWhereHas('playerProfile', fn (Builder $profile) => $profile->where('nickname', 'like', $term)->orWhere('school_name', 'like', $term)));
        }
        $rows = $query->orderBy('id')->limit(21)->get();

        return ['players' => $rows->take(20)->map(fn (User $user): array => $this->presentPlayer($user))->all(), 'has_more' => $rows->count() > 20, 'limit' => 20];
    }

    /** @return array<string, mixed> */
    private function presentPlayer(User $user): array
    {
        return ['id' => $user->id, 'name' => mb_substr($user->name, 0, 255), 'created_at' => $user->created_at?->toIso8601String(), 'profile' => $user->playerProfile?->only(['nickname', 'grade', 'school_name', 'school_city'])];
    }

    /** @return array<string, mixed> */
    private function player(int $id, CarbonImmutable $from, CarbonImmutable $to): array
    {
        $user = User::query()->select(['id', 'name', 'created_at'])->with('playerProfile:id,user_id,nickname,grade,school_name,school_city')->find($id);
        if ($user === null) {
            return ['player' => null];
        }

        return ['player' => $this->presentPlayer($user), 'results' => $this->results($from, $to, $id), 'points_in_range' => $this->points($from, $to, $id), 'net_points_all_time' => (int) PointLedger::query()->where('user_id', $id)->sum('points'), 'screen_time' => $this->screenTime($from, $to, $id)];
    }

    /** @return array<string, mixed> */
    private function results(CarbonImmutable $from, CarbonImmutable $to, ?int $userId = null, ?string $game = null): array
    {
        $query = GameHistory::query()->whereBetween('played_at', [$from, $to])->when($userId, fn (Builder $query) => $query->where('user_id', $userId))->when($game, fn (Builder $query) => $query->where('game_key', $game));
        $stats = (clone $query)->selectRaw('COUNT(*) AS count, COALESCE(SUM(points), 0) AS points, COALESCE(SUM(correct), 0) AS correct, COALESCE(SUM(wrong), 0) AS wrong, COALESCE(SUM(duration_seconds), 0) AS duration_seconds, COUNT(correct) AS results_with_answers')->first();
        $summary = array_map('intval', $stats->getAttributes());
        $summary['recent'] = (clone $query)->latest('played_at')->latest('id')->limit(20)->get(['id', 'user_id', 'game_key', 'points', 'correct', 'wrong', 'duration_seconds', 'played_at'])->map(fn (GameHistory $row): array => $row->only(['id', 'user_id', 'game_key', 'points', 'correct', 'wrong', 'duration_seconds', 'played_at']))->all();
        $summary['recent_limit'] = 20;

        return $summary;
    }

    /** @return array<string, mixed> */
    private function matches(CarbonImmutable $from, CarbonImmutable $to, ?int $userId, ?string $game): array
    {
        $query = GameMatch::query()->whereBetween('ended_at', [$from, $to])->when($game, fn (Builder $query) => $query->where('game_key', $game))->when($userId, fn (Builder $query) => $query->whereHas('players', fn (Builder $players) => $players->where('user_id', $userId)));

        return ['count' => (clone $query)->count(), 'finished' => (clone $query)->where('finished', true)->count(), 'recent' => (clone $query)->latest('ended_at')->latest('id')->limit(20)->get(['id', 'game_key', 'mode', 'grade', 'level', 'players_count', 'finished', 'ended_at'])->map(fn (GameMatch $row): array => $row->only(['id', 'game_key', 'mode', 'grade', 'level', 'players_count', 'finished', 'ended_at']))->all(), 'recent_limit' => 20];
    }

    /** @return array<string, int> */
    private function points(CarbonImmutable $from, CarbonImmutable $to, ?int $userId): array
    {
        $query = PointLedger::query()->whereBetween('created_at', [$from, $to])->when($userId, fn (Builder $query) => $query->where('user_id', $userId));

        return ['entries' => (clone $query)->count(), 'net_points' => (int) (clone $query)->sum('points'), 'earned' => (int) (clone $query)->where('points', '>', 0)->sum('points'), 'spent' => -(int) (clone $query)->where('points', '<', 0)->sum('points')];
    }

    /** @return array<string, mixed> */
    private function questions(CarbonImmutable $from, CarbonImmutable $to): array
    {
        $answers = QuestionAnswer::query()->whereBetween('created_at', [$from, $to]);

        return ['bank_total_current' => Question::query()->count(), 'bank_active_current' => Question::query()->active()->count(), 'created_in_range' => Question::query()->whereBetween('created_at', [$from, $to])->count(), 'answers_in_range' => (clone $answers)->count(), 'correct_in_range' => (clone $answers)->where('correct', true)->count(), 'subjects_current' => Question::query()->select('subject')->selectRaw('COUNT(*) AS count')->groupBy('subject')->orderByDesc('count')->limit(30)->get()->map(fn (Question $row): array => ['subject' => $row->subject, 'count' => (int) $row->getAttribute('count')])->all()];
    }

    /** @return array<string, mixed> */
    private function screenTime(CarbonImmutable $from, CarbonImmutable $to, ?int $userId): array
    {
        $query = ScreenTimeDaily::query()->whereBetween('date', [$from->toDateString(), $to->toDateString()])->when($userId, fn (Builder $query) => $query->where('user_id', $userId));

        return ['timezone' => (string) config('screen-time.timezone', 'UTC'), 'seconds' => (int) (clone $query)->sum('seconds'), 'by_area' => (clone $query)->select('area')->selectRaw('SUM(seconds) AS seconds')->groupBy('area')->orderByDesc('seconds')->limit(30)->get()->map(fn (ScreenTimeDaily $row): array => $row->only(['area', 'seconds']))->all()];
    }

    /** @return array<string, int> */
    private function ads(CarbonImmutable $from, CarbonImmutable $to, ?string $game): array
    {
        $query = AdDailyStat::query()->whereDate('day', '>=', $from->toDateString())->whereDate('day', '<=', $to->toDateString())->when($game, fn (Builder $query) => $query->where('game_key', $game));

        return ['impressions' => (int) (clone $query)->sum('impressions'), 'clicks' => (int) (clone $query)->sum('clicks'), 'plays' => (int) (clone $query)->sum('plays')];
    }
}
