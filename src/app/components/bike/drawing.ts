/**
 * A technical drawing of an Orbea Orca Aero (size 53), drive side, true to its geometry chart:
 * stack 542, reach 385, head tube 72.8°, seat tube 73.5°, chainstays 408, BB drop 72, fork
 * rake 43 (so trail comes out at 60 and the wheelbase at 977), 700×28c tyres. The parts are
 * simplified to what reads at a glance; the geometry is not.
 *
 * Everything is in millimetres under one canvas transform, origin at the bottom bracket,
 * x forward, y down (the sheet's own direction). It draws itself like the Pico does: guides
 * shoot in (ground, axle line, the steering and seat axes), the wheels sweep round, the frame
 * grows along its tubes, the parts appear in place, and the geometry is measured in the
 * signal colour, one group of measures at a time.
 */

import { Draw, Pen, Pencil, circle, dim, ease, jitter, shoot, span } from '../drafting/drafting';

export type { Pen };

const deg = Math.PI / 180;
type P = [number, number];

// ── Geometry ───────────────────────────────────────────────────────────────────────────────

export const GEO = { stack: 542, reach: 385, hta: 72.8, sta: 73.5, cs: 408, drop: 72, rake: 43, head: 125 };
/** Tyre outer radius (622 bead seat + 28 mm tyre), the rim's edge and its inner edge (50 mm deep). */
const TYRE = 339;
const RIM = 311;
const RIM_IN = 261;

const add = (a: P, b: P): P => [a[0] + b[0], a[1] + b[1]];
const mul = (a: P, k: number): P => [a[0] * k, a[1] * k];

export const BB: P = [0, 0];
/** Rear axle: the chainstay's length, dropped by the BB drop. */
export const REAR: P = [-Math.sqrt(GEO.cs ** 2 - GEO.drop ** 2), -GEO.drop];
/** Steering axis, pointing down the head tube; seat axis, pointing up from the BB. */
const HEAD_DIR: P = [Math.cos(GEO.hta * deg), Math.sin(GEO.hta * deg)];
const SEAT_DIR: P = [-Math.cos(GEO.sta * deg), -Math.sin(GEO.sta * deg)];
export const HEAD_TOP: P = [GEO.reach, -GEO.stack];
const HEAD_LOW = add(HEAD_TOP, mul(HEAD_DIR, GEO.head));
/** Front axle: on the axle line, `rake` in front of the steering axis. */
export const FRONT: P = (() => {
  const n: P = [HEAD_DIR[1], -HEAD_DIR[0]]; // perpendicular, forward
  const t = (GEO.stack - GEO.drop - GEO.rake * n[1]) / HEAD_DIR[1];
  return add(add(HEAD_TOP, mul(HEAD_DIR, t)), mul(n, GEO.rake));
})();
export const WHEELBASE = FRONT[0] - REAR[0];
const GROUND = -GEO.drop + TYRE;
/** Where the steering axis meets the ground, and so the trail. */
const AXIS_GROUND: P = [HEAD_TOP[0] + ((GROUND - HEAD_TOP[1]) / HEAD_DIR[1]) * HEAD_DIR[0], GROUND];
export const TRAIL = AXIS_GROUND[0] - FRONT[0];
const onSeat = (l: number) => add(BB, mul(SEAT_DIR, l));
const onHead = (l: number) => add(HEAD_TOP, mul(HEAD_DIR, l));
/** Saddle height (BB to the rails' clamp), and the clamp. */
const SADDLE = onSeat(700);
const SEAT_TOP = onSeat(480);

/** The cockpit: spacer, a one-piece stem and bar, the drop seen from the side. */
const CAP = onHead(-22);
const BAR = add(CAP, [100, 8]);
const DROP: P[] = [[0, 0], [30, -2], [63, 8], [88, 34], [98, 70], [87, 108], [52, 132], [12, 132]].map((p) => add(BAR, p as P));
const HOOD: P[] = [[30, -2], [58, -10], [82, -18], [96, -17]].map((p) => add(BAR, p as P));
const LEVER: P[] = [[78, -10], [104, 64]].map((p) => add(BAR, p as P));

/** Chainring (52 teeth: 105 mm pitch radius), the inner one (36), crank, cassette, jockey wheels. */
const RING = 105;
const RING_IN = 74;
const CRANK = 172.5;
const COGS = [61, 52, 43, 34, 26];
const COG = 43; // the one the chain is on
const JOCKEY_UP = add(REAR, [6, 64]);
const JOCKEY_LOW = add(REAR, [26, 132]);
const JOCKEY_R = 9;

/** A tube: a centre line and its side-view depth. */
interface Tube {
  pts: P[];
  w: number;
}

// ── The frame, as drawn parts ──────────────────────────────────────────────────────────────
//
// Every tube is its own closed shape (two sides and two ends), drawn as separate strokes. Where
// one part runs into another its lines stop at the other's edge (hidden lines removed, once, at
// load) and shoot a little past it, as a draughtsman's lines do; square corners cross the same
// way. Rounded ends and circles flow on without a break.

type Cap = 'flat' | 'round';
/** One stroke of an outline, and whether each of its ends shoots past. */
interface Stroke {
  pts: P[];
  os: [boolean, boolean];
  closed?: boolean;
}
interface Part {
  outline: P[];
  strokes: Stroke[];
}

const sub = (a: P, b: P): P => [a[0] - b[0], a[1] - b[1]];
const lerp = (a: P, b: P, t: number): P => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const unit = (a: P): P => {
  const l = Math.hypot(a[0], a[1]) || 1;
  return [a[0] / l, a[1] / l];
};

/** A centre line through `pts` as a Catmull-Rom curve, its width eased between the points'. */
function spline(pts: P[], ws: number[]): { p: P; w: number }[] {
  const out: { p: P; w: number }[] = [];
  const N = 8;
  const f = (a: number, b: number, c: number, d: number, t: number) =>
    0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (3 * b - a - 3 * c + d) * t * t * t);
  for (let i = 0; i < pts.length - 1; i++) {
    const [p0, p1, p2, p3] = [pts[Math.max(0, i - 1)], pts[i], pts[i + 1], pts[Math.min(pts.length - 1, i + 2)]];
    for (let s = 0; s < N; s++) {
      const t = s / N;
      out.push({ p: [f(p0[0], p1[0], p2[0], p3[0], t), f(p0[1], p1[1], p2[1], p3[1], t)], w: ws[i] + (ws[i + 1] - ws[i]) * t });
    }
  }
  out.push({ p: pts[pts.length - 1], w: ws[ws.length - 1] });
  return out;
}

/**
 * A tube along `pts`, `w` deep (one value, or one per point), its ends square or round.
 * `curved`: the centre line is smoothed through the points (the bar), not straight between them.
 */
function member(pts: P[], w: number | number[], caps: [Cap, Cap] = ['flat', 'flat'], curved = false): Part {
  const ws = typeof w === 'number' ? pts.map(() => w) : w;
  const line = curved ? spline(pts, ws) : pts.map((p, i) => ({ p, w: ws[i] }));
  const n = line.length;
  const tan = line.map((_, i) => unit(sub(line[Math.min(n - 1, i + 1)].p, line[Math.max(0, i - 1)].p)));
  const side = (s: 1 | -1) => line.map(({ p, w }, i) => add(p, mul([-tan[i][1] * s, tan[i][0] * s], w / 2)));
  const L = side(1), R = side(-1);
  /** An end, from the L side round to the R side (at the end) or back (at the start). */
  const end = (i: number, s: 1 | -1, cap: Cap): P[] => {
    const { p, w } = line[i];
    const a: P = mul([-tan[i][1], tan[i][0]], s), b = mul(tan[i], s);
    if (cap === 'flat') return [add(p, mul(a, w / 2)), add(p, mul(a, -w / 2))];
    return Array.from({ length: 13 }, (_, j) => {
      const t = (Math.PI * j) / 12;
      return add(p, add(mul(a, (w / 2) * Math.cos(t)), mul(b, (w / 2) * Math.sin(t))));
    });
  };
  const head = end(n - 1, 1, caps[1]), tail = end(0, -1, caps[0]);
  const rev = [...R].reverse();
  const flat = caps.map((c) => c === 'flat') as [boolean, boolean];
  return {
    outline: [...L, ...head, ...rev, ...tail],
    strokes: [
      { pts: L, os: flat },
      { pts: head, os: [flat[1], flat[1]] },
      { pts: rev, os: [flat[1], flat[0]] },
      { pts: tail, os: [flat[0], flat[0]] },
    ],
  };
}

/** A round part: the BB shell, a dropout. */
function disc(o: P, r: number): Part {
  const pts = Array.from({ length: 49 }, (_, i): P => {
    const t = (Math.PI * 2 * i) / 48 + 1;
    return [o[0] + r * Math.cos(t), o[1] + r * Math.sin(t)];
  });
  return { outline: pts.slice(0, -1), strokes: [{ pts, os: [false, false], closed: true }] };
}

/** The frame and everything bolted solid to it, part by part. */
const PARTS: Part[] = [
  disc(BB, 36), // BB shell
  member([add(BB, [10, -8]), onHead(98)], [54, 50]), // down tube: deep and narrow
  member([BB, SEAT_TOP], [40, 36]), // seat tube
  member([onSeat(456), onHead(24)], [24, 30]), // top tube, sloping down to the back
  member([onHead(-6), HEAD_LOW, onHead(GEO.head + 18)], [52, 52, 40]), // head tube, into the crown
  member([add(BB, [-10, 6]), REAR], [28, 16]), // chainstay
  member([onSeat(345), REAR], [18, 12]), // dropped seatstay
  disc(REAR, 13), // rear dropout
  member([onHead(GEO.head + 6), FRONT], [32, 18]), // fork blade
  disc(FRONT, 12), // fork dropout
  member([onSeat(470), onSeat(722)], 30), // aero seatpost, out of the seat tube
  member([onHead(-3), CAP], 40), // spacer
  member([add(CAP, [-14, 0]), add(CAP, [52, 2]), add(BAR, [6, 0])], 30, ['round', 'flat'], true), // stem
  member(DROP, 22, ['flat', 'round'], true), // drop
  member(HOOD, [20, 30, 32, 22], ['flat', 'round'], true), // hood
  member(LEVER, [24, 10], ['flat', 'round']), // lever, broad where it leaves the hood
];

/** A visible run of a part's outline, in the direction it is drawn, and whether each end shoots past. */
interface Run {
  pts: P[];
  os: [boolean, boolean];
}

function inside([x, y]: P, poly: P[]) {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

const length = (pts: P[]) => pts.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]), 0);

/**
 * Each part's outline less what lies inside another part: the runs that show. A run cut by
 * another part shoots past the cut; its natural ends do as their stroke says.
 */
function visibleRuns(parts: Part[]): Run[][] {
  return parts.map((part, i) => {
    const others = parts.filter((_, j) => j !== i).map((q) => q.outline);
    const hidden = (p: P) => others.some((o) => inside(p, o));
    const runs: Run[] = [];
    for (const s of part.strokes) {
      const out: Run[] = [];
      let cur: Run | null = hidden(s.pts[0]) ? null : { pts: [s.pts[0]], os: [s.os[0], false] };
      for (let k = 1; k < s.pts.length; k++) {
        const a = s.pts[k - 1], b = s.pts[k];
        const steps = Math.max(1, Math.ceil(Math.hypot(...sub(b, a)) / 1.5));
        let was = hidden(a), t0 = 0;
        for (let j = 1; j <= steps; j++) {
          const t = j / steps, is = hidden(lerp(a, b, t));
          if (is !== was) {
            let lo = t0, hi = t;
            for (let it = 0; it < 16; it++) {
              const m = (lo + hi) / 2;
              if (hidden(lerp(a, b, m)) === was) lo = m;
              else hi = m;
            }
            const x = lerp(a, b, (lo + hi) / 2);
            if (cur) {
              cur.pts.push(x);
              cur.os[1] = true;
              out.push(cur);
              cur = null;
            } else cur = { pts: [x], os: [true, false] };
          }
          was = is;
          t0 = t;
        }
        if (cur) cur.pts.push(b);
      }
      if (cur) {
        cur.os[1] = s.os[1];
        out.push(cur);
        // A closed stroke cut somewhere: its last run carries on into its first.
        if (s.closed && out.length > 1 && out[0].pts[0] === s.pts[0]) {
          const first = out.shift()!;
          cur.pts.push(...first.pts.slice(1));
          cur.os[1] = first.os[1];
        }
      }
      runs.push(...out.filter((r) => length(r.pts) > 0.5));
    }
    // Each run drawn from whichever end the pen happens to start at.
    return runs.map((r, j): Run => (jitter(i * 53 + j * 7) < 0.5 ? r : { pts: [...r.pts].reverse(), os: [r.os[1], r.os[0]] }));
  });
}

const RUNS = visibleRuns(PARTS);

/** Saddle profile around its clamp: a lofted shell, wide at the back, thin at the nose. */
const SADDLE_SHAPE: P[] = [
  [-135, -26], [-112, -40], [-60, -38], [-10, -33], [60, -31], [118, -30], [146, -24],
  [146, -17], [110, -12], [40, -8], [-40, -8], [-110, -12], [-138, -18],
].map((p) => add(SADDLE, p as P));

/**
 * Everything the drawing may cover, mm, with room for the notes. The notes' text reaches a
 * little further in px (see Bike.resize).
 */
export const EXTENT = { x0: REAR[0] - TYRE - 20, x1: FRONT[0] + TYRE + 20, y0: SADDLE[1] - 70, y1: GROUND + 140 };

// ── Drawing ────────────────────────────────────────────────────────────────────────────────

export interface View {
  /** CSS px per mm, and where the BB sits. */
  k: number;
  x: number;
  y: number;
  /** 0…1: the drawing drawing itself, the first time it is seen. */
  reveal: number;
  /** The wheels' and the cranks' turn (radians). */
  wheel: number;
  crank: number;
  /** How much each group of measures shows, 0…1: fit, handling, drive. */
  groups: [number, number, number];
  /** Small screens: fewer, larger things. */
  compact: boolean;
}

export function drawBike(c: CanvasRenderingContext2D, v: View, pen: Pen) {
  const { k, reveal } = v;
  const u = 1 / k; // one CSS px, in mm
  const ink = (a: number) => `rgba(${pen.ink}, ${a})`;
  const red = (a: number) => `rgba(${pen.signal}, ${a})`;

  c.save();
  c.translate(v.x, v.y);
  c.scale(k, k);
  c.lineCap = 'round';
  c.lineJoin = 'round';
  const pencil = new Pencil(c, reveal);

  // ── 1 · Guides: the ground, the axle line and the two axes shoot in across the card ───────
  const FAR = 4000;
  const lineThrough = (p: P, d: P): [P, P] => [add(p, mul(d, -FAR)), add(p, mul(d, FAR))];
  const guides: { a: P; b: P; centre?: boolean; alpha: number }[] = [
    { a: [-FAR, GROUND], b: [FAR, GROUND], alpha: 0.32 },
    { a: [FAR, -GEO.drop], b: [-FAR, -GEO.drop], alpha: 0.16 },
    ...[lineThrough(HEAD_TOP, HEAD_DIR), lineThrough(BB, SEAT_DIR)].map(([a, b]) => ({ a: b, b: a, centre: true, alpha: 0.26 })),
    { a: [REAR[0], FAR], b: [REAR[0], -FAR], alpha: 0.12 },
    { a: [FRONT[0], -FAR], b: [FRONT[0], FAR], alpha: 0.12 },
  ];
  c.lineWidth = 0.6 * u;
  guides.forEach((g, i) => {
    const t = shoot(reveal, 0.02 + i * 0.04, 0.28 + i * 0.04);
    if (t <= 0) return;
    c.strokeStyle = ink(g.alpha);
    c.setLineDash(g.centre ? [9 * u, 2.5 * u, 1.5 * u, 2.5 * u] : []);
    c.beginPath();
    c.moveTo(...g.a);
    c.lineTo(g.a[0] + (g.b[0] - g.a[0]) * t, g.a[1] + (g.b[1] - g.a[1]) * t);
    c.stroke();
  });
  c.setLineDash([]);

  // ── 2 · Wheels: tyre, rim and hub sweep round, then the spokes and the hidden rotor ───────
  const lines = { u, ink, pencil, c };
  // The far crank and its pedal first: behind the wheels and the frame, a shade lighter.
  crank(lines, pen, v.crank + Math.PI, 0.55);
  for (const [i, hub] of [REAR, FRONT].entries()) wheel(lines, hub, 0.16 + i * 0.05, v.wheel, v.compact);

  // ── 3 · The frame, part by part, each grown along its lines; then its seams ───────────────
  frame(lines, pen, 0.3, 0.32);
  const saddle = pencil.at(0.56, 0.1);
  if (saddle > 0) {
    c.beginPath();
    SADDLE_SHAPE.forEach((p, i) => (i ? c.lineTo(...p) : c.moveTo(...p)));
    c.closePath();
    c.fillStyle = `rgba(${pen.paper}, ${saddle})`;
    c.fill();
    c.lineWidth = 1 * u;
    c.strokeStyle = ink(0.85 * saddle);
    c.stroke();
  }
  // Seams and small lines, each its own stroke: the headset's cups, the saddle's rails, the
  // axles.
  c.lineWidth = 0.55 * u;
  c.strokeStyle = ink(0.6);
  c.beginPath();
  const across = (p: P, d: P, w: number, a: number) => {
    const n: P = [-d[1], d[0]];
    pencil.line(p[0] - n[0] * w, p[1] - n[1] * w, p[0] + n[0] * w, p[1] + n[1] * w, a, 0.05);
  };
  across(onHead(2), HEAD_DIR, 26, 0.62);
  across(onHead(GEO.head - 4), HEAD_DIR, 26, 0.63);
  pencil.line(SADDLE[0] - 75, SADDLE[1] - 2, SADDLE[0] + 62, SADDLE[1] - 2, 0.66, 0.06);
  pencil.ring(...REAR, 5, 0.6, 0.04);
  pencil.ring(...FRONT, 5, 0.61, 0.04);
  c.stroke();

  // ── 4 · Drivetrain: cassette, chain, derailleur, chainring, crank ─────────────────────────
  drivetrain(lines, pen, v.crank, v.compact);

  // ── 5 · Geometry: one group of measures at a time, in the signal colour ───────────────────
  const notes = ease(span(reveal, 0.8, 1));
  if (notes > 0) {
    // The sheet is never turned; the small angle only decides which way vertical values read
    // (bottom to top).
    const d: Draw = { c, u, pen, angle: 0.05, ink: red };
    const [fit, handling, drive] = v.groups.map((g) => g * notes);
    if (fit > 0.01) {
      dim(d, [0, -GEO.stack], HEAD_TOP, 0, `REACH ${GEO.reach}`, fit);
      dim(d, BB, [0, -GEO.stack], 0, `STACK ${GEO.stack}`, fit);
    }
    if (handling > 0.01) {
      angle(d, [HEAD_TOP[0] + ((-GEO.drop - HEAD_TOP[1]) / HEAD_DIR[1]) * HEAD_DIR[0], -GEO.drop], -HEAD_DIR[1], -HEAD_DIR[0], 120, `${GEO.hta}°`, handling);
      dim(d, FRONT, REAR, TYRE + 115, `WHEELBASE ${Math.round(WHEELBASE)}`, handling, TYRE + 6);
      if (!v.compact) dim(d, [FRONT[0], GROUND], AXIS_GROUND, -50, `TRAIL ${Math.round(TRAIL)}`, handling, 0, true);
    }
    if (drive > 0.01) {
      angle(d, [-GEO.drop / Math.tan(GEO.sta * deg), -GEO.drop], SEAT_DIR[1], SEAT_DIR[0], 120, `${GEO.sta}°`, drive);
      dim(d, BB, REAR, 205, `CHAINSTAY ${GEO.cs}`, drive, 0);
      if (!v.compact) dim(d, BB, [0, -GEO.drop], -(CRANK + 70), `BB DROP ${GEO.drop}`, drive, -(RING + 20), true);
    }
    // The title block: what it is, quietly, on the ground line behind the rear wheel.
    if (!v.compact) {
      c.font = `500 ${7.5 * u}px ${pen.font}`;
      c.textBaseline = 'alphabetic';
      c.fillStyle = ink(0.55 * notes);
      c.fillText('ORCA AERO · 53', REAR[0] - TYRE, GROUND - 5 * u);
    }
  }

  c.restore();
}

interface Lines {
  c: CanvasRenderingContext2D;
  u: number;
  ink: (a: number) => string;
  pencil: Pencil;
}

function wheel({ c, u, ink, pencil }: Lines, hub: P, a: number, turn: number, compact: boolean) {
  const [x, y] = hub;
  // Tyre and rim: three circles, each sweeping round from its own angle.
  c.strokeStyle = ink(0.85);
  c.lineWidth = 1.1 * u;
  c.beginPath();
  pencil.ring(x, y, TYRE, a, 0.16);
  c.stroke();
  c.lineWidth = 0.75 * u;
  c.beginPath();
  pencil.ring(x, y, RIM, a + 0.03, 0.15);
  pencil.ring(x, y, RIM_IN, a + 0.06, 0.15);
  pencil.ring(x, y, 24, a + 0.1, 0.06);
  pencil.ring(x, y, 7, a + 0.12, 0.04);
  c.stroke();
  // Twelve bladed spokes, straight-pull, turning with the wheel; and the valve, so it shows.
  const spokes = pencil.at(a + 0.18, 0.12);
  if (spokes > 0) {
    c.lineWidth = 0.55 * u;
    c.strokeStyle = ink(0.5 * spokes);
    c.beginPath();
    const n = compact ? 8 : 12;
    for (let i = 0; i < n; i++) {
      const t = turn + (Math.PI * 2 * i) / n;
      const from = 24, to = RIM_IN;
      c.moveTo(x + from * Math.cos(t), y + from * Math.sin(t));
      c.lineTo(x + to * Math.cos(t + 0.06), y + to * Math.sin(t + 0.06));
    }
    const vt = turn + 0.26;
    c.moveTo(x + RIM_IN * Math.cos(vt), y + RIM_IN * Math.sin(vt));
    c.lineTo(x + (RIM_IN - 22) * Math.cos(vt), y + (RIM_IN - 22) * Math.sin(vt));
    c.stroke();
    // The brake rotor sits on the far side: a hidden line, dashed.
    c.setLineDash([5 * u, 3 * u]);
    c.strokeStyle = ink(0.4 * spokes);
    c.beginPath();
    circle(c, x, y, 80);
    circle(c, x, y, 62);
    c.stroke();
    c.setLineDash([]);
  }
}

function drivetrain(lines: Lines, pen: Pen, turn: number, compact: boolean) {
  const { c, u, ink, pencil } = lines;
  const [rx, ry] = REAR;
  // Cassette, concentric round the axle.
  c.lineWidth = 0.55 * u;
  c.strokeStyle = ink(0.6);
  c.beginPath();
  COGS.forEach((r, i) => pencil.ring(rx, ry, r, 0.6 + 0.02 * i, 0.08));
  c.stroke();

  // The chain: over the top, and round the jockey wheels underneath.
  const chain = pencil.at(0.68, 0.1);
  if (chain > 0) {
    c.lineWidth = 0.9 * u;
    c.strokeStyle = ink(0.7 * chain);
    c.setLineDash([2.4 * u, 1.6 * u]); // the links, more or less
    c.beginPath();
    c.moveTo(0, -RING);
    c.lineTo(rx, ry - COG);
    c.moveTo(0, RING);
    c.lineTo(JOCKEY_LOW[0], JOCKEY_LOW[1] + JOCKEY_R);
    c.moveTo(JOCKEY_LOW[0] - JOCKEY_R, JOCKEY_LOW[1]);
    c.lineTo(JOCKEY_UP[0] - JOCKEY_R, JOCKEY_UP[1]);
    c.moveTo(JOCKEY_UP[0], JOCKEY_UP[1] - JOCKEY_R);
    c.lineTo(rx, ry + COG);
    c.stroke();
    c.setLineDash([]);
  }
  // The derailleur: hanger, knuckle, cage and its two jockey wheels.
  tubes(c, [
    { pts: [add(REAR, [-4, 10]), add(REAR, [24, 36]), JOCKEY_UP], w: 16 },
    { pts: [JOCKEY_UP, JOCKEY_LOW], w: 12 },
  ], pencil, 0.64, 0.08, u, pen, 0.8);
  c.lineWidth = 0.6 * u;
  c.strokeStyle = ink(0.7);
  c.beginPath();
  pencil.ring(...JOCKEY_UP, JOCKEY_R, 0.7, 0.05);
  pencil.ring(...JOCKEY_LOW, JOCKEY_R, 0.71, 0.05);
  c.stroke();

  // Chainring: a solid disc on the drive side, two rings, a four-arm spider.
  const ring = pencil.at(0.58, 0.14);
  if (ring > 0) {
    c.fillStyle = `rgba(${pen.paper}, ${ring})`;
    c.beginPath();
    circle(c, 0, 0, RING + 4);
    c.fill();
  }
  c.lineWidth = 0.9 * u;
  c.strokeStyle = ink(0.85);
  c.beginPath();
  pencil.ring(0, 0, RING + 4, 0.58, 0.14);
  c.stroke();
  c.lineWidth = 0.55 * u;
  c.strokeStyle = ink(0.6);
  c.beginPath();
  pencil.ring(0, 0, RING - 5, 0.62, 0.12);
  pencil.ring(0, 0, RING_IN, 0.64, 0.1);
  if (!compact) pencil.ring(0, 0, RING_IN - 8, 0.66, 0.1);
  c.stroke();
  const spider = pencil.at(0.68, 0.08);
  if (spider > 0) {
    c.strokeStyle = ink(0.6 * spider);
    c.beginPath();
    for (let i = 0; i < 4; i++) {
      const t = turn + Math.PI / 4 + (Math.PI / 2) * i;
      c.moveTo(18 * Math.cos(t), 18 * Math.sin(t));
      c.lineTo((RING_IN - 8) * Math.cos(t), (RING_IN - 8) * Math.sin(t));
    }
    c.stroke();
  }
  crank(lines, pen, turn, 0.9);
}

/** A crank and its pedal, turning; the pedal stays level, as under a foot. */
function crank({ c, pencil, u, ink }: Lines, pen: Pen, turn: number, alpha: number) {
  const end: P = [CRANK * Math.cos(turn), CRANK * Math.sin(turn)];
  tubes(c, [
    { pts: [[0, 0], end], w: 24 },
    { pts: [add(end, [-44, 0]), add(end, [44, 0])], w: 12 },
    { pts: [[0, 0], [0, 0.01]], w: 34 },
  ], pencil, 0.7, 0.1, u, pen, alpha);
  c.fillStyle = ink((alpha - 0.2) * pencil.at(0.8, 0.04));
  c.beginPath();
  circle(c, 0, 0, 5);
  circle(c, ...end, 4);
  c.fill();
}

/**
 * The frame's parts, each growing at its own moment in [a, a + d]: first their paper (so what
 * lies behind is covered), then their visible lines, then the overshoots, which follow once a
 * part's lines are nearly drawn.
 */
function frame({ c, u, ink, pencil }: Lines, pen: Pen, a: number, d: number) {
  const ks = PARTS.map((_, i) => pencil.at(a + d * 0.7 * jitter(400 + i * 7 + PARTS.length), d * 0.35));
  PARTS.forEach((p, i) => {
    if (ks[i] <= 0) return;
    c.fillStyle = `rgba(${pen.paper}, ${ks[i]})`;
    c.beginPath();
    p.outline.forEach((q, j) => (j ? c.lineTo(...q) : c.moveTo(...q)));
    c.closePath();
    c.fill();
  });
  c.lineWidth = 1.1 * u;
  c.strokeStyle = ink(0.85);
  c.beginPath();
  RUNS.forEach((runs, i) => ks[i] > 0 && runs.forEach((r) => partial(c, r.pts, ks[i])));
  c.stroke();
  const over = 9 * u;
  c.lineWidth = 0.7 * u;
  c.strokeStyle = ink(0.5);
  c.beginPath();
  RUNS.forEach((runs, i) => {
    const f = ease(span(ks[i], 0.8, 1));
    if (f <= 0) return;
    for (const { pts, os } of runs) {
      const n = pts.length;
      for (const [on, p, q] of [[os[0], pts[0], pts[1]], [os[1], pts[n - 1], pts[n - 2]]] as const) {
        if (!on) continue;
        const dir = unit(sub(p, q));
        c.moveTo(...p);
        c.lineTo(...add(p, mul(dir, over * f)));
      }
    }
  });
  c.stroke();
}

/**
 * Tubes drawn as one merged outline (the derailleur, the cranks): every tube stroked wide in
 * ink, then all of them again a line narrower in paper, so where they meet the outlines flow
 * into each other. Each tube grows from its first point at its own moment in [a, a + d]. The
 * ink is mixed solid (not transparent), so overlaps don't darken.
 */
function tubes(c: CanvasRenderingContext2D, list: Tube[], pencil: Pencil, a: number, d: number, u: number, pen: Pen, alpha: number) {
  const ink = pen.ink.split(',').map(Number), paper = pen.paper.split(',').map(Number);
  const solid = `rgb(${ink.map((v, i) => Math.round(paper[i] + (v - paper[i]) * alpha)).join(',')})`;
  const grown = list.map((t, i) => {
    const k = pencil.at(a + d * 0.7 * jitter(400 + i * 7 + list.length), d * 0.35);
    return { t, k };
  });
  for (const pass of [0, 1]) {
    c.strokeStyle = pass ? `rgb(${pen.paper})` : solid;
    for (const { t, k } of grown) {
      if (k <= 0) continue;
      c.lineWidth = pass ? t.w : t.w + 2.2 * u;
      c.beginPath();
      partial(c, t.pts, k);
      c.stroke();
    }
  }
}

/** The first `k` (0…1) of a polyline, by length. */
function partial(c: CanvasRenderingContext2D, pts: P[], k: number) {
  const lens = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]));
  let left = lens.reduce((s, l) => s + l, 0) * k;
  c.moveTo(...pts[0]);
  for (let i = 1; i < pts.length; i++) {
    const l = lens[i - 1];
    if (left >= l) {
      c.lineTo(...pts[i]);
      left -= l;
    } else {
      const f = l ? left / l : 0;
      c.lineTo(pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f);
      break;
    }
  }
}

/**
 * An angle against the horizontal, measured towards the rear (as geometry charts do): an arc
 * from the horizontal leg to the axis (given by its direction's sine and cosine, pointing up),
 * a short horizontal leg, and the value just outside the arc.
 */
function angle(d: Draw, at: P, sin: number, cos: number, r: number, text: string, alpha: number) {
  const { c, u, ink } = d;
  const from = Math.PI; // the horizontal, pointing back
  const to = Math.atan2(sin, cos) + Math.PI * 2; // the axis, pointing up
  c.lineWidth = 0.6 * u;
  c.strokeStyle = ink(0.6 * alpha);
  c.beginPath();
  c.moveTo(at[0] - r - 24, at[1]);
  c.lineTo(at[0], at[1]);
  c.moveTo(at[0] + r * Math.cos(from), at[1] + r * Math.sin(from));
  c.arc(at[0], at[1], r, from, to);
  c.stroke();
  // Arrowheads at both ends of the arc, along it.
  const head = 5 * u, wing = 1.6 * u;
  c.fillStyle = ink(0.6 * alpha);
  c.beginPath();
  for (const [t, dir] of [[from, -1], [to, 1]] as const) {
    const x = at[0] + r * Math.cos(t), y = at[1] + r * Math.sin(t);
    const tx = -Math.sin(t) * dir, ty = Math.cos(t) * dir; // along the arc, outwards
    c.moveTo(x, y);
    c.lineTo(x - tx * head + ty * wing, y - ty * head - tx * wing);
    c.lineTo(x - tx * head - ty * wing, y - ty * head + tx * wing);
    c.closePath();
  }
  c.fill();
  const mid = (from + to) / 2;
  const tx = at[0] + (r + 22 * u) * Math.cos(mid), ty = at[1] + (r + 22 * u) * Math.sin(mid);
  c.save();
  c.translate(tx, ty);
  c.font = `500 ${9 * u}px ${d.pen.font}`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  const w = c.measureText(text).width + 5 * u;
  c.fillStyle = `rgba(${d.pen.paper}, ${alpha})`;
  c.fillRect(-w / 2, -5.5 * u, w, 11 * u);
  c.fillStyle = ink(0.8 * alpha);
  c.fillText(text, 0, 0);
  c.restore();
}
