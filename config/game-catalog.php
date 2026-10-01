<?php

return [
    /*
    | Games listed on the player portal and dashboard.
    |
    | awards_points: only games whose results are verified server-side (Go game service)
    | may award points. Client-only demos must stay false.
    */
    'categories' => [
        [
            'key' => 'adventure',
            'titleKey' => 'player.adventure',
            'games' => [
                [
                    'key' => 'flag-quest',
                    'titleKey' => 'player.flagQuest',
                    'descriptionKey' => 'portal.games.flagQuest',
                    'route' => 'games.flag-quest',
                    'icon' => 'flag',
                    'accent' => '#1aab8a',
                    'min_grade' => 1,
                    'max_grade' => 12,
                    'awards_points' => true,
                    'requires_grade' => true,
                ],
            ],
        ],
        [
            'key' => 'board',
            'titleKey' => 'player.board',
            'games' => [
                [
                    'key' => 'snakes-and-ladders',
                    'titleKey' => 'player.snakes',
                    'descriptionKey' => 'portal.games.snakes',
                    'route' => 'games.snakes-and-ladders',
                    'icon' => 'dice',
                    'accent' => '#f5a623',
                    'min_grade' => 1,
                    'max_grade' => 12,
                    'awards_points' => false,
                    'requires_grade' => false,
                ],
            ],
        ],
        [
            'key' => 'quiz',
            'titleKey' => 'player.quiz',
            'games' => [
                [
                    'key' => 'sky-quiz',
                    'titleKey' => 'player.sky',
                    'descriptionKey' => 'portal.games.sky',
                    'route' => 'games.sky-quiz',
                    'icon' => 'plane',
                    'accent' => '#6c5ce7',
                    'min_grade' => 1,
                    'max_grade' => 12,
                    'awards_points' => true,
                    'requires_grade' => true,
                ],
            ],
        ],
    ],

    /*
    | Points needed per player level on the portal.
    */
    'points_per_level' => 200,
];
