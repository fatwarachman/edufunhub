<?php

return [
    /*
    | Games listed on the player portal and dashboard.
    |
    | awards_points: only games whose results are verified server-side (Go game service)
    | may award points. Client-only demos must stay false.
    | guest_playable: the game page opens without signing in (offline demo).
    | multiplayer: the game uses the standard invite flow (PIN room + link
    | /games/{key}/join/{pin}, see GameInviteController and docs/multiplayer.md).
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
                    'guest_playable' => false,
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
                    'min_grade' => 0,
                    'max_grade' => 12,
                    'awards_points' => true,
                    'requires_grade' => false,
                    'guest_playable' => true,
                    'multiplayer' => true,
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
                    'guest_playable' => true,
                ],
                [
                    'key' => 'quiz-duel',
                    'titleKey' => 'player.duel',
                    'descriptionKey' => 'portal.games.duel',
                    'route' => 'games.quiz-duel',
                    'icon' => 'swords',
                    'accent' => '#ff6584',
                    'min_grade' => 0,
                    'max_grade' => 12,
                    'awards_points' => true,
                    'requires_grade' => true,
                    'guest_playable' => false,
                    'multiplayer' => true,
                ],
            ],
        ],
        [
            'key' => 'puzzle',
            'titleKey' => 'player.puzzle',
            'games' => [
                [
                    'key' => 'crossword',
                    'titleKey' => 'player.crossword',
                    'descriptionKey' => 'portal.games.crossword',
                    'route' => 'games.crossword',
                    'icon' => 'grid',
                    'accent' => '#0ea5e9',
                    'min_grade' => 0,
                    'max_grade' => 12,
                    'awards_points' => true,
                    'requires_grade' => false,
                    'guest_playable' => false,
                    'multiplayer' => true,
                ],
            ],
        ],
        [
            'key' => 'arcade',
            'titleKey' => 'player.arcade',
            'games' => [
                [
                    'key' => 'knowledge-train',
                    'titleKey' => 'player.train',
                    'descriptionKey' => 'portal.games.train',
                    'route' => 'games.knowledge-train',
                    'icon' => 'train',
                    'accent' => '#00c9a7',
                    'min_grade' => 0,
                    'max_grade' => 12,
                    'awards_points' => true,
                    'requires_grade' => true,
                    'guest_playable' => false,
                ],
            ],
        ],
    ],

    /*
    | Points needed per player level on the portal.
    */
    'points_per_level' => 200,
];
