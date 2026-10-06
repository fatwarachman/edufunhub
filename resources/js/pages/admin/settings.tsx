import { tr } from '@/lib/admin-i18n';
import { LanguageToggle } from '@/components/language-toggle';
import { useTranslations } from '@/hooks/use-translations';
import AdminLayout from '@/layouts/admin-layout';
import { cn } from '@/lib/utils';
import { type SharedData } from '@/types';
import { Head, router, useForm, usePage } from '@inertiajs/react';
import {
    Building2,
    ChevronRight,
    Eye,
    EyeOff,
    Mail,
    Save,
    Shield,
    User,
} from 'lucide-react';
import { type ReactNode, useState } from 'react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ProfileData {
    id: number;
    name: string;
    email: string;
    avatar_url: string | null;
    bio: string | null;
    timezone: string | null;
}

interface SettingsProps {
    tab: string;
    general: Record<string, string>;
    mail: Record<string, string>;
    security: Record<string, string>;
    profile: ProfileData;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const TABS = [
    { key: 'general',  label: 'General',  icon: Building2 },
    { key: 'mail',     label: 'Mail',      icon: Mail      },
    { key: 'security', label: 'Security',  icon: Shield    },
    { key: 'profile',  label: 'Profile',   icon: User      },
] as const;

type TabKey = typeof TABS[number]['key'];

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
    return (
        <div className="rounded-2xl border border-border bg-card shadow-sm">
            <div className="border-b border-border px-6 py-4">
                <h3 className="font-semibold text-foreground">{tr(title)}</h3>
                {description && <p className="mt-0.5 text-sm text-muted-foreground">{tr(description)}</p>}
            </div>
            <div className="p-6">{children}</div>
        </div>
    );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
    return (
        <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-foreground">{tr(label)}</label>
            {children}
            {hint && <p className="text-xs text-muted-foreground">{tr(hint)}</p>}
        </div>
    );
}

function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
    return (
        <input
            className={cn(
                'w-full rounded-lg border border-input bg-background px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground',
                'focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                className,
            )}
            {...props}
        />
    );
}

function Select({ className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
    return (
        <select
            className={cn(
                'w-full rounded-lg border border-input bg-background px-3.5 py-2.5 text-sm text-foreground',
                'focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors',
                className,
            )}
            {...props}
        >
            {children}
        </select>
    );
}

function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
    return (
        <textarea
            rows={3}
            className={cn(
                'w-full resize-none rounded-lg border border-input bg-background px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground',
                'focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors',
                className,
            )}
            {...props}
        />
    );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
    return (
        <label className="flex cursor-pointer items-center gap-3">
            <button
                type="button"
                role="switch"
                aria-checked={checked}
                onClick={() => onChange(!checked)}
                className={cn(
                    'relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    checked ? 'bg-primary' : 'bg-input',
                )}
            >
                <span
                    className={cn(
                        'pointer-events-none block size-4 rounded-full bg-white shadow-sm transition-transform',
                        checked ? 'translate-x-4' : 'translate-x-0',
                    )}
                />
            </button>
            <span className="text-sm text-foreground">{tr(label)}</span>
        </label>
    );
}

function SaveButton({ processing }: { processing: boolean }) {
    return (
        <button
            type="submit"
            disabled={processing}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 disabled:cursor-not-allowed"
        >
            <Save className="size-4" />
            {processing ? tr("Saving…") : tr("Save Changes")}
        </button>
    );
}

// ─── Tab: General ────────────────────────────────────────────────────────────

function GeneralTab({ data }: { data: Record<string, string> }) {
    const { data: form, setData, put, processing } = useForm({
        app_name:         data.app_name         ?? 'EduFunHub',
        app_description:  data.app_description  ?? '',
        app_url:          data.app_url          ?? '',
        app_logo:         data.app_logo         ?? '',
        app_timezone:     data.app_timezone     ?? 'UTC',
        maintenance_mode: data.maintenance_mode === '1',
    });

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        put('/admin/settings/general');
    };

    return (
        <form onSubmit={submit} className="space-y-6">
            <Section title={tr("Application")} description={tr("Basic application identity and configuration.")}>
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                    <Field label={tr("Application Name")} hint={tr("Shown in browser title and emails.")}>
                        <Input
                            value={form.app_name}
                            onChange={e => setData('app_name', e.target.value)}
                            placeholder={tr("EduFunHub")}
                        />
                    </Field>
                    <Field label={tr("Application URL")} hint={tr("Base URL used for generating links.")}>
                        <Input
                            type="url"
                            value={form.app_url}
                            onChange={e => setData('app_url', e.target.value)}
                            placeholder="https://edufunhub.com"
                        />
                    </Field>
                    <Field label={tr("Logo URL")} hint={tr("Full URL or path to app logo image.")}>
                        <Input
                            value={form.app_logo}
                            onChange={e => setData('app_logo', e.target.value)}
                            placeholder="/images/logo.png"
                        />
                    </Field>
                    <Field label={tr("Timezone")} hint={tr("Server-side timezone for dates and times.")}>
                        <Select
                            value={form.app_timezone}
                            onChange={e => setData('app_timezone', e.target.value)}
                        >
                            {['UTC', 'Asia/Jakarta', 'Asia/Singapore', 'Asia/Tokyo', 'America/New_York', 'Europe/London'].map(tz => (
                                <option key={tz} value={tz}>{tz}</option>
                            ))}
                        </Select>
                    </Field>
                    <div className="sm:col-span-2">
                        <Field label={tr("Description")} hint={tr("Brief tagline shown on landing or emails.")}>
                            <Textarea
                                value={form.app_description}
                                onChange={e => setData('app_description', e.target.value)}
                                placeholder={tr("Fun and educational games for students…")}
                            />
                        </Field>
                    </div>
                </div>
            </Section>

            <Section title={tr("Maintenance")} description={tr("Temporarily disable public access while updating.")}>
                <Toggle
                    checked={form.maintenance_mode}
                    onChange={v => setData('maintenance_mode', v)}
                    label={tr("Enable maintenance mode (hides the app from public users)")}
                />
            </Section>

            <div className="flex justify-end">
                <SaveButton processing={processing} />
            </div>
        </form>
    );
}

// ─── Tab: Mail ───────────────────────────────────────────────────────────────

function MailTab({ data }: { data: Record<string, string> }) {
    const { data: form, setData, put, processing } = useForm({
        mail_mailer:       data.mail_mailer       ?? 'log',
        mail_host:         data.mail_host         ?? '',
        mail_port:         data.mail_port         ?? '587',
        mail_encryption:   data.mail_encryption   ?? 'tls',
        mail_username:     data.mail_username     ?? '',
        mail_password:     data.mail_password     ?? '',
        mail_from_address: data.mail_from_address ?? '',
        mail_from_name:    data.mail_from_name    ?? '',
    });

    const [showPass, setShowPass] = useState(false);

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        put('/admin/settings/mail');
    };

    const isSmtp = form.mail_mailer === 'smtp';

    return (
        <form onSubmit={submit} className="space-y-6">
            <Section title={tr("Mail Driver")} description={tr("How outgoing emails are delivered.")}>
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                    <Field label={tr("Mailer")}>
                        <Select value={form.mail_mailer} onChange={e => setData('mail_mailer', e.target.value)}>
                            <option value="log">{tr("Log (development)")}</option>
                            <option value="smtp">{tr("SMTP")}</option>
                            <option value="sendmail">{tr("Sendmail")}</option>
                            <option value="mailgun">{tr("Mailgun")}</option>
                            <option value="ses">{tr("Amazon SES")}</option>
                        </Select>
                    </Field>
                </div>
            </Section>

            {isSmtp && (
                <Section title={tr("SMTP Configuration")} description={tr("Connection details for your SMTP server.")}>
                    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                        <Field label={tr("Host")}>
                            <Input
                                value={form.mail_host}
                                onChange={e => setData('mail_host', e.target.value)}
                                placeholder="smtp.mailtrap.io"
                            />
                        </Field>
                        <Field label={tr("Port")}>
                            <Input
                                type="number"
                                value={form.mail_port}
                                onChange={e => setData('mail_port', e.target.value)}
                                placeholder="587"
                            />
                        </Field>
                        <Field label={tr("Encryption")}>
                            <Select value={form.mail_encryption} onChange={e => setData('mail_encryption', e.target.value)}>
                                <option value="">{tr("None")}</option>
                                <option value="tls">{tr("TLS")}</option>
                                <option value="ssl">{tr("SSL")}</option>
                            </Select>
                        </Field>
                        <Field label={tr("Username")}>
                            <Input
                                value={form.mail_username}
                                onChange={e => setData('mail_username', e.target.value)}
                                placeholder={tr("your@email.com")}
                            />
                        </Field>
                        <div className="sm:col-span-2">
                            <Field label={tr("Password")}>
                                <div className="relative">
                                    <Input
                                        type={showPass ? 'text' : 'password'}
                                        value={form.mail_password}
                                        onChange={e => setData('mail_password', e.target.value)}
                                        placeholder="••••••••"
                                        className="pr-10"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPass(v => !v)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                    >
                                        {showPass ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                                    </button>
                                </div>
                            </Field>
                        </div>
                    </div>
                </Section>
            )}

            <Section title={tr("Sender")} description={tr("Default from address for all outgoing emails.")}>
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                    <Field label={tr("From Address")}>
                        <Input
                            type="email"
                            value={form.mail_from_address}
                            onChange={e => setData('mail_from_address', e.target.value)}
                            placeholder={tr("no-reply@edufunhub.com")}
                        />
                    </Field>
                    <Field label={tr("From Name")}>
                        <Input
                            value={form.mail_from_name}
                            onChange={e => setData('mail_from_name', e.target.value)}
                            placeholder={tr("EduFunHub")}
                        />
                    </Field>
                </div>
            </Section>

            <div className="flex justify-end">
                <SaveButton processing={processing} />
            </div>
        </form>
    );
}

// ─── Tab: Security ───────────────────────────────────────────────────────────

function SecurityTab({ data }: { data: Record<string, string> }) {
    const { data: form, setData, put, processing } = useForm({
        password_min_length:          data.password_min_length          ?? '8',
        password_require_uppercase:   data.password_require_uppercase   === '1',
        password_require_numbers:     data.password_require_numbers     === '1',
        password_require_symbols:     data.password_require_symbols     === '1',
        session_lifetime:             data.session_lifetime             ?? '120',
        max_login_attempts:           data.max_login_attempts           ?? '5',
        two_factor_enabled:           data.two_factor_enabled           === '1',
    });

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        put('/admin/settings/security');
    };

    return (
        <form onSubmit={submit} className="space-y-6">
            <Section title={tr("Password Policy")} description={tr("Rules enforced when users set or change their password.")}>
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                    <Field label={tr("Minimum Length")} hint={tr("Minimum number of characters.")}>
                        <Input
                            type="number"
                            min={6}
                            max={128}
                            value={form.password_min_length}
                            onChange={e => setData('password_min_length', e.target.value)}
                        />
                    </Field>
                    <div className="flex flex-col gap-3 sm:pt-6">
                        <Toggle
                            checked={form.password_require_uppercase}
                            onChange={v => setData('password_require_uppercase', v)}
                            label={tr("Require uppercase letters")}
                        />
                        <Toggle
                            checked={form.password_require_numbers}
                            onChange={v => setData('password_require_numbers', v)}
                            label={tr("Require numbers")}
                        />
                        <Toggle
                            checked={form.password_require_symbols}
                            onChange={v => setData('password_require_symbols', v)}
                            label={tr("Require special characters")}
                        />
                    </div>
                </div>
            </Section>

            <Section title={tr("Session & Auth")} description={tr("Login limits and session behaviour.")}>
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                    <Field label={tr("Session Lifetime (minutes)")} hint={tr("After this time of inactivity the user is logged out.")}>
                        <Input
                            type="number"
                            min={1}
                            max={1440}
                            value={form.session_lifetime}
                            onChange={e => setData('session_lifetime', e.target.value)}
                        />
                    </Field>
                    <Field label={tr("Max Login Attempts")} hint={tr("Lockout after this many failed attempts.")}>
                        <Input
                            type="number"
                            min={1}
                            max={100}
                            value={form.max_login_attempts}
                            onChange={e => setData('max_login_attempts', e.target.value)}
                        />
                    </Field>
                </div>
            </Section>

            <Section title={tr("Two-Factor Authentication")} description={tr("Require users to verify with a second factor.")}>
                <Toggle
                    checked={form.two_factor_enabled}
                    onChange={v => setData('two_factor_enabled', v)}
                    label={tr("Enforce 2FA for all admin accounts")}
                />
            </Section>

            <div className="flex justify-end">
                <SaveButton processing={processing} />
            </div>
        </form>
    );
}

// ─── Tab: Profile ────────────────────────────────────────────────────────────

function ProfileTab({ profile }: { profile: ProfileData }) {
    const profileForm = useForm({
        name:     profile.name     ?? '',
        email:    profile.email    ?? '',
        bio:      profile.bio      ?? '',
        timezone: profile.timezone ?? 'UTC',
    });

    const passwordForm = useForm({
        current_password:      '',
        password:              '',
        password_confirmation: '',
    });

    const [showCurrentPass, setShowCurrentPass] = useState(false);
    const [showNewPass, setShowNewPass] = useState(false);

    const submitProfile = (e: React.FormEvent) => {
        e.preventDefault();
        profileForm.put('/admin/settings/profile');
    };

    const submitPassword = (e: React.FormEvent) => {
        e.preventDefault();
        passwordForm.put('/admin/settings/password', {
            onSuccess: () => passwordForm.reset(),
        });
    };

    const initials = profile.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
    const { t } = useTranslations();

    return (
        <div className="space-y-6">
            <Section title={tr("My Profile")} description={tr("Update your personal information.")}>
                <form onSubmit={submitProfile} className="space-y-5">
                    {/* Avatar */}
                    <div className="flex items-center gap-4">
                        <div className="flex size-16 items-center justify-center rounded-full bg-primary/10 text-lg font-bold text-primary ring-2 ring-primary/20">
                            {profile.avatar_url
                                ? <img src={profile.avatar_url} alt={profile.name} className="size-16 rounded-full object-cover" />
                                : initials
                            }
                        </div>
                        <div>
                            <p className="text-sm font-medium text-foreground">{profile.name}</p>
                            <p className="text-xs text-muted-foreground">{profile.email}</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                        <Field label={tr("Full Name")}>
                            <Input
                                value={profileForm.data.name}
                                onChange={e => profileForm.setData('name', e.target.value)}
                            />
                            {profileForm.errors.name && <p className="text-xs text-destructive">{profileForm.errors.name}</p>}
                        </Field>
                        <Field label={tr("Email Address")}>
                            <Input
                                type="email"
                                value={profileForm.data.email}
                                onChange={e => profileForm.setData('email', e.target.value)}
                            />
                            {profileForm.errors.email && <p className="text-xs text-destructive">{profileForm.errors.email}</p>}
                        </Field>
                        <Field label={tr("Timezone")}>
                            <Select
                                value={profileForm.data.timezone}
                                onChange={e => profileForm.setData('timezone', e.target.value)}
                            >
                                {['UTC', 'Asia/Jakarta', 'Asia/Singapore', 'Asia/Tokyo', 'America/New_York', 'Europe/London'].map(tz => (
                                    <option key={tz} value={tz}>{tz}</option>
                                ))}
                            </Select>
                        </Field>
                        <div className="sm:col-span-2">
                            <Field label={tr("Bio")} hint={tr("Short description about yourself.")}>
                                <Textarea
                                    value={profileForm.data.bio}
                                    onChange={e => profileForm.setData('bio', e.target.value)}
                                    placeholder={tr("Admin of EduFunHub…")}
                                />
                            </Field>
                        </div>
                    </div>

                    <div className="flex justify-end">
                        <SaveButton processing={profileForm.processing} />
                    </div>
                </form>
            </Section>

            <Section title={t('language.label')} description={t('language.description')}>
                <LanguageToggle variant="admin" />
            </Section>

            <Section title={tr("Change Password")} description={tr("Use a strong password you don't use elsewhere.")}>
                <form onSubmit={submitPassword} className="space-y-5">
                    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                        <div className="sm:col-span-2">
                            <Field label={tr("Current Password")}>
                                <div className="relative">
                                    <Input
                                        type={showCurrentPass ? 'text' : 'password'}
                                        value={passwordForm.data.current_password}
                                        onChange={e => passwordForm.setData('current_password', e.target.value)}
                                        placeholder="••••••••"
                                        className="pr-10"
                                        autoComplete="current-password"
                                    />
                                    <button type="button" onClick={() => setShowCurrentPass(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                                        {showCurrentPass ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                                    </button>
                                </div>
                                {passwordForm.errors.current_password && <p className="text-xs text-destructive mt-1">{passwordForm.errors.current_password}</p>}
                            </Field>
                        </div>
                        <Field label={tr("New Password")}>
                            <div className="relative">
                                <Input
                                    type={showNewPass ? 'text' : 'password'}
                                    value={passwordForm.data.password}
                                    onChange={e => passwordForm.setData('password', e.target.value)}
                                    placeholder="••••••••"
                                    className="pr-10"
                                    autoComplete="new-password"
                                />
                                <button type="button" onClick={() => setShowNewPass(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                                    {showNewPass ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                                </button>
                            </div>
                            {passwordForm.errors.password && <p className="text-xs text-destructive mt-1">{passwordForm.errors.password}</p>}
                        </Field>
                        <Field label={tr("Confirm New Password")}>
                            <Input
                                type="password"
                                value={passwordForm.data.password_confirmation}
                                onChange={e => passwordForm.setData('password_confirmation', e.target.value)}
                                placeholder="••••••••"
                                autoComplete="new-password"
                            />
                            {passwordForm.errors.password_confirmation && <p className="text-xs text-destructive mt-1">{passwordForm.errors.password_confirmation}</p>}
                        </Field>
                    </div>

                    <div className="flex justify-end">
                        <SaveButton processing={passwordForm.processing} />
                    </div>
                </form>
            </Section>
        </div>
    );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function Settings({ tab, general, mail, security, profile }: SettingsProps) {
    const { props } = usePage<SharedData>();
    const flash = (props as unknown as { flash?: { success?: string } }).flash;

    const activeTab = (TABS.find(t => t.key === tab)?.key ?? 'general') as TabKey;

    const switchTab = (key: TabKey) => {
        router.get('/admin/settings', { tab: key }, { preserveState: true, replace: true });
    };

    return (
        <AdminLayout title={tr("Settings")}>
            <Head title={tr("Settings")} />

            <div className="mb-6">
                <h1 className="text-2xl font-bold text-foreground">{tr("Settings")}</h1>
                <p className="mt-1 text-sm text-muted-foreground">{tr("Manage application configuration and your account.")}</p>
            </div>

            {flash?.success && (
                <div className="mb-6 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-400">
                    ✓ {flash.success}
                </div>
            )}

            <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
                {/* Sidebar tabs */}
                <nav className="shrink-0 lg:w-52">
                    <ul className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-x-visible">
                        {TABS.map(({ key, label, icon: Icon }) => (
                            <li key={key} className="shrink-0">
                                <button
                                    onClick={() => switchTab(key)}
                                    className={cn(
                                        'flex w-full items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all',
                                        activeTab === key
                                            ? 'bg-primary text-primary-foreground shadow-sm'
                                            : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                                    )}
                                >
                                    <Icon className="size-4 shrink-0" />
                                    {tr(label)}
                                    {activeTab === key && <ChevronRight className="ml-auto size-3.5 opacity-60 lg:block hidden" />}
                                </button>
                            </li>
                        ))}
                    </ul>
                </nav>

                {/* Tab content */}
                <div className="min-w-0 flex-1">
                    {activeTab === 'general'  && <GeneralTab  data={general}  />}
                    {activeTab === 'mail'     && <MailTab     data={mail}     />}
                    {activeTab === 'security' && <SecurityTab data={security} />}
                    {activeTab === 'profile'  && <ProfileTab  profile={profile} />}
                </div>
            </div>
        </AdminLayout>
    );
}
