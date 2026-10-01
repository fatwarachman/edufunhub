<?php

namespace App\Http\Controllers;

use App\Http\Requests\UpdateGradeRequest;
use Illuminate\Http\RedirectResponse;

class GradeController extends Controller
{
    public function update(UpdateGradeRequest $request): RedirectResponse
    {
        $request->user()->playerProfile()->updateOrCreate([], ['grade' => $request->integer('grade')]);

        return back();
    }
}
