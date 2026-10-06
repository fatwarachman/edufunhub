<?php

namespace App\Services;

use App\Models\GameHistory;
use App\Models\Question;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Collection;
use Illuminate\Support\Str;
use Spatie\Activitylog\Models\Activity;

/**
 * Turns activity log entries into what the admin panel shows: the record an
 * entry is about (by name, also after it was deleted), the fields a change
 * touched and a field-by-field diff with secrets masked.
 */
class ActivityLogPresenter
{
    /** Fields left out of the one-line "changed fields" summary. */
    public const QUIET_FIELDS = ['password', 'remember_token', 'two_factor_secret', 'two_factor_recovery_codes', 'two_factor_confirmed_at', 'updated_at', 'last_seen_at'];

    /** Keys whose values are never shown. */
    private const SECRET_PATTERN = '/(^|_)password$|secret|token|api_key|recovery_codes/i';

    /** @var array<string, Collection<int|string, Model>> */
    private array $subjects = [];

    /**
     * Batch-load the subjects of the given entries: one query per type,
     * soft-deleted rows included.
     *
     * @param  iterable<Activity>  $activities
     */
    public function preload(iterable $activities): void
    {
        $idsByType = [];
        foreach ($activities as $activity) {
            if ($activity->subject_type !== null && $activity->subject_id !== null) {
                $idsByType[$activity->subject_type][] = $activity->subject_id;
            }
        }

        foreach ($idsByType as $type => $ids) {
            if (! class_exists($type) || ! is_subclass_of($type, Model::class)) {
                continue;
            }

            $query = $type::query();
            if (in_array(SoftDeletes::class, class_uses_recursive($type), true)) {
                $query->withTrashed();
            }

            $this->subjects[$type] = $query->whereIn((new $type)->getKeyName(), array_unique($ids))->get()->keyBy(fn (Model $model) => $model->getKey());
        }
    }

    /**
     * The record an entry is about, named from the live row or, once it is
     * gone, from the snapshot stored with the entry.
     *
     * @return array{type: string, id: int|string|null, name: ?string, detail: ?string, exists: bool, url: ?string}|null
     */
    public function subject(Activity $activity, ?User $viewer = null): ?array
    {
        if ($activity->subject_type === null) {
            return null;
        }

        $model = $this->subjects[$activity->subject_type][$activity->subject_id] ?? null;
        $source = $model?->getAttributes() ?? $this->snapshot($activity);
        $trashed = $model !== null && method_exists($model, 'trashed') && $model->trashed();

        [$name, $detail] = match ($activity->subject_type) {
            User::class => [$source['name'] ?? null, $source['email'] ?? null],
            Question::class => [$this->snippet($source['prompt_id'] ?? $source['prompt_en'] ?? null), $source['key'] ?? null],
            GameHistory::class => [$source['game_name'] ?? $source['game_key'] ?? null, null],
            default => $this->genericName($source),
        };

        return [
            'type' => class_basename($activity->subject_type),
            'id' => $activity->subject_id,
            'name' => is_scalar($name) && $name !== '' ? (string) $name : null,
            'detail' => is_scalar($detail) && $detail !== '' && $detail !== $name ? (string) $detail : null,
            'exists' => $model !== null && ! $trashed,
            'url' => $model !== null && ! $trashed ? $this->url($activity->subject_type, $model, $viewer) : null,
        ];
    }

    /**
     * Names of the fields a change touched, without secrets and timestamps.
     *
     * @return list<string>
     */
    public function changedFields(Activity $activity): array
    {
        $old = $activity->properties?->get('old');
        $new = $activity->properties?->get('attributes');
        if (! is_array($old) || ! is_array($new)) {
            return [];
        }

        return collect(array_keys($new + $old))
            ->filter(fn (string $key): bool => ($old[$key] ?? null) != ($new[$key] ?? null))
            ->reject(fn (string $key): bool => in_array($key, self::QUIET_FIELDS, true) || $this->isSecret($key))
            ->values()
            ->all();
    }

    /**
     * Field-by-field values: changed fields for updates, the stored values for
     * created records, the last values for deleted ones.
     *
     * @return list<array{field: string, before: mixed, after: mixed, masked: bool}>
     */
    public function diff(Activity $activity): array
    {
        $old = $activity->properties?->get('old');
        $new = $activity->properties?->get('attributes');
        $old = is_array($old) ? $old : null;
        $new = is_array($new) ? $new : null;
        if ($old === null && $new === null) {
            return [];
        }

        $keys = array_keys(($new ?? []) + ($old ?? []));
        $keys = array_values(array_filter($keys, fn (string $key): bool => $old !== null && $new !== null
            ? ($old[$key] ?? null) != ($new[$key] ?? null)
            : ($old ?? $new)[$key] !== null && ($old ?? $new)[$key] !== ''));

        return array_map(function (string $key) use ($old, $new): array {
            $masked = $this->isSecret($key);

            return [
                'field' => $key,
                'before' => $masked || $old === null ? null : $this->sanitize($old[$key] ?? null),
                'after' => $masked || $new === null ? null : $this->sanitize($new[$key] ?? null),
                'masked' => $masked,
            ];
        }, $keys);
    }

    /** Which value columns the diff has: before, after or both. */
    public function diffMode(Activity $activity): ?string
    {
        $hasOld = is_array($activity->properties?->get('old'));
        $hasNew = is_array($activity->properties?->get('attributes'));

        return match (true) {
            $hasOld && $hasNew => 'both',
            $hasOld => 'before',
            $hasNew => 'after',
            default => null,
        };
    }

    /**
     * Other stored properties (bulk ids, settings group, …), secrets masked.
     *
     * @return list<array{key: string, value: mixed, masked: bool}>
     */
    public function extraProperties(Activity $activity): array
    {
        $properties = $activity->properties?->except(['old', 'attributes', 'ip_address', 'device'])->all() ?? [];

        return collect($properties)->map(fn (mixed $value, string $key): array => [
            'key' => $key,
            'value' => $this->isSecret($key) ? null : $this->sanitize($value),
            'masked' => $this->isSecret($key),
        ])->values()->all();
    }

    /**
     * Properties for a manual "updated" entry: the fields the last save
     * changed with their previous and new values.
     *
     * @return array{old: array<string, mixed>, attributes: array<string, mixed>}
     */
    public static function changes(Model $model): array
    {
        $changed = array_values(array_diff(array_keys($model->getChanges()), ['updated_at', ...$model->getHidden()]));
        $previous = $model->newInstance()->setRawAttributes($model->getPrevious());

        return [
            'old' => $previous->only($changed),
            'attributes' => $model->only($changed),
        ];
    }

    /**
     * Properties for a manual "deleted" entry: the record's fillable values,
     * so the log still names it after the row is gone.
     *
     * @return array{old: array<string, mixed>}
     */
    public static function snapshotOf(Model $model): array
    {
        return ['old' => $model->only($model->getFillable())];
    }

    /** Recursively drop secret values from nested arrays. */
    public function sanitize(mixed $value): mixed
    {
        if (! is_array($value)) {
            return $value;
        }

        foreach ($value as $key => $item) {
            $value[$key] = is_string($key) && $this->isSecret($key) ? '••••••' : $this->sanitize($item);
        }

        return $value;
    }

    private function isSecret(string $key): bool
    {
        return preg_match(self::SECRET_PATTERN, $key) === 1;
    }

    /** @return array<string, mixed> */
    private function snapshot(Activity $activity): array
    {
        $old = $activity->properties?->get('old');
        $new = $activity->properties?->get('attributes');

        return array_merge(is_array($old) ? $old : [], is_array($new) ? $new : []);
    }

    private function snippet(mixed $text): ?string
    {
        return is_string($text) && $text !== '' ? Str::limit(trim($text), 60) : null;
    }

    /**
     * @param  array<string, mixed>  $source
     * @return array{0: mixed, 1: mixed}
     */
    private function genericName(array $source): array
    {
        foreach (['name', 'title', 'name_id', 'title_id', 'name_en', 'title_en', 'label', 'answer'] as $column) {
            if (isset($source[$column]) && is_scalar($source[$column]) && $source[$column] !== '') {
                return [$source[$column], $source['key'] ?? null];
            }
        }

        return [$source['key'] ?? null, null];
    }

    private function url(string $type, Model $model, ?User $viewer): ?string
    {
        return match ($type) {
            User::class => route('admin.users.show', $model->getKey(), false),
            Question::class => $viewer?->is_superadmin ? route('admin.questions.show', $model->getKey(), false) : null,
            default => null,
        };
    }
}
