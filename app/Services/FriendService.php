<?php

namespace App\Services;

use App\Models\Friendship;
use App\Models\User;
use App\Notifications\PlayerNotification;
use App\Services\Chat\ChatServiceClient;
use App\Services\WhatsApp\WhatsAppNotifier;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Player friendships: send, accept, decline, cancel and remove. Every change
 * also lands in the bell (database notification) and is pushed live over the
 * chat socket (`{t: 'friend', ...}`), so the other player sees a popup on any
 * page that is not a running game.
 */
class FriendService
{
    public function __construct(
        private ChatServiceClient $client,
        private CharacterShop $shop,
        private WhatsAppNotifier $whatsApp,
    ) {}

    /** Send a request; accepts at once when the other player already asked us. */
    public function request(User $from, User $to): Friendship
    {
        if ($from->is($to)) {
            throw ValidationException::withMessages(['user_id' => __('friends.self')]);
        }
        if ($to->disabled_at !== null || $to->playerProfile()->doesntExist()) {
            throw ValidationException::withMessages(['user_id' => __('friends.unavailable')]);
        }

        return DB::transaction(function () use ($from, $to): Friendship {
            $existing = Friendship::query()->between($from->id, $to->id)->lockForUpdate()->first();

            if ($existing?->status === Friendship::ACCEPTED) {
                throw ValidationException::withMessages(['user_id' => __('friends.already_friends')]);
            }
            if ($existing !== null && $existing->requester_id === $from->id) {
                throw ValidationException::withMessages(['user_id' => __('friends.already_sent')]);
            }
            if ($existing !== null) {
                return $this->accept($from, $existing);
            }

            $this->guardLimits($from);
            $friendship = Friendship::query()->create([
                'requester_id' => $from->id,
                'addressee_id' => $to->id,
                'status' => Friendship::PENDING,
            ]);

            $to->notify(PlayerNotification::system('friend', 'player_notifications.friend_request', ['name' => $this->name($from)], '/friends?tab=requests'));
            $this->push($to, 'request', $from, $friendship);
            $this->whatsApp->notify($to, 'friend_request', ['from' => $this->name($from), 'link' => url('/friends?tab=requests')]);

            return $friendship;
        });
    }

    public function accept(User $user, Friendship $friendship): Friendship
    {
        $this->guardPendingFor($user, $friendship);
        $this->guardLimits($user, sending: false);

        $friendship->forceFill(['status' => Friendship::ACCEPTED, 'responded_at' => now()])->save();
        $requester = $friendship->requester()->firstOrFail();
        $this->clearRequestNotice($user, $requester);

        $requester->notify(PlayerNotification::system('friend', 'player_notifications.friend_accepted', ['name' => $this->name($user)], '/friends'));
        $this->push($requester, 'accepted', $user, $friendship);

        return $friendship;
    }

    public function decline(User $user, Friendship $friendship): void
    {
        $this->guardPendingFor($user, $friendship);
        $requester = $friendship->requester()->first();
        $friendship->delete();
        if ($requester) {
            $this->clearRequestNotice($user, $requester);
        }
    }

    /** Cancel an own pending request or remove an accepted friend. */
    public function remove(User $user, Friendship $friendship): void
    {
        if ($friendship->requester_id !== $user->id && $friendship->addressee_id !== $user->id) {
            abort(404);
        }
        if ($friendship->status === Friendship::PENDING && $friendship->requester_id !== $user->id) {
            throw ValidationException::withMessages(['friendship' => __('friends.not_yours')]);
        }

        $other = User::query()->find($friendship->otherId($user->id));
        $wasPending = $friendship->status === Friendship::PENDING;
        $friendship->delete();

        if ($other && $wasPending) {
            $this->clearRequestNotice($other, $user);
        }
        if ($other) {
            $this->push($other, $wasPending ? 'cancelled' : 'removed', $user, null);
        }
    }

    /** @return list<int> ids of accepted friends */
    public function friendIds(User $user): array
    {
        return Friendship::query()
            ->involving($user->id)
            ->where('status', Friendship::ACCEPTED)
            ->get(['requester_id', 'addressee_id'])
            ->map(fn (Friendship $f): int => $f->otherId($user->id))
            ->values()
            ->all();
    }

    /**
     * Relation of the viewer to each listed player (leaderboards, player pages).
     * The viewer and players without a row are absent: treat them as `none`.
     *
     * @param  list<int>  $userIds
     * @return array<int, array{relation: 'friends'|'sent'|'received', friendship_id: int}>
     */
    public function relationsFor(User $viewer, array $userIds): array
    {
        $userIds = array_values(array_diff($userIds, [$viewer->id]));
        if ($userIds === []) {
            return [];
        }

        return Friendship::query()
            ->involving($viewer->id)
            ->where(fn (Builder $q) => $q->whereIn('requester_id', $userIds)->orWhereIn('addressee_id', $userIds))
            ->get()
            ->mapWithKeys(fn (Friendship $f): array => [$f->otherId($viewer->id) => [
                'relation' => match (true) {
                    $f->status === Friendship::ACCEPTED => 'friends',
                    $f->requester_id === $viewer->id => 'sent',
                    default => 'received',
                },
                'friendship_id' => $f->id,
            ]])
            ->all();
    }

    public function pendingCount(User $user): int
    {
        return Friendship::query()->where('addressee_id', $user->id)->where('status', Friendship::PENDING)->count();
    }

    /**
     * Friends page data: accepted friends, incoming and outgoing requests.
     *
     * @return array{friends: list<array<string, mixed>>, incoming: list<array<string, mixed>>, outgoing: list<array<string, mixed>>}
     */
    public function overview(User $user): array
    {
        $rows = Friendship::query()
            ->involving($user->id)
            ->with(['requester.playerProfile', 'addressee.playerProfile'])
            ->latest('updated_at')
            ->limit(Friendship::MAX_FRIENDS + 2 * Friendship::MAX_PENDING_SENT)
            ->get();
        $others = $rows->map(fn (Friendship $f): ?User => $f->requester_id === $user->id ? $f->addressee : $f->requester)->filter();
        $looks = $this->shop->looks($others->map(fn (User $u) => $u->playerProfile)->filter());

        $present = fn (Friendship $f): ?array => ($other = $f->requester_id === $user->id ? $f->addressee : $f->requester)
            ? [
                'id' => $f->id,
                'user' => $this->person($other, $looks),
                'since' => ($f->responded_at ?? $f->created_at)?->toIso8601String(),
            ]
            : null;

        $friends = $rows->where('status', Friendship::ACCEPTED)
            ->map($present)->filter()
            ->sortBy(fn (array $row): string => mb_strtolower($row['user']['name']))
            ->values()->all();

        return [
            'friends' => $friends,
            'incoming' => $rows->where('status', Friendship::PENDING)->where('addressee_id', $user->id)->map($present)->filter()->values()->all(),
            'outgoing' => $rows->where('status', Friendship::PENDING)->where('requester_id', $user->id)->map($present)->filter()->values()->all(),
        ];
    }

    /**
     * Player search for "add friend", with the relation to each result.
     *
     * @return list<array<string, mixed>>
     */
    public function search(User $user, string $term, int $limit = 12): array
    {
        $term = trim($term);
        if (mb_strlen($term) < 2) {
            return [];
        }
        $like = '%'.str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $term).'%';

        $users = User::query()
            ->whereKeyNot($user->id)
            ->whereNull('disabled_at')
            ->whereHas('playerProfile')
            ->with('playerProfile')
            ->where(fn (Builder $w) => $w
                ->where('name', 'like', $like)
                ->orWhereHas('playerProfile', fn (Builder $p) => $p->where('nickname', 'like', $like)))
            ->orderBy('name')
            ->limit($limit)
            ->get();
        $looks = $this->shop->looks($users->map(fn (User $u) => $u->playerProfile)->filter());
        $relations = Friendship::query()
            ->involving($user->id)
            ->where(fn (Builder $q) => $q->whereIn('requester_id', $users->modelKeys())->orWhereIn('addressee_id', $users->modelKeys()))
            ->get()
            ->keyBy(fn (Friendship $f): int => $f->otherId($user->id));

        return $users->map(function (User $other) use ($user, $looks, $relations): array {
            $relation = $relations->get($other->id);

            return [
                ...$this->person($other, $looks),
                'friendship_id' => $relation?->id,
                'relation' => match (true) {
                    $relation === null => 'none',
                    $relation->status === Friendship::ACCEPTED => 'friends',
                    $relation->requester_id === $user->id => 'sent',
                    default => 'received',
                },
            ];
        })->all();
    }

    /**
     * Public card of a player: never the email or other private data.
     *
     * @param  array<int, array<string, mixed>>  $looks
     * @return array{id: int, name: string, grade: ?int, school: ?string, character: ?array<string, mixed>, last_seen_at: ?string}
     */
    private function person(User $user, array $looks): array
    {
        return [
            'id' => $user->id,
            'name' => $this->name($user),
            'grade' => $user->playerProfile?->grade,
            'school' => $user->playerProfile?->school_name,
            'character' => $looks[$user->id] ?? null,
            'last_seen_at' => $user->last_seen_at?->toIso8601String(),
        ];
    }

    private function name(User $user): string
    {
        return $user->playerProfile?->nickname ?: $user->name;
    }

    private function guardPendingFor(User $user, Friendship $friendship): void
    {
        if ($friendship->addressee_id !== $user->id) {
            abort(404);
        }
        if ($friendship->status !== Friendship::PENDING) {
            throw ValidationException::withMessages(['friendship' => __('friends.not_pending')]);
        }
    }

    private function guardLimits(User $user, bool $sending = true): void
    {
        if (count($this->friendIds($user)) >= Friendship::MAX_FRIENDS) {
            throw ValidationException::withMessages(['user_id' => __('friends.limit', ['max' => Friendship::MAX_FRIENDS])]);
        }
        if ($sending && Friendship::query()->where('requester_id', $user->id)->where('status', Friendship::PENDING)->count() >= Friendship::MAX_PENDING_SENT) {
            throw ValidationException::withMessages(['user_id' => __('friends.pending_limit', ['max' => Friendship::MAX_PENDING_SENT])]);
        }
    }

    private function clearRequestNotice(User $addressee, User $requester): void
    {
        $addressee->unreadNotifications()
            ->where('type', 'player')
            ->where('data->kind', 'friend')
            ->where('data->key', 'player_notifications.friend_request')
            ->where('data->params->name', $this->name($requester))
            ->update(['read_at' => now()]);
    }

    /** Live event for the other player's open tabs (popup + list refresh). */
    private function push(User $to, string $action, User $actor, ?Friendship $friendship): void
    {
        $actor->loadMissing('playerProfile');
        $this->client->publish([$to->id], [
            't' => 'friend',
            'action' => $action,
            'friendship_id' => $friendship?->id,
            'user' => [
                'id' => $actor->id,
                'name' => $this->name($actor),
                'character' => $actor->playerProfile ? ($this->shop->looks([$actor->playerProfile])[$actor->id] ?? null) : null,
            ],
        ]);
    }
}
