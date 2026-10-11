<?php

namespace App\Http\Controllers;

use App\Models\Classroom;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class ClassroomJoinController extends Controller
{
    /**
     * Show the classroom join page for a PIN.
     */
    public function show(string $pin, Request $request): Response
    {
        $query = Classroom::query()
            ->where('pin', $pin)
            ->where('starts_at', '<=', now());

        $classroom = $query->first();
        $member = null;

        if ($classroom !== null && $classroom->ends_at <= now()) {
            $classroom = null;
        }

        if ($classroom !== null) {
            $member = $classroom->members()
                ->where('user_id', $request->user()->id)
                ->first();
        }

        return Inertia::render('portal/classroom', [
            'pin' => $pin,
            'classroom' => $classroom ? [
                'id' => $classroom->id,
                'name' => $classroom->name,
                'description' => $classroom->description,
                'pin' => $classroom->pin,
                'starts_at' => $classroom->starts_at?->toIso8601String(),
                'ends_at' => $classroom->ends_at?->toIso8601String(),
                'games' => $classroom->gameKeys(),
                'max_members' => $classroom->max_members,
                'members_count' => $classroom->members()->count(),
                'teacher' => $classroom->teacher()->select('id', 'name')->first(),
            ] : null,
            'member' => $member ? [
                'id' => $member->id,
                'joined_at' => $member->joined_at?->toIso8601String(),
                'left_at' => $member->left_at?->toIso8601String(),
                'current_game' => $member->current_game,
            ] : null,
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

        return redirect()->route('portal');
    }

    public function leave(string $pin, Request $request): RedirectResponse
    {
        $classroom = Classroom::query()->where('pin', $pin)->firstOrFail();

        $member = $classroom->members()
            ->where('user_id', $request->user()->id)
            ->whereNull('left_at')
            ->firstOrFail();

        $member->update(['left_at' => now()]);

        return back()->with('success', __('classrooms.left'));
    }
}
