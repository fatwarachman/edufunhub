<?php

namespace App\Http\Requests\Admin;

use Illuminate\Foundation\Http\FormRequest;

class QuestionMediaRequest extends FormRequest
{
    public function authorize(): bool
    {
        return (bool) $this->user()?->is_superadmin;
    }

    /** @return array<string, array<mixed>> */
    public function rules(): array
    {
        return [
            'image' => ['required', 'file', 'mimes:jpg,jpeg,png,webp', 'mimetypes:image/jpeg,image/png,image/webp', 'max:2048', 'dimensions:min_width=64,min_height=64,max_width=4096,max_height=4096'],
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
            'image.max' => __('questions.visual.image_file'),
            'image.dimensions' => __('questions.visual.image_file'),
        ];
    }
}
