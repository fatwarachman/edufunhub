<?php

namespace App\Services\Classrooms;

use App\Models\Classroom;
use App\Models\ClassroomMember;
use App\Models\Question;
use App\Models\User;
use App\Services\Ai\ClassroomAiText;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * A student's own view of the classrooms they joined: the list with their
 * score per class and, per membership, games, questions and self analysis.
 *
 * Answer keys and explanations are only revealed after the classroom ended,
 * so an ongoing class cannot be used to look up the right answers.
 */
class StudentClassroomProgress
{
    /** Recent plays shown on the detail page. */
    public const RECENT_PLAYS = 30;

    public function __construct(private ClassroomReport $reports) {}

    /**
     * Every classroom the user joined, newest first, with their own totals.
     *
     * @return list<array{member_id: int, classroom: array{id: int, name: string, pin: string, status: string, starts_at: ?string, ends_at: ?string, teacher_name: string, games: list<string>}, joined_at: ?string, left: bool, report_shared: bool, totals: array{plays: int, answered: int, correct: int, wrong: int, accuracy: ?float, points: int, rank: ?int, members: int}, mastery: string}>
     */
    public function list(User $user): array
    {
        $members = $user->classroomMembers()
            ->with(['classroom.teacher.playerProfile', 'classroom.games'])
            ->whereHas('classroom')
            ->latest('joined_at')
            ->latest('id')
            ->get();

        if ($members->isEmpty()) {
            return [];
        }

        $classroomIds = $members->pluck('classroom_id')->unique()->values()->all();

        /** @var Collection<int, Collection<int, object>> $pointsByClass */
        $pointsByClass = DB::table('game_histories')
            ->whereIn('classroom_id', $classroomIds)
            ->selectRaw('classroom_id, user_id, COUNT(*) as plays, COALESCE(SUM(correct), 0) as correct, COALESCE(SUM(wrong), 0) as wrong, COALESCE(SUM(points), 0) as points')
            ->groupBy('classroom_id', 'user_id')
            ->get()
            ->groupBy('classroom_id');

        $activeMembers = ClassroomMember::query()
            ->whereIn('classroom_id', $classroomIds)
            ->whereNull('left_at')
            ->selectRaw('classroom_id, COUNT(*) as total')
            ->groupBy('classroom_id')
            ->pluck('total', 'classroom_id');

        return $members->map(function (ClassroomMember $member) use ($user, $pointsByClass, $activeMembers): array {
            $classroom = $member->classroom;
            $rows = $pointsByClass->get($classroom->id, collect());
            $mine = $rows->firstWhere('user_id', $user->id);
            $points = (int) ($mine->points ?? 0);
            $plays = (int) ($mine->plays ?? 0);
            $totals = $this->totals($plays, (int) ($mine->correct ?? 0), (int) ($mine->wrong ?? 0), $points);
            $totals['rank'] = $plays > 0 ? $rows->filter(fn (object $row): bool => (int) $row->points > $points)->count() + 1 : null;
            $totals['members'] = (int) ($activeMembers[$classroom->id] ?? 0);

            return [
                'member_id' => $member->id,
                'classroom' => $this->classroomCard($classroom),
                'joined_at' => $member->joined_at?->toIso8601String(),
                'left' => $member->left_at !== null,
                'report_shared' => $member->report_shared_at !== null,
                'totals' => $totals,
                'mastery' => $this->mastery($totals['answered'], $totals['accuracy']),
            ];
        })->values()->all();
    }

    /**
     * Detail for one membership: summary, games, recent plays, questions and
     * analysis. The caller must have checked ownership.
     *
     * @return array<string, mixed>
     */
    public function detail(ClassroomMember $member): array
    {
        $classroom = $member->classroom->loadMissing(['teacher.playerProfile', 'games']);
        $report = $this->reports->forStudent($member);
        $ended = $classroom->status() === Classroom::STATUS_ENDED;
        $shared = $member->report_shared_at !== null;

        $sharedReport = is_array($member->report) ? $member->report : [];
        $feedback = $shared ? ($sharedReport['ai_feedback'] ?? $member->ai_feedback) : null;
        $sections = is_array($feedback)
            ? ClassroomAiText::sections($feedback, ClassroomAiText::STUDENT_SECTIONS)
            : ClassroomAiText::decode(is_string($feedback) ? $feedback : null, ClassroomAiText::STUDENT_SECTIONS, 'strengths');

        return [
            'member_id' => $member->id,
            'classroom' => [
                ...$this->classroomCard($classroom),
                'description' => $classroom->description,
            ],
            'joined_at' => $member->joined_at?->toIso8601String(),
            'left' => $member->left_at !== null,
            'answers_revealed' => $ended,
            'report_shared' => $shared,
            'report_url' => $shared ? route('classrooms.report', ['member' => $member->id]) : null,
            'totals' => $report['totals'],
            'class_accuracy' => $report['class_accuracy'],
            'mastery' => $report['mastery'],
            'games' => $this->withPlayLimits($report['games'], $classroom),
            'play_limits' => $classroom->games->pluck('max_plays', 'game_key')->all(),
            'subjects' => $report['subjects'],
            'topics' => $report['topics'],
            'review' => $ended
                ? $report['review']
                : array_map(fn (array $row): array => [...$row, 'correct_text' => null], $report['review']),
            'recent_plays' => $this->recentPlays($member),
            'questions' => $this->questions($member, $ended),
            'teacher_note' => $shared && is_string($sharedReport['teacher_note'] ?? null) ? $sharedReport['teacher_note'] : null,
            'ai_feedback' => $sections === null || ClassroomAiText::isEmpty($sections) ? null : $sections,
        ];
    }

    /**
     * Add the classroom play limit of each game (null = unlimited) to the
     * per-game breakdown.
     *
     * @param  iterable<array<string, mixed>>  $games
     * @return list<array<string, mixed>>
     */
    private function withPlayLimits(iterable $games, Classroom $classroom): array
    {
        $limits = $classroom->games->pluck('max_plays', 'game_key');

        return collect($games)
            ->map(fn (array $game): array => [...$game, 'max_plays' => $limits->get($game['game_key'])])
            ->values()
            ->all();
    }

    /**
     * @return array{id: int, name: string, pin: string, status: string, starts_at: ?string, ends_at: ?string, teacher_name: string, games: list<string>}
     */
    private function classroomCard(Classroom $classroom): array
    {
        return [
            'id' => $classroom->id,
            'name' => $classroom->name,
            'pin' => $classroom->pin,
            'status' => $classroom->status(),
            'starts_at' => $classroom->starts_at?->toIso8601String(),
            'ends_at' => $classroom->ends_at?->toIso8601String(),
            'teacher_name' => (string) ($classroom->teacher?->playerProfile?->nickname ?: ($classroom->teacher?->name ?? '')),
            'games' => $classroom->gameKeys(),
        ];
    }

    /**
     * @return array{plays: int, answered: int, correct: int, wrong: int, accuracy: ?float, points: int}
     */
    private function totals(int $plays, int $correct, int $wrong, int $points): array
    {
        $answered = $correct + $wrong;

        return [
            'plays' => $plays,
            'answered' => $answered,
            'correct' => $correct,
            'wrong' => $wrong,
            'accuracy' => $answered > 0 ? round($correct / $answered * 100, 1) : null,
            'points' => $points,
        ];
    }

    private function mastery(int $answered, ?float $accuracy): string
    {
        return $answered < 3 || $accuracy === null ? 'no_data'
            : ($accuracy >= 85 ? 'excellent' : ($accuracy >= 70 ? 'good' : ($accuracy >= 50 ? 'fair' : 'needs_help')));
    }

    /**
     * @return list<array{id: int, game_key: string, points: int, correct: int, wrong: int, duration_seconds: int, played_at: ?string}>
     */
    private function recentPlays(ClassroomMember $member): array
    {
        return DB::table('game_histories')
            ->where('classroom_id', $member->classroom_id)
            ->where('user_id', $member->user_id)
            ->orderByDesc('played_at')
            ->orderByDesc('id')
            ->limit(self::RECENT_PLAYS)
            ->get(['id', 'game_key', 'points', 'correct', 'wrong', 'duration_seconds', 'played_at'])
            ->map(fn (object $row): array => [
                'id' => (int) $row->id,
                'game_key' => (string) $row->game_key,
                'points' => (int) $row->points,
                'correct' => (int) $row->correct,
                'wrong' => (int) $row->wrong,
                'duration_seconds' => (int) ($row->duration_seconds ?? 0),
                'played_at' => $row->played_at ? Carbon::parse($row->played_at)->toIso8601String() : null,
            ])->values()->all();
    }

    /**
     * Questions of the classroom: the teacher's picked questions plus any bank
     * question the student answered here. While the class runs only answered
     * questions are listed and no answer key is sent.
     *
     * @return array{total: int, answered: int, hidden: int, items: list<array<string, mixed>>}
     */
    private function questions(ClassroomMember $member, bool $revealed): array
    {
        $classroom = $member->classroom;

        /** @var Collection<int, list<string>> $pickedGames */
        $pickedGames = DB::table('classroom_game_questions')
            ->join('classroom_games', 'classroom_game_questions.classroom_game_id', '=', 'classroom_games.id')
            ->where('classroom_games.classroom_id', $classroom->id)
            ->get(['classroom_game_questions.question_id', 'classroom_games.game_key'])
            ->groupBy('question_id')
            ->map(fn (Collection $rows): array => $rows->pluck('game_key')->unique()->values()->all());

        $mine = DB::table('question_answers')
            ->join('game_histories', 'question_answers.game_history_id', '=', 'game_histories.id')
            ->where('game_histories.classroom_id', $classroom->id)
            ->where('game_histories.user_id', $member->user_id)
            ->selectRaw('question_answers.question_id, COUNT(*) as answered, COALESCE(SUM(CASE WHEN question_answers.correct = 1 THEN 1 ELSE 0 END), 0) as correct, MAX(question_answers.id) as last_id')
            ->groupBy('question_answers.question_id')
            ->get()
            ->keyBy('question_id');

        $lastAnswers = DB::table('question_answers')
            ->whereIn('id', $mine->pluck('last_id')->all())
            ->get(['question_id', 'correct', 'choice'])
            ->keyBy('question_id');

        $ids = $pickedGames->keys()->merge($mine->keys())->map(fn ($id): int => (int) $id)->unique()->values();
        $total = $ids->count();
        $visibleIds = $revealed ? $ids : $ids->filter(fn (int $id): bool => $mine->has($id))->values();

        $items = Question::query()
            ->whereIn('id', $visibleIds->all())
            ->with('topic')
            ->get()
            ->map(function (Question $question) use ($mine, $lastAnswers, $pickedGames, $revealed): array {
                $stats = $mine->get($question->id);
                $last = $lastAnswers->get($question->id);
                $answered = (int) ($stats->answered ?? 0);

                return [
                    'id' => $question->id,
                    'type' => $question->type,
                    'subject' => $question->subject,
                    'topic' => $question->topic ? ['name_id' => $question->topic->name_id, 'name_en' => $question->topic->name_en] : null,
                    'level' => Question::normalizeLevel($question->level),
                    'prompt_id' => (string) $question->prompt_id,
                    'prompt_en' => $question->prompt_en,
                    'options' => $question->type === Question::TYPE_CHOICE
                        ? collect($question->options ?? [])->map(fn (array $option): array => ['id' => (string) ($option['id'] ?? ''), 'en' => $option['en'] ?? null])->values()->all()
                        : [],
                    'games' => $pickedGames->get($question->id, []),
                    'mine' => [
                        'answered' => $answered,
                        'correct' => (int) ($stats->correct ?? 0),
                        'wrong' => $answered - (int) ($stats->correct ?? 0),
                        'last_correct' => $last !== null ? (bool) $last->correct : null,
                        'last_choice' => $last?->choice !== null ? (int) $last->choice : null,
                    ],
                    'answer' => $revealed ? (int) $question->answer : null,
                    'hint_id' => $revealed ? $question->hint_id : null,
                    'hint_en' => $revealed ? $question->hint_en : null,
                ];
            })
            ->sortBy([
                fn (array $a, array $b): int => ($a['mine']['answered'] === 0) <=> ($b['mine']['answered'] === 0),
                fn (array $a, array $b): int => $b['mine']['wrong'] <=> $a['mine']['wrong'],
                fn (array $a, array $b): int => $a['id'] <=> $b['id'],
            ])
            ->values()
            ->all();

        return [
            'total' => $total,
            'answered' => $mine->count(),
            'hidden' => $total - count($items),
            'items' => $items,
        ];
    }
}
