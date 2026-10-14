<?php

namespace App\Http\Controllers;

use App\Models\Classroom;
use App\Services\Classrooms\ClassroomAnnouncer;
use App\Services\Classrooms\ClassroomHud;
use App\Services\Classrooms\ClassroomPlayLimit;
use App\Services\Classrooms\ClassroomWorldKicker;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class ClassroomJoinController extends Controller
{
    public function __construct(
        private ClassroomHud $hud,
        private ClassroomWorldKicker $kicker,
    ) {}

    /**
     * Show the classroom join page for a PIN.
     */
    public function show(string $pin, Request $request): Response
    {
        $classroom = Classroom::query()
            ->with(['games' => fn ($query) => $query->withCount('questions')])
            ->where('pin', $pin)
            ->where('starts_at', '<=', now())
            ->latest('starts_at')
            ->first();
        $member = null;

        if ($classroom !== null) {
            $member = $classroom->members()
                ->where('user_id', $request->user()->id)
                ->first();
        }

        // An ended classroom stays hidden from strangers (the PIN may be
        // reused); its own members see the "class ended" screen instead.
        if ($classroom !== null && $classroom->ends_at <= now() && $member === null) {
            $classroom = null;
        }

        $isActiveMember = $classroom !== null && $member !== null && $member->left_at === null && $classroom->isActive();

        return Inertia::render('portal/classroom', [
            'pin' => $pin,
            'classroom' => $classroom ? [
                'id' => $classroom->id,
                'name' => $classroom->name,
                'description' => $classroom->description,
                'pin' => $classroom->pin,
                'status' => $classroom->status(),
                'starts_at' => $classroom->starts_at?->toIso8601String(),
                'ends_at' => $classroom->ends_at?->toIso8601String(),
                'games' => $classroom->gameKeys(),
                'max_members' => $classroom->max_members,
                'members_count' => $classroom->members()->count(),
                'teacher' => $classroom->teacher()->select('id', 'name')->first(),
            ] : null,
            'games' => $classroom ? $classroom->games->map(fn ($game): array => [
                'game_key' => $game->game_key,
                'question_count' => (int) $game->questions_count,
                'max_plays' => $game->max_plays,
            ])->values()->all() : [],
            'usage' => $classroom && $member !== null ? app(ClassroomPlayLimit::class)->usage($classroom, $request->user()) : [],
            'member' => $member ? [
                'id' => $member->id,
                'joined_at' => $member->joined_at?->toIso8601String(),
                'left_at' => $member->left_at?->toIso8601String(),
                'removed' => $member->left_at !== null,
                'current_game' => $member->current_game,
            ] : null,
            'world' => $isActiveMember ? $this->world($classroom, $request) : null,
            'announcement' => $isActiveMember ? app(ClassroomAnnouncer::class)->current($classroom)?->toStudentPayload() : null,
        ]);
    }

    public function join(string $pin, Request $request): RedirectResponse
    {
        $classroom = Classroom::query()
            ->where('pin', $pin)
            ->where('starts_at', '<=', now())
            ->where('ends_at', '>', now())
            ->firstOrFail();

        if ($classroom->members()->count() >= $classroom->max_members) {
            return back()->withErrors(['full' => __('classrooms.full')]);
        }

        if ($classroom->teacher_id === $request->user()->id) {
            return back()->withErrors(['own' => __('classrooms.cannot_join_own')]);
        }

        $existing = $classroom->members()->where('user_id', $request->user()->id)->first();

        if ($existing !== null) {
            if ($existing->left_at === null) {
                return back()->withErrors(['already' => __('classrooms.already_joined')]);
            }

            $existing->update(['left_at' => null, 'joined_at' => now()]);
        } else {
            $classroom->members()->create([
                'user_id' => $request->user()->id,
                'joined_at' => now(),
            ]);
        }

        return redirect()->route('classrooms.show', ['pin' => $pin]);
    }

    public function leave(string $pin, Request $request): RedirectResponse
    {
        $classroom = Classroom::query()->where('pin', $pin)->latest('starts_at')->firstOrFail();

        $member = $classroom->members()
            ->where('user_id', $request->user()->id)
            ->whereNull('left_at')
            ->firstOrFail();

        $member->update(['left_at' => now()]);

        $this->kicker->kick($classroom->id, (int) $request->user()->id);

        return back()->with('success', __('classrooms.left'));
    }

    /**
     * World props for an active member: socket URL, endpoints, HUD and own look.
     *
     * @return array{ws_url: string, token_url: string, hud_url: string, hud: array<string, mixed>, me: array{id: int, name: string, character: array<string, mixed>}, teacher: array{id: int, name: string, character: array<string, mixed>}|null, role: 'student'|'teacher'}
     */
    private function world(Classroom $classroom, Request $request): array
    {
        return ClassroomWorldController::worldProps(
            $classroom,
            $request->user(),
            'student',
            route('classrooms.world-token', ['pin' => $classroom->pin]),
            route('classrooms.hud', ['pin' => $classroom->pin]),
            $this->hud->forMember($classroom, $request->user()),
        );
    }
}
