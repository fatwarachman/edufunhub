import { prepareQuestionImage } from '@/lib/image-resize';
import { Loader2, Upload, X } from 'lucide-react';
import { type ChangeEvent, useState } from 'react';

export type QuestionOptionMediaData = { kind: 'image'; src: string };

function csrf(): string {
    return decodeURIComponent(
        document.cookie.match(/XSRF-TOKEN=([^;]+)/)?.[1] ?? '',
    );
}

export function QuestionOptionMedia({
    value,
    onChange,
    label,
    uploadLabel,
    removeLabel,
    error,
    endpoint,
}: {
    value?: QuestionOptionMediaData;
    onChange: (value?: QuestionOptionMediaData) => void;
    label: string;
    uploadLabel: string;
    removeLabel: string;
    error?: string;
    endpoint?: string;
}) {
    const [uploading, setUploading] = useState(false);
    const [uploadError, setUploadError] = useState<string>();

    const upload = async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        setUploading(true);
        setUploadError(undefined);
        try {
            const body = new FormData();
            body.append('image', await prepareQuestionImage(file, 'option'));
            body.append('purpose', 'option');
            const response = await fetch(endpoint ?? '/admin/questions/media', {
                method: 'POST',
                body,
                credentials: 'same-origin',
                headers: {
                    Accept: 'application/json',
                    'X-XSRF-TOKEN': csrf(),
                    'X-Requested-With': 'XMLHttpRequest',
                },
            });
            const json = (await response.json().catch(() => ({}))) as {
                src?: string;
                message?: string;
                errors?: Record<string, string[]>;
            };
            if (!response.ok || !json.src) {
                setUploadError(
                    json.errors?.image?.[0] ?? json.message ?? uploadLabel,
                );
                return;
            }
            onChange({ kind: 'image', src: json.src });
        } catch {
            setUploadError(uploadLabel);
        } finally {
            setUploading(false);
        }
    };

    return (
        <div className="flex min-w-24 items-center gap-1">
            {value?.src ? (
                <>
                    <img
                        src={value.src}
                        alt={label}
                        className="size-12 rounded-md border object-contain"
                    />
                    <button
                        type="button"
                        onClick={() => onChange(undefined)}
                        aria-label={removeLabel}
                        className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-muted"
                    >
                        <X className="size-4" />
                    </button>
                </>
            ) : (
                <label className="inline-flex min-h-8 cursor-pointer items-center gap-1 rounded-md border border-dashed px-2 text-xs font-medium text-muted-foreground hover:text-foreground">
                    {uploading ? (
                        <Loader2 className="size-3 animate-spin" />
                    ) : (
                        <Upload className="size-3" />
                    )}
                    {label}
                    <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="sr-only"
                        onChange={upload}
                        disabled={uploading}
                    />
                </label>
            )}
            {(error || uploadError) && (
                <span className="text-xs text-destructive">
                    {error ?? uploadError}
                </span>
            )}
        </div>
    );
}
