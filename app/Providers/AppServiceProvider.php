<?php

namespace App\Providers;

use App\Events\SubscriptionUpdated;
use App\Events\WorkspaceMemberAdded;
use App\Events\WorkspaceMemberRemoved;
use App\Events\WorkspaceMemberRoleUpdated;
use App\Events\WorkspaceUpdated;
use App\Listeners\DispatchWebhooks;
use App\Models\FeatureFlag;
use App\Models\Workspace;
use App\Observers\ActivityLogObserver;
use App\Policies\WorkspacePolicy;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\ServiceProvider;
use Laravel\Cashier\Cashier;
use Laravel\Pennant\Feature;
use Spatie\Activitylog\Models\Activity;
use Stripe\StripeClient;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register pennant features dynamically.
     */
    public static function registerFeatureFlags(): void
    {
        try {
            if (Schema::hasTable('feature_flags')) {
                $flags = Cache::remember('feature_flags_definitions', 3600, fn () => FeatureFlag::all());
                foreach ($flags as $flag) {
                    Feature::define($flag->key, function ($scope) use ($flag) {
                        if ($flag->is_global) {
                            return true;
                        }
                        if ($scope instanceof Workspace) {
                            return in_array($scope->id, $flag->workspace_ids ?? []);
                        }

                        return false;
                    });
                }
            }
        } catch (\Exception $e) {
            // Table might not exist yet during migrations
        }
    }

    /**
     * Register any application services.
     */
    public function register(): void
    {
        $this->app->singleton(StripeClient::class, function ($app) {
            return new StripeClient(config('services.stripe.secret'));
        });
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        Activity::observe(ActivityLogObserver::class);

        Gate::policy(Workspace::class, WorkspacePolicy::class);

        // Listeners in app/Listeners (login, logout, failed login, notification
        // delivery, webhook calls) are registered by Laravel's event discovery;
        // listing them here as well made every one of them run twice.

        // Core App Webhook Dispatches
        Event::listen([
            WorkspaceUpdated::class,
            WorkspaceMemberAdded::class,
            WorkspaceMemberRemoved::class,
            WorkspaceMemberRoleUpdated::class,
            SubscriptionUpdated::class,
        ], DispatchWebhooks::class);

        // Tell Cashier to use Workspace as the billable model instead of User
        Cashier::useCustomerModel(Workspace::class);

        // Rate limiters
        RateLimiter::for('api', function (Request $request) {
            return Limit::perMinute(60)->by($request->user()?->id ?: $request->ip());
        });

        RateLimiter::for('invitations', function (Request $request) {
            return Limit::perMinute(10)->by($request->user()?->id ?: $request->ip());
        });

        // Chat: short bursts are fine, floods are not.
        RateLimiter::for('chat', function (Request $request) {
            $key = 'chat:'.($request->user()?->id ?: $request->ip());

            return [Limit::perMinute(30)->by($key), Limit::perSecond(3)->by($key.':burst')];
        });

        // Player feedback: own counter so other throttled routes (ad tracking) do not use it up.
        RateLimiter::for('feedback', function (Request $request) {
            return Limit::perMinute(5)->by('feedback:'.($request->user()?->id ?: $request->ip()));
        });

        // Join with a room PIN: own counter, so guessing codes stays slow.
        RateLimiter::for('profile', function (Request $request) {
            return Limit::perMinute(20)->by('profile:'.$request->user()?->id);
        });

        RateLimiter::for('profile-password', function (Request $request) {
            return Limit::perMinute(6)->by('profile-password:'.$request->user()?->id);
        });

        RateLimiter::for('join-pin', function (Request $request) {
            return Limit::perMinute(20)->by('join-pin:'.($request->user()?->id ?: $request->ip()));
        });

        // End-of-game leaderboard modal: one read per finished game.
        RateLimiter::for('game-leaderboard', function (Request $request) {
            return Limit::perMinute(30)->by('game-leaderboard:'.($request->user()?->id ?: $request->ip()));
        });

        self::registerFeatureFlags();
    }
}
