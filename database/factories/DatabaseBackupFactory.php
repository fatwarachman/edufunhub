<?php

namespace Database\Factories;

use App\Models\DatabaseBackup;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<DatabaseBackup> */
class DatabaseBackupFactory extends Factory
{
    protected $model = DatabaseBackup::class;

    /** @return array<string, mixed> */
    public function definition(): array
    {
        $filename = 'edufunhub-db-'.fake()->unique()->dateTimeBetween('-60 days')->format('Ymd-His').'.sql.gz';

        return [
            'filename' => $filename,
            'disk_path' => DatabaseBackup::DIRECTORY.'/'.$filename,
            'size_bytes' => fake()->numberBetween(10_000, 5_000_000),
            'checksum' => hash('sha256', $filename),
            'destination' => 'local',
            'status' => DatabaseBackup::SUCCESS,
            'local_kept' => true,
            'remote_uploaded' => false,
            'trigger' => DatabaseBackup::MANUAL,
            'started_at' => now()->subMinutes(2),
            'finished_at' => now()->subMinute(),
        ];
    }

    public function running(): static
    {
        return $this->state(fn (): array => ['status' => DatabaseBackup::RUNNING, 'size_bytes' => null, 'checksum' => null, 'local_kept' => false, 'finished_at' => null]);
    }

    public function failed(): static
    {
        return $this->state(fn (): array => ['status' => DatabaseBackup::FAILED, 'local_kept' => false, 'error' => 'Dump failed']);
    }

    public function scheduled(): static
    {
        return $this->state(fn (): array => ['trigger' => DatabaseBackup::SCHEDULED]);
    }
}
