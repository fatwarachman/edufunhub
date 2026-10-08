<?php

namespace App\Console\Commands;

use App\Models\School;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Loads the official school list (database/data/schools.csv.gz, built from
 * Dapodik) into the `schools` table. Rows are upserted by NPSN, so running it
 * again after a data refresh only updates what changed.
 */
class ImportSchools extends Command
{
    protected $signature = 'schools:import {--if-empty : Skip when the table already has rows} {--path= : Gzipped CSV to load}';

    protected $description = 'Import the official school list (Dapodik) for the school picker';

    private const CHUNK = 1000;

    public function handle(): int
    {
        if ($this->option('if-empty') && School::query()->exists()) {
            $this->components->info('Schools already imported, skipping.');

            return self::SUCCESS;
        }

        $path = (string) ($this->option('path') ?: database_path('data/schools.csv.gz'));
        $handle = is_file($path) ? gzopen($path, 'rb') : false;

        if ($handle === false) {
            $this->components->error("School list not found: {$path}");

            return self::FAILURE;
        }

        $batch = [];
        $total = 0;

        while (($line = gzgets($handle)) !== false) {
            $row = $this->parse($line);
            if ($row === null) {
                continue;
            }
            $batch[] = $row;
            if (count($batch) === self::CHUNK) {
                $total += $this->flush($batch);
                $batch = [];
            }
        }
        $total += $this->flush($batch);
        gzclose($handle);

        $this->components->info("Imported {$total} schools.");

        return self::SUCCESS;
    }

    /**
     * @return array{npsn: string, name: string, regency: string, district: string|null, level: string, form: string}|null
     */
    private function parse(string $line): ?array
    {
        $parts = explode(';', rtrim($line, "\r\n"));
        if (count($parts) !== 6 || ! in_array($parts[4], School::LEVELS, true) || $parts[0] === '' || $parts[1] === '') {
            return null;
        }

        return [
            'npsn' => mb_substr($parts[0], 0, 10),
            'name' => mb_substr($parts[1], 0, 120),
            'regency' => mb_substr($parts[2], 0, 100),
            'district' => $parts[3] === '' ? null : mb_substr($parts[3], 0, 80),
            'level' => $parts[4],
            'form' => mb_substr($parts[5], 0, 12),
        ];
    }

    /**
     * @param  list<array<string, string|null>>  $batch
     */
    private function flush(array $batch): int
    {
        if ($batch === []) {
            return 0;
        }

        DB::table('schools')->upsert($batch, ['npsn'], ['name', 'regency', 'district', 'level', 'form']);

        return count($batch);
    }
}
