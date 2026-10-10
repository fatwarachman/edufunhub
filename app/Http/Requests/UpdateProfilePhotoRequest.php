<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UpdateProfilePhotoRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    /** @return array<string, array<mixed>> */
    public function rules(): array
    {
        return [
            'photo' => ['required', 'file', 'mimes:jpg,jpeg,png,webp', 'mimetypes:image/jpeg,image/png,image/webp', 'max:2048', 'dimensions:min_width=64,min_height=64,max_width=4096,max_height=4096'],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'photo.required' => __('profile.photo_required'),
            'photo.file' => __('profile.photo_required'),
            'photo.mimes' => __('profile.photo_type'),
            'photo.mimetypes' => __('profile.photo_type'),
            'photo.max' => __('profile.photo_size'),
            'photo.dimensions' => __('profile.photo_dimensions'),
        ];
    }
}
