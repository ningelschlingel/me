/**
 * The draughtsman's kit shared by the technical drawings (the Pico, the modules): strokes that
 * draw themselves, dimensions, callouts, and the easing they move with. Everything works in
 * the drawing's own units; `u` is one CSS px in those units.
 */

const TAU = Math.PI * 2;

/** Colours as "r, g, b", and the font for notes. */
export interface Pen {
  ink: string;
  paper: string;
  signal: string;
  font: string;
}

/**
 * Strokes that each draw themselves at their own moment, so a drawing appears in many places
 * at once. Moments and durations are in the reveal's units (0…1). Adds to the current path.
 */
export class Pencil {
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
export function jitter(n: number) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export interface Draw {
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
export function dim(d: Draw, a: number[], b: number[], offset: number, text: string, alpha: number, from = 0, outside = false) {
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
export function callout(d: Draw, x: number, y: number, dx: number, dy: number, text: string, alpha: number) {
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

export function circle(c: CanvasRenderingContext2D, x: number, y: number, r: number) {
  c.moveTo(x + r, y);
  c.arc(x, y, r, 0, TAU);
}

/** 0 before a, 1 after b, linear in between. */
export function span(t: number, a: number, b: number) {
  return Math.max(0, Math.min(1, (t - a) / (b - a)));
}
export const ease = (x: number) => 1 - (1 - x) ** 3;
/** A line shooting in: very fast at first, then braking hard into place. */
export const shoot = (t: number, a: number, b: number) => {
  const x = span(t, a, b);
  return x >= 1 ? 1 : 1 - 2 ** (-10 * x);
};

export function step(a: number, b: number, x: number) {
  const t = span(x, a, b);
  return t * t * (3 - 2 * t);
}

/** Smootherstep: starts and stops without a jolt. */
export function smooth(x: number) {
  const t = Math.max(0, Math.min(1, x));
  return t * t * t * (t * (t * 6 - 15) + 10);
}
