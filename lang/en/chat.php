<?php

return [
    'deleted_user' => 'Deleted user',
    'system' => [
        'created' => ':actor created the group ":name".',
        'added' => ':actor added :names.',
        'left' => ':name left the group.',
        'renamed' => ':actor renamed the group to ":name".',
    ],
    'errors' => [
        'empty' => 'Message cannot be empty.',
        'too_long' => 'Messages can be at most :max characters.',
        'self' => 'You cannot chat with yourself.',
        'user_missing' => 'User not found.',
        'group_name' => 'Group name needs at least 2 characters.',
        'group_members' => 'Pick at least 1 member.',
        'group_full' => 'A group holds at most :max members.',
        'owner_only' => 'Only the group creator can rename it.',
        'direct_leave' => 'Private chats cannot be left.',
    ],
];
