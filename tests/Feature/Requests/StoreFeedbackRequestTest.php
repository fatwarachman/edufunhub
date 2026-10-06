<?php

use App\Http\Requests\StoreFeedbackRequest;
use Illuminate\Support\Facades\Validator;

function feedbackRules(): array
{
    return (new StoreFeedbackRequest)->rules();
}

it('has validation rules for type, message, game, page and contact', function () {
    expect(feedbackRules())->toHaveKeys(['type', 'message', 'game', 'page_url', 'may_contact'])
        ->and(feedbackRules()['message'])->toContain('min:10')
        ->and(feedbackRules()['message'])->toContain('max:2000');
});

it('accepts all feedback types', function (string $type) {
    $validator = Validator::make([
        'type' => $type,
        'message' => 'This is a valid feedback message.',
    ], feedbackRules());

    expect($validator->passes())->toBeTrue();
})->with(['bug', 'feature', 'question', 'content', 'account', 'other']);

it('rejects legacy and unknown types', function (string $type) {
    $validator = Validator::make([
        'type' => $type,
        'message' => 'This is a valid feedback message.',
    ], feedbackRules());

    expect($validator->errors()->has('type'))->toBeTrue();
})->with(['idea', 'general', 'experience', 'complaint']);

it('fails validation when the message is too short or too long', function (string $message) {
    $validator = Validator::make(['type' => 'bug', 'message' => $message], feedbackRules());

    expect($validator->errors()->has('message'))->toBeTrue();
})->with(['Short', str_repeat('x', 2001)]);

it('has custom error messages', function () {
    expect((new StoreFeedbackRequest)->messages())
        ->toHaveKeys(['type.enum', 'message.min', 'message.max', 'game.in', 'page_url.regex']);
});
