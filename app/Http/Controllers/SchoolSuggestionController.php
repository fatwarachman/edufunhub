<?php

namespace App\Http\Controllers;

use App\Http\Requests\SearchSchoolsRequest;
use App\Services\SchoolDirectory;
use Illuminate\Http\JsonResponse;

class SchoolSuggestionController extends Controller
{
    /** Players that must share a school before guests may see it. */
    public const GUEST_MIN_PLAYERS = 3;

    /**
     * Schools other players entered that match the query. Guests (registration)
     * only see schools shared by several players, without counts, so a lone
     * child's school is never revealed to anonymous visitors.
     */
    public function __invoke(SearchSchoolsRequest $request, SchoolDirectory $directory): JsonResponse
    {
        $schools = $directory->search((string) $request->validated('q', ''));

        if ($request->user() === null) {
            $schools = array_values(array_map(
                fn (array $school): array => ['name' => $school['name'], 'city' => $school['city']],
                array_filter($schools, fn (array $school): bool => $school['players'] >= self::GUEST_MIN_PLAYERS),
            ));
        }

        return response()->json(['schools' => $schools]);
    }
}
