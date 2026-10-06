<?php

namespace App\Http\Controllers;

use App\Services\RegencyDirectory;
use Illuminate\Http\JsonResponse;

/**
 * Public list of Indonesian cities/regencies for the school city picker on
 * registration and the player dashboard. Static data: browsers may cache it.
 */
class RegencyController extends Controller
{
    public function __invoke(RegencyDirectory $directory): JsonResponse
    {
        return response()
            ->json(['regencies' => $directory->all()])
            ->header('Cache-Control', 'public, max-age=86400');
    }
}
