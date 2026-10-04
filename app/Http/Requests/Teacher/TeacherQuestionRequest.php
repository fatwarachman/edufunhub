<?php

namespace App\Http\Requests\Teacher;

use App\Http\Requests\Concerns\QuestionRules;
use App\Models\Question;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

class TeacherQuestionRequest extends FormRequest
{
    use QuestionRules;

    public function authorize(): bool
    {
        $question = $this->route('question');

        return $question instanceof Question
            ? $this->user()?->can('update', $question) ?? false
            : $this->user()?->isTeacher() ?? false;
    }

    protected function prepareForValidation(): void
    {
        $this->merge([
            'options' => $this->normalizeOptions($this->input('options'), $this->input('type')),
            'prompt_id' => trim((string) $this->input('prompt_id')),
            'grades' => collect((array) $this->input('grades', []))->map(fn ($grade): mixed => is_numeric($grade) ? (int) $grade : $grade)->values()->all(),
            'is_active' => $this->boolean('is_active'),
        ]);
    }

    /** @return array<string, array<mixed>> */
    public function rules(): array
    {
        return [...$this->questionContentRules($this->all()), ...$this->gradeRules()];
    }

    /** @return array<int, callable> */
    public function after(): array
    {
        return [fn (Validator $validator) => $this->validateQuestionConsistency($validator, $this->all())];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return $this->questionMessages();
    }

    /**
     * Validated attributes ready to persist, with the band derived from the grades.
     *
     * @return array<string, mixed>
     */
    public function questionAttributes(): array
    {
        $data = $this->validated();
        $grades = collect($data['grades'])->map(fn ($grade): int => (int) $grade)->unique()->sort()->values()->all();

        return [...$data, 'grades' => $grades, 'band' => Question::bandForGrades($grades)];
    }
}
