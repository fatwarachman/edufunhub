<?php

namespace App\Http\Controllers;

use App\Services\AndroidApk;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

/**
 * Downloads the latest Android app build (APK) for sideloading.
 */
class AndroidApkController extends Controller
{
    public function __invoke(AndroidApk $apk): BinaryFileResponse
    {
        $path = $apk->path();
        abort_if($path === null, 404);

        return response()->download($path, 'edufunhub.apk', [
            'Content-Type' => 'application/vnd.android.package-archive',
            'Cache-Control' => 'public, max-age=300',
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }
}
