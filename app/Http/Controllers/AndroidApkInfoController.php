<?php

namespace App\Http\Controllers;

use App\Services\AndroidApk;
use Illuminate\Http\JsonResponse;

/**
 * Public JSON describing the latest Android APK (version, size, SHA-256 and
 * download URL), read by the static landing page download section.
 */
class AndroidApkInfoController extends Controller
{
    public function __invoke(AndroidApk $apk): JsonResponse
    {
        $info = $apk->present();
        abort_if($info === null, 404);

        return response()
            ->json([
                'version' => $info['version'],
                'size' => $info['size'],
                'sha256' => $info['sha256'],
                'updatedAt' => $info['updated_at'],
                'url' => $info['url'],
            ])
            ->header('Cache-Control', 'public, max-age=300');
    }
}
