import { gameLabel } from '@/components/admin/game-stats';
import { tr } from '@/lib/admin-i18n';
import { cn } from '@/lib/utils';
import {
    Award,
    Gamepad2,
    LogIn,
    LogOut,
    type LucideIcon,
    Pencil,
    Plus,
    Shield,
    Trash2,
    Trophy,
    Zap,
} from 'lucide-react';

/** Activity entry properties the admin panel shows (see UserActivity). */
export interface ActivityProperties {
    game_key?: string;
    mission?: string | null;
    points?: number;
    correct?: number | null;
    wrong?: number | null;
    badge?: string;
    device?: string;
    ip_address?: string | null;
}

/** Account that performed an entry (null id: the account was deleted). */
export interface ActivityCauser {
    id: number | null;
    name: string | null;
    email: string | null;
    deleted_id?: number;
}

/** Record an entry is about, named even after it was deleted. */
export interface ActivitySubject {
    type: string;
    id: number | string | null;
    name: string | null;
    detail: string | null;
    exists: boolean;
    url: string | null;
}

/** Fields shown in the summary line before "+N more". */
const SUMMARY_FIELD_LIMIT = 4;

/** Admin label of a stored model field; unknown fields keep their key. */
export function fieldLabel(field: string): string {
    const labels: Record<string, string> = {
        name: tr('Name'),
        email: tr('Email'),
        password: tr('Password'),
        locale: tr('Language'),
        timezone: tr('Timezone'),
        date_format: tr('Date format'),
        bio: tr('Bio'),
        avatar_url: tr('Avatar'),
        is_superadmin: tr('Superadmin'),
        onboarded_at: tr('Onboarded'),
        email_verified_at: tr('Email verified'),
        disabled_at: tr('Disabled'),
        current_workspace_id: tr('Workspace'),
        notification_preferences: tr('Notification preferences'),
        key: tr('Key'),
        type: tr('Type'),
        band: tr('Level'),
        level: tr('Level'),
        grades: tr('Grades'),
        subject: tr('Subject'),
        prompt_id: tr('Question (Indonesian)'),
        prompt_en: tr('Question (English)'),
        options: tr('Options'),
        answer: tr('Answer'),
        hint_id: tr('Hint (Indonesian)'),
        hint_en: tr('Hint (English)'),
        games: tr('Games'),
        points: tr('Points'),
        is_active: tr('Active'),
        source: tr('Source'),
        created_by: tr('Created by'),
        updated_by: tr('Updated by'),
        title: tr('Title'),
        description: tr('Description'),
        sort_order: tr('Sort order'),
        price: tr('Price'),
        color: tr('Color'),
        icon: tr('Icon'),
        ids: tr('IDs'),
        action: tr('Action'),
        group: tr('Group'),
        count: tr('Count'),
    };

    return labels[field] ?? field;
}

/** Lower-case noun of a subject type for the summary line. */
function subjectNoun(type: string): string {
    const nouns: Record<string, string> = {
        User: tr('user'),
        Question: tr('question'),
        Workspace: tr('workspace'),
    };

    return nouns[type] ?? type;
}

/** `“Rani” (rani@x)` for accounts, `#12 “What is…”` for other records. */
function subjectText(subject: ActivitySubject): string {
    const name = subject.name ? `“${subject.name}”` : null;
    if (subject.type === 'User') {
        return [
            name ?? `#${subject.id}`,
            subject.detail && `(${subject.detail})`,
        ]
            .filter(Boolean)
            .join(' ');
    }

    return [`#${subject.id}`, name].filter(Boolean).join(' ');
}

/**
 * Summary line that says WHAT happened: the action, the record by name and
 * the fields a change touched, e.g. `Mengubah pengguna “Budi”: Bahasa`.
 */
export function activityHeadline(entry: {
    event: string | null;
    description: string;
    properties?: ActivityProperties | null;
    subject?: ActivitySubject | null;
    changed_fields?: string[];
}): string {
    const subject = entry.subject;
    if (!subject) {
        return activitySummary(
            entry.event,
            entry.description,
            entry.properties,
        );
    }

    const modelEvents: Record<string, string> = {
        created: tr('Created {0}', [subjectNoun(subject.type)]),
        updated: tr('Updated {0}', [subjectNoun(subject.type)]),
        deleted: tr('Deleted {0}', [subjectNoun(subject.type)]),
    };
    const action =
        modelEvents[entry.description] ??
        (entry.description === 'Deleted user' ? modelEvents.deleted : null) ??
        activitySummary(entry.event, entry.description, entry.properties);
    const fields = entry.changed_fields ?? [];
    const shown = fields.slice(0, SUMMARY_FIELD_LIMIT).map(fieldLabel);
    if (fields.length > SUMMARY_FIELD_LIMIT) {
        shown.push(tr('+{0} more', [fields.length - SUMMARY_FIELD_LIMIT]));
    }

    return `${action} ${subjectText(subject)}${shown.length ? `: ${shown.join(', ')}` : ''}`;
}

const EVENT_STYLE: Record<string, { icon: LucideIcon; tone: string }> = {
    login: {
        icon: LogIn,
        tone: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
    },
    logout: {
        icon: LogOut,
        tone: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
    },
    game_opened: {
        icon: Gamepad2,
        tone: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
    },
    game_finished: {
        icon: Trophy,
        tone: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
    },
    badge_earned: {
        icon: Award,
        tone: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300',
    },
    created: {
        icon: Plus,
        tone: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    },
    updated: {
        icon: Pencil,
        tone: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    },
    deleted: {
        icon: Trash2,
        tone: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    },
    impersonated: {
        icon: Shield,
        tone: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
    },
};

/** Translated label of an activity event key. */
export function eventLabel(event: string): string {
    const labels: Record<string, string> = {
        login: tr('Signed in'),
        logout: tr('Signed out'),
        game_opened: tr('Opened game'),
        game_finished: tr('Finished game'),
        badge_earned: tr('Earned badge'),
        created: tr('Created'),
        updated: tr('Updated'),
        deleted: tr('Deleted'),
        impersonated: tr('Impersonated'),
    };

    return labels[event] ?? event;
}

export function ActivityEventBadge({ event }: { event: string | null }) {
    if (!event) {
        return null;
    }
    const style = EVENT_STYLE[event] ?? {
        icon: Zap,
        tone: 'bg-secondary text-secondary-foreground',
    };
    const Icon = style.icon;

    return (
        <span
            className={cn(
                'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap',
                style.tone,
            )}
            data-testid="activity-event"
            data-event={event}
        >
            <Icon className="size-3" />
            {eventLabel(event)}
        </span>
    );
}

/**
 * One-line, translated summary of an activity entry: the game played and
 * its result, the badge earned, or the device used to sign in. Falls back
 * to the stored description for admin and system entries.
 */
export function activitySummary(
    event: string | null,
    description: string,
    properties: ActivityProperties | null | undefined,
): string {
    const props = properties ?? {};
    switch (event) {
        case 'game_finished':
            return tr('{0} · {1} points · {2} correct, {3} wrong', [
                gameLabel(props.game_key ?? ''),
                props.points ?? 0,
                props.correct ?? 0,
                props.wrong ?? 0,
            ]);
        case 'game_opened':
            return tr('Opened {0}', [gameLabel(props.game_key ?? '')]);
        case 'badge_earned':
            return tr('Earned the “{0}” badge', [props.badge ?? '']);
        case 'login':
        case 'logout':
            return [eventLabel(event), props.device, props.ip_address]
                .filter(Boolean)
                .join(' · ');
        default:
            return tr(description);
    }
}
