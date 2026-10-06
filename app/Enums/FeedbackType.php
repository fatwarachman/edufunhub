<?php

namespace App\Enums;

/**
 * Kinds of feedback a player can send from the /feedback page. Legacy rows
 * (`idea`, `general`, `experience`) keep their raw value and are shown as-is.
 */
enum FeedbackType: string
{
    case Bug = 'bug';
    case Feature = 'feature';
    case Question = 'question';
    case Content = 'content';
    case Account = 'account';
    case Other = 'other';

    /**
     * @return list<string>
     */
    public static function values(): array
    {
        return array_column(self::cases(), 'value');
    }
}
