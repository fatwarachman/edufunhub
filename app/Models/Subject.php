<?php

namespace App\Models;

use Database\Factories\SubjectFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Facades\Cache;

/**
 * School subject (mata pelajaran) that questions belong to. Built-in subjects
 * ship with the app; super admins can add more. Active subjects appear in
 * every game's subject picker and are sent to the Go service with the bank.
 */
class Subject extends Model
{
    /** @use HasFactory<SubjectFactory> */
    use HasFactory;

    /** Icons the picker can show; mirrors resources/js/lib/subjects.ts. */
    public const ICONS = [
        'calculator', 'flask', 'book-open', 'globe', 'languages', 'landmark', 'atom', 'microscope',
        'leaf', 'map', 'music', 'palette', 'dumbbell', 'laptop', 'moon', 'heart', 'brain', 'shapes',
        'pen', 'sparkles',
    ];

    /** Lower-case key used in questions, URLs and the Go service. */
    public const KEY_PATTERN = '/^[a-z][a-z0-9-]{1,29}$/';

    /** "mix" is the all-subjects choice in games and can never be a subject key. */
    public const RESERVED_KEYS = ['mix', 'all'];

    private const CACHE_KEY = 'subjects.catalog';

    /** @var list<string> */
    protected $fillable = ['key', 'name_id', 'name_en', 'icon', 'color', 'ai_hint', 'sort_order', 'is_active', 'is_system', 'created_by'];

    /** @var array<string, mixed> */
    protected $attributes = ['is_active' => true, 'is_system' => false, 'sort_order' => 0];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return ['sort_order' => 'integer', 'is_active' => 'boolean', 'is_system' => 'boolean'];
    }

    protected static function booted(): void
    {
        static::saved(fn () => Cache::forget(self::CACHE_KEY));
        static::deleted(fn () => Cache::forget(self::CACHE_KEY));
    }

    /** @return HasMany<Question, $this> */
    public function questions(): HasMany
    {
        return $this->hasMany(Question::class, 'subject', 'key');
    }

    /** @param Builder<Subject> $query */
    public function scopeActive(Builder $query): void
    {
        $query->where('is_active', true);
    }

    /** @param Builder<Subject> $query */
    public function scopeOrdered(Builder $query): void
    {
        $query->orderBy('sort_order')->orderBy('id');
    }

    /**
     * Every subject in display order, cached until a subject changes.
     *
     * @return list<array{key: string, name_id: string, name_en: ?string, icon: string, color: string, ai_hint: ?string, is_active: bool}>
     */
    public static function catalog(): array
    {
        return Cache::rememberForever(self::CACHE_KEY, fn (): array => static::query()
            ->ordered()
            ->get(['key', 'name_id', 'name_en', 'icon', 'color', 'ai_hint', 'is_active'])
            ->map(fn (Subject $subject): array => [
                'key' => $subject->key,
                'name_id' => $subject->name_id,
                'name_en' => $subject->name_en,
                'icon' => $subject->icon,
                'color' => $subject->color,
                'ai_hint' => $subject->ai_hint,
                'is_active' => $subject->is_active,
            ])
            ->all());
    }

    /**
     * All subject keys, active or not (valid on existing questions).
     *
     * @return list<string>
     */
    public static function keys(): array
    {
        return array_column(self::catalog(), 'key');
    }

    /**
     * Keys of the subjects players and authors can choose now.
     *
     * @return list<string>
     */
    public static function activeKeys(): array
    {
        return array_values(array_column(array_filter(self::catalog(), fn (array $subject): bool => $subject['is_active']), 'key'));
    }

    /**
     * Active subjects for the frontend pickers (no AI hint).
     *
     * @return list<array{key: string, name: array{id: string, en: string}, icon: string, color: string}>
     */
    public static function forFrontend(): array
    {
        return array_values(array_map(fn (array $subject): array => [
            'key' => $subject['key'],
            'name' => ['id' => $subject['name_id'], 'en' => $subject['name_en'] ?: $subject['name_id']],
            'icon' => $subject['icon'],
            'color' => $subject['color'],
        ], array_filter(self::catalog(), fn (array $subject): bool => $subject['is_active'])));
    }

    /**
     * Admin label (English panel) for every subject, hidden ones included.
     *
     * @return array<string, string>
     */
    public static function adminLabels(): array
    {
        return collect(self::catalog())->mapWithKeys(fn (array $subject): array => [
            $subject['key'] => $subject['name_en'] ?: $subject['name_id'],
        ])->all();
    }

    /** Description given to the AI question writer. */
    public static function aiDescription(string $key): string
    {
        foreach (self::catalog() as $subject) {
            if ($subject['key'] === $key) {
                return $subject['ai_hint'] ?: trim($subject['name_id'].($subject['name_en'] ? " ({$subject['name_en']})" : ''));
            }
        }

        return $key;
    }

    /** Display name in the given locale. */
    public function displayName(?string $locale = null): string
    {
        return ($locale ?? app()->getLocale()) === 'en' && $this->name_en ? $this->name_en : $this->name_id;
    }
}
