<?php

namespace App\Jobs;

use App\Models\Classroom;
use App\Services\Ai\ClassroomAiText;
use App\Services\Ai\ClassroomAnalyzer;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\DB;
use Throwable;

/**
 * Runs one AI classroom analysis and writes summary + per-student feedback.
 */
class AnalyzeClassroom implements ShouldQueue
{
    use Queueable;

    public int $tries = 1;

    public int $timeout = 300;

    public function __construct(public Classroom $classroom)
    {
        $this->onConnection(config('ai.ability_assessment.connection'));
        $this->onQueue('low');
    }

    public function handle(ClassroomAnalyzer $analyzer): void
    {
        $classroom = $this->classroom->fresh();
        if ($classroom === null) {
            return;
        }

        $classroom->updateQuietly(['ai_status' => 'running']);

        try {
            $result = $analyzer->analyze($classroom);

            DB::transaction(function () use ($classroom, $result): void {
                $classroom->updateQuietly([
                    'ai_summary' => ClassroomAiText::encode($result['summary']),
                    'ai_status' => 'done',
                    'report_generated_at' => now(),
                ]);

                // A new analysis replaces every old feedback, so no student
                // keeps text written for an earlier state of the class.
                $classroom->members()->update(['ai_feedback' => null]);
                foreach ($result['students'] as $student) {
                    $classroom->members()
                        ->whereKey($student['member_id'])
                        ->update(['ai_feedback' => ClassroomAiText::encode($student['feedback'])]);
                }
            });
        } catch (Throwable $exception) {
            report($exception);
            $classroom->updateQuietly(['ai_status' => 'failed']);
        }
    }

    public function failed(?Throwable $exception): void
    {
        $this->classroom->fresh()?->updateQuietly(['ai_status' => 'failed']);
    }
}
