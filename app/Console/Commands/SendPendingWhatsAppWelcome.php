<?php

namespace App\Console\Commands;

use App\Models\Role;
use App\Models\User;
use App\Services\WhatsApp\WhatsAppNotifier;
use App\Services\WhatsApp\WhatsAppSettings;
use Illuminate\Console\Command;
use Illuminate\Database\Eloquent\Builder;

/**
 * Greets players who saved a WhatsApp number while the welcome message could
 * not go out (switch off, container down). Each account is greeted at most
 * once; admins and teachers are left out.
 */
class SendPendingWhatsAppWelcome extends Command
{
    protected $signature = 'whatsapp:send-pending-welcome
        {--dry-run : List the players without sending anything}
        {--limit=200 : Maximum number of players in this run}';

    protected $description = 'Send the WhatsApp welcome message to players with a number who were never greeted';

    public function handle(WhatsAppNotifier $notifier, WhatsAppSettings $settings): int
    {
        $dryRun = (bool) $this->option('dry-run');

        if (! $dryRun && (! $settings->enabled() || ! $settings->eventEnabled('welcome'))) {
            $this->error('WhatsApp notifications or the welcome message are switched off on /admin/whatsapp. Nothing was sent.');

            return self::FAILURE;
        }

        $players = $this->pendingPlayers()->limit(max(1, (int) $this->option('limit')))->get();

        if ($players->isEmpty()) {
            $this->info('No players are waiting for a welcome message.');

            return self::SUCCESS;
        }

        $this->table(['ID', 'Name', 'Email'], $players->map(fn (User $user): array => [$user->id, $user->name, $user->email])->all());

        if ($dryRun) {
            $this->info("Dry run: {$players->count()} player(s) would be greeted.");

            return self::SUCCESS;
        }

        $queued = $players->filter(fn (User $user): bool => $notifier->welcome($user) !== null)->count();
        $this->info("Welcome message queued for {$queued} of {$players->count()} player(s).");

        return self::SUCCESS;
    }

    /** @return Builder<User> */
    private function pendingPlayers(): Builder
    {
        return User::query()
            ->with('playerProfile')
            ->whereNotNull('whatsapp_number')
            ->where('whatsapp_notifications', true)
            ->whereNull('whatsapp_welcomed_at')
            ->whereNull('disabled_at')
            ->where('is_superadmin', false)
            ->whereDoesntHave('roles', fn (Builder $roles) => $roles->whereIn('slug', [Role::ADMIN, Role::TEACHER]))
            ->orderBy('id');
    }
}
