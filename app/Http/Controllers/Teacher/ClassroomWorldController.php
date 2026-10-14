<?php

namespace App\Http\Controllers\Teacher;

use App\Http\Controllers\ClassroomWorldController as StudentWorldController;
use App\Http\Controllers\Controller;
use App\Models\Classroom;
use App\Models\PlayerProfile;
use App\Models\User;
use App\Services\Classrooms\ClassroomHud;
use App\Services\GameServiceSigner;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Inertia\Inertia;
use Inertia\Response;

/**
 * The classroom owner walking into their own 3D classroom: page, signed world
 * token (sub == teacher_id, so Go seats them at the teacher desk) and HUD.
 * Owner only, and only while the classroom is active.
 */
class ClassroomWorldController extends Controller
{
    public function __construct(
        private GameServiceSigner $signer,
        private ClassroomHud $hud,
    ) {}

    public function show(Classroom $classroom, Request $request): Response|RedirectResponse
    {
        $this->authorizeOwner($classroom, $request->user());

        if (! $classroom->isActive()) {
            return redirect()
                ->route('teacher.classrooms.show', $classroom)
                ->with('error', __('classrooms.world_not_active'));
        }

        return Inertia::render('teacher/classrooms/world', [
            'classroom' => [
                'id' => $classroom->id,
                'name' => $classroom->name,
                'pin' => $classroom->pin,
                'status' => $classroom->status(),
            ],
            'world' => StudentWorldController::worldProps(
                $classroom,
                $request->user(),
                'teacher',
                route('teacher.classrooms.world-token', $classroom),
                route('teacher.classrooms.world-hud', $classroom),
                $this->hud->forTeacher($classroom, $request->user()),
            ),
        ]);
    }

    public function token(Classroom $classroom, Request $request): JsonResponse
    {
        $this->authorizeOwner($classroom, $request->user());
        abort_unless($classroom->isActive(), 404);
        abort_unless($this->signer->isConfigured(), 503);

        $classroom->loadMissing('games');
        $player = StudentWorldController::player($request->user());

        return response()->json([
            'token' => $this->signer->issueToken($request->user(), StudentWorldController::GAME_KEY, [
                ...$player,
                'grade' => $player['grade'] ?? PlayerProfile::MIN_GRADE,
            ], [
                'classroom' => $classroom->id,
                'booths' => $classroom->gameKeys(),
                'seats' => (int) $classroom->max_members,
                'teacher_id' => (int) $request->user()->id,
            ]),
            'expires_in' => (int) config('game-service.token_ttl'),
        ]);
    }

    public function hud(Classroom $classroom, Request $request): JsonResponse
    {
        $this->authorizeOwner($classroom, $request->user());
        abort_unless($classroom->isActive(), 404);

        return response()->json($this->hud->forTeacher($classroom, $request->user()));
    }

    /**
     * Same policy as the teacher classroom page, narrowed to the owner: an
     * admin passing `view` must not take the teacher seat of someone else.
     */
    private function authorizeOwner(Classroom $classroom, User $user): void
    {
        Gate::authorize('view', $classroom);
        abort_unless((int) $classroom->teacher_id === (int) $user->id, 403);
    }
}
