<?php

namespace App\Http\Controllers;

use App\Http\Requests\UpdatePlayerDetailsRequest;
use App\Models\School;
use App\Services\GameReturnUrl;
use App\Services\WhatsApp\WhatsAppNotifier;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\RedirectResponse;
use Illuminate\Validation\ValidationException;

class PlayerDetailsController extends Controller
{
    public function update(UpdatePlayerDetailsRequest $request, GameReturnUrl $returnUrl, WhatsAppNotifier $whatsApp): RedirectResponse
    {
        $user = $request->user();
        $details = $request->safe()->only(['birth_date', 'school_name', 'school_city', 'school_level', 'school_npsn']);

        $user->playerProfile()->updateOrCreate([], School::officialDetails($details));

        if ($request->has('whatsapp_number')) {
            try {
                $user->forceFill([
                    'whatsapp_number' => $request->validated('whatsapp_number'),
                    'whatsapp_notifications' => (bool) $request->validated('whatsapp_notifications', true),
                ])->save();
            } catch (UniqueConstraintViolationException) {
                throw ValidationException::withMessages(['whatsapp_number' => __('whatsapp.validation.taken')]);
            }

            $whatsApp->welcome($user->fresh(['playerProfile']));
        }

        $gamePath = $user->fresh()->hasCompletePlayerDetails() ? $returnUrl->pull($request) : null;

        return $gamePath !== null ? redirect($gamePath) : back();
    }
}
