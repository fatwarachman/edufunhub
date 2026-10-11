<?php

namespace App\Services\Classrooms;

use App\Models\Classroom;
use App\Models\ClassroomMember;
use App\Models\Question;
use Illuminate\Support\Facades\DB;

class ClassroomReport
{
    /**
     * Full classroom report aggregated from game results.
     *
     * @return array<string, mixed>
     */
    public function forClassroom(Classroom $classroom): array
    {
        $historiesSummary = DB::table('game_histories')
            ->where('classroom_id', $classroom->id)
            ->selectRaw('
                COUNT(*) as total_plays,
                COUNT(DISTINCT user_id) as players,
                COALESCE(SUM(correct), 0) as total_correct,
                COALESCE(SUM(wrong), 0) as total_wrong,
                COALESCE(SUM(correct) + SUM(wrong), 0) as total_answered,
                COALESCE(SUM(points), 0) as total_points
            ')
            ->first();

        $totalAnswered = (int) $historiesSummary->total_answered;
        $totalCorrect = (int) $historiesSummary->total_correct;
        $accuracy = $totalAnswered > 0 ? round($totalCorrect / $totalAnswered * 100, 1) : null;

        $gamesHistories = DB::table('game_histories')
            ->where('classroom_id', $classroom->id)
            ->selectRaw('
                game_key,
                COUNT(*) as plays,
                COUNT(DISTINCT user_id) as players,
                COALESCE(SUM(correct), 0) as correct,
                COALESCE(SUM(wrong), 0) as wrong,
                COALESCE(SUM(correct) + SUM(wrong), 0) as answered
            ')
            ->groupBy('game_key')
            ->get();

        $games = $gamesHistories->map(fn ($row): array => [
            'game_key' => $row->game_key,
            'plays' => (int) $row->plays,
            'players' => (int) $row->players,
            'answered' => (int) $row->answered,
            'correct' => (int) $row->correct,
            'accuracy' => $row->answered > 0 ? round($row->correct / $row->answered * 100, 1) : null,
        ])->values()->all();

        $answersBySubject = DB::table('question_answers')
            ->join('game_histories', 'question_answers.game_history_id', '=', 'game_histories.id')
            ->join('questions', 'question_answers.question_id', '=', 'questions.id')
            ->where('game_histories.classroom_id', $classroom->id)
            ->selectRaw('
                questions.subject,
                COUNT(*) as answered,
                COALESCE(SUM(CASE WHEN question_answers.correct = 1 THEN 1 ELSE 0 END), 0) as correct
            ')
            ->groupBy('questions.subject')
            ->get();

        $subjects = $answersBySubject->map(fn ($row): array => [
            'key' => $row->subject,
            'answered' => (int) $row->answered,
            'correct' => (int) $row->correct,
            'accuracy' => $row->answered > 0 ? round($row->correct / $row->answered * 100, 1) : null,
        ])->values()->all();

        $answersByTopic = DB::table('question_answers')
            ->join('game_histories', 'question_answers.game_history_id', '=', 'game_histories.id')
            ->join('questions', 'question_answers.question_id', '=', 'questions.id')
            ->leftJoin('subject_topics', 'questions.topic_id', '=', 'subject_topics.id')
            ->where('game_histories.classroom_id', $classroom->id)
            ->whereNotNull('questions.topic_id')
            ->selectRaw('
                questions.topic_id,
                questions.subject,
                subject_topics.name_id,
                subject_topics.name_en,
                COUNT(*) as answered,
                COALESCE(SUM(CASE WHEN question_answers.correct = 1 THEN 1 ELSE 0 END), 0) as correct
            ')
            ->groupBy('questions.topic_id', 'questions.subject', 'subject_topics.name_id', 'subject_topics.name_en')
            ->get();

        $topics = $answersByTopic->map(fn ($row): array => [
            'id' => (int) $row->topic_id,
            'name_id' => $row->name_id,
            'name_en' => $row->name_en,
            'subject_key' => $row->subject,
            'answered' => (int) $row->answered,
            'correct' => (int) $row->correct,
            'accuracy' => $row->answered > 0 ? round($row->correct / $row->answered * 100, 1) : null,
        ])->values()->all();

        $difficultQuestions = DB::table('question_answers')
            ->join('game_histories', 'question_answers.game_history_id', '=', 'game_histories.id')
            ->join('questions', 'question_answers.question_id', '=', 'questions.id')
            ->leftJoin('subject_topics', 'questions.topic_id', '=', 'subject_topics.id')
            ->where('game_histories.classroom_id', $classroom->id)
            ->selectRaw('
                questions.id,
                questions.prompt_id,
                questions.prompt_en,
                questions.subject,
                questions.topic_id,
                questions.level,
                questions.options,
                COUNT(*) as answered,
                COALESCE(SUM(CASE WHEN question_answers.correct = 1 THEN 1 ELSE 0 END), 0) as correct,
                MAX(subject_topics.name_id) as topic_name_id,
                MAX(subject_topics.name_en) as topic_name_en
            ')
            ->groupBy('questions.id', 'questions.prompt_id', 'questions.prompt_en', 'questions.subject', 'questions.topic_id', 'questions.level', 'questions.options')
            ->get()
            ->filter(fn ($row): bool => (int) $row->answered >= 3)
            ->sortBy(fn ($row): float => (int) $row->answered > 0 ? (int) $row->correct / (int) $row->answered : 1)
            ->take(50)
            ->map(function ($row): array {
                $answered = (int) $row->answered;
                $correct = (int) $row->correct;
                $acc = $answered > 0 ? round($correct / $answered * 100, 1) : null;
                $options = is_string($row->options) ? json_decode($row->options, true) : ($row->options ?? []);

                $wrongAnswers = DB::table('question_answers')
                    ->where('question_id', $row->id)
                    ->whereIn('game_history_id', function ($q) use ($classroom): void {
                        $q->select('id')->from('game_histories')->where('classroom_id', $classroom->id);
                    })
                    ->where('correct', 0)
                    ->selectRaw('choice, COUNT(*) as cnt')
                    ->groupBy('choice')
                    ->orderByDesc('cnt')
                    ->limit(5)
                    ->get();

                $topWrong = $wrongAnswers->map(fn ($wa): array => [
                    'index' => (int) $wa->choice,
                    'text' => $options[(int) $wa->choice]['id'] ?? '',
                    'count' => (int) $wa->cnt,
                ])->filter(fn (array $tw): bool => $tw['text'] !== '')->values()->all();

                $diff = $acc !== null
                    ? ($acc >= 70 ? 'easy' : ($acc >= 40 ? 'medium' : 'hard'))
                    : null;

                return [
                    'id' => (int) $row->id,
                    'prompt_id' => $row->prompt_id,
                    'prompt_en' => $row->prompt_en,
                    'subject' => $row->subject,
                    'topic_id' => (int) $row->topic_id,
                    'topic' => $row->topic_id ? ['id' => (int) $row->topic_id, 'name_id' => $row->topic_name_id, 'name_en' => $row->topic_name_en] : null,
                    'level' => Question::normalizeLevel($row->level),
                    'answered' => $answered,
                    'correct' => $correct,
                    'accuracy' => $acc,
                    'difficulty' => $diff,
                    'top_wrong' => $topWrong,
                ];
            })->values()->all();

        $students = DB::table('game_histories')
            ->where('classroom_id', $classroom->id)
            ->selectRaw('
                user_id,
                COUNT(*) as plays,
                COALESCE(SUM(correct), 0) as correct,
                COALESCE(SUM(wrong), 0) as wrong,
                COALESCE(SUM(correct) + SUM(wrong), 0) as answered,
                COALESCE(SUM(points), 0) as points
            ')
            ->groupBy('user_id')
            ->get();

        $studentList = $classroom->members()
            ->whereNull('left_at')
            ->with('user.playerProfile')
            ->get()
            ->map(function ($member) use ($students): array {
                $stats = $students->firstWhere('user_id', $member->user_id);
                $answered = (int) ($stats->answered ?? 0);
                $correct = (int) ($stats->correct ?? 0);
                $acc = $answered > 0 ? round($correct / $answered * 100, 1) : null;

                $mastery = $answered < 3 ? 'no_data'
                    : ($acc >= 85 ? 'excellent' : ($acc >= 70 ? 'good' : ($acc >= 50 ? 'fair' : 'needs_help')));

                return [
                    'member_id' => $member->id,
                    'user_id' => $member->user_id,
                    'name' => $member->user->playerProfile?->nickname ?? $member->user->name,
                    'plays' => (int) ($stats->plays ?? 0),
                    'answered' => $answered,
                    'correct' => $correct,
                    'accuracy' => $acc,
                    'points' => (int) ($stats->points ?? 0),
                    'mastery' => $mastery,
                    'strengths' => [],
                    'weaknesses' => [],
                    'ai_feedback' => $member->ai_feedback,
                    'shared_at' => $member->report_shared_at?->toIso8601String(),
                ];
            })->values();

        $insights = $this->generateInsights(collect($difficultQuestions)->take(1), $topics, $subjects, $studentList, $classroom);

        return [
            'summary' => [
                'members' => (int) $historiesSummary->players,
                'played_members' => $students->count(),
                'plays' => (int) $historiesSummary->total_plays,
                'answered' => $totalAnswered,
                'correct' => $totalCorrect,
                'wrong' => (int) $historiesSummary->total_wrong,
                'accuracy' => $accuracy,
                'points' => (int) $historiesSummary->total_points,
            ],
            'games' => $games,
            'subjects' => $subjects,
            'topics' => $topics,
            'questions' => $difficultQuestions,
            'students' => $studentList,
            'insights' => $insights,
        ];
    }

    /**
     * Report for a specific student from their membership.
     *
     * @return array<string, mixed>
     */
    public function forStudent(ClassroomMember $member): array
    {
        $classroom = $member->classroom;
        $userId = $member->user_id;

        $classSummary = DB::table('game_histories')
            ->where('classroom_id', $classroom->id)
            ->selectRaw('
                COUNT(*) as total_plays,
                COALESCE(SUM(correct), 0) as total_correct,
                COALESCE(SUM(wrong), 0) as total_wrong,
                COALESCE(SUM(correct) + SUM(wrong), 0) as total_answered
            ')
            ->first();

        $studentStats = DB::table('game_histories')
            ->where('classroom_id', $classroom->id)
            ->where('user_id', $userId)
            ->selectRaw('
                COUNT(*) as plays,
                COALESCE(SUM(correct), 0) as correct,
                COALESCE(SUM(wrong), 0) as wrong,
                COALESCE(SUM(correct) + SUM(wrong), 0) as answered,
                COALESCE(SUM(points), 0) as points
            ')
            ->first();

        $answered = (int) ($studentStats->answered ?? 0);
        $correct = (int) ($studentStats->correct ?? 0);
        $acc = $answered > 0 ? round($correct / $answered * 100, 1) : null;
        $classAcc = (int) $classSummary->total_answered > 0
            ? round((int) $classSummary->total_correct / (int) $classSummary->total_answered * 100, 1)
            : null;

        $mastery = $answered < 3 ? 'no_data'
            : ($acc >= 85 ? 'excellent' : ($acc >= 70 ? 'good' : ($acc >= 50 ? 'fair' : 'needs_help')));

        $gamesBreakdown = DB::table('game_histories')
            ->where('classroom_id', $classroom->id)
            ->where('user_id', $userId)
            ->selectRaw('game_key, COUNT(*) as plays, COALESCE(SUM(correct), 0) as correct, COALESCE(SUM(wrong), 0) as wrong')
            ->groupBy('game_key')
            ->get()
            ->map(fn ($row): array => [
                'game_key' => $row->game_key,
                'plays' => (int) $row->plays,
                'correct' => (int) $row->correct,
                'wrong' => (int) $row->wrong,
            ])->values()->all();

        $subjectAnswers = DB::table('question_answers')
            ->join('game_histories', 'question_answers.game_history_id', '=', 'game_histories.id')
            ->join('questions', 'question_answers.question_id', '=', 'questions.id')
            ->where('game_histories.classroom_id', $classroom->id)
            ->where('game_histories.user_id', $userId)
            ->selectRaw('questions.subject, COUNT(*) as answered, COALESCE(SUM(CASE WHEN question_answers.correct = 1 THEN 1 ELSE 0 END), 0) as correct')
            ->groupBy('questions.subject')
            ->get();

        $subjectBreakdown = $subjectAnswers->map(fn ($row): array => [
            'key' => $row->subject,
            'answered' => (int) $row->answered,
            'correct' => (int) $row->correct,
            'accuracy' => $row->answered > 0 ? round($row->correct / $row->answered * 100, 1) : null,
        ])->values()->all();

        $topicAnswers = DB::table('question_answers')
            ->join('game_histories', 'question_answers.game_history_id', '=', 'game_histories.id')
            ->join('questions', 'question_answers.question_id', '=', 'questions.id')
            ->leftJoin('subject_topics', 'questions.topic_id', '=', 'subject_topics.id')
            ->where('game_histories.classroom_id', $classroom->id)
            ->where('game_histories.user_id', $userId)
            ->whereNotNull('questions.topic_id')
            ->selectRaw('questions.topic_id, questions.subject, subject_topics.name_id, subject_topics.name_en, COUNT(*) as answered, COALESCE(SUM(CASE WHEN question_answers.correct = 1 THEN 1 ELSE 0 END), 0) as correct')
            ->groupBy('questions.topic_id', 'questions.subject', 'subject_topics.name_id', 'subject_topics.name_en')
            ->get();

        $topicBreakdown = $topicAnswers->map(fn ($row): array => [
            'id' => (int) $row->topic_id,
            'name_id' => $row->name_id,
            'name_en' => $row->name_en,
            'subject_key' => $row->subject,
            'answered' => (int) $row->answered,
            'correct' => (int) $row->correct,
            'accuracy' => $row->answered > 0 ? round($row->correct / $row->answered * 100, 1) : null,
        ])->values()->all();

        $wrongForReview = DB::table('question_answers')
            ->join('game_histories', 'question_answers.game_history_id', '=', 'game_histories.id')
            ->join('questions', 'question_answers.question_id', '=', 'questions.id')
            ->where('game_histories.classroom_id', $classroom->id)
            ->where('game_histories.user_id', $userId)
            ->where('question_answers.correct', 0)
            ->selectRaw('DISTINCT questions.id, questions.prompt_id, questions.prompt_en, questions.answer, questions.options, questions.subject')
            ->limit(15)
            ->get()
            ->map(function ($row): array {
                $options = is_string($row->options) ? json_decode($row->options, true) : ($row->options ?? []);

                return [
                    'id' => (int) $row->id,
                    'prompt_id' => $row->prompt_id,
                    'prompt_en' => $row->prompt_en,
                    'subject' => $row->subject,
                    'correct_answer' => $options[(int) $row->answer]['id'] ?? '',
                ];
            })->values()->all();

        return [
            'classroom' => $classroom->only(['id', 'name', 'pin']),
            'student' => [
                'plays' => (int) ($studentStats->plays ?? 0),
                'answered' => $answered,
                'correct' => $correct,
                'accuracy' => $acc,
                'points' => (int) ($studentStats->points ?? 0),
                'class_accuracy' => $classAcc,
                'mastery' => $mastery,
            ],
            'games' => $gamesBreakdown,
            'subjects' => $subjectBreakdown,
            'topics' => $topicBreakdown,
            'review' => $wrongForReview,
            'teacher_note' => null,
            'ai_feedback' => $member->ai_feedback,
            'shared_at' => $member->report_shared_at?->toIso8601String(),
        ];
    }

    /** @return list<array{key: string, params: array<string, mixed>}> */
    private function generateInsights($difficultQuestions, $topics, $subjects, $students, Classroom $classroom): array
    {
        $insights = [];

        $hardest = $difficultQuestions->first();
        if ($hardest !== null) {
            $insights[] = [
                'key' => 'hardest_question',
                'params' => [
                    'prompt' => $hardest->prompt_id,
                    'accuracy' => $hardest->answered > 0 ? round($hardest->correct / $hardest->answered * 100, 1) : null,
                ],
            ];
        }

        $weakestTopic = collect($topics)->filter(fn ($t): bool => ($t['answered'] ?? 0) >= 3)
            ->sortBy('accuracy')->first();
        if ($weakestTopic !== null) {
            $insights[] = ['key' => 'weak_topic', 'params' => ['topic' => $weakestTopic['name_id'], 'accuracy' => $weakestTopic['accuracy']]];
        }

        $strongest = collect($subjects)->sortByDesc('accuracy')->first();
        if ($strongest !== null && ($strongest['accuracy'] ?? 0) >= 70) {
            $insights[] = ['key' => 'strong_subject', 'params' => ['subject' => $strongest['key'], 'accuracy' => $strongest['accuracy']]];
        }

        $topStudent = collect($students)->filter(fn ($s): bool => ($s['plays'] ?? 0) >= 1)->sortByDesc('accuracy')->first();
        if ($topStudent !== null) {
            $insights[] = ['key' => 'top_student', 'params' => ['name' => $topStudent['name'], 'accuracy' => $topStudent['accuracy']]];
        }

        $inactive = collect($students)->filter(fn ($s): bool => ($s['plays'] ?? 0) === 0)->count();
        if ($inactive > 0) {
            $insights[] = ['key' => 'inactive_members', 'params' => ['count' => $inactive]];
        }

        $needsHelp = collect($students)->filter(fn ($s): bool => $s['mastery'] === 'needs_help')->count();
        if ($needsHelp > 0) {
            $insights[] = ['key' => 'needs_help', 'params' => ['count' => $needsHelp]];
        }

        return $insights;
    }
}
