<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\UpdatePlayerSchoolGradeRequest;
use App\Models\School;
use App\Models\User;
use Illuminate\Http\RedirectResponse;

/**
 * Super admin edit of a learner's grade, school and birth date from the admin
 * user detail page. Creates the learner profile when it does not exist yet;
 * the first-login wizard stays pending so the learner still confirms it.
 */
class PlayerSchoolGradeController extends Controller
{
    /** Profile fields this action may change and logs. */
    private const FIELDS = ['grade', 'birth_date', 'school_name', 'school_city', 'school_level', 'school_npsn'];

    public function update(UpdatePlayerSchoolGradeRequest $request, User $user): RedirectResponse
    {
        $existing = $user->playerProfile()->first();
        $old = $existing
            ? $this->snapshot($existing->only(self::FIELDS))
            : array_fill_keys(self::FIELDS, null);

        $changes = School::officialDetails($request->safe()->only(['grade', 'school_name', 'school_city', 'school_level', 'school_npsn']));

        if ($request->validated('birth_date') !== null) {
            $changes['birth_date'] = $request->validated('birth_date');
        }

        $profile = $user->playerProfile()->updateOrCreate([], $changes);

        activity()
            ->causedBy($request->user())
            ->performedOn($user)
            ->event($existing ? 'updated' : 'created')
            ->withProperties(['old' => $old, 'attributes' => $this->snapshot($profile->only(self::FIELDS))])
            ->log('Updated learner grade, school and birth date');

        return back()->with('success', 'Learner details updated.');
    }

    /**
     * Plain values for the activity log (dates as Y-m-d).
     *
     * @param  array<string, mixed>  $values
     * @return array<string, mixed>
     */
    private function snapshot(array $values): array
    {
        return array_map(
            fn (mixed $value): mixed => $value instanceof \DateTimeInterface ? $value->format('Y-m-d') : $value,
            $values,
        );
    }
}
