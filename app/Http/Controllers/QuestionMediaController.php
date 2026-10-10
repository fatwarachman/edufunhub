<?php

namespace App\Http\Controllers;

use App\Http\Requests\Admin\QuestionMediaRequest;
use App\Services\QuestionVisual;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Pictures attached to bank questions: super admin upload, and streaming
 * to signed-in players (no storage symlink needed).
 */
class QuestionMediaController extends Controller
{
    public function store(QuestionMediaRequest $request): JsonResponse
    {
        $src = QuestionVisual::storeImage($request->file('image'));

        activity()->causedBy($request->user())->withProperties(['src' => $src])->log('Uploaded question picture');

        return response()->json(['src' => $src], 201);
    }

    public function show(string $file): StreamedResponse
    {
        $path = QuestionVisual::FOLDER.'/'.$file;
        abort_unless(Storage::disk('public')->exists($path), 404);

        return Storage::disk('public')->response($path, null, [
            'Cache-Control' => 'private, max-age=604800, immutable',
            'X-Content-Type-Options' => 'nosniff',
            'Content-Security-Policy' => "default-src 'none'; sandbox",
        ]);
    }
}
