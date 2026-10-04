<?php

namespace App\Http\Requests;

use App\Services\GameServiceSigner;
use Illuminate\Foundation\Http\FormRequest;

class StoreGameResultRequest extends FormRequest
{
    public function authorize(): bool
    {
        return app(GameServiceSigner::class)->verifyRequest(
            (string) $this->header('X-Game-Timestamp'),
            (string) $this->header('X-Game-Signature'),
            $this->getContent(),
        );
    }

    /** @return array<string, array<mixed>> */
    public function rules(): array
    {
        $isSky = $this->input('game_key') === 'sky-quiz';

        return [
            'event_id' => ['required', 'string', 'max:120', $isSky ? 'regex:/^sq-[0-9]+-sky-[0-9]+$/' : 'regex:/^fq-[0-9]+-[a-z]+-[0-9]+$/'],
            'user_id' => ['required', 'integer', 'exists:users,id'],
            'game_key' => ['required', 'string', 'in:flag-quest,sky-quiz'],
            'mission' => ['required', 'string', $isSky ? 'in:sky' : 'in:lakeside,forest,summit'],
            'grade' => ['required', 'integer', 'between:1,12'],
            'points' => ['required', 'integer', 'between:0,'.($isSky ? 150 : 250)],
            'correct' => ['required', 'integer', 'min:0', 'max:500'],
            'wrong' => ['required', 'integer', 'min:0', 'max:500'],
            'duration_seconds' => ['required', 'integer', 'min:0'],
            'completed_at' => ['required', 'date'],
            'answers' => ['sometimes', 'nullable', 'array', 'max:100'],
            'answers.*.key' => ['required', 'string', 'max:40'],
            'answers.*.correct' => ['required', 'boolean'],
        ];
    }
}
