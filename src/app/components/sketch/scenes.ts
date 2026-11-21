import {
  Scene,
  Stroke,
  TAU,
  V3,
  add,
  clamp01,
  dot,
  easeIn,
  easeInOut,
  easeOutBack,
  easeOutElastic,
  lerp,
  lerp3,
  norm,
  rand,
  rotAxis,
  rotX,
  rotY,
  scale,
  span,
  sub,
  wave,
} from './math';

/*
 * Every scene is a pure function of the loop phase t ∈ [0, 1).
 * Seamless by construction: everything periodic uses integer frequencies of t, and every
 * transition (assemble, fall, roll) is back at exactly its starting value when its window ends.
 */

// ── Architecture: sticks assemble into three structures, each one falls apart again ──────────

type Seg = [V3, V3];
const STICKS = 24;

function square(y: number, half: number, yaw = 0): V3[] {
  return [
    [-half, y, -half],
    [half, y, -half],
    [half, y, half],
    [-half, y, half],
  ].map((p) => rotY(p as V3, yaw));
}
const ring = (pts: V3[]): Seg[] => pts.map((p, i) => [p, pts[(i + 1) % pts.length]]);

function tower(): Seg[] {
  const b = square(-0.9, 0.36);
  const m = square(-0.2, 0.36);
  const t = square(0.55, 0.3, 0.42); // the top floor twists: a designed tower, not a box
  return [
    ...ring(b),
    ...b.map((p, i) => [p, m[i]] as Seg),
    ...ring(m),
    ...m.map((p, i) => [p, t[i]] as Seg),
    ...ring(t),
    ...m.map((p, i) => [p, t[(i + 1) % 4]] as Seg), // braces
  ];
}

function bridge(): Seg[] {
  const xs = [-1.05, -0.525, 0, 0.525, 1.05];
  const deck = -0.55;
  const arch = (x: number) => deck + 0.8 * (1 - (x / 1.05) ** 2);
  const segs: Seg[] = [];
  for (const z of [-0.32, 0.32]) {
    for (let i = 0; i < 4; i++) segs.push([[xs[i], deck, z], [xs[i + 1], deck, z]]);
    for (let i = 0; i < 4; i++) segs.push([[xs[i], arch(xs[i]), z], [xs[i + 1], arch(xs[i + 1]), z]]);
    for (const x of xs.slice(1, 4)) segs.push([[x, arch(x), z], [x, deck, z]]);
  }
  for (const x of [-0.525, 0.525]) segs.push([[x, deck, -0.32], [x, deck, 0.32]]);
  return segs;
}

function compound(): Seg[] {
  const c: V3 = [0, -0.12, 0];
  const cube = [...square(-0.45, 0.45, Math.PI / 4), ...square(0.45, 0.45, Math.PI / 4)].map((p) => add(p, c));
  const cubeSegs: Seg[] = [
    ...ring(cube.slice(0, 4)),
    ...ring(cube.slice(4)),
    ...[0, 1, 2, 3].map((i) => [cube[i], cube[i + 4]] as Seg),
  ];
  const r = 0.8;
  const oct: V3[] = [[r, 0, 0], [-r, 0, 0], [0, r, 0], [0, -r, 0], [0, 0, r], [0, 0, -r]].map((p) => add(p as V3, c));
  const octSegs: Seg[] = [];
  for (let i = 0; i < 6; i++)
    for (let j = i + 1; j < 6; j++) if (Math.floor(i / 2) !== Math.floor(j / 2)) octSegs.push([oct[i], oct[j]]);
  return [...cubeSegs, ...octSegs];
}

const mid = ([a, b]: Seg): V3 => scale(add(a, b), 0.5);
const angleOf = (s: Seg) => Math.atan2(mid(s)[2], mid(s)[0]);

/** Sorted around the y axis, so stick i always flies to a target on its own side of the cloud. */
const FORMATIONS: Seg[][] = [tower(), bridge(), compound()].map((f) => [...f].sort((a, b) => angleOf(a) - angleOf(b)));
const HEIGHT = FORMATIONS.map((f) => {
  const ys = f.map((s) => mid(s)[1]);
  const lo = Math.min(...ys), hi = Math.max(...ys);
  return ys.map((y) => (y - lo) / (hi - lo || 1));
});

const STICK = Array.from({ length: STICKS }, (_, i) => ({
  angle: (TAU * i) / STICKS + rand(i, 1) * 0.3,
  radius: 0.75 + 0.35 * rand(i, 2),
  y: -0.25 + 0.9 * (rand(i, 3) - 0.5),
  dir: norm([rand(i, 4) - 0.5, rand(i, 5) - 0.5, rand(i, 6) - 0.5]),
  axis: norm([rand(i, 7) - 0.5, 1, rand(i, 8) - 0.5]),
  turns: [1, -1, 2][i % 3],
  length: 0.28 + 0.2 * rand(i, 9),
  spin: norm([rand(i, 10) - 0.5, rand(i, 11) - 0.5, rand(i, 12) - 0.5]),
}));

function floating(i: number, t: number) {
  const s = STICK[i];
  const center = rotY([s.radius, s.y + 0.08 * wave(t, 2, rand(i, 13)), 0], s.angle + TAU * t);
  const dir = rotAxis(s.dir, s.axis, TAU * s.turns * t);
  return { center, dir };
}

export const architect: Scene = (t) => {
  const k = Math.min(2, Math.floor(t * 3));
  const u = t * 3 - k;
  const yaw = TAU * t;
  return FORMATIONS[k].map((seg, i) => {
    const s = STICK[i];
    const h = HEIGHT[k][i];
    // Builds from the ground up, falls from the top down.
    const build = easeOutBack(span(u, 0.06 + 0.07 * h, 0.34 + 0.07 * h));
    const fall = span(u, 0.62 + 0.07 * (1 - h), 0.88 + 0.07 * (1 - h));
    const w = build * (1 - easeIn(fall));

    const free = floating(i, t);
    const target = mid(seg);
    // Orient the target to match the floating stick (chosen once per window, so it never flips
    // mid-flight). The floating stick itself is never flipped: its ends stay put across windows.
    const ref = floating(i, (k + 0.2) / 3).dir;
    const raw = norm(sub(seg[1], seg[0]));
    const tdir = dot(ref, raw) < 0 ? scale(raw, -1) : raw;

    const wd = clamp01(w);
    const drop = Math.sin(Math.PI * fall); // 0 at both ends of the fall
    const center = add(lerp3(free.center, target, w), [0, -0.5 * drop, 0]);
    const dir = rotAxis(norm(lerp3(free.dir, tdir, wd)), s.spin, 2.4 * drop);
    // Assembled sticks overshoot their joints a little, like lines in an architect's sketch.
    const length = lerp(s.length, Math.hypot(...sub(seg[1], seg[0])), wd) * (1 + 0.16 * wd);
    const half = scale(dir, length / 2);
    return { pts: [rotY(sub(center, half), yaw), rotY(add(center, half), yaw)] };
  });
};

// ── Embedded & IoT: a mesh of devices; a pulse crosses it and every node it reaches twitches ──

const MESH = 14;
/** Devices: a golden-angle disc, jittered and lifted into a loose cloud, so they spread evenly with no clumps. */
const NODES: V3[] = Array.from({ length: MESH }, (_, i) => {
  const r = 0.95 * Math.sqrt((i + 0.5) / MESH);
  const a = i * 2.39996;
  const x = r * Math.cos(a) * 1.15 + 0.16 * (rand(i, 60) - 0.5);
  const z = r * Math.sin(a) * 0.85 + 0.16 * (rand(i, 61) - 0.5);
  return [x, 0.75 * (rand(i, 62) - 0.5) + 0.2 * (1 - r * r), z];
});
const gap = (i: number, j: number) => Math.hypot(...sub(NODES[i], NODES[j]));

/** Links: every node to its three nearest neighbours (each pair once), fixed on the rest positions. */
const LINKS: [number, number][] = (() => {
  const seen = new Set<string>();
  const out: [number, number][] = [];
  NODES.forEach((_, i) =>
    NODES.map((_, j) => j)
      .filter((j) => j !== i && gap(i, j) < 0.75)
      .sort((a, b) => gap(i, a) - gap(i, b))
      .slice(0, 3)
      .forEach((j) => {
        const key = `${Math.min(i, j)}-${Math.max(i, j)}`;
        if (!seen.has(key)) (seen.add(key), out.push([Math.min(i, j), Math.max(i, j)]));
      }),
  );
  return out;
})();

/** Distance along the links from `origin` to every node, and the node each was reached from. */
function spread(origin: number) {
  const dist = NODES.map(() => Infinity);
  const from = NODES.map(() => -1);
  dist[origin] = 0;
  const open = new Set(NODES.map((_, i) => i));
  while (open.size) {
    let i = -1;
    for (const k of open) if (i < 0 || dist[k] < dist[i]) i = k;
    open.delete(i);
    if (dist[i] === Infinity) break;
    for (const [a, b] of LINKS) {
      const j = a === i ? b : b === i ? a : -1;
      if (j >= 0 && open.has(j) && dist[i] + gap(i, j) < dist[j]) (dist[j] = dist[i] + gap(i, j)), (from[j] = i);
    }
  }
  return { dist, from };
}

/** Two pulses per loop, there and back between the two devices furthest apart along the links. */
const PULSES = (() => {
  let a = 0, b = 0, far = -1;
  NODES.forEach((_, i) => spread(i).dist.forEach((d, j) => Number.isFinite(d) && d > far && ((far = d), (a = i), (b = j))));
  return [a, b].map((origin, k) => {
    const { dist, from } = spread(origin);
    // The way the pulse was heading when it arrived: the shake's direction, from the rest positions.
    const centre = scale(NODES.reduce((s, p) => add(s, p), [0, 0, 0] as V3), 1 / MESH);
    const dir = NODES.map((p, i) => norm(from[i] < 0 ? sub(centre, p) : sub(p, NODES[from[i]])));
    // The route to the other end, for the packet riding the front.
    const route = [k ? a : b];
    while (from[route[0]] >= 0) route.unshift(from[route[0]]);
    return { origin, at: dist.map((d) => (Number.isFinite(d) ? d / far : 2)), dir, route, far };
  });
})();

/** A dot facing the camera (YOU's tilt), as a small filled hexagon. */
const DOT = Array.from({ length: 7 }, (_, i) => rotX([Math.cos((TAU * i) / 6), Math.sin((TAU * i) / 6), 0], -0.36));

/** When the front reaches a share `a` of the way, in the pulse's window. */
const arrive = (a: number) => 0.08 + 0.5 * a;
/** The twitch where the front arrives: forward first, a smaller recoil, gone within a moment. */
const twitch = (s: number) => (s <= 0 ? 0 : Math.sin((TAU * s) / 0.07) * Math.exp(-s / 0.05));

export const embedded: Scene = (t) => {
  const k = t < 0.5 ? 0 : 1;
  const u = t * 2 - k;
  const pulse = PULSES[k];
  const yaw = TAU * t;
  const front = (u - 0.08) / 0.5; // 0 … 1 while the pulse crosses

  const pos = NODES.map((p, i) => {
    const idle: V3 = [0.025 * wave(t, 2, rand(i, 63)), 0.025 * wave(t, 3, rand(i, 64)), 0.025 * wave(t, 1, rand(i, 65))];
    const kick = scale(pulse.dir[i], 0.06 * twitch(u - arrive(pulse.at[i])));
    return rotY(add(add(p, idle), kick), yaw);
  });

  // Links swell a touch as the front passes through them.
  const out: Stroke[] = LINKS.map(([a, b]) => {
    const mid = (pulse.at[a] + pulse.at[b]) / 2;
    return { pts: [pos[a], pos[b]], weight: 0.85 + 0.55 * Math.exp(-(((front - mid) / 0.06) ** 2)) };
  });

  // One packet rides the front along the route to the far end.
  const route = pulse.route.map((i) => pos[i]);
  const along = (d: number): V3 => {
    let left = Math.max(0, d) * pulse.far;
    for (let i = 1; i < pulse.route.length; i++) {
      const l = gap(pulse.route[i - 1], pulse.route[i]);
      if (left <= l) return lerp3(route[i - 1], route[i], left / l);
      left -= l;
    }
    return route[route.length - 1];
  };
  const f = clamp01(front);
  const packet = f > 0 && f < 1 ? Math.min(1, (1 - f) / 0.1) : 0;
  out.push({ pts: [along(f - 0.16), along(f - 0.08), along(f)], tone: 'accent', weight: 1.4, ink: packet });

  // Devices: a dot each; the sender in the accent.
  NODES.forEach((_, i) => {
    const sender = i === pulse.origin;
    out.push({ pts: DOT.map((d) => add(pos[i], scale(d, sender ? 0.036 : 0.026))), fill: sender ? 'accent' : 'ink', bare: true });
  });
  return out;
};

// ── Design: loose strokes bounce together into three joined shapes ───────────────────────────

const STROKES = 5;
const POINTS = 30;

const curve = (fn: (u: number) => V3, i: number) =>
  Array.from({ length: POINTS }, (_, j) => fn((i + j / (POINTS - 1)) / STROKES));

const SHAPES: ((i: number) => V3[])[] = [
  // a ring, tilted towards the eye
  (i) => curve((u) => rotX([0.82 * Math.cos(TAU * u), 0.82 * Math.sin(TAU * u), 0.12 * Math.sin(3 * TAU * u)], 0.45), i),
  // five petals meeting in the middle
  (i) =>
    curve((u) => {
      const a = Math.PI * u - Math.PI / 10;
      const r = 0.9 * Math.cos(5 * a);
      return rotX([r * Math.cos(a), r * Math.sin(a), 0.18 * Math.sin(3 * a)], 0.35);
    }, i),
  // a trefoil knot: one line that loops through itself
  (i) =>
    curve((u) => {
      const a = TAU * u;
      return scale([Math.sin(a) + 2 * Math.sin(2 * a), Math.cos(a) - 2 * Math.cos(2 * a), -Math.sin(3 * a)], 0.27);
    }, i),
];

function loose(i: number, t: number): V3[] {
  const center = rotY([0.85, 0.35 * (rand(i, 20) - 0.5) + 0.1 * wave(t, 2, rand(i, 21)), 0], (TAU * i) / STROKES + TAU * t);
  const axis = norm([rand(i, 22) - 0.5, 1, rand(i, 23) - 0.5]);
  const turn = TAU * t * (i % 2 ? 1 : -1);
  return Array.from({ length: POINTS }, (_, j) => {
    const a = -0.8 + (1.6 * j) / (POINTS - 1);
    const arc: V3 = [0.24 * Math.sin(a), 0.24 * (1 - Math.cos(a)), 0];
    return add(center, rotAxis(rotX(arc, rand(i, 24) * TAU), axis, turn));
  });
}

export const designer: Scene = (t) => {
  const k = Math.min(2, Math.floor(t * 3));
  const u = t * 3 - k;
  const yaw = TAU * t;
  return Array.from({ length: STROKES }, (_, i) => {
    const d = 0.04 * i;
    const join = easeOutElastic(span(u, 0.05 + d, 0.42 + d));
    const part = easeInOut(span(u, 0.66 + d * 0.5, 0.92 + d * 0.5));
    const w = join * (1 - part);
    const from = loose(i, t);
    const to = SHAPES[k](i);
    return { pts: from.map((p, j) => rotY(lerp3(p, to[j], w), yaw)), accent: i === 0, weight: 1.1 };
  });
};
