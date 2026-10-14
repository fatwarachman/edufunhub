import { ClassroomWorld } from '@/components/classroom/classroom-world';
import PlayerLayout from '@/layouts/player-layout';
import { type WorldProps } from '@/lib/classroom-world/protocol';
import { router } from '@inertiajs/react';
import { useCallback } from 'react';

interface Props {
    classroom: {
        id: number;
        name: string;
        pin: string;
        status: string;
    };
    world: WorldProps;
}

/** Teacher walks the 3D classroom (role "teacher": no booths, no leave). */
export default function TeacherClassroomWorld({ classroom, world }: Props) {
    const exit = useCallback(() => {
        router.visit(`/teacher/classrooms/${classroom.id}`);
    }, [classroom.id]);

    return (
        <PlayerLayout title={classroom.name} fill>
            <ClassroomWorld
                classroomId={classroom.id}
                classroomName={classroom.name}
                world={{ ...world, role: 'teacher' }}
                onExit={exit}
            />
        </PlayerLayout>
    );
}
