/**
 * three.js renderer for the classroom world. Pure presentation: Go sends
 * geometry, positions and chat; this draws the room, booths and avatars and
 * reports the local input direction (camera relative) back to the caller.
 *
 * Name badges and chat bubbles are DOM nodes in an overlay positioned from
 * projected 3D points. Text goes in with `textContent` only, so names and
 * chat from other players can never inject markup.
 */
import { type CharacterLook } from '@/lib/character/draw-character';
import * as THREE from 'three';
import { animateAvatar, type AvatarRig, buildAvatar } from './avatar';
import {
    type Booth,
    boothAt,
    nearestWithin,
    type PlayerTuple,
    predictStep,
    roomEntry,
    type RosterPlayer,
    viewRange,
    wallWindows,
    type WorldGeometry,
} from './protocol';

/** Teacher shown at the teacher desk while they are not in the room. */
export interface TeacherInfo {
    id: number;
    name: string;
    character: CharacterLook | null;
    x: number;
    z: number;
}

export interface NearbyActor {
    id: number;
    name: string;
    teacher: boolean;
}

export interface BoothInfo {
    title: string;
    accent: string;
    /** Standalone SVG markup of the game icon (drawn left of the title). */
    icon?: string;
}

interface Actor {
    id: number;
    name: string;
    rig: AvatarRig;
    target: THREE.Vector3;
    facing: number;
    speed: number;
    busy: string;
    badge: HTMLDivElement;
    bubble: HTMLDivElement;
    bubbleUntil: number;
    /** Unread direct messages from this person (shown when no bubble). */
    unread: number;
    emote: string | null;
    emoteAt: number;
    lookKey: string;
    teacher: boolean;
}

const WALL_H = 3.2;
const CAMERA_MIN = 4;
const BUBBLE_MS = 6000;

function boothSign(
    title: string,
    accent: string,
    icon?: string,
): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (ctx) {
        ctx.fillStyle = accent;
        ctx.beginPath();
        ctx.roundRect(4, 4, 504, 120, 28);
        ctx.fill();
        ctx.lineWidth = 8;
        ctx.strokeStyle = '#1f2a44';
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.font = '700 46px Fredoka, "DM Sans", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        // Icon badge on the left, title centred in the remaining space.
        const iconBox = icon ? 92 : 0;
        const maxText = 460 - iconBox;
        let text = title;
        while (ctx.measureText(text).width > maxText && text.length > 3) {
            text = `${text.slice(0, -2)}…`;
        }
        ctx.fillText(text, 256 + iconBox / 2, 66);
        if (icon) {
            ctx.fillStyle = 'rgba(255,255,255,0.22)';
            ctx.beginPath();
            ctx.arc(64, 64, 40, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    if (ctx && icon) {
        // SVG images decode asynchronously; repaint the texture when ready.
        const img = new Image();
        img.onload = () => {
            ctx.drawImage(img, 38, 38, 52, 52);
            tex.needsUpdate = true;
        };
        img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(icon)}`;
    }
    return tex;
}

function boardTexture(title: string): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 384;
    const ctx = canvas.getContext('2d');
    if (ctx) {
        ctx.fillStyle = '#2f5d50';
        ctx.fillRect(0, 0, 1024, 384);
        ctx.strokeStyle = '#c8a26b';
        ctx.lineWidth = 24;
        ctx.strokeRect(12, 12, 1000, 360);
        ctx.fillStyle = '#f4f1de';
        ctx.font = '700 64px Fredoka, "DM Sans", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        let text = title;
        while (ctx.measureText(text).width > 900 && text.length > 3) {
            text = `${text.slice(0, -2)}…`;
        }
        ctx.fillText(text, 512, 170);
        ctx.font = '500 34px "DM Sans", sans-serif';
        ctx.fillStyle = '#ffd93d';
        ctx.fillText('EduFunHub', 512, 270);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
}

function box(
    w: number,
    h: number,
    d: number,
    color: string,
    pos: [number, number, number],
): THREE.Mesh {
    const m = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, d),
        new THREE.MeshToonMaterial({ color }),
    );
    m.position.set(...pos);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
}

export class ClassroomScene {
    private renderer: THREE.WebGLRenderer;
    private scene = new THREE.Scene();
    private camera: THREE.PerspectiveCamera;
    private actors = new Map<number, Actor>();
    private clock = new THREE.Clock();
    private frame = 0;
    private yaw = Math.PI * 0.15;
    private pitch = 0.75;
    private distance = 9;
    private focus = new THREE.Vector3();
    private local = { x: 0, z: 0 };
    private localKnown = false;
    /** Last authoritative position of the local player. */
    private server = { x: 0, z: 0 };
    private input = { x: 0, z: 0 };
    private resize: ResizeObserver;
    private disposed = false;
    private reducedMotion: boolean;
    private boothMeshes: THREE.Object3D[] = [];
    private projected = new THREE.Vector3();
    /** Zoom limit; larger rooms (more seats) allow zooming further out. */
    private cameraMax: number;
    private teacher: TeacherInfo | null = null;
    /** Translated role tag for teacher badges ("Guru" / "Teacher"). */
    private teacherLabel = '';
    /** Static teacher avatar at the desk (only while the teacher is offline). */
    private staticTeacher: Actor | null = null;

    /** Called with the booth index the local player stands in (or -1). */
    onBooth: (index: number) => void = () => {};
    /** Tap on an unread count chip above a head (user id of that avatar). */
    onUnreadTap: (id: number) => void = () => {};

    constructor(
        private host: HTMLElement,
        private overlay: HTMLElement,
        private geometry: WorldGeometry,
        private meId: number,
        boothInfo: (booth: Booth) => BoothInfo,
        boardTitle: string,
    ) {
        this.reducedMotion =
            window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ??
            false;
        const mobile =
            window.matchMedia?.('(pointer: coarse)').matches ?? false;
        this.renderer = new THREE.WebGLRenderer({
            antialias: !mobile,
            powerPreference: 'high-performance',
        });
        this.renderer.setPixelRatio(
            Math.min(window.devicePixelRatio, mobile ? 1.5 : 2),
        );
        this.renderer.shadowMap.enabled = !mobile;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.domElement.style.display = 'block';
        this.renderer.domElement.style.touchAction = 'none';
        this.renderer.domElement.setAttribute(
            'data-testid',
            'classroom-world-canvas',
        );
        host.appendChild(this.renderer.domElement);

        const view = viewRange(geometry.room);
        this.cameraMax = view.cameraMax;
        this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, view.far);
        this.scene.background = new THREE.Color('#dff1ff');
        this.scene.fog = new THREE.Fog('#dff1ff', view.fogNear, view.fogFar);
        this.buildRoom(boothInfo, boardTitle);

        this.resize = new ResizeObserver(() => this.fit());
        this.resize.observe(host);
        this.fit();
        this.frame = requestAnimationFrame(this.tick);
    }

    private fit(): void {
        const w = Math.max(1, this.host.clientWidth);
        const h = Math.max(1, this.host.clientHeight);
        this.renderer.setSize(w, h, false);
        this.renderer.domElement.style.width = `${w}px`;
        this.renderer.domElement.style.height = `${h}px`;
        this.camera.aspect = w / h;
        this.camera.fov = w < 640 ? 60 : 50;
        this.camera.updateProjectionMatrix();
    }

    private buildRoom(
        boothInfo: (booth: Booth) => BoothInfo,
        boardTitle: string,
    ): void {
        const { room, desks, teacher_desk: teacher, booths } = this.geometry;
        const hw = room.w / 2;
        const hd = room.d / 2;

        this.scene.add(new THREE.HemisphereLight('#ffffff', '#c9b28f', 1.6));
        const sun = new THREE.DirectionalLight('#fff4e0', 1.6);
        sun.position.set(6, Math.max(14, hd), 8);
        sun.castShadow = true;
        const s = Math.max(hw, hd) + 2;
        sun.shadow.mapSize.setScalar(s > 20 ? 2048 : 1024);
        sun.shadow.camera.far = Math.max(50, s * 3);
        Object.assign(sun.shadow.camera, {
            left: -s,
            right: s,
            top: s,
            bottom: -s,
        });
        this.scene.add(sun);

        // Floor: wooden planks via a tiny canvas texture.
        const plank = document.createElement('canvas');
        plank.width = 128;
        plank.height = 128;
        const pctx = plank.getContext('2d');
        if (pctx) {
            for (let i = 0; i < 4; i++) {
                pctx.fillStyle = i % 2 ? '#e2b77d' : '#d9ab6f';
                pctx.fillRect(0, i * 32, 128, 32);
                pctx.fillStyle = 'rgba(80,50,20,0.25)';
                pctx.fillRect(0, i * 32 + 30, 128, 2);
                pctx.fillRect((i * 53) % 128, i * 32, 2, 32);
            }
        }
        const floorTex = new THREE.CanvasTexture(plank);
        floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
        floorTex.repeat.set(room.w / 2, room.d / 2);
        floorTex.colorSpace = THREE.SRGBColorSpace;
        const floor = new THREE.Mesh(
            new THREE.PlaneGeometry(room.w, room.d),
            new THREE.MeshToonMaterial({ map: floorTex }),
        );
        floor.rotation.x = -Math.PI / 2;
        floor.receiveShadow = true;
        this.scene.add(floor);

        // Walls: back and sides solid, front low so the camera can see in.
        const wall = '#fdf3d8';
        this.scene.add(
            box(room.w, WALL_H, 0.2, wall, [0, WALL_H / 2, -hd - 0.1]),
        );
        this.scene.add(
            box(0.2, WALL_H, room.d, wall, [-hw - 0.1, WALL_H / 2, 0]),
        );
        this.scene.add(
            box(0.2, WALL_H, room.d, wall, [hw + 0.1, WALL_H / 2, 0]),
        );
        this.scene.add(box(room.w, 0.5, 0.2, '#e9d9b0', [0, 0.25, hd + 0.1]));
        // Skirting.
        this.scene.add(
            box(room.w, 0.25, 0.22, '#7b8fb2', [0, 0.12, -hd - 0.1]),
        );

        // Whiteboard / blackboard with the classroom name (front wall).
        const boardW = Math.min(10, Math.max(7, room.w * 0.3));
        const board = new THREE.Mesh(
            new THREE.PlaneGeometry(boardW, boardW * 0.37),
            new THREE.MeshBasicMaterial({ map: boardTexture(boardTitle) }),
        );
        board.position.set(0, 1.85, -hd + 0.02);
        this.scene.add(board);

        // Windows along the side walls, spaced by wall length; the door
        // gap on the entry side stays clear.
        const entry = roomEntry(this.geometry);
        const doorSide = entry.x >= 0 ? 1 : -1;
        for (const side of [-1, 1]) {
            const zs = wallWindows(
                room.d,
                4,
                2.5,
                side === doorSide ? entry.z : null,
            );
            for (const z of zs) {
                const win = new THREE.Mesh(
                    new THREE.PlaneGeometry(2, 1.2),
                    new THREE.MeshBasicMaterial({ color: '#a8dcff' }),
                );
                win.position.set(side * (hw - 0.01), 2.3, z);
                win.rotation.y = (-side * Math.PI) / 2;
                this.scene.add(win);
            }
        }

        // Door near the spawn.
        const door = box(1.4, 2.4, 0.08, '#a0673a', [
            doorSide * (hw - 0.05),
            1.2,
            Math.min(hd - 1, entry.z),
        ]);
        door.rotation.y = Math.PI / 2;
        this.scene.add(door);

        // Teacher desk + chair.
        this.scene.add(
            box(teacher.w, 0.8, teacher.d, '#8d5a37', [
                teacher.x,
                0.4,
                teacher.z,
            ]),
        );
        this.scene.add(
            box(teacher.w + 0.1, 0.08, teacher.d + 0.1, '#6b4128', [
                teacher.x,
                0.84,
                teacher.z,
            ]),
        );
        this.scene.add(
            box(0.5, 0.5, 0.5, '#3d7be0', [teacher.x, 0.25, teacher.z - 1]),
        );

        // Student desks with chairs.
        for (const d of desks) {
            this.scene.add(box(d.w, 0.08, d.d, '#f1c27d', [d.x, 0.72, d.z]));
            for (const sx of [-1, 1]) {
                for (const sz of [-1, 1]) {
                    this.scene.add(
                        box(0.06, 0.7, 0.06, '#5b6b8c', [
                            d.x + sx * (d.w / 2 - 0.1),
                            0.35,
                            d.z + sz * (d.d / 2 - 0.1),
                        ]),
                    );
                }
            }
            this.scene.add(
                box(0.45, 0.06, 0.42, '#e85d75', [
                    d.x,
                    0.42,
                    d.z + d.d / 2 + 0.35,
                ]),
            );
        }

        // Game booths: open-front cubicle facing the room centre.
        for (const b of booths) {
            const info = boothInfo(b);
            const group = new THREE.Group();
            group.position.set(b.x, 0, b.z);
            // +Z (open front, sign) faces the room: side booths look across,
            // corner booths on the back/front edge look toward the middle.
            if (Math.abs(b.x) >= hw - 2.5) {
                group.lookAt(0, 0, b.z);
            } else {
                group.lookAt(b.x, 0, 0);
            }
            const size = 2.4;
            const mk = (
                w: number,
                h: number,
                d: number,
                pos: [number, number, number],
                color: string,
            ) => {
                const m = box(w, h, d, color, pos);
                group.add(m);
                return m;
            };
            // Tall back panel, low side panels: the camera (and the
            // player inside) always stays visible from above.
            mk(size, 2, 0.1, [0, 1, -size / 2], '#ffffff');
            mk(0.1, 0.9, size, [-size / 2, 0.45, 0], info.accent);
            mk(0.1, 0.9, size, [size / 2, 0.45, 0], info.accent);
            mk(0.14, 2.2, 0.14, [-size / 2, 1.1, size / 2], info.accent);
            mk(0.14, 2.2, 0.14, [size / 2, 1.1, size / 2], info.accent);
            mk(0.1, 0.4, size, [-size / 2, 2.0, 0], info.accent);
            mk(0.1, 0.4, size, [size / 2, 2.0, 0], info.accent);
            const pad = new THREE.Mesh(
                new THREE.CircleGeometry(b.r, 32),
                new THREE.MeshBasicMaterial({
                    color: info.accent,
                    transparent: true,
                    opacity: 0.35,
                }),
            );
            pad.rotation.x = -Math.PI / 2;
            pad.position.y = 0.02;
            (pad.material as THREE.MeshBasicMaterial).depthWrite = false;
            pad.name = 'pad';
            group.add(pad);
            // Arcade cabinet inside.
            mk(0.9, 1.3, 0.6, [0, 0.65, -0.75], '#1f2a44');
            const screen = new THREE.Mesh(
                new THREE.PlaneGeometry(0.7, 0.45),
                new THREE.MeshBasicMaterial({ color: info.accent }),
            );
            screen.position.set(0, 1.0, -0.44);
            group.add(screen);
            // Sprite sign: always faces the camera, readable from any angle.
            const sign = new THREE.Sprite(
                new THREE.SpriteMaterial({
                    map: boothSign(info.title, info.accent, info.icon),
                    transparent: true,
                }),
            );
            sign.scale.set(2.4, 0.6, 1);
            sign.position.set(0, 3.2, -0.6);
            group.add(sign);
            this.scene.add(group);
            this.boothMeshes.push(group);
        }
    }

    private makeLabel(className: string): HTMLDivElement {
        const el = document.createElement('div');
        el.className = className;
        el.style.position = 'absolute';
        el.style.left = '0';
        el.style.top = '0';
        el.style.willChange = 'transform';
        el.style.pointerEvents = 'none';
        this.overlay.appendChild(el);
        return el;
    }

    private makeBadge(id: number, name: string): HTMLDivElement {
        const badge = this.makeLabel(
            id === this.meId ? 'cw-badge cw-badge-me' : 'cw-badge',
        );
        const dot = document.createElement('i');
        dot.className = 'cw-badge-dot';
        const label = document.createElement('span');
        label.textContent = name;
        // Unread count chip, floated above the name (text only).
        const unread = document.createElement('em');
        unread.className = 'cw-badge-unread';
        unread.hidden = true;
        unread.setAttribute('role', 'button');
        unread.dataset.testid = 'classroom-world-unread';
        unread.dataset.user = String(id);
        unread.addEventListener('pointerdown', (e) => e.stopPropagation());
        unread.addEventListener('click', (e) => {
            e.stopPropagation();
            this.onUnreadTap(id);
        });
        badge.append(dot, label, unread);
        return badge;
    }

    /** Adds or removes the "Guru" tag on a name badge (text only). */
    private markTeacher(badge: HTMLDivElement, teacher: boolean): void {
        let tag = badge.querySelector<HTMLElement>('b.cw-badge-teacher');
        if (teacher && !tag) {
            tag = document.createElement('b');
            tag.className = 'cw-badge-teacher';
            badge.prepend(tag);
        }
        if (tag) {
            if (teacher) {
                tag.textContent = this.teacherLabel;
            } else {
                tag.remove();
            }
        }
        badge.classList.toggle('cw-badge-is-teacher', teacher);
    }

    private dropActor(actor: Actor): void {
        this.scene.remove(actor.rig.root);
        actor.badge.remove();
        actor.bubble.remove();
    }

    /** Teacher seat + look; the static avatar shows while they are offline. */
    setTeacher(info: TeacherInfo | null, label: string): void {
        this.teacher = info;
        this.teacherLabel = label;
        for (const actor of this.actors.values()) {
            actor.teacher =
                actor.teacher || (info !== null && actor.id === info.id);
            this.markTeacher(actor.badge, actor.teacher);
        }
        if (this.staticTeacher) {
            this.dropActor(this.staticTeacher);
            this.staticTeacher = null;
        }
        this.syncStaticTeacher();
    }

    private syncStaticTeacher(): void {
        const info = this.teacher;
        const show =
            info !== null && info.id !== this.meId && !this.actors.has(info.id);
        if (!show) {
            if (this.staticTeacher) {
                this.dropActor(this.staticTeacher);
                this.staticTeacher = null;
            }
            return;
        }
        if (this.staticTeacher || !info) {
            return;
        }
        const rig = buildAvatar(info.character);
        // Facing 0 looks toward +z (the students), same convention as Go.
        rig.root.position.set(info.x, 0, info.z);
        rig.root.rotation.y = 0;
        this.scene.add(rig.root);
        const badge = this.makeBadge(info.id, info.name);
        badge.classList.add('cw-badge-offline');
        this.markTeacher(badge, true);
        this.staticTeacher = {
            id: info.id,
            name: info.name,
            rig,
            target: new THREE.Vector3(info.x, 0, info.z),
            facing: 0,
            speed: 0,
            busy: '',
            badge,
            bubble: this.makeLabel('cw-bubble'),
            bubbleUntil: 0,
            unread: 0,
            emote: null,
            emoteAt: 0,
            lookKey: '',
            teacher: true,
        };
    }

    /** Full roster: adds new avatars, rebuilds changed looks, drops leavers. */
    setRoster(players: RosterPlayer[]): void {
        const seen = new Set<number>();
        for (const p of players) {
            seen.add(p.id);
            const isTeacher =
                p.teacher === true ||
                (this.teacher !== null && p.id === this.teacher.id);
            const lookKey = JSON.stringify(p.character ?? null);
            const existing = this.actors.get(p.id);
            if (existing && existing.lookKey === lookKey) {
                existing.name = p.name;
                existing.badge.querySelector('span')!.textContent = p.name;
                existing.teacher = isTeacher;
                this.markTeacher(existing.badge, isTeacher);
                continue;
            }
            // A teacher walking in takes over from the static desk avatar.
            const fromStatic =
                !existing && this.staticTeacher?.id === p.id
                    ? this.staticTeacher
                    : null;
            const pos =
                existing?.rig.root.position.clone() ??
                fromStatic?.rig.root.position.clone() ??
                new THREE.Vector3(0, 0, 0);
            if (existing) {
                this.scene.remove(existing.rig.root);
            }
            const rig = buildAvatar(p.character as CharacterLook | null);
            rig.root.position.copy(pos);
            this.scene.add(rig.root);
            const badge = existing?.badge ?? this.makeBadge(p.id, p.name);
            badge.querySelector('span')!.textContent = p.name;
            this.markTeacher(badge, isTeacher);
            const bubble = existing?.bubble ?? this.makeLabel('cw-bubble');
            this.actors.set(p.id, {
                id: p.id,
                name: p.name,
                rig,
                target: existing?.target ?? pos.clone(),
                facing: existing?.facing ?? 0,
                speed: 0,
                busy: existing?.busy ?? '',
                badge,
                bubble,
                bubbleUntil: existing?.bubbleUntil ?? 0,
                unread: existing?.unread ?? fromStatic?.unread ?? 0,
                emote: null,
                emoteAt: 0,
                lookKey,
                teacher: isTeacher,
            });
        }
        for (const [id, actor] of this.actors) {
            if (!seen.has(id)) {
                this.dropActor(actor);
                this.actors.delete(id);
            }
        }
        this.syncStaticTeacher();
    }

    setState(rows: PlayerTuple[]): void {
        for (const [id, x, z, facing, busy] of rows) {
            const actor = this.actors.get(id);
            if (!actor) {
                continue;
            }
            actor.target.set(x, 0, z);
            actor.facing = facing;
            const nextBusy = typeof busy === 'string' ? busy : '';
            if (nextBusy !== actor.busy) {
                actor.busy = nextBusy;
                actor.badge.classList.toggle('cw-badge-busy', nextBusy !== '');
            }
            if (id === this.meId) {
                if (!this.localKnown) {
                    this.local = { x, z };
                    this.server = { x, z };
                    actor.rig.root.position.set(x, 0, z);
                    this.localKnown = true;
                } else {
                    this.server = { x, z };
                    if (Math.hypot(this.local.x - x, this.local.z - z) > 1.2) {
                        // Large disagreement: snap the prediction back.
                        this.local = { x, z };
                    }
                }
            }
        }
    }

    private actorById(id: number): Actor | null {
        return (
            this.actors.get(id) ??
            (this.staticTeacher?.id === id ? this.staticTeacher : null)
        );
    }

    chat(id: number, text: string): void {
        const actor = this.actorById(id);
        if (!actor) {
            return;
        }
        actor.bubble.textContent = text;
        actor.bubble.classList.add('cw-bubble-show');
        actor.bubbleUntil = performance.now() + BUBBLE_MS;
    }

    /** Proximity message bubble over the sender (static teacher too). */
    say(id: number, text: string): void {
        this.chat(id, text);
    }

    /**
     * Unread direct messages from `id`: a count chip above the head while
     * no speech bubble is showing (0 hides it).
     */
    setUnread(id: number, count: number): void {
        const actor = this.actorById(id);
        if (actor) {
            actor.unread = Math.max(0, Math.floor(count));
        }
        this.host.dataset.unread = this.allActors()
            .filter((a) => a.unread > 0)
            .map((a) => `${a.id}:${a.unread}`)
            .join(',');
    }

    /** Whether an avatar (live or the static teacher) is in the room. */
    hasActor(id: number): boolean {
        return this.allActors().some((actor) => actor.id === id);
    }

    /** Closest other avatar within `radius` metres of the local player. */
    nearest(radius: number): NearbyActor | null {
        if (!this.localKnown) {
            return null;
        }
        const candidates: { actor: Actor; x: number; z: number }[] = [];
        for (const actor of this.allActors()) {
            if (actor.id === this.meId) {
                continue;
            }
            const p = actor.target;
            candidates.push({ actor, x: p.x, z: p.z });
        }
        const hit = nearestWithin(this.local, candidates, radius);
        return hit
            ? {
                  id: hit.actor.id,
                  name: hit.actor.name,
                  teacher: hit.actor.teacher,
              }
            : null;
    }

    /** Metres from the local player to an avatar (static teacher too). */
    distanceTo(id: number): number | null {
        const actor = this.actorById(id);
        if (!actor || !this.localKnown) {
            return null;
        }
        return Math.hypot(
            actor.target.x - this.local.x,
            actor.target.z - this.local.z,
        );
    }

    private allActors(): Actor[] {
        const list = [...this.actors.values()];
        if (this.staticTeacher) {
            list.push(this.staticTeacher);
        }
        return list;
    }

    emote(id: number, e: string): void {
        const actor = this.actors.get(id);
        if (actor) {
            actor.emote = e;
            actor.emoteAt = this.clock.elapsedTime;
        }
    }

    /** Raw input in screen space: x right, y forward (up on the joystick). */
    setInput(right: number, forward: number): { x: number; z: number } {
        const sin = Math.sin(this.yaw);
        const cos = Math.cos(this.yaw);
        // Camera looks toward -forward of its offset; map screen axes to world.
        const x = right * cos - forward * sin;
        const z = -right * sin - forward * cos;
        const len = Math.hypot(x, z);
        this.input = len > 1 ? { x: x / len, z: z / len } : { x, z };
        return this.input;
    }

    rotate(dx: number, dy: number): void {
        this.yaw -= dx * 0.006;
        this.pitch = Math.min(1.25, Math.max(0.35, this.pitch + dy * 0.004));
    }

    zoom(delta: number): void {
        this.distance = Math.min(
            this.cameraMax,
            Math.max(CAMERA_MIN, this.distance * (1 + delta)),
        );
    }

    private tick = (): void => {
        if (this.disposed) {
            return;
        }
        this.frame = requestAnimationFrame(this.tick);
        const dt = Math.min(this.clock.getDelta(), 0.1);
        const t = this.clock.elapsedTime;
        const me = this.actors.get(this.meId);

        if (me && this.localKnown) {
            const prev = this.local;
            this.local = predictStep(this.geometry, this.local, this.input, dt);
            if (this.input.x === 0 && this.input.z === 0) {
                // Standing still: settle onto the server position so booth
                // checks on both sides agree.
                const k = 1 - Math.exp(-dt * 8);
                this.local = {
                    x: this.local.x + (this.server.x - this.local.x) * k,
                    z: this.local.z + (this.server.z - this.local.z) * k,
                };
            }
            const moved = Math.hypot(
                this.local.x - prev.x,
                this.local.z - prev.z,
            );
            me.target.set(this.local.x, 0, this.local.z);
            if (moved > 0.0001) {
                me.facing = Math.atan2(
                    this.local.x - prev.x,
                    this.local.z - prev.z,
                );
            }
        }

        let inBooth = -1;
        const width = this.host.clientWidth;
        const height = this.host.clientHeight;
        const now = performance.now();
        for (const actor of this.allActors()) {
            const pos = actor.rig.root.position;
            const before = pos.clone();
            const follow = actor.id === this.meId ? 1 : 1 - Math.exp(-dt * 10);
            pos.lerp(actor.target, follow);
            const v = before.distanceTo(pos) / Math.max(dt, 0.001);
            actor.speed +=
                (Math.min(1, v / 3) - actor.speed) * Math.min(1, dt * 10);
            const turn = actor.facing - actor.rig.root.rotation.y;
            const wrapped = Math.atan2(Math.sin(turn), Math.cos(turn));
            actor.rig.root.rotation.y += wrapped * Math.min(1, dt * 12);
            animateAvatar(
                actor.rig,
                this.reducedMotion ? 0 : t,
                this.reducedMotion ? 0 : actor.speed,
                actor.emote,
                t - actor.emoteAt,
            );

            this.projected
                .set(pos.x, actor.rig.top + 0.25, pos.z)
                .project(this.camera);
            const visible = this.projected.z < 1 && this.projected.z > -1;
            const sx = (this.projected.x * 0.5 + 0.5) * width;
            const sy = (-this.projected.y * 0.5 + 0.5) * height;
            const display = visible ? '' : 'none';
            actor.badge.style.display = display;
            actor.badge.style.transform = `translate(-50%, -100%) translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px)`;
            const showBubble = actor.bubbleUntil > now;
            if (
                !showBubble &&
                actor.bubble.classList.contains('cw-bubble-show')
            ) {
                actor.bubble.classList.remove('cw-bubble-show');
            }
            actor.bubble.style.display = visible && showBubble ? '' : 'none';
            const chip =
                actor.badge.querySelector<HTMLElement>('em.cw-badge-unread');
            if (chip) {
                const show = actor.unread > 0 && !showBubble;
                const text = actor.unread > 9 ? '9+' : String(actor.unread);
                if (chip.hidden === show) {
                    chip.hidden = !show;
                }
                if (show && chip.textContent !== text) {
                    chip.textContent = text;
                }
            }
            actor.bubble.style.transform = `translate(-50%, -100%) translate(${sx.toFixed(1)}px, ${(sy - 30).toFixed(1)}px)`;
            const depth = Math.round((1 - this.projected.z) * 100000);
            actor.badge.style.zIndex = String(depth);
            actor.bubble.style.zIndex = String(depth + 1);
        }

        if (me) {
            inBooth = boothAt(this.geometry.booths, this.local.x, this.local.z);
            this.focus.lerp(
                new THREE.Vector3(
                    me.rig.root.position.x,
                    0.9,
                    me.rig.root.position.z,
                ),
                this.localKnown ? 1 - Math.exp(-dt * 6) : 1,
            );
        }
        this.onBooth(inBooth);
        // Rounded local position for end-to-end tests (no private data).
        this.host.dataset.x = this.local.x.toFixed(1);
        this.host.dataset.z = this.local.z.toFixed(1);
        for (const [i, group] of this.boothMeshes.entries()) {
            const pad = group.getObjectByName('pad') as THREE.Mesh | undefined;
            if (pad) {
                const active = this.geometry.booths[i]?.i === inBooth;
                (pad.material as THREE.MeshBasicMaterial).opacity = active
                    ? 0.55 + (this.reducedMotion ? 0 : Math.sin(t * 5) * 0.15)
                    : 0.3;
            }
        }

        const cx =
            this.focus.x +
            Math.sin(this.yaw) * Math.cos(this.pitch) * this.distance;
        const cz =
            this.focus.z +
            Math.cos(this.yaw) * Math.cos(this.pitch) * this.distance;
        const cy = this.focus.y + Math.sin(this.pitch) * this.distance;
        this.camera.position.set(cx, cy, cz);
        this.camera.lookAt(this.focus);
        this.renderer.render(this.scene, this.camera);
    };

    /** Local predicted position (for HUD/booth checks). */
    localPosition(): { x: number; z: number } {
        return this.local;
    }

    dispose(): void {
        this.disposed = true;
        cancelAnimationFrame(this.frame);
        this.resize.disconnect();
        for (const actor of this.allActors()) {
            actor.badge.remove();
            actor.bubble.remove();
        }
        this.actors.clear();
        this.staticTeacher = null;
        this.scene.traverse((obj) => {
            if (obj instanceof THREE.Mesh || obj instanceof THREE.Sprite) {
                const materials = Array.isArray(obj.material)
                    ? obj.material
                    : [obj.material];
                for (const m of materials) {
                    (m as THREE.MeshBasicMaterial).map?.dispose();
                    m.dispose();
                }
            }
        });
        this.renderer.dispose();
        this.renderer.domElement.remove();
    }
}
