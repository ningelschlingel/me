import { Scene, Stroke, TAU, V3, add, easeInOut, rotX, rotY, rotZ, scale, span, wave } from './math';
import { Skin, box, disc, face, lathe, pose, sleeve, triangulate } from './solids';

/*
 * The ME column: one family of small, solid objects. Ink-shaded bodies on paper, lit from
 * the upper left, fine outlines, and one accent per object. Each has its own way of moving
 * (it beats, breathes, floats, opens up, spins, tumbles) so no two slides feel the same.
 *
 * Same rules as everywhere: a pure function of the loop phase t ∈ [0, 1), integer
 * frequencies only, every motion back where it started.
 */

const PAPER: Skin = { tone: 'ink', lit: [0.07, 0.4] }; // light bodies (board, coin, ivory)
const DARK: Skin = { tone: 'ink', lit: [0.55, 0.95], weight: 0.35 }; // chips, dark parts
const METAL: Skin = { tone: 'ink', lit: [0.16, 0.55] };
const ACCENT: Skin = { tone: 'accent', lit: [0.72, 1] };

const ring = (c: V3, r: number, n = 16, plane: 'xy' | 'xz' = 'xy'): V3[] =>
  Array.from({ length: n + 1 }, (_, i) => {
    const a = (TAU * i) / n;
    return add(c, plane === 'xy' ? [r * Math.cos(a), r * Math.sin(a), 0] : [r * Math.cos(a), 0, r * Math.sin(a)]);
  });

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

// ── 01 Logic · "Systems that stay clean": eight blocks, perfectly aligned, catching the light ─

/** A four-point sparkle. */
function star(c: V3, r: number, spin: number, ink: number): Stroke[] {
  const ray = (a: number, len: number): V3 => add(c, rotZ([len, 0, 0], a + spin));
  const arm = (a: number, len: number, weight: number): Stroke => ({ pts: [ray(a, len), ray(a + Math.PI, len)], tone: 'accent', weight, ink });
  return [arm(0, r, 1.4), arm(Math.PI / 2, r, 1.4), arm(Math.PI / 4, r * 0.45, 0.9), arm((3 * Math.PI) / 4, r * 0.45, 0.9)];
}

export const logic: Scene = (t) => {
  const gap = 0.235 + 0.035 * wave(t, 2); // the blocks breathe apart and close ranks again
  const half = 0.19;
  const turn = (p: V3) => rotX(rotY(p, TAU * t), 0.3 + 0.08 * wave(t, 2));
  // A glint sweeps diagonally across, twice per loop; the block it touches lights up.
  const SWEEP = 3.6;
  const sweep = ((t * 2) % 1) * SWEEP - SWEEP / 2;
  const out: Stroke[] = [];
  for (const x of [-1, 1])
    for (const y of [-1, 1])
      for (const z of [-1, 1]) {
        const c: V3 = [x * gap, y * gap, z * gap];
        const hit = Math.exp(-((((x + y) / 2 - sweep) / 0.3) ** 2));
        const cube = box([c[0] - half, c[1] - half, c[2] - half], [c[0] + half, c[1] + half, c[2] + half], hit > 0.5 ? ACCENT : PAPER);
        out.push(...pose(cube, turn));
        // Where the glint leaves an outer corner, a star pops.
        const after = (sweep - (x + y) / 2 + SWEEP) % SWEEP;
        const life = after < 0.5 ? Math.sin((Math.PI * after) / 0.5) : 0;
        const corner = turn(scale([x, y, z], gap + half));
        out.push(...star(add(corner, [0, 0, 0.06]), 0.14 * life, after * 3, life > 0.01 ? 1 : 0));
      }
  return out;
};

// ── 02 Metal · "Close to the hardware": a Raspberry Pi Pico, floating ───────────────────────

const PICO: Stroke[] = (() => {
  const W = 0.21, L = 0.51, T = 0.02; // half width (x), half length (z), half thickness (y)
  const out: Stroke[] = [];
  out.push(...box([-W, -T, -L], [W, T, L], PAPER)); // the board
  out.push(...box([-0.075, T, -0.1], [0.075, T + 0.028, 0.05], DARK)); // RP2040
  out.push(...box([0.02, T, 0.13], [0.11, T + 0.02, 0.21], DARK)); // flash
  out.push(...box([-0.08, T, L - 0.11], [0.08, T + 0.055, L + 0.02], METAL)); // micro-USB
  out.push(...box([-0.16, T, 0.16], [-0.07, T + 0.02, 0.27], METAL)); // BOOTSEL
  out.push(...box([-0.135, T + 0.02, 0.19], [-0.095, T + 0.032, 0.24], PAPER));
  // Castellated pins: twenty gold pads down each long edge
  for (let i = 0; i < 20; i++) {
    const z = -L + 0.035 + (i * (2 * L - 0.07)) / 19;
    for (const s of [-1, 1])
      out.push({ pts: [[s * W, T + 0.001, z], [s * (W - 0.035), T + 0.001, z]], tone: 'mango', weight: 1.3, normal: [0, 1, 0], lift: 0.06 });
  }
  // Debug pads at the far end, and the USB opening
  for (const x of [-0.06, 0, 0.06]) out.push({ pts: ring([x, T + 0.001, -L + 0.035], 0.014, 8, 'xz'), tone: 'mango', weight: 1, normal: [0, 1, 0], lift: 0.06 });
  out.push({ pts: [[-0.055, T + 0.012, L + 0.021], [0.055, T + 0.012, L + 0.021], [0.055, T + 0.042, L + 0.021], [-0.055, T + 0.042, L + 0.021], [-0.055, T + 0.012, L + 0.021]], weight: 0.7, normal: [0, 0, 1], lift: 0.06 });
  return out;
})();

export const metal: Scene = (t) => {
  // It hovers and turns over slowly, like something you hold up to look at.
  const turn = (p: V3) => rotY(rotX(rotZ(p, 0.22 * wave(t, 2, 0.1)), 0.55 + 0.3 * wave(t, 1)), -0.5 + 0.7 * wave(t, 1, 0.25));
  const out = pose(PICO, turn, [0, 0.05 * wave(t, 2), 0]);
  // The LED blinks twice per loop.
  const on = Math.max(0, Math.sin(TAU * 2 * t)) ** 4;
  const led = box([0.1, 0.02, 0.3], [0.145, 0.034, 0.345], { tone: 'accent', lit: [0.35 + 0.65 * on, 0.35 + 0.65 * on] });
  out.push(...pose(led, turn, [0, 0.05 * wave(t, 2), 0]));
  return out;
};

// ── 03 Aesthetics · "Visual intuition": an interface, taken apart into its layers ───────────

const SCREEN = { w: 0.34, h: 0.6 };
const N: V3 = [0, 0, 1];

/** Lines printed on a layer (z set by the caller). */
const printed = (pts: [number, number][], z: number, s: Partial<Stroke> = {}): Stroke => ({
  pts: pts.map(([x, y]) => [x, y, z] as V3),
  normal: N,
  lift: 0.05,
  weight: 0.6,
  ...s,
});
const rect = (x0: number, y0: number, x1: number, y1: number): [number, number][] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];

export const aesthetics: Scene = (t) => {
  // The layers lift apart and settle back: wireframe, components, the finished surface.
  const open = 0.5 - 0.5 * Math.cos(TAU * t);
  const gap = 0.05 + 0.34 * easeInOut(open);
  const z = [-gap, 0, gap];
  const out: Stroke[] = [];

  // 1 · Wireframe: a plate with a grid and crossed-out placeholders
  out.push(...box([-SCREEN.w, -SCREEN.h, z[0] - 0.012], [SCREEN.w, SCREEN.h, z[0]], PAPER));
  const w = z[0] + 0.001;
  for (const x of [-0.17, 0, 0.17]) out.push(printed([[x, -SCREEN.h + 0.05], [x, SCREEN.h - 0.05]], w, { ink: 0.3, weight: 0.4 }));
  for (const y of [-0.36, -0.12, 0.12, 0.36]) out.push(printed([[-SCREEN.w + 0.05, y], [SCREEN.w - 0.05, y]], w, { ink: 0.3, weight: 0.4 }));
  out.push(printed(rect(-0.26, 0.12, 0.26, 0.5), w), printed([[-0.26, 0.12], [0.26, 0.5]], w), printed([[-0.26, 0.5], [0.26, 0.12]], w));
  out.push(printed(rect(-0.26, -0.48, 0.0, -0.36), w));

  // 2 · Components: the real blocks. The button gives a little when it is pressed.
  const press = Math.max(0, Math.sin(Math.PI * span(t, 0.52, 0.6)));
  out.push(...box([-0.26, 0.12, z[1]], [0.26, 0.5, z[1] + 0.035], ACCENT));
  out.push(...box([-0.26, -0.03, z[1]], [0.12, 0.05, z[1] + 0.02], DARK));
  out.push(...box([-0.26, -0.14, z[1]], [0.26, -0.1, z[1] + 0.012], METAL));
  out.push(...box([-0.26, -0.23, z[1]], [0.16, -0.19, z[1] + 0.012], METAL));
  out.push(...box([-0.26, -0.48, z[1]], [0.0, -0.36, z[1] + 0.04 - 0.025 * press], DARK));

  // 3 · Surface: the device outline, and the pointer that comes down to click
  const g = z[2];
  const corner = 0.07;
  const frame: [number, number][] = [];
  for (const [cx, cy, q] of [[SCREEN.w - corner, SCREEN.h - corner, 0], [-SCREEN.w + corner, SCREEN.h - corner, 1], [-SCREEN.w + corner, -SCREEN.h + corner, 2], [SCREEN.w - corner, -SCREEN.h + corner, 3]])
    for (let i = 0; i <= 5; i++) {
      const a = (Math.PI / 2) * (q + i / 5);
      frame.push([cx + corner * Math.cos(a), cy + corner * Math.sin(a)]);
    }
  frame.push(frame[0]);
  out.push(printed(frame, g, { weight: 1.4, normal: undefined }));
  out.push(printed([[-0.07, SCREEN.h - 0.05], [0.07, SCREEN.h - 0.05]], g, { weight: 1.6, normal: undefined }));
  // The pointer travels to the button, clicks, and wanders back.
  const go = easeInOut(span(t, 0.32, 0.52)) - easeInOut(span(t, 0.66, 0.9));
  const px = 0.16 - 0.3 * go, py = 0.02 - 0.42 * go;
  const tip: V3 = [px, py, g + 0.03 - 0.02 * press];
  const arrow: V3[] = [[0, 0, 0], [0, -0.17, 0], [0.045, -0.125, 0], [0.085, -0.2, 0], [0.11, -0.185, 0], [0.072, -0.11, 0], [0.13, -0.11, 0]].map((p) => add(p as V3, tip));
  out.push({ pts: [...arrow, arrow[0]], fill: 'accent', tone: 'ink', weight: 0.9, lift: 0.4 });
  // A ring ripples out from the click.
  const ripple = span(t, 0.56, 0.72);
  out.push(printed(ring([px, py, 0], 0.03 + 0.12 * ripple, 14).map(([x, y]) => [x, y] as [number, number]), g, { tone: 'accent', ink: Math.sin(Math.PI * ripple), weight: 1, normal: undefined }));

  // Leaning back like a phone on a stand, slowly looking left and right.
  const turn = (p: V3) => rotY(rotX(p, -0.95), 0.45 * Math.sin(TAU * t));
  return pose(out, turn);
};

// ── 04 Strategy · "The business interface": a coin. Heads: €. Tails: </>. ───────────────────

const COIN = { r: 0.62, t: 0.05, n: 40 };
const COIN_BODY: Stroke[] = (() => {
  const front = disc([0, 0, COIN.t], COIN.r, [1, 0, 0], [0, 1, 0], COIN.n);
  const back = disc([0, 0, -COIN.t], COIN.r, [1, 0, 0], [0, 1, 0], COIN.n);
  // A dark, heavy coin: the symbols pop in orange, the milled edge catches the light.
  const FACE: Skin = { tone: 'ink', lit: [0.62, 0.9], weight: 0.4 };
  const out = sleeve(front, back, { tone: 'ink', lit: [0.2, 0.7], weight: 0.3, ink: 0.5 }, false);
  out.push(face(front, [0, 0, 1], FACE), face(back, [0, 0, -1], FACE));
  const mark = (pts: [number, number][], side: 1 | -1, s: Partial<Stroke> = {}): Stroke => ({
    // The back is mirrored, so it reads the right way round when the coin has turned.
    pts: pts.map(([x, y]) => [side * x, y, side * (COIN.t + 0.003)] as V3),
    normal: [0, 0, side],
    lift: 0.12,
    tone: 'accent',
    weight: 2.4,
    ...s,
  });
  for (const side of [1, -1] as const)
    out.push(mark(ring([0, 0, 0], 0.53, 40).map(([x, y]) => [x, y] as [number, number]), side, { tone: 'mango', weight: 1, ink: 0.8 }));
  // Heads: the euro sign (an open arc and its two bars)
  const arc: [number, number][] = Array.from({ length: 21 }, (_, i) => {
    const a = (50 + (260 * i) / 20) * (Math.PI / 180);
    return [0.05 + 0.25 * Math.cos(a), 0.25 * Math.sin(a)];
  });
  out.push(mark(arc, 1), mark([[-0.33, 0.07], [0.09, 0.07]], 1), mark([[-0.33, -0.07], [0.05, -0.07]], 1));
  // Tails: </>
  out.push(mark([[-0.14, 0.2], [-0.34, 0], [-0.14, -0.2]], -1), mark([[0.07, 0.27], [-0.07, -0.27]], -1), mark([[0.14, 0.2], [0.34, 0], [0.14, -0.2]], -1));
  return out;
})();

export const strategy: Scene = (t) => {
  // One full turn per loop, lingering on each face so you can read it.
  const spin = TAU * t - 0.36 * Math.sin(2 * TAU * t);
  const turn = (p: V3) => rotZ(rotX(rotY(p, spin), -0.12 + 0.06 * wave(t, 2)), 0.08 * wave(t, 1, 0.2));
  return pose(COIN_BODY, turn, [0, 0.04 * wave(t, 2, 0.3), 0]);
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
