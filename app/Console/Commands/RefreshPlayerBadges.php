<?php

namespace App\Console\Commands;

use App\Models\User;
use App\Services\PlayerBadges;
use Illuminate\Console\Command;

class RefreshPlayerBadges extends Command
{
    protected $signature = 'badges:refresh {--notify : Send a notification for newly earned badges}';

    protected $description = 'Award badges every player already qualifies for (e.g. after changing config/badges.php)';

    public function handle(PlayerBadges $badges): int
    {
        $awarded = 0;
        User::query()->whereHas('gameHistories')->chunkById(200, function ($users) use ($badges, &$awarded): void {
            foreach ($users as $user) {
                $awarded += count($badges->evaluate($user, (bool) $this->option('notify')));
            }
        });

        $this->info("Awarded {$awarded} badges.");

        return self::SUCCESS;
    }
}
