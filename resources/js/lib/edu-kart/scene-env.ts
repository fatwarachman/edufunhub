/**
 * Environment per theme: terrain, sky dome, sea, clouds and scenery
 * (instanced vegetation, baked props). Forest = jungle, beach = sand + sea,
 * mandalika = circuit with grandstands, pit building and Lombok hills.
 */
import * as THREE from 'three';
import { sampleGrid, type TrackField } from './scene-field';
import {
    Bake,
    compose,
    type Kit,
    type Shapes,
    splitTiles,
    TILE_SIZE,
} from './scene-kit';
import { seededRandom, smoothstep, valueNoise } from './scene-text';
import {
    billboardTexture,
    waterfallTexture,
    waveTexture,
} from './scene-textures';
import type { SceneTheme } from './scene-theme';
import { barrierOffset } from './scene-track';
import type { Track } from './track';

export class Environment {
    readonly group = new THREE.Group();
    private animated: { tex: THREE.Texture; speed: [number, number] }[] = [];
    private sea: THREE.Mesh | null = null;
    private clouds: THREE.Group | null = null;
    private sky: THREE.Mesh | null = null;
    private horizon: THREE.Mesh | null = null;
    readonly radius: number;

    constructor(
        private kit: Kit,
        private shapes: Shapes,
        private track: Track,
        private field: TrackField,
        private theme: SceneTheme,
        private coarse: boolean,
        private shadows: boolean,
        /** Camera far plane: sky, horizon and clouds stay inside it. */
        private far: number,
    ) {
        const f = field;
        this.radius = Math.max(f.maxX - f.minX, f.maxZ - f.minZ) / 2 + 160;
        this.buildSky();
        this.buildHorizon();
        this.buildTerrain();
        if (theme.sea) {
            this.buildSea();
        }
        // Clouds sit outside the short phone fog: skip them there.
        if (theme.id === 'forest') {
            this.buildForest();
        } else if (theme.id === 'beach') {
            this.buildBeach();
        } else {
            this.buildMandalika();
        }
        this.flushScatter();
        if (!coarse) {
            this.buildClouds();
        }
    }

    /**
     * Adds a static geometry split into world tiles (frustum culling drops
     * the tiles behind the camera / past the far plane).
     */
    private add(
        geometry: THREE.BufferGeometry | null,
        material: THREE.Material,
        cast = false,
        tile = TILE_SIZE,
    ): void {
        if (!geometry) {
            return;
        }
        // Static vertex-coloured toon parts all join the scatter bake: one
        // draw call per visible tile for props + vegetation together.
        if (!this.flushing && material === this.kit.vertexToon()) {
            this.scatter.addColored(geometry);
            geometry.dispose();
            return;
        }
        for (const part of splitTiles(geometry, tile)) {
            this.kit.own(part);
            const m = new THREE.Mesh(part, material);
            m.castShadow = cast && this.shadows;
            m.receiveShadow = this.shadows;
            m.matrixAutoUpdate = false;
            m.updateMatrix();
            this.group.add(m);
        }
    }

    private buildSky(): void {
        const th = this.theme;
        const geo = this.kit.geometry(
            'sky',
            () => new THREE.SphereGeometry(1, 24, 12),
        );
        const mat = this.kit.material(
            `sky-${th.id}`,
            () =>
                new THREE.ShaderMaterial({
                    uniforms: {
                        top: { value: new THREE.Color(th.skyTop) },
                        horizon: { value: new THREE.Color(th.skyHorizon) },
                        bottom: { value: new THREE.Color(th.skyBottom) },
                    },
                    vertexShader: `varying vec3 vDir;
void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
                    fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom; varying vec3 vDir;
void main() { float h = vDir.y; vec3 c = h > 0.0 ? mix(horizon, top, pow(min(1.0, h * 1.6), 0.7)) : mix(horizon, bottom, min(1.0, -h * 4.0)); gl_FragColor = vec4(c, 1.0); }`,
                    side: THREE.BackSide,
                    depthWrite: false,
                    fog: false,
                }),
        );
        const sky = new THREE.Mesh(geo, mat);
        // Follows the camera (update) and stays inside the far plane.
        sky.scale.setScalar(this.far * 0.92);
        sky.position.set(this.field.centerX, 0, this.field.centerZ);
        sky.renderOrder = -10;
        sky.frustumCulled = false;
        this.group.add(sky);
        this.sky = sky;
    }

    /**
     * Ring of low-poly hill silhouettes on the horizon (one mesh, two
     * layers, unlit and pre-mixed toward the fog colour). Follows the
     * camera so the horizon is never empty, whatever the fog distance.
     */
    private buildHorizon(): void {
        const th = this.theme;
        const fog = new THREE.Color(th.fog);
        const base =
            th.id === 'beach'
                ? ['#5f9e57', '#7fb46a']
                : th.id === 'mandalika'
                  ? ['#4d8f3a', '#6aa652']
                  : ['#3a7a33', '#5b9a48'];
        const noise = valueNoise(th.id.length * 31 + 7);
        const cols = 56;
        const positions: number[] = [];
        const colors: number[] = [];
        const index: number[] = [];
        const layers = [
            { r: 0.86, h: [0.06, 0.2], mix: 0.5, color: base[1], seed: 0 },
            { r: 0.8, h: [0.03, 0.13], mix: 0.3, color: base[0], seed: 40 },
        ];
        const c = new THREE.Color();
        const low = new THREE.Color();
        for (const layer of layers) {
            const start = positions.length / 3;
            const radius = this.far * layer.r;
            c.set(layer.color).lerp(fog, layer.mix);
            low.copy(c).lerp(fog, 0.35);
            for (let i = 0; i <= cols; i++) {
                const a = (i / cols) * Math.PI * 2;
                const n = noise(
                    Math.cos(a) * 2.2 + layer.seed,
                    Math.sin(a) * 2.2,
                );
                const peak = i % 2 === 0 ? 1 : 0.82;
                const k =
                    layer.h[0] + (n * 0.5 + 0.5) * (layer.h[1] - layer.h[0]);
                const x = Math.cos(a) * radius;
                const z = Math.sin(a) * radius;
                positions.push(x, -radius * 0.12, z, x, radius * k * peak, z);
                colors.push(low.r, low.g, low.b, c.r, c.g, c.b);
            }
            for (let i = 0; i < cols; i++) {
                const a = start + i * 2;
                // Faces point inwards (towards the camera at the centre).
                index.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
            }
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute(
            'position',
            new THREE.BufferAttribute(new Float32Array(positions), 3),
        );
        geo.setAttribute(
            'color',
            new THREE.BufferAttribute(new Float32Array(colors), 3),
        );
        geo.setIndex(index);
        this.kit.own(geo);
        const mat = this.kit.material(
            'horizon',
            () =>
                new THREE.MeshBasicMaterial({
                    vertexColors: true,
                    fog: false,
                    side: THREE.DoubleSide,
                }),
        );
        const ring = new THREE.Mesh(geo, mat);
        ring.frustumCulled = false;
        ring.renderOrder = -9;
        ring.position.set(
            this.field.centerX,
            this.field.minHeight,
            this.field.centerZ,
        );
        this.group.add(ring);
        this.horizon = ring;
    }

    /** Height-shaped ground grid: flat near the road, hills further out. */
    private buildTerrain(): void {
        const th = this.theme;
        const f = this.field;
        const cell = this.coarse ? 14 : 10;
        const margin = 150;
        const grid = f.buildGrid(cell, margin, 90);
        const noise = valueNoise(17);
        const wall = barrierOffset(this.track);
        const geo = new THREE.PlaneGeometry(
            (grid.cols - 1) * cell,
            (grid.rows - 1) * cell,
            grid.cols - 1,
            grid.rows - 1,
        );
        geo.rotateX(-Math.PI / 2);
        geo.translate(
            grid.x0 + ((grid.cols - 1) * cell) / 2,
            0,
            grid.z0 + ((grid.rows - 1) * cell) / 2,
        );
        const pos = geo.getAttribute('position') as THREE.BufferAttribute;
        const colors = new Float32Array(pos.count * 3);
        const c0 = new THREE.Color(th.ground[0]);
        const c1 = new THREE.Color(th.ground[1]);
        const c2 = new THREE.Color(th.ground[2]);
        const tmp = new THREE.Color();
        const hillAmp = th.id === 'beach' ? 3 : th.id === 'forest' ? 14 : 8;
        const seaN = this.seaNormal();
        for (let i = 0; i < pos.count; i++) {
            const x = pos.getX(i);
            const z = pos.getZ(i);
            const d = sampleGrid(grid, grid.dist, x, z);
            const roadH = sampleGrid(grid, grid.height, x, z);
            const n = noise(x / 45, z / 45);
            const out = smoothstep(wall + 8, wall + 60, d);
            let y = roadH - 0.5 + out * (n * 0.5 + 0.5) * hillAmp;
            if (seaN) {
                // Slopes down into the sea on the sea side.
                const s = this.seaDistance(x, z);
                if (s < 0) {
                    y = Math.min(y, roadH - 0.5 + s * 0.12);
                }
            }
            pos.setY(i, y);
            tmp.copy(c0).lerp(c1, n * 0.5 + 0.5);
            tmp.lerp(c2, 1 - smoothstep(wall, wall + 14, d));
            if (seaN && this.seaDistance(x, z) < 6 && th.id !== 'forest') {
                tmp.set('#f1d595');
            }
            colors[i * 3] = tmp.r;
            colors[i * 3 + 1] = tmp.g;
            colors[i * 3 + 2] = tmp.b;
        }
        geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geo.computeVertexNormals();
        this.add(geo, this.kit.vertexLambert(), false, 220);
        this.terrainGrid = { grid, noise, hillAmp, wall };
    }

    private terrainGrid: {
        grid: ReturnType<TrackField['buildGrid']>;
        noise: (x: number, z: number) => number;
        hillAmp: number;
        wall: number;
    } | null = null;

    /** Terrain height at (x, z) (same formula as the ground mesh). */
    groundAt(x: number, z: number): number {
        const t = this.terrainGrid;
        if (!t) {
            return 0;
        }
        const d = sampleGrid(t.grid, t.grid.dist, x, z);
        const roadH = sampleGrid(t.grid, t.grid.height, x, z);
        const out = smoothstep(t.wall + 8, t.wall + 60, d);
        let y =
            roadH -
            0.5 +
            out * (t.noise(x / 45, z / 45) * 0.5 + 0.5) * t.hillAmp;
        if (this.theme.sea) {
            const s = this.seaDistance(x, z);
            if (s < 0) {
                y = Math.min(y, roadH - 0.5 + s * 0.12);
            }
        }
        return y;
    }

    distAt(x: number, z: number): number {
        const t = this.terrainGrid;
        return t ? sampleGrid(t.grid, t.grid.dist, x, z) : 999;
    }

    /** Direction (unit x/z) toward the sea, or null when no sea. */
    private seaNormal(): [number, number] | null {
        if (!this.theme.sea) {
            return null;
        }
        // Beach: sea to the -z side; mandalika: +x side.
        return this.theme.id === 'beach' ? [0, -1] : [1, 0];
    }

    private seaEdgeValue: number | null = null;

    /** Shore line: furthest track point along the sea normal + margin. */
    private seaEdge(): number {
        if (this.seaEdgeValue === null) {
            const n = this.seaNormal() ?? [1, 0];
            let max = -Infinity;
            for (const [x, z] of this.track.samples) {
                max = Math.max(max, x * n[0] + z * n[1]);
            }
            this.seaEdgeValue = max + (this.theme.id === 'beach' ? 24 : 40);
        }
        return this.seaEdgeValue;
    }

    /** Signed distance before the shore line (negative = under water). */
    private seaDistance(x: number, z: number): number {
        const n = this.seaNormal();
        if (!n) {
            return 999;
        }
        const v = x * n[0] + z * n[1];
        const along = x * -n[1] + z * n[0];
        const wobble = Math.sin(along / 23) * 6;
        return this.seaEdge() + wobble - v;
    }

    private buildSea(): void {
        const n = this.seaNormal();
        if (!n) {
            return;
        }
        const f = this.field;
        const tex = waveTexture(this.kit, this.theme.seaColor);
        tex.repeat.set(40, 40);
        const mat = this.kit.material(
            'sea',
            () =>
                new THREE.MeshLambertMaterial({
                    map: tex,
                    transparent: true,
                    opacity: 0.94,
                }),
        );
        const size = this.radius * 4;
        const geo = this.kit.geometry('sea-plane', () =>
            new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
        );
        const sea = new THREE.Mesh(geo, mat);
        sea.scale.set(size, 1, size);
        const y = f.minHeight - 1.1;
        const far = this.seaEdge() + size / 2 - 10;
        const cx = n[0] !== 0 ? n[0] * far : f.centerX;
        const cz = n[1] !== 0 ? n[1] * far : f.centerZ;
        sea.position.set(cx, y, cz);
        sea.receiveShadow = false;
        this.group.add(sea);
        this.sea = sea;
        this.animated.push({ tex, speed: [0.004, 0.012] });
    }

    private buildClouds(): void {
        if (!this.theme.clouds) {
            return;
        }
        const bake = new Bake();
        const rnd = seededRandom(91);
        const f = this.field;
        const count = 12;
        void f;
        for (let i = 0; i < count; i++) {
            const a = rnd() * Math.PI * 2;
            // Local to the camera-following group, inside the far plane.
            const r = this.far * (0.45 + rnd() * 0.3);
            const x = Math.cos(a) * r;
            const z = Math.sin(a) * r;
            const y = this.far * 0.22 + rnd() * this.far * 0.1;
            for (let k = 0; k < 4; k++) {
                const s = 8 + rnd() * 8;
                bake.add(
                    this.shapes.sphere(0),
                    '#ffffff',
                    compose(
                        x + (k - 1.5) * s * 0.9,
                        y + rnd() * 3,
                        z + rnd() * 4,
                        0,
                        0,
                        0,
                        s,
                        s * 0.6,
                        s,
                    ),
                );
            }
        }
        const g = bake.build();
        if (g) {
            this.kit.own(g);
            const mat = this.kit.material(
                'cloud',
                () =>
                    new THREE.MeshBasicMaterial({
                        vertexColors: true,
                        fog: false,
                    }),
            );
            const m = new THREE.Mesh(g, mat);
            m.frustumCulled = false;
            this.clouds = new THREE.Group();
            this.clouds.add(m);
            this.group.add(this.clouds);
        }
    }

    /**
     * Vegetation: every copy is baked into per-tile static meshes together
     * with the props (one draw call per visible tile instead of one per
     * plant type and tile; tiles out of view are frustum culled).
     */
    private instanced(
        geometry: THREE.BufferGeometry,
        material: THREE.Material,
        matrices: THREE.Matrix4[],
        colors?: THREE.Color[],
        cast = true,
    ): void {
        void material;
        void colors;
        void cast;
        for (const m of matrices) {
            this.scatter.addColored(geometry, m);
        }
    }

    private scatter = new Bake();
    private flushing = false;

    private flushScatter(): void {
        this.flushing = true;
        this.add(this.scatter.build(), this.kit.vertexToon(), true, 220);
        this.flushing = false;
    }

    /** Scatter positions near the road on the terrain. */
    private spots(
        count: number,
        min: number,
        max: number,
        seed: number,
        avoidSea = true,
    ): { x: number; y: number; z: number; d: number }[] {
        const rnd = seededRandom(seed);
        const wall = barrierOffset(this.track);
        return this.field
            .scatter(
                count,
                wall + min,
                wall + max,
                max,
                rnd,
                (x, z, near) =>
                    (avoidSea ? this.seaDistance(x, z) > 8 : true) &&
                    // Clear corridor on bends: the chase camera swings out
                    // there, keep scenery >= 6 m past the barrier.
                    (near.dist > wall + 6 ||
                        near.index < 0 ||
                        Math.abs(this.field.curvature(near.index)) < 0.015),
            )
            .map((p) => ({
                x: p.x,
                y: this.groundAt(p.x, p.z),
                z: p.z,
                d: p.near.dist,
            }));
    }

    private palmGeometry(): THREE.BufferGeometry {
        return this.kit.geometry('palm', () => {
            const b = new Bake();
            const sh = this.shapes;
            for (let i = 0; i < 6; i++) {
                const y = i * 1.1;
                b.add(
                    sh.cylinder(5, true),
                    i % 2 ? '#9c6b3c' : '#b07c48',
                    compose(
                        i * 0.12,
                        y + 0.55,
                        0,
                        0,
                        0,
                        -0.08,
                        0.28 - i * 0.02,
                        1.12,
                        0.28 - i * 0.02,
                    ),
                );
            }
            for (let k = 0; k < 6; k++) {
                const a = (k / 6) * Math.PI * 2;
                b.addOutlined(
                    sh.box(),
                    k % 2 ? '#2f9a3c' : '#3fb24a',
                    compose(
                        0.75 + Math.cos(a) * 1.4,
                        6.6,
                        Math.sin(a) * 1.4,
                        -a,
                        0,
                        0.45,
                        3.0,
                        0.08,
                        0.7,
                    ),
                    0.03,
                );
            }
            b.addOutlined(
                sh.sphere(0),
                '#6b4a22',
                compose(0.75, 6.5, 0, 0, 0, 0, 0.35),
                0.02,
            );
            return b.build() ?? new THREE.BufferGeometry();
        });
    }

    private jungleTreeGeometry(): THREE.BufferGeometry {
        return this.kit.geometry('jungle-tree', () => {
            const b = new Bake();
            const sh = this.shapes;
            b.add(
                sh.cylinder(5, true),
                '#6b4424',
                compose(0, 3, 0, 0, 0, 0, 0.45, 6, 0.45),
            );
            b.addOutlined(
                sh.sphere(0),
                '#2f8a2a',
                compose(0, 7, 0, 0.4, 0, 0, 3.2, 2.6, 3.2),
                0.07,
            );
            b.add(
                sh.sphere(0),
                '#3fa236',
                compose(0.9, 8.6, 0.5, 1.1, 0, 0, 2.3, 1.9, 2.3),
            );
            b.add(
                sh.sphere(0),
                '#4cb83e',
                compose(-0.6, 9.6, -0.4, 2, 0, 0, 1.6, 1.4, 1.6),
            );
            return b.build() ?? new THREE.BufferGeometry();
        });
    }

    private pineGeometry(): THREE.BufferGeometry {
        return this.kit.geometry('pine', () => {
            const b = new Bake();
            const sh = this.shapes;
            b.add(
                sh.cylinder(5, true),
                '#5e3a1d',
                compose(0, 1.2, 0, 0, 0, 0, 0.35, 2.4, 0.35),
            );
            for (let i = 0; i < 3; i++) {
                b.addOutlined(
                    sh.cone(7),
                    i === 1 ? '#2a7a35' : '#23692d',
                    compose(
                        0,
                        3 + i * 1.8,
                        0,
                        0,
                        0,
                        0,
                        2.6 - i * 0.6,
                        3,
                        2.6 - i * 0.6,
                    ),
                    0.06,
                );
            }
            return b.build() ?? new THREE.BufferGeometry();
        });
    }

    private bushGeometry(): THREE.BufferGeometry {
        return this.kit.geometry('bush', () => {
            const b = new Bake();
            const sh = this.shapes;
            b.addOutlined(
                sh.sphere(0),
                '#3c9c2e',
                compose(0, 0.5, 0, 0, 0, 0, 1.1, 0.8, 1.1),
                0.04,
            );
            b.add(
                sh.sphere(0),
                '#4cb43a',
                compose(0.7, 0.4, 0.3, 1, 0, 0, 0.7, 0.6, 0.7),
            );
            // Fern leaves.
            for (let k = 0; k < 3; k++) {
                const a = (k / 3) * Math.PI * 2;
                b.add(
                    sh.box(),
                    '#2f8a2a',
                    compose(
                        Math.cos(a) * 0.9,
                        0.35,
                        Math.sin(a) * 0.9,
                        -a,
                        0,
                        0.5,
                        1.5,
                        0.05,
                        0.35,
                    ),
                );
            }
            return b.build() ?? new THREE.BufferGeometry();
        });
    }

    private treeMatrices(
        spots: { x: number; y: number; z: number }[],
        min: number,
        max: number,
        seed: number,
    ): THREE.Matrix4[] {
        const rnd = seededRandom(seed);
        return spots.map((s) => {
            const k = min + rnd() * (max - min);
            return compose(s.x, s.y - 0.2, s.z, rnd() * Math.PI * 2, 0, 0, k);
        });
    }

    private buildForest(): void {
        const many = this.coarse ? 120 : 250;
        const tv = this.kit.vertexToon();
        const jungle = this.spots(Math.round(many * 0.6), 4, 70, 3);
        this.instanced(
            this.jungleTreeGeometry(),
            tv,
            this.treeMatrices(jungle, 0.8, 1.35, 4),
        );
        const pines = this.spots(Math.round(many * 0.4), 10, 90, 5);
        this.instanced(
            this.pineGeometry(),
            tv,
            this.treeMatrices(pines, 1, 1.7, 6),
        );
        const bushes = this.spots(this.coarse ? 50 : 120, 1.2, 18, 7);
        this.instanced(
            this.bushGeometry(),
            tv,
            this.treeMatrices(bushes, 0.7, 1.4, 8),
            undefined,
            false,
        );

        // Baked props: mushrooms, rocks, tiki totems, waterfall cliff.
        const b = new Bake();
        const sh = this.shapes;
        const rnd = seededRandom(12);
        for (const s of this.spots(this.coarse ? 14 : 30, 1.5, 12, 13)) {
            const k = 0.6 + rnd() * 0.9;
            b.addOutlined(
                sh.cylinder(6),
                '#f4ead2',
                compose(
                    s.x,
                    s.y + 0.4 * k,
                    s.z,
                    0,
                    0,
                    0,
                    0.18 * k,
                    0.8 * k,
                    0.18 * k,
                ),
                0.025,
            );
            b.addOutlined(
                sh.ball(8, 4),
                rnd() > 0.5 ? '#e0322c' : '#f08a24',
                compose(
                    s.x,
                    s.y + 0.85 * k,
                    s.z,
                    0,
                    0,
                    0,
                    0.6 * k,
                    0.32 * k,
                    0.6 * k,
                ),
                0.03,
            );
            b.add(
                sh.sphere(0),
                '#ffffff',
                compose(s.x + 0.2 * k, s.y + 1.05 * k, s.z, 0, 0, 0, 0.1 * k),
            );
        }
        for (const s of this.spots(this.coarse ? 12 : 30, 2, 30, 14)) {
            const k = 0.8 + rnd() * 2;
            b.addOutlined(
                sh.dodeca(),
                rnd() > 0.5 ? '#8f9198' : '#767a82',
                compose(
                    s.x,
                    s.y + k * 0.3,
                    s.z,
                    rnd() * 3,
                    rnd(),
                    0,
                    k,
                    k * 0.7,
                    k,
                ),
                0.05,
            );
        }
        const wall = barrierOffset(this.track);
        let n = 0;
        for (const [x, , z, h] of this.field.along(70, -(wall + 3.5), 30)) {
            const y = this.groundAt(x, z);
            const ry = Math.PI / 2 - h + Math.PI / 2;
            const colors = ['#c0662a', '#2fa3a0', '#e0b030'];
            for (let k = 0; k < 3; k++) {
                b.addOutlined(
                    sh.box(),
                    colors[(k + n) % 3],
                    compose(x, y + 0.75 + k * 1.4, z, ry, 0, 0, 1.2, 1.3, 1.0),
                    0.05,
                );
                b.add(
                    sh.box(),
                    '#1d2238',
                    compose(
                        x + Math.cos(ry) * 0.0,
                        y + 0.95 + k * 1.4,
                        z,
                        ry,
                        0,
                        0,
                        0.8,
                        0.22,
                        1.05,
                    ),
                );
                b.add(
                    sh.box(),
                    '#ffffff',
                    compose(
                        x,
                        y + 0.55 + k * 1.4,
                        z,
                        ry,
                        0,
                        0,
                        0.6,
                        0.12,
                        1.06,
                    ),
                );
            }
            n++;
        }
        this.add(b.build(), this.kit.vertexToon(), true);

        // Waterfall into a pond, away from the road.
        const spot = this.spots(1, 40, 60, 21)[0];
        if (spot) {
            const tex = waterfallTexture(this.kit);
            this.animated.push({ tex, speed: [0, 0.6] });
            const cliff = new Bake();
            cliff.addOutlined(
                sh.box(),
                '#7b7f86',
                compose(spot.x, spot.y + 7, spot.z - 1.5, 0, 0, 0, 14, 14, 3),
                0.08,
            );
            this.add(cliff.build(), this.kit.vertexToon());
            const fall = new THREE.Mesh(
                this.kit.geometry('plane', () => new THREE.PlaneGeometry(1, 1)),
                this.kit.material(
                    'waterfall',
                    () => new THREE.MeshBasicMaterial({ map: tex }),
                ),
            );
            fall.scale.set(6, 13, 1);
            fall.position.set(spot.x, spot.y + 6.5, spot.z + 0.05);
            this.group.add(fall);
            const pond = new THREE.Mesh(
                this.kit.geometry('disc', () =>
                    new THREE.CircleGeometry(1, 24).rotateX(-Math.PI / 2),
                ),
                this.kit.material(
                    'pond',
                    () => new THREE.MeshLambertMaterial({ color: '#3fb8e8' }),
                ),
            );
            pond.scale.setScalar(6);
            pond.position.set(spot.x, spot.y + 0.15, spot.z + 4);
            this.group.add(pond);
        }
    }

    private buildBeach(): void {
        const tv = this.kit.vertexToon();
        const palms = this.spots(this.coarse ? 60 : 120, 3, 55, 31, false);
        this.instanced(
            this.palmGeometry(),
            tv,
            this.treeMatrices(palms, 0.85, 1.3, 32),
        );
        const bushes = this.spots(this.coarse ? 30 : 60, 2, 30, 33);
        this.instanced(
            this.bushGeometry(),
            tv,
            this.treeMatrices(bushes, 0.6, 1.1, 34),
            undefined,
            false,
        );

        const b = new Bake();
        const sh = this.shapes;
        const rnd = seededRandom(35);
        // Beach huts.
        for (const s of this.spots(this.coarse ? 8 : 16, 6, 26, 36)) {
            const ry = rnd() * Math.PI * 2;
            b.addOutlined(
                sh.box(),
                '#d9a35c',
                compose(s.x, s.y + 1.3, s.z, ry, 0, 0, 3.2, 2.6, 3.2),
                0.05,
            );
            b.addOutlined(
                sh.cone(4),
                '#c8a24a',
                compose(
                    s.x,
                    s.y + 3.4,
                    s.z,
                    ry + Math.PI / 4,
                    0,
                    0,
                    3.2,
                    1.8,
                    3.2,
                ),
                0.05,
            );
            b.add(
                sh.box(),
                '#5b3a22',
                compose(s.x, s.y + 0.9, s.z, ry, 0, 0, 1.0, 1.8, 3.25),
            );
        }
        // Umbrellas, surfboards, towels.
        const stripes = ['#e0322c', '#ffffff', '#1e88e5', '#ffcf2e'];
        for (const s of this.spots(this.coarse ? 12 : 26, 2, 20, 37, false)) {
            const col = stripes[Math.floor(rnd() * stripes.length)];
            b.addOutlined(
                sh.cylinder(6),
                '#f4f4f4',
                compose(s.x, s.y + 1.2, s.z, 0, 0, 0, 0.05, 2.4, 0.05),
                0.01,
            );
            b.addPainted(
                sh.cone(8),
                (t) => (Math.floor(t / 2) % 2 ? '#ffffff' : col),
                compose(s.x, s.y + 2.5, s.z, rnd() * 3, 0, 0, 1.5, 0.55, 1.5),
            );
            const a = rnd() * Math.PI * 2;
            b.addOutlined(
                sh.ball(6, 4),
                stripes[Math.floor(rnd() * 4)],
                compose(s.x + 1.6, s.y + 1.0, s.z, a, 0.25, 0, 0.32, 1.1, 0.07),
                0.02,
            );
            b.add(
                sh.box(),
                stripes[Math.floor(rnd() * 4)],
                compose(
                    s.x - 1.3,
                    s.y + 0.05,
                    s.z + 0.5,
                    a,
                    0,
                    0,
                    0.9,
                    0.04,
                    1.8,
                ),
            );
        }
        // Pier near the ramp, out over the water.
        const r = this.track.ramps[0];
        if (r) {
            const [x, , z] = this.track.world(r.s + 30, 0);
            const deck = this.field.minHeight - 0.2;
            for (let i = 0; i < 9; i++) {
                const pz = this.field.maxZ + 18 + i * 4;
                b.addOutlined(
                    sh.box(),
                    '#a87444',
                    compose(x, deck, pz, 0, 0, 0, 3.5, 0.2, 3.8),
                    0.03,
                );
                for (const sx of [-1.6, 1.6]) {
                    b.addOutlined(
                        sh.cylinder(6),
                        '#7a4f2a',
                        compose(x + sx, deck - 1.2, pz, 0, 0, 0, 0.16, 3, 0.16),
                        0.02,
                    );
                }
            }
            void z;
        }
        this.add(b.build(), tv, true);
    }

    private buildMandalika(): void {
        const tv = this.kit.vertexToon();
        const sh = this.shapes;
        const palms = this.spots(this.coarse ? 50 : 100, 22, 70, 41);
        this.instanced(
            this.palmGeometry(),
            tv,
            this.treeMatrices(palms, 0.9, 1.4, 42),
        );
        const bushes = this.spots(this.coarse ? 25 : 50, 20, 45, 43);
        this.instanced(
            this.bushGeometry(),
            tv,
            this.treeMatrices(bushes, 0.6, 1.0, 44),
            undefined,
            false,
        );

        const t = this.track;
        const wall = barrierOffset(t);
        const b = new Bake();
        // Grandstands along the start straight (right side) and pit building (left).
        for (const side of [1, -1]) {
            for (let p = -60; p <= 60; p += side > 0 ? 24 : 30) {
                const [x, y, z] = t.world(
                    p,
                    side * (wall + (side > 0 ? 8 : 10)),
                );
                const h = t.headingAt(p);
                const ry = Math.PI / 2 - h;
                if (side > 0) {
                    for (let k = 0; k < 5; k++) {
                        const off = side * (k * 1.4);
                        b.addOutlined(
                            sh.box(),
                            k % 2 ? '#d8262c' : '#f4f4f4',
                            compose(
                                x - Math.sin(h) * off,
                                y + 0.6 + k * 0.9,
                                z + Math.cos(h) * off,
                                ry,
                                0,
                                0,
                                22,
                                0.9 + k * 0,
                                1.4,
                            ),
                            0.04,
                        );
                    }
                    b.addOutlined(
                        sh.box(),
                        '#d8dde4',
                        compose(
                            x - Math.sin(h) * 8,
                            y + 7.5,
                            z + Math.cos(h) * 8,
                            ry,
                            -0.12,
                            0,
                            23,
                            0.3,
                            9,
                        ),
                        0.05,
                    );
                    for (const e of [-10, 10]) {
                        b.addOutlined(
                            sh.box(),
                            '#8a9099',
                            compose(
                                x - Math.sin(h) * 8 + Math.cos(h) * e,
                                y + 3.8,
                                z + Math.cos(h) * 8 + Math.sin(h) * e,
                                ry,
                                0,
                                0,
                                0.4,
                                7.5,
                                0.4,
                            ),
                            0.03,
                        );
                    }
                } else {
                    b.addOutlined(
                        sh.box(),
                        '#eef1f5',
                        compose(x, y + 2.2, z, ry, 0, 0, 28, 4.4, 9),
                        0.06,
                    );
                    b.addOutlined(
                        sh.box(),
                        '#2c3442',
                        compose(x, y + 4.6, z, ry, 0, 0, 29, 0.5, 10),
                        0.05,
                    );
                    for (let g = -3; g <= 3; g++) {
                        const gx =
                            x + Math.cos(h) * g * 3.8 + -Math.sin(h) * -4.55;
                        const gz =
                            z + Math.sin(h) * g * 3.8 + Math.cos(h) * -4.55;
                        b.add(
                            sh.box(),
                            '#3a3f4a',
                            compose(gx, y + 1.5, gz, ry, 0, 0, 3.0, 2.8, 0.1),
                        );
                    }
                }
            }
        }
        // Extra grandstands on the outside of long straights.
        for (let p = 100; p < t.length - 70; p += 95) {
            const side = t.curvature(p) > 0 ? -1 : 1;
            const [x, y, z] = t.world(p, side * (wall + 7));
            const h = t.headingAt(p);
            const ry = Math.PI / 2 - h;
            for (let k = 0; k < 4; k++) {
                const off = side * k * 1.4;
                b.addOutlined(
                    sh.box(),
                    k % 2 ? '#d8262c' : '#f4f4f4',
                    compose(
                        x - Math.sin(h) * off,
                        y + 0.6 + k * 0.9,
                        z + Math.cos(h) * off,
                        ry,
                        0,
                        0,
                        16,
                        0.9,
                        1.4,
                    ),
                    0.04,
                );
            }
            b.addOutlined(
                sh.box(),
                '#d8dde4',
                compose(
                    x - Math.sin(h) * side * 6,
                    y + 6,
                    z + Math.cos(h) * side * 6,
                    ry,
                    0,
                    0,
                    17,
                    0.3,
                    7,
                ),
                0.05,
            );
        }
        // Lombok hills: the horizon ring (buildHorizon) draws them.
        this.add(b.build(), tv, true);

        // Billboards and Indonesian flag banners along the track.
        const words: [string, string, string, string | null][] = [
            ['EDUFUNHUB', '#1e5bd8', '#ffffff', '#ffcf2e'],
            ['MANDALIKA', '#ffffff', '#d8262c', '#d8262c'],
        ];
        const plane = this.kit.geometry(
            'plane',
            () => new THREE.PlaneGeometry(1, 1),
        );
        const mats = words.map(([word, bg, fg, stripe]) => {
            const tex = billboardTexture(this.kit, word, bg, fg, stripe);
            return this.kit.material(
                `bb-${word}`,
                () =>
                    new THREE.MeshLambertMaterial({
                        map: tex,
                        side: THREE.FrontSide,
                    }),
            );
        });
        const posts = new Bake();
        let n = 0;
        for (let p = 20; p < t.length - 10; p += 55) {
            const side = n % 2 ? 1 : -1;
            const off = side * (wall + 2.5);
            const [x, y, z] = t.world(p, off);
            const h = t.headingAt(p);
            const board = new THREE.Mesh(plane, mats[n % 2]);
            board.scale.set(9, 2.2, 1);
            board.position.set(x, y + 2.4, z);
            // Face the road (towards the centre line).
            board.lookAt(
                x + Math.sin(h) * side * 10,
                y + 2.4,
                z - Math.cos(h) * side * 10,
            );
            this.group.add(board);
            posts.add(
                sh.box(),
                '#2c3442',
                compose(
                    x - Math.sin(h) * side * 0.08,
                    y + 2.4,
                    z + Math.cos(h) * side * 0.08,
                    Math.PI / 2 - h,
                    0,
                    0,
                    9.2,
                    2.4,
                    0.12,
                ),
            );
            for (const e of [-3.5, 3.5]) {
                posts.add(
                    sh.box(),
                    '#5d6470',
                    compose(
                        x + Math.cos(h) * e,
                        y + 0.7,
                        z + Math.sin(h) * e,
                        0,
                        0,
                        0,
                        0.15,
                        1.4,
                        0.15,
                    ),
                );
            }
            n++;
        }
        this.add(posts.build(), tv);
        const flags = new Bake();
        for (const [x, y, z] of this.field.along(36, -(wall + 1.8), 10)) {
            flags.addOutlined(
                sh.cylinder(6),
                '#d7dbe2',
                compose(x, y + 2.5, z, 0, 0, 0, 0.06, 5, 0.06),
                0.01,
            );
            flags.add(
                sh.box(),
                '#e0262c',
                compose(x + 0.0, y + 4.6, z + 0.55, 0, 0, 0, 0.03, 0.5, 1.1),
            );
            flags.add(
                sh.box(),
                '#ffffff',
                compose(x + 0.0, y + 4.1, z + 0.55, 0, 0, 0, 0.03, 0.5, 1.1),
            );
        }
        this.add(flags.build(), tv);
    }

    update(time: number, cameraX: number, cameraZ: number): void {
        for (const a of this.animated) {
            a.tex.offset.set((time * a.speed[0]) % 1, (time * a.speed[1]) % 1);
        }
        if (this.sea) {
            this.sea.position.y =
                this.field.minHeight - 1.1 + Math.sin(time * 0.8) * 0.12;
        }
        // Sky, horizon and clouds follow the camera (always inside the far
        // plane, horizon never empty).
        this.sky?.position.set(cameraX, 0, cameraZ);
        this.horizon?.position.set(cameraX, this.field.minHeight, cameraZ);
        if (this.clouds) {
            this.clouds.rotation.y = time * 0.004;
            this.clouds.position.set(cameraX, 0, cameraZ);
        }
    }
}
