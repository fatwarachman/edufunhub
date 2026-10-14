<?php

namespace Tests\Feature;

use App\Ai\Agents\ClassroomAnalyst;
use App\Jobs\AnalyzeClassroom;
use App\Models\Classroom;
use App\Models\ClassroomGame;
use App\Models\ClassroomMember;
use App\Models\GameHistory;
use App\Models\PlayerProfile;
use App\Models\Question;
use App\Models\Setting;
use App\Models\User;
use App\Services\Ai\ClassroomAiText;
use App\Services\Ai\ClassroomAnalyzer;
use App\Services\Classrooms\ClassroomReport;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use RuntimeException;
use Tests\TestCase;

/**
 * Classroom analysis tab (rule-based insights, per-student strengths) and the
 * AI analysis (anonymised prompt, label mapping, sanitising, job states).
 */
class ClassroomAnalysisTest extends TestCase
{
    use RefreshDatabase;

    private User $teacher;

    private Classroom $classroom;

    private ClassroomMember $strong;

    private ClassroomMember $weak;

    private ClassroomMember $idle;

    protected function setUp(): void
    {
        parent::setUp();

        config(['queue.default' => 'sync', 'ai.ability_assessment.connection' => null, 'game-service.classroom_kick_url' => 'http://game.test/kick']);
        Http::fake(['game.test/*' => Http::response(null, 204)]);

        $this->teacher = User::factory()->teacher()->create();
        $this->classroom = Classroom::factory()->create(['teacher_id' => $this->teacher->id, 'name' => 'Kelas Seru']);
        ClassroomGame::query()->create(['classroom_id' => $this->classroom->id, 'game_key' => 'sky-quiz', 'sort_order' => 0]);

        $this->strong = $this->member('Rahasia Kuat', 'Kuat');
        $this->weak = $this->member('Rahasia Lemah', 'Lemah');
        $this->idle = $this->member('Rahasia Diam', 'Diam');

        $math = Question::factory()->create(['subject' => 'math', 'prompt_id' => 'Berapa 7 x 8?', 'prompt_en' => 'What is 7 x 8?']);
        $science = Question::factory()->create(['subject' => 'science', 'prompt_id' => 'Planet terbesar?', 'prompt_en' => 'Largest planet?']);

        $this->play($this->strong, $math, [true, true, true, true, true, true, true, true], 40);
        $this->play($this->strong, $science, [true, true, true, false], 30);
        $this->play($this->weak, $math, [false, false, true, false], 5);
        $this->play($this->weak, $science, [false, false, false, true], 5);
    }

    private function member(string $name, string $nickname): ClassroomMember
    {
        $user = User::factory()->create(['name' => $name]);
        PlayerProfile::factory()->for($user)->create(['nickname' => $nickname, 'grade' => 5]);

        return $this->classroom->members()->create(['user_id' => $user->id, 'joined_at' => now()]);
    }

    /** @param list<bool> $answers */
    private function play(ClassroomMember $member, Question $question, array $answers, int $points): void
    {
        $correct = count(array_filter($answers));
        $history = GameHistory::factory()->create([
            'user_id' => $member->user_id,
            'classroom_id' => $this->classroom->id,
            'points' => $points,
            'correct' => $correct,
            'wrong' => count($answers) - $correct,
        ]);
        foreach ($answers as $ok) {
            DB::table('question_answers')->insert([
                'question_id' => $question->id,
                'game_history_id' => $history->id,
                'game_key' => 'sky-quiz',
                'correct' => $ok,
                'choice' => $ok ? 0 : 2,
                'created_at' => now(),
            ]);
        }
    }

    private function configureAi(): void
    {
        Setting::set('ai.base_url', 'https://ai.test/v1', 'ai');
        Setting::set('ai.api_key', Crypt::encryptString('sk-test-1234'), 'ai');
        Setting::set('ai.model', 'gpt-4o-mini', 'ai');
    }

    public function test_report_has_insights_ranks_and_subject_strengths(): void
    {
        $report = app(ClassroomReport::class)->forClassroom($this->classroom);

        $this->assertSame(3, $report['summary']['members']);
        $keys = array_column($report['insights'], 'key');
        $this->assertContains('strong_subject', $keys);
        $this->assertContains('top_student', $keys);
        $this->assertContains('inactive_members', $keys);
        $this->assertContains('needs_help', $keys);

        $students = $report['students']->keyBy('member_id');
        $this->assertSame(1, $students[$this->strong->id]['rank']);
        $this->assertSame(2, $students[$this->weak->id]['rank']);
        $this->assertNull($students[$this->idle->id]['rank']);
        $this->assertSame(['math', 'science'], $students[$this->strong->id]['strengths']);
        $this->assertSame(['math', 'science'], $students[$this->weak->id]['weaknesses']);
        $this->assertSame(6, $students[$this->weak->id]['wrong']);
        $this->assertSame('Kuat', $students[$this->strong->id]['name']);

        $hardest = collect($report['questions'])->firstWhere('prompt_id', 'Planet terbesar?');
        $this->assertSame('Salah dua', $hardest['top_wrong']['text']);
    }

    public function test_insight_params_carry_both_languages(): void
    {
        $insights = collect(app(ClassroomReport::class)->forClassroom($this->classroom)['insights'])->keyBy('key');

        $this->assertSame('Kuat', $insights['top_student']['params']['name']);
        $this->assertSame(1, $insights['inactive_members']['params']['count']);
        $this->assertArrayHasKey('prompt_en', $insights['hardest_question']['params']);
    }

    public function test_teacher_page_renders_report_and_ai_state(): void
    {
        $this->actingAs($this->teacher)
            ->get("/teacher/classrooms/{$this->classroom->id}")
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->component('teacher/classrooms/show')
                ->has('report.insights')
                ->where('report.students.0.name', 'Kuat')
                ->where('classroom.ai_available', false)
            );
    }

    public function test_ai_analysis_is_anonymised_and_mapped_back_by_label(): void
    {
        $this->configureAi();
        ClassroomAnalyst::fake([[
            'summary' => [
                'overview' => ['<b>Kelas</b> cukup baik.', '- Partisipasi 2 dari 3 siswa.', '  ', 'Partisipasi 2 dari 3 siswa.'],
                'strengths' => ['Matematika kuat.'],
                'weaknesses' => [],
                'misconceptions' => ['Banyak memilih "Salah dua".'],
                'actions' => ['1. Ulas planet.', 42],
            ],
            'students' => [
                ['student' => 'Siswa 1', 'strengths' => ['Pertahankan! <script>x</script>'], 'improve' => ['Siswa 1 menjawab salah 1 soal.'], 'tips' => ['Coba soal sulit.']],
                ['student' => 'Siswa 2', 'strengths' => ['Rajin.'], 'improve' => ["Latih perkalian.\u{202E}"], 'tips' => []],
                ['student' => 'Siswa 99', 'strengths' => ['Label karangan.'], 'improve' => [], 'tips' => []],
                ['student' => 'Siswa 1', 'strengths' => ['Duplikat.'], 'improve' => [], 'tips' => []],
            ],
        ]]);
        $this->idle->update(['ai_feedback' => 'Umpan balik lama.']);

        $this->actingAs($this->teacher)
            ->post("/teacher/classrooms/{$this->classroom->id}/analyze")
            ->assertSessionHasNoErrors();

        $classroom = $this->classroom->fresh();
        $this->assertSame('done', $classroom->ai_status);
        $summary = ClassroomAiText::decode($classroom->ai_summary, ClassroomAiText::SUMMARY_SECTIONS, 'overview');
        $this->assertSame(['Kelas cukup baik.', 'Partisipasi 2 dari 3 siswa.'], $summary['overview']);
        $this->assertSame([], $summary['weaknesses']);
        $this->assertSame(['Ulas planet.'], $summary['actions']);

        $strong = ClassroomAiText::decode($this->strong->fresh()->ai_feedback, ClassroomAiText::STUDENT_SECTIONS, 'strengths');
        $this->assertSame(['Pertahankan! x'], $strong['strengths']);
        $this->assertSame(['Coba soal sulit.'], $strong['tips']);
        $this->assertSame(['Menjawab salah 1 soal.'], $strong['improve']);
        $weak = ClassroomAiText::decode($this->weak->fresh()->ai_feedback, ClassroomAiText::STUDENT_SECTIONS, 'strengths');
        $this->assertSame(['Latih perkalian.'], $weak['improve']);
        $this->assertNull($this->idle->fresh()->ai_feedback);

        $this->actingAs($this->teacher)
            ->get("/teacher/classrooms/{$this->classroom->id}")
            ->assertInertia(fn ($page) => $page
                ->where('classroom.ai_summary.strengths', ['Matematika kuat.'])
                ->where('report.students.0.ai_feedback.tips', ['Coba soal sulit.'])
            );

        ClassroomAnalyst::assertPrompted(fn ($prompt) => str_contains($prompt->prompt, 'Siswa 1')
            && ! str_contains($prompt->prompt, 'Rahasia')
            && ! str_contains($prompt->prompt, 'Kuat')
            && ! str_contains($prompt->prompt, '"member_id"')
            && str_contains($prompt->prompt, 'Planet terbesar?')
            && str_contains($prompt->prompt, 'Matematika')
            && ! str_contains($prompt->prompt, '"math"'));
    }

    public function test_ai_failure_and_empty_reply_mark_failed(): void
    {
        $this->configureAi();
        ClassroomAnalyst::fake(fn () => throw new RuntimeException('model overloaded'));
        $this->actingAs($this->teacher)->post("/teacher/classrooms/{$this->classroom->id}/analyze");
        $this->assertSame('failed', $this->classroom->fresh()->ai_status);

        ClassroomAnalyst::fake([['summary' => ['overview' => [' '], 'strengths' => []], 'students' => []]]);
        $this->actingAs($this->teacher)->post("/teacher/classrooms/{$this->classroom->id}/analyze");
        $this->assertSame('failed', $this->classroom->fresh()->ai_status);
    }

    public function test_analyze_needs_ai_config_and_game_data(): void
    {
        Queue::fake();

        $this->actingAs($this->teacher)
            ->post("/teacher/classrooms/{$this->classroom->id}/analyze")
            ->assertSessionHasErrors('ai');

        $this->configureAi();
        $empty = Classroom::factory()->create(['teacher_id' => $this->teacher->id]);
        $this->actingAs($this->teacher)
            ->post("/teacher/classrooms/{$empty->id}/analyze")
            ->assertSessionHasErrors('ai');

        Queue::assertNotPushed(AnalyzeClassroom::class);
    }

    public function test_other_teacher_cannot_analyze_or_share(): void
    {
        $other = User::factory()->teacher()->create();

        $this->actingAs($other)->post("/teacher/classrooms/{$this->classroom->id}/analyze")->assertForbidden();
        $this->actingAs($other)->post("/teacher/classrooms/{$this->classroom->id}/share", ['member_id' => $this->strong->id])->assertForbidden();
        $this->actingAs($other)->post("/teacher/classrooms/{$this->classroom->id}/share-all")->assertForbidden();
    }

    public function test_share_one_and_all_store_the_teacher_note(): void
    {
        $this->actingAs($this->teacher)
            ->post("/teacher/classrooms/{$this->classroom->id}/share", ['member_id' => $this->strong->id])
            ->assertSessionHasNoErrors();
        $this->assertNotNull($this->strong->fresh()->report_shared_at);
        $this->assertNull($this->strong->fresh()->report['teacher_note']);

        $this->actingAs($this->teacher)
            ->post("/teacher/classrooms/{$this->classroom->id}/share-all", ['note' => '  <b>Hebat</b> semua!  '])
            ->assertSessionHasNoErrors();
        $this->assertSame('Hebat semua!', $this->weak->fresh()->report['teacher_note']);
        $this->assertNull($this->idle->fresh()->report_shared_at);
    }

    public function test_share_validates_member_and_note(): void
    {
        $this->actingAs($this->teacher)
            ->post("/teacher/classrooms/{$this->classroom->id}/share", [])
            ->assertSessionHasErrors('member_id');

        $this->actingAs($this->teacher)
            ->post("/teacher/classrooms/{$this->classroom->id}/share-all", ['note' => str_repeat('a', 501)])
            ->assertSessionHasErrors('note');

        $foreign = ClassroomMember::factory()->create();
        $this->actingAs($this->teacher)
            ->post("/teacher/classrooms/{$this->classroom->id}/share", ['member_id' => $foreign->id])
            ->assertNotFound();
    }

    public function test_normalize_ignores_unknown_labels(): void
    {
        $analyzer = app(ClassroomAnalyzer::class);

        $result = $analyzer->normalize(['summary' => 'Ok', 'students' => [['student' => 'Siswa 2', 'tips' => ['Hai']], 'junk', ['member_id' => 1, 'tips' => ['x']]]], ['Siswa 2' => 42]);

        $this->assertSame(42, $result['students'][0]['member_id']);
        $this->assertSame(['Hai'], $result['students'][0]['feedback']['tips']);
        $this->assertCount(1, $result['students']);
        $this->assertTrue(ClassroomAiText::isEmpty($result['summary']));
    }

    public function test_shared_student_report_matches_the_page_shape(): void
    {
        $this->strong->update(['ai_feedback' => ClassroomAiText::encode(['strengths' => ['Hebat.'], 'improve' => [], 'tips' => ['Coba lagi.']])]);

        $this->actingAs($this->teacher)
            ->post("/teacher/classrooms/{$this->classroom->id}/share", ['member_id' => $this->strong->id, 'note' => '<b>Bagus</b>'])
            ->assertRedirect();

        $this->actingAs(User::query()->find($this->strong->user_id))
            ->get("/portal/classrooms/report/{$this->strong->id}")
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->component('portal/classroom-report')
                ->where('report.totals.rank', 1)
                ->where('report.totals.members', 3)
                ->where('report.mastery', 'excellent')
                ->where('report.teacher_note', 'Bagus')
                ->where('report.ai_feedback.tips', ['Coba lagi.'])
                ->has('report.totals.plays')
                ->has('report.classroom.teacher_name')
                ->has('report.subjects.0.class_accuracy')
                ->has('report.games.0.points')
            );
    }

    public function test_old_plain_text_analysis_still_renders_as_points(): void
    {
        $this->classroom->update(['ai_status' => 'done', 'ai_summary' => 'Kelas bagus. Akurasi 90%. Tambah latihan.']);
        $this->strong->update(['ai_feedback' => 'Hasil sangat bagus. Coba game lain.']);
        $this->strong->update(['report' => ['student' => [], 'ai_feedback' => 'Hebat. Pertahankan.'], 'report_shared_at' => now()]);

        $this->actingAs($this->teacher)
            ->get("/teacher/classrooms/{$this->classroom->id}")
            ->assertInertia(fn ($page) => $page
                ->where('classroom.ai_summary.overview', ['Kelas bagus.', 'Akurasi 90%.', 'Tambah latihan.'])
                ->where('report.students.0.ai_feedback.strengths', ['Hasil sangat bagus.', 'Coba game lain.'])
            );

        $this->actingAs(User::query()->find($this->strong->user_id))
            ->get("/portal/classrooms/report/{$this->strong->id}")
            ->assertOk()
            ->assertInertia(fn ($page) => $page->where('report.ai_feedback.strengths', ['Hebat.', 'Pertahankan.']));
    }
}
