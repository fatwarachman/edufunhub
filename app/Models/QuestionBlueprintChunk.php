<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One section of a question blueprint used for retrieval (RAG): its text,
 * the grades it mentions and an optional embedding vector.
 */
class QuestionBlueprintChunk extends Model
{
    /** @var list<string> */
    protected $fillable = ['blueprint_id', 'position', 'heading', 'content', 'grades', 'embedding', 'embedding_model'];

    /** @var list<string> */
    protected $hidden = ['embedding'];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'position' => 'integer',
            'grades' => 'array',
        ];
    }

    /** @return BelongsTo<QuestionBlueprint, $this> */
    public function blueprint(): BelongsTo
    {
        return $this->belongsTo(QuestionBlueprint::class, 'blueprint_id');
    }

    /** Pack a vector as base64 float32 (about 4x smaller than JSON). */
    public static function packVector(array $vector): string
    {
        return base64_encode(pack('g*', ...array_map('floatval', $vector)));
    }

    /** @return list<float> */
    public function vector(): array
    {
        if ($this->embedding === null || $this->embedding === '') {
            return [];
        }
        $bytes = base64_decode($this->embedding, true);

        return $bytes === false ? [] : array_values(unpack('g*', $bytes) ?: []);
    }

    /** Text shown to the AI: section heading (context) plus content. */
    public function promptText(): string
    {
        return $this->heading !== null && $this->heading !== '' && ! str_starts_with($this->content, $this->heading)
            ? "[{$this->heading}]\n{$this->content}"
            : $this->content;
    }
}
