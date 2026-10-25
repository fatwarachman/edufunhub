<?php

namespace App\Services\Ai;

/**
 * Splits blueprint text into retrieval sections: headings (BAGIAN, STIMULUS,
 * Soal No., numbered titles, short upper-case lines) start a new section,
 * long sections are cut at paragraph or sentence boundaries, and every
 * section remembers the grades it mentions.
 */
class BlueprintChunker
{
    /** Target section length in characters. */
    public const TARGET = 1400;

    /** Hard upper bound for one section. */
    public const MAX = 2200;

    /** Sections shorter than this are merged into the next one. */
    public const MIN = 250;

    /**
     * @return list<array{heading: ?string, content: string, grades: list<int>}>
     */
    public function chunk(string $text): array
    {
        $sections = [];
        $heading = null;
        $buffer = [];

        foreach ($this->withoutRepeatedLines(BlueprintTextExtractor::tidy($text)) as $line) {
            $line = trim($line);
            $isHeading = $line !== '' && $this->isHeading($line);
            $content = array_values(array_filter($buffer, fn (string $kept): bool => $kept !== ''));
            $justHeading = count($content) === 1 && $this->isHeading($content[0]) && ! $this->startsSection($line);
            if ($isHeading && $content !== [] && ! $justHeading) {
                $sections[] = ['heading' => $heading, 'lines' => $buffer];
                $buffer = [];
                $heading = null;
            }
            if ($isHeading && $heading === null) {
                $heading = $line;
            }
            $buffer[] = $line;
        }
        if ($this->length($buffer) > 0) {
            $sections[] = ['heading' => $heading, 'lines' => $buffer];
        }

        $chunks = [];
        foreach ($sections as $section) {
            foreach ($this->split(trim(implode("\n", $section['lines']))) as $piece) {
                if ($piece === '') {
                    continue;
                }
                $chunks[] = [
                    'heading' => $section['heading'] !== null ? mb_substr($section['heading'], 0, 250) : null,
                    'content' => $piece,
                    'grades' => self::grades(($section['heading'] ?? '')."\n".$piece),
                ];
            }
        }

        return $this->mergeSmall($chunks);
    }

    /** Strong section starts that never join the heading above them. */
    private function startsSection(string $line): bool
    {
        return preg_match('/^(BAGIAN|BAB|STIMULUS|SOAL NO\.?|KELAS|GRADE|PART|SECTION|UNIT|CHAPTER)\b/iu', $line) === 1;
    }

    /** Lines that start a new section of a kisi-kisi document. */
    public function isHeading(string $line): bool
    {
        if (mb_strlen($line) > 120) {
            return false;
        }
        if (preg_match('/^(BAGIAN|BAB|STIMULUS|LAMPIRAN|SOAL NO\.?|NOMOR SOAL|PART|SECTION|UNIT|CHAPTER)\b/iu', $line) === 1) {
            return true;
        }
        if (preg_match('/^(KOMPETENSI|INDIKATOR|MATERI|LEVEL KOGNITIF|KISI)\b[^:]{0,60}$/iu', $line) === 1 && mb_strlen($line) <= 60) {
            return true;
        }
        if (preg_match('/^(KUNCI|JAWABAN|ANSWER|KEY)\b/iu', $line) === 1) {
            return false;
        }
        if (preg_match('/^([IVX]{1,5}|\d{1,2}(\.\d{1,2})+)[\.\)]?\s+\p{Lu}/u', $line) === 1 && mb_strlen($line) <= 80) {
            return true;
        }
        $letters = preg_replace('/[^\p{L}]/u', '', $line) ?? '';

        return mb_strlen($letters) >= 8 && mb_strlen($line) <= 90 && $letters === mb_strtoupper($letters);
    }

    /**
     * Grades a text mentions: "kelas 8", "grade 10", "kelas 7-9", or a
     * school level (SD = 1-6, SMP/MTs = 7-9, SMA/SMK/MA = 10-12, TK = 0).
     *
     * @return list<int>
     */
    public static function grades(string $text): array
    {
        $grades = [];
        if (preg_match_all('/\b(?:kelas|grade|class)\s*(\d{1,2}|[IVX]{1,4})(?:\s*(?:-|–|s\.?d\.?|sampai|hingga|to)\s*(\d{1,2}|[IVX]{1,4}))?/iu', $text, $matches, PREG_SET_ORDER)) {
            foreach ($matches as $match) {
                $from = self::number($match[1]);
                $to = isset($match[2]) && $match[2] !== '' ? self::number($match[2]) : $from;
                if ($from !== null && $to !== null && $from >= 1 && $to <= 12 && $from <= $to) {
                    array_push($grades, ...range($from, $to));
                }
            }
        }
        if ($grades !== []) {
            $grades = array_values(array_unique($grades));
            sort($grades);

            return $grades;
        }
        $levels = [
            '/\b(TK|PAUD|RA)\b/u' => [0],
            '/\b(SD|MI)\b/u' => range(1, 6),
            '/\b(SMP|MTs)\b/u' => range(7, 9),
            '/\b(SMA|SMK|MA|MAK)\b/u' => range(10, 12),
        ];
        foreach ($levels as $pattern => $range) {
            if (preg_match($pattern, $text) === 1) {
                array_push($grades, ...$range);
            }
        }

        $grades = array_values(array_unique($grades));
        sort($grades);

        return $grades;
    }

    private static function number(string $value): ?int
    {
        if (ctype_digit($value)) {
            return (int) $value;
        }
        $roman = ['I' => 1, 'II' => 2, 'III' => 3, 'IV' => 4, 'V' => 5, 'VI' => 6, 'VII' => 7, 'VIII' => 8, 'IX' => 9, 'X' => 10, 'XI' => 11, 'XII' => 12];

        return $roman[strtoupper($value)] ?? null;
    }

    /**
     * Lines of the text without page headers and footers: lines (numbers
     * ignored, e.g. "Halaman 6 dari 12") that repeat three or more times,
     * always far apart. Lines repeated next to each other are content.
     *
     * @return list<string>
     */
    private function withoutRepeatedLines(string $text): array
    {
        $lines = preg_split('/\n/u', $text) ?: [];
        $key = fn (string $line): string => (string) preg_replace('/\d+/u', '#', mb_strtolower(trim($line)));
        $positions = [];
        foreach ($lines as $index => $line) {
            if (mb_strlen(trim($line)) >= 12) {
                $positions[$key($line)][] = $index;
            }
        }

        $repeated = [];
        foreach ($positions as $lineKey => $indexes) {
            if (count($indexes) < 3) {
                continue;
            }
            $gaps = array_map(fn (int $a, int $b): int => $b - $a, array_slice($indexes, 0, -1), array_slice($indexes, 1));
            if (min($gaps) >= 8) {
                $repeated[$lineKey] = true;
            }
        }

        return array_values(array_filter($lines, fn (string $line): bool => ! isset($repeated[$key($line)])));
    }

    /** @param  list<string>  $lines */
    private function length(array $lines): int
    {
        return mb_strlen(trim(implode("\n", $lines)));
    }

    /**
     * Cut a long section at paragraph, line or sentence boundaries.
     *
     * @return list<string>
     */
    private function split(string $text): array
    {
        if (mb_strlen($text) <= self::MAX) {
            return [$text];
        }

        $units = preg_split('/(?<=\n)|(?<=[.!?])\s+(?=\p{Lu})/u', $text) ?: [$text];
        $pieces = [];
        $current = '';
        foreach ($units as $unit) {
            while (mb_strlen($unit) > self::MAX) {
                $pieces[] = trim($current.mb_substr($unit, 0, self::TARGET));
                $unit = mb_substr($unit, self::TARGET);
                $current = '';
            }
            if ($current !== '' && mb_strlen($current) + mb_strlen($unit) > self::TARGET) {
                $pieces[] = trim($current);
                $current = '';
            }
            $current .= ($current !== '' && ! str_ends_with($current, "\n") ? ' ' : '').$unit;
        }
        if (trim($current) !== '') {
            $pieces[] = trim($current);
        }

        return $pieces;
    }

    /**
     * @param  list<array{heading: ?string, content: string, grades: list<int>}>  $chunks
     * @return list<array{heading: ?string, content: string, grades: list<int>}>
     */
    private function mergeSmall(array $chunks): array
    {
        $join = function (array $first, array $second, ?string $heading): array {
            $grades = array_values(array_unique([...$first['grades'], ...$second['grades']]));
            sort($grades);

            return ['heading' => $heading, 'content' => $first['content']."\n".$second['content'], 'grades' => $grades];
        };
        $fits = fn (array $a, array $b): bool => mb_strlen($a['content']) + mb_strlen($b['content']) <= self::MAX;

        $merged = [];
        $pending = null;
        foreach ($chunks as $chunk) {
            if ($pending !== null) {
                $chunk = $fits($pending, $chunk)
                    ? [...$join($pending, $chunk, $chunk['heading'] ?? $pending['heading']), ...($chunk['grades'] !== [] ? ['grades' => $chunk['grades']] : [])]
                    : $chunk;
                if (! $fits($pending, $chunk) && $chunk['content'] !== $pending['content']) {
                    $merged[] = $pending;
                }
                $pending = null;
            }
            if (mb_strlen($chunk['content']) < self::MIN) {
                $last = array_key_last($merged);
                if ($last !== null && $merged[$last]['heading'] === $chunk['heading'] && $fits($merged[$last], $chunk)) {
                    $merged[$last] = $join($merged[$last], $chunk, $chunk['heading']);
                } else {
                    $pending = $chunk;
                }

                continue;
            }
            $merged[] = $chunk;
        }
        if ($pending !== null) {
            $last = array_key_last($merged);
            if ($last !== null && $fits($merged[$last], $pending)) {
                $merged[$last] = $join($merged[$last], $pending, $merged[$last]['heading']);
            } else {
                $merged[] = $pending;
            }
        }

        return $merged;
    }
}
