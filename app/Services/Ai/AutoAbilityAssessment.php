<?php

namespace App\Services\Ai;

use App\Jobs\GenerateAbilityAssessment;
use App\Models\GameHistory;
use App\Models\Setting;
use App\Models\User;
use App\Models\UserAbilityAssessment;
use Carbon\CarbonImmutable;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\Cache;

/**
 * Automatic AI ability analysis by answered questions per local day
 * (screen-time timezone, Asia/Jakarta by default). The first analysis of a
 * day starts at FIRST answered questions (default 100), every next one of
 * the same day after NEXT more (default 150): 100, 250, 400 … A new day
 * starts again at 0. Each milestone runs at most once; a game that jumps
 * over several milestones starts one analysis for the highest. While an
 * analysis is still running the next milestone waits and is picked up when
 * it finishes. The finished analysis goes to the player's WhatsApp
 * (GenerateAbilityAssessment) and is compared with the latest earlier one.
 */
class AutoAbilityAssessment
{
    public const DEFAULT_FIRST = 100;

    public const DEFAULT_NEXT = 150;

    /** Allowed range for both thresholds in the admin form. */
    public const BOUNDS = [10, 1000];

    public function __construct(private AiSettings $ai, private AbilityProfileBuilder $builder) {}

    public function enabled(): bool
    {
        return (bool) Setting::get('ai.auto_assessment.enabled', true);
    }

    public function first(): int
    {
        return $this->bounded((int) Setting::get('ai.auto_assessment.first', self::DEFAULT_FIRST), self::DEFAULT_FIRST);
    }

    public function next(): int
    {
        return $this->bounded((int) Setting::get('ai.auto_assessment.next', self::DEFAULT_NEXT), self::DEFAULT_NEXT);
    }

    public function save(bool $enabled, int $first, int $next): void
    {
        Setting::set('ai.auto_assessment.enabled', $enabled ? '1' : '0', AiSettings::GROUP);
        Setting::set('ai.auto_assessment.first', (string) $first, AiSettings::GROUP);
        Setting::set('ai.auto_assessment.next', (string) $next, AiSettings::GROUP);
    }

    /** @return array{enabled: bool, first: int, next: int, defaults: array{first: int, next: int}, bounds: list<int>} */
    public function toArray(): array
    {
        return [
            'enabled' => $this->enabled(),
            'first' => $this->first(),
            'next' => $this->next(),
            'defaults' => ['first' => self::DEFAULT_FIRST, 'next' => self::DEFAULT_NEXT],
            'bounds' => self::BOUNDS,
        ];
    }

    public function timezone(): string
    {
        return (string) config('screen-time.timezone', 'UTC');
    }

    /** Local day of a moment (default now). */
    public function dayOf(?\DateTimeInterface $moment = null): CarbonImmutable
    {
        return CarbonImmutable::instance($moment ?? now())->setTimezone($this->timezone())->startOfDay();
    }

    /** Questions the player answered (correct + wrong) on a local day. */
    public function answeredOn(User $user, CarbonImmutable $day): int
    {
        $start = $day->setTimezone($this->timezone())->startOfDay();

        return (int) GameHistory::query()
            ->where('user_id', $user->id)
            ->where('played_at', '>=', $start->utc())
            ->where('played_at', '<', $start->addDay()->utc())
            ->selectRaw('COALESCE(SUM(COALESCE(correct, 0) + COALESCE(wrong, 0)), 0) as answered')
            ->value('answered');
    }

    /**
     * Milestones reached with this many answered questions in one day:
     * 0 below FIRST, then 1 + one per NEXT more.
     */
    public function reached(int $answered): int
    {
        $first = $this->first();

        return $answered < $first ? 0 : 1 + intdiv($answered - $first, $this->next());
    }

    /** Answered questions needed for milestone $index (1-based). */
    public function threshold(int $index): int
    {
        return $this->first() + max(0, $index - 1) * $this->next();
    }

    /**
     * Start the analysis for the day's highest reached milestone, when it has
     * not run yet. Never throws for a reason the player could notice: a
     * failure here must not lose the game result.
     */
    public function check(User $user, ?\DateTimeInterface $moment = null): ?UserAbilityAssessment
    {
        if (! $this->enabled() || ! $this->ai->configured() || $user->disabled_at !== null) {
            return null;
        }

        $day = $this->dayOf($moment);
        $assessment = Cache::lock("ability-auto:{$user->id}", 10)->get(fn (): ?UserAbilityAssessment => $this->start($user, $day));
        if (! $assessment instanceof UserAbilityAssessment) {
            return null;
        }

        GenerateAbilityAssessment::dispatch($assessment);

        return $assessment;
    }

    private function start(User $user, CarbonImmutable $day): ?UserAbilityAssessment
    {
        $answered = $this->answeredOn($user, $day);
        $reached = $this->reached($answered);
        if ($reached === 0) {
            return null;
        }

        $done = (int) UserAbilityAssessment::query()
            ->where('user_id', $user->id)
            ->where('trigger', UserAbilityAssessment::TRIGGER_AUTO)
            ->whereDate('trigger_day', $day->toDateString())
            ->max('trigger_index');
        if ($reached <= $done) {
            return null;
        }

        UserAbilityAssessment::failStale($user->id);
        if (UserAbilityAssessment::query()->where('user_id', $user->id)->running()->exists()) {
            return null;
        }

        try {
            $assessment = UserAbilityAssessment::query()->create([
                'user_id' => $user->id,
                'requested_by' => null,
                'trigger' => UserAbilityAssessment::TRIGGER_AUTO,
                'trigger_day' => $day->toDateString(),
                'trigger_index' => $reached,
                'trigger_answered' => $answered,
                'status' => UserAbilityAssessment::PENDING,
                'model' => (string) $this->ai->model(),
                'input_snapshot' => $this->builder->build($user),
            ]);
        } catch (UniqueConstraintViolationException) {
            return null;
        }

        activity()->performedOn($user)
            ->withProperties(['assessment_id' => $assessment->id, 'day' => $day->toDateString(), 'milestone' => $reached, 'answered' => $answered])
            ->log('Started automatic AI ability analysis');

        return $assessment;
    }

    private function bounded(int $value, int $default): int
    {
        return $value >= self::BOUNDS[0] && $value <= self::BOUNDS[1] ? $value : $default;
    }
}
