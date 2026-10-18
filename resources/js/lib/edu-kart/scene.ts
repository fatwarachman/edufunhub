/**
 * EduKart 3D scene (Crash Team Racing style): owns the renderer, camera,
 * ResizeObserver and every GPU resource. The page calls `render(view)` from
 * its own requestAnimationFrame loop; nothing here schedules frames.
 */
import * as THREE from 'three';
import type {
    Hazard,
    ItemKind,
    Projectile,
    RaceEvent,
    RacerInfo,
} from './protocol';
import { Environment } from './scene-env';
import { TrackField } from './scene-field';
import { Effects } from './scene-fx';
import { KartFactory, type KartModel } from './scene-karts';
import { Bake, compose, Kit, Shapes } from './scene-kit';
import { bankLift, bankRoll, sweep } from './scene-strip';
import {
    laneColors,
    racerColor,
    seededRandom,
    stripOptionLetter,
} from './scene-text';
import {
    crateTexture,
    frameTexture,
    labelTexture,
    nitroTexture,
    questionTexture,
    tntTexture,
    zoneTexture,
} from './scene-textures';
import { themeFor } from './scene-theme';
import {
    barrierOffset,
    RAMP_HEIGHT,
    rampVisualLift,
    TrackMeshes,
} from './scene-track';
import type {
    EduKartSceneApi,
    EduKartSceneFactory,
    SceneGate,
    SceneKart,
    SceneOptions,
    SceneView,
} from './scene-types';
import type { Track } from './track';

interface KartActor {
    racer: number;
    key: string;
    model: KartModel;
    shield: THREE.Mesh | null;
    tnt: THREE.Mesh | null;
    juice: THREE.Mesh | null;
    flame: THREE.Mesh | null;
    spin: number;
    pos: THREE.Vector3;
    forward: THREE.Vector3;
    /** Road height under the kart (blob shadow). */
    ground: number;
    seen: boolean;
    /** Built as the viewer's kart (separate turning head). */
    viewer: boolean;
}

interface GateBoxes {
    id: string;
    group: THREE.Group;
    boxes: THREE.Mesh[];
    glows: THREE.Mesh[];
    /** Pulsing yellow outline frames (aim highlight), one per box. */
    frames: THREE.Mesh[];
    textures: THREE.Texture[];
    materials: THREE.Material[];
    zone: THREE.Mesh[];
    lanes: number[];
    width: number;
    broken: Set<number>;
    resultShown: boolean;
}

const UP = new THREE.Vector3(0, 1, 0);

class EduKartScene implements EduKartSceneApi {
    private renderer: THREE.WebGLRenderer;
    private scene = new THREE.Scene();
    private camera: THREE.PerspectiveCamera;
    private resize: ResizeObserver;
    private kit = new Kit();
    private shapes: Shapes;
    private field: TrackField;
    private env: Environment;
    private trackMeshes: TrackMeshes;
    private fx: Effects;
    private karts: KartFactory;
    private actors = new Map<number, KartActor>();
    private racers: RacerInfo[] = [];
    private sun: THREE.DirectionalLight;
    private rim: THREE.DirectionalLight;
    private fruit: THREE.InstancedMesh;
    /** Roadside floating '?' crates near the gates (one draw call). */
    private decor: THREE.InstancedMesh;
    private decorSpots: [number, number, number][] = [];
    private fruitHidden = new Set<number>();
    private projectiles = new Map<number, THREE.Object3D>();
    private hazards = new Map<number, THREE.Object3D>();
    private gate: GateBoxes | null = null;
    private questionSign: THREE.Group;
    private lastTime = -1;
    private camPos = new THREE.Vector3();
    private camLook = new THREE.Vector3();
    private camReady = false;
    private shake = 0;
    private portrait = false;
    private viewer = 0;
    private disposed = false;
    private random = seededRandom(1234);
    private tmp = new THREE.Vector3();
    private tmp2 = new THREE.Vector3();
    private matrix = new THREE.Matrix4();
    private shadows: boolean;
    private fogFar: number;
    /** Dirt / sand road: karts kick up dust. */
    private dusty: boolean;
    private dustColor: string;

    constructor(
        private host: HTMLElement,
        private track: Track,
        private options: SceneOptions,
    ) {
        const coarse = options.coarse;
        this.shadows = !coarse;
        this.renderer = new THREE.WebGLRenderer({
            antialias: !coarse,
            powerPreference: 'high-performance',
        });
        this.renderer.setPixelRatio(
            Math.min(window.devicePixelRatio || 1, coarse ? 1.25 : 2),
        );
        this.renderer.shadowMap.enabled = this.shadows;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.domElement.style.display = 'block';
        this.renderer.domElement.style.touchAction = 'none';
        this.renderer.domElement.setAttribute('data-testid', 'edu-kart-canvas');
        host.appendChild(this.renderer.domElement);
        this.kit.anisotropy = Math.min(
            coarse ? 2 : 8,
            this.renderer.capabilities.getMaxAnisotropy(),
        );

        const theme = themeFor(track.theme);
        this.dusty = theme.id !== 'mandalika';
        this.dustColor = theme.id === 'beach' ? '#f1dfb0' : '#c99a62';
        this.shapes = new Shapes(this.kit);
        this.field = new TrackField(track);
        // Phones: fog closes in at ~140 m and the far plane follows it.
        const fogNear = coarse ? Math.min(theme.fogNear, 50) : theme.fogNear;
        this.fogFar = coarse ? 140 : theme.fogFar;
        const far = coarse ? 200 : theme.fogFar + 120;
        this.camera = new THREE.PerspectiveCamera(62, 1, 0.3, far);
        this.scene.background = new THREE.Color(theme.skyHorizon);
        this.scene.fog = new THREE.Fog(theme.fog, fogNear, this.fogFar);

        this.scene.add(
            new THREE.HemisphereLight(
                theme.hemiSky,
                theme.hemiGround,
                theme.hemiIntensity,
            ),
        );
        this.sun = new THREE.DirectionalLight(theme.sun, theme.sunIntensity);
        this.sun.position.set(40, 80, 25);
        if (this.shadows) {
            this.sun.castShadow = true;
            this.sun.shadow.mapSize.set(1024, 1024);
            // Tight box around the player kart (follows it, see updateCamera).
            const c = this.sun.shadow.camera;
            c.left = -28;
            c.right = 28;
            c.top = 28;
            c.bottom = -28;
            c.near = 20;
            c.far = 140;
            this.sun.shadow.bias = -0.0006;
            this.sun.shadow.normalBias = 0.03;
        }
        this.scene.add(this.sun, this.sun.target);
        // Cool rim / back light (no shadows) so karts pop off the road.
        this.rim = new THREE.DirectionalLight('#bfe4ff', 0.9);
        this.rim.position.set(-40, 30, -40);
        this.scene.add(this.rim, this.rim.target);

        this.env = new Environment(
            this.kit,
            this.shapes,
            track,
            this.field,
            theme,
            coarse,
            this.shadows,
            far,
        );
        this.scene.add(this.env.group);
        this.trackMeshes = new TrackMeshes(
            this.kit,
            this.shapes,
            track,
            this.field,
            theme,
            this.shadows,
        );
        this.scene.add(this.trackMeshes.group);
        this.fx = new Effects(this.kit, coarse, options.reducedMotion);
        this.scene.add(this.fx.group);
        this.karts = new KartFactory(this.kit, this.shapes, this.shadows);
        this.scene.add(this.karts.group);
        this.fruit = this.buildFruit();
        this.decor = this.buildDecorCrates();
        this.questionSign = this.buildQuestionSign();
        this.scene.add(this.questionSign);

        this.resize = new ResizeObserver(() => this.fit());
        this.resize.observe(host);
        this.fit();
    }

    private fit(): void {
        const w = Math.max(1, this.host.clientWidth);
        const h = Math.max(1, this.host.clientHeight);
        this.renderer.setSize(w, h, false);
        this.renderer.domElement.style.width = `${w}px`;
        this.renderer.domElement.style.height = `${h}px`;
        this.camera.aspect = w / h;
        this.portrait = h > w * 1.1;
        this.camera.updateProjectionMatrix();
        this.fx.setScale(h * this.renderer.getPixelRatio() * 0.9);
    }

    // ----- static extras ---------------------------------------------------

    private buildFruit(): THREE.InstancedMesh {
        const geo = this.kit.geometry('wumpa', () => {
            const b = new Bake();
            b.addOutlined(
                this.shapes.ball(8, 6),
                '#ff9a1f',
                compose(0, 0, 0, 0, 0, 0, 0.32, 0.36, 0.32),
                0.03,
            );
            b.add(
                this.shapes.ball(6, 4),
                '#ffd36b',
                compose(0.1, 0.12, 0.2, 0, 0, 0, 0.12),
            );
            b.add(
                this.shapes.cone(5),
                '#3fae3a',
                compose(0, 0.42, 0, 0, 0.3, 0, 0.08, 0.2, 0.08),
            );
            return b.build() ?? new THREE.BufferGeometry();
        });
        const mesh = new THREE.InstancedMesh(
            geo,
            this.kit.vertexToon(),
            Math.max(1, this.track.fruits.length),
        );
        mesh.count = this.track.fruits.length;
        this.track.fruits.forEach((f, i) => {
            const [x, y, z] = this.track.world(f.s, f.lateral);
            mesh.setMatrixAt(i, compose(x, y + 1, z));
        });
        // Fruit: blob-free and shadow-free (one draw call, no shadow pass).
        mesh.castShadow = false;
        mesh.computeBoundingSphere();
        this.scene.add(mesh);
        return mesh;
    }

    /**
     * A few decorative floating '?' power-up crates on both roadsides
     * before every gate (CTR flair), instanced: one draw call.
     */
    private buildDecorCrates(): THREE.InstancedMesh {
        const t = this.track;
        const side = t.halfWidth + 2.2;
        for (const g of t.gates) {
            for (const off of [-46, -22]) {
                for (const s of [-1, 1]) {
                    this.decorSpots.push(t.world(g + off + s * 3, s * side));
                }
            }
        }
        const tex = crateTexture(this.kit);
        const mat = this.kit.material(
            'decor-crate',
            () =>
                new THREE.MeshToonMaterial({
                    map: tex,
                    gradientMap: this.kit.gradient,
                    color: '#ffd9a0',
                    emissive: new THREE.Color('#5a3210'),
                    emissiveIntensity: 0.25,
                }),
        );
        const mesh = new THREE.InstancedMesh(
            this.shapes.box(),
            mat,
            Math.max(1, this.decorSpots.length),
        );
        // Phones skip the decoration (draw-call budget).
        mesh.count = this.options.coarse ? 0 : this.decorSpots.length;
        mesh.visible = !this.options.coarse;
        mesh.frustumCulled = false;
        this.placeDecor(mesh, 0);
        this.scene.add(mesh);
        return mesh;
    }

    private placeDecor(mesh: THREE.InstancedMesh, time: number): void {
        const still = this.options.reducedMotion;
        this.decorSpots.forEach(([x, y, z], i) => {
            const bob = still ? 0 : Math.sin(time * 2 + i) * 0.15;
            const spin = still ? i : time * 1.2 + i;
            mesh.setMatrixAt(
                i,
                compose(x, y + 1.3 + bob, z, spin, 0.15, 0.1, 0.95),
            );
        });
        mesh.instanceMatrix.needsUpdate = true;
    }

    private buildQuestionSign(): THREE.Group {
        const g = new THREE.Group();
        const hw = this.track.halfWidth;
        const b = new Bake();
        const span = hw + 2;
        for (const s of [-1, 1]) {
            b.addOutlined(
                this.shapes.cylinder(8),
                '#7b2fd0',
                compose(s * span, 2.6, 0, 0, 0, 0, 0.25, 5.2, 0.25),
                0.03,
            );
        }
        b.addOutlined(
            this.shapes.box(),
            '#ffcf2e',
            compose(0, 5.3, 0, 0, 0, 0, span * 2 + 0.6, 0.5, 0.5),
            0.03,
        );
        const geo = b.build();
        if (geo) {
            this.kit.own(geo);
            g.add(new THREE.Mesh(geo, this.kit.vertexToon()));
        }
        const tex = questionTexture(this.kit);
        const disc = new THREE.Mesh(
            this.kit.geometry('disc-v', () => new THREE.CircleGeometry(1, 28)),
            this.kit.material(
                'question',
                () =>
                    new THREE.MeshBasicMaterial({
                        map: tex,
                        side: THREE.DoubleSide,
                    }),
            ),
        );
        disc.scale.setScalar(1.3);
        disc.position.set(0, 6.8, 0);
        g.add(disc);
        g.userData.disc = disc;
        g.visible = false;
        return g;
    }

    // ----- racers ----------------------------------------------------------

    setRacers(racers: RacerInfo[]): void {
        this.racers = Array.isArray(racers) ? racers : [];
        for (const info of this.racers) {
            const actor = this.actors.get(info.racer);
            if (actor && actor.key !== this.actorKey(info)) {
                this.removeActor(actor);
                this.actors.delete(info.racer);
            }
        }
    }

    private actorKey(info: RacerInfo | undefined): string {
        if (!info) {
            return 'none';
        }
        let look = '';
        try {
            look = JSON.stringify(info.character ?? null).slice(0, 400);
        } catch {
            look = '';
        }
        return `${info.vehicle}|${info.color}|${info.bot_no}|${look}`;
    }

    private actorFor(racer: number): KartActor {
        let actor = this.actors.get(racer);
        if (actor) {
            return actor;
        }
        const info = this.racers.find((r) => r.racer === racer);
        const model = this.karts.build(
            info?.vehicle ?? 'classic',
            racerColor(info?.color, racer),
            info?.character ?? null,
            info?.bot ? Math.max(1, info.bot_no || racer) : 0,
            // Phones: no separate head mesh (saves a draw call).
            racer === this.viewer && !this.options.coarse,
        );
        this.scene.add(model.root);
        actor = {
            racer,
            key: this.actorKey(info),
            model,
            shield: null,
            tnt: null,
            juice: null,
            flame: null,
            spin: 0,
            pos: new THREE.Vector3(),
            forward: new THREE.Vector3(1, 0, 0),
            ground: 0,
            seen: false,
            viewer: racer === this.viewer && !this.options.coarse,
        };
        this.actors.set(racer, actor);
        return actor;
    }

    private removeActor(actor: KartActor): void {
        actor.model.root.removeFromParent();
        actor.model.geometry.dispose();
        actor.model.farGeometry.dispose();
        actor.model.headGeometry?.dispose();
        actor.model.flameGeometry.dispose();
    }

    private extra(
        actor: KartActor,
        key: 'shield' | 'tnt' | 'juice' | 'flame',
    ): THREE.Mesh {
        const existing = actor[key];
        if (existing) {
            return existing;
        }
        let mesh: THREE.Mesh;
        if (key === 'shield') {
            mesh = new THREE.Mesh(
                this.shapes.ball(12, 8),
                this.kit.material(
                    'shield',
                    () =>
                        new THREE.MeshBasicMaterial({
                            color: '#6fd8ff',
                            transparent: true,
                            opacity: 0.28,
                            depthWrite: false,
                            blending: THREE.AdditiveBlending,
                        }),
                ),
            );
            mesh.scale.set(1.5, 1.3, 1.9);
            mesh.position.y = 0.8;
        } else if (key === 'tnt') {
            const tex = this.tntTex();
            mesh = new THREE.Mesh(
                this.shapes.box(),
                this.kit.material(
                    'tnt-head',
                    () =>
                        new THREE.MeshToonMaterial({
                            map: tex,
                            gradientMap: this.kit.gradient,
                        }),
                ),
            );
            mesh.scale.setScalar(0.55);
            const top = actor.model.headTop;
            mesh.position.set(top.x, top.y + 0.2, top.z);
        } else if (key === 'juice') {
            mesh = new THREE.Mesh(
                this.kit.geometry('ring', () =>
                    new THREE.RingGeometry(0.8, 1.25, 28).rotateX(-Math.PI / 2),
                ),
                this.kit.glow('#ffd23a', 0.55),
            );
            mesh.scale.set(1.2, 1, 1.6);
            mesh.position.y = 0.1;
        } else {
            mesh = new THREE.Mesh(
                this.kit.geometry('flame', () =>
                    new THREE.ConeGeometry(0.22, 1.2, 10)
                        .rotateX(-Math.PI / 2)
                        .translate(0, 0, -0.6),
                ),
                this.kit.glow('#ff8a1a', 0.9),
            );
            const e = actor.model.exhausts[0];
            mesh.position.set(e.x, e.y, e.z);
        }
        actor.model.body.add(mesh);
        actor[key] = mesh;
        return mesh;
    }

    /**
     * Unit box with two material groups (sides, then the +z / -z faces):
     * two draw calls per answer box instead of six.
     */
    private twoGroupBox(): THREE.BufferGeometry {
        return this.kit.geometry('box-2groups', () => {
            const g = new THREE.BoxGeometry(1, 1, 1);
            g.clearGroups();
            g.addGroup(0, 24, 0);
            g.addGroup(24, 12, 1);
            return g;
        });
    }

    private frameTex(): THREE.Texture {
        const kit = this.kit;
        const holder = kit.material('frame-tex-holder', () => {
            const m = new THREE.MeshBasicMaterial();
            m.map = frameTexture(kit);
            return m;
        });
        return holder.map as THREE.Texture;
    }

    private tntTex(): THREE.Texture {
        const kit = this.kit;
        const cached = kit.material('tnt-tex-holder', () => {
            const m = new THREE.MeshBasicMaterial();
            m.map = tntTexture(kit);
            return m;
        });
        return cached.map as THREE.Texture;
    }

    private placeKart(k: SceneKart, dt: number, time: number): void {
        const actor = this.actorFor(k.racer);
        const m = actor.model;
        const t = this.track;
        const [x, y, z] = t.world(k.p, k.d);
        const h = t.headingAt(k.p);
        const lift = rampVisualLift(t, k.p);
        const hover = m.hover ? 0.35 + Math.sin(time * 4 + k.racer) * 0.06 : 0;
        const bank = bankLift(t, k.p, k.d);
        m.root.position.set(x, y + bank + Math.max(0, k.y) + lift + hover, z);
        actor.ground = y + bank + lift;
        const slope = (t.height(k.p + 1) - t.height(k.p - 1)) / 2;
        let rampPitch = 0;
        for (const r of t.ramps) {
            const into = t.wrap(t.wrap(k.p) - (r.s - r.len));
            if (into <= r.len && k.y <= 0.05) {
                rampPitch = Math.atan(RAMP_HEIGHT / r.len);
            }
        }
        const drift = k.drifting ? k.drift_dir * 0.45 : 0;
        const yaw = h + k.psi;
        m.root.rotation.set(
            -Math.atan(slope) - rampPitch,
            Math.PI / 2 - yaw,
            k.y > 0.3 ? 0 : -bankRoll(t, k.p, k.d),
            'YXZ',
        );
        // Body: drift yaw offset + roll, stun spin.
        if (k.stunned) {
            actor.spin += dt * 14;
        } else {
            actor.spin *= Math.max(0, 1 - dt * 10);
        }
        m.body.rotation.set(
            0,
            -drift + actor.spin,
            k.drifting ? -k.drift_dir * 0.08 : 0,
            'YXZ',
        );
        const steer = Math.max(-0.5, Math.min(0.5, -k.psi * 0.8 - drift * 0.5));
        for (const s of m.steer) {
            s.rotation.y = steer;
        }
        const spin = (k.v * dt) / Math.max(0.2, m.wheelRadius);
        for (const w of m.wheels) {
            w.rotation.x += spin;
        }
        actor.pos.copy(m.root.position);
        actor.forward.set(Math.cos(yaw), 0, Math.sin(yaw));
        actor.seen = true;

        // Status extras.
        if (k.shield || actor.shield) {
            const s = this.extra(actor, 'shield');
            s.visible = k.shield;
        }
        if (k.tnt || actor.tnt) {
            const tnt = this.extra(actor, 'tnt');
            tnt.visible = k.tnt;
            if (k.tnt) {
                const blink = Math.sin(time * 14) > 0;
                (tnt.material as THREE.MeshToonMaterial).emissive.set(
                    blink ? '#ff3a1a' : '#000000',
                );
                // Sits on the driver's head, wobbling a little.
                const wobble = this.options.reducedMotion ? 0 : 1;
                tnt.rotation.set(
                    Math.sin(time * 9 + actor.racer) * 0.12 * wobble,
                    Math.sin(time * 3) * 0.25 * wobble,
                    Math.cos(time * 8 + actor.racer) * 0.12 * wobble,
                );
                // Bottom face sinks slightly into the hair (no visible gap).
                tnt.position.y =
                    actor.model.headTop.y +
                    0.2 +
                    Math.abs(Math.sin(time * 9)) * 0.04 * wobble;
            }
        }
        if (k.juiced || actor.juice) {
            const j = this.extra(actor, 'juice');
            j.visible = k.juiced;
            j.rotation.y = time * 2;
        }
        const flame = m.flame;
        flame.visible = k.boosting;
        if (k.boosting) {
            const flicker = this.options.reducedMotion
                ? 1
                : 0.8 + Math.random() * 0.5;
            flame.scale.set(1, 1, flicker);
        }
        if (m.head) {
            // Head turns into the steer (3/4 view of the face from the
            // chase cam) and leans with the drift.
            const turn = this.options.reducedMotion ? 0.5 : 1;
            const target = Math.max(-0.55, Math.min(0.55, steer * 1.1)) * turn;
            m.head.rotation.y +=
                (target - m.head.rotation.y) * Math.min(1, dt * 8);
            m.head.rotation.z = k.drifting ? k.drift_dir * 0.08 : 0;
        }
        this.emitKart(actor, k, dt);
    }

    private emitKart(actor: KartActor, k: SceneKart, dt: number): void {
        const m = actor.model;
        m.root.updateMatrixWorld(true);
        const world = m.body.matrixWorld;
        const fwd = actor.forward;
        if (Math.abs(k.v) > 4 && k.y < 0.3) {
            const dark = k.drifting && k.charge >= 0.7;
            const rate = k.drifting ? 26 : 5;
            for (const r of m.rear) {
                this.tmp.copy(r).applyMatrix4(world);
                const px = this.tmp.x;
                const py = this.tmp.y;
                const pz = this.tmp.z;
                this.fx.trail('soft', rate, dt, () => ({
                    x: px,
                    y: py + 0.1,
                    z: pz,
                    vx: -fwd.x * 2,
                    vy: 0.8,
                    vz: -fwd.z * 2,
                    spread: 0.6,
                    life: 0.7,
                    size: 0.35,
                    size1: dark ? 1.1 : 0.9,
                    color: dark ? '#6a6a74' : '#eeeef2',
                    alpha: dark ? 0.4 : 0.32,
                    drag: 2,
                }));
                if (k.drifting && k.charge > 0.25) {
                    // CTR turbo stages: blue, orange, purple.
                    const color =
                        k.charge >= 1
                            ? '#c45cff'
                            : k.charge >= 0.7
                              ? '#ff8a1a'
                              : '#4fb5ff';
                    this.fx.trail('glow', 30, dt, () => ({
                        x: px,
                        y: py + 0.05,
                        z: pz,
                        vx: -fwd.x * 3,
                        vy: 2.5,
                        vz: -fwd.z * 3,
                        spread: 2,
                        life: 0.3,
                        size: 0.32,
                        size1: 0.05,
                        color,
                        gravity: 12,
                    }));
                }
            }
        }
        if (Math.abs(k.v) > 2 && !k.boosting && !m.hover) {
            // Little grey exhaust puffs while driving.
            for (const e of m.exhausts) {
                this.tmp.copy(e).applyMatrix4(world);
                const px = this.tmp.x;
                const py = this.tmp.y;
                const pz = this.tmp.z;
                this.fx.trail('soft', 3, dt, () => ({
                    x: px,
                    y: py,
                    z: pz,
                    vx: -fwd.x * 1.5,
                    vy: 0.9,
                    vz: -fwd.z * 1.5,
                    spread: 0.3,
                    life: 0.6,
                    size: 0.2,
                    size1: 0.6,
                    color: '#c8c8d0',
                    alpha: 0.35,
                    drag: 1.5,
                }));
            }
        }
        if (this.dusty && Math.abs(k.v) > 8 && k.y < 0.3 && !m.hover) {
            // Dirt / sand kicked up behind the rear wheels.
            const dust = this.dustColor;
            for (const r of m.rear) {
                this.tmp.copy(r).applyMatrix4(world);
                const px = this.tmp.x;
                const py = this.tmp.y;
                const pz = this.tmp.z;
                this.fx.trail('soft', 6, dt, () => ({
                    x: px,
                    y: py + 0.15,
                    z: pz,
                    vx: -fwd.x * 3,
                    vy: 1.4,
                    vz: -fwd.z * 3,
                    spread: 0.8,
                    life: 0.8,
                    size: 0.4,
                    size1: 1.3,
                    color: dust,
                    alpha: 0.4,
                    drag: 2.2,
                }));
            }
        }
        const fast = Math.abs(k.v) > 24;
        if (
            (k.boosting || fast) &&
            !this.options.reducedMotion &&
            actor.racer === this.viewer
        ) {
            // Speed lines streaming past the camera.
            const cam = this.camera.position;
            this.fx.trail('glow', k.boosting ? 50 : 25, dt, () => {
                const a = this.random() * Math.PI * 2;
                const r = 2 + this.random() * 2.5;
                return {
                    x: cam.x + fwd.x * 8 + Math.cos(a) * r * -fwd.z,
                    y: cam.y - 0.5 + Math.sin(a) * r * 0.7,
                    z: cam.z + fwd.z * 8 + Math.cos(a) * r * fwd.x,
                    vx: -fwd.x * 40,
                    vz: -fwd.z * 40,
                    life: 0.18,
                    size: 0.12,
                    color: '#ffffff',
                    alpha: 0.7,
                };
            });
        }
        if (k.boosting) {
            for (const e of m.exhausts) {
                this.tmp.copy(e).applyMatrix4(world);
                const px = this.tmp.x;
                const py = this.tmp.y;
                const pz = this.tmp.z;
                this.fx.trail('glow', 40, dt, () => ({
                    x: px,
                    y: py,
                    z: pz,
                    vx: -fwd.x * 6,
                    vy: 0.5,
                    vz: -fwd.z * 6,
                    spread: 0.6,
                    life: 0.25,
                    size: 0.7,
                    size1: 0.15,
                    color: this.random() > 0.5 ? '#ffb02e' : '#4fc3ff',
                }));
            }
        }
        if (m.hover) {
            this.tmp.set(0, 0.1, 0).applyMatrix4(world);
            const px = this.tmp.x;
            const py = this.tmp.y;
            const pz = this.tmp.z;
            this.fx.trail('glow', 10, dt, () => ({
                x: px,
                y: py,
                z: pz,
                spread: 0.8,
                life: 0.3,
                size: 0.5,
                size1: 0.1,
                color: '#3ee8ff',
            }));
        }
    }

    // ----- gate ------------------------------------------------------------

    private clearGate(): void {
        const g = this.gate;
        if (!g) {
            return;
        }
        g.group.removeFromParent();
        for (const t of g.textures) {
            t.dispose();
        }
        for (const m of g.materials) {
            m.dispose();
        }
        for (const z of g.zone) {
            z.geometry.dispose();
        }
        this.gate = null;
    }

    private buildGate(gate: SceneGate): GateBoxes {
        const t = this.track;
        const n = Math.max(
            1,
            gate.labels.length || (gate.kind === 'tf' ? 2 : 4),
        );
        const [lanes, width] = t.answerLanes(n);
        const colors = laneColors(gate.kind, n);
        const group = new THREE.Group();
        const boxes: THREE.Mesh[] = [];
        const glows: THREE.Mesh[] = [];
        const frames: THREE.Mesh[] = [];
        const textures: THREE.Texture[] = [];
        const materials: THREE.Material[] = [];
        const crate = this.kit.material('crate-side', () => {
            const tex = crateTexture(this.kit);
            return new THREE.MeshToonMaterial({
                map: tex,
                gradientMap: this.kit.gradient,
            });
        });
        const boxW = width * 0.86;
        const boxH = Math.min(4.2, boxW * 1.05 + 0.8);
        const h = t.headingAt(gate.at);
        for (let i = 0; i < n; i++) {
            const raw = gate.labels[i] ?? '';
            const label = gate.kind === 'choice' ? stripOptionLetter(raw) : raw;
            const badge =
                gate.kind === 'choice' ? String.fromCharCode(65 + i) : null;
            const tf = gate.kind === 'tf' && n === 2 ? i === 0 : null;
            const tex = labelTexture(
                this.kit,
                label,
                colors[i],
                badge,
                tf,
                boxW / boxH,
            );
            textures.push(tex);
            const face = new THREE.MeshBasicMaterial({ map: tex });
            const tint = new THREE.MeshToonMaterial({
                color: colors[i],
                gradientMap: this.kit.gradient,
                map: (crate.map as THREE.Texture) ?? null,
            });
            materials.push(face, tint);
            // Box faces: +x, -x, +y, -y, +z (forward), -z (towards karts).
            const box = new THREE.Mesh(this.twoGroupBox(), [tint, face]);
            const [x, y, z] = t.world(gate.at, lanes[i]);
            box.position.set(x, y + boxH / 2 + 0.6, z);
            // Deep crate (reads as a 3D '?' box, not a flat card).
            box.scale.set(boxW, boxH, Math.min(2.4, boxW * 0.85));
            box.rotation.y = Math.PI / 2 - h;
            box.userData.ry = box.rotation.y;
            group.add(box);
            boxes.push(box);
            const glowMat = new THREE.MeshBasicMaterial({
                color: '#ffffff',
                transparent: true,
                opacity: 0,
                depthWrite: false,
                blending: THREE.AdditiveBlending,
            });
            materials.push(glowMat);
            const glow = new THREE.Mesh(this.shapes.box(), glowMat);
            glow.position.copy(box.position);
            glow.rotation.copy(box.rotation);
            glow.scale.set(
                boxW * 1.12,
                boxH * 1.12,
                Math.min(2.4, boxW * 0.85) * 1.12,
            );
            group.add(glow);
            glows.push(glow);
            // Aim highlight: yellow frame just in front of the face that
            // looks at the karts (keeps the label readable, no white wash).
            const frameMat = new THREE.MeshBasicMaterial({
                map: this.frameTex(),
                transparent: true,
                depthWrite: false,
                side: THREE.DoubleSide,
                fog: false,
            });
            materials.push(frameMat);
            const frame = new THREE.Mesh(
                this.kit.geometry('plane', () => new THREE.PlaneGeometry(1, 1)),
                frameMat,
            );
            frame.position.z = -0.52;
            frame.rotation.y = Math.PI;
            frame.scale.set(1.14, 1.14, 1);
            frame.visible = false;
            box.add(frame);
            frames.push(frame);
        }
        // Reading zone: one crisp lane stripe per box with chevrons
        // pointing at it, only inside the zone.
        const zone: THREE.Mesh[] = [];
        const from = Math.min(gate.zone, gate.at - 2);
        if (gate.at - from > 1) {
            lanes.forEach((d, i) => {
                const mat = this.kit.material(`zone-${colors[i]}`, () => {
                    const zt = zoneTexture(this.kit, colors[i]);
                    return new THREE.MeshBasicMaterial({
                        map: zt,
                        transparent: true,
                        alphaTest: 0.5,
                        polygonOffset: true,
                        polygonOffsetFactor: -4,
                        polygonOffsetUnits: -4,
                    });
                });
                const half = Math.min(width * 0.36, 1.6);
                const geo = sweep(
                    t,
                    [
                        { d: d - half, y: 0.06, u: 0 },
                        { d: d + half, y: 0.06, u: 1 },
                    ],
                    { from, to: gate.at - 1.2, step: 2, vPerMetre: 1 / 4 },
                );
                const mesh = new THREE.Mesh(geo, mat);
                group.add(mesh);
                zone.push(mesh);
            });
        }
        this.scene.add(group);
        // Question arch at the zone start.
        const [qx, qy, qz] = t.world(from, 0);
        this.questionSign.position.set(qx, qy, qz);
        this.questionSign.rotation.y = Math.PI / 2 - t.headingAt(from);
        return {
            id: gate.id,
            group,
            boxes,
            glows,
            frames,
            textures,
            materials,
            zone,
            lanes,
            width,
            broken: new Set(),
            resultShown: false,
        };
    }

    private updateGate(gate: SceneGate | null, time: number): void {
        if (!gate) {
            this.clearGate();
            this.questionSign.visible = false;
            return;
        }
        if (
            !this.gate ||
            this.gate.id !== gate.id ||
            this.gate.boxes.length !==
                Math.max(1, gate.labels.length || (gate.kind === 'tf' ? 2 : 4))
        ) {
            this.clearGate();
            this.gate = this.buildGate(gate);
        }
        const g = this.gate;
        this.questionSign.visible = !gate.result;
        const disc = this.questionSign.userData.disc as
            THREE.Object3D | undefined;
        if (disc) {
            disc.rotation.y = time * 1.5;
        }
        g.boxes.forEach((box, i) => {
            const glow = g.glows[i];
            const mat = glow.material as THREE.MeshBasicMaterial;
            const bob = this.options.reducedMotion
                ? 0
                : Math.sin(time * 2 + i) * 0.18;
            box.position.y =
                this.track.world(gate.at, g.lanes[i])[1] +
                box.scale.y / 2 +
                0.25 +
                bob;
            // Floating '?' crate: bob + small wobble, label keeps facing
            // the karts (no full spin).
            if (!this.options.reducedMotion) {
                const ry = (box.userData.ry as number) ?? box.rotation.y;
                box.rotation.y = ry + Math.sin(time * 1.3 + i * 1.7) * 0.1;
                box.rotation.z = Math.sin(time * 1.7 + i) * 0.04;
                glow.rotation.copy(box.rotation);
            }
            glow.position.y = box.position.y;
            if (gate.result) {
                const isAnswer =
                    gate.result.answer === i ||
                    (gate.result.correct && gate.result.choice === i);
                const isHit = gate.result.choice === i;
                if (isHit && !g.broken.has(i)) {
                    g.broken.add(i);
                    this.fx.crateBreak(
                        box.position.x,
                        box.position.y,
                        box.position.z,
                        gate.result.correct ? '#3dff6a' : '#ff3a3a',
                    );
                }
                box.visible = !g.broken.has(i);
                g.frames[i].visible = false;
                if (isAnswer) {
                    mat.color.set('#3dff6a');
                    mat.opacity = 0.45 + Math.sin(time * 8) * 0.15;
                    glow.visible = true;
                } else if (isHit && !gate.result.correct) {
                    mat.color.set('#ff3a3a');
                    mat.opacity = 0.55;
                    glow.visible = true;
                } else {
                    mat.opacity = 0;
                    glow.visible = false;
                }
            } else {
                box.visible = true;
                const aim = gate.aim === i;
                mat.opacity = 0;
                glow.visible = false;
                const frame = g.frames[i];
                frame.visible = aim;
                if (aim) {
                    const pulse = this.options.reducedMotion
                        ? 0
                        : Math.sin(time * 9);
                    frame.scale.set(1.12 + pulse * 0.03, 1.1 + pulse * 0.03, 1);
                    (frame.material as THREE.MeshBasicMaterial).opacity =
                        0.8 + pulse * 0.2;
                }
                box.scale.x = g.width * 0.86;
            }
        });
    }

    private gateBoxPosition(choice: number): THREE.Vector3 | null {
        const g = this.gate;
        if (!g || choice < 0 || choice >= g.boxes.length) {
            return null;
        }
        return g.boxes[choice].position;
    }

    // ----- items -----------------------------------------------------------

    private rocketGeometry(): THREE.BufferGeometry {
        return this.kit.geometry('rocket', () => {
            const b = new Bake();
            const sh = this.shapes;
            b.addOutlined(
                sh.cylinder(10),
                '#e0322c',
                compose(0, 0, 0, 0, Math.PI / 2, 0, 0.2, 1.0, 0.2),
                0.025,
            );
            b.addOutlined(
                sh.cone(10),
                '#f4f4f4',
                compose(0, 0, 0.7, 0, Math.PI / 2, 0, 0.2, 0.4, 0.2),
                0.025,
            );
            for (let i = 0; i < 4; i++) {
                const a = (i / 4) * Math.PI * 2;
                b.addOutlined(
                    sh.box(),
                    '#ffcf2e',
                    compose(
                        Math.cos(a) * 0.22,
                        Math.sin(a) * 0.22,
                        -0.4,
                        0,
                        0,
                        a,
                        0.25,
                        0.04,
                        0.3,
                    ),
                    0.015,
                );
            }
            return b.build() ?? new THREE.BufferGeometry();
        });
    }

    private updateProjectiles(list: Projectile[], dt: number): void {
        const live = new Set<number>();
        const t = this.track;
        for (const pr of list) {
            live.add(pr.id);
            let obj = this.projectiles.get(pr.id);
            if (!obj) {
                const mesh = new THREE.Mesh(
                    this.rocketGeometry(),
                    this.kit.vertexToon(),
                );
                const flame = new THREE.Mesh(
                    this.kit.geometry('flame', () =>
                        new THREE.ConeGeometry(0.22, 1.2, 10)
                            .rotateX(-Math.PI / 2)
                            .translate(0, 0, -0.6),
                    ),
                    this.kit.glow('#ff8a1a', 0.9),
                );
                flame.position.z = -0.5;
                mesh.add(flame);
                obj = mesh;
                this.scene.add(obj);
                this.projectiles.set(pr.id, obj);
            }
            const [x, y, z] = t.world(pr.p, pr.d);
            const h = t.headingAt(pr.p);
            obj.position.set(
                x,
                y + Math.max(0.6, pr.y + 0.6) + rampVisualLift(t, pr.p),
                z,
            );
            obj.rotation.set(0, Math.PI / 2 - h, 0);
            obj.scale.setScalar(pr.juiced ? 1.4 : 1);
            const fx = Math.cos(h);
            const fz = Math.sin(h);
            const p = obj.position;
            this.fx.trail('soft', 30, dt, () => ({
                x: p.x - fx * 0.8,
                y: p.y,
                z: p.z - fz * 0.8,
                spread: 0.3,
                vy: 0.6,
                life: 0.6,
                size: 0.4,
                size1: 1.2,
                color: '#e8e8ea',
                alpha: 0.6,
            }));
        }
        for (const [id, obj] of this.projectiles) {
            if (!live.has(id)) {
                obj.removeFromParent();
                this.projectiles.delete(id);
            }
        }
    }

    private updateHazards(list: Hazard[], time: number): void {
        const live = new Set<number>();
        const t = this.track;
        for (const hz of list) {
            live.add(hz.id);
            let obj = this.hazards.get(hz.id);
            if (!obj) {
                const tnt = hz.kind === 'tnt';
                const tex = tnt ? this.tntTex() : nitroTexture(this.kit);
                const mat = this.kit.material(
                    tnt ? 'hz-tnt' : 'hz-nitro',
                    () =>
                        new THREE.MeshToonMaterial({
                            map: tex,
                            gradientMap: this.kit.gradient,
                            emissive: new THREE.Color(
                                tnt ? '#000000' : '#1fbf3a',
                            ),
                            emissiveIntensity: tnt ? 0 : 0.5,
                        }),
                );
                obj = new THREE.Mesh(this.shapes.box(), mat);
                obj.scale.setScalar(1.1);
                this.scene.add(obj);
                this.hazards.set(hz.id, obj);
            }
            const [x, y, z] = t.world(hz.p, hz.d);
            const bob =
                hz.kind === 'nitro' ? Math.sin(time * 4 + hz.id) * 0.1 : 0;
            obj.position.set(x, y + 0.6 + bob + rampVisualLift(t, hz.p), z);
            obj.rotation.y =
                Math.PI / 2 -
                t.headingAt(hz.p) +
                (hz.kind === 'nitro' ? time : 0);
        }
        for (const [id, obj] of this.hazards) {
            if (!live.has(id)) {
                obj.removeFromParent();
                this.hazards.delete(id);
            }
        }
    }

    // ----- events ----------------------------------------------------------

    effect(event: RaceEvent): void {
        if (this.disposed || !event || typeof event !== 'object') {
            return;
        }
        const actor =
            'racer' in event ? this.actors.get(event.racer) : undefined;
        const pos = actor?.seen ? actor.pos : null;
        switch (event.k) {
            case 'boom': {
                const [x, y, z] = this.track.world(event.p, event.d);
                this.fx.explosion(x, y + 0.8, z);
                if (pos && pos.distanceTo(this.camera.position) < 25) {
                    this.shake = Math.max(this.shake, 0.6);
                }
                break;
            }
            case 'hit':
                if (pos) {
                    if (event.blocked) {
                        this.fx.puff(pos.x, pos.y + 0.8, pos.z, '#6fd8ff');
                    } else {
                        this.fx.stars(pos.x, pos.y + 1.6, pos.z);
                        if (event.cause !== 'bump') {
                            this.fx.explosion(pos.x, pos.y + 0.6, pos.z, 2.2);
                        }
                    }
                    if (event.racer === this.viewer && !event.blocked) {
                        this.shake = Math.max(this.shake, 0.5);
                    }
                }
                break;
            case 'fire':
                if (pos && event.racer !== this.viewer) {
                    this.fx.puff(pos.x, pos.y + 0.8, pos.z);
                }
                break;
            case 'answer':
                if (event.racer === this.viewer) {
                    const box = this.gateBoxPosition(event.choice);
                    if (
                        box &&
                        this.gate &&
                        !this.gate.broken.has(event.choice)
                    ) {
                        this.gate.broken.add(event.choice);
                        this.fx.crateBreak(
                            box.x,
                            box.y,
                            box.z,
                            event.correct ? '#3dff6a' : '#ff3a3a',
                        );
                    }
                }
                break;
            case 'lap':
            case 'finish':
                if (event.racer === this.viewer) {
                    const [x, y, z] = this.track.world(0, 0);
                    if (event.k === 'finish') {
                        this.fx.confetti(x, y, z);
                    } else if (pos) {
                        this.fx.stars(pos.x, pos.y + 1.5, pos.z);
                    }
                }
                break;
            case 'start_boost':
                if (pos && actor) {
                    const f = actor.forward;
                    this.fx.burst('glow', 24, () => ({
                        x: pos.x - f.x * 1.3,
                        y: pos.y + 0.6,
                        z: pos.z - f.z * 1.3,
                        vx: -f.x * 6,
                        vz: -f.z * 6,
                        spread: 1.5,
                        life: 0.4,
                        size: 0.8,
                        size1: 0.1,
                        color: '#ff9a1f',
                    }));
                }
                break;
            default:
                break;
        }
    }

    localFire(item: ItemKind): void {
        const actor = this.actors.get(this.viewer);
        if (!actor?.seen) {
            return;
        }
        const p = actor.pos;
        const f = actor.forward;
        if (item === 'shield') {
            this.fx.puff(p.x, p.y + 0.8, p.z, '#6fd8ff');
        } else if (item === 'nos') {
            this.fx.puff(
                p.x - f.x * 1.4,
                p.y + 0.6,
                p.z - f.z * 1.4,
                '#ffb02e',
            );
        } else if (item === 'tnt') {
            this.fx.puff(p.x - f.x * 1.6, p.y + 0.5, p.z - f.z * 1.6);
        } else {
            this.fx.puff(p.x + f.x * 1.6, p.y + 0.9, p.z + f.z * 1.6);
        }
    }

    // ----- frame -----------------------------------------------------------

    render(view: SceneView): void {
        if (this.disposed) {
            return;
        }
        const time = Number.isFinite(view.time) ? view.time : 0;
        const dt =
            this.lastTime < 0
                ? 1 / 60
                : Math.min(0.1, Math.max(0, time - this.lastTime));
        this.lastTime = time;
        const karts = Array.isArray(view.karts) ? view.karts : [];
        this.viewer = view.you >= 0 ? view.you : (karts[0]?.racer ?? 0);

        const present = new Set<number>();
        for (const k of karts) {
            if (!k || !Number.isFinite(k.p) || !Number.isFinite(k.d)) {
                continue;
            }
            present.add(k.racer);
            const built = this.actors.get(k.racer);
            const wantViewer = k.racer === this.viewer && !this.options.coarse;
            if (built && built.viewer !== wantViewer) {
                this.removeActor(built);
                this.actors.delete(k.racer);
            }
            this.placeKart(k, dt, time);
        }
        for (const [racer, actor] of this.actors) {
            actor.model.root.visible = present.has(racer);
        }

        // Fruit (hide taken, spin + bob).
        const taken = new Set(Array.isArray(view.taken) ? view.taken : []);
        const spin = this.options.reducedMotion ? 0 : time * 2.5;
        this.track.fruits.forEach((f, i) => {
            const hide = taken.has(i);
            const [x, y, z] = this.track.world(f.s, f.lateral);
            const bob = this.options.reducedMotion
                ? 0
                : Math.sin(time * 3 + i * 0.7) * 0.12;
            this.matrix.copy(
                compose(x, y + 1 + bob, z, spin + i, 0, 0, hide ? 0.0001 : 1),
            );
            this.fruit.setMatrixAt(i, this.matrix);
            if (hide && !this.fruitHidden.has(i)) {
                this.fruitHidden.add(i);
                this.fx.burst('glow', 10, () => ({
                    x,
                    y: y + 1,
                    z,
                    spread: 2.5,
                    vy: 1.5,
                    life: 0.4,
                    size: 0.4,
                    size1: 0.05,
                    color: '#ffd23a',
                }));
            } else if (!hide) {
                this.fruitHidden.delete(i);
            }
        });
        this.fruit.instanceMatrix.needsUpdate = true;
        this.placeDecor(this.decor, time);

        this.updateGate(view.gate ?? null, time);
        this.updateProjectiles(
            Array.isArray(view.projectiles) ? view.projectiles : [],
            dt,
        );
        this.updateHazards(
            Array.isArray(view.hazards) ? view.hazards : [],
            time,
        );
        this.trackMeshes.update(time, view.lights ?? null);
        this.fx.update(dt);
        this.updateCamera(karts, dt, time);
        this.updateKartLod();
        this.env.update(time, this.camera.position.x, this.camera.position.z);
        this.renderer.render(this.scene, this.camera);
    }

    /**
     * Kart level of detail: full bake near the camera, ink-less low-poly
     * bake beyond `KART_LOD_NEAR`, hidden past the fog (`KART_LOD_HIDE`).
     * Then packs wheels + blob shadows into their instanced batches.
     */
    private updateKartLod(): void {
        const cam = this.camera.position;
        const hide = this.fogFar + 10;
        const list: { model: KartModel; ground: number; visible: boolean }[] =
            [];
        for (const actor of this.actors.values()) {
            const m = actor.model;
            const dist = m.root.position.distanceTo(cam);
            const own = actor.racer === this.viewer;
            // The viewer's own kart is never LOD-hidden or swapped.
            const shown = m.root.visible && (own || dist < hide);
            m.root.visible = shown;
            const near = own || dist < (this.options.coarse ? 35 : 60);
            m.near.visible = near;
            m.far.visible = !near;
            // Real shadow only for the viewer's kart; every kart has a blob.
            m.near.castShadow = this.shadows && actor.racer === this.viewer;
            list.push({ model: m, ground: actor.ground, visible: shown });
        }
        this.karts.sync(list);
    }

    private updateCamera(karts: SceneKart[], dt: number, time: number): void {
        const k = karts.find((x) => x.racer === this.viewer) ?? karts[0];
        const t = this.track;
        const p = k ? k.p : 0;
        const d = k ? k.d : 0;
        const [x, y, z] = t.world(p, d);
        const h = t.headingAt(p) + (k ? k.psi * 0.35 : 0);
        const fx = Math.cos(h);
        const fz = Math.sin(h);
        const back = this.portrait ? 6.2 : 5.4;
        const up = this.portrait ? 3.0 : 2.4;
        const ky = k ? Math.max(0, k.y) * 0.6 + rampVisualLift(t, p) : 0;
        this.tmp.set(x - fx * back, y + up + ky, z - fz * back);
        // Keep the camera above the terrain.
        this.tmp.y = Math.max(
            this.tmp.y,
            this.env.groundAt(this.tmp.x, this.tmp.z) + 1.2,
        );
        this.tmp2.set(x + fx * 6, y + 0.8 + ky * 0.5, z + fz * 6);
        if (!this.camReady) {
            this.camPos.copy(this.tmp);
            this.camLook.copy(this.tmp2);
            this.camReady = true;
        } else {
            const a = 1 - Math.exp(-dt * 7);
            this.camPos.lerp(this.tmp, a);
            this.camLook.lerp(this.tmp2, 1 - Math.exp(-dt * 10));
        }
        this.keepCameraClear(x, y + up * 0.8 + ky, z);
        this.camera.position.copy(this.camPos);
        const boosting = !!k?.boosting;
        if (!this.options.reducedMotion) {
            if (boosting) {
                this.shake = Math.max(this.shake, 0.12);
            }
            if (this.shake > 0.001) {
                const s = this.shake * 0.25;
                this.camera.position.x += Math.sin(time * 53) * s;
                this.camera.position.y += Math.sin(time * 61 + 1) * s;
                this.shake *= Math.max(0, 1 - dt * 6);
            }
        } else {
            this.shake = 0;
        }
        this.camera.up.copy(UP);
        this.camera.lookAt(this.camLook);
        const speed = k ? Math.min(1, Math.abs(k.v) / 28) : 0;
        const base = this.portrait ? 75 : 60;
        const fov = base + speed * 12 + (boosting ? 4 : 0);
        if (Math.abs(this.camera.fov - fov) > 0.05) {
            this.camera.fov += (fov - this.camera.fov) * Math.min(1, dt * 4);
            this.camera.updateProjectionMatrix();
        }
        // Rim light shines from ahead of the kart back toward the camera.
        this.rim.position.set(x + fx * 30, y + 18, z + fz * 30);
        this.rim.target.position.set(x, y, z);
        this.rim.target.updateMatrixWorld();
        if (this.shadows) {
            this.sun.position.set(x + 30, y + 70, z + 20);
            this.sun.target.position.set(x + fx * 12, y, z + fz * 12);
            this.sun.target.updateMatrixWorld();
        }
    }

    /**
     * Camera occlusion: scenery (trees, rocks, props) starts past the
     * barrier line, so a camera point that swings outside it on a bend is
     * pulled back toward the kart until it is over the road / shoulder.
     */
    private keepCameraClear(kx: number, ky: number, kz: number): void {
        const limit = barrierOffset(this.track) - 0.5;
        const c = this.camPos;
        let dist = this.field.nearest(c.x, c.z, 60).dist;
        if (dist <= limit) {
            return;
        }
        let lo = 0;
        let hi = 1;
        const probe = this.tmp2.clone();
        for (let i = 0; i < 6; i++) {
            const mid = (lo + hi) / 2;
            probe.set(kx + (c.x - kx) * mid, 0, kz + (c.z - kz) * mid);
            dist = this.field.nearest(probe.x, probe.z, 60).dist;
            if (dist <= limit) {
                lo = mid;
            } else {
                hi = mid;
            }
        }
        const k = Math.max(0.35, lo);
        c.set(
            kx + (c.x - kx) * k,
            Math.max(c.y, ky + 0.6),
            kz + (c.z - kz) * k,
        );
    }

    dispose(): void {
        if (this.disposed) {
            return;
        }
        this.disposed = true;
        this.resize.disconnect();
        this.clearGate();
        for (const actor of this.actors.values()) {
            this.removeActor(actor);
        }
        this.actors.clear();
        this.fx.dispose();
        const owned = new Set<THREE.Material | THREE.BufferGeometry>();
        this.scene.traverse((obj) => {
            if (obj instanceof THREE.Mesh || obj instanceof THREE.Points) {
                owned.add(obj.geometry);
                const mats = Array.isArray(obj.material)
                    ? obj.material
                    : [obj.material];
                for (const m of mats) {
                    owned.add(m);
                }
            }
            if (obj instanceof THREE.InstancedMesh) {
                obj.dispose();
            }
        });
        this.kit.dispose();
        for (const o of owned) {
            // Shared avatar caches live in model3d-kit; disposing is safe
            // (three re-uploads on next use) and frees this scene's GPU copies.
            o.dispose();
        }
        this.renderer.renderLists.dispose();
        this.renderer.dispose();
        this.renderer.domElement.remove();
    }
}

export const createEduKartScene: EduKartSceneFactory = (host, track, options) =>
    new EduKartScene(host, track, options);
