<?php

namespace App\Http\Controllers;

use App\Http\Requests\ListSchoolsRequest;
use App\Services\SchoolCatalog;
use Illuminate\Http\JsonResponse;

/**
 * Official schools for the picker: city/regency first, then level, then the
 * list (narrowed by typing). Public reference data, cached per filter.
 */
class SchoolListController extends Controller
{
    public function __invoke(ListSchoolsRequest $request, SchoolCatalog $catalog): JsonResponse
    {
        $data = $request->validated();

        return response()
            ->json($catalog->list($data['regency'], $data['level'], (string) ($data['q'] ?? '')))
            ->header('Cache-Control', 'private, max-age=300');
    }
}
