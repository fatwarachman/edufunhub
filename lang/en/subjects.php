<?php

return [
    'flash' => [
        'created' => 'Subject “:name” added.',
        'updated' => 'Subject “:name” saved.',
        'shown' => 'Subject “:name” is shown in games again.',
        'hidden' => 'Subject “:name” is hidden from games.',
        'deleted' => 'Subject “:name” deleted.',
    ],
    'validation' => [
        'key_required' => 'Enter a name or key for the subject.',
        'key_format' => 'The key may only use lowercase letters, numbers and hyphens (2–30 characters, starting with a letter).',
        'key_reserved' => 'This key is reserved for the mixed choice.',
        'key_taken' => 'Another subject already uses this key.',
        'name_required' => 'Enter the subject name in Indonesian.',
        'name_taken' => 'Another subject already has this name.',
        'color' => 'Choose a valid colour.',
        'system_delete' => 'Built-in subjects cannot be deleted. Hide it instead.',
        'has_questions' => 'This subject still has :count question(s). Move or delete them first, or hide the subject.',
        'last_active' => 'At least one subject must stay visible in games.',
    ],
];
