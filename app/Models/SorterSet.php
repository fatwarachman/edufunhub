<?php

namespace App\Models;

use Database\Factories\SorterSetFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Port Sorter set: the bins (2–6 drop targets) and the items that fall into
 * them. Go pulls the active sets through the signed internal endpoint and
 * never sends an item's bin to players while it falls.
 *
 * @property list<array{key: string, name_id: string, name_en: ?string, color: string}> $bins
 * @property list<array{label: string, hint_id: ?string, hint_en: ?string, bin: string, level: int}> $items
 */
class SorterSet extends Model
{
    /** @use HasFactory<SorterSetFactory> */
    use HasFactory;

    /** Mirror Go portsorter.MinBins / MaxBins / MaxItems / MaxLabel. */
    public const MIN_BINS = 2;

    public const MAX_BINS = 6;

    public const MAX_ITEMS = 200;

    public const MAX_LABEL = 12;

    /** Speed levels (1-based in Laravel, 0-based in Go). */
    public const LEVELS = 6;

    public const KEY_PATTERN = '/^[a-z][a-z0-9-]{1,39}$/';

    public const BIN_KEY_PATTERN = '/^[a-z0-9][a-z0-9-]{0,29}$/';

    /** @var list<string> */
    protected $fillable = [
        'key', 'title_id', 'title_en', 'description_id', 'description_en',
        'bins', 'items', 'sort_order', 'is_active', 'created_by',
    ];

    /** @var array<string, mixed> */
    protected $attributes = ['is_active' => true, 'sort_order' => 0];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return ['bins' => 'array', 'items' => 'array', 'sort_order' => 'integer', 'is_active' => 'boolean'];
    }

    /** @param Builder<SorterSet> $query */
    public function scopeActive(Builder $query): void
    {
        $query->where('is_active', true);
    }

    /** @param Builder<SorterSet> $query */
    public function scopeOrdered(Builder $query): void
    {
        $query->orderBy('sort_order')->orderBy('id');
    }

    /** @return BelongsTo<User, $this> */
    public function author(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /**
     * Payload for the Go referee (portsorter.Set): bins in column order and
     * items pointing at their bin index, levels 0-based.
     *
     * @return array{key: string, title: array{id: string, en: string}, description: array{id: string, en: string}, bins: list<array{key: string, name: array{id: string, en: string}, color: string}>, items: list<array{label: string, hint: array{id: string, en: string}, bin: int, level: int}>}
     */
    public function toGamePayload(): array
    {
        $index = array_flip(array_column($this->bins, 'key'));

        return [
            'key' => $this->key,
            'title' => ['id' => $this->title_id, 'en' => (string) ($this->title_en ?: $this->title_id)],
            'description' => ['id' => (string) $this->description_id, 'en' => (string) ($this->description_en ?: $this->description_id)],
            'bins' => array_values(array_map(fn (array $bin): array => [
                'key' => $bin['key'],
                'name' => ['id' => $bin['name_id'], 'en' => ($bin['name_en'] ?? null) ?: $bin['name_id']],
                'color' => $bin['color'],
            ], $this->bins)),
            'items' => array_values(array_map(fn (array $item): array => [
                'label' => $item['label'],
                'hint' => ['id' => (string) ($item['hint_id'] ?? ''), 'en' => (string) (($item['hint_en'] ?? null) ?: ($item['hint_id'] ?? ''))],
                'bin' => (int) ($index[$item['bin']] ?? 0),
                'level' => max(0, (int) ($item['level'] ?? 1) - 1),
            ], $this->items)),
        ];
    }
}
