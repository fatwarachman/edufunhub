<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Android App (Trusted Web Activity)
    |--------------------------------------------------------------------------
    |
    | The Play Store app (android/) opens this site full screen without the
    | Chrome address bar. Android only hides the browser UI when the site
    | proves it owns the app through /.well-known/assetlinks.json, which lists
    | the package name and the SHA-256 fingerprints of the signing keys.
    |
    | List every key that signs an installed build, comma separated: the
    | upload key (sideloaded APK) and the Play App Signing key (Play Console >
    | Test and release > App integrity), which Google uses for store installs.
    |
    */

    'package_name' => env('ANDROID_PACKAGE_NAME', 'com.edufunhub.app'),

    'sha256_cert_fingerprints' => array_values(array_filter(array_map(
        fn (string $fingerprint): string => strtoupper(trim($fingerprint)),
        explode(',', (string) env('ANDROID_SHA256_CERT_FINGERPRINTS', '')),
    ))),

];
