<?php

namespace App\Http\Controllers;

use App\Http\Requests\UpdateGradeRequest;
use Illuminate\Http\RedirectResponse;

class GradeController extends Controller
{
    public function update(UpdateGradeRequest $request): RedirectResponse
    {
        $request->user()->playerProfile()->updateOrCreate([], $request->safe()->only(['grade', 'question_level']));

        return back();
    }
}
