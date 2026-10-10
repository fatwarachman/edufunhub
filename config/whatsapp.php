<?php

return [

    /*
    |--------------------------------------------------------------------------
    | GOWA (go-whatsapp-web-multidevice) connection
    |--------------------------------------------------------------------------
    |
    | WhatsApp notifications are sent through the GOWA REST API running in its
    | own container (`edufunhub-whatsapp`, internal network only). The admin
    | links a WhatsApp account by scanning the QR code on /admin/whatsapp.
    |
    */

    'base_url' => env('WHATSAPP_GOWA_URL', 'http://edufunhub-whatsapp:3000'),
    'username' => env('WHATSAPP_GOWA_USER'),
    'password' => env('WHATSAPP_GOWA_PASSWORD'),
    'device_id' => env('WHATSAPP_DEVICE_ID', 'edufunhub'),
    'timeout' => (float) env('WHATSAPP_GOWA_TIMEOUT', 10),

    // Queue used for outgoing messages. Null = the default connection.
    'queue_connection' => env('WHATSAPP_QUEUE_CONNECTION'),
    'queue' => env('WHATSAPP_QUEUE', 'low'),

    // Safety cap against spam and WhatsApp bans: automatic messages per user per hour.
    'per_user_hourly' => (int) env('WHATSAPP_PER_USER_HOURLY', 10),

    /*
    |--------------------------------------------------------------------------
    | Notification events
    |--------------------------------------------------------------------------
    |
    | Every automatic WhatsApp message is one event. To add a new one: add an
    | entry here, add its template to lang/{id,en}/whatsapp.php under
    | `events.<key>`, then call WhatsAppNotifier::notify($user, '<key>', ...).
    | `label` and `description` are English and translated in id-admin.json.
    |
    */

    'events' => [
        'welcome' => [
            'label' => 'Welcome new players',
            'description' => 'Greeting sent once when a player saves a WhatsApp number for the first time.',
            'default' => true,
        ],
        'ability_analysis' => [
            'label' => 'Ability analysis ready',
            'description' => 'Summary and link of a finished AI ability analysis.',
            'default' => true,
        ],
        'friend_request' => [
            'label' => 'Friend requests',
            'description' => 'Tells a player that someone wants to be their friend.',
            'default' => true,
        ],
    ],

];
