<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\UpdatePlayerSchoolGradeRequest;
use App\Models\School;
use App\Models\User;
use Illuminate\Http\RedirectResponse;

/**
 * Super admin correction of a learner's grade and school from the admin
 * user detail page.
 */
class PlayerSchoolGradeController extends Controller
{
    /** Profile fields this action may change and logs. */
    private const FIELDS = ['grade', 'school_name', 'school_city', 'school_level', 'school_npsn'];

    public function update(UpdatePlayerSchoolGradeRequest $request, User $user): RedirectResponse
    {
        $profile = $user->playerProfile()->firstOrFail();
        $old = $profile->only(self::FIELDS);

        $profile->fill(School::officialDetails($request->safe()->only(self::FIELDS)))->save();

        activity()
            ->causedBy($request->user())
            ->performedOn($user)
            ->event('updated')
            ->withProperties(['old' => $old, 'attributes' => $profile->only(self::FIELDS)])
            ->log('Updated learner grade and school');

        return back()->with('success', 'Grade and school updated.');
    }
}
