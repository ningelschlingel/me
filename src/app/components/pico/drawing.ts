/**
 * A technical drawing of a Raspberry Pi Pico, true to its datasheet: a 51 × 21 × 1 mm board,
 * 3.9 mm tall overall, 40 pins at 2.54 mm in rows 17.78 mm apart, four Ø2.1 mm mounting holes
 * on 47 × 11.4 mm. Parts are simplified to what reads at a glance (outlines, pads, pin 1).
 *
 * A plan view, seen from straight above, with the sheet turned at an angle. Everything is
 * drawn in board millimetres under one canvas transform, so lines, dashes and text all turn
 * and scale together.
 *
 * It draws itself like a draughtsman would: long construction guides along the edges and
 * centre lines shoot in across the card first, the outline is traced along them, and the
 * rest appears in place. Then, slowly: the parts come off the board (exploded view), go
 * back, and a side view is projected out below the plan and taken back.
 */

const TAU = Math.PI * 2;

/** Board, mm. Origin at the corner by the USB socket; x along, y across (down on the sheet). */
export const BOARD = { l: 51, w: 21, t: 1 };
/** Height over all, to the top of the USB socket. */
const TALL = 3.9;

interface Part {
  x: number;
  y: number;
  w: number; // along x
  d: number; // along y
  h: number; // height, for the side view
  /** Where it moves in the exploded view, mm: off the nearest edge of the board. */
  out: [number, number];
}

export const PARTS = {
  rp2040: { x: 22, y: 7, w: 7, d: 7, h: 0.85, out: [0, -17] },
  flash: { x: 14.8, y: 3.8, w: 4, d: 3, h: 0.8, out: [0, -11] },
  usb: { x: -1.3, y: 6.5, w: 5.5, d: 8, h: TALL - BOARD.t, out: [-9, 0] },
  boot: { x: 8.6, y: 12.8, w: 4.2, d: 3.4, h: 1.6, out: [0, 11] },
  crystal: { x: 31.6, y: 13, w: 3.2, d: 2.5, h: 0.8, out: [0, 11.5] },
  coil: { x: 40, y: 4.6, w: 3, d: 3, h: 1.2, out: [0, -10.5] },
  led: { x: 4.8, y: 3.2, w: 1.6, d: 0.8, h: 0.5, out: [0, -9] },
} satisfies Record<string, Part>;
type PartName = keyof typeof PARTS;

const PITCH = 2.54;
const PIN_X0 = (BOARD.l - 19 * PITCH) / 2; // 20 pins centred on each long edge
const PIN_ROWS = [(BOARD.w - 17.78) / 2, (BOARD.w + 17.78) / 2];
const MOUNT = { r: 1.05, xs: [2, 49], ys: [(BOARD.w - 11.4) / 2, (BOARD.w + 11.4) / 2] };
const SWD = { x: 49.9, ys: [8, 10.5, 13] };
/** The side view sits this far below the plan (to the top of its tallest part). */
const SIDE_Y = BOARD.w + 12;

/**
 * Everything the drawing may cover, in board mm, with and without the side view. The notes
 * reach a little further in px (see Pico.resize).
 */
export const EXTENT = {
  full: { x0: -11, x1: 60, y0: -15, y1: SIDE_Y + TALL + 6 },
  compact: { x0: -11, x1: 58, y0: -15, y1: BOARD.w + 11 },
};

/** Colours as "r, g, b", and the font for notes. */
export interface Pen {
  ink: string;
  paper: string;
  signal: string;
  font: string;
}

export interface View {
  /** CSS px per mm, where the board's middle sits, and the sheet's turn (radians). */
  k: number;
  cx: number;
  cy: number;
  angle: number;
  /** 0…1: the drawing drawing itself, the first time it is seen. */
  reveal: number;
  /** 0 assembled … 1 taken apart (eased). */
  explode: number;
  /** 0 … 1: the side view being projected out (and, going back, taken in). */
  side: number;
  /** The onboard LED, 0 off … 1 on. */
  led: number;
  /** Small screens: fewer, larger things (no fine dimensions, no castellations). */
  compact: boolean;
}

export function drawPico(c: CanvasRenderingContext2D, v: View, pen: Pen) {
  const { k, reveal, explode: e, side } = v;
  const u = 1 / k; // one CSS px, in mm
  const ink = (a: number) => `rgba(${pen.ink}, ${a})`;
  const fine = !v.compact && k >= 5.2;

  c.save();
  c.translate(v.cx, v.cy);
  c.rotate(v.angle);
  c.scale(k, k);
  c.translate(-BOARD.l / 2, -BOARD.w / 2);
  c.lineCap = 'round';
  c.lineJoin = 'round';
  const pen_ = { c, u, pen, angle: v.angle, ink };

  // ── 1 · Construction guides: shoot in from outside the card ────────────────────────────
  // The four edges and both centre lines, run far past the board. Each comes in from one side
  // and crosses the whole card fast, then stays as a faint guide.
  const FAR = 400;
  const guides: { a: [number, number]; b: [number, number]; centre?: boolean }[] = [
    { a: [-FAR, 0], b: [FAR, 0] },
    { a: [BOARD.l, -FAR], b: [BOARD.l, FAR] },
    { a: [FAR, BOARD.w], b: [-FAR, BOARD.w] },
    { a: [0, FAR], b: [0, -FAR] },
    { a: [-FAR, BOARD.w / 2], b: [FAR, BOARD.w / 2], centre: true },
    { a: [BOARD.l / 2, FAR], b: [BOARD.l / 2, -FAR], centre: true },
  ];
  c.lineWidth = 0.6 * u;
  guides.forEach((g, i) => {
    const t = shoot(reveal, 0.02 + i * 0.045, 0.3 + i * 0.045);
    if (t <= 0) return;
    c.strokeStyle = ink(g.centre ? 0.26 : 0.16);
    c.setLineDash(g.centre ? [9 * u, 2.5 * u, 1.5 * u, 2.5 * u] : []);
    c.beginPath();
    c.moveTo(...g.a);
    c.lineTo(g.a[0] + (g.b[0] - g.a[0]) * t, g.a[1] + (g.b[1] - g.a[1]) * t);
    c.stroke();
  });
  c.setLineDash([]);

  // ── 2 · The board: four separate strokes, each from a corner, one after another ──────────
  const pencil = new Pencil(c, reveal);
  c.lineWidth = 1.1 * u;
  c.strokeStyle = ink(0.85);
  c.beginPath();
  pencil.box(0, 0, BOARD.l, BOARD.w, 0.28, 0.26, 1);
  c.stroke();

  // ── 3 · Holes, each closing its own circle at its own moment: they twinkle in ─────────────
  if (reveal > 0.4) {
    c.lineWidth = 0.6 * u;
    c.strokeStyle = ink(0.6);
    c.beginPath();
    const at = (n: number) => 0.42 + 0.2 * jitter(n); // scattered over the board, not in order
    for (let i = 0; i < 20; i++) {
      const x = PIN_X0 + i * PITCH;
      PIN_ROWS.forEach((y, row) => pencil.ring(x, y, 0.5, at(i * 2 + row), 0.07));
      if (!fine) continue;
      pencil.ring(x, 0, 0.75, at(100 + i), 0.07, 0, Math.PI);
      pencil.ring(x, BOARD.w, 0.75, at(200 + i), 0.07, Math.PI, Math.PI);
    }
    MOUNT.xs.forEach((x, i) => MOUNT.ys.forEach((y, j) => pencil.ring(x, y, MOUNT.r, 0.42 + 0.12 * jitter(60 + i * 2 + j), 0.1)));
    SWD.ys.forEach((y, i) => pencil.ring(SWD.x, y, 0.45, at(300 + i), 0.06));
    c.stroke();
    // Centre marks: dash-dot crosses through the mounting holes, once the holes are there.
    c.strokeStyle = ink(0.4);
    c.setLineDash([2.2 * u, 1.6 * u, 0.6 * u, 1.6 * u]);
    c.beginPath();
    MOUNT.xs.forEach((x, i) =>
      MOUNT.ys.forEach((y, j) => {
        const r = MOUNT.r * 1.9, a = 0.54 + 0.12 * jitter(70 + i * 2 + j);
        pencil.line(x - r, y, x + r, y, a, 0.08);
        pencil.line(x, y - r, x, y + r, a + 0.03 * jitter(80 + i * 2 + j), 0.08);
      }),
    );
    c.stroke();
    c.setLineDash([]);
  }

  // ── 4 · Parts, drawn in place; in the exploded view they slide off the board ────────────
  const parts = (Object.keys(PARTS) as PartName[]).map((name, i) => {
    const p: Part = PARTS[name];
    return { name, p, i, x: p.x + p.out[0] * e, y: p.y + p.out[1] * e };
  });
  if (e > 0.01) {
    // Where each sat, and the way it went.
    c.lineWidth = 0.55 * u;
    c.strokeStyle = ink(0.4 * Math.min(1, e * 2));
    c.setLineDash([2 * u, 2.5 * u]);
    c.beginPath();
    for (const { p, x, y } of parts) {
      c.rect(p.x, p.y, p.w, p.d);
      c.moveTo(p.x + p.w / 2, p.y + p.d / 2);
      c.lineTo(x + p.w / 2, y + p.d / 2);
    }
    c.stroke();
    c.setLineDash([]);
  }
  // Several parts at once, in no particular order, each its own handful of strokes.
  for (const q of parts) {
    const start = 0.48 + 0.2 * jitter(40 + q.i);
    if (reveal > start) drawPart(c, pencil, q.name, q.p, q.x, q.y, start, u, ink, pen, v.led);
  }

  // ── 5 · Notes: dimensions, callouts, names ─────────────────────────────────────────────
  const notes = ease(span(reveal, 0.78, 1));
  if (notes > 0) {
    c.font = `500 ${9 * u}px ${pen.font}`;
    c.textBaseline = 'middle';
    // Dimensions belong to the assembled board: they step aside while it is apart.
    const together = notes * (1 - step(0, 0.35, e));
    if (together > 0) {
      // Offsets are to the left of a→b: negative puts them below / to the right here.
      dim(pen_, [0, BOARD.w], [BOARD.l, BOARD.w], -5.5, '51.0', together);
      dim(pen_, [BOARD.l, BOARD.w], [BOARD.l, 0], -5, '21.0', together);
      if (fine) {
        dim(pen_, [MOUNT.xs[0], MOUNT.ys[0]], [MOUNT.xs[1], MOUNT.ys[0]], MOUNT.ys[0] + 3.5, '47.0', together);
        dim(pen_, [0, MOUNT.ys[1]], [0, MOUNT.ys[0]], 4.8, '11.4', together, -MOUNT.xs[0]);
        const px = PIN_X0 + 18 * PITCH;
        dim(pen_, [px, BOARD.w], [px + PITCH, BOARD.w], -2.4, '2.54', together, BOARD.w - PIN_ROWS[1], true);
        callout(pen_, MOUNT.xs[1], MOUNT.ys[1], 4, 7.5, '4× Ø2.1', together);
      }
    }
    // Names: the chip and the socket always; the rest only while apart.
    const name = (n: PartName, text: string, alpha: number, dx: number, dy: number) => {
      const q = parts.find((p) => p.name === n)!;
      if (alpha > 0.01) callout(pen_, q.x + q.p.w / 2, q.y + q.p.d / 2, dx, dy, text, alpha);
    };
    // In a row above the board; the chip's note rises with it when it comes off.
    name('rp2040', 'RP2040', notes, 9, -18.5 + 12 * e);
    name('usb', 'micro-USB', notes, -3, -18.5);
    const apart = notes * step(0.45, 0.9, e);
    name('flash', '2 MB flash', apart, -6, -4);
    name('boot', 'BOOTSEL', apart, -6, 5.5);
  }

  // ── 6 · Side view: projected out below the plan ────────────────────────────────────────
  if (side > 0.001 && !v.compact) drawSide(pen_, side);

  c.restore();
}

/**
 * One part, from `a` on in the reveal: its outline as four strokes, then its details, each a
 * stroke of its own with its own moment.
 */
function drawPart(
  c: CanvasRenderingContext2D,
  pencil: Pencil,
  name: PartName,
  p: Part,
  x: number,
  y: number,
  a: number,
  u: number,
  ink: (a: number) => string,
  pen: Pen,
  led: number,
) {
  const seed = 50 + 10 * Object.keys(PARTS).indexOf(name);
  // Solid on paper, so the guides do not run through it: it fills in as its outline closes.
  const solid = pencil.at(a, 0.14);
  c.fillStyle = `rgba(${pen.paper}, ${solid})`;
  c.fillRect(x, y, p.w, p.d);
  if (name === 'led' && led > 0.01 && solid >= 1) {
    c.fillStyle = `rgba(${pen.signal}, ${0.9 * led})`;
    c.fillRect(x, y, p.w, p.d);
  }
  c.lineWidth = (name === 'rp2040' ? 0.95 : 0.8) * u;
  c.strokeStyle = ink(0.85);
  c.beginPath();
  pencil.box(x, y, p.w, p.d, a, 0.14, seed);
  c.stroke();

  // Details follow, a beat behind the outline.
  const d = a + 0.08;
  const at = (n: number) => d + 0.16 * jitter(seed + n);
  c.lineWidth = 0.55 * u;
  c.strokeStyle = ink(0.6);
  c.beginPath();
  if (name === 'rp2040') {
    // QFN: pads along every edge (fewer than the real 56, so they read), the paddle, pin 1.
    const n = 9, l = 0.55;
    for (let i = 0; i < n; i++) {
      const f = (i + 0.5) / n, px = x + p.w * f, py = y + p.d * f;
      pencil.line(px, y, px, y + l, at(i), 0.05);
      pencil.line(px, y + p.d, px, y + p.d - l, at(i + n), 0.05);
      pencil.line(x, py, x + l, py, at(i + 2 * n), 0.05);
      pencil.line(x + p.w, py, x + p.w - l, py, at(i + 3 * n), 0.05);
    }
    pencil.box(x + 1.9, y + 1.9, p.w - 3.8, p.d - 3.8, d + 0.04, 0.1, seed + 7);
  } else if (name === 'flash') {
    // Eight pads, on the two long sides.
    for (let i = 0; i < 4; i++) {
      const px = x + 0.65 + i * ((p.w - 1.3) / 3);
      pencil.line(px, y, px, y + 0.5, at(i), 0.05);
      pencil.line(px, y + p.d, px, y + p.d - 0.5, at(i + 4), 0.05);
    }
  } else if (name === 'usb') {
    // The shell and, inside it, the tongue.
    pencil.box(x + 0.5, y + 0.6, p.w - 1, p.d - 1.2, d, 0.1, seed + 3);
    const t0 = y + p.d / 2 - 1.8, t1 = y + p.d / 2 + 1.8;
    pencil.line(x, t0, x + 2.4, t0, at(1), 0.07);
    pencil.line(x + 2.4, t0, x + 2.4, t1, at(2), 0.07);
    pencil.line(x, t1, x + 2.4, t1, at(3), 0.07);
  } else if (name === 'boot') {
    pencil.ring(x + p.w / 2, y + p.d / 2, 1.1, at(1), 0.1);
    pencil.ring(x + p.w / 2, y + p.d / 2, 0.55, at(2), 0.08);
  } else if (name === 'crystal') {
    pencil.box(x + 0.35, y + 0.35, p.w - 0.7, p.d - 0.7, d, 0.1, seed + 3);
  } else if (name === 'coil') {
    pencil.ring(x + p.w / 2, y + p.d / 2, 1.05, at(1), 0.1);
  }
  c.stroke();
  // Pin 1, dotted in last.
  const dot = name === 'rp2040' ? [x + 0.95, y + 0.95, 0.32] : name === 'flash' ? [x + 0.6, y + 1.1, 0.24] : null;
  if (dot && pencil.at(d + 0.1, 0.04) > 0) {
    c.fillStyle = ink(0.75 * pencil.at(d + 0.1, 0.04));
    c.beginPath();
    circle(c, dot[0], dot[1], dot[2]);
    c.fill();
  }
}

/**
 * Strokes that each draw themselves at their own moment, so a drawing appears in many places
 * at once. Moments and durations are in the reveal's units (0…1). Adds to the current path.
 */
class Pencil {
  constructor(
    private readonly c: CanvasRenderingContext2D,
    private readonly t: number,
  ) {}

  /** Progress (eased) of a stroke that starts at `a` and takes `d`. */
  at(a: number, d: number) {
    // Once the build is over, everything is drawn, however late its moment was.
    if (this.t >= 1) return 1;
    return ease(span(this.t, a, a + d));
  }

  /**
   * A straight stroke, drawn from one end to the other, as a pen would. Which end it starts
   * from, and how long it takes (±30 %), is its own: no two strokes quite alike.
   */
  line(x0: number, y0: number, x1: number, y1: number, a: number, d: number) {
    const id = Math.round(x0 * 131 + y0 * 71 + x1 * 37 + y1 * 17);
    const k = this.at(a, d * (0.7 + 0.6 * jitter(id + 1)));
    if (k <= 0) return;
    if (jitter(id) < 0.5) [x0, y0, x1, y1] = [x1, y1, x0, y0];
    this.c.moveTo(x0, y0);
    this.c.lineTo(x0 + (x1 - x0) * k, y0 + (y1 - y0) * k);
  }

  /** A circle (or arc), sweeping round from its start angle (by default, its own random one). */
  ring(x: number, y: number, r: number, a: number, d: number, from = NaN, sweep = TAU) {
    const k = this.at(a, d);
    if (k <= 0) return;
    const start = Number.isNaN(from) ? TAU * jitter(Math.round(x * 31 + y * 17)) : from;
    this.c.moveTo(x + r * Math.cos(start), y + r * Math.sin(start));
    this.c.arc(x, y, r, start, start + sweep * k);
  }

  /** A box as four separate strokes, each from a corner, starting at scattered moments in [a, a + d]. */
  box(x: number, y: number, w: number, h: number, a: number, d: number, seed: number) {
    const edges = [
      [x, y, x + w, y],
      [x + w, y, x + w, y + h],
      [x + w, y + h, x, y + h],
      [x, y + h, x, y],
    ];
    edges.forEach(([x0, y0, x1, y1], i) => this.line(x0, y0, x1, y1, a + d * 0.6 * jitter(seed * 4 + i), d * 0.45));
  }
}

/** A fixed pseudo-random number in [0, 1) for each n: the same scatter on every load. */
function jitter(n: number) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** The side view: projection lines shoot down from the plan, then the elevation appears. */
function drawSide(d: Draw, s: number) {
  const { c, u, ink } = d;
  const top = SIDE_Y; // top of the tallest part
  const deck = top + TALL - BOARD.t; // top face of the board
  // Projection lines from the features that matter.
  const xs = [0, BOARD.l, PARTS.usb.x, PARTS.usb.x + PARTS.usb.w, PARTS.rp2040.x, PARTS.rp2040.x + PARTS.rp2040.w];
  const proj = shoot(s, 0, 0.45);
  if (proj > 0) {
    c.lineWidth = 0.5 * u;
    c.strokeStyle = ink(0.28);
    c.setLineDash([1.6 * u, 2 * u]);
    c.beginPath();
    for (const x of xs) {
      const from = x < 0 || x > BOARD.l ? PARTS.usb.y + PARTS.usb.d : BOARD.w;
      c.moveTo(x, from + 0.8);
      c.lineTo(x, from + 0.8 + (deck + BOARD.t + 1.5 - from) * proj);
    }
    c.stroke();
    c.setLineDash([]);
  }
  if (s > 0.35) {
    // The board, then all the parts at once, each its own scattered strokes.
    const pencil = new Pencil(c, s);
    c.strokeStyle = ink(0.85);
    c.lineWidth = 1.1 * u;
    c.beginPath();
    pencil.box(0, deck, BOARD.l, BOARD.t, 0.35, 0.25, 90);
    c.stroke();
    c.lineWidth = 0.8 * u;
    c.beginPath();
    (Object.keys(PARTS) as PartName[]).forEach((name, i) => {
      const p: Part = PARTS[name];
      pencil.box(p.x, deck - p.h, p.w, p.h, 0.45 + 0.2 * jitter(95 + i), 0.2, 100 + i);
    });
    c.stroke();
  }
  const notes = ease(span(s, 0.75, 1));
  if (notes > 0) {
    dim(d, [PARTS.usb.x, deck + BOARD.t], [PARTS.usb.x, top], 4.5, '3.9', notes);
    c.font = `500 ${8 * u}px ${d.pen.font}`;
    c.textAlign = 'center';
    c.fillStyle = ink(0.55 * notes);
    c.fillText('SIDE VIEW', BOARD.l / 2, deck + BOARD.t + 4.5);
    c.textAlign = 'start';
  }
}

interface Draw {
  c: CanvasRenderingContext2D;
  u: number;
  pen: Pen;
  angle: number;
  ink: (a: number) => string;
}

/**
 * A dimension from a to b, offset sideways (mm, to the left of a→b), with extension lines from
 * the object (starting `from` mm along the offset), arrowheads, and the value along the line.
 * `outside`: for short measures, the arrows sit outside pointing in.
 */
function dim(d: Draw, a: number[], b: number[], offset: number, text: string, alpha: number, from = 0, outside = false) {
  const { c, u, ink } = d;
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const dx = (b[0] - a[0]) / len, dy = (b[1] - a[1]) / len;
  const nx = dy, ny = -dx; // left of a→b
  const gap = 0.8, over = 1.2;
  const A = [a[0] + nx * offset, a[1] + ny * offset];
  const B = [b[0] + nx * offset, b[1] + ny * offset];
  c.lineWidth = 0.5 * u;
  c.strokeStyle = ink(0.5 * alpha);
  c.beginPath();
  for (const p of [a, b]) {
    const s = Math.sign(offset);
    c.moveTo(p[0] + nx * (from + gap * s), p[1] + ny * (from + gap * s));
    c.lineTo(p[0] + nx * (offset + over * s), p[1] + ny * (offset + over * s));
  }
  if (outside) {
    c.moveTo(A[0] - dx * 3, A[1] - dy * 3); c.lineTo(B[0] + dx * 3, B[1] + dy * 3);
  } else {
    c.moveTo(A[0], A[1]); c.lineTo(B[0], B[1]);
  }
  c.stroke();
  c.fillStyle = ink(0.6 * alpha);
  const head = 5 * u, wing = 1.6 * u;
  const arrow = (x: number, y: number, ux: number, uy: number) => {
    c.moveTo(x, y);
    c.lineTo(x - ux * head + uy * wing, y - uy * head - ux * wing);
    c.lineTo(x - ux * head - uy * wing, y - uy * head + ux * wing);
    c.closePath();
  };
  c.beginPath();
  const s = outside ? -1 : 1;
  arrow(A[0], A[1], -dx * s, -dy * s);
  arrow(B[0], B[1], dx * s, dy * s);
  c.fill();
  // The value, reading along the line (never upside down), on a paper backing.
  const mx = (A[0] + B[0]) / 2, my = (A[1] + B[1]) / 2;
  let rot = Math.atan2(dy, dx);
  if (Math.cos(rot + d.angle) < -0.01) rot += Math.PI;
  c.save();
  c.translate(mx, my);
  c.rotate(rot);
  c.font = `500 ${9 * u}px ${d.pen.font}`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  const w = c.measureText(text).width + 5 * u;
  const ty = outside ? -6 * u : 0;
  c.fillStyle = `rgba(${d.pen.paper}, ${alpha})`;
  c.fillRect(-w / 2, ty - 5.5 * u, w, 11 * u);
  c.fillStyle = ink(0.8 * alpha);
  c.fillText(text, 0, ty);
  c.restore();
}

/** A note on a leader: a dot on the thing, a line out, a short shelf, the text on it. */
function callout(d: Draw, x: number, y: number, dx: number, dy: number, text: string, alpha: number) {
  const { c, u, ink } = d;
  c.font = `500 ${9 * u}px ${d.pen.font}`;
  const w = c.measureText(text).width;
  const ex = x + dx, ey = y + dy;
  const dir = dx >= 0 ? 1 : -1;
  c.lineWidth = 0.5 * u;
  c.strokeStyle = ink(0.5 * alpha);
  c.beginPath();
  c.moveTo(x, y);
  c.lineTo(ex, ey);
  c.lineTo(ex + dir * (w + 4 * u), ey);
  c.stroke();
  c.fillStyle = ink(0.75 * alpha);
  c.beginPath();
  circle(c, x, y, 1.6 * u);
  c.fill();
  c.textAlign = dir > 0 ? 'left' : 'right';
  c.textBaseline = 'alphabetic';
  c.fillText(text, ex + dir * 2 * u, ey - 2.5 * u);
  c.textAlign = 'start';
  c.textBaseline = 'middle';
}

function circle(c: CanvasRenderingContext2D, x: number, y: number, r: number) {
  c.moveTo(x + r, y);
  c.arc(x, y, r, 0, TAU);
}

/** 0 before a, 1 after b, linear in between. */
function span(t: number, a: number, b: number) {
  return Math.max(0, Math.min(1, (t - a) / (b - a)));
}
const ease = (x: number) => 1 - (1 - x) ** 3;
/** A line shooting in: very fast at first, then braking hard into place. */
const shoot = (t: number, a: number, b: number) => {
  const x = span(t, a, b);
  return x >= 1 ? 1 : 1 - 2 ** (-10 * x);
};

function step(a: number, b: number, x: number) {
  const t = span(x, a, b);
  return t * t * (3 - 2 * t);
}

/** Smootherstep: starts and stops without a jolt. */
export function smooth(x: number) {
  const t = Math.max(0, Math.min(1, x));
  return t * t * t * (t * (t * 6 - 15) + 10);
}
