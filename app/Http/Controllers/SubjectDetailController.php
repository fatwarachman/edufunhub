<?php

namespace App\Http\Controllers;

use App\Models\Subject;
use App\Services\SubjectAnalytics;
use Inertia\Inertia;
use Inertia\Response;

class SubjectDetailController extends Controller
{
    public function __invoke(Subject $subject, SubjectAnalytics $analytics): Response
    {
        abort_unless($subject->is_active, 404);

        return Inertia::render('subjects/show', [
            'subject' => [
                'key' => $subject->key,
                'nameId' => $subject->name_id,
                'nameEn' => $subject->name_en,
                'icon' => $subject->icon,
                'color' => $subject->color,
            ],
            'analysis' => $analytics->detail($subject),
        ]);
    }
}
