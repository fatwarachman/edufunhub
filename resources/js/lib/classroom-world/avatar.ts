/**
 * 3D avatar for the classroom world: the same 3D character model as the
 * portal and shop avatars (`buildCharacter`), scaled from drawing units to
 * metres, so a student recognises the hat, outfit, cape or wand they set in
 * the character settings. Walk and emotes drive `poseCharacter`.
 */
import { classroomPose } from '@/lib/character/character-view';
import {
    type CharacterLook,
    type CharacterPose,
} from '@/lib/character/draw-character';
import {
    buildCharacter,
    type CharacterRig,
    poseCharacter,
} from '@/lib/character/model3d';
import * as THREE from 'three';

/** Drawing units (1 px of the 2D character) to metres: ~1.55 m tall. */
export const AVATAR_SCALE = 1.55 / 80;

const DEFAULT_LOOK: CharacterLook = {
    color: 'amber',
    gender: 'boy',
    skin: 'light',
    hair: 'brown',
};

let shadowGeometry: THREE.CircleGeometry | null = null;

function shadowMesh(): THREE.Mesh {
    shadowGeometry ??= new THREE.CircleGeometry(0.34, 20);
    // Own material per avatar: scene.dispose() disposes every mesh material.
    const shadow = new THREE.Mesh(
        shadowGeometry,
        new THREE.MeshBasicMaterial({
            color: '#000000',
            transparent: true,
            opacity: 0.18,
            depthWrite: false,
        }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.01;
    return shadow;
}

/** Parts the scene moves (root) and the inner character rig. */
export interface AvatarRig {
    /** Metre-scaled wrapper; the scene positions and turns it. */
    root: THREE.Group;
    body: THREE.Object3D;
    head: THREE.Object3D;
    armL: THREE.Object3D;
    armR: THREE.Object3D;
    legL: THREE.Object3D;
    legR: THREE.Object3D;
    /** Height of the top of the head/hat (badge anchor), in metres. */
    top: number;
    /** The 3D character in drawing units (posed every frame). */
    character: CharacterRig;
    /** Reused pose object (no per-frame allocation). */
    pose: CharacterPose;
}

/** Builds an avatar. `look` null = default student look. */
export function buildAvatar(look: CharacterLook | null): AvatarRig {
    const character = buildCharacter(look ?? DEFAULT_LOOK);
    const root = new THREE.Group();
    const model = new THREE.Group();
    model.scale.setScalar(AVATAR_SCALE);
    model.add(character.root);
    character.root.traverse((obj) => {
        if (
            obj instanceof THREE.Mesh &&
            obj.material instanceof THREE.MeshToonMaterial
        ) {
            obj.castShadow = true;
        }
    });
    root.add(model);
    root.add(shadowMesh());

    return {
        root,
        body: character.body,
        head: character.head,
        armL: character.armBack,
        armR: character.armFront,
        legL: character.legBack,
        legR: character.legFront,
        top: character.top * AVATAR_SCALE,
        character,
        pose: { phase: 0, bob: 0, facingBack: false, flip: 1 },
    };
}

/**
 * Walk/idle animation. `speed` 0..1, `t` seconds. Emotes override arms.
 * Facing stays on `rig.root.rotation.y` (handled by the scene).
 */
export function animateAvatar(
    rig: AvatarRig,
    t: number,
    speed: number,
    emote: string | null,
    emoteAge: number,
): void {
    poseCharacter(
        rig.character,
        classroomPose(t, speed, emote, emoteAge, rig.pose),
    );
}
