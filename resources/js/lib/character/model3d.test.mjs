import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';
import * as THREE from 'three';

// The app imports siblings without extensions (Vite/tsc bundler style);
// let node resolve `./x` to `./x.ts` for these tests.
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

const { GENDERS, HAIR_COLORS, SKIN_TONES } =
    await import('./draw-character.ts');
const { buildCharacter, CHARACTER_TOP, disposeCharacter, poseCharacter } =
    await import('./model3d.ts');

const ITEM_STYLES = {
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
    outfit: ['tunic', 'leather', 'robe', 'dress', 'armor'],
    back: ['cape', 'wings'],
    weapon: ['sword', 'wand', 'bow', 'staff', 'spear', 'mace', 'axe'],
    offhand: ['shield'],
};

function assertFiniteTree(root) {
    root.updateMatrixWorld(true);
    root.traverse((node) => {
        for (const value of node.matrixWorld.elements) {
            assert.ok(
                Number.isFinite(value),
                `non-finite matrix on ${node.type}`,
            );
        }
    });
}

function meshCount(root) {
    let count = 0;
    root.traverse((node) => {
        if (node.isMesh) {
            count++;
        }
    });
    return count;
}

test('builds every gender x skin x hair (incl. defaults)', () => {
    for (const gender of [...GENDERS, undefined]) {
        for (const skin of [...Object.keys(SKIN_TONES), undefined]) {
            for (const hair of [...Object.keys(HAIR_COLORS), undefined]) {
                const rig = buildCharacter({
                    color: 'amber',
                    gender,
                    skin,
                    hair,
                });
                assert.ok(rig.root instanceof THREE.Group);
                assert.ok(meshCount(rig.root) > 20);
                assert.equal(rig.eyes.length, 2);
                assert.equal(rig.blinkLines.length, 2);
                assert.ok(rig.top >= 75);
                assertFiniteTree(rig.root);
            }
        }
    }
});

test('rig pivots follow the contract', () => {
    const rig = buildCharacter({ color: 'teal' });
    assert.deepEqual(rig.head.position.toArray(), [0, 33, 0]);
    assert.deepEqual(rig.armFront.position.toArray(), [11, 29, 0]);
    assert.deepEqual(rig.armBack.position.toArray(), [-11, 29, 0]);
    assert.deepEqual(rig.backSlot.position.toArray(), [0, 30, -6]);
    assert.equal(CHARACTER_TOP, 80);
    const box = new THREE.Box3().setFromObject(rig.root);
    assert.ok(box.min.y > -1.5, `feet at ${box.min.y}`);
    assert.ok(box.max.y > 70 && box.max.y < 90, `head top at ${box.max.y}`);
});

test('every item style builds for boy and girl', () => {
    for (const gender of GENDERS) {
        for (const [slot, styles] of Object.entries(ITEM_STYLES)) {
            for (const style of styles) {
                for (const color of [undefined, null, '#33aa66']) {
                    const rig = buildCharacter({
                        color: 'violet',
                        gender,
                        items: { [slot]: { style, color } },
                    });
                    assert.ok(rig.top >= 75, `${slot}:${style} top ${rig.top}`);
                    assertFiniteTree(rig.root);
                }
            }
        }
        const full = buildCharacter({
            color: 'coral',
            gender,
            items: {
                hat: { style: 'wizard' },
                face: { style: 'mask' },
                outfit: { style: 'armor' },
                back: { style: 'wings' },
                weapon: { style: 'staff' },
                offhand: { style: 'shield' },
            },
        });
        assertFiniteTree(full.root);
    }
});

test('legacy accessory and unknown styles', () => {
    for (const accessory of ['cap', 'glasses', 'unknown']) {
        const rig = buildCharacter({ color: 'amber', accessory });
        assert.ok(rig.top >= 75);
    }
    const rig = buildCharacter({
        color: 'amber',
        items: {
            hat: { style: 'nope' },
            outfit: { style: 'nope' },
            weapon: { style: 'nope' },
            back: { style: 'nope' },
        },
    });
    assertFiniteTree(rig.root);
});

test('bad colours never throw', () => {
    for (const bad of ['red; x', '#zzzzzz', null, undefined, '', '__proto__']) {
        const rig = buildCharacter({
            color: bad,
            skin: bad,
            hair: bad,
            gender: bad,
            items: {
                hat: { style: 'cap', color: bad },
                outfit: { style: 'robe', color: bad },
                weapon: { style: 'sword', color: bad },
            },
        });
        assertFiniteTree(rig.root);
    }
    const custom = buildCharacter({ color: '#123456' });
    assertFiniteTree(custom.root);
});

test('pose with extreme values stays finite', () => {
    const rig = buildCharacter({
        color: 'amber',
        items: { weapon: { style: 'sword' } },
    });
    const poses = [
        {
            phase: 1,
            bob: 8,
            facingBack: false,
            flip: 1,
            armFront: -2.1,
            armBack: 2.9,
        },
        {
            phase: -1,
            bob: -3,
            facingBack: true,
            flip: -1,
            lean: 0.5,
            squash: 0.2,
            headTilt: 0.4,
        },
        {
            phase: 99,
            bob: 1e9,
            facingBack: false,
            flip: 0,
            armFront: -99,
            armBack: 99,
        },
        {
            phase: NaN,
            bob: NaN,
            facingBack: false,
            flip: NaN,
            lean: NaN,
            squash: NaN,
            headTilt: Infinity,
            armFront: NaN,
            armBack: -Infinity,
        },
    ];
    for (const pose of poses) {
        poseCharacter(rig, pose);
        assertFiniteTree(rig.root);
    }
});

test('wave raises the front hand beside the head, not through it', () => {
    const rig = buildCharacter({ color: 'amber' });
    poseCharacter(rig, {
        phase: 0,
        bob: 0,
        facingBack: false,
        flip: 1,
        armFront: -2.05,
    });
    rig.root.updateMatrixWorld(true);
    const hand = new THREE.Vector3(0, -12.5, 0).applyMatrix4(
        rig.armFront.matrixWorld,
    );
    assert.ok(hand.y > 33, `hand y ${hand.y}`);
    const headCentre = new THREE.Vector3(0, 50, 0);
    assert.ok(hand.distanceTo(headCentre) > 17, 'hand inside head');
    poseCharacter(rig, {
        phase: 0,
        bob: 0,
        facingBack: false,
        flip: 1,
        armFront: -0.3,
    });
    rig.root.updateMatrixWorld(true);
    const rest = new THREE.Vector3(0, -12.5, 0).applyMatrix4(
        rig.armFront.matrixWorld,
    );
    assert.ok(rest.y < 20 && rest.z > 0, 'rest hand hangs slightly forward');
});

test('blink toggles eyes and blink lines', () => {
    const rig = buildCharacter({ color: 'amber', gender: 'girl' });
    poseCharacter(rig, {
        phase: 0,
        bob: 0,
        facingBack: false,
        flip: 1,
        blink: true,
    });
    assert.ok(rig.eyes.every((eye) => !eye.visible));
    assert.ok(rig.blinkLines.every((line) => line.visible));
    poseCharacter(rig, { phase: 0, bob: 0, facingBack: false, flip: 1 });
    assert.ok(rig.eyes.every((eye) => eye.visible));
    assert.ok(rig.blinkLines.every((line) => !line.visible));
});

test('facingBack and flip set rotation and scale', () => {
    const rig = buildCharacter({ color: 'amber' });
    poseCharacter(rig, { phase: 0, bob: 2, facingBack: true, flip: -1 });
    assert.equal(rig.root.rotation.y, Math.PI);
    assert.equal(rig.root.scale.x, -1);
    assert.equal(rig.body.position.y, 2);
    poseCharacter(rig, { phase: 0, bob: 0, facingBack: false, flip: 1 });
    assert.equal(rig.root.rotation.y, 0);
    assert.equal(rig.root.scale.x, 1);
});

test('3/4 face: features on the right half, one ear on the left', () => {
    const rig = buildCharacter({ color: 'teal' });
    rig.root.updateMatrixWorld(true);
    const at = (node) =>
        new THREE.Vector3().setFromMatrixPosition(node.matrixWorld);
    for (const eye of rig.eyes) {
        assert.ok(at(eye).x > 4, `eye x ${at(eye).x}`);
        assert.ok(at(eye).z > 8, 'eye on the front');
    }
    let skull = null;
    rig.head.traverse((node) => {
        if (
            !skull &&
            node.isMesh &&
            node.geometry.type === 'SphereGeometry' &&
            node.geometry.parameters.radius === 17
        ) {
            skull = node;
        }
    });
    assert.ok(skull, 'head sphere');
    assert.ok(Math.abs(at(skull).y - 50) < 0.01, 'head centre at y 50');
    // No neck gap: the head bottom (y 33) meets the torso top (32.6).
    assert.ok(at(skull).y - 17 <= 33.01);
});

test('outline hull uses a normal offset with visible width on thin parts', () => {
    const rig = buildCharacter({ color: 'teal' });
    const hulls = [];
    rig.armFront.traverse((node) => {
        if (node.isMesh && node.material.side === THREE.BackSide) {
            hulls.push(node);
        }
    });
    assert.ok(hulls.length >= 2, 'sleeve and hand outlined');
    for (const hull of hulls) {
        assert.ok(
            hull.geometry.getAttribute('outlineNormal'),
            'outline normals',
        );
        assert.deepEqual(
            hull.scale.toArray(),
            [1, 1, 1],
            'no uniform scale-up',
        );
    }
});

test('dispose removes the rig from its parent', () => {
    const scene = new THREE.Scene();
    const rig = buildCharacter({ color: 'amber' });
    scene.add(rig.root);
    disposeCharacter(rig);
    assert.equal(rig.root.parent, null);
    assert.equal(scene.children.length, 0);
});

test('geometry cache keeps geometry count bounded', () => {
    const uuids = (rigs) => {
        const set = new Set();
        for (const rig of rigs) {
            rig.root.traverse((node) => {
                if (node.isMesh) {
                    set.add(node.geometry.uuid);
                }
            });
        }
        return set.size;
    };
    const skins = Object.keys(SKIN_TONES);
    const hairs = Object.keys(HAIR_COLORS);
    const make = (i) =>
        buildCharacter({
            color: ['amber', 'coral', 'teal', 'violet'][i % 4],
            gender: GENDERS[i % 2],
            skin: skins[i % skins.length],
            hair: hairs[i % hairs.length],
            items: { outfit: { style: ITEM_STYLES.outfit[i % 5] } },
        });
    const first = uuids(Array.from({ length: 10 }, (_, i) => make(i)));
    const thirty = uuids(Array.from({ length: 30 }, (_, i) => make(i)));
    assert.ok(thirty <= first + 5, `geometries grew ${first} -> ${thirty}`);
    assert.ok(thirty < 80, `too many geometries: ${thirty}`);
});
