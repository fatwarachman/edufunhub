import { useTranslations } from '@/hooks/use-translations';
import { cn } from '@/lib/utils';
import { Link } from '@inertiajs/react';
import { BookOpenCheck, Layers, School, type LucideIcon } from 'lucide-react';

export type TeacherTabKey = 'questions' | 'topics' | 'classrooms';

const TABS: { key: TeacherTabKey; href: string; icon: LucideIcon }[] = [
    { key: 'questions', href: '/teacher/questions', icon: BookOpenCheck },
    { key: 'topics', href: '/teacher/topics', icon: Layers },
    { key: 'classrooms', href: '/teacher/classrooms', icon: School },
];

/** Section switcher shared by every teacher page (bank, topics, classrooms). */
export function TeacherTabs({ active }: { active: TeacherTabKey }) {
    const { t } = useTranslations();

    return (
        <nav
            aria-label={t('teacher.tabs.label')}
            className="flex flex-wrap gap-1 rounded-[1.25rem] border-2 border-[#1f2a44] bg-white p-1 shadow-[3px_3px_0_#1f2a44]"
            data-testid="teacher-tabs"
        >
            {TABS.map(({ key, href, icon: Icon }) => {
                const current = key === active;
                return (
                    <Link
                        key={key}
                        href={href}
                        aria-current={current ? 'page' : undefined}
                        data-testid={`teacher-tab-${key}`}
                        className={cn(
                            'flex min-h-11 min-w-0 flex-1 basis-[7rem] items-center justify-center gap-1.5 rounded-full px-3 text-sm leading-tight font-bold transition-colors focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#6c5ce7]',
                            current
                                ? 'bg-[#151b2e] text-white'
                                : 'text-[#151b2e] hover:bg-[#fff0cf]',
                        )}
                    >
                        <Icon className="size-4 shrink-0" aria-hidden="true" />
                        <span className="truncate">
                            {t(`teacher.tabs.${key}`)}
                        </span>
                    </Link>
                );
            })}
        </nav>
    );
}
