<?php

namespace App\Services;

use App\Models\Question;
use App\Models\User;
use App\Services\Classrooms\ClassroomContext;
use App\Services\Classrooms\ClassroomPlayLimit;
use Illuminate\Support\Str;
use RuntimeException;

/**
 * Issues player tokens for the Go game service and verifies results it reports back.
 *
 * Token: base64url(json) "." base64url(HMAC-SHA256(payload, secret)).
 * Result signature: hex(HMAC-SHA256(timestamp "." body, secret)).
 */
class GameServiceSigner
{
    /** Upper bound of the classroom world `seats` claim (Classroom::MAX_MEMBERS). */
    public const MAX_SEATS = 200;

    public function isConfigured(): bool
    {
        return strlen((string) config('game-service.secret')) >= 32;
    }

    /**
     * @param  array{name: string, grade: int, level?: int, color: string, accessory: string, character?: array<string, mixed>}  $player
     * @param  array{classroom?: int, booths?: list<string>, seats?: int, teacher_id?: int, observer?: bool}  $extra  Extra claims; only `classroom`, `booths`, `seats` (clamped 1..200), `teacher_id` (kept only when > 0) and `observer` are accepted.
     */
    public function issueToken(User $user, string $game, array $player, array $extra = []): string
    {
        $claims = [
            'sub' => $user->id,
            'name' => $player['name'],
            'grade' => $player['grade'],
            'level' => Question::normalizeLevel($player['level'] ?? $user->playerProfile?->question_level),
            'color' => $player['color'],
            'accessory' => $player['accessory'],
            'character' => $player['character'] ?? null,
            'game' => $game,
            'exp' => now()->addSeconds((int) config('game-service.token_ttl'))->getTimestamp(),
            'nonce' => Str::random(16),
            'classroom' => array_key_exists('classroom', $extra) ? (int) $extra['classroom'] : $this->getClassroomId($user, $game),
        ];

        if (array_key_exists('booths', $extra)) {
            $claims['booths'] = array_values(array_map('strval', (array) $extra['booths']));
        }

        if (array_key_exists('seats', $extra)) {
            $claims['seats'] = max(1, min(self::MAX_SEATS, (int) $extra['seats']));
        }

        if (array_key_exists('teacher_id', $extra) && (int) $extra['teacher_id'] > 0) {
            $claims['teacher_id'] = (int) $extra['teacher_id'];
        }

        if (! empty($extra['observer'])) {
            $claims['observer'] = true;
        }

        $payload = $this->base64UrlEncode((string) json_encode($claims, JSON_UNESCAPED_UNICODE));

        return $payload.'.'.$this->base64UrlEncode(hash_hmac('sha256', $payload, $this->secret(), true));
    }

    /**
     * Classroom claim from the active membership. Once the student used every
     * play of this classroom game the claim is dropped (0): the game is still
     * playable, but its points no longer count for the classroom.
     */
    private function getClassroomId(User $user, string $game): ?int
    {
        $classroom = app(ClassroomContext::class)->currentFor($user, $game);

        if ($classroom === null) {
            return null;
        }

        return app(ClassroomPlayLimit::class)->remaining($classroom, $user, $game) === 0 ? 0 : $classroom->id;
    }

    public function verifyRequest(string $timestamp, string $signature, string $body): bool
    {
        if (! $this->isConfigured() || ! ctype_digit($timestamp) || $signature === '') {
            return false;
        }

        if (abs(now()->getTimestamp() - (int) $timestamp) > (int) config('game-service.signature_tolerance')) {
            return false;
        }

        return hash_equals($this->sign($timestamp, $body), $signature);
    }

    /** Signature for requests Laravel sends to the game service. */
    public function sign(string $timestamp, string $body): string
    {
        return hash_hmac('sha256', $timestamp.'.'.$body, $this->secret());
    }

    private function secret(): string
    {
        if (! $this->isConfigured()) {
            throw new RuntimeException('GAME_SERVICE_SECRET is not configured.');
        }

        return (string) config('game-service.secret');
    }

    private function base64UrlEncode(string $value): string
    {
        return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
    }
}
