/**
 * Visual themes of the EduKart circuits (colours, fog, light, ground and
 * barrier style). Unknown themes fall back to the forest look.
 */

export type ThemeId = 'forest' | 'beach' | 'mandalika';

export interface SceneTheme {
    id: ThemeId;
    skyTop: string;
    skyHorizon: string;
    skyBottom: string;
    fog: string;
    fogNear: number;
    fogFar: number;
    hemiSky: string;
    hemiGround: string;
    hemiIntensity: number;
    sun: string;
    sunIntensity: number;
    /** Terrain colours: base, variant, near-road. */
    ground: [string, string, string];
    /** Road texture: base, speckles, tyre marks, centre dash (null none). */
    road: {
        base: string;
        speckle: string[];
        marks: string;
        dash: string | null;
        edgeLine: string | null;
    };
    /** Shoulder strip (between kerb and barrier) colour. */
    shoulder: string;
    /** Outer verge colour (slopes into the terrain). */
    verge: string;
    /** Has a sea plane. */
    sea: boolean;
    seaColor: string;
    clouds: boolean;
}

const THEMES: Record<ThemeId, SceneTheme> = {
    forest: {
        id: 'forest',
        skyTop: '#4fa3e8',
        skyHorizon: '#d9f0c2',
        skyBottom: '#9cc77a',
        fog: '#c6e3a8',
        fogNear: 90,
        fogFar: 430,
        hemiSky: '#e9f6ff',
        hemiGround: '#5b7d33',
        hemiIntensity: 1.55,
        sun: '#fff1cf',
        sunIntensity: 2.1,
        ground: ['#4d9a2c', '#62b236', '#7c8f3a'],
        road: {
            base: '#c48a52',
            speckle: ['#a87240', '#d49e66', '#8f5f34', '#e0b07c'],
            marks: 'rgba(110,70,35,0.35)',
            dash: '#fff1c9',
            edgeLine: null,
        },
        shoulder: '#5aa832',
        verge: '#4b9429',
        sea: false,
        seaColor: '#2f9fd8',
        clouds: true,
    },
    beach: {
        id: 'beach',
        skyTop: '#2d8ff0',
        skyHorizon: '#c8ecff',
        skyBottom: '#7fd3f2',
        fog: '#cdeefc',
        fogNear: 120,
        fogFar: 560,
        hemiSky: '#f4fbff',
        hemiGround: '#d8b981',
        hemiIntensity: 1.65,
        sun: '#fff6dd',
        sunIntensity: 2.2,
        ground: ['#f1d595', '#e8c67c', '#d9b46a'],
        road: {
            base: '#8d8a86',
            speckle: ['#7a7773', '#a29f9a', '#6c6965', '#b3ada3'],
            marks: 'rgba(50,50,55,0.28)',
            dash: '#ffffff',
            edgeLine: '#f6d24a',
        },
        shoulder: '#ecd08c',
        verge: '#e6c47d',
        sea: true,
        seaColor: '#1fa7d9',
        clouds: true,
    },
    mandalika: {
        id: 'mandalika',
        skyTop: '#3a8de0',
        skyHorizon: '#d8ecf7',
        skyBottom: '#9fcfe6',
        fog: '#d3e7f2',
        fogNear: 140,
        fogFar: 640,
        hemiSky: '#f2f8ff',
        hemiGround: '#6e8c4a',
        hemiIntensity: 1.5,
        sun: '#fff3d6',
        sunIntensity: 2.2,
        ground: ['#5fa83a', '#74bb45', '#8a9a55'],
        road: {
            base: '#55585f',
            speckle: ['#4a4d53', '#62656c', '#3f4247', '#6d7077'],
            marks: 'rgba(25,25,30,0.35)',
            dash: null,
            edgeLine: '#ffffff',
        },
        shoulder: '#8b8f96',
        verge: '#5ea239',
        sea: true,
        seaColor: '#1b95cf',
        clouds: true,
    },
};

export function themeFor(id: string): SceneTheme {
    return id in THEMES ? THEMES[id as ThemeId] : THEMES.forest;
}
