<?php

namespace App\Console\Commands;

use App\Models\ChangelogEntry;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Loads the recorded changelog (database/data/changelog.php) into
 * `changelog_entries`. Entries are upserted by `<version>:<key>`, so running
 * it again only applies what changed; recorded entries removed from the file
 * are deleted. Manual entries written in the admin panel are never touched.
 */
class SyncChangelog extends Command
{
    protected $signature = 'changelog:sync {--path= : PHP file returning the release list}';

    protected $description = 'Sync the recorded app changelog into the admin changelog page';

    public function handle(): int
    {
        $path = (string) ($this->option('path') ?: database_path('data/changelog.php'));

        if (! is_file($path)) {
            $this->components->error("Changelog file not found: {$path}");

            return self::FAILURE;
        }

        try {
            $entries = $this->entries(require $path);
        } catch (ValidationException $exception) {
            $this->components->error(collect($exception->errors())->flatten()->implode(' '));

            return self::FAILURE;
        }

        DB::transaction(function () use ($entries): void {
            foreach ($entries as $sourceKey => $attributes) {
                ChangelogEntry::query()->updateOrCreate(['source_key' => $sourceKey], $attributes);
            }

            ChangelogEntry::query()
                ->whereNotNull('source_key')
                ->whereNotIn('source_key', array_keys($entries))
                ->delete();
        });

        $this->components->info(sprintf(
            'Changelog synced: %d change(s), current version %s.',
            count($entries),
            ChangelogEntry::currentVersion(),
        ));

        return self::SUCCESS;
    }

    /**
     * Validate the release list and flatten it to rows keyed by source key.
     *
     * @return array<string, array<string, mixed>>
     */
    private function entries(mixed $releases): array
    {
        $errors = [];
        $entries = [];

        if (! is_array($releases)) {
            throw ValidationException::withMessages(['file' => 'The changelog file must return a list of releases.']);
        }

        foreach ($releases as $index => $release) {
            $version = (string) ($release['version'] ?? '');
            $label = $version !== '' ? $version : "#{$index}";

            if (! ChangelogEntry::isValidVersion($version)) {
                $errors[] = "Release {$label}: version must follow Semantic Versioning (e.g. 0.1.0).";
            }

            $date = $this->date($release['date'] ?? null);
            if ($date === null) {
                $errors[] = "Release {$label}: date must be YYYY-MM-DD.";
            }

            $changes = $release['changes'] ?? [];
            if (! is_array($changes) || $changes === []) {
                $errors[] = "Release {$label}: at least one change is required.";

                continue;
            }

            foreach ($changes as $position => $change) {
                $key = (string) ($change['key'] ?? '');
                $sourceKey = "{$version}:{$key}";

                if (preg_match('/^[a-z0-9][a-z0-9-]{0,80}$/', $key) !== 1) {
                    $errors[] = "Release {$label}, change #{$position}: key must be lowercase letters, numbers and hyphens.";
                }
                if (isset($entries[$sourceKey])) {
                    $errors[] = "Release {$label}: duplicate change key {$key}.";
                }
                if (! in_array($change['type'] ?? null, ChangelogEntry::TYPES, true)) {
                    $errors[] = "Release {$label}, change {$key}: type must be ".implode(', ', ChangelogEntry::TYPES).'.';
                }
                foreach (['title', 'body'] as $field) {
                    foreach (['id', 'en'] as $locale) {
                        if (trim((string) ($change[$field][$locale] ?? '')) === '') {
                            $errors[] = "Release {$label}, change {$key}: {$field}.{$locale} is required.";
                        }
                    }
                }

                $entries[$sourceKey] = [
                    'version' => $version,
                    'type' => $change['type'] ?? null,
                    'title' => trim((string) ($change['title']['id'] ?? '')),
                    'title_en' => trim((string) ($change['title']['en'] ?? '')),
                    'body' => trim((string) ($change['body']['id'] ?? '')),
                    'body_en' => trim((string) ($change['body']['en'] ?? '')),
                    'is_published' => true,
                    'published_at' => $date,
                ];
            }
        }

        if ($errors !== []) {
            throw ValidationException::withMessages(['changelog' => $errors]);
        }

        return $entries;
    }

    private function date(mixed $value): ?Carbon
    {
        if (! is_string($value) || preg_match('/^\d{4}-\d{2}-\d{2}$/', $value) !== 1) {
            return null;
        }

        $date = Carbon::createFromFormat('!Y-m-d', $value);

        return $date !== null && $date->format('Y-m-d') === $value ? $date->setTime(12, 0) : null;
    }
}
