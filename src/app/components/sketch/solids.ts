import { Stroke, TAU, Tone, V3, add, norm, outward, scale, sub } from './math';

/*
 * Building blocks for solid, shaded models: every face is a lit polygon wound outwards,
 * with a fine outline. Models stay low-poly on purpose: few faces, precise joints.
 */

/** [bright, dark]: how much colour the most and the least lit side gets. */
export type Lit = [number, number];

export interface Skin {
  tone: Tone;
  lit: Lit;
  /** Outline weight and strength. */
  weight?: number;
  ink?: number;
  /** Fill only, no outline: for the bulk of a smooth body (tyres), where outlines would be noise. */
  bare?: boolean;
}

export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const centroid = (pts: V3[]): V3 => scale(pts.reduce((a, p) => add(a, p), [0, 0, 0] as V3), 1 / pts.length);

/** One lit face, wound so that it faces `out`. */
export function face(pts: V3[], out: V3, skin: Skin): Stroke {
  const p = outward(pts, out);
  return { pts: [...p, p[0]], fill: skin.tone, lit: skin.lit, weight: skin.weight ?? 0.4, ink: skin.ink ?? 0.6, ...(skin.bare ? { bare: true } : {}) };
}

/** An axis-aligned box. */
export function box(min: V3, max: V3, skin: Skin): Stroke[] {
  const [x0, y0, z0] = min, [x1, y1, z1] = max;
  const c: V3 = [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2];
  const faces: V3[][] = [
    [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]],
    [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]],
    [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]],
    [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]],
    [[x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0]],
    [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]],
  ];
  return faces.map((f) => face(f, sub(centroid(f), c), skin));
}

/** Joins two rings of the same length with quads (a sleeve); optionally closes both ends. */
export function sleeve(a: V3[], b: V3[], skin: Skin, caps = true): Stroke[] {
  const c = centroid([...a, ...b]);
  const out: Stroke[] = a.map((_, i) => {
    const j = (i + 1) % a.length;
    const q = [a[i], a[j], b[j], b[i]];
    return face(q, sub(centroid(q), c), skin);
  });
  if (caps) out.push(face(a, sub(centroid(a), c), skin), face(b, sub(centroid(b), c), skin));
  return out;
}

/** A straight member from a to b with a rectangular section: `depth` along `up`, `width` across. */
export function tube(a: V3, b: V3, up: V3, depth: number, width: number, skin: Skin, caps = true): Stroke[] {
  const dir = norm(sub(b, a));
  const side = norm(cross(dir, up));
  const n = norm(cross(side, dir));
  const ring = (p: V3): V3[] => [
    add(add(p, scale(n, depth / 2)), scale(side, width / 2)),
    add(add(p, scale(n, depth / 2)), scale(side, -width / 2)),
    add(add(p, scale(n, -depth / 2)), scale(side, -width / 2)),
    add(add(p, scale(n, -depth / 2)), scale(side, width / 2)),
  ];
  return sleeve(ring(a), ring(b), skin, caps);
}

/** A turned shape: a profile of [radius, height] spun around the y axis. */
export function lathe(profile: [number, number][], segments: number, skin: Skin): Stroke[] {
  const ring = ([r, y]: [number, number]): V3[] =>
    Array.from({ length: segments }, (_, i) => [r * Math.cos((TAU * i) / segments), y, r * Math.sin((TAU * i) / segments)] as V3);
  const out: Stroke[] = [];
  for (let k = 0; k < profile.length - 1; k++) {
    const a = ring(profile[k]), b = ring(profile[k + 1]);
    for (let i = 0; i < segments; i++) {
      const j = (i + 1) % segments;
      const q = [a[i], a[j], b[j], b[i]];
      const mid = (TAU * (i + 0.5)) / segments;
      // outwards and, where the profile narrows upwards, a little up
      out.push(face(q, [Math.cos(mid), (profile[k][0] - profile[k + 1][0]) * 1.5, Math.sin(mid)], skin));
    }
  }
  out.push(face(ring(profile[0]), [0, -1, 0], skin), face(ring(profile[profile.length - 1]), [0, 1, 0], skin));
  return out;
}

/** A flat regular polygon (disc) around c in the plane of u and v. */
export const disc = (c: V3, r: number, u: V3, v: V3, n: number): V3[] =>
  Array.from({ length: n }, (_, i) => add(c, add(scale(u, r * Math.cos((TAU * i) / n)), scale(v, r * Math.sin((TAU * i) / n)))));

/**
 * Ear clipping: triangulates a simple, counter-clockwise polygon. Of all ears, the one with the
 * shortest outline is cut first, which avoids the long thin slivers plain ear clipping produces.
 */
export function triangulate(poly: [number, number][]): [number, number, number][] {
  const idx = poly.map((_, i) => i);
  const area = (a: number, b: number, c: number) =>
    (poly[b][0] - poly[a][0]) * (poly[c][1] - poly[a][1]) - (poly[b][1] - poly[a][1]) * (poly[c][0] - poly[a][0]);
  const inside = (p: number, a: number, b: number, c: number) => area(a, b, p) >= 0 && area(b, c, p) >= 0 && area(c, a, p) >= 0;
  const dist = (a: number, b: number) => Math.hypot(poly[a][0] - poly[b][0], poly[a][1] - poly[b][1]);
  const tris: [number, number, number][] = [];
  while (idx.length > 3) {
    let best = -1, bestCost = Infinity;
    for (let i = 0; i < idx.length; i++) {
      const a = idx[(i + idx.length - 1) % idx.length], b = idx[i], c = idx[(i + 1) % idx.length];
      if (area(a, b, c) <= 1e-9) continue; // reflex corner: not an ear
      if (idx.some((p) => p !== a && p !== b && p !== c && inside(p, a, b, c))) continue;
      const cost = dist(a, b) + dist(b, c) + dist(c, a);
      if (cost < bestCost) { bestCost = cost; best = i; }
    }
    if (best < 0) break; // degenerate input: give up rather than loop
    tris.push([idx[(best + idx.length - 1) % idx.length], idx[best], idx[(best + 1) % idx.length]]);
    idx.splice(best, 1);
  }
  if (idx.length === 3) tris.push([idx[0], idx[1], idx[2]]);
  return tris;
}

/** Moves a model: `turn` rotates (points and surface normals), `to` shifts. */
export function pose(strokes: Stroke[], turn: (p: V3) => V3, to: V3 = [0, 0, 0]): Stroke[] {
  return strokes.map((s) => ({
    ...s,
    pts: s.pts.map((p) => add(turn(p), to)),
    ...(s.normal ? { normal: turn(s.normal) } : {}),
  }));
}

/** A direction perpendicular to `t`, stable for the given reference (falls back when they align). */
function perp(t: V3, ref: V3): V3 {
  let u = cross(t, ref);
  if (Math.hypot(...u) < 1e-4) u = cross(t, [1, 0, 0]);
  if (Math.hypot(...u) < 1e-4) u = cross(t, [0, 1, 0]);
  return norm(u);
}

/**
 * A smooth body swept along a path: at every point an ellipse of semi-axes [ru, rv] (u is the
 * in-plane direction when the path and `ref` are in one plane, v the other), `n` sides.
 * Quads between neighbouring stations, wound outwards; optional end caps.
 */
export function sweep(
  path: V3[],
  radius: (i: number) => [number, number],
  n: number,
  skin: Skin,
  ref: V3 = [0, 0, 1],
  caps = true,
): Stroke[] {
  const rings: V3[][] = path.map((p, i) => {
    const t = norm(sub(path[Math.min(path.length - 1, i + 1)], path[Math.max(0, i - 1)]));
    const u = perp(t, ref);
    const v = norm(cross(t, u));
    const [ru, rv] = radius(i);
    return Array.from({ length: n }, (_, k) => {
      const a = (TAU * k) / n;
      return add(p, add(scale(u, ru * Math.cos(a)), scale(v, rv * Math.sin(a))));
    });
  });
  const out: Stroke[] = [];
  for (let i = 0; i < path.length - 1; i++) {
    const mid = scale(add(path[i], path[i + 1]), 0.5);
    for (let k = 0; k < n; k++) {
      const q = [rings[i][k], rings[i][(k + 1) % n], rings[i + 1][(k + 1) % n], rings[i + 1][k]];
      out.push(face(q, sub(centroid(q), mid), skin));
    }
  }
  if (caps) {
    out.push(face(rings[0], sub(path[0], path[1]), skin));
    out.push(face(rings[path.length - 1], sub(path[path.length - 1], path[path.length - 2]), skin));
  }
  return out;
}

/** A straight, tapered member from a to b: radii [ru, rv] at each end. */
export function pipe(a: V3, b: V3, ra: [number, number], rb: [number, number], n: number, skin: Skin, ref: V3 = [0, 0, 1], caps = true): Stroke[] {
  return sweep([a, b], (i) => (i === 0 ? ra : rb), n, skin, ref, caps);
}

/** A torus (tyre, rim, chainring) around the z axis: major radius R, section radii [radial, axial]. */
export function torus(c: V3, R: number, section: [number, number], around: number, n: number, skin: Skin): Stroke[] {
  const ring = (a: number): V3[] =>
    Array.from({ length: n }, (_, k) => {
      const b = (TAU * k) / n;
      const r = R + section[0] * Math.cos(b);
      return [c[0] + r * Math.cos(a), c[1] + r * Math.sin(a), c[2] + section[1] * Math.sin(b)] as V3;
    });
  const out: Stroke[] = [];
  let prev = ring(0);
  for (let i = 1; i <= around; i++) {
    const cur = ring((TAU * i) / around);
    const mid = (TAU * (i - 0.5)) / around;
    const centre: V3 = [c[0] + R * Math.cos(mid), c[1] + R * Math.sin(mid), c[2]];
    for (let k = 0; k < n; k++) {
      const q = [prev[k], prev[(k + 1) % n], cur[(k + 1) % n], cur[k]];
      out.push(face(q, sub(centroid(q), centre), skin));
    }
    prev = cur;
  }
  return out;
}
