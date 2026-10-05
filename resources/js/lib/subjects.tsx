import { type SharedData } from '@/types';
import { usePage } from '@inertiajs/react';
import {
    Atom,
    BookOpenText,
    Brain,
    Calculator,
    Dumbbell,
    FlaskConical,
    Globe2,
    Heart,
    Landmark,
    Languages,
    Laptop,
    Leaf,
    Map,
    Microscope,
    Moon,
    Music,
    Palette,
    PenLine,
    Shapes,
    Sparkles,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

/** A school subject from the admin-managed catalog (shared Inertia prop). */
export interface SubjectInfo {
    key: string;
    name: { id: string; en: string };
    icon: string;
    color: string;
}

/**
 * Renders a subject's icon by name (mirrors App\Models\Subject::ICONS);
 * unknown names show a book.
 */
export function SubjectIcon({
    icon,
    className,
}: {
    icon: string | undefined;
    className?: string;
}) {
    const props = { className, 'aria-hidden': true } as const;
    switch (icon) {
        case 'calculator':
            return <Calculator {...props} />;
        case 'flask':
            return <FlaskConical {...props} />;
        case 'globe':
            return <Globe2 {...props} />;
        case 'languages':
            return <Languages {...props} />;
        case 'landmark':
            return <Landmark {...props} />;
        case 'atom':
            return <Atom {...props} />;
        case 'microscope':
            return <Microscope {...props} />;
        case 'leaf':
            return <Leaf {...props} />;
        case 'map':
            return <Map {...props} />;
        case 'music':
            return <Music {...props} />;
        case 'palette':
            return <Palette {...props} />;
        case 'dumbbell':
            return <Dumbbell {...props} />;
        case 'laptop':
            return <Laptop {...props} />;
        case 'moon':
            return <Moon {...props} />;
        case 'heart':
            return <Heart {...props} />;
        case 'brain':
            return <Brain {...props} />;
        case 'shapes':
            return <Shapes {...props} />;
        case 'pen':
            return <PenLine {...props} />;
        case 'sparkles':
            return <Sparkles {...props} />;
        default:
            return <BookOpenText {...props} />;
    }
}

/** Active subjects in display order, as shared with every page. */
export function useSubjects(): SubjectInfo[] {
    const { props } = usePage<SharedData & { subjects?: SubjectInfo[] }>();
    return props.subjects ?? [];
}

/**
 * Label for a subject key in the current language. Falls back to the
 * bundled translations, then to the raw key (hidden or removed subjects).
 */
export function useSubjectName(): (key: string | undefined | null) => string {
    const subjects = useSubjects();
    const { t, i18n } = useTranslation();
    const english = i18n.language?.startsWith('en');
    return (key) => {
        if (!key) {
            return '';
        }
        const subject = subjects.find((item) => item.key === key);
        if (subject) {
            return english ? subject.name.en : subject.name.id;
        }
        return t(`subjects.${key}`, { defaultValue: key });
    };
}
