<?php

namespace App\Services;

use App\Models\CrosswordWord;
use App\Models\GameHistory;
use App\Models\GameMatch;
use App\Models\GameMatchPlayer;
use App\Models\User;
use Illuminate\Support\Carbon;

/**
 * Stores the shared match summary that every room/duel result carries. The
 * first result of a match creates it; later results only link their history
 * row to their seat. Crossword word usage is counted once per match.
 */
class MatchRecorder
{
    /**
     * @param  array{key: string, mode: string, pin?: ?string, level?: ?int, grade: int, started_at: string, ended_at: string, finished: bool, players: list<array<string, mixed>>, words?: ?list<array{key: string, solved: bool}>}  $match
     */
    public function record(string $gameKey, array $match, GameHistory $history): GameMatch
    {
        $existing = GameMatch::query()->where('match_key', $match['key'])->lockForUpdate()->first();
        $gameMatch = $existing ?? $this->create($gameKey, $match);

        $seat = collect($match['players'])->search(fn (array $player): bool => (int) ($player['user_id'] ?? 0) === $history->user_id);
        if ($seat !== false) {
            GameMatchPlayer::query()
                ->where('game_match_id', $gameMatch->id)
                ->where('seat', $seat)
                ->update(['game_history_id' => $history->id]);
        }

        return $gameMatch;
    }

    /** @param  array<string, mixed>  $match */
    private function create(string $gameKey, array $match): GameMatch
    {
        $userIds = collect($match['players'])->pluck('user_id')->filter()->map(fn ($id): int => (int) $id);
        $known = $userIds->isEmpty() ? collect() : User::query()->whereKey($userIds)->pluck('id');

        $gameMatch = GameMatch::query()->create([
            'match_key' => $match['key'],
            'game_key' => $gameKey,
            'mode' => $match['mode'],
            'pin' => $match['pin'] ?? null,
            'level' => ($match['level'] ?? 0) > 0 ? (int) $match['level'] : null,
            'grade' => $match['grade'],
            'players_count' => count($match['players']),
            'finished' => (bool) $match['finished'],
            'words' => $match['words'] ?? null,
            'started_at' => Carbon::parse($match['started_at']),
            'ended_at' => Carbon::parse($match['ended_at']),
        ]);

        foreach ($match['players'] as $seat => $player) {
            $userId = (int) ($player['user_id'] ?? 0);
            $gameMatch->players()->create([
                'seat' => $seat,
                'user_id' => $userId > 0 && $known->contains($userId) ? $userId : null,
                'name' => mb_substr((string) $player['name'], 0, 60),
                'grade' => (int) $player['grade'],
                'is_local' => (bool) ($player['local'] ?? false),
                'is_bot' => (bool) ($player['bot'] ?? false),
                'left_early' => (bool) ($player['left'] ?? false),
                'rank' => (int) $player['rank'],
                'score' => max(0, (int) $player['score']),
                'correct' => (int) $player['correct'],
                'wrong' => (int) $player['wrong'],
            ]);
        }

        $this->countWords($match['words'] ?? []);

        return $gameMatch;
    }

    /** @param  list<array{key: string, solved: bool}>  $words */
    private function countWords(array $words): void
    {
        foreach ($words as $word) {
            CrosswordWord::query()->where('key', $word['key'])->incrementEach([
                'times_used' => 1,
                'times_solved' => $word['solved'] ? 1 : 0,
            ]);
        }
    }
}
