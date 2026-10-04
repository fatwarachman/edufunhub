<?php

return [
    'created' => 'Question created.',
    'updated' => 'Question updated.',
    'deleted' => 'Question deleted.',
    'sky_quiz_choice_only' => 'Sky Quiz only supports multiple choice questions.',
    'options_unique' => 'Answer options must be unique.',
    'options_min' => 'Multiple choice questions need at least 3 options.',
    'options_max' => 'Multiple choice questions allow at most 6 options.',
    'answer_invalid' => 'Choose a correct answer from the options.',
    'games_required' => 'Distribute the question to at least one game.',
    'grades_required' => 'Choose at least one grade.',
    'grades_invalid' => 'Grades must be kindergarten (TK) or 1 to 12.',
    'prompt_required' => 'Write a question of at least 3 characters.',
    'import' => [
        'file_required' => 'Choose a CSV file to upload.',
        'file_too_large' => 'The file may not be larger than 2 MB.',
        'file_type' => 'The file must be a CSV.',
        'missing_columns' => 'Required columns are missing: :columns. Use the provided template.',
        'too_many_rows' => 'At most :max questions per file.',
        'empty' => 'The file contains no questions.',
        'failed' => 'Import cancelled. Fix the rows with problems and upload again.',
        'success' => '{1} :count question imported.|[2,*] :count questions imported.',
    ],
];
