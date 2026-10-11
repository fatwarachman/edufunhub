<?php

it('registers subject analysis in the shared admin navigation', function (): void {
    $navigation = file_get_contents(resource_path('js/lib/admin-navigation.ts'));

    expect($navigation)->toContain("title: 'Subject Analysis'", "href: '/admin/subject-analysis'");
});

it('provides translated subject analysis and screen time detail labels', function (): void {
    $catalog = json_decode(file_get_contents(resource_path('js/locales/id-admin.json')), true, flags: JSON_THROW_ON_ERROR);

    foreach (['Subject Analysis', 'Mastery rate', 'Recorded answers', 'Highest mastery grades', 'Mastery by grade', 'Mastery by question level', 'Mastery by game', 'Questions needing attention', 'Total active time: {0}', 'Share of selected period: {0}%'] as $label) {
        expect($catalog)->toHaveKey($label);
        expect($catalog[$label])->toBeString()->not->toBeEmpty();
    }
});

it('uses accessible shared tooltip triggers instead of native title attributes for heatmap cells', function (): void {
    $cell = file_get_contents(resource_path('js/components/admin/screen-time-cell.tsx'));
    $page = file_get_contents(resource_path('js/pages/admin/screen-time/index.tsx'));

    expect($cell)->toContain('TooltipTrigger', 'TooltipContent', 'aria-label={label}', 'onClick={() => setOpen(true)}', 'Total active time: {0}', 'Share of selected period: {0}%');
    expect($page)->toContain('<ScreenTimeCell', 'duration={formatScreenTime(seconds)}');
});
