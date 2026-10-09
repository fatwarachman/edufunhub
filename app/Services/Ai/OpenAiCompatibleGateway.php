<?php

namespace App\Services\Ai;

use Illuminate\Support\Collection;
use Laravel\Ai\Contracts\Providers\TextProvider;
use Laravel\Ai\Gateway\DeepSeek\DeepSeekGateway;
use Laravel\Ai\Gateway\TextGenerationOptions;
use Laravel\Ai\Providers\Provider;
use Laravel\Ai\Responses\TextResponse;

/** Preserve gateway aliases: response model IDs are not necessarily routable. */
class OpenAiCompatibleGateway extends DeepSeekGateway
{
    private string $requestedModel;

    public function generateText(
        TextProvider $provider,
        string $model,
        ?string $instructions,
        array $messages = [],
        array $tools = [],
        ?array $schema = null,
        ?TextGenerationOptions $options = null,
        ?int $timeout = null,
    ): TextResponse {
        $this->requestedModel = $model;

        return parent::generateText($provider, $model, $instructions, $messages, $tools, $schema, $options, $timeout);
    }

    protected function continueWithToolResults(
        string $model,
        Provider $provider,
        bool $structured,
        array $tools,
        ?array $schema,
        Collection $steps,
        Collection $messages,
        ?string $instructions,
        array $originalMessages,
        int $depth,
        ?int $maxSteps,
        ?TextGenerationOptions $options = null,
        ?int $timeout = null,
    ): TextResponse {
        return parent::continueWithToolResults(
            $this->requestedModel, $provider, $structured, $tools, $schema, $steps, $messages,
            $instructions, $originalMessages, $depth, $maxSteps, $options, $timeout,
        );
    }
}
