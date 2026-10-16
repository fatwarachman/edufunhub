<?php

namespace App\Http\Requests\Admin;

use App\Services\QuestionVisual;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

/**
 * Upload of a question picture (`purpose=question`) or an answer option
 * picture (`purpose=option`). Limits keep pictures sharp but light enough for
 * every game screen; the browser downsizes before upload (lib/image-resize.ts).
 */
class QuestionMediaRequest extends FormRequest
{
    public function authorize(): bool
    {
        return (bool) ($this->user()?->is_superadmin || $this->user()?->isTeacher());
    }

    /** @return array<string, array<mixed>> */
    public function rules(): array
    {
        $maxKb = $this->isOption() ? QuestionVisual::OPTION_MAX_KB : QuestionVisual::QUESTION_MAX_KB;

        return [
            'purpose' => ['nullable', 'string', 'in:question,option'],
            'image' => [
                'required',
                'file',
                'mimes:jpg,jpeg,png,webp',
                'mimetypes:image/jpeg,image/png,image/webp',
                'max:'.$maxKb,
                'dimensions:min_width='.QuestionVisual::MIN_SIDE.',min_height='.QuestionVisual::MIN_SIDE.',max_width='.QuestionVisual::MAX_SIDE.',max_height='.QuestionVisual::MAX_SIDE,
            ],
        ];
    }

    /** @return list<callable(Validator): void> */
    public function after(): array
    {
        return [
            function (Validator $validator): void {
                $file = $this->file('image');
                if ($file === null || $validator->errors()->has('image')) {
                    return;
                }
                $size = @getimagesize($file->getRealPath());
                if ($size === false || $size[0] <= 0 || $size[1] <= 0) {
                    $validator->errors()->add('image', __('questions.visual.image_file'));

                    return;
                }
                if (max($size[0], $size[1]) / min($size[0], $size[1]) > QuestionVisual::MAX_RATIO) {
                    $validator->errors()->add('image', __('questions.visual.image_ratio'));
                }
            },
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'image.required' => __('questions.visual.image_required'),
            'image.file' => __('questions.visual.image_file'),
            'image.mimes' => __('questions.visual.image_file'),
            'image.mimetypes' => __('questions.visual.image_file'),
            'image.max' => __($this->isOption() ? 'questions.visual.option_image_size' : 'questions.visual.image_size'),
            'image.dimensions' => __('questions.visual.image_dimensions'),
        ];
    }

    private function isOption(): bool
    {
        return $this->input('purpose') === 'option';
    }
}
