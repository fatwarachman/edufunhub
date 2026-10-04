<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Amount (in rupiah) a teacher earns when a player of a given grade answers
 * one of the teacher's questions correctly. Grade 0 is kindergarten (TK).
 */
class QuestionCompensationRate extends Model
{
    /** @var list<string> */
    protected $fillable = ['grade', 'amount', 'updated_by'];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return ['grade' => 'integer', 'amount' => 'integer'];
    }

    /** @return BelongsTo<User, $this> */
    public function editor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by');
    }

    /**
     * Rate per grade for every supported grade (missing grades earn 0).
     *
     * @return array<int, int>
     */
    public static function amounts(): array
    {
        $stored = static::query()->pluck('amount', 'grade');

        return collect(Question::GRADES)
            ->mapWithKeys(fn (int $grade): array => [$grade => (int) ($stored[$grade] ?? 0)])
            ->all();
    }
}
