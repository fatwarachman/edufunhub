import { User } from '@/types';

export interface Role {
    id: number;
    name: string;
    slug: string;
    description: string | null;
    is_system: boolean;
    users_count: number;
    permissions_count: number;
    permissions?: Permission[];
    created_at: string;
    updated_at: string;
}

export interface Permission {
    id: number;
    name: string;
    slug: string;
    module: string;
    description: string | null;
    roles?: Role[];
    created_at: string;
    updated_at: string;
}

export interface ActivityLog {
    id: number;
    log_name: string | null;
    description: string;
    subject_type: string | null;
    subject_id: number | null;
    causer_type: string | null;
    causer_id: number | null;
    causer?: User | null;
    properties: Record<string, unknown>;
    event: string | null;
    created_at: string;
    updated_at: string;
}

export interface AdminPlayerProfile {
    birth_date: string | null;
    school_name: string | null;
    grade?: number | null;
    age: number | null;
}

export interface AdminUser extends User {
    roles?: Role[];
    player_profile?: AdminPlayerProfile | null;
    status?: 'active' | 'inactive' | 'suspended';
    last_seen_at?: string | null;
    signed_up_with_google?: boolean;
    is_superadmin?: boolean;
    ads_disabled?: boolean;
    badges?: import('@/components/badges').EarnedBadge[];
    disabled_at?: string | null;
    current_game?: string | null;
    whatsapp_number?: string | null;
}

export interface PaginatedData<T> {
    data: T[];
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
    from: number | null;
    to: number | null;
    links: PaginationLink[];
}

export interface PaginationLink {
    url: string | null;
    label: string;
    active: boolean;
}

export interface DashboardStats {
    total_users: number;
    active_users: number;
    total_roles: number;
    total_permissions: number;
    users_trend?: number;
    active_trend?: number;
}

export interface AdminFilters {
    search?: string;
    role?: string;
    sort?: string;
    direction?: 'asc' | 'desc';
    page?: number;
}
