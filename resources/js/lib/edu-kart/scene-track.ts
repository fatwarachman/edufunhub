/**
 * Static track meshes: road ribbon, kerbs, shoulders, verges, themed
 * barriers, start/finish line with the countdown gantry, ramps and speed
 * pads. Everything static is merged per material (few draw calls).
 */
import * as THREE from 'three';
import { WALL_MARGIN } from './physics';
import type { TrackField } from './scene-field';
import {
    Bake,
    beam,
    compose,
    type Kit,
    type Shapes,
    splitTiles,
} from './scene-kit';
import { barProfile, innerClamp, rampLift, sweep } from './scene-strip';
import { lightBulbs, seededRandom } from './scene-text';
import {
    billboardTexture,
    checkerTexture,
    chevronTexture,
    kerbTexture,
    padTexture,
    roadTexture,
} from './scene-textures';
import type { SceneTheme } from './scene-theme';
import type { Track } from './track';

/** Ramp wedge height at the lip (m). */
export const RAMP_HEIGHT = 0.9;
/** Kerb width outside the road edge (m). */
export const KERB_WIDTH = 0.9;
/** Lateral position of the barrier centre (outside the kart wall clamp). */
export function barrierOffset(track: Track): number {
    return track.halfWidth + WALL_MARGIN + 0.9;
}

/** Visual lift of a kart at progress p from ramps (wedge + landing ease). */
export function rampVisualLift(track: Track, p: number): number {
    const s = track.wrap(p);
    for (const r of track.ramps) {
        const into = track.wrap(s - (r.s - r.len));
        if (into <= r.len) {
            return (RAMP_HEIGHT * into) / r.len;
        }
        const after = track.wrap(s - r.s);
        if (after < 5) {
            return RAMP_HEIGHT * (1 - after / 5);
        }
    }
    return 0;
}

export class TrackMeshes {
    readonly group = new THREE.Group();
    private bulbs: THREE.Mesh[] = [];
    private bulbMaterials: Record<'off' | 'red' | 'green', THREE.Material>;
    private padTex: THREE.CanvasTexture | null = null;
    private lastLights: number | null | undefined = undefined;

    constructor(
        private kit: Kit,
        private shapes: Shapes,
        private track: Track,
        private field: TrackField,
        private theme: SceneTheme,
        private shadows: boolean,
    ) {
        this.bulbMaterials = {
            off: kit.toon('#3a3d46'),
            red: kit.material(
                'bulb-red',
                () => new THREE.MeshBasicMaterial({ color: '#ff2a2a' }),
            ),
            green: kit.material(
                'bulb-green',
                () => new THREE.MeshBasicMaterial({ color: '#3dff6a' }),
            ),
        };
        this.buildRoad();
        this.buildSides();
        this.buildBarriers();
        this.buildStart();
        this.buildRamps();
        this.buildPads();
    }

    private mesh(
        geometry: THREE.BufferGeometry | null,
        material: THREE.Material,
        receive = true,
        cast = false,
    ): THREE.Mesh | null {
        if (!geometry) {
            return null;
        }
        // Long strips are split into world tiles so frustum culling drops
        // the parts behind the camera.
        geometry.computeBoundingSphere();
        const parts =
            (geometry.boundingSphere?.radius ?? 0) > 120
                ? splitTiles(geometry, 240)
                : [geometry];
        let first: THREE.Mesh | null = null;
        for (const part of parts) {
            this.kit.own(part);
            const m = new THREE.Mesh(part, material);
            m.receiveShadow = receive && this.shadows;
            m.castShadow = cast && this.shadows;
            m.matrixAutoUpdate = false;
            m.updateMatrix();
            this.group.add(m);
            first ??= m;
        }
        return first;
    }

    private buildRoad(): void {
        const t = this.track;
        const hw = t.halfWidth;
        const tex = roadTexture(this.kit, this.theme);
        const road = sweep(
            t,
            [
                { d: -hw, y: 0.02, u: 0 },
                { d: 0, y: 0.03, u: 0.5 },
                { d: hw, y: 0.02, u: 1 },
            ],
            { from: 0, to: t.length, step: t.step, vPerMetre: 1 / 8 },
        );
        const mat = this.kit.material(
            'road',
            () =>
                new THREE.MeshLambertMaterial({
                    map: tex,
                    polygonOffset: true,
                    polygonOffsetFactor: -1,
                    polygonOffsetUnits: -1,
                }),
        );
        this.mesh(road, mat);

        // Kerbs: slightly raised red/white blocks along both edges.
        const kerbTex = kerbTexture(this.kit);
        const kerbMat = this.kit.material(
            'kerb',
            () => new THREE.MeshLambertMaterial({ map: kerbTex }),
        );
        const kw = KERB_WIDTH;
        const kerbs = new Bake(true);
        for (const side of [-1, 1]) {
            // CTR rumble strip: a raised lip (~0.08 m) on both edges.
            const left = [
                { d: -hw - kw, y: 0.0, u: 0 },
                { d: -hw - kw + 0.05, y: 0.1, u: 0.06 },
                { d: -hw - kw * 0.5, y: 0.13, u: 0.5 },
                { d: -hw - 0.05, y: 0.11, u: 0.94 },
                { d: -hw, y: 0.03, u: 1 },
            ];
            const pts =
                side < 0
                    ? left
                    : left
                          .map((pt) => ({ d: -pt.d, y: pt.y, u: 1 - pt.u }))
                          .reverse();
            const strip = sweep(t, pts, {
                from: 0,
                to: t.length,
                step: t.step,
                vPerMetre: 1 / 4,
            });
            kerbs.addColored(strip);
            strip.dispose();
        }
        this.mesh(kerbs.build(), kerbMat);

        // Start / finish checkered band.
        const checker = checkerTexture(this.kit);
        const chMat = this.kit.material(
            'checker',
            () =>
                new THREE.MeshLambertMaterial({
                    map: checker,
                    polygonOffset: true,
                    polygonOffsetFactor: -2,
                    polygonOffsetUnits: -2,
                }),
        );
        const line = sweep(
            t,
            [
                { d: -hw, y: 0.035, u: 0 },
                { d: hw, y: 0.035, u: 1 },
            ],
            { from: -1, to: 1, step: 1, vPerMetre: 0.5 },
        );
        // Checker runs across the road: swap uv so u goes along the width.
        const uv = line.getAttribute('uv') as THREE.BufferAttribute;
        for (let i = 0; i < uv.count; i++) {
            const u = uv.getX(i);
            uv.setXY(i, u * hw * 0.25, uv.getY(i));
        }
        this.mesh(line, chMat);
    }

    /** Shoulders, verges, run-off and gravel traps (vertex coloured). */
    private buildSides(): void {
        const t = this.track;
        const hw = t.halfWidth;
        const kw = KERB_WIDTH;
        const wall = barrierOffset(t);
        const th = this.theme;
        const bake = new Bake();
        const gravel = '#d8c49a';
        const curvy = (p: number, side: number) =>
            t.curvature(p) * side < -0.022;
        for (const side of [-1, 1]) {
            const s = side;
            const shoulder = sweep(
                t,
                s < 0
                    ? [
                          { d: -wall - 0.6, y: -0.02 },
                          { d: -hw - kw, y: 0.0 },
                      ]
                    : [
                          { d: hw + kw, y: 0.0 },
                          { d: wall + 0.6, y: -0.02 },
                      ],
                {
                    from: 0,
                    to: t.length,
                    step: t.step,
                    paint:
                        th.id === 'mandalika'
                            ? (p) => (curvy(p, s) ? gravel : th.shoulder)
                            : () => th.shoulder,
                },
            );
            bake.addColored(shoulder);
            shoulder.dispose();
            const verge = sweep(
                t,
                s < 0
                    ? [
                          { d: -wall - 6, y: -0.45, color: th.verge },
                          { d: -wall - 0.6, y: -0.02, color: th.verge },
                      ]
                    : [
                          { d: wall + 0.6, y: -0.02, color: th.verge },
                          { d: wall + 6, y: -0.45, color: th.verge },
                      ],
                { from: 0, to: t.length, step: t.step * 2 },
            );
            bake.addColored(verge);
            verge.dispose();
        }
        this.mesh(bake.build(), this.kit.vertexLambert());
    }

    private buildBarriers(): void {
        const t = this.track;
        const wall = barrierOffset(t);
        const sh = this.shapes;
        const bake = new Bake();
        const rnd = seededRandom(31);
        const id = this.theme.id;
        const ink = 0.03;
        for (const side of [-1, 1]) {
            const d = side * wall;
            if (id === 'forest') {
                // Wooden log fence: posts + two log rails, rocks outside.
                for (const [x, y, z, h, i] of this.field.along(4, d)) {
                    if (this.nearGate(i * t.step)) {
                        continue;
                    }
                    const dd = innerClamp(d, t.curvature(i * t.step));
                    if (dd !== d) {
                        continue;
                    }
                    bake.addOutlined(
                        sh.cylinder(5, true),
                        '#7a4a24',
                        compose(x, y + 0.55, z, 0, 0, 0, 0.14, 1.2, 0.14),
                        ink,
                    );
                    bake.addOutlined(
                        sh.cone(5),
                        '#5e3818',
                        compose(x, y + 1.25, z, h, 0, 0, 0.15, 0.2, 0.15),
                        0,
                    );
                }
                for (const y0 of [0.45, 0.85]) {
                    const rail = sweep(
                        t,
                        barProfile(d, y0, y0 + 0.2, 0.09, '#9a6236', '#7d4c27'),
                        {
                            from: 0,
                            to: t.length,
                            step: t.step * 2,
                            hard: true,
                        },
                    );
                    bake.addColored(rail);
                    rail.dispose();
                }
                for (const [x, y, z, h] of this.field.along(
                    17,
                    d + side * 1.4,
                    rnd() * 5,
                )) {
                    const s = 0.5 + rnd() * 0.7;
                    bake.addOutlined(
                        sh.dodeca(),
                        rnd() > 0.5 ? '#8f9198' : '#7b7f86',
                        compose(
                            x,
                            y + s * 0.3,
                            z,
                            h + rnd(),
                            rnd(),
                            0,
                            s,
                            s * 0.75,
                            s,
                        ),
                        ink,
                    );
                }
            } else if (id === 'beach') {
                // Bamboo posts with rope rails, sandbag piles.
                for (const [x, y, z, , i] of this.field.along(3.5, d)) {
                    if (innerClamp(d, t.curvature(i * t.step)) !== d) {
                        continue;
                    }
                    const tall = 1.05 + rnd() * 0.25;
                    bake.addOutlined(
                        sh.cylinder(5, true),
                        '#d8c46a',
                        compose(x, y + tall / 2, z, 0, 0, 0, 0.08, tall, 0.08),
                        ink,
                    );
                    bake.add(
                        sh.cylinder(5, true),
                        '#8f7d2e',
                        compose(
                            x,
                            y + tall * 0.55,
                            z,
                            0,
                            0,
                            0,
                            0.09,
                            0.05,
                            0.09,
                        ),
                    );
                }
                for (const y0 of [0.55, 0.9]) {
                    const rope = sweep(
                        t,
                        barProfile(
                            d,
                            y0,
                            y0 + 0.06,
                            0.04,
                            '#e9dcb4',
                            '#cdbd8e',
                        ),
                        {
                            from: 0,
                            to: t.length,
                            step: t.step * 2,
                            hard: true,
                        },
                    );
                    bake.addColored(rope);
                    rope.dispose();
                }
                for (const [x, y, z, h] of this.field.along(
                    23,
                    d + side * 0.9,
                    rnd() * 10,
                )) {
                    for (let k = 0; k < 5; k++) {
                        const row = k < 3 ? 0 : 1;
                        const off =
                            row === 0 ? (k - 1) * 0.62 : (k - 3.5) * 0.62;
                        const fx = Math.cos(h) * off;
                        const fz = Math.sin(h) * off;
                        bake.addOutlined(
                            sh.ball(6, 4),
                            '#cdb27a',
                            compose(
                                x + fx,
                                y + 0.18 + row * 0.3,
                                z + fz,
                                -h,
                                0,
                                0,
                                0.34,
                                0.17,
                                0.24,
                            ),
                            ink,
                        );
                    }
                }
            } else {
                // Armco on straights, tyre walls on the outside of corners.
                const armcoTop = '#d9dde3';
                const armcoSide = '#aeb4bd';
                const rail = sweep(
                    t,
                    [
                        { d: d - 0.08, y: 0.0 },
                        { d: d - 0.08, y: 0.95 },
                        { d: d + 0.08, y: 0.95 },
                        { d: d + 0.08, y: 0.0 },
                    ],
                    {
                        from: 0,
                        to: t.length,
                        step: t.step,
                        hard: true,
                        paint: (p, j) => {
                            const corner = t.curvature(p) * side < -0.022;
                            if (corner) {
                                return Math.floor(p / 4) % 2 === 0
                                    ? '#d8262c'
                                    : '#f4f4f4';
                            }
                            return j === 1 || j === 2 ? armcoTop : armcoSide;
                        },
                    },
                );
                bake.addColored(rail);
                rail.dispose();
                for (const [x, y, z, h, i] of this.field.along(
                    1.4,
                    d + side * 0.75,
                )) {
                    const p = i * t.step;
                    if (t.curvature(p) * side >= -0.022) {
                        continue;
                    }
                    if (innerClamp(d, t.curvature(p)) !== d) {
                        continue;
                    }
                    for (let level = 0; level < 3; level++) {
                        bake.add(
                            sh.cylinder(7, level !== 2),
                            level === 1 ? '#f2f2f2' : '#26272b',
                            compose(
                                x,
                                y + 0.14 + level * 0.27,
                                z,
                                h,
                                0,
                                0,
                                0.55,
                                0.26,
                                0.55,
                            ),
                        );
                    }
                }
                for (const [x, y, z] of this.field.along(6, d + side * 0.16)) {
                    bake.add(
                        sh.box(),
                        '#8a9099',
                        compose(x, y + 0.5, z, 0, 0, 0, 0.12, 1.0, 0.12),
                    );
                }
            }
        }
        this.mesh(bake.build(), this.kit.vertexToon(), true, true);
    }

    /** True near the start gantry (keeps posts out of the arch legs). */
    private nearGate(p: number): boolean {
        const a = Math.abs(this.track.ahead(0, p));
        return a < 2;
    }

    private buildStart(): void {
        const t = this.track;
        const sh = this.shapes;
        const hw = t.halfWidth;
        const bake = new Bake();
        const [cx, cy, cz] = t.world(0, 0);
        const h = t.headingAt(0);
        const ry = Math.PI / 2 - h;
        const right = new THREE.Vector3(-Math.sin(h), 0, Math.cos(h));
        const base = new THREE.Vector3(cx, cy, cz);
        const span = hw + KERB_WIDTH + 1.4;
        const top = 6.2;
        const id = this.theme.id;
        const legColor =
            id === 'forest'
                ? '#7a4a24'
                : id === 'beach'
                  ? '#d8c46a'
                  : '#e8ebef';
        const beamColor =
            id === 'forest'
                ? '#8d5a2f'
                : id === 'beach'
                  ? '#c9a94e'
                  : '#2c3442';
        for (const s of [-1, 1]) {
            const foot = base.clone().addScaledVector(right, s * span);
            if (id === 'mandalika') {
                bake.addOutlined(
                    sh.box(),
                    legColor,
                    compose(
                        foot.x,
                        foot.y + top / 2,
                        foot.z,
                        ry,
                        0,
                        0,
                        0.7,
                        top,
                        0.7,
                    ),
                    0.04,
                );
            } else {
                bake.addOutlined(
                    sh.cylinder(8),
                    legColor,
                    compose(
                        foot.x,
                        foot.y + top / 2,
                        foot.z,
                        0,
                        0,
                        0,
                        0.42,
                        top,
                        0.42,
                    ),
                    0.04,
                );
                // Totem / tiki head on top of the leg.
                bake.addOutlined(
                    sh.box(),
                    id === 'forest' ? '#a0622c' : '#e08a3a',
                    compose(
                        foot.x,
                        foot.y + top + 0.9,
                        foot.z,
                        ry,
                        0,
                        0,
                        0.9,
                        1.4,
                        0.9,
                    ),
                    0.04,
                );
                bake.add(
                    sh.box(),
                    '#1d2238',
                    compose(
                        foot.x - Math.cos(h) * 0.46,
                        foot.y + top + 1.05,
                        foot.z - Math.sin(h) * 0.46,
                        ry,
                        0,
                        0,
                        0.6,
                        0.18,
                        0.02,
                    ),
                );
            }
        }
        const a = base.clone().addScaledVector(right, -span);
        const b = base.clone().addScaledVector(right, span);
        a.y += top;
        b.y += top;
        if (id === 'mandalika') {
            bake.addOutlined(
                sh.box(),
                beamColor,
                compose(
                    cx,
                    cy + top + 0.1,
                    cz,
                    ry,
                    0,
                    0,
                    span * 2 + 0.7,
                    1.1,
                    0.8,
                ),
                0.04,
            );
        } else {
            bake.addOutlined(sh.cylinder(8), beamColor, beam(a, b, 0.36), 0.04);
        }
        this.mesh(bake.build(), this.kit.vertexToon(), true, true);

        // Banner on the beam (both faces).
        const word = id === 'mandalika' ? 'MANDALIKA' : 'EDUFUNHUB';
        const tex = billboardTexture(
            this.kit,
            word,
            id === 'mandalika' ? '#d8262c' : '#1e5bd8',
            '#ffffff',
            id === 'mandalika' ? '#ffffff' : '#ffcf2e',
        );
        const bannerMat = this.kit.material(
            `banner-${word}`,
            () =>
                new THREE.MeshLambertMaterial({
                    map: tex,
                    side: THREE.DoubleSide,
                }),
        );
        const banner = new THREE.Mesh(
            this.kit.geometry('plane', () => new THREE.PlaneGeometry(1, 1)),
            bannerMat,
        );
        banner.scale.set(Math.min(11, span * 1.4), 1.6, 1);
        banner.position.set(cx, cy + top + 1.5, cz);
        banner.rotation.y = ry + Math.PI;
        this.group.add(banner);

        // Countdown bulbs, facing the karts lining up behind the line.
        const bulbGeo = this.kit.geometry(
            'bulb',
            () => new THREE.SphereGeometry(0.42, 12, 8),
        );
        const housing = new Bake();
        for (let i = 0; i < 3; i++) {
            const off = (i - 1) * 1.25;
            const x = cx + right.x * off - Math.cos(h) * 0.5;
            const z = cz + right.z * off - Math.sin(h) * 0.5;
            const y = cy + top - 0.85;
            housing.addOutlined(
                sh.box(),
                '#1f232b',
                compose(
                    x + Math.cos(h) * 0.15,
                    y,
                    z + Math.sin(h) * 0.15,
                    ry,
                    0,
                    0,
                    1.05,
                    1.05,
                    0.45,
                ),
                0.03,
            );
            const bulb = new THREE.Mesh(bulbGeo, this.bulbMaterials.off);
            bulb.position.set(x, y, z);
            this.group.add(bulb);
            this.bulbs.push(bulb);
        }
        this.mesh(housing.build(), this.kit.vertexToon());
    }

    private buildRamps(): void {
        const t = this.track;
        if (t.ramps.length === 0) {
            return;
        }
        const hw = t.halfWidth;
        const tex = chevronTexture(this.kit);
        const plank = this.theme.id === 'beach';
        const mat = this.kit.material(
            'ramp',
            () =>
                new THREE.MeshToonMaterial({
                    map: tex,
                    gradientMap: this.kit.gradient,
                    color: plank ? '#f3d9a6' : '#ffffff',
                }),
        );
        const sides = new Bake();
        for (const r of t.ramps) {
            const lift = (p: number) => rampLift(t, p, [r], RAMP_HEIGHT);
            const from = r.s - r.len;
            const top = sweep(
                t,
                [
                    { d: -hw - 0.2, y: 0.05, u: 0 },
                    { d: hw + 0.2, y: 0.05, u: 3 },
                ],
                { from, to: r.s, step: 1, vPerMetre: 1 / 2.5, lift },
            );
            this.mesh(top, mat, true, true);
            for (const s of [-1, 1]) {
                const side = sweep(
                    t,
                    s < 0
                        ? [
                              {
                                  d: -hw - 0.2,
                                  y: 0,
                                  fixed: true,
                                  color: '#3b3f48',
                              },
                              { d: -hw - 0.2, y: 0.05, color: '#3b3f48' },
                          ]
                        : [
                              { d: hw + 0.2, y: 0.05, color: '#3b3f48' },
                              {
                                  d: hw + 0.2,
                                  y: 0,
                                  fixed: true,
                                  color: '#3b3f48',
                              },
                          ],
                    { from, to: r.s, step: 1, lift },
                );
                sides.addColored(side);
                side.dispose();
            }
            const [x, y, z] = t.world(r.s, 0);
            const h = t.headingAt(r.s);
            sides.addOutlined(
                this.shapes.box(),
                plank ? '#9a6a3a' : '#e0322c',
                compose(
                    x - Math.cos(h) * 0.15,
                    y + RAMP_HEIGHT / 2,
                    z - Math.sin(h) * 0.15,
                    Math.PI / 2 - h,
                    0,
                    0,
                    hw * 2 + 0.4,
                    RAMP_HEIGHT + 0.05,
                    0.3,
                ),
                0.03,
            );
        }
        const m = this.mesh(sides.build(), this.kit.vertexToon());
        if (m) {
            (m.material as THREE.Material).side = THREE.FrontSide;
        }
    }

    private buildPads(): void {
        const t = this.track;
        if (t.pads.length === 0) {
            return;
        }
        this.padTex = padTexture(this.kit);
        const tex = this.padTex;
        const mat = this.kit.material(
            'pad',
            () =>
                new THREE.MeshBasicMaterial({
                    map: tex,
                    polygonOffset: true,
                    polygonOffsetFactor: -3,
                    polygonOffsetUnits: -3,
                }),
        );
        const geos: THREE.BufferGeometry[] = [];
        for (const pad of t.pads) {
            geos.push(
                sweep(
                    t,
                    [
                        { d: pad.lateral - pad.width / 2, y: 0.05, u: 0 },
                        { d: pad.lateral + pad.width / 2, y: 0.05, u: 1 },
                    ],
                    {
                        from: pad.s,
                        to: pad.s + pad.len,
                        step: 1,
                        vPerMetre: 1 / 2,
                    },
                ),
            );
        }
        const bake = new Bake(true);
        for (const g of geos) {
            bake.addColored(g);
            g.dispose();
        }
        this.mesh(bake.build(), mat, false);
    }

    update(time: number, lights: number | null): void {
        if (this.padTex) {
            this.padTex.offset.y = -((time * 1.6) % 1);
        }
        if (lights !== this.lastLights) {
            this.lastLights = lights;
            const states = lightBulbs(lights);
            states.forEach((s, i) => {
                this.bulbs[i].material = this.bulbMaterials[s];
                this.bulbs[i].scale.setScalar(s === 'off' ? 1 : 1.12);
            });
        }
    }
}
