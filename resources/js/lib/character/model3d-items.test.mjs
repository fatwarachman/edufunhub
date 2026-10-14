import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';
import * as THREE from 'three';

// The character modules import siblings without the `.ts` extension (Vite
// style); let node resolve them the same way.
registerHooks({
    resolve(specifier, context, nextResolve) {
        try {
            return nextResolve(specifier, context);
        } catch (error) {
            if (specifier.startsWith('.') && !specifier.endsWith('.ts')) {
                return nextResolve(`${specifier}.ts`, context);
            }
            throw error;
        }
    },
});

const { attachItems, coversHair } = await import('./model3d-items.ts');

const STYLES = {
    hat: [
        'cap',
        'flower',
        'hood',
        'wizard',
        'helmet',
        'circlet',
        'horned',
        'crown',
    ],
    face: ['glasses', 'mask'],
    back: ['cape', 'wings'],
    weapon: ['sword', 'wand', 'bow', 'staff', 'spear', 'mace', 'axe'],
    offhand: ['shield'],
};
const GROUP_OF = {
    hat: 'head',
    face: 'head',
    back: 'backSlot',
    weapon: 'armFront',
    offhand: 'armBack',
};

function fakeRig() {
    const g = (x, y, z) => {
        const group = new THREE.Group();
        group.position.set(x, y, z);
        return group;
    };
    const root = new THREE.Group();
    const body = g(0, 0, 0);
    const rig = {
        root,
        body,
        head: g(0, 33, 0),
        armFront: g(11, 29, 0),
        armBack: g(-11, 29, 0),
        legFront: g(3, 14, 0),
        legBack: g(-3, 14, 0),
        backSlot: g(0, 30, -6),
        eyes: [],
        blinkLines: [],
        look: { color: 'amber' },
        top: 67,
    };
    root.add(body);
    body.add(
        rig.head,
        rig.armFront,
        rig.armBack,
        rig.legFront,
        rig.legBack,
        rig.backSlot,
    );
    return rig;
}

function meshes(object) {
    const list = [];
    object.traverse((child) => {
        if (child.isMesh) {
            list.push(child);
        }
    });
    return list;
}

function fillColors(group) {
    return meshes(group)
        .filter((m) => m.material.side !== THREE.BackSide)
        .map((m) => `#${m.material.color.getHexString()}`);
}

test('every style of every slot attaches to the right group', () => {
    for (const [slot, styles] of Object.entries(STYLES)) {
        for (const style of styles) {
            const rig = fakeRig();
            attachItems(rig, { [slot]: { style, color: '#3366cc' } });
            const target = rig[GROUP_OF[slot]];
            assert.ok(
                target.children.length > 0,
                `${slot}/${style} attached nothing`,
            );
            for (const [name, group] of Object.entries(GROUP_OF)) {
                if (group !== GROUP_OF[slot]) {
                    assert.equal(
                        rig[group].children.length,
                        0,
                        `${slot}/${style} leaked into ${name}`,
                    );
                }
            }
            for (const mesh of meshes(target)) {
                assert.ok(mesh.geometry.attributes.position.count > 0);
                mesh.geometry.computeBoundingSphere();
                assert.ok(
                    Number.isFinite(mesh.geometry.boundingSphere.radius),
                    `${slot}/${style} NaN geometry`,
                );
            }
        }
    }
});

test('every mesh has an ink outline hull except flat details', () => {
    const rig = fakeRig();
    attachItems(rig, { hat: { style: 'crown' }, weapon: { style: 'sword' } });
    const hulls = meshes(rig.root).filter(
        (m) => m.material.side === THREE.BackSide,
    );
    assert.ok(hulls.length > 0);
    assert.ok(hulls.every((m) => m.material.color.getHexString() === '1d2238'));
});

test('colours: 2D defaults, item colour and unsafe colour fallback', () => {
    const rig = fakeRig();
    attachItems(rig, {
        weapon: { style: 'sword', color: 'red;background:url(x)' },
        offhand: { style: 'shield' },
        hat: { style: 'cap', color: null },
        face: { style: 'mask' },
    });
    assert.ok(fillColors(rig.armFront).includes('#d7dde6'));
    assert.ok(fillColors(rig.armFront).includes('#f2c14e'));
    assert.ok(fillColors(rig.armBack).includes('#c0392b'));
    assert.ok(fillColors(rig.armBack).includes('#c9a227'));
    const head = fillColors(rig.head);
    assert.ok(head.includes('#ffffff'));
    assert.ok(head.includes('#23304f'));
    assert.ok(head.includes('#ffd93d'));
    assert.ok(head.includes('#1d2238'));

    const cape = fakeRig();
    attachItems(cape, { back: { style: 'cape', color: '#00ff00' } });
    const capeColors = fillColors(cape.backSlot);
    assert.ok(capeColors.includes('#00ff00'), 'front collar uses item colour');
    assert.ok(capeColors.includes('#00e000'), 'panel uses shade(color, -0.12)');
    assert.ok(capeColors.includes('#f2c14e'), 'gold clasp');

    const wings = fakeRig();
    attachItems(wings, { back: { style: 'wings' } });
    const wingMeshes = meshes(wings.backSlot).filter(
        (m) => m.material.side !== THREE.BackSide,
    );
    assert.ok(
        wingMeshes.every(
            (m) => m.material.opacity === 0.9 && m.material.transparent,
        ),
    );
    assert.ok(fillColors(wings.backSlot).includes('#d6453d'));
});

test('no material carries a non-hex colour', () => {
    const rig = fakeRig();
    const evil = 'javascript:alert(1)';
    const items = {};
    for (const slot of Object.keys(STYLES)) {
        items[slot] = {
            style: STYLES[slot][STYLES[slot].length - 1],
            color: evil,
        };
    }
    attachItems(rig, items);
    for (const mesh of meshes(rig.root)) {
        assert.match(
            `#${mesh.material.color.getHexString()}`,
            /^#[0-9a-f]{6}$/,
        );
    }
});

test('unknown styles fall back like 2D without throwing', () => {
    const fallback = fakeRig();
    attachItems(fallback, {
        hat: { style: 'cap' },
        weapon: { style: 'sword' },
        back: { style: 'cape' },
        face: { style: 'glasses' },
    });
    const rig = fakeRig();
    assert.doesNotThrow(() =>
        attachItems(rig, {
            hat: { style: 'sombrero', color: 'nope' },
            weapon: { style: 'laser' },
            back: { style: 'jetpack', color: '#zzzzzz' },
            face: { style: 'monocle' },
        }),
    );
    for (const group of ['head', 'armFront', 'backSlot']) {
        assert.equal(
            meshes(rig[group]).length,
            meshes(fallback[group]).length,
            group,
        );
    }
    assert.doesNotThrow(() => attachItems(fakeRig(), {}));
    assert.doesNotThrow(() => attachItems(fakeRig(), null));
    assert.doesNotThrow(() =>
        attachItems(fakeRig(), { hat: null, weapon: { style: 7 } }),
    );
});

test('coversHair matches the 2D list', () => {
    for (const style of STYLES.hat) {
        assert.equal(
            coversHair(style),
            style !== 'flower' && style !== 'circlet',
            style,
        );
    }
    assert.equal(coversHair('mystery'), true);
    assert.equal(coversHair(null), false);
    assert.equal(coversHair(undefined), false);
    assert.equal(coversHair(''), false);
});

test('tall hats raise rig.top, never lower it', () => {
    const top = (style) => {
        const rig = fakeRig();
        attachItems(rig, { hat: { style } });
        return rig.top;
    };
    const base = fakeRig().top;
    assert.ok(top('wizard') > top('crown'));
    assert.ok(top('crown') > top('cap'));
    assert.ok(top('cap') >= base);
    assert.ok(top('wizard') <= 110);
    assert.equal(top('flower'), base);
    const high = fakeRig();
    high.top = 200;
    attachItems(high, { hat: { style: 'wizard' } });
    assert.equal(high.top, 200);
});

test('geometry cache keeps unique geometries bounded across rigs', () => {
    const everything = (index) => ({
        hat: { style: STYLES.hat[index % STYLES.hat.length], color: '#123456' },
        face: { style: STYLES.face[index % 2] },
        back: {
            style: STYLES.back[index % 2],
            color: `#${(index * 7).toString(16).padStart(6, '0')}`,
        },
        weapon: { style: STYLES.weapon[index % STYLES.weapon.length] },
        offhand: { style: 'shield' },
    });
    const collect = (count) => {
        const geometries = new Set();
        const materials = new Set();
        for (let i = 0; i < count; i++) {
            const rig = fakeRig();
            attachItems(rig, everything(i));
            for (const mesh of meshes(rig.root)) {
                geometries.add(mesh.geometry);
                materials.add(mesh.material);
            }
        }
        return { geometries: geometries.size, materials: materials.size };
    };
    const first = collect(56);
    const again = collect(30);
    assert.ok(
        again.geometries <= first.geometries,
        `${again.geometries} > ${first.geometries}`,
    );
    assert.ok(
        first.geometries < 120,
        `too many geometries: ${first.geometries}`,
    );
});

test('round 2 shapes follow the 2D drawing', () => {
    const box = (group) => {
        group.updateMatrixWorld(true);
        return new THREE.Box3().setFromObject(group);
    };
    // Shield disc faces the camera: wide in x/y, thin in z.
    const shield = fakeRig();
    attachItems(shield, { offhand: { style: 'shield' } });
    const s = box(shield.armBack).getSize(new THREE.Vector3());
    assert.ok(s.x > 16 && s.y > 16 && s.z < 6, `shield ${s.toArray()}`);

    // Face items sit on the 3/4 face (2D eyes at x +6 / +13 from centre).
    for (const style of ['glasses', 'mask']) {
        const rig = fakeRig();
        attachItems(rig, { face: { style } });
        const b = box(rig.head);
        const centre = (b.min.x + b.max.x) / 2 - rig.head.position.x;
        assert.ok(centre > 6 && centre < 14, `${style} centre ${centre}`);
        assert.ok(b.max.x - b.min.x < 21, `${style} too wide`);
    }

    // Bow is a big arc (2D radius 18): about 30 units tall.
    const bow = fakeRig();
    attachItems(bow, { weapon: { style: 'bow' } });
    assert.ok(box(bow.armFront).getSize(new THREE.Vector3()).y > 26);

    // Flower sits on the left side of the head.
    const flower = fakeRig();
    attachItems(flower, { hat: { style: 'flower' } });
    const f = box(flower.head);
    assert.ok((f.min.x + f.max.x) / 2 - flower.head.position.x < -4);

    // Ink width follows the mesh scale, so outlined parts stay unscaled.
    const all = fakeRig();
    attachItems(all, {
        hat: { style: 'helmet' },
        back: { style: 'wings' },
        weapon: { style: 'axe' },
    });
    all.root.traverse((child) => {
        if (child.isMesh && child.material.side === THREE.BackSide) {
            const k = child.parent.scale;
            assert.ok(
                Math.max(k.x, k.y, k.z) < 2,
                `outlined part scaled ${k.toArray()}`,
            );
        }
    });
});

test('round 3 items read like the 2D drawing', () => {
    const meshes = (rig, style, slot = 'hat') => {
        attachItems(rig, { [slot]: { style } });
        const list = [];
        rig.root.updateMatrixWorld(true);
        rig.root.traverse((child) => {
            if (child.isMesh && child.material.side !== THREE.BackSide) {
                list.push(child);
            }
        });
        return list;
    };
    const hex = (mesh) => mesh.material.color?.getHexString();

    // Shield: item-colour face covers most of the disc (2D r 6.5 of 9).
    const shield = meshes(fakeRig(), 'shield', 'offhand');
    const face = shield.find((m) => hex(m) === 'c0392b');
    assert.ok(face, 'red shield face');
    face.geometry.computeBoundingSphere();
    assert.ok(face.geometry.boundingSphere.radius > 7, 'face too small');

    // Bow: held in front of the hand, toward the camera.
    const bowRig = fakeRig();
    meshes(bowRig, 'bow', 'weapon');
    const bowBox = new THREE.Box3().setFromObject(bowRig.armFront);
    assert.ok(bowBox.max.z > 9, `bow z ${bowBox.max.z}`);

    // Hood: one colour shell plus an ink edge around the face opening.
    const hood = meshes(fakeRig(), 'hood');
    const colours = new Set(hood.map(hex));
    assert.deepEqual(
        [...colours].sort(),
        ['1d2238', 'ffffff'].sort(),
        `hood colours ${[...colours]}`,
    );

    // Helmet brim is the darker band.
    const helmet = meshes(fakeRig(), 'helmet');
    assert.ok(helmet.some((m) => hex(m) !== 'ffffff' && hex(m) !== '1d2238'));
});
