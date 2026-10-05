<?php

/*
| Ad inventory. Every game page gets the same placement keys, so a new game
| only renders <AdSlot placement="…"> (and plays jingles at its moments) to be
| sellable. Sizes and types limit which creatives may fill a placement.
*/

return [
    // Size formats a creative can be made in (width x height in px).
    'sizes' => [
        'leaderboard' => ['label' => 'Leaderboard 728×90', 'width' => 728, 'height' => 90],
        'banner' => ['label' => 'Banner 468×60', 'width' => 468, 'height' => 60],
        'mobile' => ['label' => 'Mobile banner 320×50', 'width' => 320, 'height' => 50],
        'rectangle' => ['label' => 'Rectangle 300×250', 'width' => 300, 'height' => 250],
        'square' => ['label' => 'Square 250×250', 'width' => 250, 'height' => 250],
        'skyscraper' => ['label' => 'Skyscraper 160×600', 'width' => 160, 'height' => 600],
        'badge' => ['label' => 'Logo badge 120×120', 'width' => 120, 'height' => 120],
    ],

    // Creative types: logo (image), motto (sentence), jingle (audio), item
    // (sponsored character item shown in the shop and worn in games).
    'types' => ['logo', 'motto', 'jingle', 'item'],

    // Placement catalog. `types` = creative types allowed, `sizes` = image
    // sizes allowed (logo only), `moment` = when a jingle plays.
    'placements' => [
        'arena.header' => ['label' => 'Arena · header strip', 'types' => ['logo', 'motto'], 'sizes' => ['leaderboard', 'banner', 'mobile']],
        'arena.sidebar' => ['label' => 'Arena · sidebar', 'types' => ['logo', 'motto'], 'sizes' => ['rectangle', 'square', 'skyscraper', 'badge']],
        'arena.board' => ['label' => 'Arena · board / field logo', 'types' => ['logo'], 'sizes' => ['badge', 'square']],
        'arena.loading' => ['label' => 'Arena · countdown / loading', 'types' => ['logo', 'motto'], 'sizes' => ['rectangle', 'square', 'badge']],
        'arena.result' => ['label' => 'Arena · result screen', 'types' => ['logo', 'motto'], 'sizes' => ['rectangle', 'banner', 'leaderboard', 'square']],
        'jingle.start' => ['label' => 'Jingle · game start', 'types' => ['jingle'], 'moment' => 'start'],
        'jingle.win' => ['label' => 'Jingle · win / finish', 'types' => ['jingle'], 'moment' => 'win'],
        'shop.item' => ['label' => 'Shop · sponsored character item', 'types' => ['item']],
    ],

    // Upload limits (kilobytes) and audio length cap (seconds).
    'max_image_kb' => 1024,
    'max_audio_kb' => 2048,
    'max_audio_seconds' => 15,

    // Signed serve tokens expire after this many seconds.
    'serve_ttl' => 6 * 3600,
];
