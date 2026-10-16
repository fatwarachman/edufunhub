/** Shapes of the classroom (ruang kelas) Inertia props and JSON payloads. */

export type ClassroomStatus = 'scheduled' | 'active' | 'ended';

export type Mastery = 'excellent' | 'good' | 'fair' | 'needs_help' | 'no_data';

export type Difficulty = 'easy' | 'medium' | 'hard';

/** AI analysis as titled bullet lists (section key => points). */
export type AiSections = Record<string, string[]>;

export interface Topic {
    id: number;
    subject_key: string;
    name_id: string;
    name_en: string | null;
}

export interface TopicRef {
    id: number;
    name_id: string;
    name_en: string | null;
}

export interface QuestionPick {
    id: number;
    prompt_id: string;
    prompt_en: string | null;
    type: 'choice' | 'true_false';
    subject: string;
    topic_id: number | null;
    topic: TopicRef | null;
    level: number;
    grades: number[];
    source: string;
    is_mine: boolean;
}

export interface QuestionOptionsPage {
    data: QuestionPick[];
    current_page: number;
    last_page: number;
    total: number;
}

export interface Paginated<T> {
    data: T[];
    current_page: number;
    last_page: number;
    total: number;
    prev_page_url: string | null;
    next_page_url: string | null;
}

export interface ClassroomRow {
    id: number;
    name: string;
    pin: string;
    status: ClassroomStatus;
    starts_at: string;
    ends_at: string;
    games: string[];
    members_count: number;
    online_count: number;
}

export interface ClassroomLimits {
    minDuration: number;
    maxDuration: number;
    maxMembers: number;
    maxGames: number;
    maxQuestionsPerGame: number;
}

export interface ClassroomFormData {
    id: number;
    name: string;
    description: string | null;
    starts_at: string;
    duration_minutes: number;
    max_members: number;
    status: ClassroomStatus;
    games: {
        game_key: string;
        max_plays: number | null;
        /** Subjects of an auto-question game (empty = mixed). */
        subjects?: string[];
        questions: QuestionPick[];
    }[];
}

export interface LiveMember {
    member_id: number;
    user_id: number;
    name: string;
    grade: number | null;
    school: string | null;
    joined_at: string | null;
    last_seen_at: string | null;
    online: boolean;
    current_game: string | null;
    removed: boolean;
    plays: number;
    answered: number;
    correct: number;
    points: number;
    shared_at: string | null;
}

export interface Live {
    members_count: number;
    online_count: number;
    playing_count: number;
    updated_at: string | null;
    members: LiveMember[];
}

export interface ReportStudent {
    member_id: number;
    user_id: number;
    name: string;
    grade: number | null;
    plays: number;
    answered: number;
    correct: number;
    wrong: number;
    accuracy: number | null;
    points: number;
    rank: number | null;
    mastery: Mastery;
    strengths: string[];
    weaknesses: string[];
    ai_feedback: AiSections | null;
    shared_at: string | null;
}

export interface ClassroomReport {
    summary: {
        members: number;
        played_members: number;
        plays: number;
        answered: number;
        correct: number;
        wrong: number;
        accuracy: number | null;
        points: number;
    };
    games: {
        game_key: string;
        plays: number;
        players: number;
        answered: number;
        correct: number;
        accuracy: number | null;
    }[];
    subjects: {
        key: string;
        answered: number;
        correct: number;
        accuracy: number | null;
    }[];
    topics: {
        id: number;
        name_id: string;
        name_en: string | null;
        subject_key: string;
        answered: number;
        correct: number;
        accuracy: number | null;
    }[];
    questions: {
        id: number;
        prompt_id: string;
        prompt_en: string | null;
        subject: string;
        topic_id: number | null;
        level: number;
        answered: number;
        correct: number;
        accuracy: number | null;
        difficulty: Difficulty | null;
        top_wrong: { index: number; text: string; count: number } | null;
        topic?: TopicRef | null;
    }[];
    students: ReportStudent[];
    insights: { key: string; params: Record<string, string | number> }[];
}

export interface ClassroomDetail {
    id: number;
    name: string;
    description: string | null;
    pin: string;
    status: ClassroomStatus;
    starts_at: string;
    ends_at: string;
    max_members: number;
    join_path: string;
    games: {
        game_key: string;
        question_count?: number;
        max_plays?: number | null;
        questions?: Pick<
            QuestionPick,
            'id' | 'prompt_id' | 'prompt_en' | 'type'
        >[];
    }[];
    ai_status: null | 'queued' | 'running' | 'done' | 'failed';
    ai_summary: AiSections | null;
    ai_available: boolean;
    report_generated_at?: string | null;
}

export interface MemberReport {
    classroom: {
        name: string;
        teacher_name: string;
        starts_at: string;
        ends_at: string;
    };
    student: { name: string };
    totals: {
        plays: number;
        answered: number;
        correct: number;
        wrong: number;
        accuracy: number | null;
        points: number;
        rank: number | null;
        members: number;
    };
    class_accuracy: number | null;
    mastery: Mastery;
    games: {
        game_key: string;
        plays: number;
        answered: number;
        correct: number;
        accuracy: number | null;
        points: number;
        /** Classroom play limit of the game (my classroom detail only). */
        max_plays?: number | null;
    }[];
    subjects: {
        key: string;
        answered: number;
        accuracy: number | null;
        class_accuracy: number | null;
    }[];
    topics: {
        name_id: string;
        name_en: string | null;
        answered: number;
        accuracy: number | null;
    }[];
    review: {
        prompt_id: string;
        prompt_en: string | null;
        correct_text: string | null;
        times_wrong: number;
    }[];
    teacher_note: string | null;
    ai_feedback: AiSections | null;
    shared_at: string | null;
}

/** Student's own totals inside one classroom ("Kelasku"). */
export interface MyClassroomTotals {
    plays: number;
    answered: number;
    correct: number;
    wrong: number;
    accuracy: number | null;
    points: number;
    rank: number | null;
    members: number;
}

export interface MyClassroomCard {
    id: number;
    name: string;
    pin: string;
    status: ClassroomStatus;
    starts_at: string | null;
    ends_at: string | null;
    teacher_name: string;
    games: string[];
}

export interface MyClassroomItem {
    member_id: number;
    classroom: MyClassroomCard;
    joined_at: string | null;
    left: boolean;
    report_shared: boolean;
    totals: MyClassroomTotals;
    mastery: Mastery;
}

export interface MyClassroomQuestion {
    id: number;
    type: 'choice' | 'true_false';
    subject: string;
    topic: { name_id: string; name_en: string | null } | null;
    level: number;
    prompt_id: string;
    prompt_en: string | null;
    options: { id: string; en: string | null }[];
    games: string[];
    mine: {
        answered: number;
        correct: number;
        wrong: number;
        last_correct: boolean | null;
        last_choice: number | null;
    };
    /** Only after the classroom ended. */
    answer: number | null;
    hint_id: string | null;
    hint_en: string | null;
}

export interface MyClassroomDetail {
    member_id: number;
    classroom: MyClassroomCard & { description: string | null };
    joined_at: string | null;
    left: boolean;
    answers_revealed: boolean;
    report_shared: boolean;
    report_url: string | null;
    totals: MyClassroomTotals;
    class_accuracy: number | null;
    mastery: Mastery;
    games: MemberReport['games'];
    /** Play limit per classroom game; null = unlimited. */
    play_limits?: Record<string, number | null>;
    subjects: MemberReport['subjects'];
    topics: MemberReport['topics'];
    review: MemberReport['review'];
    recent_plays: {
        id: number;
        game_key: string;
        points: number;
        correct: number;
        wrong: number;
        duration_seconds: number;
        played_at: string | null;
    }[];
    questions: {
        total: number;
        answered: number;
        hidden: number;
        items: MyClassroomQuestion[];
    };
    teacher_note: string | null;
    ai_feedback: AiSections | null;
}

/** Classroom play usage of one game: null max/remaining = unlimited. */
export interface ClassroomPlayUsage {
    plays: number;
    max: number | null;
    remaining: number | null;
}
