import InputError from '@/components/input-error';
import { useTranslations } from '@/hooks/use-translations';
import { router, useForm } from '@inertiajs/react';
import { Camera, ImagePlus, Loader2, Trash2, UserRound } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

const BUTTON =
    'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border-2 border-[#151b2e] px-4 text-sm font-bold shadow-[2px_2px_0_#151b2e] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#6c5ce7] disabled:opacity-50';

const MAX_BYTES = 2 * 1024 * 1024;
const OUTPUT_SIZE = 512;
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];

/** Centre-crops the picked image to a square JPEG so every avatar looks the same. */
async function squareJpeg(file: File): Promise<File> {
    const bitmap = await createImageBitmap(file);
    const side = Math.min(bitmap.width, bitmap.height);
    const size = Math.min(OUTPUT_SIZE, side);
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d');
    if (!context) {
        return file;
    }
    context.drawImage(
        bitmap,
        (bitmap.width - side) / 2,
        (bitmap.height - side) / 2,
        side,
        side,
        0,
        0,
        size,
        size,
    );
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', 0.9),
    );
    return blob
        ? new File([blob], 'profile.jpg', { type: 'image/jpeg' })
        : file;
}

/**
 * Upload, replace or remove the player's profile photo. Admins see the same
 * photo on the user's detail page.
 */
export function ProfilePhotoCard({
    photoUrl,
    name,
    className,
}: {
    photoUrl: string | null;
    name: string;
    className: string;
}) {
    const { t } = useTranslations();
    const input = useRef<HTMLInputElement>(null);
    const form = useForm<{ photo: File | null }>({ photo: null });
    const [preview, setPreview] = useState<string | null>(null);
    const [clientError, setClientError] = useState<string | null>(null);
    const [removing, setRemoving] = useState(false);
    const [status, setStatus] = useState<string | null>(null);

    useEffect(
        () => () => {
            if (preview) {
                URL.revokeObjectURL(preview);
            }
        },
        [preview],
    );

    const pick = async (file: File | undefined) => {
        setStatus(null);
        setClientError(null);
        form.clearErrors();
        if (!file) {
            return;
        }
        if (!ACCEPTED.includes(file.type)) {
            setClientError(t('profile.photo.errorType'));
            return;
        }
        if (file.size > MAX_BYTES * 4) {
            setClientError(t('profile.photo.errorSize'));
            return;
        }
        let prepared = file;
        try {
            prepared = await squareJpeg(file);
        } catch {
            prepared = file;
        }
        if (prepared.size > MAX_BYTES) {
            setClientError(t('profile.photo.errorSize'));
            return;
        }
        form.setData('photo', prepared);
        setPreview(URL.createObjectURL(prepared));
    };

    const reset = () => {
        form.reset();
        setPreview(null);
        if (input.current) {
            input.current.value = '';
        }
    };

    const save = () => {
        form.post('/profile/photo', {
            forceFormData: true,
            preserveScroll: true,
            onSuccess: () => {
                reset();
                setStatus(t('profile.photo.saved'));
            },
        });
    };

    const remove = () => {
        setRemoving(true);
        setStatus(null);
        router.delete('/profile/photo', {
            preserveScroll: true,
            onSuccess: () => setStatus(t('profile.photo.removed')),
            onFinish: () => setRemoving(false),
        });
    };

    const shown = preview ?? photoUrl;
    const error = clientError ?? form.errors.photo;

    return (
        <section className={className} data-testid="profile-photo">
            <h2 className="flex items-center gap-2 text-xl font-bold">
                <Camera className="size-5" aria-hidden />
                {t('profile.photo.title')}
            </h2>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <button
                    type="button"
                    onClick={() => input.current?.click()}
                    className="group relative mx-auto size-28 shrink-0 overflow-hidden rounded-full border-2 border-[#151b2e] bg-white shadow-[2px_2px_0_#151b2e] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#6c5ce7] sm:mx-0"
                    aria-label={t('profile.photo.choose')}
                    data-testid="profile-photo-preview"
                >
                    {shown ? (
                        <img
                            src={shown}
                            alt={t('profile.photo.alt', { name })}
                            className="size-full object-cover"
                        />
                    ) : (
                        <span className="grid size-full place-items-center bg-[#fff4d6]">
                            <UserRound className="size-12" aria-hidden />
                        </span>
                    )}
                    <span className="absolute inset-x-0 bottom-0 grid h-8 place-items-center bg-[#151b2e]/70 text-white opacity-90 transition-opacity group-hover:opacity-100">
                        <Camera className="size-4" aria-hidden />
                    </span>
                </button>
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <p className="text-sm text-[#151b2e]/80">
                        {t('profile.photo.help')}
                    </p>
                    <input
                        ref={input}
                        type="file"
                        accept={ACCEPTED.join(',')}
                        className="sr-only"
                        tabIndex={-1}
                        aria-hidden="true"
                        onChange={(event) => pick(event.target.files?.[0])}
                        data-testid="profile-photo-input"
                    />
                    <div className="flex flex-wrap gap-2">
                        {form.data.photo ? (
                            <>
                                <button
                                    type="button"
                                    onClick={save}
                                    disabled={form.processing}
                                    className={`${BUTTON} bg-[#ffd93d] hover:bg-[#ffe680]`}
                                    data-testid="profile-photo-save"
                                >
                                    {form.processing ? (
                                        <Loader2
                                            className="size-4 animate-spin"
                                            aria-hidden
                                        />
                                    ) : (
                                        <ImagePlus
                                            className="size-4"
                                            aria-hidden
                                        />
                                    )}
                                    {t('profile.photo.save')}
                                </button>
                                <button
                                    type="button"
                                    onClick={reset}
                                    disabled={form.processing}
                                    className={`${BUTTON} bg-white hover:bg-[#fff9e6]`}
                                >
                                    {t('profile.cancel')}
                                </button>
                            </>
                        ) : (
                            <>
                                <button
                                    type="button"
                                    onClick={() => input.current?.click()}
                                    className={`${BUTTON} bg-[#ffd93d] hover:bg-[#ffe680]`}
                                    data-testid="profile-photo-choose"
                                >
                                    <ImagePlus className="size-4" aria-hidden />
                                    {photoUrl
                                        ? t('profile.photo.change')
                                        : t('profile.photo.upload')}
                                </button>
                                {photoUrl && (
                                    <button
                                        type="button"
                                        onClick={remove}
                                        disabled={removing}
                                        className={`${BUTTON} bg-white text-[#b42318] hover:bg-[#fff1f0]`}
                                        data-testid="profile-photo-remove"
                                    >
                                        <Trash2
                                            className="size-4"
                                            aria-hidden
                                        />
                                        {t('profile.photo.remove')}
                                    </button>
                                )}
                            </>
                        )}
                    </div>
                    {form.progress && (
                        <progress
                            value={form.progress.percentage}
                            max={100}
                            className="h-2 w-full"
                        />
                    )}
                    <InputError message={error ?? undefined} />
                    {status && (
                        <p
                            role="status"
                            className="text-sm font-semibold text-[#116a56]"
                        >
                            {status}
                        </p>
                    )}
                </div>
            </div>
        </section>
    );
}
