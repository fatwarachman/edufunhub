<?php

namespace App\Http\Requests\Teacher;

use App\Models\Question;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

/**
 * Games a teacher's question is shown in, picked from the question list.
 */
class TeacherQuestionGamesRequest extends FormRequest
{
    public function authorize(): bool
    {
        $question = $this->route('question');

        return $question instanceof Question && ($this->user()?->can('update', $question) ?? false);
    }

    /** @return array<string, array<mixed>> */
    public function rules(): array
    {
        return [
            'games' => ['required', 'array', 'min:1', 'max:'.count(Question::GAMES)],
            'games.*' => ['required', 'string', 'distinct', Rule::in(Question::GAMES)],
        ];
    }

    /** @return array<int, callable> */
    public function after(): array
    {
        return [function (Validator $validator): void {
            $question = $this->route('question');
            if ($question instanceof Question && $question->type === Question::TYPE_TRUE_FALSE
                && array_intersect(Question::CHOICE_ONLY_GAMES, (array) $this->input('games', [])) !== []) {
                $validator->errors()->add('games', __('questions.choice_only_games'));
            }
        }];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'games.required' => __('questions.games_required'),
            'games.min' => __('questions.games_required'),
            'games.*.in' => __('questions.games_invalid'),
        ];
    }
}
