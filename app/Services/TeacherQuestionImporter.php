<?php

namespace App\Services;

use App\Http\Requests\Concerns\QuestionRules;
use App\Models\Question;
use App\Models\SubjectTopic;
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

    /**
     * Column order of the template. Games are not part of a row: imported
     * questions go to every matching game and the teacher picks games later
     * in the question list. An old `games` column is ignored.
     */
    public const COLUMNS = [
        'type', 'grades', 'subject', 'topic', 'level',
        'question_id', 'question_en',
        'option_1_id', 'option_1_en', 'option_2_id', 'option_2_en', 'option_3_id', 'option_3_en',
        'option_4_id', 'option_4_en', 'option_5_id', 'option_5_en', 'option_6_id', 'option_6_en',
        'answer', 'hint_id', 'hint_en',
    ];

    /** Delimiter of the template: Excel in Indonesian locale opens semicolon files in columns. */
    public const DELIMITER = ';';

    private const REQUIRED_COLUMNS = ['type', 'grades', 'subject', 'question_id', 'answer'];

    /**
     * Sample rows written into the template (Indonesian defaults, English
     * optional). Only samples of subjects the teacher may write for are kept;
     * when none match, every sample uses the teacher's first subject, so the
     * downloaded file always imports cleanly.
     *
     * @param  list<string>  $subjects
     * @return list<list<string>>
     */
    public function sampleRows(array $subjects): array
    {
        $samples = [
            ['type' => 'choice', 'grades' => 'TK,1', 'subject' => 'math', 'level' => 'mudah', 'question_id' => 'Berapa 2 + 3?', 'question_en' => 'What is 2 + 3?', 'options' => [['5', '5'], ['4', '4'], ['6', '6'], ['7', '7']], 'answer' => '1', 'hint_id' => '2 ditambah 3 sama dengan 5.', 'hint_en' => '2 plus 3 equals 5.'],
            ['type' => 'choice', 'grades' => '4-6', 'subject' => 'science', 'level' => 'menengah', 'question_id' => 'Planet terbesar di tata surya adalah…', 'question_en' => 'The largest planet in the solar system is…', 'options' => [['Jupiter', 'Jupiter'], ['Mars', 'Mars'], ['Bumi', 'Earth']], 'answer' => 'A', 'hint_id' => '', 'hint_en' => ''],
            ['type' => 'true_false', 'grades' => '7,8,9', 'subject' => 'social', 'level' => 'sulit', 'question_id' => 'Ibu kota Indonesia adalah Jakarta.', 'question_en' => 'The capital of Indonesia is Jakarta.', 'options' => [], 'answer' => 'benar', 'hint_id' => '', 'hint_en' => ''],
        ];

        $allowed = array_values(array_filter($samples, fn (array $sample): bool => $subjects === [] || in_array($sample['subject'], $subjects, true)));
        if ($allowed === []) {
            $allowed = array_map(fn (array $sample): array => [...$sample, 'subject' => $subjects[0]], $samples);
        }

        return array_map(function (array $sample): array {
            $values = [
                'type' => $sample['type'],
                'grades' => $sample['grades'],
                'subject' => $sample['subject'],
                'topic' => '',
                'level' => $sample['level'],
                'question_id' => $sample['question_id'],
                'question_en' => $sample['question_en'],
                'answer' => $sample['answer'],
                'hint_id' => $sample['hint_id'],
                'hint_en' => $sample['hint_en'],
            ];
            for ($i = 1; $i <= 6; $i++) {
                $values["option_{$i}_id"] = $sample['options'][$i - 1][0] ?? '';
                $values["option_{$i}_en"] = $sample['options'][$i - 1][1] ?? '';
            }

            return array_map(fn (string $column): string => $values[$column], self::COLUMNS);
        }, $allowed);
    }

    /**
     * CSV body of the downloadable template (UTF-8 with BOM so Excel keeps accents).
     *
     * @param  list<string>  $subjects  subjects the teacher may write for
     */
    public function template(array $subjects): string
    {
        $handle = fopen('php://temp', 'r+');
        fwrite($handle, "\u{FEFF}");
        fputcsv($handle, self::COLUMNS, self::DELIMITER, '"', '');
        foreach ($this->sampleRows($subjects) as $row) {
            fputcsv($handle, $row, self::DELIMITER, '"', '');
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

        $topics = $this->topicLookup();
        $errors = [];
        $records = [];
        foreach ($parsed['rows'] as $line => $row) {
            $attributes = $this->toAttributes($row);
            $topicName = mb_strtolower(trim($row['topic'] ?? ''));
            $attributes['topic_id'] = $topicName === '' ? null : ($topics[$attributes['subject'].'|'.$topicName] ?? null);
            $rules = [
                ...$this->questionContentRules($attributes),
                'level' => $this->levelAndTopicRules($attributes)['level'],
                'topic_id' => ['nullable', 'integer'],
                ...$this->gradeRules(),
            ];
            $validator = Validator::make($attributes, $rules, $this->questionMessages());
            $validator->after(function ($v) use ($attributes, $topicName, $row, $teacher): void {
                $this->validateQuestionConsistency($v, $attributes);
                if (is_string($attributes['subject']) && $attributes['subject'] !== '' && ! $teacher->canTeachSubject($attributes['subject'])) {
                    $v->errors()->add('subject', __('questions.import.subject_not_assigned', ['subject' => $attributes['subject']]));
                }
                if ($topicName !== '' && $attributes['topic_id'] === null) {
                    $v->errors()->add('topic_id', __('questions.import.unknown_topic', ['topic' => trim($row['topic'] ?? '')]));
                }
            });

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
                    'level' => Question::normalizeLevel($data['level']),
                    'topic_id' => $data['topic_id'] ?? null,
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
     * Active topics keyed by "subject|lowercased name" (Indonesian and English names).
     *
     * @return array<string, int>
     */
    private function topicLookup(): array
    {
        $lookup = [];
        foreach (SubjectTopic::query()->active()->get(['id', 'subject_key', 'name_id', 'name_en']) as $topic) {
            foreach (array_filter([$topic->name_id, $topic->name_en]) as $name) {
                $lookup[$topic->subject_key.'|'.mb_strtolower(trim($name))] ??= $topic->id;
            }
        }

        return $lookup;
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

        return [
            'type' => $type,
            'grades' => $this->parseGrades($row['grades'] ?? ''),
            'subject' => Str::lower($row['subject'] ?? ''),
            'games' => Question::gamesForType($type),
            'prompt_id' => $row['question_id'] ?? '',
            'prompt_en' => ($row['question_en'] ?? '') ?: null,
            'options' => $this->normalizeOptions($options, $type),
            'answer' => $this->parseAnswer($row['answer'] ?? '', $type),
            'hint_id' => ($row['hint_id'] ?? '') ?: null,
            'hint_en' => ($row['hint_en'] ?? '') ?: null,
            'level' => $this->parseLevel($row['level'] ?? '') ?? Question::LEVEL_EASY,
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
