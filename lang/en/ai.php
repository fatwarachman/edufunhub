<?php

return [
    'not_connected' => 'Save the base URL and API key first.',
    'not_configured' => 'Set up the AI connection and choose a model first.',
    'unreachable' => 'The AI server could not be reached. Check the base URL.',
    'http_error' => 'The AI server answered with HTTP :status. Check the base URL and API key.',
    'bad_response' => 'The AI server reply for model :model could not be read (expected one JSON answer). Check that the server supports the OpenAI chat completions API.',
    'bad_models_response' => 'The AI server did not return an OpenAI-compatible model list.',
    'base_url_invalid' => 'Enter a full URL, for example https://api.openai.com/v1.',
    'connection_saved' => 'AI connection saved.',
    'models_loaded' => '{0} The server lists no models.|{1} 1 model loaded.|[2,*] :count models loaded.',
    'model_unknown' => 'Choose a model from the list loaded from the server.',
    'model_saved' => 'Questions will be generated with :model.',
    'key_removed' => 'API key removed.',
    'points_saved' => 'Point rules saved. Games use them within a minute.',
    'pick_subject' => 'Choose at least one subject.',
    'pick_grade' => 'Choose at least one grade.',
    'too_many' => 'This would generate :total questions; the limit per request is :max.',
    'generation_started' => 'Generating :total questions in the background.',
    'teacher_assigned' => ':name is now a teacher and can open Ruang Guru.',
    'teacher_removed' => ':name is no longer a teacher.',
];
