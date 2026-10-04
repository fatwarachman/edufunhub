<?php

namespace App\Services;

use App\Http\Requests\Concerns\QuestionRules;
use App\Models\Question;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;

/**
 * Imports teacher questions from the downloadable CSV template.
 *
 * Every row is validated with the same rules as the teacher form. The import
 * is all-or-nothing: one invalid row rejects the whole file so a teacher never
 * ends up with a half-imported set.
 */
class TeacherQuestionImporter
{
    use QuestionRules;

    public const MAX_ROWS = 500;

    /** Column order of the template. */
    public const COLUMNS = [
        'type', 'grades', 'subject', 'games',
        'question_id', 'question_en',
        'option_1_id', 'option_1_en', 'option_2_id', 'option_2_en', 'option_3_id', 'option_3_en',
        'option_4_id', 'option_4_en', 'option_5_id', 'option_5_en', 'option_6_id', 'option_6_en',
        'answer', 'hint_id', 'hint_en',
    ];

    private const REQUIRED_COLUMNS = ['type', 'grades', 'subject', 'question_id', 'answer'];

    /**
     * Sample rows written into the template (Indonesian defaults, English optional).
     *
     * @return list<list<string>>
     */
    public function sampleRows(): array
    {
        return [
            ['choice', 'TK;1', 'math', 'flag-quest;sky-quiz', 'Berapa 2 + 3?', 'What is 2 + 3?', '5', '5', '4', '4', '6', '6', '7', '7', '', '', '', '', '1', '2 ditambah 3 sama dengan 5.', '2 plus 3 equals 5.'],
            ['choice', '4;5;6', 'science', 'sky-quiz', 'Planet terbesar di tata surya adalah…', 'The largest planet in the solar system is…', 'Jupiter', 'Jupiter', 'Mars', 'Mars', 'Bumi', 'Earth', '', '', '', '', '', '', '1', '', ''],
            ['true_false', '7;8;9', 'social', 'flag-quest', 'Ibu kota Indonesia adalah Jakarta.', 'The capital of Indonesia is Jakarta.', '', '', '', '', '', '', '', '', '', '', '', '', 'true', '', ''],
        ];
    }

    /**
     * CSV body of the downloadable template (UTF-8 with BOM so Excel keeps accents).
     */
    public function template(): string
    {
        $handle = fopen('php://temp', 'r+');
        fwrite($handle, "\u{FEFF}");
        fputcsv($handle, self::COLUMNS, ',', '"', '');
        foreach ($this->sampleRows() as $row) {
            fputcsv($handle, $row, ',', '"', '');
        }
        rewind($handle);
        $csv = (string) stream_get_contents($handle);
        fclose($handle);

        return $csv;
    }

    /**
     * Parse, validate and store the rows.
     *
     * @return array{imported: int, errors: list<array{row: int, messages: list<string>}>}
     */
    public function import(string $path, User $teacher): array
    {
        $parsed = $this->parse($path);
        if ($parsed['errors'] !== []) {
            return ['imported' => 0, 'errors' => $parsed['errors']];
        }

        $errors = [];
        $records = [];
        foreach ($parsed['rows'] as $line => $row) {
            $attributes = $this->toAttributes($row);
            $validator = Validator::make($attributes, [...$this->questionContentRules($attributes), ...$this->gradeRules()], $this->questionMessages());
            $validator->after(fn ($v) => $this->validateQuestionConsistency($v, $attributes));

            if ($validator->fails()) {
                $errors[] = ['row' => $line, 'messages' => array_values(array_unique($validator->errors()->all()))];

                continue;
            }

            $records[] = $validator->validated();
        }

        if ($errors !== []) {
            return ['imported' => 0, 'errors' => $errors];
        }

        DB::transaction(function () use ($records, $teacher): void {
            foreach ($records as $data) {
                $grades = collect($data['grades'])->map(fn ($grade): int => (int) $grade)->unique()->sort()->values()->all();

                Question::query()->create([
                    ...$data,
                    'grades' => $grades,
                    'band' => Question::bandForGrades($grades),
                    'key' => 'q-'.Str::lower(Str::random(10)),
                    'source' => 'import',
                    'is_active' => true,
                    'created_by' => $teacher->id,
                    'updated_by' => $teacher->id,
                ]);
            }
        });

        return ['imported' => count($records), 'errors' => []];
    }

    /**
     * @return array{rows: array<int, array<string, string>>, errors: list<array{row: int, messages: list<string>}>}
     */
    private function parse(string $path): array
    {
        $handle = fopen($path, 'r');
        $first = (string) fgets($handle);
        $first = preg_replace('/^\xEF\xBB\xBF/', '', $first) ?? $first;
        $delimiter = substr_count($first, ';') > substr_count($first, ',') ? ';' : ',';
        $header = array_map(fn ($cell): string => Str::of((string) $cell)->trim()->lower()->replace(' ', '_')->toString(), str_getcsv($first, $delimiter, '"', ''));

        $missing = array_diff(self::REQUIRED_COLUMNS, $header);
        if ($missing !== []) {
            fclose($handle);

            return ['rows' => [], 'errors' => [['row' => 1, 'messages' => [__('questions.import.missing_columns', ['columns' => implode(', ', $missing)])]]]];
        }

        $rows = [];
        $line = 1;
        while (($cells = fgetcsv($handle, null, $delimiter, '"', '')) !== false) {
            $line++;
            if ($cells === [null] || collect($cells)->every(fn ($cell): bool => trim((string) $cell) === '')) {
                continue;
            }
            if (count($rows) >= self::MAX_ROWS) {
                fclose($handle);

                return ['rows' => [], 'errors' => [['row' => $line, 'messages' => [__('questions.import.too_many_rows', ['max' => self::MAX_ROWS])]]]];
            }

            $rows[$line] = collect($header)->mapWithKeys(fn (string $column, int $index): array => [$column => trim((string) ($cells[$index] ?? ''))])->all();
        }
        fclose($handle);

        if ($rows === []) {
            return ['rows' => [], 'errors' => [['row' => 1, 'messages' => [__('questions.import.empty')]]]];
        }

        return ['rows' => $rows, 'errors' => []];
    }

    /**
     * Map a CSV row onto the question attributes used by the form.
     *
     * @param  array<string, string>  $row
     * @return array<string, mixed>
     */
    private function toAttributes(array $row): array
    {
        $type = Str::of($row['type'] ?? '')->lower()->replace(['-', ' '], '_')->toString();
        $type = match ($type) {
            'mc', 'pg', 'pilihan_ganda', 'multiple_choice' => Question::TYPE_CHOICE,
            'tf', 'bs', 'benar_salah' => Question::TYPE_TRUE_FALSE,
            default => $type,
        };

        $options = [];
        for ($i = 1; $i <= 6; $i++) {
            $options[] = ['id' => $row["option_{$i}_id"] ?? '', 'en' => $row["option_{$i}_en"] ?? ''];
        }

        $games = collect(preg_split('/[;|,]/', $row['games'] ?? '') ?: [])->map(fn ($game): string => trim(Str::lower($game)))->filter()->values()->all();

        return [
            'type' => $type,
            'grades' => $this->parseGrades($row['grades'] ?? ''),
            'subject' => Str::lower($row['subject'] ?? ''),
            'games' => $games !== [] ? $games : ($type === Question::TYPE_TRUE_FALSE ? ['flag-quest'] : Question::GAMES),
            'prompt_id' => $row['question_id'] ?? '',
            'prompt_en' => ($row['question_en'] ?? '') ?: null,
            'options' => $this->normalizeOptions($options, $type),
            'answer' => $this->parseAnswer($row['answer'] ?? '', $type),
            'hint_id' => ($row['hint_id'] ?? '') ?: null,
            'hint_en' => ($row['hint_en'] ?? '') ?: null,
            'is_active' => true,
        ];
    }

    /**
     * Accepts "TK;1;2", "1-3" or "TK, 1".
     *
     * @return list<int|string>
     */
    private function parseGrades(string $value): array
    {
        $grades = [];
        foreach (preg_split('/[;|,\s]+/', Str::lower($value)) ?: [] as $part) {
            if ($part === '') {
                continue;
            }
            if (in_array($part, ['tk', 'k', 'kg', 'paud'], true)) {
                $grades[] = Question::KINDERGARTEN;
            } elseif (preg_match('/^(\d{1,2})-(\d{1,2})$/', $part, $range) === 1 && (int) $range[1] <= (int) $range[2]) {
                array_push($grades, ...range((int) $range[1], (int) $range[2]));
            } else {
                $grades[] = ctype_digit($part) ? (int) $part : $part;
            }
        }

        return array_values(array_unique($grades, SORT_REGULAR));
    }

    /**
     * Choice answers are 1-based option numbers (or A-F); true/false accepts true/false/benar/salah.
     */
    private function parseAnswer(string $value, string $type): int|string
    {
        $value = Str::lower(trim($value));

        if ($type === Question::TYPE_TRUE_FALSE) {
            return match ($value) {
                'true', 'benar', 'b', '1', 'ya', 'yes' => 1,
                'false', 'salah', 's', '0', 'tidak', 'no' => 0,
                default => $value,
            };
        }

        if (preg_match('/^[a-f]$/', $value) === 1) {
            return ord($value) - ord('a');
        }

        return ctype_digit($value) ? (int) $value - 1 : $value;
    }
}
