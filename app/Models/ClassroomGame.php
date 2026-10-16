<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

/**
 * One game of a classroom and the questions the teacher picked for it. No
 * picked questions means the game draws from the normal bank, limited to
 * the subjects the teacher chose (none = every subject).
 */
class ClassroomGame extends Model
{
    /** @var list<string> */
    protected $fillable = ['classroom_id', 'game_key', 'sort_order', 'max_plays', 'subjects'];

    public const MIN_PLAYS = 1;

    public const MAX_PLAYS = 50;

    /** @return array<string, string> */
    protected function casts(): array
    {
        return ['classroom_id' => 'integer', 'sort_order' => 'integer', 'max_plays' => 'integer', 'subjects' => 'array'];
    }

    /**
     * Subjects students play in this game: the subjects of the picked
     * questions when there are any, else the teacher's chosen subjects.
     * Sorted and unique; empty means every subject.
     *
     * @return list<string>
     */
    public function playSubjects(): array
    {
        $subjects = $this->questions->isNotEmpty()
            ? $this->questions->pluck('subject')->all()
            : ($this->subjects ?? []);

        $subjects = array_values(array_unique(array_filter(
            array_map('strval', $subjects),
            fn (string $key): bool => $key !== '',
        )));
        sort($subjects);

        return $subjects;
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
