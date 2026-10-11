<?php

namespace App\Models;

use Database\Factories\SubjectTopicFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Sub subject (materi / topic) under a subject, e.g. "Descriptive text" under
 * English. The optional material text guides the AI question writer.
 */
class SubjectTopic extends Model
{
    /** @use HasFactory<SubjectTopicFactory> */
    use HasFactory;

    /** Longest material text the AI prompt receives. */
    public const MAX_MATERIAL = 4000;

    /** @var list<string> */
    protected $fillable = ['subject_key', 'name_id', 'name_en', 'material', 'is_active', 'sort_order', 'created_by'];

    /** @var array<string, mixed> */
    protected $attributes = ['is_active' => true, 'sort_order' => 0];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return ['is_active' => 'boolean', 'sort_order' => 'integer', 'created_by' => 'integer'];
    }

    /** @return BelongsTo<Subject, $this> */
    public function subject(): BelongsTo
    {
        return $this->belongsTo(Subject::class, 'subject_key', 'key');
    }

    /** @return HasMany<Question, $this> */
    public function questions(): HasMany
    {
        return $this->hasMany(Question::class, 'topic_id');
    }

    /** @param  Builder<SubjectTopic>  $query */
    public function scopeActive(Builder $query): void
    {
        $query->where('is_active', true);
    }

    /** @param  Builder<SubjectTopic>  $query */
    public function scopeOrdered(Builder $query): void
    {
        $query->orderBy('subject_key')->orderBy('sort_order')->orderBy('id');
    }

    /** Display name in the given locale. */
    public function displayName(?string $locale = null): string
    {
        return ($locale ?? app()->getLocale()) === 'en' && $this->name_en ? $this->name_en : $this->name_id;
    }

    /**
     * Active topics for pickers.
     *
     * @return list<array{id: int, subject_key: string, name_id: string, name_en: ?string}>
     */
    public static function forPicker(): array
    {
        return static::query()->active()->ordered()->get(['id', 'subject_key', 'name_id', 'name_en'])
            ->map(fn (SubjectTopic $topic): array => $topic->only(['id', 'subject_key', 'name_id', 'name_en']))
            ->values()->all();
    }
}
