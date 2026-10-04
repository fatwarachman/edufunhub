<?php

namespace App\Models;

use Database\Factories\GameHistoryFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class GameHistory extends Model
{
    /** @use HasFactory<GameHistoryFactory> */
    use HasFactory;

    /** @var list<string> */
    protected $fillable = [
        'game_key', 'game_name', 'mission', 'grade', 'age', 'school_name', 'points',
        'correct', 'wrong', 'duration_seconds', 'played_at', 'event_id',
    ];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'points' => 'integer',
            'grade' => 'integer',
            'age' => 'integer',
            'correct' => 'integer',
            'wrong' => 'integer',
            'duration_seconds' => 'integer',
            'played_at' => 'immutable_datetime',
        ];
    }

    /** Share of correct answers in this play, or null when unknown. */
    public function accuracy(): ?float
    {
        $total = (int) $this->correct + (int) $this->wrong;

        return $this->correct === null || $total === 0 ? null : round($this->correct / $total * 100, 1);
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** @return HasMany<QuestionAnswer, $this> */
    public function questionAnswers(): HasMany
    {
        return $this->hasMany(QuestionAnswer::class);
    }
}
