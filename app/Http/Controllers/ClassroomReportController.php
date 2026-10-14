<?php

namespace App\Http\Controllers;

use App\Models\ClassroomMember;
use App\Services\Ai\ClassroomAiText;
use App\Services\Classrooms\ClassroomReport;
use Inertia\Inertia;
use Inertia\Response;

class ClassroomReportController extends Controller
{
    public function show(ClassroomMember $member, ClassroomReport $reports): Response
    {
        abort_unless($member->user_id === auth()->id() && $member->report_shared_at !== null, 404);

        $report = is_array($member->report) ? $member->report : [];

        if (! is_array($report['totals'] ?? null)) {
            $report = [
                ...$reports->forStudent($member),
                'teacher_note' => is_string($report['teacher_note'] ?? null) ? $report['teacher_note'] : null,
                'ai_feedback' => $report['ai_feedback'] ?? $member->ai_feedback,
            ];
        }

        $feedback = $report['ai_feedback'] ?? null;
        $sections = is_array($feedback)
            ? ClassroomAiText::sections($feedback, ClassroomAiText::STUDENT_SECTIONS)
            : ClassroomAiText::decode(is_string($feedback) ? $feedback : null, ClassroomAiText::STUDENT_SECTIONS, 'strengths');
        $report['ai_feedback'] = $sections === null || ClassroomAiText::isEmpty($sections) ? null : $sections;
        $report['shared_at'] = $member->report_shared_at->toIso8601String();

        return Inertia::render('portal/classroom-report', [
            'member' => [
                'id' => $member->id,
                'classroom' => [
                    'id' => $member->classroom->id,
                    'name' => $member->classroom->name,
                    'pin' => $member->classroom->pin,
                ],
            ],
            'report' => $report,
        ]);
    }
}
