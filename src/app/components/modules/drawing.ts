/**
 * "Systems that stay clean" as a technical drawing: eight modules, 19 mm cubes, in a 2 × 2 × 2
 * cluster, drawn in true isometric (orthographic, no vanishing points) like a page from a
 * drafting manual. The gaps between the modules breathe and are measured live; now and then
 * the cluster takes a quarter turn, and once a loop one module lifts out of its seat and goes
 * back: every part replaceable, every interface clean.
 *
 * Hidden lines are handled the way the Pico's parts are: every module's visible faces are
 * filled with paper, far modules first, so near ones cover what lies behind them. What runs
 * through or behind the cluster (axes, the envelope's far edges) disappears behind it on its own.
 *
 * Everything is drawn in CSS px: the model is in mm and projected with `k` px per mm.
 */

import { Draw, Pen, callout, dim, ease, jitter, shoot, smooth, span } from '../drafting/drafting';

type V3 = [number, number, number];

/** Module edge, mm. */
export const EDGE = 19;
/** Centre of a module from the cluster's centre: breathes between these (gap 1.0 … 8.0 mm). */
const OFFSET = { mid: 11.75, swing: 1.75 };
/** The envelope: a phantom cube that holds the cluster at its widest. */
const ENVELOPE = 49;
/** How far the lifted module rises, mm. */
const LIFT = 28;
/** True isometric: the cube's diagonal points at the eye. */
export const ISO = { yaw: Math.PI / 4, pitch: Math.atan(1 / Math.SQRT2) };

/** The module that carries the accent (its top face, the cluster's LED), and the one that lifts out. */
const ACCENT: V3 = [1, 1, 1];

export interface View {
  /** px per mm, and where the cluster's centre sits. */
  k: number;
  cx: number;
  cy: number;
  /** Camera: turn around y (radians, incl. quarter turns) and tilt from above. */
  yaw: number;
  pitch: number;
  /** Half the module spacing, mm (the gap is 2 × offset − EDGE). */
  offset: number;
  /** 0 … 1: the accent module out of its seat. */
  lift: number;
  /** 0 … 1: the drawing drawing itself, the first time it is seen. */
  reveal: number;
  /** 0 … 1: notes (dimensions, callouts) shown; they step aside while it turns. */
  notes: number;
  /** Small screens: no envelope, fewer notes. */
  compact: boolean;
}

/** Module and envelope corners, the 12 edges of a box (corner indices) and its 6 faces. */
const CORNERS: V3[] = [-1, 1].flatMap((x) => [-1, 1].flatMap((y) => [-1, 1].map((z) => [x, y, z] as V3)));
const EDGES: [number, number][] = [];
CORNERS.forEach((a, i) =>
  CORNERS.forEach((b, j) => {
    if (j > i && a.filter((v, d) => v !== b[d]).length === 1) EDGES.push([i, j]);
  }),
);
/** Faces: the axis, the side, and their four corners in order around the face. */
const FACES = [0, 1, 2].flatMap((axis) =>
  [-1, 1].map((side) => {
    const ring = CORNERS.map((c, i) => ({ c, i })).filter(({ c }) => c[axis] === side);
    // Order around the face: by angle in the face's plane.
    const [u, v] = [0, 1, 2].filter((d) => d !== axis);
    ring.sort((a, b) => Math.atan2(a.c[v], a.c[u]) - Math.atan2(b.c[v], b.c[u]));
    return { axis, side, corners: ring.map((r) => r.i) };
  }),
);

/** A projected point's screen position. */
const xy = (p: V3) => [p[0], p[1]];

export function drawModules(c: CanvasRenderingContext2D, v: View, pen: Pen) {
  const ink = (a: number) => `rgba(${pen.ink}, ${a})`;
  const paper = (a: number) => `rgba(${pen.paper}, ${a})`;
  const d: Draw = { c, u: 1, pen, angle: 0, ink };
  const cy = Math.cos(v.yaw), sy = Math.sin(v.yaw), cp = Math.cos(v.pitch), sp = Math.sin(v.pitch);
  /** mm, model space → [screen x, screen y, depth towards the eye]. */
  const P = ([x, y, z]: V3): V3 => {
    const rx = x * cy + z * sy, rz = -x * sy + z * cy;
    return [v.cx + rx * v.k, v.cy - (y * cp - rz * sp) * v.k, y * sp + rz * cp];
  };
  /** A direction's depth component (is a face turned towards the eye?). */
  const facing = (axis: number, side: number) => {
    const n: V3 = [0, 0, 0];
    n[axis] = side;
    return P(n)[2] - P([0, 0, 0])[2] > 1e-3;
  };
  const line = (a: V3, b: V3, k = 1) => {
    c.moveTo(a[0], a[1]);
    c.lineTo(a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k);
  };
  const box = (centre: V3, half: number) => CORNERS.map((q) => P([centre[0] + q[0] * half, centre[1] + q[1] * half, centre[2] + q[2] * half]));
  const { reveal } = v;
  c.lineCap = 'round';
  c.lineJoin = 'round';

  // ── 1 · Guides: the three axes through the centre (dash-dot), and the envelope's edges at its
  //       near bottom corner, run far out across the card. They shoot in first. ───────────────
  const FAR = 2000 / v.k;
  const near = CORNERS.reduce((best, q) => (P(q)[2] > P(best)[2] && q[1] < 0 ? q : best), [-1, -1, -1] as V3);
  const corner = near.map((s) => (s * ENVELOPE) / 2) as V3;
  const guides: { a: V3; b: V3; centre: boolean }[] = [0, 1, 2].flatMap((axis) => {
    const dir: V3 = [0, 0, 0];
    dir[axis] = FAR;
    const back = dir.map((x) => -x) as V3;
    const out = [{ a: back, b: dir, centre: true }];
    if (!v.compact) {
      // Along the envelope's edge: from far out on the near side, through the corner, far beyond.
      const from = [...corner] as V3, to = [...corner] as V3;
      from[axis] += near[axis] * FAR;
      to[axis] -= near[axis] * FAR;
      out.push({ a: from, b: to, centre: false });
    }
    return out;
  });
  c.lineWidth = 0.6;
  guides.forEach((g, i) => {
    const t = shoot(reveal, 0.02 + i * 0.045, 0.35 + i * 0.045);
    if (t <= 0) return;
    c.strokeStyle = ink(g.centre ? 0.26 : 0.14);
    c.setLineDash(g.centre ? [9, 2.5, 1.5, 2.5] : []);
    c.beginPath();
    line(P(g.a), P(g.b), t);
    c.stroke();
  });
  c.setLineDash([]);

  // ── 2 · The envelope: a phantom cube, its far edges drawn now (the modules will cover them
  //       where they pass behind), its near edges after the modules. ─────────────────────────
  const env = box([0, 0, 0], ENVELOPE / 2);
  const envDepth = (e: [number, number]) => env[e[0]][2] + env[e[1]][2];
  const envelope = (front: boolean) => {
    if (v.compact) return;
    c.lineWidth = 0.5;
    c.strokeStyle = ink(0.24);
    c.setLineDash([3, 3]);
    c.beginPath();
    EDGES.forEach((e, i) => {
      if (envDepth(e) > 0 !== front) return;
      const t = ease(span(reveal, 0.15 + 0.025 * i, 0.3 + 0.025 * i));
      if (t > 0) line(env[e[0]], env[e[1]], t);
    });
    c.stroke();
    c.setLineDash([]);
  };
  envelope(false);

  // ── 3 · The modules, far first. Each: visible faces on paper, then its edges. ──────────────
  const modules = CORNERS.map((q, i) => {
    const lifted = q.every((x, d) => x === ACCENT[d]);
    const centre: V3 = [q[0] * v.offset, q[1] * v.offset + (lifted ? LIFT * smooth(v.lift) : 0), q[2] * v.offset];
    return { q, i, lifted, centre, pts: box(centre, EDGE / 2), depth: P(centre)[2] };
  });
  const visible = FACES.filter((f) => facing(f.axis, f.side));
  const order = [...modules].sort((a, b) => a.depth - b.depth);
  // Drawn in from the back to the front, each with its own moment.
  order.forEach((m, rank) => {
    const a = 0.32 + 0.055 * rank;
    const fill = ease(span(reveal, a, a + 0.12));
    if (fill <= 0) return;

    // The empty seat while the module is out: a phantom of where it belongs.
    if (m.lifted && v.lift > 0.02) {
      const seat = box([m.centre[0], m.q[1] * v.offset, m.centre[2]], EDGE / 2);
      c.lineWidth = 0.55;
      c.strokeStyle = ink(0.4 * Math.min(1, v.lift * 3));
      c.setLineDash([2, 2.5]);
      c.beginPath();
      for (const [i, j] of EDGES) line(seat[i], seat[j]);
      c.stroke();
      c.setLineDash([]);
    }

    for (const f of visible) {
      const pts = f.corners.map((i) => m.pts[i]);
      c.beginPath();
      c.moveTo(pts[0][0], pts[0][1]);
      for (const p of pts.slice(1)) c.lineTo(p[0], p[1]);
      c.closePath();
      c.fillStyle = paper(fill);
      c.fill();
      // The accent: one face in the whole drawing, filled in last, like an LED coming on.
      if (m.lifted && f.axis === 1 && f.side === 1) {
        const on = ease(span(reveal, 0.8, 0.9));
        if (on > 0) {
          c.fillStyle = `rgba(${pen.signal}, ${0.95 * on})`;
          c.fill();
        }
      }
    }
    // Edges: the silhouette heavier than the edges inside it.
    const seen = new Map<string, number>();
    for (const f of visible)
      f.corners.forEach((i, n) => {
        const j = f.corners[(n + 1) % 4];
        const key = i < j ? `${i}-${j}` : `${j}-${i}`;
        seen.set(key, (seen.get(key) ?? 0) + 1);
      });
    const draw = ease(span(reveal, a, a + 0.16));
    for (const inner of [false, true]) {
      c.lineWidth = inner ? 0.7 : 1.1;
      c.strokeStyle = ink(inner ? 0.6 : 0.85);
      c.beginPath();
      [...seen].forEach(([key, count], n) => {
        if (count === 2 !== inner) return;
        const [i, j] = key.split('-').map(Number);
        const [p, q] = jitter(m.i * 13 + n) < 0.5 ? [m.pts[i], m.pts[j]] : [m.pts[j], m.pts[i]];
        line(p, q, draw);
      });
      c.stroke();
    }
  });
  envelope(true);

  // ── 4 · Notes: the module's size, the gap measured live, and two names. ───────────────────
  const notes = v.notes * ease(span(reveal, 0.85, 1));
  if (notes <= 0.01) return;
  c.textBaseline = 'middle';
  // A chain dimension down the cluster's leftmost edge, on the silhouette where it has room:
  // the top module, the gap (live, as it breathes), the bottom module.
  const e = EDGE / 2, o = v.offset;
  const [sx, sz] = [[-1, -1], [-1, 1], [1, -1], [1, 1]].reduce((best, q) =>
    P([q[0], 0, q[1]])[0] < P([best[0], 0, best[1]])[0] ? q : best,
  );
  const at = (y: number) => P([sx * (o + e), y, sz * (o + e)]);
  const gap = 2 * o - EDGE;
  // dim() offsets to the left of a→b: going up the edge on screen, left is outwards.
  const chain = 16;
  dim(d, xy(at(-o + e)), xy(at(o - e)), chain, gap.toFixed(1), notes, 3, true);
  if (!v.compact) {
    dim(d, xy(at(o - e)), xy(at(o + e)), chain, EDGE.toFixed(1), notes, 3);
    dim(d, xy(at(-o - e)), xy(at(-o + e)), chain, EDGE.toFixed(1), notes, 3);

    // Names: the modules, and while one is out, the interface it leaves.
    // On the side face of the nearest bottom module, out to the lower left.
    const low = modules.filter((m) => m.q[1] === -1).reduce((a, b) => (b.depth > a.depth ? b : a));
    const face = P([low.centre[0] + low.q[0] * e * 0.999, low.centre[1] - e * 0.3, low.centre[2]]);
    const faceZ = P([low.centre[0], low.centre[1] - e * 0.3, low.centre[2] + low.q[2] * e * 0.999]);
    const f = face[0] < faceZ[0] ? face : faceZ;
    callout(d, f[0], f[1], -34, 44, '8× MODULE', notes);
    const out = smooth(span(v.lift, 0.55, 1));
    if (out > 0.01) {
      const lifted = modules.find((m) => m.lifted)!;
      const below = P([lifted.centre[0], -v.offset + EDGE / 2, lifted.centre[2]]);
      callout(d, below[0], below[1], 30, 34, 'INTERFACE', notes * out);
    }
  }
}

/** Projected size of the drawing (unit scale, mm), over a whole quarter turn and with the module out. */
export function extent(compact: boolean) {
  const box = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
  const half = compact ? OFFSET.mid + OFFSET.swing + EDGE / 2 : ENVELOPE / 2;
  for (let s = 0; s <= 8; s++) {
    const yaw = ISO.yaw + (s / 8) * (Math.PI / 2);
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(ISO.pitch), sp = Math.sin(ISO.pitch);
    const pts: V3[] = CORNERS.map((q) => q.map((x) => x * half) as V3);
    // The lifted module's top.
    const top = OFFSET.mid + OFFSET.swing + EDGE / 2 + LIFT;
    pts.push(...CORNERS.map((q) => [q[0] * EDGE / 2 + OFFSET.mid, q[1] > 0 ? top : top - EDGE, q[2] * EDGE / 2 + OFFSET.mid] as V3));
    for (const [x, y, z] of pts) {
      const rx = x * cy + z * sy, rz = -x * sy + z * cy;
      const px = rx, py = -(y * cp - rz * sp);
      box.x0 = Math.min(box.x0, px);
      box.x1 = Math.max(box.x1, px);
      box.y0 = Math.min(box.y0, py);
      box.y1 = Math.max(box.y1, py);
    }
  }
  return box;
}

/** Module spacing at local time `s` (seconds): the gaps breathe three times per loop. */
export const offsetAt = (s: number, cycle: number) => OFFSET.mid + OFFSET.swing * Math.sin((2 * Math.PI * s * 3) / cycle);
