<?php

namespace App\Http\Requests\Teacher;

use App\Models\Classroom;
use App\Models\ClassroomGame;
use App\Models\Question;
use App\Models\Subject;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Carbon;
use Illuminate\Validation\Rule;

class ClassroomRequest extends FormRequest
{
    public const MAX_GAMES = 10;

    public const MAX_QUESTIONS_PER_GAME = 100;

    public const MAX_SUBJECTS_PER_GAME = 20;

    /** @return array<string, array<mixed>> */
    public function rules(): array
    {
        $now = now();

        return [
            'name' => ['required', 'string', 'min:3', 'max:120'],
            'description' => ['nullable', 'string', 'max:1000'],
            'starts_at' => $this->startLocked()
                ? ['required', 'date']
                : ['required', 'date', 'after:'.$now->copy()->subMinutes(5)->toIso8601String(), 'before:'.$now->copy()->addDays(60)->toIso8601String()],
            'duration_minutes' => ['required', 'integer', 'between:'.Classroom::MIN_DURATION.','.Classroom::MAX_DURATION],
            'max_members' => ['integer', 'min:1', 'max:'.Classroom::MAX_MEMBERS],
            'games' => ['required', 'array', 'min:1', 'max:'.self::MAX_GAMES],
            'games.*.game_key' => ['required', 'string', Rule::in(Question::GAMES)],
            'games.*.max_plays' => ['nullable', 'integer', 'min:'.ClassroomGame::MIN_PLAYS, 'max:'.ClassroomGame::MAX_PLAYS],
            'games.*.question_ids' => ['array', 'max:'.self::MAX_QUESTIONS_PER_GAME],
            'games.*.question_ids.*' => ['distinct', 'integer', 'exists:questions,id'],
            'games.*.subjects' => ['nullable', 'array', 'max:'.self::MAX_SUBJECTS_PER_GAME],
            'games.*.subjects.*' => ['distinct', 'string', Rule::in(Subject::activeKeys())],
            'games.*.difficulty' => ['nullable', 'integer', 'in:1,2,3'],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        $limits = ['min' => ClassroomGame::MIN_PLAYS, 'max' => ClassroomGame::MAX_PLAYS];

        return [
            'games.*.max_plays.integer' => __('classrooms.validation.max_plays_range', $limits),
            'games.*.max_plays.min' => __('classrooms.validation.max_plays_range', $limits),
            'games.*.max_plays.max' => __('classrooms.validation.max_plays_range', $limits),
            'games.*.subjects.*.in' => __('classrooms.validation.subject_invalid'),
        ];
    }

    public function passedValidation(): void
    {
        $teacher = $this->user();
        $games = (array) $this->validated('games');

        foreach ($games as $i => $game) {
            $gameKey = $game['game_key'];
            $questionIds = $game['question_ids'] ?? [];

            if ($questionIds === []) {
                continue;
            }

            if (in_array($gameKey, Question::CHOICE_ONLY_GAMES, true)) {
                $trueFalse = Question::query()
                    ->whereIn('id', $questionIds)
                    ->where('type', Question::TYPE_TRUE_FALSE)
                    ->exists();

                if ($trueFalse) {
                    $this->validator->errors()->add(
                        'games.'.$i.'.question_ids',
                        __('classrooms.validation.true_false_not_allowed', ['game' => $gameKey])
                    );
                }
            }

            $accessible = Question::query()
                ->whereIn('id', $questionIds)
                ->where(function (Builder $q) use ($teacher): void {
                    $q->where('created_by', $teacher->id)
                        ->orWhere(fn (Builder $q): Builder => $q->where('is_active', true)
                            ->where(fn (Builder $sub): Builder => $sub
                                ->where('source', '!=', 'teacher')
                                ->orWhere('is_active', true)
                            )
                        );
                })
                ->count();

            if ($accessible !== count($questionIds)) {
                $this->validator->errors()->add(
                    'games.'.$i.'.question_ids',
                    __('classrooms.validation.question_inaccessible')
                );
            }
        }
    }

    /**
     * Whether the edited classroom already started: its start time is then
     * fixed (the form locks it) and the stored value is kept.
     */
    public function startLocked(): bool
    {
        $classroom = $this->route('classroom');

        return $classroom instanceof Classroom && $classroom->status() !== Classroom::STATUS_SCHEDULED;
    }

    /** Start time to store: the original one once the classroom started. */
    public function startsAt(): Carbon
    {
        $classroom = $this->route('classroom');

        return $this->startLocked() && $classroom instanceof Classroom
            ? $classroom->starts_at->copy()
            : Carbon::parse($this->validated('starts_at'));
    }

    /** @return array<string, mixed> */
    public function questionAttributes(): array
    {
        return $this->only(['name', 'description', 'starts_at', 'max_members']);
    }

    /** @return list<array{game_key: string, sort_order: int, max_plays: int|null, subjects: list<string>|null, difficulty: int|null, question_ids: list<int>}> */
    public function games(): array
    {
        $games = (array) $this->validated('games');

        return array_map(function (int $i, array $game): array {
            $subjects = array_values(array_unique(array_map('strval', $game['subjects'] ?? [])));
            sort($subjects);

            return [
                'game_key' => $game['game_key'],
                'sort_order' => $i,
                'max_plays' => isset($game['max_plays']) && $game['max_plays'] !== '' ? (int) $game['max_plays'] : null,
                'subjects' => $subjects === [] ? null : $subjects,
                'difficulty' => isset($game['difficulty']) && $game['difficulty'] !== '' ? (int) $game['difficulty'] : null,
                'question_ids' => array_map('intval', $game['question_ids'] ?? []),
            ];
        }, array_keys($games), $games);
    }
}
