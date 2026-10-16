/**
 * Downsizes a picture in the browser before it is uploaded as a question or
 * answer option picture, so teachers can pick any phone photo and the upload
 * still fits the server limits (QuestionVisual: 1 MB question, 512 KB option,
 * longest side 2000 px). Returns the original file when it already fits or
 * when the browser cannot decode it (the server then reports the problem).
 */
export const QUESTION_IMAGE_LIMITS = {
    question: { maxBytes: 1024 * 1024, maxSide: 1280 },
    option: { maxBytes: 512 * 1024, maxSide: 640 },
} as const;

export type QuestionImagePurpose = keyof typeof QUESTION_IMAGE_LIMITS;

const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];

export async function prepareQuestionImage(
    file: File,
    purpose: QuestionImagePurpose,
): Promise<File> {
    const limits = QUESTION_IMAGE_LIMITS[purpose];
    if (
        !ACCEPTED.includes(file.type) ||
        typeof createImageBitmap !== 'function'
    ) {
        return file;
    }

    let bitmap: ImageBitmap;
    try {
        bitmap = await createImageBitmap(file);
    } catch {
        return file;
    }

    const longest = Math.max(bitmap.width, bitmap.height);
    if (file.size <= limits.maxBytes && longest <= limits.maxSide) {
        bitmap.close();
        return file;
    }

    const scale = Math.min(1, limits.maxSide / longest);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) {
        bitmap.close();
        return file;
    }
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    const type = file.type === 'image/png' ? 'image/png' : 'image/webp';
    for (const quality of [0.9, 0.8, 0.7, 0.6]) {
        const blob = await new Promise<Blob | null>((resolve) =>
            canvas.toBlob(resolve, type, quality),
        );
        if (blob && (blob.size <= limits.maxBytes || quality === 0.6)) {
            const extension = type === 'image/png' ? 'png' : 'webp';
            return new File(
                [blob],
                `${file.name.replace(/\.[^.]+$/, '')}.${extension}`,
                { type },
            );
        }
    }

    return file;
}
