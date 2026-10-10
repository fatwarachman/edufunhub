<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;

/**
 * Digital Asset Links statement that lets the Android app (Trusted Web
 * Activity) open the site full screen without the Chrome address bar.
 */
class AndroidAssetLinksController extends Controller
{
    public function __invoke(): JsonResponse
    {
        $fingerprints = config('android.sha256_cert_fingerprints', []);

        if ($fingerprints === []) {
            return response()->json([])->header('Cache-Control', 'public, max-age=300');
        }

        return response()
            ->json([
                [
                    'relation' => [
                        'delegate_permission/common.handle_all_urls',
                        'delegate_permission/common.get_login_creds',
                    ],
                    'target' => [
                        'namespace' => 'android_app',
                        'package_name' => config('android.package_name'),
                        'sha256_cert_fingerprints' => $fingerprints,
                    ],
                ],
            ], options: JSON_UNESCAPED_SLASHES)
            ->header('Cache-Control', 'public, max-age=3600');
    }
}
