/**
 * The construction drawing over the inks: a logo taken apart in Illustrator. Hairline
 * circles, the triangle between their centres, guides running off across the card, an
 * enclosing circle, centre marks, and a live measurement.
 *
 * It follows the discs' ideal geometry, not the colour itself: the ink drifts, shakes and
 * leans a little off its construction, as a printed mark sits a little off its drawing.
 */

const TAU = Math.PI * 2;
/** Ink names, in disc order. */
const NAMES = ['C', 'M', 'Y'];

/** The geometry to draw, in CSS px. */
export interface Plan {
  cx: number;
  cy: number;
  discs: { x: number; y: number; r: number }[];
}

/** Colours as "r, g, b", and the font for labels. */
export interface Pen {
  ink: string;
  paper: string;
  font: string;
}

/**
 * Draws the construction. `reveal` (0…1) draws it in, part after part: guides first, then
 * circles, the triangle, marks, and the labels last.
 */
export function drawConstruction(c: CanvasRenderingContext2D, plan: Plan, pen: Pen, reveal: number) {
  const { cx, cy, discs } = plan;
  const ink = (a: number) => `rgba(${pen.ink}, ${a})`;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.lineWidth = 0.75;

  // 1 · Guides: each side of the triangle, extended far across the card, growing out from its middle.
  let t = part(reveal, 0, 0.5);
  if (t > 0) {
    c.setLineDash([3, 5]);
    c.strokeStyle = ink(0.2);
    c.beginPath();
    for (let i = 0; i < 3; i++) {
      const p = discs[i], q = discs[(i + 1) % 3];
      const dx = q.x - p.x, dy = q.y - p.y;
      const reach = (2000 * t) / (Math.hypot(dx, dy) || 1);
      const mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2;
      c.moveTo(mx - dx * reach, my - dy * reach);
      c.lineTo(mx + dx * reach, my + dy * reach);
    }
    c.stroke();
  }

  // 2 · The circle that holds the whole mark, and the axes from its centre through each disc.
  t = part(reveal, 0.1, 0.6);
  if (t > 0) {
    const outer = Math.max(...discs.map((d) => Math.hypot(d.x - cx, d.y - cy) + d.r));
    c.setLineDash([2, 4]);
    c.strokeStyle = ink(0.28);
    c.beginPath();
    c.arc(cx, cy, outer, -Math.PI / 2, -Math.PI / 2 + TAU * t);
    c.stroke();
    c.setLineDash([1, 3]);
    c.strokeStyle = ink(0.25);
    c.beginPath();
    for (const d of discs) {
      const a = Math.atan2(d.y - cy, d.x - cx);
      c.moveTo(cx, cy);
      c.lineTo(cx + Math.cos(a) * outer * t, cy + Math.sin(a) * outer * t);
    }
    c.stroke();
  }
  c.setLineDash([]);

  // 3 · Construction circles: the ideal shapes the colour drifts around.
  t = part(reveal, 0.15, 0.7);
  if (t > 0) {
    c.strokeStyle = ink(0.5);
    discs.forEach((d, i) => {
      const start = -Math.PI / 2 + (i * TAU) / 3;
      c.beginPath();
      c.arc(d.x, d.y, d.r, start, start + TAU * t);
      c.stroke();
    });
  }

  // 4 · The triangle between the centres.
  t = part(reveal, 0.3, 0.75);
  if (t > 0) {
    c.strokeStyle = ink(0.42);
    c.beginPath();
    for (let i = 0; i < 3; i++) {
      const p = discs[i], q = discs[(i + 1) % 3];
      c.moveTo(p.x, p.y);
      c.lineTo(p.x + (q.x - p.x) * t, p.y + (q.y - p.y) * t);
    }
    c.stroke();
  }

  // 5 · Centre marks, and a small ring on the centre of the mark.
  t = part(reveal, 0.45, 0.8);
  if (t > 0) {
    const arm = 4;
    c.strokeStyle = ink(0.6 * t);
    c.beginPath();
    for (const d of discs) {
      c.moveTo(d.x - arm, d.y);
      c.lineTo(d.x + arm, d.y);
      c.moveTo(d.x, d.y - arm);
      c.lineTo(d.x, d.y + arm);
    }
    c.moveTo(cx + 2.5, cy);
    c.arc(cx, cy, 2.5, 0, TAU);
    c.stroke();
  }

  // 6 · Labels, out on the paper where they can be read: the ink names beyond each circle, and
  //     a dimension outside the enclosing circle: the angle between two axes, measured live.
  t = part(reveal, 0.75, 1);
  if (t > 0) {
    const outer = Math.max(...discs.map((d) => Math.hypot(d.x - cx, d.y - cy) + d.r));
    const axis = discs.map((d) => Math.atan2(d.y - cy, d.x - cx));
    c.font = `500 9px ${pen.font}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = ink(0.7 * t);
    // Between the cyan and magenta axes, on an arc just outside the mark, with end ticks;
    // the names sit on the axes just beyond it.
    const rad = outer + 14;
    discs.forEach((_, i) => c.fillText(NAMES[i], cx + Math.cos(axis[i]) * (rad + 15), cy + Math.sin(axis[i]) * (rad + 15)));
    let diff = axis[1] - axis[0];
    diff = Math.atan2(Math.sin(diff), Math.cos(diff)); // the short way round
    c.strokeStyle = ink(0.5 * t);
    c.beginPath();
    c.arc(cx, cy, rad, axis[0], axis[0] + diff, diff < 0);
    for (const a of [axis[0], axis[0] + diff]) {
      c.moveTo(cx + Math.cos(a) * (rad - 4), cy + Math.sin(a) * (rad - 4));
      c.lineTo(cx + Math.cos(a) * (rad + 4), cy + Math.sin(a) * (rad + 4));
    }
    c.stroke();
    const mid = axis[0] + diff / 2;
    const label = `${Math.abs((diff * 180) / Math.PI).toFixed(1)}°`;
    const lx = cx + Math.cos(mid) * (rad + 14), ly = cy + Math.sin(mid) * (rad + 14);
    // A paper backing, so the label stays legible where a guide runs through it.
    const w = c.measureText(label).width + 6;
    c.fillStyle = `rgba(${pen.paper}, ${t})`;
    c.fillRect(lx - w / 2, ly - 6, w, 12);
    c.fillStyle = ink(0.7 * t);
    c.fillText(label, lx, ly);
    c.textAlign = 'start';
  }
}

/** Progress of one part of the reveal, eased: 0 before `a`, 1 after `b`. */
function part(t: number, a: number, b: number) {
  const x = Math.max(0, Math.min(1, (t - a) / (b - a)));
  return 1 - (1 - x) ** 3;
}
