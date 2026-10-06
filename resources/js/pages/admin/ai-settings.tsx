import { ConfirmDialog, FlashMessages } from '@/components/admin/admin-kit';
import {
    Panel,
    fieldClass,
    formatDateTime,
} from '@/components/admin/game-stats';
import InputError from '@/components/input-error';
import AdminLayout from '@/layouts/admin-layout';
import { tr } from '@/lib/admin-i18n';
import { cn } from '@/lib/utils';
import { Head, Link, router, useForm } from '@inertiajs/react';
import {
    Bot,
    CircleCheck,
    CircleDashed,
    KeyRound,
    Loader2,
    PlugZap,
    RefreshCw,
    Search,
    Sparkles,
    Trash2,
} from 'lucide-react';
import { type FormEvent, useMemo, useState } from 'react';

interface AiModel {
    id: string;
    owned_by: string | null;
}

interface Props {
    connection: {
        base_url: string;
        has_key: boolean;
        key_hint: string | null;
        model: string | null;
        configured: boolean;
    };
    models: AiModel[];
    modelsFetchedAt: string | null;
    errors?: Record<string, string>;
}

export default function AiSettings({
    connection,
    models,
    modelsFetchedAt,
    errors: pageErrors,
}: Props) {
    const form = useForm({ base_url: connection.base_url, api_key: '' });
    const [query, setQuery] = useState('');
    const [refreshing, setRefreshing] = useState(false);
    const [choosing, setChoosing] = useState<string | null>(null);
    const [confirmForget, setConfirmForget] = useState(false);
    const [forgetting, setForgetting] = useState(false);

    const visible = useMemo(() => {
        const needle = query.trim().toLowerCase();
        return needle
            ? models.filter(
                  (m) =>
                      m.id.toLowerCase().includes(needle) ||
                      (m.owned_by ?? '').toLowerCase().includes(needle),
              )
            : models;
    }, [models, query]);

    const save = (event: FormEvent) => {
        event.preventDefault();
        form.put('/admin/ai-settings', {
            preserveScroll: true,
            onSuccess: () => form.setData('api_key', ''),
        });
    };

    const refresh = () => {
        router.post(
            '/admin/ai-settings/models',
            {},
            {
                preserveScroll: true,
                onStart: () => setRefreshing(true),
                onFinish: () => setRefreshing(false),
            },
        );
    };

    const choose = (model: string) => {
        router.put(
            '/admin/ai-settings/model',
            { model },
            {
                preserveScroll: true,
                onStart: () => setChoosing(model),
                onFinish: () => setChoosing(null),
            },
        );
    };

    return (
        <AdminLayout>
            <Head title={tr('AI Settings')} />
            <div className="flex w-full flex-col gap-6">
                <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                        <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
                            <Bot className="size-6 text-violet-500" />
                            {tr('AI Settings')}
                        </h1>
                        <p className="text-sm text-muted-foreground">
                            {tr(
                                'Any OpenAI-compatible server (OpenAI, OpenRouter, 9Router, LiteLLM, Ollama, vLLM…). Used to generate questions.',
                            )}
                        </p>
                    </div>
                    <span
                        className={cn(
                            'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium',
                            connection.configured
                                ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300'
                                : 'border-border bg-muted text-muted-foreground',
                        )}
                        data-testid="ai-status"
                    >
                        {connection.configured ? (
                            <CircleCheck className="size-3.5" />
                        ) : (
                            <CircleDashed className="size-3.5" />
                        )}
                        {connection.configured
                            ? tr('Ready · {0}', [connection.model])
                            : tr('Not configured')}
                    </span>
                </div>

                <FlashMessages errors={pageErrors} />

                <Panel
                    title={tr('Connection')}
                    icon={PlugZap}
                    description={tr(
                        'The API key is stored encrypted and never shown again.',
                    )}
                >
                    <form
                        onSubmit={save}
                        className="flex flex-col gap-5"
                        data-testid="ai-connection-form"
                    >
                        <div className="grid gap-5 md:grid-cols-2">
                            <label className="flex flex-col gap-1.5">
                                <span className="text-sm font-medium text-foreground">
                                    {tr('Base URL')}
                                </span>
                                <input
                                    type="url"
                                    name="base_url"
                                    value={form.data.base_url}
                                    onChange={(event) =>
                                        form.setData(
                                            'base_url',
                                            event.target.value,
                                        )
                                    }
                                    placeholder="https://api.openai.com/v1"
                                    className={`${fieldClass} font-mono`}
                                    autoComplete="off"
                                    required
                                />
                                <span className="text-xs text-muted-foreground">
                                    {tr(
                                        'Ends before /models and /chat/completions, usually with /v1.',
                                    )}
                                </span>
                                <InputError message={form.errors.base_url} />
                            </label>
                            <label className="flex flex-col gap-1.5">
                                <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                                    <KeyRound className="size-4 text-muted-foreground" />
                                    {tr('API key')}
                                </span>
                                <input
                                    type="password"
                                    name="api_key"
                                    value={form.data.api_key}
                                    onChange={(event) =>
                                        form.setData(
                                            'api_key',
                                            event.target.value,
                                        )
                                    }
                                    placeholder={
                                        connection.has_key
                                            ? tr(
                                                  'Saved ({0}). Leave empty to keep it.',
                                                  [connection.key_hint],
                                              )
                                            : tr('sk-…')
                                    }
                                    className={`${fieldClass} font-mono`}
                                    autoComplete="new-password"
                                />
                                <span className="text-xs text-muted-foreground">
                                    {connection.has_key
                                        ? tr(
                                              'Type a new key only to replace the saved one.',
                                          )
                                        : tr(
                                              'Required to list models and generate questions.',
                                          )}
                                </span>
                                <InputError message={form.errors.api_key} />
                            </label>
                        </div>
                        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-4">
                            {connection.has_key && (
                                <button
                                    type="button"
                                    onClick={() => setConfirmForget(true)}
                                    className="mr-auto inline-flex h-9 items-center gap-1.5 rounded-lg border border-destructive/30 px-3 text-sm font-medium text-destructive hover:bg-destructive/5"
                                >
                                    <Trash2 className="size-4" />
                                    {tr('Remove key')}
                                </button>
                            )}
                            <button
                                type="submit"
                                disabled={form.processing}
                                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                                data-testid="ai-save"
                            >
                                {form.processing && (
                                    <Loader2 className="size-4 animate-spin" />
                                )}
                                {tr('Save and load models')}
                            </button>
                        </div>
                    </form>
                </Panel>

                <Panel
                    title={tr('Models ({0})', [models.length])}
                    icon={Sparkles}
                    description={
                        modelsFetchedAt
                            ? tr('Loaded from the server {0}', [
                                  formatDateTime(modelsFetchedAt),
                              ])
                            : tr('Save the connection to load the model list.')
                    }
                    actions={
                        <button
                            type="button"
                            onClick={refresh}
                            disabled={!connection.has_key || refreshing}
                            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium text-foreground hover:bg-accent disabled:opacity-50"
                            data-testid="ai-refresh"
                        >
                            <RefreshCw
                                className={cn(
                                    'size-4',
                                    refreshing && 'animate-spin',
                                )}
                            />
                            {tr('Refresh list')}
                        </button>
                    }
                >
                    {models.length === 0 ? (
                        <p className="py-6 text-center text-sm text-muted-foreground">
                            {tr('No models loaded yet.')}
                        </p>
                    ) : (
                        <div className="flex flex-col gap-3">
                            <label className="relative">
                                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                                <input
                                    type="search"
                                    value={query}
                                    onChange={(event) =>
                                        setQuery(event.target.value)
                                    }
                                    placeholder={tr('Search models')}
                                    aria-label={tr('Search models')}
                                    className={`${fieldClass} w-full pl-9`}
                                />
                            </label>
                            <ul
                                className="grid max-h-[28rem] gap-2 overflow-y-auto pr-1 sm:grid-cols-2"
                                data-testid="ai-models"
                            >
                                {visible.map((model) => {
                                    const selected =
                                        model.id === connection.model;
                                    return (
                                        <li key={model.id}>
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    !selected &&
                                                    choose(model.id)
                                                }
                                                aria-pressed={selected}
                                                disabled={choosing !== null}
                                                className={cn(
                                                    'flex w-full items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-left transition-colors',
                                                    selected
                                                        ? 'border-violet-400 bg-violet-50 dark:border-violet-700 dark:bg-violet-950/40'
                                                        : 'border-border hover:bg-accent',
                                                )}
                                                data-testid={`ai-model-${model.id}`}
                                            >
                                                <span className="min-w-0">
                                                    <span className="block truncate font-mono text-sm text-foreground">
                                                        {model.id}
                                                    </span>
                                                    {model.owned_by && (
                                                        <span className="block truncate text-xs text-muted-foreground">
                                                            {model.owned_by}
                                                        </span>
                                                    )}
                                                </span>
                                                {choosing === model.id ? (
                                                    <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
                                                ) : selected ? (
                                                    <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-violet-700 dark:text-violet-300">
                                                        <CircleCheck className="size-4" />
                                                        {tr('In use')}
                                                    </span>
                                                ) : (
                                                    <span className="shrink-0 text-xs text-muted-foreground">
                                                        {tr('Use')}
                                                    </span>
                                                )}
                                            </button>
                                        </li>
                                    );
                                })}
                                {visible.length === 0 && (
                                    <li className="py-4 text-center text-sm text-muted-foreground sm:col-span-2">
                                        {tr('No model matches “')}
                                        {query}”.
                                    </li>
                                )}
                            </ul>
                        </div>
                    )}
                </Panel>

                {connection.configured && (
                    <Link
                        href="/admin/questions/generate"
                        className="inline-flex h-10 items-center gap-2 self-start rounded-lg bg-violet-600 px-4 text-sm font-medium text-white hover:bg-violet-700"
                    >
                        <Sparkles className="size-4" />
                        {tr('Generate questions')}
                    </Link>
                )}
            </div>

            <ConfirmDialog
                open={confirmForget}
                title={tr('Remove the API key?')}
                message={tr(
                    'Question generation stops until a new key is saved.',
                )}
                confirmLabel={tr('Remove key')}
                processing={forgetting}
                onClose={() => setConfirmForget(false)}
                onConfirm={() =>
                    router.delete('/admin/ai-settings/key', {
                        preserveScroll: true,
                        onStart: () => setForgetting(true),
                        onFinish: () => {
                            setForgetting(false);
                            setConfirmForget(false);
                        },
                    })
                }
            />
        </AdminLayout>
    );
}
