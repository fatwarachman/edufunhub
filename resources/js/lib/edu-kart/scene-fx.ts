/**
 * Pooled particles (sparks, smoke, flames, debris, confetti, stars) and
 * explosion shells. Counts are bounded; nothing allocates per frame.
 */
import * as THREE from 'three';
import type { Kit } from './scene-kit';
import { dotTexture } from './scene-textures';

const VERTEX = /* glsl */ `
attribute float size;
attribute vec4 tint;
uniform float uScale;
varying vec4 vTint;
void main() {
    vTint = tint;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = size * uScale / max(0.1, -mv.z);
    gl_Position = projectionMatrix * mv;
}`;

const FRAGMENT = /* glsl */ `
uniform sampler2D uMap;
varying vec4 vTint;
void main() {
    vec4 t = texture2D(uMap, gl_PointCoord);
    float a = vTint.a * t.a;
    if (a < 0.02) discard;
    gl_FragColor = vec4(vTint.rgb, a);
}`;

export interface Emit {
    x: number;
    y: number;
    z: number;
    vx?: number;
    vy?: number;
    vz?: number;
    /** Random velocity spread (m/s). */
    spread?: number;
    life: number;
    size: number;
    /** Size at end of life (default = size). */
    size1?: number;
    color: THREE.ColorRepresentation;
    gravity?: number;
    drag?: number;
    alpha?: number;
}

class ParticlePool {
    readonly points: THREE.Points;
    private n: number;
    private next = 0;
    private pos: Float32Array;
    private vel: Float32Array;
    private sizeAttr: Float32Array;
    private tint: Float32Array;
    private life: Float32Array;
    private maxLife: Float32Array;
    private s0: Float32Array;
    private s1: Float32Array;
    private grav: Float32Array;
    private drag: Float32Array;
    private a0: Float32Array;
    private alive = 0;
    readonly material: THREE.ShaderMaterial;
    private color = new THREE.Color();

    constructor(count: number, map: THREE.Texture, additive: boolean) {
        this.n = count;
        this.pos = new Float32Array(count * 3);
        this.vel = new Float32Array(count * 3);
        this.sizeAttr = new Float32Array(count);
        this.tint = new Float32Array(count * 4);
        this.life = new Float32Array(count);
        this.maxLife = new Float32Array(count);
        this.s0 = new Float32Array(count);
        this.s1 = new Float32Array(count);
        this.grav = new Float32Array(count);
        this.drag = new Float32Array(count);
        this.a0 = new Float32Array(count);
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
        g.setAttribute('size', new THREE.BufferAttribute(this.sizeAttr, 1));
        g.setAttribute('tint', new THREE.BufferAttribute(this.tint, 4));
        this.material = new THREE.ShaderMaterial({
            uniforms: { uMap: { value: map }, uScale: { value: 400 } },
            vertexShader: VERTEX,
            fragmentShader: FRAGMENT,
            transparent: true,
            depthWrite: false,
            blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
        });
        this.points = new THREE.Points(g, this.material);
        this.points.frustumCulled = false;
        this.points.renderOrder = additive ? 3 : 2;
    }

    emit(e: Emit, random: () => number): void {
        const i = this.next;
        this.next = (this.next + 1) % this.n;
        const s = e.spread ?? 0;
        this.pos[i * 3] = e.x;
        this.pos[i * 3 + 1] = e.y;
        this.pos[i * 3 + 2] = e.z;
        this.vel[i * 3] = (e.vx ?? 0) + (random() * 2 - 1) * s;
        this.vel[i * 3 + 1] = (e.vy ?? 0) + (random() * 2 - 1) * s;
        this.vel[i * 3 + 2] = (e.vz ?? 0) + (random() * 2 - 1) * s;
        this.life[i] = e.life;
        this.maxLife[i] = e.life;
        this.s0[i] = e.size;
        this.s1[i] = e.size1 ?? e.size;
        this.grav[i] = e.gravity ?? 0;
        this.drag[i] = e.drag ?? 0;
        this.a0[i] = e.alpha ?? 1;
        this.color.set(e.color);
        this.tint[i * 4] = this.color.r;
        this.tint[i * 4 + 1] = this.color.g;
        this.tint[i * 4 + 2] = this.color.b;
        this.alive = Math.max(this.alive, 1);
    }

    update(dt: number): void {
        if (this.alive === 0) {
            return;
        }
        let any = 0;
        for (let i = 0; i < this.n; i++) {
            if (this.life[i] <= 0) {
                this.sizeAttr[i] = 0;
                continue;
            }
            any++;
            this.life[i] -= dt;
            const k = Math.max(0, this.life[i] / this.maxLife[i]);
            const damp = Math.max(0, 1 - this.drag[i] * dt);
            this.vel[i * 3] *= damp;
            this.vel[i * 3 + 1] =
                this.vel[i * 3 + 1] * damp - this.grav[i] * dt;
            this.vel[i * 3 + 2] *= damp;
            this.pos[i * 3] += this.vel[i * 3] * dt;
            this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
            this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
            this.sizeAttr[i] =
                this.life[i] > 0
                    ? this.s1[i] + (this.s0[i] - this.s1[i]) * k
                    : 0;
            this.tint[i * 4 + 3] = this.a0[i] * Math.min(1, k * 2.5);
        }
        this.alive = any;
        const g = this.points.geometry;
        g.attributes.position.needsUpdate = true;
        g.attributes.size.needsUpdate = true;
        g.attributes.tint.needsUpdate = true;
    }

    dispose(): void {
        this.points.geometry.dispose();
        this.material.dispose();
    }
}

interface Shell {
    mesh: THREE.Mesh;
    material: THREE.MeshBasicMaterial;
    age: number;
    life: number;
    size: number;
}

export class Effects {
    readonly group = new THREE.Group();
    readonly glow: ParticlePool;
    readonly soft: ParticlePool;
    private shells: Shell[] = [];
    private random = Math.random;
    /** 0..1 emission multiplier (coarse / reduced motion). */
    readonly density: number;

    constructor(kit: Kit, coarse: boolean, reducedMotion: boolean) {
        const map = dotTexture(kit);
        this.density = (coarse ? 0.55 : 1) * (reducedMotion ? 0.5 : 1);
        this.glow = new ParticlePool(coarse ? 260 : 600, map, true);
        this.soft = new ParticlePool(coarse ? 220 : 520, map, false);
        this.group.add(this.glow.points, this.soft.points);
        const sphere = kit.geometry(
            'fx-sphere',
            () => new THREE.SphereGeometry(1, 18, 12),
        );
        for (let i = 0; i < 6; i++) {
            const material = new THREE.MeshBasicMaterial({
                color: '#ffb02e',
                transparent: true,
                opacity: 0,
                depthWrite: false,
                blending: THREE.AdditiveBlending,
            });
            const mesh = new THREE.Mesh(sphere, material);
            mesh.visible = false;
            this.group.add(mesh);
            this.shells.push({ mesh, material, age: 0, life: 0, size: 1 });
        }
    }

    setScale(scale: number): void {
        this.glow.material.uniforms.uScale.value = scale;
        this.soft.material.uniforms.uScale.value = scale;
    }

    /** Emits `count * density` particles (at least 1 when count >= 1). */
    burst(
        pool: 'glow' | 'soft',
        count: number,
        make: (i: number) => Emit,
    ): void {
        const n = Math.max(
            count >= 1 ? 1 : 0,
            Math.round(count * this.density),
        );
        const p = pool === 'glow' ? this.glow : this.soft;
        for (let i = 0; i < n; i++) {
            p.emit(make(i), this.random);
        }
    }

    /** Probabilistic emission for continuous trails (rate per second). */
    trail(
        pool: 'glow' | 'soft',
        rate: number,
        dt: number,
        make: () => Emit,
    ): void {
        let expected = rate * dt * this.density;
        const p = pool === 'glow' ? this.glow : this.soft;
        while (expected > 0) {
            if (expected >= 1 || this.random() < expected) {
                p.emit(make(), this.random);
            }
            expected -= 1;
        }
    }

    explosion(x: number, y: number, z: number, size = 3.2): void {
        const shell =
            this.shells.find((s) => !s.mesh.visible) ?? this.shells[0];
        shell.mesh.visible = true;
        shell.mesh.position.set(x, y, z);
        shell.age = 0;
        shell.life = 0.55;
        shell.size = size;
        this.burst('glow', 80, (i) => ({
            x,
            y,
            z,
            spread: 10,
            vy: 4,
            life: 0.5 + this.random() * 0.4,
            size: i % 4 === 0 ? 1.6 : 1.0,
            size1: 0.2,
            color:
                i % 5 === 0
                    ? '#ffffff'
                    : this.random() > 0.5
                      ? '#ffd23a'
                      : '#ff6a1a',
            gravity: 8,
            drag: 2,
        }));
        this.burst('soft', 26, () => ({
            x,
            y: y + 0.5,
            z,
            spread: 3,
            vy: 2.5,
            life: 1.1 + this.random() * 0.6,
            size: 1.4,
            size1: 3.2,
            color: '#3a3a3e',
            alpha: 0.75,
            drag: 1.5,
        }));
    }

    /** Wooden crate splinters + a coloured puff (answer box break). */
    crateBreak(x: number, y: number, z: number, color: string): void {
        const wood = ['#8a5a2b', '#c48a4a', '#e8b878', '#6b4220', '#9aa1ab'];
        // Wood splinter chunks (big, heavy) + small chips.
        this.burst('soft', 30, (i) => ({
            x,
            y,
            z,
            spread: 8,
            vy: 6,
            life: 0.9 + this.random() * 0.5,
            size: i % 3 === 0 ? 0.8 : 0.5,
            size1: 0.4,
            color: wood[i % wood.length],
            gravity: 16,
            drag: 0.5,
        }));
        this.burst('soft', 12, () => ({
            x,
            y,
            z,
            spread: 5,
            vy: 4,
            life: 0.7,
            size: 0.35,
            size1: 0.2,
            color,
            gravity: 12,
            drag: 0.8,
        }));
        this.burst('glow', 24, () => ({
            x,
            y,
            z,
            spread: 4,
            vy: 2,
            life: 0.5,
            size: 1.0,
            size1: 0.1,
            color,
            drag: 2,
        }));
    }

    stars(x: number, y: number, z: number): void {
        this.burst('glow', 18, (i) => {
            const a = (i / 18) * Math.PI * 2;
            return {
                x,
                y,
                z,
                vx: Math.cos(a) * 3,
                vy: 2.5,
                vz: Math.sin(a) * 3,
                life: 0.8,
                size: 0.6,
                size1: 0.15,
                color: i % 2 ? '#fff36b' : '#ffffff',
                gravity: 3,
            };
        });
    }

    confetti(x: number, y: number, z: number): void {
        const colors = ['#ff3b3b', '#ffd23a', '#3bd16f', '#3b8bff', '#ff5fd2'];
        this.burst('soft', 120, (i) => ({
            x: x + (this.random() * 2 - 1) * 6,
            y: y + 6 + this.random() * 2,
            z: z + (this.random() * 2 - 1) * 6,
            spread: 2.5,
            vy: 2,
            life: 2.4,
            size: 0.35,
            color: colors[i % colors.length],
            gravity: 2.5,
            drag: 1.2,
        }));
    }

    puff(x: number, y: number, z: number, color = '#f2f2f2'): void {
        this.burst('soft', 12, () => ({
            x,
            y,
            z,
            spread: 1.6,
            vy: 1.2,
            life: 0.6,
            size: 0.6,
            size1: 1.6,
            color,
            alpha: 0.8,
            drag: 2,
        }));
        this.burst('glow', 8, () => ({
            x,
            y,
            z,
            spread: 2.5,
            life: 0.25,
            size: 0.8,
            size1: 0.2,
            color: '#ffb02e',
        }));
    }

    update(dt: number): void {
        this.glow.update(dt);
        this.soft.update(dt);
        for (const s of this.shells) {
            if (!s.mesh.visible) {
                continue;
            }
            s.age += dt;
            const k = s.age / s.life;
            if (k >= 1) {
                s.mesh.visible = false;
                continue;
            }
            s.mesh.scale.setScalar(0.4 + s.size * Math.sqrt(k));
            s.material.opacity = 0.9 * (1 - k);
            s.material.color.setHSL(0.09 - k * 0.06, 1, 0.6 - k * 0.2);
        }
    }

    dispose(): void {
        this.glow.dispose();
        this.soft.dispose();
        for (const s of this.shells) {
            s.material.dispose();
        }
    }
}
