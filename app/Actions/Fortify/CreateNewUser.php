<?php

namespace App\Actions\Fortify;

use App\Http\Requests\Concerns\PlayerDetailsRules;
use App\Models\User;
use App\Services\WorkspaceService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;
use Laravel\Fortify\Contracts\CreatesNewUsers;

class CreateNewUser implements CreatesNewUsers
{
    use PasswordValidationRules, PlayerDetailsRules;

    public function __construct(
        protected WorkspaceService $workspaceService
    ) {}

    /**
     * Validate and create a newly registered user.
     *
     * @param  array<string, string>  $input
     */
    public function create(array $input): User
    {
        $input['school_name'] = trim((string) ($input['school_name'] ?? ''));

        Validator::make($input, [
            'name' => ['required', 'string', 'max:255'],
            'email' => [
                'required',
                'string',
                'email',
                'max:255',
                Rule::unique(User::class),
            ],
            'password' => $this->passwordRules(),
            ...$this->playerDetailsRules(),
        ], $this->playerDetailsMessages())->validate();

        return DB::transaction(function () use ($input) {
            $user = User::create([
                'name' => $input['name'],
                'email' => $input['email'],
                'password' => $input['password'],
                'locale' => app()->getLocale(),
            ]);
            $user->assignParticipantRole();
            $user->playerProfile()->create([
                'birth_date' => $input['birth_date'],
                'school_name' => $input['school_name'],
            ]);

            // Workspace creation is now handled exclusively via the Onboarding Wizard

            return $user;
        });
    }
}
