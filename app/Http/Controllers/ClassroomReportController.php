<?php

namespace App\Http\Controllers;

use App\Models\ClassroomMember;
use Inertia\Inertia;
use Inertia\Response;

class ClassroomReportController extends Controller
{
    public function show(ClassroomMember $member): Response
    {
        abort_unless($member->user_id === auth()->id() && $member->report_shared_at !== null, 404);

        $report = $member->report;

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
