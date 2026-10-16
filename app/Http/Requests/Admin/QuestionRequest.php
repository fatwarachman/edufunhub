<?php

namespace App\Http\Requests\Admin;

use App\Models\Question;
use App\Models\Subject;
use App\Services\QuestionVisual;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

class QuestionRequest extends FormRequest
{
    public function authorize(): bool
    {
        return (bool) $this->user()?->is_superadmin;
    }

    protected function prepareForValidation(): void
    {
        $options = collect($this->input('options', []))
            ->map(function ($option): array {
                $media = is_array($option['media'] ?? null) && ($option['media']['kind'] ?? null) === 'image'
                    ? ['kind' => 'image', 'src' => (string) ($option['media']['src'] ?? '')]
                    : null;

                return array_filter([
                    'id' => trim((string) ($option['id'] ?? '')),
                    'en' => trim((string) ($option['en'] ?? '')),
                    'media' => $media,
                ], fn (mixed $value): bool => $value !== null);
            })
            ->filter(fn (array $option): bool => $option['id'] !== '' || isset($option['media']))
            ->values()
            ->all();

        $this->merge([
            'options' => $this->input('type') === Question::TYPE_CHOICE ? $options : null,
            'prompt_id' => trim((string) $this->input('prompt_id')),
            'is_active' => $this->boolean('is_active'),
            'points' => $this->filled('points') && (int) $this->input('points') > 0 ? (int) $this->input('points') : null,
            'visual' => is_array($this->input('visual')) && filled($this->input('visual.kind')) ? $this->input('visual') : null,
        ]);
    }

    /** @return array<string, array<mixed>> */
    public function rules(): array
    {
        $isChoice = $this->input('type') === Question::TYPE_CHOICE;

        return [
            'type' => ['required', Rule::in(Question::TYPES)],
            'band' => ['required', 'integer', 'between:0,3'],
            'level' => ['sometimes', 'integer', Rule::in(array_keys(Question::LEVELS))],
            'subject' => ['required', Rule::in($this->allowedSubjects())],
            'prompt_id' => ['required', 'string', 'min:3', 'max:500'],
            'prompt_en' => ['nullable', 'string', 'max:500'],
            'options' => $isChoice ? ['required', 'array', 'min:3', 'max:6'] : ['nullable'],
            'options.*.id' => ['required_without:options.*.media.src', 'nullable', 'string', 'max:150'],
            'options.*.en' => ['nullable', 'string', 'max:150'],
            'options.*.media' => ['nullable', 'array'],
            'options.*.media.kind' => ['nullable', 'in:image'],
            'options.*.media.src' => ['required_if:options.*.media.kind,image', 'nullable', 'string', 'max:120', 'regex:#^'.preg_quote(QuestionVisual::URL_PREFIX, '#').QuestionVisual::FILE_PATTERN.'$#'],
            'answer' => ['required', 'integer', 'min:0', $isChoice ? 'max:'.max(0, count($this->input('options') ?? []) - 1) : 'max:1'],
            'hint_id' => ['nullable', 'string', 'max:300'],
            'hint_en' => ['nullable', 'string', 'max:300'],
            'games' => ['required', 'array', 'min:1'],
            'games.*' => ['required', Rule::in(Question::GAMES)],
            'is_active' => ['boolean'],
            'points' => ['nullable', 'integer', 'between:1,'.Question::MAX_POINTS],
            ...QuestionVisual::rules(),
        ];
    }

    public function after(): array
    {
        return [
            function (Validator $validator): void {
                if ($this->input('type') === Question::TYPE_TRUE_FALSE && array_intersect(Question::CHOICE_ONLY_GAMES, (array) $this->input('games')) !== []) {
                    $validator->errors()->add('games', __('questions.choice_only_games'));
                }

                $options = collect($this->input('options') ?? [])
                    ->map(fn (mixed $option): string => is_array($option) ? mb_strtolower(trim((string) ($option['id'] ?? ''))) : '')
                    ->filter(fn (string $id): bool => $id !== '');
                if ($options->count() !== $options->unique()->count()) {
                    $validator->errors()->add('options', __('Answer options must be unique.'));
                }

                foreach ((array) ($this->input('options') ?? []) as $index => $option) {
                    $optionSrc = is_array($option['media'] ?? null) ? ($option['media']['src'] ?? null) : null;
                    if (is_string($optionSrc) && $optionSrc !== '' && ! QuestionVisual::imageExists($optionSrc)) {
                        $validator->errors()->add("options.{$index}.media.src", __('questions.visual.image_missing'));
                    }
                }

                $src = $this->input('visual.src');
                if ($this->input('visual.kind') === 'image' && is_string($src) && ! $validator->errors()->has('visual.src') && ! QuestionVisual::imageExists($src)) {
                    $validator->errors()->add('visual.src', __('questions.visual.image_missing'));
                }
            },
        ];
    }

    /**
     * Validated data with the visual reduced to its kind's fields.
     *
     * @param  array-key|null  $key
     * @param  mixed  $default
     * @return mixed
     */
    public function validated($key = null, $default = null)
    {
        $data = parent::validated();
        $data['visual'] = QuestionVisual::normalize($data['visual'] ?? null);

        return data_get($data, $key, $default);
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'options.required' => __('Multiple choice questions need at least 3 options.'),
            'options.min' => __('Multiple choice questions need at least 3 options.'),
            'answer.max' => __('Choose a correct answer from the options.'),
            'games.required' => __('Distribute the question to at least one game.'),
            'visual.src.required_if' => __('questions.visual.image_required'),
            'options.*.id.required_without' => __('questions.visual.option_text_or_image'),
            'visual.src.regex' => __('questions.visual.image_missing'),
            'visual.wires.required_if' => __('questions.visual.wires_required'),
            'visual.wires.min' => __('questions.visual.wires_required'),
            'visual.wires.*.color.regex' => __('questions.visual.color_invalid'),
            'visual.wires.*.stripe.regex' => __('questions.visual.color_invalid'),
            'visual.shape.required_if' => __('questions.visual.shape_required'),
            'visual.lines.required_if' => __('questions.visual.lines_required'),
            'options.*.media.kind.in' => __('questions.visual.image_file'),
            'options.*.media.src.required_if' => __('questions.visual.image_required'),
            'options.*.media.src.regex' => __('questions.visual.image_missing'),
        ];
    }

    /**
     * Active subjects, plus the current one when editing a question whose
     * subject was later hidden (so it can still be saved unchanged).
     *
     * @return list<string>
     */
    private function allowedSubjects(): array
    {
        $current = $this->route('question')?->subject;

        return array_values(array_unique([...Subject::activeKeys(), ...($current ? [$current] : [])]));
    }
}
