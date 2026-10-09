<?php

namespace App\Http\Controllers;

use App\Models\PlayerProfile;
use App\Models\Question;
use App\Models\SnakeRoom;
use App\Models\Subject;
use App\Services\GameServiceSigner;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;

class SnakeGameController extends Controller
{
    public const GAME_KEY = 'snake';

    public function __construct(public GameServiceSigner $signer) {}

    public function show(Request $request): Response
    {
        $pin = $request->query('pin');

        return Inertia::render('games/snake/index', [
            'player' => $this->player($request),
            'pin' => is_string($pin) && preg_match('/^[0-9]{6}$/', $pin) ? $pin : null,
            'points' => (int) $request->user()->pointLedgers()->sum('points'),
            'serviceReady' => $this->signer->isConfigured(),
            'wsUrl' => config('game-service.public_snake_ws_url'),
        ]);
    }

    /**
     * Old arena links now open the single game page (the room PIN joins).
     */
    public function arena(?string $code = null): RedirectResponse
    {
        $pin = is_string($code) && preg_match('/^[0-9]{6}$/', $code) ? $code : null;

        return redirect()->route('games.snake', array_filter(['pin' => $pin]));
    }

    /**
     * The grade picks the question band; players without one still get a
     * token and draw from the lowest band.
     */
    public function token(Request $request): JsonResponse
    {
        abort_unless($this->signer->isConfigured(), 503);

        $player = $this->player($request);

        return response()->json([
            'token' => $this->signer->issueToken($request->user(), self::GAME_KEY, [
                ...$player,
                'grade' => $player['grade'] ?? PlayerProfile::MIN_GRADE,
            ]),
            'expires_in' => (int) config('game-service.token_ttl'),
        ]);
    }

    public function storeRoom(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_unless($user !== null, 401);

        $validated = $request->validate([
            'mode' => ['nullable', 'string', 'in:solo,shared_grid,split_grid'],
            'subject_id' => ['nullable', 'integer', 'exists:subjects,id'],
            'grade_level' => ['nullable', 'string', 'max:20'],
            'max_players' => ['nullable', 'integer', 'min:1', 'max:4'],
        ]);

        $room = DB::transaction(function () use ($user, $validated): SnakeRoom {
            $room = SnakeRoom::create([
                'code' => SnakeRoom::generateUniqueCode(),
                'mode' => $validated['mode'] ?? SnakeRoom::MODE_SHARED_GRID,
                'subject_id' => $validated['subject_id'] ?? null,
                'grade_level' => (string) ($validated['grade_level'] ?? 'SD'),
                'max_players' => (int) ($validated['max_players'] ?? 4),
                'status' => SnakeRoom::STATUS_WAITING,
                'created_by' => $user->id,
            ]);

            $room->players()->create([
                'user_id' => $user->id,
                'score' => 0,
                'tail_length' => 18,
                'is_alive' => true,
            ]);

            return $room;
        });

        return response()->json([
            'room' => $room->load(['players.user', 'subject', 'creator']),
        ], 201);
    }

    public function showRoom(string $code): JsonResponse
    {
        $room = SnakeRoom::query()
            ->where('code', $code)
            ->with(['players.user', 'subject', 'creator'])
            ->firstOrFail();

        return response()->json(['room' => $room]);
    }

    public function joinRoom(Request $request, string $code): JsonResponse
    {
        $user = $request->user();
        abort_unless($user !== null, 401);

        $room = SnakeRoom::query()
            ->where('code', $code)
            ->firstOrFail();

        if ($room->status !== SnakeRoom::STATUS_WAITING) {
            return response()->json([
                'message' => __('snake.room_not_waiting'),
            ], 422);
        }

        $player = $room->players()->where('user_id', $user->id)->first();
        if (! $player) {
            if ($room->players()->count() >= $room->max_players) {
                return response()->json([
                    'message' => __('snake.room_full'),
                ], 422);
            }

            $player = $room->players()->create([
                'user_id' => $user->id,
                'score' => 0,
                'tail_length' => 18,
                'is_alive' => true,
            ]);
        }

        return response()->json([
            'room' => $room->fresh(['players.user', 'subject', 'creator']),
            'player' => $player,
        ]);
    }

    public function questions(Request $request): JsonResponse
    {
        $query = Question::query()
            ->active()
            ->where('type', Question::TYPE_CHOICE)
            ->whereJsonContains('games', self::GAME_KEY);

        $subjectKey = null;
        if ($subject = $request->query('subject')) {
            $subjectKey = $subject;
            $query->where('subject', $subjectKey);
        } elseif ($subjectId = $request->query('subject_id')) {
            $subjectModel = Subject::query()->find($subjectId);
            if ($subjectModel) {
                $subjectKey = $subjectModel->key;
                $query->where('subject', $subjectKey);
            }
        }

        $schoolLevel = strtoupper((string) ($request->query('school_level') ?? $request->query('grade_level') ?? $request->query('level') ?? ''));
        $grade = $request->query('grade');

        if ($schoolLevel === 'SD') {
            $query->whereIn('band', [0, 1]);
        } elseif ($schoolLevel === 'SMP') {
            $query->where('band', 2);
        } elseif (in_array($schoolLevel, ['SMA', 'SMK'], true)) {
            $query->where('band', 3);
        } elseif ($grade !== null && is_numeric($grade)) {
            $query->where('band', Question::bandForGrade((int) $grade));
        }

        $limit = min(max(1, (int) $request->query('limit', 50)), 200);
        $questions = $query->orderBy('id')->limit($limit)->get();

        if ($questions->isEmpty()) {
            $fallback = Question::query()
                ->active()
                ->where('type', Question::TYPE_CHOICE);
            if ($subjectKey !== null) {
                $fallback->where('subject', $subjectKey);
            }
            if ($schoolLevel === 'SD') {
                $fallback->whereIn('band', [0, 1]);
            } elseif ($schoolLevel === 'SMP') {
                $fallback->where('band', 2);
            } elseif (in_array($schoolLevel, ['SMA', 'SMK'], true)) {
                $fallback->where('band', 3);
            } elseif ($grade !== null && is_numeric($grade)) {
                $fallback->where('band', Question::bandForGrade((int) $grade));
            }
            $questions = $fallback->orderBy('id')->limit($limit)->get();
        }

        return response()->json([
            'questions' => $questions->map(fn (Question $q): array => $q->toGamePayload())->values(),
        ]);
    }

    /**
     * @return array{id: int, name: string, grade: ?int, color: string, accessory: string, character: array<string, mixed>}
     */
    private function player(Request $request): array
    {
        $user = $request->user();
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
}
