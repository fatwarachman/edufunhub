<?php

namespace App\Services;

use App\Models\Setting;

/**
 * Super admin switch for sign-up with a regular email + password. Off by
 * default: new accounts come only from Google until the switch is turned on.
 */
class RegistrationSettings
{
    public const GROUP = 'registration';

    public const EMAIL_ENABLED = 'registration.email_enabled';

    public function emailEnabled(): bool
    {
        return (string) Setting::get(self::EMAIL_ENABLED, '0') === '1';
    }

    public function setEmailEnabled(bool $enabled): void
    {
        Setting::set(self::EMAIL_ENABLED, $enabled ? '1' : '0', self::GROUP);
    }
}
