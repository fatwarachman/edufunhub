import assert from 'node:assert/strict';
import test from 'node:test';
import {
    classroomPose,
    feetShadow,
    frameView,
    projectHeight,
    renderPixelSize,
} from './character-view.ts';

const VIEW = 80 + 38;
const FEET = VIEW - 10;
const TILT = 12;

function pose() {
    return { phase: 0, bob: 0, facingBack: false, flip: 1 };
}

test('frameView keeps the 2D view box: feet land on FEET_Y', () => {
    const f = frameView(VIEW, FEET, TILT);
    assert.equal(f.right - f.left, VIEW);
    assert.ok(f.top > 0 && f.bottom < 0);
    // Feet (y = 0) project to FEET / VIEW of the canvas height.
    assert.ok(Math.abs(projectHeight(f, 0, TILT) - FEET / VIEW) < 1e-9);
    // 80 units up projects 80 units higher, like the 2D drawing.
    const head = projectHeight(f, 80, TILT);
    assert.ok(Math.abs(head - (FEET - 80) / VIEW) < 1e-9);
    // Camera sits above the target and in front (+z): slight top-down view.
    assert.ok(f.eye[1] > f.targetY);
    assert.ok(f.eye[2] > 0);
    const angle = Math.atan2(f.eye[1] - f.targetY, f.eye[2]);
    assert.ok(Math.abs((angle * 180) / Math.PI - TILT) < 1e-9);
});

test('feetShadow matches the 2D avatar shadow and shrinks with bob', () => {
    const out = { alpha: 0, rx: 0, ry: 0 };
    feetShadow(0, out);
    assert.deepEqual(out, { alpha: 0.18, rx: 16, ry: 5 });
    feetShadow(10, out);
    assert.ok(Math.abs(out.alpha - 0.1) < 1e-9);
    assert.ok(Math.abs(out.rx - 11.2) < 1e-9);
    feetShadow(50, out);
    assert.ok(Math.abs(out.rx - 11.2) < 1e-9);
    assert.equal(feetShadow(-5, out).rx, 16);
});

test('renderPixelSize clamps to 1..512', () => {
    assert.equal(renderPixelSize(0), 1);
    assert.equal(renderPixelSize(Number.NaN), 1);
    assert.equal(renderPixelSize(191.6), 192);
    assert.equal(renderPixelSize(2000), 512);
});

test('classroomPose: walk swings with speed, idle breathes', () => {
    const out = pose();
    classroomPose(0.1, 1, null, 0, out);
    assert.ok(Math.abs(out.phase - Math.sin(1)) < 1e-9);
    assert.ok(Math.abs(out.bob - Math.abs(Math.sin(1)) * 2.5) < 1e-9);
    assert.equal(out.armFront, undefined);
    classroomPose(0.1, 0, null, 0, out);
    assert.equal(out.phase, 0);
    assert.ok(out.bob >= 0 && out.bob <= 0.8);
});

test('classroomPose emotes map to arms and bob', () => {
    const out = pose();
    classroomPose(1, 0, 'wave', 0.3, out);
    assert.ok(out.armFront <= -1.7 && out.armFront >= -2.1);
    classroomPose(1, 0, 'clap', 0.3, out);
    assert.ok(out.armFront < -1 && out.armBack < -1);
    classroomPose(1, 0, 'jump', 0.3, out);
    assert.ok(Math.abs(out.bob - 25) < 1e-9);
    assert.ok(out.armFront < -2 && out.armBack > 2);
    // Expired emote and unknown emote leave the arms free.
    classroomPose(1, 0, 'wave', 2, out);
    assert.equal(out.armFront, undefined);
    classroomPose(1, 0, 'unknown', 0.2, out);
    assert.equal(out.armFront, undefined);
    for (const value of Object.values(out)) {
        if (typeof value === 'number') {
            assert.ok(Number.isFinite(value));
        }
    }
});
