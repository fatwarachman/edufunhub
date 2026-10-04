<?php

namespace App\Http\Requests\Admin;

use App\Services\PointRules;
use Illuminate\Foundation\Http\FormRequest;

class PointRulesRequest extends FormRequest
{
    public function authorize(): bool
    {
        return (bool) $this->user()?->is_superadmin;
    }

    /** @return array<string, array<mixed>> */
    public function rules(): array
    {
        return collect(PointRules::BOUNDS)
            ->map(fn (array $bounds): array => ['required', 'integer', "between:{$bounds[0]},{$bounds[1]}"])
            ->all();
    }
}
