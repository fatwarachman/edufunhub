<?php

namespace App\Http\Controllers;

use App\Models\PlayerProfile;
use App\Models\Question;
use App\Models\Subject;
use App\Services\GameServiceSigner;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Ular Tangga Edukasi: solo or pass-and-play on one device runs in the
 * browser; online rooms (shared by PIN or link) are refereed by the Go
 * service, which owns dice, questions, turns and timers.
 */
class SnakesAndLaddersController extends Controller
{
    public const GAME_KEY = 'snakes-and-ladders';

    public function __construct(public GameServiceSigner $signer) {}

    public function show(Request $request): Response
    {
        $user = $request->user();
        $pin = $request->query('pin');

        return Inertia::render('games/snakes-and-ladders', [
            'player' => $user ? $this->player($request) : null,
            'online' => $user !== null && $this->signer->isConfigured(),
            'wsUrl' => $user ? config('game-service.public_snakes_ws_url') : null,
            'pin' => is_string($pin) && preg_match('/^\d{6}$/', $pin) ? $pin : null,
            'practiceQuestions' => $this->practiceQuestions($user?->playerProfile()->value('grade')),
        ]);
    }

    /**
     * Questions for practice on one device: the active bank questions
     * distributed to Ular Tangga, so admins manage them in the question bank.
     *
     * @return list<array{id: int, key: string, level: string, subject: string, question: string, options: list<string>, answer: int, explanation: string}>
     */
    private function practiceQuestions(?int $grade): array
    {
        $english = app()->getLocale() === 'en';
        $subjects = collect(Subject::catalog())->keyBy('key');
        $questions = Question::query()
            ->active()
            ->where('type', Question::TYPE_CHOICE)
            ->whereJsonContains('games', self::GAME_KEY)
            ->orderBy('id')
            ->limit(300)
            ->get();

        // Signed-in players practise at their grade when the bank has enough
        // questions for it; guests (no grade) get every level.
        if ($grade !== null) {
            $forGrade = $questions->filter(fn (Question $question): bool => $question->grades
                ? in_array($grade, array_map('intval', $question->grades), true)
                : $question->band === Question::bandForGrade($grade));
            if ($forGrade->count() >= 10) {
                $questions = $forGrade->values();
            }
        }

        return $questions
            ->map(function (Question $question) use ($english, $subjects): array {
                $text = fn (?string $id, ?string $en): string => (string) ($english && filled($en) ? $en : $id);
                $subject = $subjects->get($question->subject);
                [$from, $to] = Question::BANDS[$question->band] ?? [1, 12];

                return [
                    'id' => $question->id,
                    'key' => $question->key,
                    'level' => __('snakes.grade_range', ['from' => $from, 'to' => $to]),
                    'subject' => $subject ? $text($subject['name_id'], $subject['name_en']) : $question->subject,
                    'question' => $text($question->prompt_id, $question->prompt_en),
                    'options' => collect($question->options ?? [])->map(fn (array $option): string => $text($option['id'] ?? '', $option['en'] ?? ''))->values()->all(),
                    'answer' => (int) $question->answer,
                    'explanation' => $text($question->hint_id, $question->hint_en),
                ];
            })
            ->all();
    }

    public function token(Request $request): JsonResponse
    {
        $player = $this->player($request);

        abort_unless($this->signer->isConfigured(), 503);
        abort_if($player['grade'] === null, 422, __('character.grade_required'));

        return response()->json([
            'token' => $this->signer->issueToken($request->user(), self::GAME_KEY, $player),
            'expires_in' => (int) config('game-service.token_ttl'),
        ]);
    }

    /**
     * @return array{name: string, grade: ?int, color: string, accessory: string, character: array<string, mixed>}
     */
    private function player(Request $request): array
    {
        $user = $request->user();
        $profile = $user->playerProfile()->first() ?? new PlayerProfile;

        return [
            'name' => $profile->nickname ?: $user->name,
            'grade' => $profile->grade,
            'color' => $profile->color,
            'accessory' => $profile->accessory,
            'character' => $profile->look(),
        ];
    }
}
