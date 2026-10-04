<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class QuestionAnswer extends Model
{
    public const UPDATED_AT = null;

    /** @var list<string> */
    protected $fillable = ['question_id', 'game_history_id', 'game_key', 'correct'];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return ['correct' => 'boolean'];
    }

    /** @return BelongsTo<Question, $this> */
    public function question(): BelongsTo
    {
        return $this->belongsTo(Question::class);
    }

    /** @return BelongsTo<GameHistory, $this> */
    public function gameHistory(): BelongsTo
    {
        return $this->belongsTo(GameHistory::class);
    }
}
