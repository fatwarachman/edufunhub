<?php

/*
|--------------------------------------------------------------------------
| Player badges
|--------------------------------------------------------------------------
|
| Badges reward a mix of how often a player plays and how many challenges
| they complete. A challenge counts as completed when the player answered
| at least `pass_percent` of the questions correctly, or won a match.
|
| Every badge lists the minimum values it needs (all must be met):
|  - plays:        finished games (all time)
|  - completed:    completed challenges (all time)
|  - success_rate: completed / plays × 100
|  - games:        distinct games played
|  - active_days:  distinct days with at least one game
|  - wins:         matches won against other players
|  - streak:       consecutive days played (ending today or yesterday)
|
| Badges are listed from easiest to rarest. Tiers drive the colour.
|
*/

return [
    'pass_percent' => 70,

    'badges' => [
        'starter' => [
            'icon' => 'sparkles',
            'tier' => 'bronze',
            'rules' => ['plays' => 1],
        ],
        'cool' => [
            'icon' => 'sunglasses',
            'tier' => 'bronze',
            'rules' => ['plays' => 10, 'completed' => 5],
        ],
        'diligent' => [
            'icon' => 'calendar-check',
            'tier' => 'silver',
            'rules' => ['active_days' => 7, 'plays' => 20],
        ],
        'creative' => [
            'icon' => 'palette',
            'tier' => 'silver',
            'rules' => ['games' => 5, 'completed' => 10],
        ],
        'champion' => [
            'icon' => 'trophy',
            'tier' => 'silver',
            'rules' => ['wins' => 5],
        ],
        'on_fire' => [
            'icon' => 'flame',
            'tier' => 'gold',
            'rules' => ['streak' => 5],
        ],
        'smart' => [
            'icon' => 'lightbulb',
            'tier' => 'gold',
            'rules' => ['completed' => 25, 'success_rate' => 70],
        ],
        'explorer' => [
            'icon' => 'compass',
            'tier' => 'gold',
            'rules' => ['games' => 9, 'plays' => 40],
        ],
        'genius' => [
            'icon' => 'brain',
            'tier' => 'legend',
            'rules' => ['plays' => 50, 'completed' => 40, 'success_rate' => 80],
        ],
        'legend' => [
            'icon' => 'crown',
            'tier' => 'legend',
            'rules' => ['plays' => 150, 'completed' => 100, 'active_days' => 30],
        ],
    ],
];
