<?php

namespace App\Models;

use Database\Factories\ChangelogEntryFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Laravel\Scout\Searchable;

/**
 * One change in the app changelog. Entries with a `source_key` come from
 * database/data/changelog.php (`changelog:sync`) and are read-only in the
 * admin panel; entries without one are manual notes written by a super admin.
 */
class ChangelogEntry extends Model
{
    /** @use HasFactory<ChangelogEntryFactory> */
    use HasFactory, Searchable;

    public const TYPES = ['feature', 'improvement', 'fix'];

    /** Semantic Versioning 2.0.0 (https://semver.org), e.g. 0.1.0 or 1.0.0-beta.1. */
    public const VERSION_PATTERN = '/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/';

    /** Version of the very first release. */
    public const INITIAL_VERSION = '0.0.0';

    /**
     * @var list<string>
     */
    protected $fillable = [
        'source_key',
        'version',
        'title',
        'title_en',
        'body',
        'body_en',
        'type',
        'is_published',
        'published_at',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'is_published' => 'boolean',
            'published_at' => 'datetime',
        ];
    }

    /**
     * Get the indexable data array for the model.
     *
     * @return array<string, mixed>
     */
    public function toSearchableArray(): array
    {
        return [
            'id' => (int) $this->id,
            'title' => $this->title,
            'body' => $this->body,
            'version' => $this->version,
        ];
    }

    /**
     * Scope to only published entries.
     *
     * @param  Builder<ChangelogEntry>  $query
     */
    public function scopePublished(Builder $query): void
    {
        $query->where('is_published', true);
    }

    public function isRecorded(): bool
    {
        return $this->source_key !== null;
    }

    public static function isValidVersion(string $version): bool
    {
        return preg_match(self::VERSION_PATTERN, $version) === 1;
    }

    /**
     * Highest published version, or the initial version when nothing is
     * published yet.
     */
    public static function currentVersion(): string
    {
        return static::query()->published()->pluck('version')
            ->filter(fn (string $version): bool => static::isValidVersion($version))
            ->sort(fn (string $a, string $b): int => static::compareVersions($b, $a))
            ->first() ?? self::INITIAL_VERSION;
    }

    /**
     * Compare two SemVer strings: -1 when $a is lower, 1 when higher, 0 when
     * equal. Build metadata is ignored and a pre-release ranks below its
     * release (1.0.0-beta.2 < 1.0.0), as the SemVer spec defines.
     */
    public static function compareVersions(string $a, string $b): int
    {
        [$coreA, $preA] = self::splitVersion($a);
        [$coreB, $preB] = self::splitVersion($b);

        $core = version_compare($coreA, $coreB);
        if ($core !== 0 || $preA === $preB) {
            return $core;
        }
        if ($preA === null || $preB === null) {
            return $preA === null ? 1 : -1;
        }

        $partsA = explode('.', $preA);
        $partsB = explode('.', $preB);
        $length = min(count($partsA), count($partsB));

        for ($index = 0; $index < $length; $index++) {
            $result = self::compareIdentifier($partsA[$index], $partsB[$index]);
            if ($result !== 0) {
                return $result;
            }
        }

        return count($partsA) <=> count($partsB);
    }

    /** @return array{0: string, 1: ?string} core version and pre-release */
    private static function splitVersion(string $version): array
    {
        $withoutBuild = explode('+', $version, 2)[0];
        $parts = explode('-', $withoutBuild, 2);

        return [$parts[0], $parts[1] ?? null];
    }

    /** Numeric identifiers compare numerically and rank below text ones. */
    private static function compareIdentifier(string $left, string $right): int
    {
        $leftNumeric = ctype_digit($left);
        $rightNumeric = ctype_digit($right);

        if ($leftNumeric && $rightNumeric) {
            return (int) $left <=> (int) $right;
        }
        if ($leftNumeric !== $rightNumeric) {
            return $leftNumeric ? -1 : 1;
        }

        return strcmp($left, $right) <=> 0;
    }
}
