<?php

use App\Http\Controllers\Api\CrosswordBankController;
use App\Http\Controllers\Api\GameResultController;
use App\Http\Controllers\Api\HealthController;
use App\Http\Controllers\Api\QuestionBankController;
use App\Http\Controllers\Api\SequenceBankController;
use App\Http\Controllers\Api\SorterBankController;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

Route::get('/health', HealthController::class);

Route::post('/internal/game-results', [GameResultController::class, 'store'])
    ->middleware('throttle:120,1,api.internal.game-results.store')
    ->name('api.internal.game-results.store');

Route::get('/internal/question-bank', QuestionBankController::class)
    ->middleware('throttle:120,1,api.internal.question-bank')
    ->name('api.internal.question-bank');

Route::get('/internal/crossword-bank', CrosswordBankController::class)
    ->middleware('throttle:120,1,api.internal.crossword-bank')
    ->name('api.internal.crossword-bank');

Route::get('/internal/sequence-bank', SequenceBankController::class)
    ->middleware('throttle:120,1,api.internal.sequence-bank')
    ->name('api.internal.sequence-bank');

Route::get('/internal/sorter-bank', SorterBankController::class)
    ->middleware('throttle:120,1,api.internal.sorter-bank')
    ->name('api.internal.sorter-bank');

Route::get('/user', function (Request $request) {
    return $request->user();
})->middleware('auth:sanctum');

/*
|--------------------------------------------------------------------------
| Workspace API v1 (authenticated via workspace API keys)
|--------------------------------------------------------------------------
|
| These routes are authenticated using the wsk_ workspace API keys
| generated in the workspace settings. Each route requires the
| api-key middleware with the appropriate scope.
|
*/
use App\Http\Controllers\Api\V1\WorkspaceController;

Route::prefix('v1')->middleware('api-key:read')->group(function () {
    Route::get('/workspace', [WorkspaceController::class, 'show']);
    Route::get('/members', [WorkspaceController::class, 'members']);
});
