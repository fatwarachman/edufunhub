<?php

namespace App\Services;

use App\Models\GameHistory;
use App\Models\GameMatchPlayer;
use App\Models\Question;
use App\Models\QuestionAnswer;
use App\Models\SequenceAttempt;
use Illuminate\Support\Collection;

/**
 * Read model for one recorded play shown to admins: score, timing, every
 * answered question with its subject, per-subject and per-level breakdowns,
 * the player's average in that game for comparison and the match seats.
 */
class GamePlayDetail
{
    /**
     * @return array{
     *     play: array<string, mixed>,
     *     summary: array<string, mixed>,
     *     subjects: list<array{subject: string, answered: int, correct: int, wrong: int, accuracy: ?float}>,
     *     levels: list<array{level: int, answered: int, correct: int, accuracy: ?float}>,
     *     questions: list<array<string, mixed>>,
     *     comparison: array<string, mixed>,
     *     match: ?array<string, mixed>,
     *     sequence: list<array<string, mixed>>,
     *     neighbours: array{previous: ?int, next: ?int}
     * }
     */
    public function present(GameHistory $play, MatchHistory $matches): array
    {
        $answers = QuestionAnswer::query()
            ->where('game_history_id', $play->id)
            ->with('question:id,key,subject,type,level,band,prompt_id,prompt_en,options,answer')
            ->orderBy('id')
            ->get();

        return [
            'play' => [
                'id' => $play->id,
                'game_key' => $play->game_key,
                'game_name' => $play->game_name,
                'mission' => $play->mission,
                'grade' => $play->grade,
                'age' => $play->age,
                'school_name' => $play->school_name,
                'points' => $play->points,
                'correct' => $play->correct,
                'wrong' => $play->wrong,
                'accuracy' => $play->accuracy(),
                'duration_seconds' => $play->duration_seconds,
                'played_at' => $play->played_at->toIso8601String(),
                'event_id' => $play->event_id,
            ],
            'summary' => $this->summary($play, $answers),
            'subjects' => $this->subjects($answers),
            'levels' => $this->levels($answers),
            'questions' => $answers->values()->map(fn (QuestionAnswer $answer, int $index): array => $this->question($answer, $index))->all(),
            'comparison' => $this->comparison($play),
            'match' => $this->match($play, $matches),
            'sequence' => SequenceAttempt::query()
                ->where('game_history_id', $play->id)
                ->get(['set_key', 'category', 'attempts', 'solved', 'wrong', 'total_ms'])
                ->map(fn (SequenceAttempt $attempt): array => $attempt->only(['set_key', 'category', 'attempts', 'solved', 'wrong', 'total_ms']))
                ->all(),
            'neighbours' => $this->neighbours($play),
        ];
    }

    /**
     * @param  Collection<int, QuestionAnswer>  $answers
     * @return array<string, mixed>
     */
    private function summary(GameHistory $play, Collection $answers): array
    {
        $answered = (int) $play->correct + (int) $play->wrong;
        $streak = 0;
        $best = 0;
        foreach ($answers as $answer) {
            $streak = $answer->correct ? $streak + 1 : 0;
            $best = max($best, $streak);
        }

        return [
            'answered' => $play->correct === null ? null : $answered,
            'recorded_questions' => $answers->count(),
            'subjects' => $answers->pluck('question.subject')->filter()->unique()->count(),
            'seconds_per_question' => $answered > 0 && $play->duration_seconds ? round($play->duration_seconds / $answered, 1) : null,
            'points_per_minute' => $play->duration_seconds ? round($play->points / max(1, $play->duration_seconds) * 60, 1) : null,
            'best_streak' => $answers->isEmpty() ? null : $best,
            'passed' => $play->accuracy() !== null ? $play->accuracy() >= GameAnalytics::PASS_PERCENT : null,
        ];
    }

    /**
     * @param  Collection<int, QuestionAnswer>  $answers
     * @return list<array{subject: string, answered: int, correct: int, wrong: int, accuracy: ?float}>
     */
    private function subjects(Collection $answers): array
    {
        return $answers
            ->groupBy(fn (QuestionAnswer $answer): string => $answer->question?->subject ?? 'unknown')
            ->map(function (Collection $group, string $subject): array {
                $correct = $group->where('correct', true)->count();

                return [
                    'subject' => $subject,
                    'answered' => $group->count(),
                    'correct' => $correct,
                    'wrong' => $group->count() - $correct,
                    'accuracy' => $this->percent($correct, $group->count()),
                ];
            })
            ->sortByDesc('answered')
            ->values()
            ->all();
    }

    /**
     * @param  Collection<int, QuestionAnswer>  $answers
     * @return list<array{level: int, answered: int, correct: int, accuracy: ?float}>
     */
    private function levels(Collection $answers): array
    {
        return $answers
            ->groupBy(fn (QuestionAnswer $answer): int => Question::normalizeLevel($answer->question?->level))
            ->map(function (Collection $group, int $level): array {
                $correct = $group->where('correct', true)->count();

                return [
                    'level' => $level,
                    'answered' => $group->count(),
                    'correct' => $correct,
                    'accuracy' => $this->percent($correct, $group->count()),
                ];
            })
            ->sortKeys()
            ->values()
            ->all();
    }

    /** @return array<string, mixed> */
    private function question(QuestionAnswer $answer, int $index): array
    {
        $question = $answer->question;
        $options = $question?->type === Question::TYPE_CHOICE
            ? collect($question->options ?? [])->map(fn (array $option): array => ['id' => (string) ($option['id'] ?? ''), 'en' => (string) ($option['en'] ?? '')])->values()->all()
            : [];

        return [
            'number' => $index + 1,
            'id' => $question?->id,
            'key' => $question?->key,
            'subject' => $question?->subject,
            'type' => $question?->type,
            'level' => Question::normalizeLevel($question?->level),
            'band' => $question?->band,
            'prompt' => ['id' => $question?->prompt_id, 'en' => $question?->prompt_en],
            'options' => $options,
            'answer' => $question?->answer,
            'choice' => $answer->choice,
            'correct' => $answer->correct,
        ];
    }

    /** @return array<string, mixed> */
    private function comparison(GameHistory $play): array
    {
        $rows = GameHistory::query()
            ->where('user_id', $play->user_id)
            ->where('game_key', $play->game_key)
            ->get(['id', 'points', 'correct', 'wrong', 'duration_seconds', 'played_at']);

        $scored = $rows->filter(fn (GameHistory $row): bool => $row->accuracy() !== null);
        $better = $rows->where('points', '>', $play->points)->count();

        return [
            'plays' => $rows->count(),
            'avg_points' => $rows->isEmpty() ? null : round((float) $rows->avg('points'), 1),
            'best_points' => $rows->max('points'),
            'avg_accuracy' => $scored->isEmpty() ? null : round((float) $scored->avg(fn (GameHistory $row): float => (float) $row->accuracy()), 1),
            'avg_duration' => $rows->whereNotNull('duration_seconds')->isEmpty() ? null : (int) round((float) $rows->whereNotNull('duration_seconds')->avg('duration_seconds')),
            'rank' => $better + 1,
            'attempt' => $rows->filter(fn (GameHistory $row): bool => $row->played_at < $play->played_at || ($row->played_at->equalTo($play->played_at) && $row->id <= $play->id))->count(),
        ];
    }

    /** @return array<string, mixed>|null */
    private function match(GameHistory $play, MatchHistory $matches): ?array
    {
        $seat = GameMatchPlayer::query()
            ->where('game_history_id', $play->id)
            ->with(['match.players.user:id,name'])
            ->first();

        return $seat?->match ? $matches->present($seat->match, $play->user) : null;
    }

    /** @return array{previous: ?int, next: ?int} */
    private function neighbours(GameHistory $play): array
    {
        $base = fn () => GameHistory::query()->where('user_id', $play->user_id);

        return [
            'previous' => $base()
                ->where(fn ($query) => $query->where('played_at', '<', $play->played_at)
                    ->orWhere(fn ($query) => $query->where('played_at', $play->played_at)->where('id', '<', $play->id)))
                ->orderByDesc('played_at')->orderByDesc('id')->value('id'),
            'next' => $base()
                ->where(fn ($query) => $query->where('played_at', '>', $play->played_at)
                    ->orWhere(fn ($query) => $query->where('played_at', $play->played_at)->where('id', '>', $play->id)))
                ->orderBy('played_at')->orderBy('id')->value('id'),
        ];
    }

    private function percent(int $part, int $whole): ?float
    {
        return $whole > 0 ? round($part / $whole * 100, 1) : null;
    }
}
