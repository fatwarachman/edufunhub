import { cn } from '@/lib/utils';
import { type MutableRefObject, useRef, useState } from 'react';

/** Analog stick direction: x and y in -1..1 (0,0 = released). */
export interface StickVector {
    x: number;
    y: number;
}

const DEAD_ZONE = 0.12;

/**
 * Virtual joystick for touch screens (also works with a mouse). The current
 * direction is written to `vector` so a canvas game loop can read it every
 * frame without re-rendering React.
 */
export function Joystick({
    vector,
    disabled,
    label,
    size = 132,
    className,
}: {
    vector: MutableRefObject<StickVector>;
    disabled?: boolean;
    label: string;
    size?: number;
    className?: string;
}) {
    const base = useRef<HTMLDivElement>(null);
    const pointer = useRef<number | null>(null);
    const [knob, setKnob] = useState<StickVector>({ x: 0, y: 0 });
    const radius = size / 2;
    const travel = radius * 0.6;

    const release = () => {
        pointer.current = null;
        vector.current = { x: 0, y: 0 };
        setKnob({ x: 0, y: 0 });
    };

    const steer = (clientX: number, clientY: number) => {
        const rect = base.current?.getBoundingClientRect();
        if (!rect) {
            return;
        }
        let x = (clientX - (rect.left + rect.width / 2)) / travel;
        let y = (clientY - (rect.top + rect.height / 2)) / travel;
        const length = Math.hypot(x, y);
        if (length > 1) {
            x /= length;
            y /= length;
        }
        const live = Math.hypot(x, y) >= DEAD_ZONE;
        vector.current = live ? { x, y } : { x: 0, y: 0 };
        setKnob({ x, y });
    };

    return (
        <div
            ref={base}
            role="application"
            aria-label={label}
            aria-disabled={disabled}
            data-testid="sky-joystick"
            data-active={knob.x !== 0 || knob.y !== 0 ? 'true' : undefined}
            className={cn(
                'relative shrink-0 touch-none rounded-full border-[3px] border-[#20364a] bg-white/70 shadow-[3px_3px_0px_#20364a] select-none',
                disabled ? 'opacity-50' : 'cursor-grab active:cursor-grabbing',
                className,
            )}
            style={{ width: size, height: size }}
            onPointerDown={(event) => {
                if (disabled) {
                    return;
                }
                event.preventDefault();
                event.currentTarget.setPointerCapture(event.pointerId);
                pointer.current = event.pointerId;
                steer(event.clientX, event.clientY);
            }}
            onPointerMove={(event) => {
                if (pointer.current === event.pointerId && !disabled) {
                    steer(event.clientX, event.clientY);
                }
            }}
            onPointerUp={release}
            onPointerCancel={release}
            onLostPointerCapture={release}
        >
            <span
                aria-hidden="true"
                className="absolute inset-[18%] rounded-full border-2 border-dashed border-[#20364a]/30"
            />
            {(['up', 'down', 'left', 'right'] as const).map((side) => (
                <span
                    key={side}
                    aria-hidden="true"
                    className={cn(
                        'absolute size-0 border-[6px] border-transparent',
                        side === 'up' &&
                            'top-1.5 left-1/2 -translate-x-1/2 border-b-[#20364a]/60',
                        side === 'down' &&
                            'bottom-1.5 left-1/2 -translate-x-1/2 border-t-[#20364a]/60',
                        side === 'left' &&
                            'top-1/2 left-1.5 -translate-y-1/2 border-r-[#20364a]/60',
                        side === 'right' &&
                            'top-1/2 right-1.5 -translate-y-1/2 border-l-[#20364a]/60',
                    )}
                />
            ))}
            <span
                aria-hidden="true"
                className="absolute top-1/2 left-1/2 rounded-full border-[3px] border-[#20364a] bg-[#ff9e44] shadow-[2px_2px_0px_#20364a] transition-transform duration-75"
                style={{
                    width: size * 0.42,
                    height: size * 0.42,
                    transform: `translate(calc(-50% + ${knob.x * travel}px), calc(-50% + ${knob.y * travel}px))`,
                }}
            />
        </div>
    );
}
