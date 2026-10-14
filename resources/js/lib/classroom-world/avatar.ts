/**
 * 3D avatar for the classroom world, built from simple primitives so it
 * stays light with many players. Colours and worn items come from the same
 * look as the 2D portal avatar (`CharacterLook`), so a student recognises
 * the hat, outfit, cape or wand they set in the character settings.
 */
import {
    CHARACTER_INK,
    CHARACTER_SHIRTS,
    type CharacterLook,
    HAIR_COLORS,
    type ItemLook,
    resolveItems,
    SKIN_TONES,
} from '@/lib/character/draw-character';
import * as THREE from 'three';

const geometryCache = new Map<string, THREE.BufferGeometry>();

function geo(
    key: string,
    make: () => THREE.BufferGeometry,
): THREE.BufferGeometry {
    let g = geometryCache.get(key);
    if (!g) {
        g = make();
        geometryCache.set(key, g);
    }
    return g;
}

const materialCache = new Map<string, THREE.MeshToonMaterial>();

function mat(
    color: string,
    opts: { transparent?: boolean } = {},
): THREE.MeshToonMaterial {
    const safe = /^#[0-9a-f]{3,8}$/i.test(color) ? color : '#999999';
    const key = `${safe}${opts.transparent ? 't' : ''}`;
    let m = materialCache.get(key);
    if (!m) {
        m = new THREE.MeshToonMaterial({ color: safe });
        if (opts.transparent) {
            m.transparent = true;
            m.opacity = 0.85;
        }
        materialCache.set(key, m);
    }
    return m;
}

function mesh(
    g: THREE.BufferGeometry,
    color: string,
    pos: [number, number, number],
    opts: { transparent?: boolean } = {},
): THREE.Mesh {
    const m = new THREE.Mesh(g, mat(color, opts));
    m.position.set(...pos);
    m.castShadow = true;
    return m;
}

function darken(hex: string, amount: number): string {
    const c = new THREE.Color(/^#[0-9a-f]{3,8}$/i.test(hex) ? hex : '#999999');
    c.multiplyScalar(1 - amount);
    return `#${c.getHexString()}`;
}

/** Parts the animator moves every frame. */
export interface AvatarRig {
    root: THREE.Group;
    body: THREE.Group;
    head: THREE.Group;
    armL: THREE.Group;
    armR: THREE.Group;
    legL: THREE.Mesh;
    legR: THREE.Mesh;
    /** Height of the top of the head (badge anchor), in metres. */
    top: number;
}

function addHat(head: THREE.Group, item: ItemLook): number {
    const color = item.color ?? '#ffffff';
    switch (item.style) {
        case 'cap': {
            head.add(
                mesh(
                    geo(
                        'cap',
                        () =>
                            new THREE.SphereGeometry(
                                0.33,
                                16,
                                8,
                                0,
                                Math.PI * 2,
                                0,
                                Math.PI / 2,
                            ),
                    ),
                    color,
                    [0, 0.08, 0],
                ),
            );
            const brim = mesh(
                geo(
                    'brim',
                    () => new THREE.CylinderGeometry(0.2, 0.2, 0.03, 16),
                ),
                color,
                [0, 0.1, 0.26],
            );
            brim.scale.set(1, 1, 0.8);
            head.add(brim);
            return 0.38;
        }
        case 'wizard': {
            head.add(
                mesh(
                    geo(
                        'wiz-brim',
                        () => new THREE.CylinderGeometry(0.46, 0.46, 0.04, 20),
                    ),
                    color,
                    [0, 0.22, 0],
                ),
            );
            head.add(
                mesh(
                    geo(
                        'wiz-cone',
                        () => new THREE.ConeGeometry(0.28, 0.6, 16),
                    ),
                    color,
                    [0, 0.52, 0],
                ),
            );
            return 0.85;
        }
        case 'crown': {
            head.add(
                mesh(
                    geo(
                        'crown',
                        () =>
                            new THREE.CylinderGeometry(
                                0.24,
                                0.22,
                                0.16,
                                8,
                                1,
                                true,
                            ),
                    ),
                    color === '#ffffff' ? '#f5c518' : color,
                    [0, 0.34, 0],
                ),
            );
            return 0.45;
        }
        case 'helmet': {
            head.add(
                mesh(
                    geo(
                        'helmet',
                        () =>
                            new THREE.SphereGeometry(
                                0.35,
                                16,
                                10,
                                0,
                                Math.PI * 2,
                                0,
                                Math.PI / 1.8,
                            ),
                    ),
                    color,
                    [0, 0.04, 0],
                ),
            );
            return 0.4;
        }
        case 'hood': {
            head.add(
                mesh(
                    geo(
                        'hood',
                        () =>
                            new THREE.SphereGeometry(
                                0.37,
                                16,
                                10,
                                Math.PI * 0.15,
                                Math.PI * 1.7,
                            ),
                    ),
                    color,
                    [0, 0.02, -0.02],
                ),
            );
            return 0.4;
        }
        case 'horned': {
            head.add(
                mesh(
                    geo(
                        'helmet',
                        () =>
                            new THREE.SphereGeometry(
                                0.35,
                                16,
                                10,
                                0,
                                Math.PI * 2,
                                0,
                                Math.PI / 1.8,
                            ),
                    ),
                    color,
                    [0, 0.04, 0],
                ),
            );
            for (const side of [-1, 1]) {
                const horn = mesh(
                    geo('horn', () => new THREE.ConeGeometry(0.07, 0.3, 8)),
                    '#fff6dc',
                    [side * 0.32, 0.3, 0],
                );
                horn.rotation.z = -side * 0.6;
                head.add(horn);
            }
            return 0.55;
        }
        case 'circlet': {
            const ring = mesh(
                geo(
                    'circlet',
                    () => new THREE.TorusGeometry(0.31, 0.03, 6, 24),
                ),
                color,
                [0, 0.14, 0],
            );
            ring.rotation.x = Math.PI / 2;
            head.add(ring);
            return 0.36;
        }
        case 'flower': {
            head.add(
                mesh(
                    geo('flower', () => new THREE.SphereGeometry(0.09, 10, 8)),
                    color,
                    [-0.22, 0.22, 0.14],
                ),
            );
            head.add(
                mesh(
                    geo('flower-c', () => new THREE.SphereGeometry(0.05, 8, 6)),
                    '#ffd93d',
                    [-0.22, 0.22, 0.2],
                ),
            );
            return 0.36;
        }
        default:
            return 0.36;
    }
}

function addFace(head: THREE.Group, item: ItemLook): void {
    if (item.style === 'mask') {
        const m = mesh(
            geo('mask', () => new THREE.BoxGeometry(0.46, 0.1, 0.06)),
            item.color ?? CHARACTER_INK,
            [0, 0.03, 0.3],
        );
        head.add(m);
        return;
    }
    for (const side of [-1, 1]) {
        const ring = mesh(
            geo('glass', () => new THREE.TorusGeometry(0.07, 0.015, 6, 16)),
            item.color ?? CHARACTER_INK,
            [side * 0.11, 0.03, 0.32],
        );
        head.add(ring);
    }
}

function addHeld(
    arm: THREE.Group,
    item: ItemLook,
    slot: 'weapon' | 'offhand',
): void {
    const color = item.color ?? (slot === 'offhand' ? '#c0392b' : '#d7dde6');
    if (slot === 'offhand') {
        const shield = mesh(
            geo('shield', () => new THREE.CylinderGeometry(0.2, 0.2, 0.05, 16)),
            color,
            [0, -0.38, 0.12],
        );
        shield.rotation.x = Math.PI / 2;
        arm.add(shield);
        return;
    }
    const long = ['staff', 'spear'].includes(item.style);
    const shaft = mesh(
        geo(
            long ? 'shaft-long' : 'shaft',
            () => new THREE.CylinderGeometry(0.025, 0.025, long ? 0.9 : 0.5, 6),
        ),
        item.style === 'sword' ? color : '#8a5a2b',
        [0, -0.4, 0.18],
    );
    shaft.rotation.x = Math.PI / 2.4;
    arm.add(shaft);
    if (['wand', 'staff'].includes(item.style)) {
        arm.add(
            mesh(
                geo('orb', () => new THREE.SphereGeometry(0.07, 10, 8)),
                item.color ?? '#6c5ce7',
                [0, -0.25, long ? 0.6 : 0.42],
            ),
        );
    }
    if (['axe', 'mace'].includes(item.style)) {
        arm.add(
            mesh(
                geo(
                    'head-block',
                    () => new THREE.BoxGeometry(0.16, 0.12, 0.08),
                ),
                color,
                [0, -0.3, 0.38],
            ),
        );
    }
}

/** Builds an avatar. `look` null = default student look. */
export function buildAvatar(look: CharacterLook | null): AvatarRig {
    const girl = look?.gender === 'girl';
    const skin = SKIN_TONES[look?.skin ?? ''] ?? SKIN_TONES.light;
    const hair = HAIR_COLORS[look?.hair ?? ''] ?? HAIR_COLORS.brown;
    const [shirtBase] =
        CHARACTER_SHIRTS[look?.color ?? ''] ?? CHARACTER_SHIRTS.amber;
    const items = look ? resolveItems(look) : {};
    const outfit = items.outfit;
    const shirt =
        outfit?.color ?? (outfit?.style === 'armor' ? '#b8c2cf' : shirtBase);

    const root = new THREE.Group();
    const body = new THREE.Group();
    root.add(body);

    const legGeo = geo(
        'leg',
        () => new THREE.CapsuleGeometry(0.08, 0.22, 4, 8),
    );
    const legL = mesh(legGeo, '#2b3150', [-0.1, 0.19, 0]);
    const legR = mesh(legGeo, '#2b3150', [0.1, 0.19, 0]);
    body.add(legL, legR);

    const long = girl || outfit?.style === 'robe' || outfit?.style === 'dress';
    const torso = mesh(
        long
            ? geo(
                  'torso-long',
                  () => new THREE.CylinderGeometry(0.2, 0.32, 0.52, 14),
              )
            : geo('torso', () => new THREE.CapsuleGeometry(0.2, 0.22, 4, 12)),
        shirt,
        [0, long ? 0.6 : 0.62, 0],
    );
    body.add(torso);
    if (outfit?.style === 'leather' || outfit?.style === 'armor') {
        body.add(
            mesh(
                geo(
                    'belt',
                    () => new THREE.CylinderGeometry(0.215, 0.215, 0.06, 14),
                ),
                darken(shirt, 0.4),
                [0, 0.5, 0],
            ),
        );
    }

    const armGeo = geo(
        'arm',
        () => new THREE.CapsuleGeometry(0.06, 0.24, 4, 8),
    );
    const makeArm = (side: number) => {
        const arm = new THREE.Group();
        arm.position.set(side * 0.27, 0.8, 0);
        const sleeve = mesh(armGeo, shirt, [0, -0.17, 0]);
        const hand = mesh(
            geo('hand', () => new THREE.SphereGeometry(0.065, 8, 6)),
            skin,
            [0, -0.34, 0],
        );
        arm.add(sleeve, hand);
        body.add(arm);
        return arm;
    };
    const armL = makeArm(-1);
    const armR = makeArm(1);

    const head = new THREE.Group();
    head.position.set(0, 1.18, 0);
    body.add(head);
    head.add(
        mesh(
            geo('head', () => new THREE.SphereGeometry(0.32, 20, 16)),
            skin,
            [0, 0, 0],
        ),
    );
    head.add(
        mesh(
            geo(
                'hair',
                () =>
                    new THREE.SphereGeometry(
                        0.335,
                        20,
                        12,
                        0,
                        Math.PI * 2,
                        0,
                        Math.PI / 2.1,
                    ),
            ),
            hair,
            [0, 0.03, -0.02],
        ),
    );
    if (girl) {
        head.add(
            mesh(
                geo(
                    'hair-back',
                    () => new THREE.CapsuleGeometry(0.2, 0.28, 4, 10),
                ),
                hair,
                [0, -0.2, -0.18],
            ),
        );
    }
    for (const side of [-1, 1]) {
        head.add(
            mesh(
                geo('eye', () => new THREE.SphereGeometry(0.045, 8, 6)),
                CHARACTER_INK,
                [side * 0.11, 0.02, 0.29],
            ),
        );
        head.add(
            mesh(
                geo('cheek', () => new THREE.SphereGeometry(0.04, 8, 6)),
                '#f59bb0',
                [side * 0.19, -0.07, 0.26],
            ),
        );
    }

    let top = 1.18 + 0.36;
    if (items.hat) {
        top = 1.18 + addHat(head, items.hat);
    }
    if (items.face) {
        addFace(head, items.face);
    }
    if (items.back) {
        const color = items.back.color ?? '#d6453d';
        if (items.back.style === 'wings') {
            for (const side of [-1, 1]) {
                const wing = mesh(
                    geo('wing', () => new THREE.SphereGeometry(0.28, 10, 8)),
                    color,
                    [side * 0.28, 0.82, -0.22],
                    { transparent: true },
                );
                wing.scale.set(1, 0.6, 0.15);
                wing.rotation.z = side * 0.4;
                body.add(wing);
            }
        } else {
            const cape = mesh(
                geo('cape', () => new THREE.BoxGeometry(0.46, 0.62, 0.04)),
                darken(color, 0.12),
                [0, 0.55, -0.24],
            );
            cape.rotation.x = 0.12;
            body.add(cape);
        }
    }
    if (items.weapon) {
        addHeld(armR, items.weapon, 'weapon');
    }
    if (items.offhand) {
        addHeld(armL, items.offhand, 'offhand');
    }

    const shadow = new THREE.Mesh(
        geo('shadow', () => new THREE.CircleGeometry(0.34, 20)),
        new THREE.MeshBasicMaterial({
            color: '#000000',
            transparent: true,
            opacity: 0.18,
            depthWrite: false,
        }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.01;
    root.add(shadow);

    return { root, body, head, armL, armR, legL, legR, top };
}

/**
 * Walk/idle animation. `speed` 0..1, `t` seconds. Emotes override arms.
 */
export function animateAvatar(
    rig: AvatarRig,
    t: number,
    speed: number,
    emote: string | null,
    emoteAge: number,
): void {
    const swing = Math.sin(t * 10) * 0.6 * speed;
    rig.legL.rotation.x = swing;
    rig.legR.rotation.x = -swing;
    rig.armL.rotation.x = -swing * 0.8;
    rig.armR.rotation.x = swing * 0.8;
    rig.armL.rotation.z = 0;
    rig.armR.rotation.z = 0;
    rig.body.position.y =
        speed > 0.05
            ? Math.abs(Math.sin(t * 10)) * 0.05
            : Math.sin(t * 2) * 0.012;
    rig.head.rotation.z = speed > 0.05 ? 0 : Math.sin(t * 1.3) * 0.05;

    if (emote && emoteAge < 1.6) {
        const k = Math.sin(emoteAge * 14);
        if (emote === 'wave') {
            rig.armR.rotation.z = 2.6 + k * 0.35;
        } else if (emote === 'clap') {
            rig.armL.rotation.x = -1.3;
            rig.armR.rotation.x = -1.3;
            rig.armL.rotation.z = -0.4 - k * 0.25;
            rig.armR.rotation.z = 0.4 + k * 0.25;
        } else if (emote === 'jump') {
            rig.body.position.y =
                Math.max(
                    0,
                    Math.sin((Math.min(emoteAge, 0.6) / 0.6) * Math.PI),
                ) * 0.5;
            rig.armL.rotation.z = -2.4;
            rig.armR.rotation.z = 2.4;
        }
    }
}
