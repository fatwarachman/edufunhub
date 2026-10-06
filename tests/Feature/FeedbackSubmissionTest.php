<?php

use App\Models\Feedback;
use App\Models\User;

use function Pest\Laravel\actingAs;

beforeEach(function () {
    $this->user = User::factory()->create();
    $this->user->playerProfile()->create([
        'grade' => 4,
        'birth_date' => now()->subYears(10)->toDateString(),
        'school_name' => 'SD Test',
        'color' => 'amber',
        'accessory' => 'none',
    ]);
});

/**
 * @return array<string, mixed>
 */
function feedbackPayload(array $overrides = []): array
{
    return [
        'type' => 'bug',
        'message' => 'The sky quiz stops loading after the third question.',
        ...$overrides,
    ];
}

it('redirects guests to login', function () {
    $this->get('/feedback')->assertRedirect('/login');
    $this->post('/feedback', feedbackPayload())->assertRedirect('/login');

    expect(Feedback::count())->toBe(0);
});

it('renders the feedback page with types, games and the same-site referrer', function () {
    actingAs($this->user)
        ->get('/feedback', ['Referer' => config('app.url').'/games/sky-quiz?x=1'])
        ->assertOk()
        ->assertInertia(fn ($page) => $page->component('feedback/index')
            ->where('types', ['bug', 'feature', 'question', 'content', 'account', 'other'])
            ->where('referrer', '/games/sky-quiz?x=1')
            ->has('games.0.key')
            ->has('games.0.titleKey')
            ->has('history', 0));
});

it('ignores a cross-site referrer', function () {
    actingAs($this->user)
        ->get('/feedback', ['Referer' => 'https://evil.example/phish'])
        ->assertInertia(fn ($page) => $page->where('referrer', null));
});

it('stores feedback with server-side user agent and stripped tags', function () {
    actingAs($this->user)
        ->withHeader('User-Agent', 'TestAgent/1.0')
        ->post('/feedback', feedbackPayload([
            'type' => 'question',
            'message' => '<b>Question</b> 7 has the <script>alert(1)</script>wrong answer.',
            'game' => 'sky-quiz',
            'page_url' => '/games/sky-quiz',
            'may_contact' => true,
            'user_agent' => 'Spoofed/9.9',
            'status' => 'resolved',
            'user_id' => 999,
        ]))
        ->assertRedirect('/feedback')
        ->assertSessionHas('success');

    $feedback = Feedback::query()->sole();

    expect($feedback->user_id)->toBe($this->user->id)
        ->and($feedback->type)->toBe('question')
        ->and($feedback->status)->toBe('new')
        ->and($feedback->message)->toBe('Question 7 has the alert(1)wrong answer.')
        ->and($feedback->user_agent)->toBe('TestAgent/1.0')
        ->and($feedback->page_url)->toBe('/games/sky-quiz')
        ->and($feedback->workspace_id)->toBeNull()
        ->and($feedback->metadata)->toBe(['game' => 'sky-quiz', 'may_contact' => true]);
});

it('validates the feedback type against the enum', function (mixed $type) {
    actingAs($this->user)
        ->postJson('/feedback', feedbackPayload(['type' => $type]))
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['type']);
})->with(['invalid', 'experience', '', null]);

it('accepts every feedback type', function (string $type) {
    actingAs($this->user)
        ->post('/feedback', feedbackPayload(['type' => $type]))
        ->assertSessionHasNoErrors();

    expect(Feedback::query()->where('type', $type)->exists())->toBeTrue();
})->with(['bug', 'feature', 'question', 'content', 'account', 'other']);

it('validates the message length after stripping tags', function (string $message) {
    actingAs($this->user)
        ->postJson('/feedback', feedbackPayload(['message' => $message]))
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['message']);
})->with([
    'empty' => '',
    'too short' => 'short',
    'tags only' => '<p><b>       </b></p>',
    'too long' => str_repeat('x', 2001),
]);

it('rejects unknown games and unsafe page urls', function () {
    actingAs($this->user)
        ->postJson('/feedback', feedbackPayload(['game' => 'not-a-game', 'page_url' => 'javascript:alert(1)']))
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['game', 'page_url']);
});

it('throttles feedback to five per minute per user', function () {
    foreach (range(1, 5) as $i) {
        actingAs($this->user)->post('/feedback', feedbackPayload())->assertRedirect();
    }

    actingAs($this->user)->post('/feedback', feedbackPayload())->assertStatus(429);

    expect(Feedback::count())->toBe(5);
});

it('keeps its own throttle counter apart from other throttled routes', function () {
    foreach (range(1, 8) as $i) {
        actingAs($this->user)->patch('/locale', ['locale' => 'id']);
    }

    actingAs($this->user)->post('/feedback', feedbackPayload())->assertRedirect('/feedback');

    expect(Feedback::count())->toBe(1);
});

it('shows only the player\'s own feedback in the history', function () {
    $other = User::factory()->create();
    Feedback::factory()->create(['user_id' => $other->id, 'type' => 'bug', 'message' => 'Someone else wrote this message.']);
    Feedback::factory()->create(['user_id' => $this->user->id, 'type' => 'feature', 'status' => 'resolved', 'message' => 'My own idea for the portal.']);

    actingAs($this->user)
        ->get('/feedback')
        ->assertInertia(fn ($page) => $page->has('history', 1)
            ->where('history.0.type', 'feature')
            ->where('history.0.status', 'resolved')
            ->where('history.0.message', 'My own idea for the portal.')
            ->missing('history.0.user_agent')
            ->missing('history.0.page_url'));
});
