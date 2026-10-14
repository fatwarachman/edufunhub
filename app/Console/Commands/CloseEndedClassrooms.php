<?php

namespace App\Console\Commands;

use App\Services\Classrooms\ClassroomCloser;
use Illuminate\Console\Command;

class CloseEndedClassrooms extends Command
{
    protected $signature = 'classrooms:close-ended';

    protected $description = 'Close game rooms, the 3D world and open student pages of classrooms whose end time passed';

    public function handle(ClassroomCloser $closer): int
    {
        $count = $closer->closeEnded();
        if ($count > 0) {
            $this->info("Closed {$count} classroom(s).");
        }

        return self::SUCCESS;
    }
}
