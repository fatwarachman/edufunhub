import InputError from '@/components/input-error';
import PlayerCharacter, {
    type CharacterData,
} from '@/components/player-character';
import { BackButton } from '@/components/site-nav';
import { useTranslations } from '@/hooks/use-translations';
import PlayerLayout from '@/layouts/player-layout';
import { useForm } from '@inertiajs/react';

export default function Character({ character }: { character: CharacterData }) {
    const { t } = useTranslations();
    const form = useForm({
        color: character.color,
        accessory: character.accessory,
        nickname: character.nickname ?? '',
    });
    return (
        <PlayerLayout title={t('player.customize')}>
            <div>
                <BackButton
                    href="/dashboard"
                    label={t('nav.backToDashboard')}
                />
            </div>
            <h1 className="text-3xl font-bold md:text-5xl">
                {t('player.customize')}
            </h1>
            <div className="grid gap-8 md:grid-cols-[300px_minmax(0,1fr)]">
                <section className="auth-card flex flex-col items-center justify-center gap-4">
                    <PlayerCharacter character={form.data} />
                    <p className="max-w-full text-xl font-bold break-words">
                        {form.data.nickname || t('player.character')}
                    </p>
                </section>
                <form
                    className="auth-card flex flex-col gap-6"
                    onSubmit={(event) => {
                        event.preventDefault();
                        form.patch('/character', { preserveScroll: true });
                    }}
                >
                    <div className="flex flex-col gap-2">
                        <label htmlFor="nickname" className="font-semibold">
                            {t('player.nickname')}
                        </label>
                        <input
                            id="nickname"
                            name="nickname"
                            maxLength={40}
                            value={form.data.nickname}
                            onChange={(event) =>
                                form.setData('nickname', event.target.value)
                            }
                            className="w-full px-3"
                        />
                        <InputError message={form.errors.nickname} />
                    </div>
                    <fieldset className="flex flex-col gap-3">
                        <legend className="mb-3 font-semibold">
                            {t('player.color')}
                        </legend>
                        <div className="flex flex-wrap gap-3">
                            {['amber', 'coral', 'teal', 'violet'].map(
                                (color) => (
                                    <label
                                        key={color}
                                        className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border-2 border-[#151b2e] px-3"
                                    >
                                        <input
                                            type="radio"
                                            name="color"
                                            value={color}
                                            checked={form.data.color === color}
                                            onChange={() =>
                                                form.setData('color', color)
                                            }
                                        />
                                        {t(`player.${color}`)}
                                    </label>
                                ),
                            )}
                        </div>
                        <InputError message={form.errors.color} />
                    </fieldset>
                    <fieldset className="flex flex-col gap-3">
                        <legend className="mb-3 font-semibold">
                            {t('player.accessory')}
                        </legend>
                        <div className="flex flex-wrap gap-3">
                            {['none', 'cap', 'glasses'].map((accessory) => (
                                <label
                                    key={accessory}
                                    className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border-2 border-[#151b2e] px-3"
                                >
                                    <input
                                        type="radio"
                                        name="accessory"
                                        value={accessory}
                                        checked={
                                            form.data.accessory === accessory
                                        }
                                        onChange={() =>
                                            form.setData('accessory', accessory)
                                        }
                                    />
                                    {t(`player.${accessory}`)}
                                </label>
                            ))}
                        </div>
                        <InputError message={form.errors.accessory} />
                    </fieldset>
                    {form.recentlySuccessful && (
                        <p
                            role="status"
                            className="font-semibold text-[#116a56]"
                        >
                            {t('player.saved')}
                        </p>
                    )}
                    <button
                        type="submit"
                        disabled={form.processing}
                        className="px-5 py-3 font-bold disabled:opacity-50"
                    >
                        {t(form.processing ? 'player.saving' : 'player.save')}
                    </button>
                </form>
            </div>
        </PlayerLayout>
    );
}
