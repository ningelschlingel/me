import { Scene, Stroke, TAU, V3, rotY } from './math';
import { Skin, box, pose } from './solids';

/*
 * The ME column: one family of small, solid objects. Ink-shaded bodies on paper, lit from
 * the upper left, fine outlines, and one accent per object. Each has its own way of moving
 * (it beats, breathes, floats, opens up, spins, tumbles) so no two slides feel the same.
 *
 * Same rules as everywhere: a pure function of the loop phase t ∈ [0, 1), integer
 * frequencies only, every motion back where it started.
 */

const ACCENT: Skin = { tone: 'accent', lit: [0.72, 1] };

/** A heartbeat: lub-dub, then rest. x ∈ [0, 1) is one beat. */
function beat(x: number) {
  const bump = (c: number, w: number) => Math.exp(-(((x - c) / w) ** 2));
  return bump(0.12, 0.05) + 0.6 * bump(0.3, 0.06);
}

// ── 00 Hello · "Engineering emotion": a beating heart of voxels ─────────────────────────────

const HEART = ['.###.###.', '#########', '#########', '#########', '.#######.', '..#####..', '...###...', '....#....'];
const VOXEL = 0.19;
const CELLS: [number, number][] = HEART.flatMap((row, y) =>
  [...row].flatMap((c, x) => (c === '#' ? [[x - 4, 3.5 - y] as [number, number]] : [])),
);

export const heart: Scene = (t) => {
  const beats = 6; // per loop
  const yaw = 0.3 * Math.sin(TAU * t);
  const out: Stroke[] = [];
  for (const [cx, cy] of CELLS) {
    // Every voxel pulses outwards, a touch later the further it sits from the middle.
    const d = Math.hypot(cx, cy + 0.5);
    const p = beat((((t * beats - d * 0.015) % 1) + 1) % 1);
    const grow = 1 + 0.1 * p;
    const s = VOXEL * 0.45;
    const c: V3 = [cx * VOXEL * grow, cy * VOXEL * grow, 0.06 * p];
    out.push(...box([c[0] - s, c[1] - s, c[2] - 0.09], [c[0] + s, c[1] + s, c[2] + 0.09], ACCENT));
  }
  return pose(out, (v) => rotY(v, yaw));
};
