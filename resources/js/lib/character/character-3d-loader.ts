/**
 * Lazy entry to the 3D character stack. Importing this file is cheap (no
 * three.js); `loadCharacter3D()` fetches the 3D chunk once and every caller
 * shares the same promise. Callers draw the 2D character until it resolves,
 * and keep doing so when it fails (old browser, no WebGL, offline chunk).
 */
import type { Character3D } from './character-3d';

let loading: Promise<Character3D | null> | null = null;
let loaded: Character3D | null = null;

export function loadCharacter3D(): Promise<Character3D | null> {
    if (!loading) {
        loading = import('./character-3d')
            .then((module) => {
                loaded = module;
                return module;
            })
            .catch(() => null);
    }
    return loading;
}

/** The 3D stack when already loaded, without waiting. */
export function character3D(): Character3D | null {
    return loaded;
}
