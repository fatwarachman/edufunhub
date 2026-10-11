<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreScreenTimeBeatRequest;
use App\Services\Classrooms\ClassroomPresence;
use App\Services\ScreenTimeRecorder;
use Illuminate\Http\Response;

/**
 * Receives the active-screen beats sent by the global client tracker.
 */
class ScreenTimeController extends Controller
{
    public function beat(StoreScreenTimeBeatRequest $request, ScreenTimeRecorder $recorder, ClassroomPresence $presence): Response
    {
        $recorder->record(
            $request->user()->id,
            (string) $request->validated('area'),
            (int) $request->validated('seconds_active'),
        );

        $presence->touch($request->user(), (string) $request->validated('area'));

        return response()->noContent();
    }
}
