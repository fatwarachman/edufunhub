<?php

namespace App\Http\Controllers;

use App\Http\Requests\CompleteProfileWizardRequest;
use App\Services\GameReturnUrl;
use App\Services\ProfileWizard;
use Illuminate\Http\RedirectResponse;

class ProfileWizardController extends Controller
{
    public function store(CompleteProfileWizardRequest $request, ProfileWizard $wizard, GameReturnUrl $returnUrl): RedirectResponse
    {
        $data = $request->safe()->only(['name', 'birth_date', 'grade', 'school_name', 'school_city', 'school_level', 'school_npsn', 'whatsapp_number', 'whatsapp_notifications']);

        $wizard->complete($request->user(), [...$data, 'grade' => (int) $data['grade']]);

        $gamePath = $returnUrl->pull($request);

        return $gamePath !== null ? redirect($gamePath) : back()->with('success', __('profile.wizard_saved'));
    }
}
