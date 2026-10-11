<?php

namespace App\Http\Requests\Teacher;

use Illuminate\Foundation\Http\FormRequest;

class ClassroomShareRequest extends FormRequest
{
    /** @return array<string, array<mixed>> */
    public function rules(): array
    {
        return [
            'note' => ['nullable', 'string', 'max:1000'],
        ];
    }
}
