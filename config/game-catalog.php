<?php

return [
    'categories' => [
        [
            'key' => 'board',
            'titleKey' => 'player.board',
            'games' => [
                ['key' => 'snakes-and-ladders', 'titleKey' => 'player.snakes', 'route' => 'games.snakes-and-ladders'],
            ],
        ],
        [
            'key' => 'quiz',
            'titleKey' => 'player.quiz',
            'games' => [
                ['key' => 'sky-quiz', 'titleKey' => 'player.sky', 'route' => 'games.sky-quiz'],
            ],
        ],
    ],
];
