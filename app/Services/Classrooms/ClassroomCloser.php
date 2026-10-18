<?php

namespace App\Services\Classrooms;

use App\Models\Classroom;
use App\Services\Chat\ChatServiceClient;
use App\Services\GameServiceSigner;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Shuts a classroom down for its students the moment it ends (teacher ended
 * it early or the end time passed): closes every classroom game room in the
 * Go game container, disconnects the 3D classroom world and tells the
 * students' open pages live, so games and classroom screens close by
 * themselves. Runs once per classroom (`closed_at`); every call is best
 * effort and never throws.
 */
class ClassroomCloser
{
    public const EVENT = 'classroom_ended';

    public const TIMEOUT_SECONDS = 1.5;

    public function __construct(
        private GameServiceSigner $signer,
        private ClassroomWorldKicker $kicker,
        private ChatServiceClient $chat,
        private ClassroomAnnouncer $announcer,
    ) {}

    public function close(Classroom $classroom): void
    {
        $claimed = Classroom::query()
            ->whereKey($classroom->id)
            ->whereNull('closed_at')
            ->update(['closed_at' => now()]);
        if ($claimed === 0) {
            return;
        }

        $this->closeGameRooms($classroom->id);
        $this->kicker->kick($classroom->id);

        $members = $this->announcer->activeMemberIds($classroom);
        if ($members !== []) {
            $this->chat->publish($members, [
                't' => self::EVENT,
                'classroom_id' => $classroom->id,
                'pin' => $classroom->pin,
            ]);
        }
    }

    /**
     * Classrooms whose end time passed but were not closed yet.
     */
    public function closeEnded(): int
    {
        $count = 0;
        Classroom::query()
            ->whereNull('closed_at')
            ->where('ends_at', '<=', now())
            ->orderBy('id')
            ->chunkById(100, function ($classrooms) use (&$count): void {
                foreach ($classrooms as $classroom) {
                    $this->close($classroom);
                    $count++;
                }
            });

        return $count;
    }

    private function closeGameRooms(int $classroomId): void
    {
        if (! $this->signer->isConfigured()) {
            return;
        }

        foreach (['game-service.classroom_close_url', 'game-service.edu_kart_classroom_close_url'] as $urlKey) {
            $this->postClose((string) config($urlKey), $classroomId);
        }
    }

    private function postClose(string $url, int $classroomId): void
    {
        if ($url === '') {
            return;
        }

        try {
            $body = (string) json_encode(['classroom' => $classroomId]);
            $timestamp = (string) now()->getTimestamp();

            Http::timeout(self::TIMEOUT_SECONDS)
                ->connectTimeout(self::TIMEOUT_SECONDS)
                ->withHeaders([
                    'X-Game-Timestamp' => $timestamp,
                    'X-Game-Signature' => $this->signer->sign($timestamp, $body),
                ])
                ->withBody($body, 'application/json')
                ->post($url);
        } catch (Throwable $exception) {
            Log::warning('Classroom game rooms close failed.', [
                'classroom' => $classroomId,
                'url' => $url,
                'error' => $exception->getMessage(),
            ]);
        }
    }
}
