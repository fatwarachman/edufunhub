<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\ClassroomWorldController as StudentWorldController;
use App\Http\Controllers\Controller;
use App\Models\Classroom;
use App\Models\PlayerProfile;
use App\Services\Classrooms\ClassroomHud;
use App\Services\GameServiceSigner;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class ClassroomWorldController extends Controller
{
    public function __construct(
        private GameServiceSigner $signer,
        private ClassroomHud $hud,
    ) {}

    /**
     * Admin observer has no classroom membership and never receives student HUD points.
     */
    private function authorizeObserver(Classroom $classroom): void
    {
        abort_unless($classroom->isActive(), 404);
    }

    public function show(Classroom $classroom): Response
    {
        $this->authorizeObserver($classroom);
        $classroom->loadMissing('games');

        return Inertia::render('admin/classrooms/world', [
            'classroom' => ['id' => $classroom->id, 'name' => $classroom->name, 'pin' => $classroom->pin, 'status' => $classroom->status()],
            'world' => StudentWorldController::worldProps(
                $classroom,
                request()->user(),
                'observer',
                route('admin.classrooms.world-token', $classroom),
                route('admin.classrooms.world-hud', $classroom),
                $this->hud->forTeacher($classroom, request()->user()),
            ),
        ]);
    }

    public function token(Classroom $classroom, Request $request): JsonResponse
    {
        $this->authorizeObserver($classroom);
        abort_unless($this->signer->isConfigured(), 503);
        $player = StudentWorldController::player($request->user());

        return response()->json([
            'token' => $this->signer->issueToken($request->user(), StudentWorldController::GAME_KEY, [
                ...$player,
                'grade' => $player['grade'] ?? PlayerProfile::MIN_GRADE,
            ], [
                'classroom' => $classroom->id,
                'booths' => $classroom->gameKeys(),
                'seats' => (int) $classroom->max_members,
                'teacher_id' => (int) $classroom->teacher_id,
                'observer' => true,
            ]),
            'expires_in' => (int) config('game-service.token_ttl'),
        ]);
    }

    public function hud(Classroom $classroom): JsonResponse
    {
        $this->authorizeObserver($classroom);

        return response()->json($this->hud->forTeacher($classroom, request()->user()));
    }
}
