<?php

namespace App\Services\WhatsApp;

/**
 * WhatsApp numbers are stored as international digits without "+"
 * (6281234567890). Local Indonesian input (0812…, 812…, +62 812-…) is
 * converted to that form.
 */
class PhoneNumber
{
    public const PATTERN = '/^[1-9]\d{9,14}$/';

    public static function normalize(?string $input): ?string
    {
        $digits = preg_replace('/\D+/', '', (string) $input) ?? '';

        if ($digits === '') {
            return null;
        }
        if (str_starts_with($digits, '00')) {
            $digits = substr($digits, 2);
        }
        if (str_starts_with($digits, '0')) {
            $digits = '62'.substr($digits, 1);
        } elseif (str_starts_with($digits, '8')) {
            $digits = '62'.$digits;
        }

        return $digits;
    }

    /** Stored form of a player's Indonesian number: 62 + 8 to 12 digits. */
    public const INDONESIAN_PATTERN = '/^62[1-9]\d{7,11}$/';

    /**
     * Player input must start with 0, 62 or +62 (spaces, dots, dashes and
     * brackets allowed). Returns the stored 62… form, or the cleaned input
     * unchanged when the prefix is not allowed so validation rejects it.
     */
    public static function normalizeIndonesian(?string $input): ?string
    {
        $cleaned = preg_replace('/[\s().-]+/', '', trim((string) $input)) ?? '';

        if ($cleaned === '') {
            return null;
        }
        if (str_starts_with($cleaned, '+62')) {
            return substr($cleaned, 1);
        }
        if (str_starts_with($cleaned, '0') && ! str_starts_with($cleaned, '00')) {
            return '62'.substr($cleaned, 1);
        }

        return $cleaned;
    }

    public static function isValid(?string $normalized): bool
    {
        return $normalized !== null && preg_match(self::PATTERN, $normalized) === 1;
    }

    /** 6281234567890 -> 62812****7890, for logs shown to admins. */
    public static function mask(string $number): string
    {
        $length = strlen($number);

        return $length <= 8 ? str_repeat('*', $length) : substr($number, 0, 5).str_repeat('*', $length - 9).substr($number, -4);
    }

    public static function jid(string $number): string
    {
        return $number.'@s.whatsapp.net';
    }
}
