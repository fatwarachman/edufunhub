<?php

namespace App\Mcp;

use App\Models\User;

class TeacherAssistantSession
{
    public function __construct(private User $actor) {}

    public function authorize(): void
    {
        abort_unless($this->actor->isTeacher(), 403);
    }

    public function actor(): User
    {
        $this->authorize();

        return $this->actor;
    }
}
