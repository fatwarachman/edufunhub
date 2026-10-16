<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Classroom;
use App\Models\ClassroomGame;
use App\Models\Question;
use App\Models\Subject;
use App\Services\GameServiceSigner;
use App\Services\PointRules;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Signed internal endpoint the Go game service polls to load the active bank
 * and the setup (subjects, picked questions) of every open classroom game.
 */
class QuestionBankController extends Controller
{
    public function __invoke(Request $request, GameServiceSigner $signer): JsonResponse
    {
        abort_unless($signer->verifyRequest(
            (string) $request->header('X-Game-Timestamp'),
            (string) $request->header('X-Game-Signature'),
            '',
        ), 403);

        $questions = Question::query()->active()->orderBy('id')->get();
        $rules = PointRules::current();
        $subjects = Subject::activeKeys();

        $classrooms = Classroom::query()
            ->where('ends_at', '>', now())
            ->whereHas('games')
            ->with(['games' => fn ($q) => $q->with('questions'), 'members' => fn ($q) => $q->whereNull('left_at')])
            ->get();

        $classroomsPayload = $classrooms->map(fn (Classroom $c): array => [
            'id' => $c->id,
            'teacher_id' => $c->teacher_id,
            'pin' => $c->pin,
            'name' => $c->name,
            'starts_at' => $c->starts_at->utc()->toIso8601String(),
            'ends_at' => $c->ends_at->utc()->toIso8601String(),
            'max_members' => $c->max_members,
            'members' => $c->members->map(fn ($m): array => ['user_id' => $m->user_id])->values(),
            'games' => $c->games->map(fn (ClassroomGame $cg): array => [
                'game_key' => $cg->game_key,
                'subjects' => $cg->playSubjects(),
                'questions' => $cg->questions->map(fn (Question $q): array => $q->toGamePayload())->values(),
            ])->values(),
        ])->values()->all();

        $classroomsUpdatedAt = $classrooms->isNotEmpty()
            ? $classrooms->max(fn (Classroom $c) => max(
                $c->updated_at->timestamp,
                ...$c->games->pluck('updated_at')->map->timestamp->all(),
                ...$c->games->flatMap->questions->pluck('updated_at')->map->timestamp->all(),
            ))
            : 0;

        $version = sha1(
            $questions->max('updated_at').'|'.$questions->count().'|'.$questions->pluck('id')->implode(',')
            .'|'.implode(',', $rules).'|'.implode(',', $subjects)
            .'|'.$classrooms->count().'|'.$classroomsUpdatedAt
            .'|'.sha1((string) json_encode($classroomsPayload))
        );

        return response()->json([
            'version' => $version,
            'points' => $rules,
            'subjects' => $subjects,
            'questions' => $questions->map(fn (Question $question): array => $question->toGamePayload())->values(),
            'classrooms' => $classroomsPayload,
        ]);
    }
}
