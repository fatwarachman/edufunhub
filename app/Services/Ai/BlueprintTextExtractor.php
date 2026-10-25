<?php

namespace App\Services\Ai;

use RuntimeException;

/**
 * Reads the plain text of a question blueprint (kisi-kisi soal) file so the
 * AI question writer can follow it. Supports PDF (text based), DOCX, XLSX and
 * plain text without extra PHP extensions: ZIP containers are read with zlib,
 * PDF text is decoded from content streams with ToUnicode font maps.
 */
class BlueprintTextExtractor
{
    public const EXTENSIONS = ['pdf', 'docx', 'xlsx', 'txt', 'md', 'csv'];

    /**
     * @throws RuntimeException when the file has no readable text
     */
    public function extract(string $path, string $extension): string
    {
        $bytes = @file_get_contents($path);
        if ($bytes === false || $bytes === '') {
            throw new RuntimeException(__('blueprint.unreadable'));
        }

        $text = match (strtolower($extension)) {
            'pdf' => $this->pdf($bytes),
            'docx' => $this->docx($bytes),
            'xlsx' => $this->xlsx($bytes),
            'txt', 'md', 'csv' => $this->plain($bytes),
            default => throw new RuntimeException(__('blueprint.unsupported')),
        };

        $text = self::tidy($text);
        if (preg_match_all('/\p{L}/u', $text) < 20) {
            throw new RuntimeException(__('blueprint.no_text'));
        }

        return $text;
    }

    /** Normalise whitespace and drop control characters. */
    public static function tidy(string $text): string
    {
        if (! mb_check_encoding($text, 'UTF-8')) {
            $text = mb_convert_encoding($text, 'UTF-8', 'Windows-1252');
        }
        $text = str_replace(["\r\n", "\r"], "\n", $text);
        $text = (string) preg_replace('/[^\P{C}\n\t]/u', '', $text);
        $text = (string) preg_replace('/[ \t]+/u', ' ', $text);
        $text = (string) preg_replace('/ *\n */u', "\n", $text);
        $text = (string) preg_replace('/\n{3,}/u', "\n\n", $text);

        return trim($text);
    }

    private function plain(string $bytes): string
    {
        return str_starts_with($bytes, "\xEF\xBB\xBF") ? substr($bytes, 3) : $bytes;
    }

    private function docx(string $bytes): string
    {
        $xml = $this->zipEntries($bytes, fn (string $name): bool => $name === 'word/document.xml')['word/document.xml'] ?? null;
        if ($xml === null) {
            throw new RuntimeException(__('blueprint.unreadable'));
        }

        $xml = (string) preg_replace(
            ['/<w:tab\/>/', '/<w:br[^>]*\/>/', '/<\/w:p>\s*<\/w:tc>/', '/<\/w:tc>/', '/<\/w:tr>/', '/<\/w:p>/'],
            ["\t", "\n", ' | ', ' | ', "\n", "\n"],
            $xml,
        );
        $text = html_entity_decode(strip_tags($xml), ENT_QUOTES | ENT_XML1, 'UTF-8');

        return (string) preg_replace('/[ \t]*\|[ \t]*$/m', '', $text);
    }

    private function xlsx(string $bytes): string
    {
        $entries = $this->zipEntries($bytes, fn (string $name): bool => $name === 'xl/sharedStrings.xml' || $name === 'xl/workbook.xml'
            || preg_match('#^xl/worksheets/sheet\d+\.xml$#', $name) === 1);

        $shared = [];
        if (isset($entries['xl/sharedStrings.xml'])) {
            $doc = $this->xml($entries['xl/sharedStrings.xml']);
            foreach ($doc?->getElementsByTagName('si') ?? [] as $si) {
                $shared[] = $si->textContent;
            }
        }

        $sheets = array_filter($entries, fn (string $name): bool => str_starts_with($name, 'xl/worksheets/'), ARRAY_FILTER_USE_KEY);
        uksort($sheets, 'strnatcmp');
        $lines = [];
        foreach ($sheets as $xml) {
            $doc = $this->xml($xml);
            foreach ($doc?->getElementsByTagName('row') ?? [] as $row) {
                $cells = [];
                foreach ($row->getElementsByTagName('c') as $cell) {
                    $type = $cell->getAttribute('t');
                    $value = $type === 'inlineStr'
                        ? $cell->textContent
                        : ($cell->getElementsByTagName('v')->item(0)?->textContent ?? '');
                    if ($type === 's') {
                        $value = $shared[(int) $value] ?? '';
                    }
                    if (trim($value) !== '') {
                        $cells[] = trim($value);
                    }
                }
                if ($cells !== []) {
                    $lines[] = implode(' | ', $cells);
                }
            }
            $lines[] = '';
        }

        return implode("\n", $lines);
    }

    private function xml(string $xml): ?\DOMDocument
    {
        $doc = new \DOMDocument;

        return @$doc->loadXML($xml, LIBXML_NONET | LIBXML_COMPACT) ? $doc : null;
    }

    /**
     * Entries of a ZIP archive whose names pass the filter (stored or deflated).
     *
     * @param  callable(string): bool  $wanted
     * @return array<string, string>
     */
    private function zipEntries(string $bytes, callable $wanted): array
    {
        $end = strrpos($bytes, "PK\x05\x06");
        if ($end === false || strlen($bytes) < $end + 22) {
            throw new RuntimeException(__('blueprint.unreadable'));
        }
        $eocd = unpack('vdisk/vcdDisk/ventries/vtotal/Vsize/Voffset', substr($bytes, $end + 4, 16));
        $offset = $eocd['offset'];
        $entries = [];

        for ($i = 0; $i < $eocd['total']; $i++) {
            if (substr($bytes, $offset, 4) !== "PK\x01\x02") {
                break;
            }
            $header = unpack('vmethod/vtime/vdate/Vcrc/Vcompressed/Vsize/vnameLength/vextraLength/vcommentLength/vdisk/vinternal/Vexternal/Vlocal', substr($bytes, $offset + 10, 36));
            $name = substr($bytes, $offset + 46, $header['nameLength']);
            $offset += 46 + $header['nameLength'] + $header['extraLength'] + $header['commentLength'];

            if (! $wanted($name) || $header['size'] > 50_000_000) {
                continue;
            }
            $local = $header['local'];
            $lengths = unpack('vname/vextra', substr($bytes, $local + 26, 4));
            $data = substr($bytes, $local + 30 + $lengths['name'] + $lengths['extra'], $header['compressed']);
            $content = match ($header['method']) {
                0 => $data,
                8 => @gzinflate($data),
                default => false,
            };
            if (is_string($content)) {
                $entries[$name] = $content;
            }
        }

        return $entries;
    }

    private function pdf(string $bytes): string
    {
        $objects = $this->pdfObjects($bytes);
        $pages = [];
        foreach ($objects as $object) {
            if (preg_match('#/Type\s*/Page(?![a-zA-Z])#', $object['dict']) === 1) {
                $pages[] = $object;
            }
        }

        $text = [];
        foreach ($pages as $page) {
            $fonts = $this->pdfFonts($page['dict'], $objects);
            $content = '';
            foreach ($this->pdfRefs($this->pdfValue($page['dict'], 'Contents')) as $ref) {
                $content .= ($objects[$ref]['stream'] ?? '')."\n";
            }
            $text[] = $this->pdfContentText($content, $fonts);
        }

        return implode("\n\n", $text);
    }

    /**
     * Every object: dictionary text and decoded stream, including objects
     * packed inside object streams.
     *
     * @return array<int, array{dict: string, stream: string}>
     */
    private function pdfObjects(string $bytes): array
    {
        $objects = [];
        preg_match_all('/(\d+)\s+\d+\s+obj\b(.*?)\bendobj/s', $bytes, $matches, PREG_SET_ORDER);
        foreach ($matches as $match) {
            $body = $match[2];
            $stream = '';
            if (preg_match('/^(.*?)\bstream\r?\n(.*)\bendstream/s', $body, $parts) === 1) {
                $body = $parts[1];
                $stream = $this->pdfDecode($parts[1], rtrim($parts[2], "\r\n"));
            }
            $objects[(int) $match[1]] = ['dict' => $body, 'stream' => $stream];
        }

        foreach ($objects as $object) {
            if (preg_match('#/Type\s*/ObjStm#', $object['dict']) !== 1) {
                continue;
            }
            $count = (int) $this->pdfValue($object['dict'], 'N');
            $first = (int) $this->pdfValue($object['dict'], 'First');
            preg_match_all('/(\d+)\s+(\d+)/', substr($object['stream'], 0, $first), $pairs, PREG_SET_ORDER);
            $pairs = array_slice($pairs, 0, $count);
            foreach ($pairs as $index => $pair) {
                $start = $first + (int) $pair[2];
                $endAt = isset($pairs[$index + 1]) ? $first + (int) $pairs[$index + 1][2] : strlen($object['stream']);
                $objects[(int) $pair[1]] ??= ['dict' => substr($object['stream'], $start, $endAt - $start), 'stream' => ''];
            }
        }

        return $objects;
    }

    /** Decode a stream through its filters (ASCII85 and Flate); unknown filters give no text. */
    private function pdfDecode(string $dict, string $data): string
    {
        $filter = $this->pdfValue($dict, 'Filter');
        preg_match_all('#/(\w+)#', $filter, $names);
        foreach ($names[1] as $name) {
            $decoded = match ($name) {
                'ASCII85Decode', 'A85' => $this->ascii85($data),
                'FlateDecode', 'Fl' => $this->inflate($data),
                default => null,
            };
            if ($decoded === null) {
                return '';
            }
            $data = $decoded;
        }

        return $data;
    }

    private function inflate(string $data): ?string
    {
        set_error_handler(fn (): bool => true);
        try {
            foreach ([fn () => gzuncompress($data), fn () => gzinflate(substr($data, 2)), fn () => gzinflate($data)] as $attempt) {
                $decoded = $attempt();
                if (is_string($decoded)) {
                    return $decoded;
                }
            }

            return null;
        } finally {
            restore_error_handler();
        }
    }

    private function ascii85(string $data): ?string
    {
        $data = (string) preg_replace('/\s+/', '', $data);
        if (str_starts_with($data, '<~')) {
            $data = substr($data, 2);
        }
        $end = strpos($data, '~>');
        $data = $end === false ? $data : substr($data, 0, $end);
        $out = '';
        $group = [];
        $length = strlen($data);
        for ($i = 0; $i < $length; $i++) {
            $char = $data[$i];
            if ($char === 'z' && $group === []) {
                $out .= "\0\0\0\0";

                continue;
            }
            $code = ord($char) - 33;
            if ($code < 0 || $code > 84) {
                return null;
            }
            $group[] = $code;
            if (count($group) === 5) {
                $out .= $this->ascii85Group($group, 4);
                $group = [];
            }
        }
        if ($group !== []) {
            $count = count($group);
            $out .= $this->ascii85Group(array_pad($group, 5, 84), $count - 1);
        }

        return $out;
    }

    /** @param  list<int>  $group */
    private function ascii85Group(array $group, int $bytes): string
    {
        $value = 0;
        foreach ($group as $code) {
            $value = $value * 85 + $code;
        }

        return substr(pack('N', $value & 0xFFFFFFFF), 0, $bytes);
    }

    /** Raw value text of a dictionary key (reference, name, number or nested dictionary). */
    private function pdfValue(string $dict, string $key): string
    {
        $position = preg_match('#/'.$key.'(?![a-zA-Z])\s*#', $dict, $match, PREG_OFFSET_CAPTURE) === 1 ? $match[0][1] + strlen($match[0][0]) : null;
        if ($position === null) {
            return '';
        }
        $rest = substr($dict, $position);
        if (str_starts_with($rest, '<<')) {
            $depth = 0;
            for ($i = 0, $length = strlen($rest); $i < $length - 1; $i++) {
                $pair = substr($rest, $i, 2);
                if ($pair === '<<') {
                    $depth++;
                    $i++;
                } elseif ($pair === '>>') {
                    $depth--;
                    $i++;
                    if ($depth === 0) {
                        return substr($rest, 0, $i + 1);
                    }
                }
            }

            return $rest;
        }
        if (str_starts_with($rest, '[')) {
            return substr($rest, 0, (int) strpos($rest.']', ']') + 1);
        }

        return preg_match('/^(\d+\s+\d+\s+R|\/[^\s\/<>\[\]]+|[\d.\-]+)/', $rest, $value) === 1 ? $value[1] : '';
    }

    /** @return list<int> */
    private function pdfRefs(string $value): array
    {
        preg_match_all('/(\d+)\s+\d+\s+R/', $value, $refs);

        return array_map('intval', $refs[1]);
    }

    /** Resolve a value that may be an indirect reference to a dictionary. */
    private function pdfDict(string $value, array $objects): string
    {
        $refs = $this->pdfRefs($value);

        return ! str_starts_with($value, '<<') && count($refs) === 1 ? ($objects[$refs[0]]['dict'] ?? '') : $value;
    }

    /**
     * Font resource name => glyph code to Unicode map (empty when the font has none).
     *
     * @param  array<int, array{dict: string, stream: string}>  $objects
     * @return array<string, array{map: array<string, string>, bytes: int}>
     */
    private function pdfFonts(string $pageDict, array $objects): array
    {
        $resources = $this->pdfDict($this->pdfValue($pageDict, 'Resources'), $objects);
        $fontDict = $this->pdfDict($this->pdfValue($resources, 'Font'), $objects);
        preg_match_all('#/([^\s/<>\[\]]+)\s+(\d+)\s+\d+\s+R#', $fontDict, $entries, PREG_SET_ORDER);

        $fonts = [];
        foreach ($entries as $entry) {
            $font = $objects[(int) $entry[2]]['dict'] ?? '';
            $cmapRef = $this->pdfRefs($this->pdfValue($font, 'ToUnicode'));
            $map = $cmapRef !== [] ? $this->pdfCmap($objects[$cmapRef[0]]['stream'] ?? '') : [];
            $fonts[$entry[1]] = ['map' => $map, 'bytes' => str_contains($font, '/Type0') ? 2 : 1];
        }

        return $fonts;
    }

    /** @return array<string, string> glyph code (hex, upper case) => text */
    private function pdfCmap(string $cmap): array
    {
        $map = [];
        $unicode = fn (string $hex): string => (string) mb_convert_encoding((string) hex2bin(str_pad($hex, (int) (ceil(strlen($hex) / 4) * 4), '0', STR_PAD_LEFT)), 'UTF-8', 'UTF-16BE');

        preg_match_all('/beginbfchar(.*?)endbfchar/s', $cmap, $blocks);
        foreach ($blocks[1] as $block) {
            preg_match_all('/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]*)>/', $block, $pairs, PREG_SET_ORDER);
            foreach ($pairs as $pair) {
                $map[strtoupper($pair[1])] = $unicode($pair[2]);
            }
        }

        preg_match_all('/beginbfrange(.*?)endbfrange/s', $cmap, $blocks);
        foreach ($blocks[1] as $block) {
            preg_match_all('/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*(<[0-9A-Fa-f]+>|\[[^\]]*\])/', $block, $ranges, PREG_SET_ORDER);
            foreach ($ranges as $range) {
                $from = hexdec($range[1]);
                $to = min(hexdec($range[2]), $from + 5000);
                $width = strlen($range[1]);
                if ($range[3][0] === '[') {
                    preg_match_all('/<([0-9A-Fa-f]+)>/', $range[3], $targets);
                    foreach ($targets[1] as $offset => $target) {
                        $map[strtoupper(str_pad(dechex($from + $offset), $width, '0', STR_PAD_LEFT))] = $unicode($target);
                    }

                    continue;
                }
                $start = hexdec(trim($range[3], '<>'));
                for ($code = $from; $code <= $to; $code++) {
                    $map[strtoupper(str_pad(dechex($code), $width, '0', STR_PAD_LEFT))] = $unicode(str_pad(dechex($start + $code - $from), 4, '0', STR_PAD_LEFT));
                }
            }
        }

        return $map;
    }

    /**
     * Text shown by a page content stream.
     *
     * @param  array<string, array{map: array<string, string>, bytes: int}>  $fonts
     */
    private function pdfContentText(string $content, array $fonts): string
    {
        $font = ['map' => [], 'bytes' => 1];
        $out = '';
        $lastY = null;
        $pattern = '/\/([^\s\/\[\]<>()]+)\s+[\d.\-]+\s+Tf|\((?:\\\\.|[^\\\\)])*\)|<[0-9A-Fa-f\s]*>|\[|\]|[\d.\-]+\s+[\d.\-]+\s+T[dD]|[\d.\-]+\s+[\d.\-]+\s+[\d.\-]+\s+[\d.\-]+\s+[\d.\-]+\s+([\d.\-]+)\s+Tm|T\*|\'|"|ET\b/';
        preg_match_all($pattern, $content, $tokens, PREG_SET_ORDER);
        $inArray = false;
        $size = 10.0;
        $lastGlyphs = 0;

        foreach ($tokens as $token) {
            $value = $token[0];
            if (isset($token[1]) && $token[1] !== '' && str_ends_with($value, 'Tf')) {
                $font = $fonts[$token[1]] ?? ['map' => [], 'bytes' => 1];
                $size = (float) (preg_split('/\s+/', trim($value))[1] ?? 10) ?: 10;
            } elseif ($value === '[') {
                $inArray = true;
            } elseif ($value === ']') {
                $inArray = false;
            } elseif ($value[0] === '(') {
                $shown = $this->pdfShow($this->pdfLiteral(substr($value, 1, -1)), $font);
                $out .= $shown;
                $lastGlyphs += mb_strlen($shown);
            } elseif ($value[0] === '<') {
                $shown = $this->pdfShow((string) hex2bin($this->evenHex((string) preg_replace('/\s+/', '', substr($value, 1, -1)))), $font);
                $out .= $shown;
                $lastGlyphs += mb_strlen($shown);
            } elseif (str_ends_with($value, 'Tm')) {
                $y = (float) ($token[2] ?? 0);
                if ($lastY !== null && abs($y - $lastY) > 1) {
                    $out .= "\n";
                } elseif ($lastY !== null) {
                    $out .= ' ';
                }
                $lastY = $y;
                $lastGlyphs = 0;
            } elseif (str_ends_with($value, 'Td') || str_ends_with($value, 'TD')) {
                $parts = preg_split('/\s+/', trim($value));
                $dx = (float) ($parts[0] ?? 0);
                $dy = (float) ($parts[1] ?? 0);
                if (abs($dy) > 1) {
                    $out .= "\n";
                } elseif ($dx < 0 || $dx > $size * ($lastGlyphs + 0.5)) {
                    $out .= ' ';
                }
                $lastGlyphs = 0;
            } elseif ($value === 'T*' || $value === "'" || $value === '"') {
                $out .= "\n";
                $lastGlyphs = 0;
            } elseif ($value === 'ET') {
                $out .= $inArray ? '' : ' ';
            }
        }

        return $out;
    }

    private function evenHex(string $hex): string
    {
        return strlen($hex) % 2 === 1 ? $hex.'0' : $hex;
    }

    /** Decode the escapes of a PDF literal string. */
    private function pdfLiteral(string $value): string
    {
        return (string) preg_replace_callback('/\\\\([nrtbf()\\\\]|[0-7]{1,3}|\r?\n)/', function (array $match): string {
            $code = $match[1];

            return match (true) {
                $code === 'n' => "\n",
                $code === 'r' => "\r",
                $code === 't' => "\t",
                $code === 'b', $code === 'f', $code[0] === "\n", $code[0] === "\r" => '',
                ctype_digit($code) => chr(octdec($code) & 0xFF),
                default => $code,
            };
        }, $value);
    }

    /**
     * Glyph bytes to text: through the font's ToUnicode map when it has one,
     * otherwise as single-byte Latin text.
     *
     * @param  array{map: array<string, string>, bytes: int}  $font
     */
    private function pdfShow(string $bytes, array $font): string
    {
        if ($font['map'] === []) {
            return $font['bytes'] === 2 ? '' : (string) mb_convert_encoding($bytes, 'UTF-8', 'Windows-1252');
        }

        $out = '';
        $step = $font['bytes'];
        for ($i = 0, $length = strlen($bytes); $i < $length; $i += $step) {
            $code = strtoupper(bin2hex(substr($bytes, $i, $step)));
            $out .= $font['map'][$code] ?? '';
        }

        return $out;
    }
}
