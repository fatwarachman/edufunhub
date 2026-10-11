<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

/**
 * One game of a classroom and the questions the teacher picked for it. No
 * picked questions means the game draws from the normal bank.
 */
class ClassroomGame extends Model
{
    /** @var list<string> */
    protected $fillable = ['classroom_id', 'game_key', 'sort_order'];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return ['classroom_id' => 'integer', 'sort_order' => 'integer'];
    }

    /** @return BelongsTo<Classroom, $this> */
    public function classroom(): BelongsTo
    {
        return $this->belongsTo(Classroom::class);
    }

    /** @return BelongsToMany<Question, $this> */
    public function questions(): BelongsToMany
    {
        return $this->belongsToMany(Question::class, 'classroom_game_questions')
            ->withPivot('sort_order')
            ->orderByPivot('sort_order');
    }
}
