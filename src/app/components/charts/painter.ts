import { Series, Temper } from './series';

/** One tick every this many ms, this many px apart: about 24 px/s. Steady, never hurried. */
const STEP_MS = 380;
const DX = 9;
/** How much each tick's move is eased (0 = perfectly even glide, 1 = start-stop): a gentle rhythm. */
const RHYTHM = 0.55;
/** The charts sweep in from the left over this long (seconds), the first time they are seen. */
const REVEAL_S = 1.8;
/** Room right of the charts for the price tags. */
const TAG_W = 96;
/** The grid shows only this close (px) to a chart, fading out. */
const NEAR = 65;
/** How quickly each chart's view follows its prices up and down (ms): it zooms, never jumps. */
const FOLLOW_MS = 900;

interface Line {
  seed: number;
  temper: Temper;
  /** Price where it started. */
  level: number;
  /** Its lane in the band (0 top … 1 bottom): the two overlap in the middle. */
  lane: [number, number];
  /** How it is drawn: told apart by weight and strength. */
  width: number;
  alpha: number;
}

/** Two markets, both climbing over time, each with its own temper and its own hand. */
const LINES: Line[] = [
  // The lead: bold and solid; a steady climber with the odd big move.
  {
    seed: 7,
    temper: { vol: 0.0032, up: 0.0009, down: 0.0017, toBear: 0.012, toBull: 0.06, spikes: 0.02, jump: 0.035 },
    level: 142.8,
    lane: [0, 0.64],
    width: 1.7,
    alpha: 0.9,
  },
  // The second: thinner, at half strength, a little calmer.
  {
    seed: 21,
    temper: { vol: 0.0026, up: 0.0007, down: 0.0013, toBear: 0.01, toBull: 0.05, spikes: 0.015, jump: 0.03 },
    level: 98.15,
    lane: [0.36, 1],
    width: 1,
    alpha: 0.5,
  },
];

/**
 * Two stock charts overlaid, running forever: prices tick in at the right and the history
 * slides off to the left, in a soft tick-by-tick rhythm. Both climb over time, with setbacks
 * and spikes both ways (see series.ts); each chart's view zooms smoothly to hold what is
 * visible. A faint grid shows only around the lines. The lead line carries a dashed
 * last-price line, a ring pulses when a line reaches a new high, and each ends in a tag with
 * its price and its change over the visible stretch. Behind the card's text, like every sketch.
 */
export class ChartsPainter {
  private pen = { ink: '0, 0, 0', paper: '255, 255, 255', font: 'monospace' };
  private dpr = 1;
  private width = 0;
  /** The band the charts live in (CSS px). 0 height = no room, draw nothing. */
  private top = 0;
  private bottom = 0;
  private readonly series = LINES.map((l) => new Series(l.seed, l.temper));
  /** Per line: the view's current low and high (log price), and when it last made a new high (ms). */
  private readonly views = LINES.map(() => ({ lo: NaN, hi: NaN, high: -Infinity }));
  /** Ticks taken since the start, and the clock at the last frame. */
  private ticks = 0;
  private last = 0;

  /**
   * `ctx` draws on the page; `grid` and `mask` are off-screen helpers: the grid, and the
   * (low-resolution, so soft-edged) mask that keeps it near the lines.
   */
  constructor(
    private readonly ctx: CanvasRenderingContext2D,
    private readonly grid: CanvasRenderingContext2D,
    private readonly mask: CanvasRenderingContext2D,
  ) {}

  /** The card's size, the stage's top and height in it (CSS px), colours, pixel density. */
  resize(width: number, height: number, stage: { top: number; room: number }, pen: ChartsPen, dpr: number) {
    this.width = width;
    this.dpr = dpr;
    for (const c of [this.ctx.canvas, this.grid.canvas]) {
      c.width = Math.round(width * dpr);
      c.height = Math.round(height * dpr);
    }
    this.mask.canvas.width = Math.ceil(width / MASK);
    this.mask.canvas.height = Math.ceil(height / MASK);
    // The stage, a little inset so spikes have air.
    const ok = stage.room >= 70;
    this.top = ok ? stage.top + stage.room * 0.1 : 0;
    this.bottom = ok ? stage.top + stage.room * 0.9 : 0;
    this.pen = pen;
  }

  /** The clock starts over: the charts sweep in again, carrying on from the prices they had. */
  restart() {
    this.ticks = 0;
    this.last = 0;
    for (const v of this.views) v.high = -Infinity;
  }

  /** One frame; `elapsed`: the local clock, ms. */
  draw(elapsed: number) {
    const c = this.ctx;
    if (!c) return;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, c.canvas.width, c.canvas.height);
    if (this.bottom <= this.top) return;
    const dt = Math.max(0, elapsed - this.last);
    this.last = elapsed;

    const x1 = this.width - TAG_W;
    const count = Math.ceil(x1 / DX) + 2; // ticks on screen

    // Catch the series up with the clock. A tick that tops everything on screen is a new high.
    const due = Math.floor(elapsed / STEP_MS);
    while (this.ticks < due) {
      this.series.forEach((s, i) => {
        s.next();
        const v = s.values;
        const before = Math.max(...v.slice(-count - 2, -2));
        if (v[v.length - 2] > before) this.views[i].high = (this.ticks + 1) * STEP_MS;
      });
      this.ticks++;
    }
    // Between ticks everything slides on; eased a little per tick, for a soft rhythm.
    const linear = (elapsed % STEP_MS) / STEP_MS;
    const frac = linear + (linear * linear * (3 - 2 * linear) - linear) * RHYTHM;
    const reveal = ease(Math.min(1, elapsed / 1000 / REVEAL_S));
    const band = this.bottom - this.top;
    const follow = 1 - Math.exp(-dt / FOLLOW_MS);

    // ── Each chart: its view (zooming smoothly to hold what is visible), its path ────────────
    const charts = LINES.map((line, i) => {
      const values = this.series[i].values;
      const n = values.length;
      const shown = values.slice(-count - 1);
      const view = this.views[i];
      let lo = Math.min(...shown), hi = Math.max(...shown);
      const pad = Math.max(0.04, hi - lo) * 0.12;
      const mid = (lo + hi) / 2, half = Math.max(0.03, (hi - lo) / 2 + pad);
      lo = mid - half;
      hi = mid + half;
      if (Number.isNaN(view.lo)) Object.assign(view, { lo, hi });
      view.lo += (lo - view.lo) * follow;
      view.hi += (hi - view.hi) * follow;
      const y0 = this.top + band * line.lane[0], y1 = this.top + band * line.lane[1];
      const y = (v: number) => y1 - ((v - view.lo) / (view.hi - view.lo)) * (y1 - y0);
      // The newest value is still arriving: the tip slides towards it.
      const head = values[n - 2] + (values[n - 1] - values[n - 2]) * frac;
      const path = new Path2D();
      path.moveTo(x1, y(head));
      for (let k = n - 2, x = x1 - frac * DX; k >= 0 && x > -DX; k--, x -= DX) path.lineTo(x, y(values[k]));
      const first = shown[0];
      return { line, path, head, headY: y(head), change: Math.exp(head - first) - 1, high: view.high };
    });

    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const ink = (a: number) => `rgba(${this.pen.ink}, ${a})`;
    c.lineJoin = 'round';
    c.lineCap = 'round';
    const clip = (g: CanvasRenderingContext2D) => {
      g.beginPath();
      g.rect(0, 0, x1 * reveal + 1, this.bottom + 100);
      g.clip();
    };

    // ── Grid, only near the lines: drawn whole off-screen, then masked by the lines ─────────
    const g = this.grid;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, g.canvas.width, g.canvas.height);
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.lineWidth = 0.6;
    g.strokeStyle = ink(0.32);
    g.beginPath();
    for (let i = 1; i < 6; i++) {
      const y = Math.round(this.top + (band * i) / 6) + 0.5;
      g.moveTo(0, y);
      g.lineTo(x1, y);
    }
    const EVERY = 12;
    for (let j = this.ticks - (this.ticks % EVERY); ; j -= EVERY) {
      const x = x1 - (this.ticks - j + frac) * DX;
      if (x < 0) break;
      g.moveTo(Math.round(x) + 0.5, this.top);
      g.lineTo(Math.round(x) + 0.5, this.bottom);
    }
    g.stroke();
    // The mask: the lines, stroked wide in a few soft layers, at low resolution (soft edges).
    const m = this.mask;
    m.setTransform(1, 0, 0, 1, 0, 0);
    m.clearRect(0, 0, m.canvas.width, m.canvas.height);
    m.setTransform(1 / MASK, 0, 0, 1 / MASK, 0, 0);
    m.save();
    clip(m);
    m.lineJoin = 'round';
    m.lineCap = 'round';
    for (const [w, a] of [[2 * NEAR, 0.3], [1.3 * NEAR, 0.4], [0.6 * NEAR, 1]]) {
      m.lineWidth = w;
      m.strokeStyle = `rgba(0, 0, 0, ${a})`;
      for (const ch of charts) m.stroke(ch.path);
    }
    m.restore();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'destination-in';
    g.imageSmoothingEnabled = true;
    g.drawImage(m.canvas, 0, 0, m.canvas.width * MASK * this.dpr, m.canvas.height * MASK * this.dpr);
    c.save();
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = reveal;
    c.drawImage(g.canvas, 0, 0);
    c.restore();

    // ── The lines, swept in from the left on first sight; the lead's last price, dashed ─────
    c.save();
    clip(c);
    const lead = charts[0];
    c.lineWidth = 0.6;
    c.strokeStyle = ink(0.22);
    c.setLineDash([2, 4]);
    c.beginPath();
    c.moveTo(0, Math.round(lead.headY) + 0.5);
    c.lineTo(x1, Math.round(lead.headY) + 0.5);
    c.stroke();
    c.setLineDash([]);
    for (const ch of charts) {
      c.lineWidth = ch.line.width;
      c.strokeStyle = ink(ch.line.alpha);
      c.stroke(ch.path);
    }
    c.restore();

    // ── Tips: a dot, a ring that pulses out on a new high, and a tag with price and change ──
    const tags = Math.max(0, (reveal - 0.85) / 0.15);
    if (tags <= 0) return;
    for (const ch of charts) {
      c.fillStyle = ink(ch.line.alpha * tags);
      c.beginPath();
      c.arc(x1, ch.headY, ch.line.width + 1, 0, Math.PI * 2);
      c.fill();
      const age = (elapsed - ch.high) / 1100;
      if (age >= 0 && age < 1) {
        c.lineWidth = 0.8;
        c.strokeStyle = ink(ch.line.alpha * (1 - age) ** 2 * tags);
        c.beginPath();
        c.arc(x1, ch.headY, 3 + 11 * ease(age), 0, Math.PI * 2);
        c.stroke();
      }
    }
    // Tags never overlap: pushed apart (at least 13 px), in order of height.
    const order = [...charts].sort((a, b) => a.headY - b.headY);
    const ys = order.map((ch) => ch.headY);
    for (let i = 1; i < ys.length; i++) ys[i] = Math.max(ys[i], ys[i - 1] + 13);
    c.font = `500 9px ${this.pen.font}`;
    c.textBaseline = 'middle';
    order.forEach((ch, i) => {
      const y = ys[i];
      const price = (ch.line.level * Math.exp(ch.head)).toFixed(2);
      const change = `${ch.change >= 0 ? '▲' : '▼'} ${Math.abs(ch.change * 100).toFixed(1)}%`;
      // The sample: a short piece of the line, drawn just like it.
      c.lineWidth = ch.line.width;
      c.strokeStyle = ink(ch.line.alpha * tags);
      c.beginPath();
      c.moveTo(x1 + 8, y);
      c.lineTo(x1 + 15, y);
      c.stroke();
      c.fillStyle = ink(Math.max(0.6, ch.line.alpha) * tags);
      c.fillText(price, x1 + 19, y);
      c.fillStyle = ink(Math.max(0.45, ch.line.alpha * 0.7) * tags);
      c.fillText(change, x1 + 19 + c.measureText(price).width + 6, y);
    });
  }}

/** Colours as "r, g, b", and the font for the tags. */
export interface ChartsPen {
  ink: string;
  paper: string;
  font: string;
}

/** The grid mask is drawn at 1/MASK resolution: scaled up, its edges come out soft. */
const MASK = 6;
const ease = (x: number) => 1 - (1 - x) ** 3;
