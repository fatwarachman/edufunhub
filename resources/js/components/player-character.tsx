import {
    CHARACTER_HEIGHT,
    type CharacterLook,
    drawCharacter,
} from '@/lib/character/draw-character';
import { useEffect, useRef } from 'react';

export interface CharacterData extends CharacterLook {
    nickname: string | null;
}

interface Props {
    character: CharacterLook;
    /** Rendered width/height in CSS px. Defaults to filling the parent (max 192px). */
    size?: number;
    /** Show the round backdrop behind the character. */
    backdrop?: boolean;
    className?: string;
}

/**
 * Portal avatar that reuses the exact in-game character drawing (Flag Quest),
 * so dashboard, portal, shop and game always show the same model.
 */
export default function PlayerCharacter({
    character,
    size,
    backdrop = true,
    className = 'mx-auto w-full max-w-48',
}: Props) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const signature = JSON.stringify(character);

    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx) {
            return;
        }
        const look = JSON.parse(signature) as CharacterLook;
        const draw = () => {
            const px = canvas.clientWidth || size || 192;
            const dpr = Math.min(window.devicePixelRatio || 1, 3);
            canvas.width = Math.round(px * dpr);
            canvas.height = Math.round(px * dpr);
            const scale = (px / (CHARACTER_HEIGHT + 24)) * dpr;
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            if (backdrop) {
                ctx.fillStyle = 'rgba(255, 217, 61, 0.3)';
                ctx.beginPath();
                ctx.arc(
                    canvas.width / 2,
                    canvas.height / 2,
                    canvas.width * 0.46,
                    0,
                    Math.PI * 2,
                );
                ctx.fill();
            }
            ctx.setTransform(scale, 0, 0, scale, canvas.width / 2, 0);
            ctx.fillStyle = 'rgba(20, 40, 20, 0.18)';
            ctx.beginPath();
            ctx.ellipse(0, CHARACTER_HEIGHT + 14, 16, 5, 0, 0, Math.PI * 2);
            ctx.fill();
            drawCharacter(ctx, -2, CHARACTER_HEIGHT + 14, look);
        };
        draw();
        const observer = new ResizeObserver(draw);
        observer.observe(canvas);
        return () => observer.disconnect();
    }, [signature, size, backdrop]);

    return (
        <canvas
            ref={canvasRef}
            className={`aspect-square ${className}`}
            style={size ? { width: size, height: size } : undefined}
            data-character-color={character.color}
            data-character-gender={character.gender ?? 'boy'}
            data-character-items={Object.values(character.items ?? {})
                .filter(Boolean)
                .map((item) => item?.style)
                .join(' ')}
            aria-hidden="true"
        />
    );
}
