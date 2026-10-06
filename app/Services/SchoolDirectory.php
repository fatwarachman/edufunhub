<?php

namespace App\Services;

use App\Models\PlayerProfile;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;

/**
 * Suggests schools other players already entered so the same school is not
 * typed in many spellings. Only school names, cities and player counts leave
 * this class: never who entered them.
 */
class SchoolDirectory
{
    public const MIN_QUERY = 2;

    public const LIMIT = 15;

    /** Matching profiles scanned per query before grouping. */
    private const SCAN_LIMIT = 2000;

    private const CACHE_SECONDS = 120;

    /**
     * @return list<array{name: string, city: string|null, players: int}>
     */
    public function search(string $query): array
    {
        $needle = Str::lower(Str::squish($query));

        if (mb_strlen($needle) < self::MIN_QUERY) {
            return [];
        }

        return Cache::remember('school-directory:'.sha1($needle), self::CACHE_SECONDS, fn (): array => $this->lookup($needle));
    }

    /**
     * @return list<array{name: string, city: string|null, players: int}>
     */
    private function lookup(string $needle): array
    {
        $like = '%'.addcslashes($needle, '%_\\').'%';

        return PlayerProfile::query()
            ->whereNotNull('school_name')
            ->whereRaw('LOWER(school_name) LIKE ?', [$like])
            ->limit(self::SCAN_LIMIT)
            ->get(['school_name', 'school_city'])
            ->groupBy(fn (PlayerProfile $profile): string => Str::lower(Str::squish((string) $profile->school_name)))
            ->filter(fn (Collection $rows, string $key): bool => $key !== '')
            ->map(fn (Collection $rows, string $key): array => [
                'name' => $this->mostCommon($rows->map(fn (PlayerProfile $profile): string => Str::squish((string) $profile->school_name))),
                'city' => $this->mostCommonCity($rows),
                'players' => $rows->count(),
                'startsWith' => str_starts_with($key, $needle),
            ])
            ->sort(fn (array $a, array $b): int => [$b['startsWith'], $b['players'], $a['name']] <=> [$a['startsWith'], $a['players'], $b['name']])
            ->take(self::LIMIT)
            ->map(fn (array $school): array => ['name' => $school['name'], 'city' => $school['city'], 'players' => $school['players']])
            ->values()
            ->all();
    }

    /**
     * @param  Collection<int, PlayerProfile>  $rows
     */
    private function mostCommonCity(Collection $rows): ?string
    {
        $cities = $rows
            ->map(fn (PlayerProfile $profile): string => Str::squish((string) $profile->school_city))
            ->filter(fn (string $city): bool => $city !== '');

        if ($cities->isEmpty()) {
            return null;
        }

        $groups = $cities->groupBy(fn (string $city): string => Str::lower($city));
        $largest = $groups->sortByDesc(fn (Collection $group): int => $group->count())->first();

        return $this->mostCommon($largest);
    }

    /**
     * Most frequent spelling; ties go to the alphabetically first one so results are stable.
     *
     * @param  Collection<int, string>  $values
     */
    private function mostCommon(Collection $values): string
    {
        $counts = $values->countBy()->all();
        uksort($counts, fn (string $a, string $b): int => [$counts[$b], $a] <=> [$counts[$a], $b]);

        return (string) array_key_first($counts);
    }
}
