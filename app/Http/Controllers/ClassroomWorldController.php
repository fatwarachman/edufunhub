<?php

namespace App\Http\Controllers;

use App\Models\Classroom;
use App\Models\ClassroomMember;
use App\Models\PlayerProfile;
use App\Models\User;
use App\Services\Classrooms\ClassroomHud;
use App\Services\GameServiceSigner;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * 3D classroom world: signed token for the Go world socket and the HUD
 * (points, plays, leaderboard). Active members of an active classroom only.
 */
class ClassroomWorldController extends Controller
{
    public const GAME_KEY = 'classroom';

    public function __construct(
        private GameServiceSigner $signer,
        private ClassroomHud $hud,
    ) {}

    public function token(string $pin, Request $request): JsonResponse
    {
        $classroom = $this->activeClassroom($pin);
        $this->ensureActiveMember($classroom, $request->user());

        abort_unless($this->signer->isConfigured(), 503);

        $player = self::player($request->user());

        return response()->json([
            'token' => $this->signer->issueToken($request->user(), self::GAME_KEY, [
                ...$player,
                'grade' => $player['grade'] ?? PlayerProfile::MIN_GRADE,
            ], [
                'classroom' => $classroom->id,
                'booths' => $classroom->gameKeys(),
                'seats' => (int) $classroom->max_members,
                'teacher_id' => (int) $classroom->teacher_id,
            ]),
            'expires_in' => (int) config('game-service.token_ttl'),
        ]);
    }

    public function hud(string $pin, Request $request): JsonResponse
    {
        $classroom = $this->activeClassroom($pin);
        $this->ensureActiveMember($classroom, $request->user());

        return response()->json($this->hud->forMember($classroom, $request->user()));
    }

    /**
     * Player identity shared with the world: nickname fallback name and avatar look.
     *
     * @return array{id: int, name: string, grade: int|null, color: string, accessory: string, character: array<string, mixed>}
     */
    public static function player(User $user): array
    {
        $profile = $user->playerProfile()->first() ?? new PlayerProfile;

        return [
            'id' => $user->id,
            'name' => $profile->nickname ?: $user->name,
            'grade' => $profile->grade,
            'color' => $profile->color,
            'accessory' => $profile->accessory,
            'character' => $profile->look(),
        ];
    }

    /**
     * Props of the 3D world shared by the student and teacher pages.
     *
     * @param  array{me: array{points: int, plays: int, rank: int|null}, leaderboard: list<array<string, mixed>>, members_count: int, ends_at: string|null}  $hud
     * @return array{ws_url: string, token_url: string, hud_url: string, hud: array<string, mixed>, me: array{id: int, name: string, character: array<string, mixed>}, teacher: array{id: int, name: string, character: array<string, mixed>}|null, role: 'student'|'teacher'|'observer', people: list<int>, chat_url: string|null}
     */
    public static function worldProps(Classroom $classroom, User $viewer, string $role, string $tokenUrl, string $hudUrl, array $hud): array
    {
        $player = self::player($viewer);
        $teacher = $classroom->teacher()->first();
        $teacherPlayer = $teacher !== null ? self::player($teacher) : null;

        return [
            'ws_url' => (string) config('game-service.public_classroom_ws_url'),
            'token_url' => $tokenUrl,
            'hud_url' => $hudUrl,
            'hud' => $hud,
            'me' => [
                'id' => $player['id'],
                'name' => $player['name'],
                'character' => $player['character'],
            ],
            'teacher' => $teacherPlayer !== null ? [
                'id' => $teacherPlayer['id'],
                'name' => $teacherPlayer['name'],
                'character' => $teacherPlayer['character'],
            ] : null,
            'role' => in_array($role, ['teacher', 'observer'], true) ? $role : 'student',
            'people' => $classroom->members()
                ->whereNull('left_at')
                ->pluck('user_id')
                ->push($classroom->teacher_id)
                ->map(fn ($id): int => (int) $id)
                ->reject(fn (int $id): bool => $id === (int) $viewer->id)
                ->unique()
                ->values()
                ->all(),
            'chat_url' => $role === 'observer'
                ? null
                : ($role === 'teacher'
                    ? route('teacher.classrooms.world-chat', $classroom)
                    : route('classrooms.world-chat', $classroom->pin)),
        ];
    }

    private function activeClassroom(string $pin): Classroom
    {
        return Classroom::query()
            ->with('games')
            ->where('pin', $pin)
            ->activeAt()
            ->firstOrFail();
    }

    private function ensureActiveMember(Classroom $classroom, User $user): ClassroomMember
    {
        $member = $classroom->members()
            ->where('user_id', $user->id)
            ->whereNull('left_at')
            ->first();

        abort_if($member === null, 403);

        return $member;
    }
}
