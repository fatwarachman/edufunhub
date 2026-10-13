<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class TeacherSubject extends Model
{
    protected $fillable = ['user_id', 'subject_key'];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
