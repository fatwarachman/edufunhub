<?php

namespace App\Http\Controllers;

use App\Http\Requests\UpdateProfileAccountRequest;
use App\Http\Requests\UpdateProfilePasswordRequest;
use App\Http\Requests\UpdateProfilePhotoRequest;
use App\Models\PasswordHistory;
use App\Models\Question;
use App\Models\User;
use App\Services\PlayerPortal;
use App\Services\ProfilePhoto;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Inertia\Inertia;
use Inertia\Response;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * The player's own profile: account data, player details, password and
 * linked sign-in methods.
 */
class ProfileController extends Controller
{
    public function show(Request $request, PlayerPortal $portal): Response
    {
        /** @var User $user */
        $user = $request->user();
        $user->load(['playerProfile', 'roles:id,name,slug', 'connectedAccounts:id,user_id,provider,email,created_at']);
        $profile = $user->playerProfile;
        $points = $portal->totalPoints($user);

        return Inertia::render('user/profile', [
            'account' => [
                'name' => $user->name,
                'email' => $user->email,
                'email_verified' => $user->email_verified_at !== null,
                'avatar_url' => $user->avatar_url,
                'joined_at' => $user->created_at?->toIso8601String(),
                'last_seen_at' => $user->last_seen_at?->toIso8601String(),
                'password_updated_at' => $user->password_updated_at?->toIso8601String(),
                'roles' => $user->roles->map(fn ($role): array => ['name' => $role->name, 'slug' => $role->slug])->values()->all(),
                'connected' => $user->connectedAccounts->map(fn ($account): array => [
                    'provider' => $account->provider,
                    'email' => $account->email,
                    'linked_at' => $account->created_at?->toIso8601String(),
                ])->values()->all(),
            ],
            'player' => [
                'nickname' => $profile?->nickname,
                'grade' => $profile?->grade,
                'question_level' => Question::normalizeLevel($profile?->question_level),
                'birth_date' => $profile?->birth_date?->toDateString(),
                'age' => $profile?->age,
                'school_name' => $profile?->school_name,
                'school_city' => $profile?->school_city,
                'school_level' => $profile?->school_level,
                'school_npsn' => $profile?->school_npsn,
                'whatsapp_number' => $user->whatsapp_number,
                'whatsapp_notifications' => (bool) $user->whatsapp_notifications,
                'character' => $profile?->character(),
            ],
            'stats' => [
                'points' => $points,
                'level' => $portal->progress($points)['level'],
                'rank' => $portal->rankOf($user, $points),
                'games' => $user->gameHistories()->count(),
            ],
            'needsCurrentPassword' => $this->needsCurrentPassword($user),
        ]);
    }

    public function update(UpdateProfileAccountRequest $request): RedirectResponse
    {
        $request->user()->update(['name' => $request->validated('name')]);

        return back()->with('success', __('profile.saved'));
    }

    public function photo(UpdateProfilePhotoRequest $request): RedirectResponse
    {
        ProfilePhoto::store($request->user(), $request->file('photo'));

        return back()->with('success', __('profile.photo_saved'));
    }

    public function destroyPhoto(Request $request): RedirectResponse
    {
        ProfilePhoto::remove($request->user());

        return back()->with('success', __('profile.photo_removed'));
    }

    /** Streams a stored profile photo to signed-in users (no storage symlink needed). */
    public function showPhoto(string $file): StreamedResponse
    {
        $path = ProfilePhoto::FOLDER.'/'.$file;
        abort_unless(Storage::disk('public')->exists($path), 404);

        return Storage::disk('public')->response($path, null, [
            'Cache-Control' => 'private, max-age=604800',
            'X-Content-Type-Options' => 'nosniff',
            'Content-Security-Policy' => "default-src 'none'; sandbox",
        ]);
    }

    public function password(UpdateProfilePasswordRequest $request): RedirectResponse
    {
        $user = $request->user();
        $user->forceFill([
            'password' => $request->validated('password'),
            'password_updated_at' => now(),
        ])->save();

        PasswordHistory::query()->create([
            'user_id' => $user->id,
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
            'changed_at' => now(),
        ]);

        return back()->with('success', __('profile.password_saved'));
    }

    /**
     * Google accounts get a random password nobody knows; they set their
     * first password without the current one.
     */
    public static function needsCurrentPassword(User $user): bool
    {
        return $user->password_updated_at !== null
            || ! $user->connectedAccounts()->where('provider', 'google')->exists();
    }
}
