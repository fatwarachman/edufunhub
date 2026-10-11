<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Subject;
use App\Services\SubjectAnalytics;
use Inertia\Inertia;
use Inertia\Response;

class SubjectAnalyticsController extends Controller
{
    public function index(SubjectAnalytics $analytics): Response
    {
        return Inertia::render('admin/subject-analysis/index', $analytics->index());
    }

    public function show(Subject $subject, SubjectAnalytics $analytics): Response
    {
        return Inertia::render('admin/subject-analysis/show', [
            'indexUrl' => route('admin.subject-analysis.index'),
            'subject' => $analytics->metadata($subject),
            'analysis' => $analytics->detail($subject),
        ]);
    }
}
