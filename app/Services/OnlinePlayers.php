<?php

namespace App\Services;

use App\Models\User;
use App\Services\Chat\ChatServiceClient;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\Cache;

/**
 * Players online right now. The Go chat service is the live source (one
 * socket per open tab); when it is off or unreachable the recent
 * `last_seen_at` window is used instead. Only active accounts with a player
 * profile count.
 */
class OnlinePlayers
{
    public const CACHE_SECONDS = 15;

    public const FALLBACK_MINUTES = 5;

    public const PER_PAGE = 24;

    public function __construct(
        private ChatServiceClient $client,
        private FriendService $friends,
        private CharacterShop $shop,
    ) {}

    public function count(): int
    {
        return $this->query()->count();
    }

    /**
     * Small payload for the live counter poll: no ids, names or other PII.
     *
     * @return array{count: int, source: string}
     */
    public function summary(): array
    {
        return ['count' => $this->count(), 'source' => $this->source()];
    }

    /**
     * One page of online players for the viewer, the viewer first.
     *
     * @return LengthAwarePaginator<int, array<string, mixed>>
     */
    public function page(User $viewer, int $page = 1): LengthAwarePaginator
    {
        $paginator = $this->query()
            ->with('playerProfile')
            ->orderByRaw('users.id = ? desc', [$viewer->id])
            ->orderByDesc('last_seen_at')
            ->orderBy('id')
            ->paginate(self::PER_PAGE, ['users.id', 'users.name', 'users.last_seen_at'], 'page', $page);

        $users = $paginator->getCollection();
        $relations = $this->friends->relationsFor($viewer, $users->pluck('id')->all());
        $looks = $this->shop->looks($users->pluck('playerProfile')->filter());

        return $paginator->through(fn (User $user): array => [
            'id' => $user->id,
            'name' => $user->playerProfile?->nickname ?: $user->name,
            'grade' => $user->playerProfile?->grade,
            'school' => $user->playerProfile?->school_name,
            'character' => $looks[$user->id] ?? null,
            'isMe' => $viewer->is($user),
            'relation' => $viewer->is($user) ? 'self' : ($relations[$user->id]['relation'] ?? 'none'),
        ]);
    }

    /** 'live' when the chat socket list is used, else 'recent'. */
    public function source(): string
    {
        return $this->liveIds() === null ? 'recent' : 'live';
    }

    /** @return Builder<User> */
    private function query(): Builder
    {
        $ids = $this->liveIds();

        return User::query()
            ->whereNull('disabled_at')
            ->whereHas('playerProfile')
            ->when(
                $ids === null,
                fn (Builder $q) => $q->where('last_seen_at', '>=', now()->subMinutes(self::FALLBACK_MINUTES)),
                fn (Builder $q) => $q->whereKey($ids),
            );
    }

    /** @return list<int>|null */
    private function liveIds(): ?array
    {
        if (! $this->client->isConfigured()) {
            return null;
        }

        /** @var array{ids: list<int>|null} $cached */
        $cached = Cache::remember('players:online', self::CACHE_SECONDS, fn (): array => ['ids' => $this->client->onlineUserIds()]);

        return $cached['ids'];
    }
}
