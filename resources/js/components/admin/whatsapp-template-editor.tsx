import InputError from '@/components/input-error';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { WhatsAppIcon } from '@/components/whatsapp-share-button';
import { tr } from '@/lib/admin-i18n';
import { cn } from '@/lib/utils';
import { router, useForm } from '@inertiajs/react';
import { Loader2, PencilLine, RotateCcw, Save } from 'lucide-react';
import { type FormEvent, type ReactNode, useRef, useState } from 'react';

export type TemplateLocale = 'id' | 'en';

export interface WhatsAppTemplate {
    placeholders: string[];
    templates: Record<
        TemplateLocale,
        { text: string; default: string; custom: boolean }
    >;
}

const LOCALES: { key: TemplateLocale; label: string }[] = [
    { key: 'id', label: 'Indonesian' },
    { key: 'en', label: 'English' },
];

/** What each placeholder means, shown as a tooltip on its chip. */
const PLACEHOLDER_HINTS: Record<string, string> = {
    name: 'Player nickname or account name',
    app: 'App name',
    url: 'App address',
    from: 'Name of the player who sent the request',
    link: 'Link to the related page',
    subject: 'Requested subject',
    note: 'Message written by the player',
};

/** Example values for the live preview. */
function sampleValues(): Record<string, string> {
    const origin =
        typeof window === 'undefined'
            ? 'https://edufunhub.com'
            : window.location.origin;

    return {
        name: 'Ana',
        app: 'EduFunHub',
        url: origin,
        from: 'Budi',
        link: `${origin}/friends?tab=requests`,
        subject: tr('Mathematics'),
        note: tr('I teach grade 5.'),
    };
}

/** Fill `:key` placeholders, longest key first (same as the server). */
export function fillTemplate(
    text: string,
    values: Record<string, string>,
): string {
    const keys = Object.keys(values).sort((a, b) => b.length - a.length);
    if (keys.length === 0) {
        return text.trim();
    }
    const pattern = new RegExp(`:(${keys.join('|')})`, 'g');

    return text.replace(pattern, (_, key: string) => values[key] ?? '').trim();
}

/** Placeholders in a text that the message type does not provide. */
export function unknownPlaceholders(text: string, allowed: string[]): string[] {
    const found = [...text.matchAll(/:([a-zA-Z_][a-zA-Z0-9_]*)/g)].map(
        (match) => match[1],
    );

    return [...new Set(found.filter((key) => !allowed.includes(key)))];
}

/** WhatsApp inline formatting (*bold*, _italic_, ~strike~) as React nodes. */
function formatWhatsApp(text: string): ReactNode[] {
    const parts = text.split(/(\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~)/g);

    return parts.map((part, index) => {
        if (part.length > 2) {
            const inner = part.slice(1, -1);
            if (part.startsWith('*') && part.endsWith('*')) {
                return <strong key={index}>{inner}</strong>;
            }
            if (part.startsWith('_') && part.endsWith('_')) {
                return <em key={index}>{inner}</em>;
            }
            if (part.startsWith('~') && part.endsWith('~')) {
                return <s key={index}>{inner}</s>;
            }
        }

        return part;
    });
}

/**
 * List of editable WhatsApp messages with an edit modal: text per language,
 * clickable placeholders, live WhatsApp-style preview and reset to default.
 */
export function WhatsAppTemplateList({
    templates,
    labels,
    maxLength,
}: {
    templates: Record<string, WhatsAppTemplate>;
    labels: Record<string, string>;
    maxLength: number;
}) {
    const [editing, setEditing] = useState<string | null>(null);

    return (
        <>
            <ul
                className="flex flex-col divide-y divide-border rounded-xl border border-border"
                data-testid="wa-templates"
            >
                {Object.entries(templates).map(([event, template]) => {
                    const custom = LOCALES.some(
                        ({ key }) => template.templates[key].custom,
                    );

                    return (
                        <li
                            key={event}
                            className="flex flex-wrap items-center justify-between gap-3 p-3.5"
                            data-testid={`wa-template-${event}`}
                        >
                            <div className="flex min-w-0 flex-1 basis-56 flex-col gap-1">
                                <span className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
                                    {tr(labels[event] ?? event)}
                                    <span
                                        className={cn(
                                            'inline-flex h-5 items-center rounded-full px-2 text-[11px] font-medium',
                                            custom
                                                ? 'bg-primary/10 text-primary'
                                                : 'bg-muted text-muted-foreground',
                                        )}
                                        data-testid={`wa-template-${event}-state`}
                                    >
                                        {custom ? tr('Custom') : tr('Default')}
                                    </span>
                                </span>
                                <span className="line-clamp-2 text-xs [overflow-wrap:anywhere] text-muted-foreground">
                                    {template.templates.id.text}
                                </span>
                            </div>
                            <button
                                type="button"
                                onClick={() => setEditing(event)}
                                className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium text-foreground hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                                data-testid={`wa-template-${event}-edit`}
                            >
                                <PencilLine className="size-4" />
                                {tr('Edit template')}
                            </button>
                        </li>
                    );
                })}
            </ul>

            {editing !== null && templates[editing] && (
                <TemplateDialog
                    key={editing}
                    event={editing}
                    label={labels[editing] ?? editing}
                    template={templates[editing]}
                    maxLength={maxLength}
                    onClose={() => setEditing(null)}
                />
            )}
        </>
    );
}

function TemplateDialog({
    event,
    label,
    template,
    maxLength,
    onClose,
}: {
    event: string;
    label: string;
    template: WhatsAppTemplate;
    maxLength: number;
    onClose: () => void;
}) {
    const [locale, setLocale] = useState<TemplateLocale>('id');
    const [confirmReset, setConfirmReset] = useState(false);
    const [resetting, setResetting] = useState(false);
    const textarea = useRef<HTMLTextAreaElement>(null);
    const form = useForm<{ templates: Record<TemplateLocale, string> }>({
        templates: {
            id: template.templates.id.text,
            en: template.templates.en.text,
        },
    });

    const text = form.data.templates[locale];
    const unknown = unknownPlaceholders(text, template.placeholders);
    const hasCustom = LOCALES.some(({ key }) => template.templates[key].custom);
    const invalid = LOCALES.some(
        ({ key }) =>
            form.data.templates[key].trim() === '' ||
            form.data.templates[key].length > maxLength ||
            unknownPlaceholders(form.data.templates[key], template.placeholders)
                .length > 0,
    );
    const errorFor = (key: TemplateLocale) =>
        (form.errors as Record<string, string | undefined>)[`templates.${key}`];

    const setText = (value: string) =>
        form.setData('templates', { ...form.data.templates, [locale]: value });

    const insert = (placeholder: string) => {
        const field = textarea.current;
        const token = `:${placeholder}`;
        if (!field) {
            setText(text + token);
            return;
        }
        const start = field.selectionStart ?? text.length;
        const end = field.selectionEnd ?? text.length;
        setText(text.slice(0, start) + token + text.slice(end));
        requestAnimationFrame(() => {
            field.focus();
            field.setSelectionRange(start + token.length, start + token.length);
        });
    };

    const submit = (submitEvent: FormEvent) => {
        submitEvent.preventDefault();
        form.put(`/admin/whatsapp/templates/${event}`, {
            preserveScroll: true,
            onSuccess: () => onClose(),
        });
    };

    const reset = () =>
        router.delete(`/admin/whatsapp/templates/${event}`, {
            preserveScroll: true,
            onStart: () => setResetting(true),
            onFinish: () => {
                setResetting(false);
                setConfirmReset(false);
            },
            onSuccess: () => onClose(),
        });

    return (
        <>
            <Dialog
                open
                onOpenChange={(open) => !open && !resetting && onClose()}
            >
                <DialogContent
                    className="max-h-[calc(100dvh-2rem)] overflow-y-auto p-4 sm:max-w-3xl sm:p-6 dark:border-white/15 dark:shadow-[0_0_24px_rgba(255,255,255,0.06)]"
                    data-testid="wa-template-dialog"
                >
                    <DialogHeader className="pr-6 text-left">
                        <DialogTitle className="flex items-center gap-2 text-base leading-snug">
                            <WhatsAppIcon className="size-5 shrink-0 text-[#25d366]" />
                            {tr('Edit template: {0}', [tr(label)])}
                        </DialogTitle>
                        <DialogDescription>
                            {tr(
                                'Write the message in both languages. Players get the one that matches their account language.',
                            )}
                        </DialogDescription>
                    </DialogHeader>

                    <form
                        onSubmit={submit}
                        className="flex min-w-0 flex-col gap-4"
                        data-testid="wa-template-form"
                    >
                        <div
                            role="tablist"
                            aria-label={tr('Language')}
                            className="inline-flex w-fit rounded-lg border border-border bg-muted/50 p-0.5"
                        >
                            {LOCALES.map(({ key, label: localeLabel }) => (
                                <button
                                    key={key}
                                    type="button"
                                    role="tab"
                                    aria-selected={locale === key}
                                    onClick={() => setLocale(key)}
                                    className={cn(
                                        'inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                                        locale === key
                                            ? 'bg-background text-foreground shadow-sm'
                                            : 'text-muted-foreground hover:text-foreground',
                                    )}
                                    data-testid={`wa-template-tab-${key}`}
                                >
                                    {tr(localeLabel)}
                                    {errorFor(key) && (
                                        <span
                                            className="size-1.5 rounded-full bg-destructive"
                                            aria-hidden
                                        />
                                    )}
                                </button>
                            ))}
                        </div>

                        <div className="grid min-w-0 gap-4 lg:grid-cols-2">
                            <div className="flex min-w-0 flex-col gap-2">
                                <label
                                    htmlFor="wa-template-text"
                                    className="text-xs font-medium text-muted-foreground"
                                >
                                    {tr('Message text')}
                                </label>
                                <textarea
                                    id="wa-template-text"
                                    ref={textarea}
                                    value={text}
                                    onChange={(changeEvent) =>
                                        setText(changeEvent.target.value)
                                    }
                                    rows={10}
                                    maxLength={maxLength}
                                    className="min-h-56 w-full resize-y rounded-lg border border-input bg-background px-3 py-2 font-mono text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                                    aria-invalid={
                                        unknown.length > 0 || !!errorFor(locale)
                                    }
                                    data-testid="wa-template-text"
                                />
                                <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                                    <span>
                                        {tr(
                                            '*bold*  _italic_  ~strikethrough~',
                                        )}
                                    </span>
                                    <span
                                        className={cn(
                                            'tabular-nums',
                                            text.length > maxLength * 0.9 &&
                                                'text-amber-700 dark:text-amber-300',
                                        )}
                                    >
                                        {text.length}/{maxLength}
                                    </span>
                                </div>
                                {unknown.length > 0 && (
                                    <p
                                        role="alert"
                                        className="text-sm text-destructive"
                                        data-testid="wa-template-unknown"
                                    >
                                        {tr('Unknown placeholders: {0}', [
                                            unknown
                                                .map((key) => `:${key}`)
                                                .join(', '),
                                        ])}
                                    </p>
                                )}
                                <InputError message={errorFor(locale)} />

                                <div className="flex flex-col gap-1.5">
                                    <span className="text-xs font-medium text-muted-foreground">
                                        {tr('Placeholders (click to insert)')}
                                    </span>
                                    <div className="flex flex-wrap gap-1.5">
                                        {template.placeholders.map((key) => (
                                            <button
                                                key={key}
                                                type="button"
                                                onClick={() => insert(key)}
                                                title={tr(
                                                    PLACEHOLDER_HINTS[key] ??
                                                        key,
                                                )}
                                                className="inline-flex h-7 items-center rounded-md border border-border bg-muted/40 px-2 font-mono text-xs text-foreground hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none dark:border-white/15"
                                                data-testid={`wa-template-placeholder-${key}`}
                                            >
                                                :{key}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div className="flex min-w-0 flex-col gap-2">
                                <span className="text-xs font-medium text-muted-foreground">
                                    {tr('Preview with example data')}
                                </span>
                                <div className="flex min-h-56 flex-col rounded-xl bg-[#efeae2] p-3 dark:bg-[#0b141a]">
                                    <div
                                        className="max-w-[95%] self-start rounded-2xl rounded-tl-sm border border-emerald-200 bg-[#e7fbe4] p-3.5 text-sm [overflow-wrap:anywhere] whitespace-pre-wrap text-[#111b21] dark:border-emerald-900/60 dark:bg-[#0b3b2e] dark:text-emerald-50"
                                        data-testid="wa-template-preview"
                                    >
                                        {text.trim() === ''
                                            ? tr('The message is empty.')
                                            : formatWhatsApp(
                                                  fillTemplate(
                                                      text,
                                                      sampleValues(),
                                                  ),
                                              )}
                                    </div>
                                </div>
                                {text !==
                                    template.templates[locale].default && (
                                    <button
                                        type="button"
                                        onClick={() =>
                                            setText(
                                                template.templates[locale]
                                                    .default,
                                            )
                                        }
                                        className="inline-flex h-8 w-fit items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                                        data-testid="wa-template-use-default"
                                    >
                                        <RotateCcw className="size-3.5" />
                                        {tr(
                                            'Use the default text in this language',
                                        )}
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between dark:border-white/15">
                            <div>
                                {hasCustom && confirmReset ? (
                                    <div
                                        role="alert"
                                        className="flex flex-wrap items-center gap-2 text-sm text-destructive"
                                        data-testid="wa-template-reset-confirm"
                                    >
                                        <span>
                                            {tr(
                                                'Remove the custom text in both languages?',
                                            )}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={reset}
                                            disabled={resetting}
                                            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-destructive px-3 text-sm font-medium text-white hover:bg-destructive/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50"
                                            data-testid="wa-template-reset-yes"
                                        >
                                            {resetting && (
                                                <Loader2 className="size-4 animate-spin" />
                                            )}
                                            {tr('Reset to default')}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setConfirmReset(false)
                                            }
                                            disabled={resetting}
                                            className="h-8 rounded-lg px-3 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                                        >
                                            {tr('Cancel')}
                                        </button>
                                    </div>
                                ) : hasCustom ? (
                                    <button
                                        type="button"
                                        onClick={() => setConfirmReset(true)}
                                        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-destructive/30 px-3 text-sm font-medium text-destructive hover:bg-destructive/5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                                        data-testid="wa-template-reset"
                                    >
                                        <RotateCcw className="size-4" />
                                        {tr('Reset to default')}
                                    </button>
                                ) : null}
                            </div>
                            <div className="flex items-center justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={onClose}
                                    className="h-9 rounded-lg px-4 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                                >
                                    {tr('Cancel')}
                                </button>
                                <button
                                    type="submit"
                                    disabled={
                                        form.processing ||
                                        !form.isDirty ||
                                        invalid
                                    }
                                    className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50"
                                    data-testid="wa-template-save"
                                >
                                    {form.processing ? (
                                        <Loader2 className="size-4 animate-spin" />
                                    ) : (
                                        <Save className="size-4" />
                                    )}
                                    {tr('Save template')}
                                </button>
                            </div>
                        </div>
                    </form>
                </DialogContent>
            </Dialog>
        </>
    );
}
