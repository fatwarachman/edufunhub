<?php

namespace App\Services;

use Illuminate\Support\Facades\Cache;

/**
 * Indonesian cities and regencies (kota/kabupaten, Kemendagri list) offered in
 * the school city picker. The list is static data shipped with the app, so it
 * is parsed once and kept in the cache.
 */
class RegencyDirectory
{
    public const CACHE_KEY = 'regencies.catalog.v1';

    /**
     * @return list<array{name: string, province: string}>
     */
    public function all(): array
    {
        return Cache::rememberForever(self::CACHE_KEY, fn (): array => $this->load());
    }

    /**
     * @return list<array{name: string, province: string}>
     */
    private function load(): array
    {
        $rows = json_decode((string) file_get_contents(database_path('data/regencies.json')), true, flags: JSON_THROW_ON_ERROR);

        return array_values(array_map(
            fn (array $row): array => ['name' => (string) $row['name'], 'province' => (string) $row['province']],
            array_filter($rows, fn (mixed $row): bool => is_array($row) && isset($row['name'], $row['province'])),
        ));
    }
}
