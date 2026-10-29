<?php

namespace App\Http\Requests\Teacher;

use App\Http\Requests\Concerns\QuestionRules;
use App\Models\Question;
use App\Services\QuestionVisual;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

class TeacherQuestionRequest extends FormRequest
{
    use QuestionRules;

    public function authorize(): bool
    {
        $question = $this->route('question');

        return $question instanceof Question
            ? ($this->user()?->can('update', $question) ?? false) && $this->user()->canTeachSubject($question->subject)
            : ($this->user()?->isTeacher() ?? false) && $this->user()->canTeachSubject((string) $this->input('subject'));
    }

    protected function prepareForValidation(): void
    {
        $this->merge([
            'options' => $this->normalizeOptions($this->input('options'), $this->input('type')),
            'prompt_id' => trim((string) $this->input('prompt_id')),
            'grades' => collect((array) $this->input('grades', []))->map(fn ($grade): mixed => is_numeric($grade) ? (int) $grade : $grade)->values()->all(),
            'is_active' => $this->boolean('is_active'),
            'level' => $this->parseLevel($this->input('level')),
            'topic_id' => $this->filled('topic_id') ? (is_numeric($this->input('topic_id')) ? (int) $this->input('topic_id') : $this->input('topic_id')) : null,
            'games' => $this->has('games') ? $this->input('games') : $this->defaultGames(),
        ]);
    }

    /**
     * Games used when the form sends none: teachers pick games later from
     * their question list. An edited question keeps the games it still
     * supports; a new one goes to every game that supports its type.
     *
     * @return list<string>
     */
    private function defaultGames(): array
    {
        $type = $this->input('type');
        $compatible = Question::gamesForType(is_string($type) ? $type : Question::TYPE_CHOICE);
        $question = $this->route('question');

        if ($question instanceof Question) {
            $kept = array_values(array_intersect($question->games ?? [], $compatible));
            if ($kept !== []) {
                return $kept;
            }
        }

        return $compatible;
    }

    /** @return array<string, array<mixed>> */
    public function rules(): array
    {
        return [...$this->questionContentRules($this->all()), ...$this->levelAndTopicRules($this->all()), ...$this->gradeRules()];
    }

    /** @return array<int, callable> */
    public function after(): array
    {
        return [fn (Validator $validator) => $this->validateQuestionConsistency($validator, $this->all())];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [...$this->questionMessages(), ...$this->questionMediaMessages()];
    }

    /**
     * Validated attributes ready to persist, with the band derived from the grades
     * and the level clamped to the shared question levels.
     *
     * @return array<string, mixed>
     */
    public function questionAttributes(): array
    {
        $data = $this->validated();
        $grades = collect($data['grades'])->map(fn ($grade): int => (int) $grade)->unique()->sort()->values()->all();

        return [
            ...$data,
            'visual' => QuestionVisual::normalize($data['visual'] ?? null),
            'grades' => $grades,
            'band' => Question::bandForGrades($grades),
            'level' => Question::normalizeLevel($data['level']),
            'topic_id' => $data['topic_id'] ?? null,
        ];
    }
}
