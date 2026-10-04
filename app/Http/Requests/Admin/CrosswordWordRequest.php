<?php

namespace App\Http\Requests\Admin;

use App\Models\CrosswordWord;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class CrosswordWordRequest extends FormRequest
{
    public function authorize(): bool
    {
        return (bool) $this->user()?->is_superadmin;
    }

    /**
     * Answers are stored as capital A-Z only: spaces, hyphens and case are
     * removed so "Tata Surya" becomes TATASURYA.
     */
    protected function prepareForValidation(): void
    {
        $this->merge([
            'answer' => preg_replace('/[^A-Z]/', '', mb_strtoupper((string) $this->input('answer'))),
            'clue_id' => trim((string) $this->input('clue_id')),
            'clue_en' => trim((string) $this->input('clue_en')) ?: null,
            'is_active' => $this->boolean('is_active'),
        ]);
    }

    /** @return array<string, array<mixed>> */
    public function rules(): array
    {
        $word = $this->route('crossword_word');

        return [
            'level' => ['required', 'integer', Rule::in(array_keys(CrosswordWord::LEVELS))],
            'answer' => [
                'required', 'string', 'min:'.CrosswordWord::MIN_LENGTH, 'max:'.CrosswordWord::MAX_LENGTH, 'regex:/^[A-Z]+$/',
                Rule::unique('crossword_words', 'answer')->where('level', $this->integer('level'))->ignore($word?->id),
            ],
            'clue_id' => ['required', 'string', 'min:3', 'max:160'],
            'clue_en' => ['nullable', 'string', 'max:160'],
            'is_active' => ['boolean'],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'answer.required' => 'Enter the answer (letters A–Z).',
            'answer.min' => 'The answer needs at least :min letters.',
            'answer.max' => 'The answer can have at most :max letters (largest grid is 15 squares).',
            'answer.regex' => 'The answer may only contain letters A–Z.',
            'answer.unique' => 'This word already exists at this level.',
            'clue_id.required' => 'Write the clue in Indonesian.',
            'clue_id.min' => 'The clue is too short.',
            'clue_id.max' => 'The clue can have at most :max characters.',
            'clue_en.max' => 'The clue can have at most :max characters.',
            'level.in' => 'Choose level 1 to 4.',
        ];
    }
}
