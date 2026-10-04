<?php

namespace App\Ai\Agents;

use Illuminate\Contracts\JsonSchema\JsonSchema;
use Laravel\Ai\Contracts\Agent;
use Laravel\Ai\Contracts\HasProviderOptions;
use Laravel\Ai\Contracts\HasStructuredOutput;
use Laravel\Ai\Enums\Lab;
use Laravel\Ai\Promptable;

/**
 * Writes bilingual multiple choice quiz questions for Indonesian pupils.
 */
class QuestionWriter implements Agent, HasProviderOptions, HasStructuredOutput
{
    use Promptable;

    /**
     * Ask for one JSON reply. Some OpenAI-compatible gateways stream
     * (text/event-stream) unless told otherwise, which the SDK cannot parse.
     *
     * @return array<string, mixed>
     */
    public function providerOptions(Lab|string $provider): array
    {
        return ['stream' => false];
    }

    public function instructions(): string
    {
        return <<<'TEXT'
        You write quiz questions for EduFunHub, an educational game portal for Indonesian pupils (TK, SD, SMP, SMA, curriculum "Kurikulum Merdeka").
        Rules:
        - Write every question in Indonesian (prompt_id, options[].id, hint_id) with a faithful English translation (prompt_en, options[].en, hint_en).
        - Match the exact grade: vocabulary, numbers and topics a pupil of that grade has learnt. TK = kindergarten (age 4-6, very simple).
        - Multiple choice with exactly 4 options. Exactly one option is correct; distractors are plausible but clearly wrong.
        - answer is the 0-based index of the correct option. Vary its position.
        - Questions must be factually correct, unambiguous, short (max 200 characters) and friendly for children. No trick questions, no sensitive topics.
        - Every question must be different from the others and from the "avoid" list.
        - hint_id / hint_en: one short sentence explaining the correct answer.
        Return JSON only, following the schema.
        TEXT;
    }

    public function schema(JsonSchema $schema): array
    {
        return [
            'questions' => $schema->array()->items(
                $schema->object([
                    'prompt_id' => $schema->string()->required(),
                    'prompt_en' => $schema->string()->required(),
                    'options' => $schema->array()->items($schema->object([
                        'id' => $schema->string()->required(),
                        'en' => $schema->string()->required(),
                    ]))->required(),
                    'answer' => $schema->integer()->required(),
                    'hint_id' => $schema->string()->required(),
                    'hint_en' => $schema->string()->required(),
                ])
            )->required(),
        ];
    }
}
