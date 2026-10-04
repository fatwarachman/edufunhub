<?php

namespace App\Http\Requests;

use App\Models\GameMatch;
use App\Models\PlayerProfile;
use App\Services\GameServiceSigner;
use Illuminate\Foundation\Http\FormRequest;

class StoreGameResultRequest extends FormRequest
{
    /**
     * Result shape per Go-refereed game: event id pattern, missions and the
     * highest point award the referee can produce. Caps mirror Go's
     * points.Cap(n) = n questions x 100 (bonus max) + 100 (win max) + 50
     * (participation max), plus each game's own fixed bonuses.
     *
     * @var array<string, array{event_id: string, missions: list<string>, max_points: int}>
     */
    public const GAMES = [
        'flag-quest' => ['event_id' => '/^fq-[0-9]+-[a-z]+-[0-9]+$/', 'missions' => ['lakeside', 'forest', 'summit'], 'max_points' => 3300],
        'sky-quiz' => ['event_id' => '/^sq-[0-9]+-sky-[0-9]+$/', 'missions' => ['sky'], 'max_points' => 1190],
        'quiz-duel' => ['event_id' => '/^qd-[0-9]+-duel-[0-9]+$/', 'missions' => ['duel'], 'max_points' => 650],
        'knowledge-train' => ['event_id' => '/^kt-[0-9]+-train-[0-9]+$/', 'missions' => ['train'], 'max_points' => 1190],
        'snakes-and-ladders' => ['event_id' => '/^sl-[0-9]+-room-[0-9]+$/', 'missions' => ['room'], 'max_points' => 3150],
        'crossword' => ['event_id' => '/^cw-[0-9]+-level-[0-9]+$/', 'missions' => ['level-1', 'level-2', 'level-3', 'level-4'], 'max_points' => 1415],
    ];

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
        $game = self::GAMES[$this->input('game_key')] ?? self::GAMES['flag-quest'];

        return [
            'event_id' => ['required', 'string', 'max:120', 'regex:'.$game['event_id']],
            'user_id' => ['required', 'integer', 'exists:users,id'],
            'game_key' => ['required', 'string', 'in:'.implode(',', array_keys(self::GAMES))],
            'mission' => ['required', 'string', 'in:'.implode(',', $game['missions'])],
            'grade' => ['required', 'integer', 'between:'.PlayerProfile::MIN_GRADE.','.PlayerProfile::MAX_GRADE],
            'points' => ['required', 'integer', 'between:0,'.$game['max_points']],
            'correct' => ['required', 'integer', 'min:0', 'max:500'],
            'wrong' => ['required', 'integer', 'min:0', 'max:500'],
            'duration_seconds' => ['required', 'integer', 'min:0'],
            'completed_at' => ['required', 'date'],
            'answers' => ['sometimes', 'nullable', 'array', 'max:100'],
            'answers.*.key' => ['required', 'string', 'max:40'],
            'answers.*.correct' => ['required', 'boolean'],
            'match' => ['sometimes', 'nullable', 'array'],
            'match.key' => ['required_with:match', 'string', 'max:80'],
            'match.mode' => ['required_with:match', 'string', 'in:'.implode(',', GameMatch::MODES)],
            'match.pin' => ['nullable', 'string', 'regex:/^[0-9]{6}$/'],
            'match.level' => ['nullable', 'integer', 'between:0,10'],
            'match.grade' => ['required_with:match', 'integer', 'between:'.PlayerProfile::MIN_GRADE.','.PlayerProfile::MAX_GRADE],
            'match.started_at' => ['required_with:match', 'date'],
            'match.ended_at' => ['required_with:match', 'date'],
            'match.finished' => ['required_with:match', 'boolean'],
            'match.players' => ['required_with:match', 'array', 'min:1', 'max:8'],
            'match.players.*.user_id' => ['nullable', 'integer', 'min:0'],
            'match.players.*.name' => ['required', 'string', 'max:120'],
            'match.players.*.grade' => ['required', 'integer', 'between:'.PlayerProfile::MIN_GRADE.','.PlayerProfile::MAX_GRADE],
            'match.players.*.local' => ['sometimes', 'boolean'],
            'match.players.*.bot' => ['sometimes', 'boolean'],
            'match.players.*.left' => ['sometimes', 'boolean'],
            'match.players.*.rank' => ['required', 'integer', 'between:1,8'],
            'match.players.*.score' => ['required', 'integer', 'min:0'],
            'match.players.*.correct' => ['required', 'integer', 'min:0', 'max:500'],
            'match.players.*.wrong' => ['required', 'integer', 'min:0', 'max:500'],
            'match.words' => ['nullable', 'array', 'max:30'],
            'match.words.*.key' => ['required', 'string', 'max:60'],
            'match.words.*.solved' => ['required', 'boolean'],
        ];
    }
}
