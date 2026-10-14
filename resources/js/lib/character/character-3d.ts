/**
 * Everything a 2D canvas needs to show the 3D character, bundled in one
 * module so pages load three.js lazily (`import('./character-3d')`) and
 * draw the 2D character meanwhile. Nothing here may be imported statically
 * from code that runs on every page.
 */
export {
    drawCharacter3DAt,
    renderCharacterTo,
    webglAvailable,
} from './character-renderer';
export {
    buildCharacter,
    disposeCharacter,
    poseCharacter,
    type CharacterRig,
} from './model3d';
/** The 2D drawing, for side-by-side QA of the 3D model. */
export { drawCharacter } from './draw-character';

/** Lazy loader for the 3D stack (one shared promise). */
export type Character3D = typeof import('./character-3d');
