<?php

namespace App\Models;

use Database\Factories\SequenceSetFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Order Rush sequence set (TKJ material): pieces stored in the correct order.
 * Go pulls the active sets through the signed internal endpoint and never
 * sends the order to players.
 *
 * @property list<array{label_id: string, label_en: ?string, color?: ?string, stripe?: ?string}> $items
 * @property list<array{id: string, en: ?string}>|null $ends Two connector ends (end A items, then end B)
 */
class SequenceSet extends Model
{
    /** @use HasFactory<SequenceSetFactory> */
    use HasFactory;

    /** LAN tester (cables, fibre cores) or packet animation (protocols). */
    public const KINDS = ['cable', 'protocol'];

    /** Mirrors Go orderrush.MinSlots / MaxSlots. */
    public const MIN_ITEMS = 2;

    public const MAX_ITEMS = 12;

    /** Mirrors Go orderrush.EndCount: a cable crimped on both sides. */
    public const END_COUNT = 2;

    public const KEY_PATTERN = '/^[a-z][a-z0-9-]{1,39}$/';

    public const CATEGORY_PATTERN = '/^[A-Z][A-Z0-9_]{1,39}$/';

    /** @var list<string> */
    protected $fillable = [
        'key', 'category', 'kind', 'title_id', 'title_en', 'description_id', 'description_en',
        'items', 'ends', 'sort_order', 'is_active', 'created_by',
    ];

    /** @var array<string, mixed> */
    protected $attributes = ['is_active' => true, 'sort_order' => 0];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return ['items' => 'array', 'ends' => 'array', 'sort_order' => 'integer', 'is_active' => 'boolean'];
    }

    /** @param Builder<SequenceSet> $query */
    public function scopeActive(Builder $query): void
    {
        $query->where('is_active', true);
    }

    /** @param Builder<SequenceSet> $query */
    public function scopeOrdered(Builder $query): void
    {
        $query->orderBy('sort_order')->orderBy('id');
    }

    /** @return HasMany<SequenceAttempt, $this> */
    public function attempts(): HasMany
    {
        return $this->hasMany(SequenceAttempt::class, 'set_key', 'key');
    }

    /** @return BelongsTo<User, $this> */
    public function author(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /** Whether the set is a cable crimped on both ends (end A, then end B). */
    public function isTwoEnd(): bool
    {
        return count($this->ends ?? []) === self::END_COUNT;
    }

    /**
     * Payload for the Go referee (orderrush.Set).
     *
     * @return array{key: string, category: string, kind: string, title: array{id: string, en: string}, description: array{id: string, en: string}, items: list<array{label: array{id: string, en: string}, color?: string, stripe?: string}>, ends?: list<array{id: string, en: string}>}
     */
    public function toGamePayload(): array
    {
        return array_filter([
            'key' => $this->key,
            'category' => $this->category,
            'kind' => $this->kind,
            'title' => ['id' => $this->title_id, 'en' => (string) ($this->title_en ?: $this->title_id)],
            'description' => ['id' => (string) $this->description_id, 'en' => (string) ($this->description_en ?: $this->description_id)],
            'items' => array_values(array_map(fn (array $item): array => array_filter([
                'label' => ['id' => $item['label_id'], 'en' => ($item['label_en'] ?? null) ?: $item['label_id']],
                'color' => $item['color'] ?? null,
                'stripe' => $item['stripe'] ?? null,
            ], fn (mixed $value): bool => $value !== null && $value !== ''), $this->items)),
            'ends' => $this->isTwoEnd()
                ? array_map(fn (array $end): array => ['id' => $end['id'], 'en' => ($end['en'] ?? null) ?: $end['id']], array_values($this->ends))
                : null,
        ], fn (mixed $value): bool => $value !== null);
    }
}
