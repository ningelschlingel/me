import { Scene, Stroke, TAU, V3, rotX, rotY, rotZ, wave } from './math';
import { Skin, box, face, lathe, pose, triangulate } from './solids';

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

// ── 05 Analog · "Off screen": a chess knight, carved ────────────────────────────────────────

/** Side profile (x forward, y up) with the half thickness there, counter-clockwise. A control polygon, smoothed below. */
const CONTROL: [number, number, number][] = [
  [-0.28, -0.5, 0.19], [0.3, -0.5, 0.19], [0.28, -0.36, 0.18], [0.21, -0.2, 0.16], [0.12, -0.04, 0.14], [0.11, 0.05, 0.125],
  [0.22, 0.04, 0.11], [0.35, -0.02, 0.095], [0.47, 0.04, 0.085], [0.53, 0.14, 0.075], [0.5, 0.25, 0.08], [0.42, 0.33, 0.09],
  [0.33, 0.46, 0.1], [0.28, 0.58, 0.1], [0.27, 0.72, 0.05], [0.18, 0.84, 0.03], [0.1, 0.66, 0.07], [0.0, 0.62, 0.08],
  [-0.13, 0.52, 0.095], [-0.23, 0.36, 0.115], [-0.29, 0.16, 0.14], [-0.31, -0.1, 0.165], [-0.3, -0.36, 0.185],
];
/** One round of corner cutting: curvier outline, same character. */
const smooth = (p: [number, number, number][]): [number, number, number][] =>
  p.flatMap((a, i) => {
    const b = p[(i + 1) % p.length];
    const q = (k: number) => a.map((v, d) => v + (b[d] - v) * k) as [number, number, number];
    return [q(0.25), q(0.75)];
  });
const PROFILE = smooth(CONTROL);
const IVORY: Skin = { tone: 'ink', lit: [0.04, 0.5], weight: 0.3, ink: 0.5 };
const FACET: Skin = { ...IVORY, bare: true };

const KNIGHT: Stroke[] = (() => {
  const n = PROFILE.length;
  const P = PROFILE.map(([x, y]) => [x, y] as [number, number]);
  // The cheek sits a little inside the silhouette; a chamfer joins the two.
  const inward = (i: number): [number, number] => {
    const a = P[(i + n - 1) % n], b = P[i], c = P[(i + 1) % n];
    const e1 = [b[0] - a[0], b[1] - a[1]], e2 = [c[0] - b[0], c[1] - b[1]];
    const l1 = Math.hypot(e1[0], e1[1]) || 1, l2 = Math.hypot(e2[0], e2[1]) || 1;
    const nx = -e1[1] / l1 - e2[1] / l2, ny = e1[0] / l1 + e2[0] / l2;
    const l = Math.hypot(nx, ny) || 1;
    return [nx / l, ny / l];
  };
  const I = P.map(([x, y], i) => [x + inward(i)[0] * 0.035, y + inward(i)[1] * 0.035] as [number, number]);
  const tris = triangulate(I);
  const out: Stroke[] = [];
  for (const s of [1, -1]) {
    const cheek = (i: number): V3 => [I[i][0], I[i][1], s * PROFILE[i][2]];
    const edge = (i: number): V3 => [P[i][0], P[i][1], s * PROFILE[i][2] * 0.5];
    // Facets: no outlines inside the surface, only the shading tells them apart.
    for (const [a, b, c] of tris) out.push(face([cheek(a), cheek(b), cheek(c)], [0, 0, s], FACET));
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const nx = P[j][1] - P[i][1], ny = -(P[j][0] - P[i][0]);
      out.push(face([edge(i), edge(j), cheek(j), cheek(i)], [nx, ny, s * 0.7 * Math.hypot(nx, ny)], IVORY));
    }
    // Eye, nostril and mouth
    const on = (pts: [number, number][], z: number, weight = 0.9): Stroke => ({ pts: pts.map(([x, y]) => [x, y, s * z] as V3), normal: [0, 0, s], lift: 0.08, weight });
    out.push(on([[0.23, 0.44], [0.27, 0.47], [0.31, 0.44], [0.27, 0.415], [0.23, 0.44]], 0.1, 1.2));
    out.push(on([[0.5, 0.17], [0.47, 0.19]], 0.075, 1), on([[0.46, 0.03], [0.37, 0.02]], 0.085, 0.8));
  }
  // The silhouette's own thickness; the bottom edge stands on the base
  for (let i = 1; i < n; i++) {
    const j = (i + 1) % n;
    const q: V3[] = [[P[i][0], P[i][1], PROFILE[i][2] * 0.5], [P[j][0], P[j][1], PROFILE[j][2] * 0.5], [P[j][0], P[j][1], -PROFILE[j][2] * 0.5], [P[i][0], P[i][1], -PROFILE[i][2] * 0.5]];
    out.push(face(q, [P[j][1] - P[i][1], -(P[j][0] - P[i][0]), 0], IVORY));
  }
  // A turned base
  out.push(...lathe([[0.44, -0.92], [0.44, -0.86], [0.37, -0.81], [0.33, -0.75], [0.37, -0.7], [0.37, -0.66], [0.31, -0.61], [0.3, -0.5]], 20, { ...IVORY, bare: true }));
  return pose(out, (p) => p, [0, 0.08, 0]);
})();

export const analog: Scene = (t) => {
  // Weightless: it drifts and tumbles a little, never all the way round.
  const turn = (p: V3) => rotZ(rotX(rotY(p, -0.25 + 0.8 * Math.sin(TAU * t)), 0.3 * Math.sin(TAU * t + 1.2)), 0.2 * Math.sin(2 * TAU * t + 0.4));
  return pose(KNIGHT, turn, [0.04 * wave(t, 1, 0.1), 0.06 * wave(t, 2), 0]);
};
