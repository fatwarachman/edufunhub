<?php

return [
    'events' => [
        'welcome' => "Hi :name! 👋\n\nWelcome to *:app*. This WhatsApp number is saved, so we will let you know about learning analyses, friend requests and other important news.\n\nKeep playing and learning: :url\n\nDon't want WhatsApp messages? Turn them off on your profile page.",
        'ability_analysis' => "Hi :name! 📊\n\nYour learning ability analysis is ready.\n\n*Summary*\n:summary\n\n*Your strengths*\n:strengths\n\n*Study tips*\n:tips\n\nSee the full analysis: :link",
        'friend_request' => "Hi :name! 🤝\n\n*:from* wants to be your friend on :app.\n\nAccept or decline the request here: :link",
        'test' => 'Test message from *:app*. If you got this, WhatsApp notifications are connected. ✅',
    ],
    'ability' => [
        'greeting' => 'Hi :name! Your learning ability analysis is ready. 🎉',
        'title' => 'EduFunHub Analysis Result',
        'date' => 'Analyzed :date',
        'summary' => 'Summary',
        'scores' => 'Score per subject',
        'strengths' => 'Strengths',
        'growth' => 'Room to grow',
        'tips' => 'Study tips',
        'style' => 'Learning style',
        'progress' => 'Progress since the previous analysis',
        'footer' => 'See the full analysis: :url',
    ],
    'validation' => [
        'number' => 'Invalid WhatsApp number. Example: 081234567890.',
        'player_number' => 'The WhatsApp number must start with 0, 62 or +62. Example: 081234567890.',
        'taken' => 'This WhatsApp number is already used by another account.',
        'filter' => 'Invalid log filter.',
        'events' => 'Invalid notification settings.',
    ],
    'errors' => [
        'not_configured' => 'The WhatsApp service is not configured.',
        'unreachable' => 'The WhatsApp container (GOWA) cannot be reached.',
        'unauthorized' => 'The WhatsApp container refused the login. Check WHATSAPP_GOWA_USER and WHATSAPP_GOWA_PASSWORD.',
        'not_logged_in' => 'The sender WhatsApp number is not linked. Scan the QR code on the WhatsApp Notifications page.',
        'gateway' => 'WhatsApp rejected the request: :message',
        'no_qr' => 'The QR code is not ready yet. Try again in a few seconds.',
        'no_code' => 'WhatsApp did not return a pairing code.',
        'send_failed' => 'The WhatsApp message could not be sent.',
    ],
    'skipped' => [
        'master_off' => 'Not sent: the WhatsApp notifications master switch is off.',
        'event_off' => 'Not sent: this message type is turned off.',
    ],
    'flash' => [
        'settings_saved' => 'WhatsApp notification settings saved.',
        'logged_out' => 'The sender WhatsApp number was unlinked.',
        'reconnected' => 'Reconnecting to WhatsApp.',
        'test_queued' => 'Test message queued.',
        'retried' => 'Message queued again.',
    ],
];
