import { useTranslations } from '@/hooks/use-translations';
import { PencilLine, X } from 'lucide-react';
import { type ReactNode } from 'react';

const BUTTON =
    'inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-xl border-2 border-[#151b2e] px-3.5 text-sm font-bold shadow-[2px_2px_0_#151b2e] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#6c5ce7]';

/**
 * Card heading with an "Edit" / "Cancel" toggle. Profile data is shown
 * read-only until the player taps Edit, so it cannot be changed by accident.
 */
export function EditableCardHeader({
    icon,
    title,
    editing,
    canCancel = true,
    onEdit,
    onCancel,
    testId,
}: {
    icon: ReactNode;
    title: string;
    editing: boolean;
    canCancel?: boolean;
    onEdit: () => void;
    onCancel: () => void;
    testId: string;
}) {
    const { t } = useTranslations();

    return (
        <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex min-w-0 items-center gap-2 text-xl font-bold">
                {icon}
                {title}
            </h2>
            {!editing ? (
                <button
                    type="button"
                    onClick={onEdit}
                    className={`${BUTTON} bg-[#ffd93d] hover:bg-[#ffe680]`}
                    data-testid={`${testId}-edit`}
                >
                    <PencilLine className="size-4" aria-hidden />
                    {t('profile.edit')}
                </button>
            ) : (
                canCancel && (
                    <button
                        type="button"
                        onClick={onCancel}
                        className={`${BUTTON} bg-white hover:bg-[#fff9e6]`}
                        data-testid={`${testId}-cancel`}
                    >
                        <X className="size-4" aria-hidden />
                        {t('profile.cancel')}
                    </button>
                )
            )}
        </div>
    );
}

/** Read-only label/value list shown while a card is not being edited. */
export function ReadOnlyFields({
    rows,
    testId,
}: {
    rows: { label: string; value: ReactNode; testId: string }[];
    testId: string;
}) {
    return (
        <dl
            className="grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-[minmax(0,auto)_minmax(0,1fr)] sm:gap-y-2.5"
            data-testid={testId}
        >
            {rows.map((row) => (
                <div key={row.testId} className="contents">
                    <dt className="font-semibold text-[#151b2e]/75">
                        {row.label}
                    </dt>
                    <dd
                        className="mb-2 min-w-0 font-bold break-words sm:mb-0"
                        data-testid={row.testId}
                    >
                        {row.value}
                    </dd>
                </div>
            ))}
        </dl>
    );
}
