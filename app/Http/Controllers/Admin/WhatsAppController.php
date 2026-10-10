<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\WhatsAppLogRequest;
use App\Http\Requests\Admin\WhatsAppPhoneRequest;
use App\Http\Requests\Admin\WhatsAppSettingsRequest;
use App\Jobs\SendWhatsAppMessage;
use App\Models\WhatsAppMessage;
use App\Services\WhatsApp\GowaClient;
use App\Services\WhatsApp\PhoneNumber;
use App\Services\WhatsApp\WhatsAppSettings;
use App\Services\WhatsApp\WhatsAppStats;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;
use RuntimeException;

/**
 * WhatsApp notifications (GOWA container): link the sender number by QR or
 * pairing code, master and per-event switches, test message, delivery log
 * and its detail modal.
 */
class WhatsAppController extends Controller
{
    /** Latest messages shown on the settings page. */
    public const RECENT_LIMIT = 5;

    public const LOG_PER_PAGE = 25;

    public function __construct(private GowaClient $client, private WhatsAppSettings $settings) {}

    public function index(WhatsAppStats $stats): Response
    {
        $labels = $this->settings->eventLabels();

        return Inertia::render('admin/whatsapp', [
            'connection' => $this->connection(),
            'settings' => [
                'enabled' => $this->settings->enabled(),
                'events' => $this->settings->events(),
            ],
            'deviceId' => $this->client->deviceId(),
            'stats' => $stats->summary(),
            'messages' => WhatsAppMessage::query()
                ->with('user:id,name,email')
                ->latest('id')
                ->limit(self::RECENT_LIMIT)
                ->get()
                ->map(fn (WhatsAppMessage $message): array => $message->toAdminArray($labels))
                ->all(),
        ]);
    }

    /** Full, filterable delivery log; a row opens the detail modal. */
    public function log(WhatsAppLogRequest $request, WhatsAppStats $stats): Response
    {
        $filters = $request->filters();
        $labels = $this->settings->eventLabels();

        $messages = WhatsAppMessage::query()
            ->with('user:id,name,email')
            ->when($filters['status'] ?? null, fn (Builder $query, string $status) => $query->where('status', $status))
            ->when($filters['event'] ?? null, fn (Builder $query, string $event) => $query->where('event', $event))
            ->when($filters['date_from'] ?? null, fn (Builder $query, string $date) => $query->where('created_at', '>=', $date.' 00:00:00'))
            ->when($filters['date_to'] ?? null, fn (Builder $query, string $date) => $query->where('created_at', '<=', $date.' 23:59:59'))
            ->when($filters['search'] ?? null, function (Builder $query, string $search): void {
                $like = '%'.str_replace(['!', '%', '_'], ['!!', '!%', '!_'], $search).'%';
                $digits = preg_replace('/\D+/', '', $search) ?? '';
                $normalized = PhoneNumber::normalizeIndonesian($search);
                $phone = $normalized !== null && ctype_digit($normalized) ? $normalized : $digits;
                $contains = fn (Builder $query, string $column, string $boolean = 'or') => $query->whereRaw("{$column} LIKE ? ESCAPE '!'", [$like], $boolean);
                $query->where(fn (Builder $query) => $query
                    ->tap(fn (Builder $query) => $contains($query, 'body', 'and'))
                    ->tap(fn (Builder $query) => $contains($query, 'error'))
                    ->orWhereHas('user', fn (Builder $user) => $user
                        ->tap(fn (Builder $user) => $contains($user, 'name', 'and'))
                        ->tap(fn (Builder $user) => $contains($user, 'email')))
                    ->when(strlen($digits) >= 4, fn (Builder $query) => $query->orWhere('phone', 'like', '%'.$phone.'%')));
            })
            ->latest('id')
            ->paginate(self::LOG_PER_PAGE)
            ->withQueryString()
            ->through(fn (WhatsAppMessage $message): array => $message->toAdminArray($labels));

        $counts = WhatsAppMessage::query()->selectRaw('status, COUNT(*) as total')->groupBy('status')->pluck('total', 'status');

        return Inertia::render('admin/whatsapp-log', [
            'messages' => $messages,
            'filters' => (object) $filters,
            'events' => collect(WhatsAppMessage::query()->distinct()->orderBy('event')->pluck('event'))
                ->map(fn (string $event): array => ['value' => $event, 'label' => $labels[$event] ?? $event])
                ->values()
                ->all(),
            'totals' => [
                'all' => (int) $counts->sum(),
                ...collect(WhatsAppMessage::STATUSES)->mapWithKeys(fn (string $status): array => [$status => (int) ($counts[$status] ?? 0)])->all(),
            ],
            'successRate' => $stats->summary()['success_rate'],
        ]);
    }

    /** JSON detail for the log modal. */
    public function show(WhatsAppMessage $message): JsonResponse
    {
        $message->load('user:id,name,email');

        return response()->json($message->toAdminArray($this->settings->eventLabels()));
    }

    /** Polled by the page while the QR code is on screen. */
    public function status(): JsonResponse
    {
        return response()->json($this->connection());
    }

    public function qr(Request $request): JsonResponse
    {
        try {
            $login = $this->client->loginQr();
        } catch (RuntimeException $exception) {
            return response()->json(['message' => $exception->getMessage()], 422);
        }
        activity()->causedBy($request->user())->log('Requested WhatsApp QR login');

        return response()->json($login);
    }

    public function code(WhatsAppPhoneRequest $request): JsonResponse
    {
        try {
            $code = $this->client->loginCode($request->validated('phone'));
        } catch (RuntimeException $exception) {
            return response()->json(['message' => $exception->getMessage()], 422);
        }
        activity()->causedBy($request->user())->log('Requested WhatsApp pairing code');

        return response()->json(['code' => $code]);
    }

    public function logout(Request $request): RedirectResponse
    {
        return $this->attempt(function () use ($request): string {
            $this->client->logout();
            activity()->causedBy($request->user())->log('Unlinked WhatsApp sender');

            return __('whatsapp.flash.logged_out');
        });
    }

    public function reconnect(Request $request): RedirectResponse
    {
        return $this->attempt(function (): string {
            $this->client->reconnect();

            return __('whatsapp.flash.reconnected');
        });
    }

    public function update(WhatsAppSettingsRequest $request): RedirectResponse
    {
        $this->settings->save($request->boolean('enabled'), (array) $request->validated('events'));
        activity()->causedBy($request->user())->withProperties($request->validated())->log('Updated WhatsApp notification settings');

        return back()->with('success', __('whatsapp.flash.settings_saved'));
    }

    public function test(WhatsAppPhoneRequest $request): RedirectResponse
    {
        $message = WhatsAppMessage::query()->create([
            'user_id' => $request->user()->id,
            'event' => WhatsAppMessage::TEST_EVENT,
            'phone' => $request->validated('phone'),
            'body' => __('whatsapp.events.test', ['app' => config('app.name')]),
        ]);
        SendWhatsAppMessage::dispatch($message);
        activity()->causedBy($request->user())->withProperties(['phone' => PhoneNumber::mask($message->phone)])->log('Sent WhatsApp test message');

        return back()->with('success', __('whatsapp.flash.test_queued'));
    }

    public function retry(Request $request, WhatsAppMessage $message): RedirectResponse
    {
        abort_unless($message->status === WhatsAppMessage::FAILED, 404);

        $message->forceFill(['status' => WhatsAppMessage::QUEUED, 'error' => null])->save();
        SendWhatsAppMessage::dispatch($message);
        activity()->causedBy($request->user())->performedOn($message)->log('Retried WhatsApp message');

        return back()->with('success', __('whatsapp.flash.retried'));
    }

    /**
     * @return array{reachable: bool, connected: bool, logged_in: bool, number: ?string, error: ?string}
     */
    private function connection(): array
    {
        try {
            $status = $this->client->status();
        } catch (RuntimeException $exception) {
            return ['reachable' => false, 'connected' => false, 'logged_in' => false, 'number' => null, 'error' => $exception->getMessage()];
        }

        $number = $status['jid'] !== null ? strtok($status['jid'], '@:') : null;

        return [
            'reachable' => true,
            'connected' => $status['connected'],
            'logged_in' => $status['logged_in'],
            'number' => $number !== false && $number !== null ? $number : null,
            'error' => null,
        ];
    }

    /** @param  callable(): string  $action */
    private function attempt(callable $action): RedirectResponse
    {
        try {
            return back()->with('success', $action());
        } catch (RuntimeException $exception) {
            return back()->withErrors(['whatsapp' => $exception->getMessage()]);
        }
    }
}
