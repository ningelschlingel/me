import {
  easeOut,
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
  rotZ,
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

// ── Embedded: an old tube TV; something knocks, the screen cracks, a Pi Pico bursts out ──────

const roundRect = (cx: number, cy: number, w: number, h: number, r: number, z: (x: number, y: number) => number): V3[] => {
  const pts: V3[] = [];
  const corners = [[w / 2 - r, h / 2 - r, 0], [-w / 2 + r, h / 2 - r, 1], [-w / 2 + r, -h / 2 + r, 2], [w / 2 - r, -h / 2 + r, 3]];
  for (const [x, y, q] of corners)
    for (let i = 0; i <= 6; i++) {
      const a = (Math.PI / 2) * (q + i / 6);
      const px = cx + x + r * Math.cos(a), py = cy + y + r * Math.sin(a);
      pts.push([px, py, z(px, py)]);
    }
  pts.push(pts[0]);
  return pts;
};
const ring2 = (c: V3, r: number, n = 10): V3[] =>
  Array.from({ length: n + 1 }, (_, i) => add(c, [r * Math.cos((TAU * i) / n), r * Math.sin((TAU * i) / n), 0]));

const FRONT_Z = 0.34;
const SCREEN = { x: -0.13, y: 0.07, w: 0.92, h: 0.7 };
/** The CRT bulges towards you. */
const glass = (x: number, y: number) =>
  FRONT_Z + 0.02 + 0.05 * (1 - ((x - SCREEN.x) / (SCREEN.w / 2)) ** 2 * 0.5 - ((y - SCREEN.y) / (SCREEN.h / 2)) ** 2 * 0.5);
const HIT: V3 = [SCREEN.x + 0.06, SCREEN.y + 0.04, 0];

const TV: Stroke[] = (() => {
  const out: Stroke[] = [];
  const front = roundRect(0, 0.05, 1.36, 1.0, 0.12, () => FRONT_Z);
  out.push({ pts: front, weight: 1.3 });
  out.push({ pts: roundRect(SCREEN.x, SCREEN.y, SCREEN.w, SCREEN.h, 0.14, glass), weight: 1.1 });
  // the cabinet tapers to the back, like a real CRT
  const back = roundRect(0, 0.08, 0.84, 0.64, 0.08, () => -0.5);
  out.push({ pts: back, weight: 0.9 });
  for (const [fx, fy, bx, by] of [[-0.62, 0.5, -0.38, 0.36], [0.62, 0.5, 0.38, 0.36], [0.62, -0.4, 0.38, -0.2], [-0.62, -0.4, -0.38, -0.2]])
    out.push({ pts: [[fx, fy, FRONT_Z], [bx, by, -0.5]], weight: 0.9 });
  // knobs and the speaker grille
  out.push({ pts: ring2([0.5, 0.27, FRONT_Z + 0.01], 0.065), weight: 1 });
  out.push({ pts: ring2([0.5, 0.05, FRONT_Z + 0.01], 0.065), weight: 1 });
  for (let k = 0; k < 3; k++) out.push({ pts: [[0.42, -0.17 - k * 0.06, FRONT_Z], [0.58, -0.17 - k * 0.06, FRONT_Z]], weight: 0.6 });
  // rabbit ears
  out.push({ pts: Array.from({ length: 7 }, (_, i) => [0.1 * Math.cos((Math.PI * i) / 6), 0.55 + 0.06 * Math.sin((Math.PI * i) / 6), -0.05] as V3), weight: 1 });
  out.push({ pts: [[-0.03, 0.6, -0.05], [-0.4, 1.0, -0.12]], weight: 1 });
  out.push({ pts: [[0.03, 0.6, -0.05], [0.33, 1.05, 0.05]], weight: 1 });
  out.push({ pts: ring2([-0.4, 1.0, -0.12], 0.03, 8), weight: 1 });
  out.push({ pts: ring2([0.33, 1.05, 0.05], 0.03, 8), weight: 1 });
  // little legs
  for (const x of [-0.48, 0.48]) out.push({ pts: [[x, -0.45, 0.2], [x * 1.12, -0.64, 0.26]], weight: 1.1 });
  return out;
})();

/** Crack rays from the impact point: fixed points per ray, grown by `g`. */
const CRACKS: V3[][] = Array.from({ length: 7 }, (_, k) => {
  const a = (TAU * k) / 7 + rand(k, 40) * 0.6;
  const len = 0.24 + 0.2 * rand(k, 41);
  return Array.from({ length: 5 }, (_, j) => {
    const r = (len * j) / 4;
    const kink = j === 0 ? 0 : (rand(k * 5 + j, 42) - 0.5) * 0.5;
    const x = HIT[0] + r * Math.cos(a + kink), y = HIT[1] + r * Math.sin(a + kink);
    return [x, y, glass(x, y) + 0.003] as V3;
  });
});
const grow = (pts: V3[], g: number): V3[] => {
  const n = pts.length - 1;
  return pts.map((_, j) => {
    const at = Math.min(j / n, g) * n;
    const i = Math.min(n - 1, Math.floor(at));
    return lerp3(pts[i], pts[i + 1], at - i);
  });
};

function pico(): Stroke[] {
  const w = 0.11, h = 0.25;
  const out: Stroke[] = [
    { pts: [[-w, -h, 0], [w, -h, 0], [w, h, 0], [-w, h, 0], [-w, -h, 0]], weight: 1.1 },
    { pts: [[-0.045, -0.045, 0.005], [0.045, -0.045, 0.005], [0.045, 0.045, 0.005], [-0.045, 0.045, 0.005], [-0.045, -0.045, 0.005]], fill: 'accent', weight: 0.7 },
    { pts: [[-0.035, h, 0], [-0.035, h + 0.04, 0], [0.035, h + 0.04, 0], [0.035, h, 0]], weight: 0.8 },
  ];
  for (let i = 0; i < 6; i++) {
    const y = -h + 0.05 + (i * (2 * h - 0.1)) / 5;
    out.push({ pts: ring2([-w + 0.025, y, 0], 0.011, 6), weight: 0.5 });
    out.push({ pts: ring2([w - 0.025, y, 0], 0.011, 6), weight: 0.5 });
  }
  return out;
}
const PICO = pico();
const SHARDS = Array.from({ length: 6 }, (_, k) => {
  const a = (TAU * k) / 6 + rand(k, 50);
  return { dir: [Math.cos(a), Math.sin(a), 0] as V3, size: 0.04 + 0.03 * rand(k, 51), spin: norm([rand(k, 52) - 0.5, rand(k, 53) - 0.5, 1]) };
});

export const embedded: Scene = (t) => {
  const yaw = 0.22 * Math.sin(TAU * t);
  // The knock from inside: the set jolts just before the screen gives.
  const knock = Math.sin(Math.PI * span(t, 0.27, 0.35));
  const jolt: V3 = [0.018 * Math.sin(TAU * 34 * t) * knock, 0.012 * Math.sin(TAU * 26 * t) * knock, 0];
  const place = (p: V3) => rotY(add(p, jolt), yaw);
  const out: Stroke[] = TV.map((s) => ({ ...s, pts: s.pts.map(place) }));

  // Screen life: scanlines roll while it is whole, die when it breaks, return when it is fixed.
  const on = 1 - easeInOut(span(t, 0.34, 0.37)) + easeInOut(span(t, 0.84, 0.93));
  for (let k = 0; k < 5; k++) {
    const phase = (k / 5 + t * 3) % 1;
    const y = SCREEN.y - SCREEN.h / 2 + 0.08 + phase * (SCREEN.h - 0.16);
    const x0 = SCREEN.x - SCREEN.w / 2 + 0.1, x1 = SCREEN.x + SCREEN.w / 2 - 0.1;
    out.push({ pts: [[x0, y, glass(x0, y)], [x1, y, glass(x1, y)]].map((p) => place(p as V3)), weight: 0.5, ink: 0.45 * on * Math.sin(Math.PI * phase) });
  }

  // Cracks: shoot out on impact, stay, then fade while the screen comes back.
  const g = easeOut(span(t, 0.345, 0.385));
  const crackInk = span(t, 0.344, 0.346) * (1 - easeInOut(span(t, 0.74, 0.86)));
  for (const c of CRACKS) out.push({ pts: grow(c, g).map(place), weight: 0.8, ink: crackInk });
  out.push({ pts: ring2([HIT[0], HIT[1], glass(HIT[0], HIT[1]) + 0.004], 0.05 * g, 9).map(place), weight: 0.8, ink: crackInk });

  // The Pico: out of the hole, towards you, tumbling; it fades as it gets too close.
  const u = span(t, 0.345, 0.64);
  const fly = easeOut(u);
  const at: V3 = [lerp(HIT[0], 0.5, fly), HIT[1] + 0.5 * Math.sin(Math.PI * u) - 0.35 * fly * fly, lerp(FRONT_Z + 0.02, 1.15, fly)];
  const turn = (p: V3) => rotAxis(rotX(p, -0.5), norm([0.4, 1, 0.25]), TAU * 1.15 * fly);
  const picoInk = span(t, 0.345, 0.35) * (1 - span(u, 0.72, 1));
  for (const s of PICO) out.push({ ...s, pts: s.pts.map((p) => place(add(turn(p), at))), ink: picoInk });

  // Shards of glass follow it out and drop away.
  const v = span(t, 0.345, 0.6);
  const shardInk = span(t, 0.345, 0.35) * (1 - v);
  for (const sh of SHARDS) {
    const c: V3 = add(add(HIT, [0, 0, FRONT_Z + 0.05]), [sh.dir[0] * 0.45 * v, sh.dir[1] * 0.35 * v - 0.6 * v * v, 0.75 * v]);
    const tri = [0, 1, 2, 0].map((i) => rotAxis([sh.size * Math.cos((TAU * i) / 3), sh.size * Math.sin((TAU * i) / 3), 0], sh.spin, TAU * 1.5 * v));
    out.push({ pts: tri.map((p) => place(add(c, p))), weight: 0.6, ink: shardInk });
  }
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
