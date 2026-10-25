<?php

namespace App\Models;

use Database\Factories\QuestionBlueprintFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * Question blueprint (kisi-kisi soal): an uploaded document whose text is
 * given to the AI question writer as the specification to follow.
 */
class QuestionBlueprint extends Model
{
    /** @use HasFactory<QuestionBlueprintFactory> */
    use HasFactory;

    /** Private disk folder of the original files. */
    public const FOLDER = 'question-blueprints';

    /** Largest upload in kilobytes. */
    public const MAX_KB = 10240;

    /** Longest stored text (editable by the admin). */
    public const MAX_CONTENT = 200000;

    /** Fallback when a blueprint has no retrieval index yet: first part of the text. */
    public const MAX_PROMPT = 12000;

    public const INDEX_PENDING = 'pending';

    public const INDEX_RUNNING = 'running';

    public const INDEX_READY = 'ready';

    public const INDEX_FAILED = 'failed';

    /** @var list<string> */
    protected $fillable = ['title', 'subject_key', 'original_name', 'path', 'extension', 'size', 'content', 'is_active', 'uploaded_by', 'index_status', 'chunks_count', 'embedding_model', 'index_error', 'indexed_at'];

    /** @var array<string, mixed> */
    protected $attributes = ['is_active' => true, 'index_status' => self::INDEX_PENDING, 'chunks_count' => 0];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
            'size' => 'integer',
            'chunks_count' => 'integer',
            'indexed_at' => 'datetime',
        ];
    }

    protected static function booted(): void
    {
        static::deleted(fn (QuestionBlueprint $blueprint) => Storage::disk('local')->delete($blueprint->path));
    }

    /** @return BelongsTo<User, $this> */
    public function uploader(): BelongsTo
    {
        return $this->belongsTo(User::class, 'uploaded_by');
    }

    /** @return HasMany<QuestionBlueprintChunk, $this> */
    public function chunks(): HasMany
    {
        return $this->hasMany(QuestionBlueprintChunk::class, 'blueprint_id');
    }

    /** True while the retrieval index is being built. */
    public function isIndexing(): bool
    {
        return in_array($this->index_status, [self::INDEX_PENDING, self::INDEX_RUNNING], true);
    }

    /** @return HasMany<QuestionGeneration, $this> */
    public function generations(): HasMany
    {
        return $this->hasMany(QuestionGeneration::class, 'blueprint_id');
    }

    /** @param  Builder<QuestionBlueprint>  $query */
    public function scopeActive(Builder $query): void
    {
        $query->where('is_active', true);
    }

    /** Text placed in the AI prompt, cut at the prompt limit. */
    public function promptText(): string
    {
        return Str::limit(trim($this->content), self::MAX_PROMPT, "\n[...]");
    }

    /**
     * Shape used by the admin pages.
     *
     * @return array<string, mixed>
     */
    public function toAdminPayload(): array
    {
        return [
            ...$this->only(['id', 'title', 'subject_key', 'original_name', 'extension', 'size', 'content', 'is_active']),
            'characters' => mb_strlen($this->content),
            'index_status' => $this->index_status,
            'chunks_count' => $this->chunks_count,
            'embedding_model' => $this->embedding_model,
            'index_error' => $this->index_error,
            'indexed_at' => $this->indexed_at?->toIso8601String(),
            'uploaded_by' => $this->uploader?->name,
            'generations_count' => (int) ($this->generations_count ?? 0),
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
