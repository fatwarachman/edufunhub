<?php

use App\Ai\Agents\QuestionWriter;
use App\Jobs\GenerateQuestions;
use App\Models\Question;
use App\Models\QuestionGeneration;
use App\Models\Setting;
use App\Models\Subject;
use App\Models\SubjectTopic;
use App\Models\User;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Queue;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(function (): void {
    config(['scout.driver' => 'null']);
    $this->withoutVite();
    $this->admin = User::factory()->superadmin()->create();
    $this->actingAs($this->admin);
});

function configureTopicAi(): void
{
    Setting::set('ai.base_url', 'https://ai.test/v1', 'ai');
    Setting::set('ai.api_key', Crypt::encryptString('test-key'), 'ai');
    Setting::set('ai.model', 'gpt-4o-mini', 'ai');
}

function topicQuestion(string $prompt): array
{
    return ['prompt_id' => $prompt, 'prompt_en' => $prompt, 'options' => [['id' => 'Satu', 'en' => 'One'], ['id' => 'Dua', 'en' => 'Two'], ['id' => 'Tiga', 'en' => 'Three'], ['id' => 'Empat', 'en' => 'Four']], 'answer' => 1, 'hint_id' => 'Petunjuk.', 'hint_en' => 'Hint.'];
}

it('lets an admin create a subject topic with a material description for the AI', function (): void {
    $subject = Subject::query()->where('key', 'math')->sole();

    $this->postJson("/admin/subjects/{$subject->id}/topics", [
        'name_id' => 'Pecahan',
        'name_en' => 'Fractions',
        'material' => 'Pecahan biasa, penyebut sama, penjumlahan dan pengurangan pecahan.',
        'is_active' => true,
    ])->assertCreated()->assertJsonPath('topic.material', 'Pecahan biasa, penyebut sama, penjumlahan dan pengurangan pecahan.');

    expect(SubjectTopic::query()->where('subject_key', 'math')->where('name_id', 'Pecahan')->exists())->toBeTrue();
});

it('shares active topics with the AI generation page', function (): void {
    $topic = SubjectTopic::factory()->create(['subject_key' => 'math', 'name_id' => 'Pecahan', 'material' => 'Penjumlahan pecahan.']);
    SubjectTopic::factory()->create(['subject_key' => 'math', 'name_id' => 'Nonaktif', 'is_active' => false]);

    $this->get('/admin/questions/generate')->assertInertia(fn (Assert $page) => $page
        ->component('admin/questions/generate')
        ->has('topics', 1)
        ->where('topics.0.id', $topic->id)
        ->where('topics.0.material', 'Penjumlahan pecahan.'));
});

it('generates AI questions focused on the chosen topic and links them to it', function (): void {
    configureTopicAi();
    $topic = SubjectTopic::factory()->create(['subject_key' => 'math', 'name_id' => 'Pecahan', 'name_en' => 'Fractions', 'material' => 'Penjumlahan pecahan berpenyebut sama.']);
    QuestionWriter::fake([['questions' => [topicQuestion('Hasil 1/4 + 1/4 adalah…')]]]);

    $this->post('/admin/questions/generate', ['scope' => 'custom', 'subjects' => [], 'topic_ids' => [$topic->id], 'grades' => [4], 'per_combination' => 1, 'games' => ['sky-quiz']])
        ->assertSessionHasNoErrors();

    $generation = QuestionGeneration::query()->sole();
    expect($generation->topic_ids)->toBe([$topic->id])
        ->and($generation->toProgressPayload()['items'][0]['topic']['name_id'])->toBe('Pecahan')
        ->and(Question::query()->where('generation_id', $generation->id)->sole()->topic_id)->toBe($topic->id);
    QuestionWriter::assertPrompted(fn ($prompt) => str_contains($prompt->prompt, 'Pecahan')
        && str_contains($prompt->prompt, 'Penjumlahan pecahan berpenyebut sama.'));
});

it('rejects an unknown or inactive topic', function (): void {
    configureTopicAi();
    $topic = SubjectTopic::factory()->create(['subject_key' => 'math', 'is_active' => false]);

    $this->post('/admin/questions/generate', ['scope' => 'custom', 'subjects' => ['math'], 'topic_ids' => [$topic->id], 'grades' => [4], 'per_combination' => 1, 'games' => ['sky-quiz']])
        ->assertSessionHasErrors('topic_ids.0');

    expect(QuestionGeneration::query()->count())->toBe(0);
});

it('generates for every active topic when a whole subject is picked', function (): void {
    configureTopicAi();
    Queue::fake();
    $fractions = SubjectTopic::factory()->create(['subject_key' => 'math', 'name_id' => 'Pecahan']);
    $geometry = SubjectTopic::factory()->create(['subject_key' => 'math', 'name_id' => 'Bangun datar']);
    SubjectTopic::factory()->create(['subject_key' => 'math', 'name_id' => 'Lama', 'is_active' => false]);

    $this->post('/admin/questions/generate', ['scope' => 'custom', 'subjects' => ['math', 'civics'], 'grades' => [4, 5], 'per_combination' => 2, 'games' => ['sky-quiz']])
        ->assertSessionHasNoErrors();

    $generation = QuestionGeneration::query()->sole();
    $targets = $generation->items()->orderBy('id')->get()
        ->map(fn ($item): string => "{$item->subject}:".($item->topic_id ?? 'all').":{$item->grade}")->all();
    expect($targets)->toBe([
        "math:{$fractions->id}:4", "math:{$fractions->id}:5",
        "math:{$geometry->id}:4", "math:{$geometry->id}:5",
        'civics:all:4', 'civics:all:5',
    ])->and($generation->total_jobs)->toBe(6)
        ->and($generation->topic_ids)->toBe([$fractions->id, $geometry->id]);
    Queue::assertPushed(GenerateQuestions::class, 6);
});

it('generates only for the picked topics of a subject', function (): void {
    configureTopicAi();
    Queue::fake();
    $fractions = SubjectTopic::factory()->create(['subject_key' => 'math', 'name_id' => 'Pecahan']);
    SubjectTopic::factory()->create(['subject_key' => 'math', 'name_id' => 'Bangun datar']);
    $cells = SubjectTopic::factory()->create(['subject_key' => 'science', 'name_id' => 'Sel']);

    $this->post('/admin/questions/generate', ['scope' => 'custom', 'subjects' => [], 'topic_ids' => [$fractions->id, $cells->id], 'grades' => [4], 'per_combination' => 3, 'games' => ['sky-quiz']])
        ->assertSessionHasNoErrors();

    $generation = QuestionGeneration::query()->sole();
    expect($generation->subjects)->toBe(['math', 'science'])
        ->and($generation->items()->orderBy('id')->pluck('topic_id')->all())->toBe([$fractions->id, $cells->id]);
    Queue::assertPushed(GenerateQuestions::class, fn (GenerateQuestions $job): bool => $job->topicId === $fractions->id && $job->subject === 'math');
});

it('counts every topic target against the request limit', function (): void {
    configureTopicAi();
    SubjectTopic::factory()->count(5)->sequence(fn ($s) => ['name_id' => "Topik {$s->index}"])->create(['subject_key' => 'math']);

    $this->post('/admin/questions/generate', ['scope' => 'custom', 'subjects' => ['math'], 'grades' => [0, 1, 2, 3, 4, 5, 6, 7, 8], 'per_combination' => 20, 'games' => ['sky-quiz']])
        ->assertSessionHasErrors('per_combination');
});

it('shows topics nested under each subject on the subjects page', function (): void {
    $topic = SubjectTopic::factory()->create(['subject_key' => 'math', 'name_id' => 'Pecahan', 'material' => 'Penjumlahan pecahan.']);

    $this->get('/admin/subjects')->assertInertia(fn (Assert $page) => $page
        ->component('admin/subjects/index')
        ->where('subjects', fn ($subjects) => collect($subjects)->firstWhere('key', 'math')['topics'][0]['id'] === $topic->id));
});
