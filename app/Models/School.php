<?php

namespace App\Models;

use Database\Factories\SchoolFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

/**
 * A school from the official Dapodik list, grouped by city/regency (same
 * names as database/data/regencies.json) and level.
 *
 * @property string $npsn
 * @property string $name
 * @property string $regency
 * @property string|null $district
 * @property string $level
 * @property string $form
 */
class School extends Model
{
    /** @use HasFactory<SchoolFactory> */
    use HasFactory;

    public $timestamps = false;

    protected $fillable = ['npsn', 'name', 'regency', 'district', 'level', 'form'];

    /**
     * Levels in school order, each with its equivalents (sederajat):
     * TK incl. RA, SD incl. MI, SMP incl. MTs, SMA incl. SMK, MA and MAK.
     * The exact school form (MI, MTS, SMK, MA, ...) is kept in `form`.
     */
    public const LEVELS = ['TK', 'SD', 'SMP', 'SMA', 'SLB'];

    /** Older level keys that now belong to a merged level. */
    public const LEVEL_ALIASES = ['SMK' => 'SMA'];

    /** Rows returned per list request; players narrow larger lists by typing. */
    public const LIST_LIMIT = 50;

    /**
     * Profile school fields: a picked NPSN overrides the typed name, city and
     * level with the official record, so the client cannot store a mismatch.
     * Without an NPSN (school not in the list) the typed values are kept.
     *
     * @param  array<string, mixed>  $details
     * @return array<string, mixed>
     */
    public static function officialDetails(array $details): array
    {
        $npsn = $details['school_npsn'] ?? null;
        $school = $npsn ? self::query()->where('npsn', $npsn)->first() : null;

        if ($school === null) {
            return [...$details, 'school_npsn' => null];
        }

        return [
            ...$details,
            'school_name' => $school->name,
            'school_city' => $school->regency,
            'school_level' => $school->level,
            'school_npsn' => $school->npsn,
        ];
    }

    /**
     * @param  Builder<School>  $query
     */
    public function scopeIn(Builder $query, string $regency, string $level): void
    {
        $query->where('regency', $regency)->where('level', $level);
    }
}
