<?php

namespace App\Services;

use App\Models\School;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;

/**
 * Official schools of one city/regency and level, for the school picker.
 * Typing narrows the list by name or district (kecamatan). Public data from
 * Dapodik, so guests on the registration page may see it too.
 */
class SchoolCatalog
{
    private const CACHE_SECONDS = 600;

    /**
     * @return array{schools: list<array{npsn: string, name: string, district: string|null, form: string}>, total: int}
     */
    public function list(string $regency, string $level, string $query = ''): array
    {
        $needle = Str::lower(Str::squish($query));
        $key = 'school-catalog:'.sha1($regency.'|'.$level.'|'.$needle);

        return Cache::remember($key, self::CACHE_SECONDS, fn (): array => $this->lookup($regency, $level, $needle));
    }

    /**
     * @return array{schools: list<array{npsn: string, name: string, district: string|null, form: string}>, total: int}
     */
    private function lookup(string $regency, string $level, string $needle): array
    {
        $query = School::query()->in($regency, $level);

        if ($needle !== '') {
            foreach (explode(' ', $needle) as $word) {
                $like = '%'.addcslashes($word, '%_\\').'%';
                $query->where(fn ($where) => $where
                    ->whereRaw('LOWER(name) LIKE ?', [$like])
                    ->orWhereRaw('LOWER(district) LIKE ?', [$like]));
            }
        }

        $total = (clone $query)->count();
        $schools = $query->orderBy('name')
            ->limit(School::LIST_LIMIT)
            ->get(['npsn', 'name', 'district', 'form'])
            ->map(fn (School $school): array => [
                'npsn' => $school->npsn,
                'name' => $school->name,
                'district' => $school->district,
                'form' => $school->form,
            ])
            ->all();

        return ['schools' => $schools, 'total' => $total];
    }
}
