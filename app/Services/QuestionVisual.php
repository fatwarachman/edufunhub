<?php

namespace App\Services;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * Optional illustration attached to a bank question (TKJ style visuals).
 * Stored on the question as JSON, synced to the Go service unchanged and
 * rendered by the shared React QuestionMedia component.
 *
 * Kinds:
 * - image: uploaded picture (`src` under /games/question-media/).
 * - cable: UTP or fibre wires in order (pin 1 first), each a colour and an optional stripe.
 * - topology: a network topology diagram (star, bus, ring, mesh, tree, point).
 * - terminal: a few monospace console lines (ping, ipconfig, router CLI).
 * Every kind may carry a bilingual caption.
 */
class QuestionVisual
{
    public const KINDS = ['image', 'cable', 'topology', 'terminal'];

    public const CABLE_STYLES = ['utp', 'fiber'];

    public const TOPOLOGIES = ['star', 'bus', 'ring', 'mesh', 'tree', 'point'];

    public const MIN_WIRES = 2;

    public const MAX_WIRES = 12;

    public const MAX_LINES = 12;

    public const MAX_LINE = 80;

    public const MAX_CAPTION = 120;

    public const FOLDER = 'question-media';

    public const URL_PREFIX = '/games/question-media/';

    public const FILE_PATTERN = '[A-Za-z0-9]{40}\.(jpg|png|webp)';

    private const HEX = '/^#[0-9a-fA-F]{6}$/';

    /**
     * Validation rules for a `visual` input (all nested under the given key).
     *
     * @return array<string, array<mixed>>
     */
    public static function rules(string $key = 'visual'): array
    {
        $kind = fn (string $value): string => 'required_if:'.$key.'.kind,'.$value;

        return [
            $key => ['nullable', 'array'],
            $key.'.kind' => ['required_with:'.$key, 'string', 'in:'.implode(',', self::KINDS)],
            $key.'.src' => [$kind('image'), 'nullable', 'string', 'max:120', 'regex:#^'.preg_quote(self::URL_PREFIX, '#').self::FILE_PATTERN.'$#'],
            $key.'.alt' => ['nullable', 'array'],
            $key.'.alt.id' => ['nullable', 'string', 'max:'.self::MAX_CAPTION],
            $key.'.alt.en' => ['nullable', 'string', 'max:'.self::MAX_CAPTION],
            $key.'.style' => [$kind('cable'), 'nullable', 'string', 'in:'.implode(',', self::CABLE_STYLES)],
            $key.'.wires' => [$kind('cable'), 'nullable', 'array', 'min:'.self::MIN_WIRES, 'max:'.self::MAX_WIRES],
            $key.'.wires.*.color' => ['required', 'string', 'regex:'.self::HEX],
            $key.'.wires.*.stripe' => ['nullable', 'string', 'regex:'.self::HEX],
            $key.'.shape' => [$kind('topology'), 'nullable', 'string', 'in:'.implode(',', self::TOPOLOGIES)],
            $key.'.lines' => [$kind('terminal'), 'nullable', 'array', 'min:1', 'max:'.self::MAX_LINES],
            $key.'.lines.*' => ['nullable', 'string', 'max:'.self::MAX_LINE],
            $key.'.caption' => ['nullable', 'array'],
            $key.'.caption.id' => ['nullable', 'string', 'max:'.self::MAX_CAPTION],
            $key.'.caption.en' => ['nullable', 'string', 'max:'.self::MAX_CAPTION],
        ];
    }

    /**
     * Keeps only the fields of the chosen kind, trimmed; null when there is
     * no visual. Input must already be validated by rules().
     *
     * @param  array<string, mixed>|null  $visual
     * @return array<string, mixed>|null
     */
    public static function normalize(?array $visual): ?array
    {
        $kind = $visual['kind'] ?? null;
        if (! is_string($kind) || ! in_array($kind, self::KINDS, true)) {
            return null;
        }

        $out = match ($kind) {
            'image' => ['kind' => 'image', 'src' => (string) $visual['src'], 'alt' => self::text($visual['alt'] ?? null)],
            'cable' => [
                'kind' => 'cable',
                'style' => in_array($visual['style'] ?? null, self::CABLE_STYLES, true) ? $visual['style'] : 'utp',
                'wires' => array_values(array_map(fn (array $wire): array => array_filter([
                    'color' => strtolower((string) $wire['color']),
                    'stripe' => filled($wire['stripe'] ?? null) ? strtolower((string) $wire['stripe']) : null,
                ]), (array) $visual['wires'])),
            ],
            'topology' => ['kind' => 'topology', 'shape' => (string) $visual['shape']],
            'terminal' => ['kind' => 'terminal', 'lines' => array_values(array_map(
                fn (mixed $line): string => rtrim(mb_substr((string) $line, 0, self::MAX_LINE)),
                (array) $visual['lines'],
            ))],
        };

        $out['caption'] = self::text($visual['caption'] ?? null);

        return array_filter($out, fn (mixed $value): bool => $value !== null);
    }

    /**
     * Stores an uploaded question picture and returns its public URL.
     */
    public static function storeImage(UploadedFile $file): string
    {
        $extension = match ($file->getMimeType()) {
            'image/png' => 'png',
            'image/webp' => 'webp',
            default => 'jpg',
        };
        $name = Str::random(40).'.'.$extension;
        $file->storeAs(self::FOLDER, $name, 'public');

        return self::URL_PREFIX.$name;
    }

    /** Storage path of a public URL, or null when it is not a question picture. */
    public static function pathFor(string $src): ?string
    {
        return preg_match('#^'.preg_quote(self::URL_PREFIX, '#').'('.self::FILE_PATTERN.')$#', $src, $match) === 1
            ? self::FOLDER.'/'.$match[1]
            : null;
    }

    /** Whether the uploaded file for an image visual exists. */
    public static function imageExists(string $src): bool
    {
        $path = self::pathFor($src);

        return $path !== null && Storage::disk('public')->exists($path);
    }

    /**
     * @return array{id: string, en: string}|null
     */
    private static function text(mixed $text): ?array
    {
        if (! is_array($text)) {
            return null;
        }
        $id = trim((string) ($text['id'] ?? ''));
        $en = trim((string) ($text['en'] ?? ''));

        return $id === '' && $en === '' ? null : ['id' => $id, 'en' => $en];
    }
}
