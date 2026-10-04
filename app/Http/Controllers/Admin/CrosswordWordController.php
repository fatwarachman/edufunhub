<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\CrosswordWordRequest;
use App\Models\CrosswordWord;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Super admin management of the Teka-Teki Silang word bank. Each level must
 * keep enough active words for the Go generator (twice the words per grid).
 */
class CrosswordWordController extends Controller
{
    public function index(Request $request): Response
    {
        $filters = $request->only(['search', 'level', 'status']);

        return Inertia::render('admin/crossword-words/index', [
            'words' => CrosswordWord::query()
                ->with('author:id,name')
                ->when($filters['search'] ?? null, fn (Builder $q, string $search) => $q->where(fn (Builder $q) => $q
                    ->where('answer', 'like', '%'.addcslashes(Str::upper($search), '%_\\').'%')
                    ->orWhere('clue_id', 'like', '%'.addcslashes($search, '%_\\').'%')
                    ->orWhere('clue_en', 'like', '%'.addcslashes($search, '%_\\').'%')))
                ->when(array_key_exists((int) ($filters['level'] ?? 0), CrosswordWord::LEVELS), fn (Builder $q) => $q->where('level', (int) $filters['level']))
                ->when(($filters['status'] ?? null) === 'active', fn (Builder $q) => $q->where('is_active', true))
                ->when(($filters['status'] ?? null) === 'inactive', fn (Builder $q) => $q->where('is_active', false))
                ->orderBy('level')
                ->orderBy('answer')
                ->paginate(25)
                ->withQueryString()
                ->through(fn (CrosswordWord $word): array => [
                    ...$word->only(['id', 'key', 'level', 'answer', 'clue_id', 'clue_en', 'is_active', 'times_used', 'times_solved']),
                    'solve_rate' => $word->solveRate(),
                    'author' => $word->author?->name,
                ]),
            'levels' => $this->levelStats(),
            'filters' => (object) $filters,
        ]);
    }

    public function create(Request $request): Response
    {
        $level = array_key_exists($request->integer('level'), CrosswordWord::LEVELS) ? $request->integer('level') : 1;

        return Inertia::render('admin/crossword-words/form', ['word' => null, 'defaultLevel' => $level, 'levels' => $this->levelStats()]);
    }

    public function store(CrosswordWordRequest $request): RedirectResponse
    {
        $word = CrosswordWord::query()->create([
            ...$request->validated(),
            'key' => 'cw-'.Str::lower(Str::random(10)),
            'created_by' => $request->user()->id,
        ]);

        activity()->causedBy($request->user())->performedOn($word)->log('Created crossword word');

        return to_route('admin.crossword-words.index', ['level' => $word->level])->with('success', 'Word added.');
    }

    public function edit(CrosswordWord $crosswordWord): Response
    {
        return Inertia::render('admin/crossword-words/form', [
            'word' => [
                ...$crosswordWord->only(['id', 'key', 'level', 'answer', 'clue_id', 'clue_en', 'is_active', 'times_used', 'times_solved']),
                'solve_rate' => $crosswordWord->solveRate(),
            ],
            'defaultLevel' => $crosswordWord->level,
            'levels' => $this->levelStats(),
        ]);
    }

    public function update(CrosswordWordRequest $request, CrosswordWord $crosswordWord): RedirectResponse
    {
        $data = $request->validated();
        $leavesLevel = $crosswordWord->is_active && ((int) $data['level'] !== $crosswordWord->level || ! $data['is_active']);
        if ($leavesLevel) {
            $this->guardMinimum($crosswordWord);
        }

        $crosswordWord->update($data);
        activity()->causedBy($request->user())->performedOn($crosswordWord)->log('Updated crossword word');

        return to_route('admin.crossword-words.index', ['level' => $crosswordWord->level])->with('success', 'Word updated.');
    }

    public function toggle(Request $request, CrosswordWord $crosswordWord): RedirectResponse
    {
        if ($crosswordWord->is_active) {
            $this->guardMinimum($crosswordWord);
        }

        $crosswordWord->update(['is_active' => ! $crosswordWord->is_active]);
        activity()->causedBy($request->user())->performedOn($crosswordWord)->log($crosswordWord->is_active ? 'Activated crossword word' : 'Deactivated crossword word');

        return back()->with('success', $crosswordWord->is_active ? 'Word activated.' : 'Word deactivated.');
    }

    public function destroy(Request $request, CrosswordWord $crosswordWord): RedirectResponse
    {
        if ($crosswordWord->is_active) {
            $this->guardMinimum($crosswordWord);
        }

        activity()->causedBy($request->user())->performedOn($crosswordWord)->log('Deleted crossword word');
        $crosswordWord->delete();

        return to_route('admin.crossword-words.index', ['level' => $crosswordWord->level])->with('success', 'Word deleted.');
    }

    /** Refuse to drop a level below the active words the generator needs. */
    private function guardMinimum(CrosswordWord $word): void
    {
        $active = CrosswordWord::query()->active()->where('level', $word->level)->count();
        $minimum = CrosswordWord::minimumActive($word->level);

        if ($active - 1 < $minimum) {
            throw ValidationException::withMessages([
                'word' => "Level {$word->level} needs at least {$minimum} active words to build varied grids.",
            ]);
        }
    }

    /** @return list<array{level: int, size: int, words_per_grid: int, minimum: int, total: int, active: int, used: int, solve_rate: ?float}> */
    private function levelStats(): array
    {
        $rows = CrosswordWord::query()
            ->selectRaw('level, COUNT(*) as total, SUM(CASE WHEN is_active THEN 1 ELSE 0 END) as active, SUM(times_used) as used, SUM(times_solved) as solved')
            ->groupBy('level')
            ->get()
            ->keyBy('level');

        return collect(CrosswordWord::LEVELS)->map(function (array $level, int $number) use ($rows): array {
            $row = $rows->get($number);
            $used = (int) ($row->used ?? 0);

            return [
                'level' => $number,
                'size' => $level[0],
                'words_per_grid' => $level[1],
                'minimum' => CrosswordWord::minimumActive($number),
                'total' => (int) ($row->total ?? 0),
                'active' => (int) ($row->active ?? 0),
                'used' => $used,
                'solve_rate' => $used > 0 ? round(((int) $row->solved) / $used * 100, 1) : null,
            ];
        })->values()->all();
    }
}
