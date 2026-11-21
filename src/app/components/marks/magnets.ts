/**
 * The motion of "?" and "!": two bodies on springs, magnetic towards each other.
 *
 * Like balloons: light, slowed by the air (a speed limit and plenty of drag), pushed about
 * by a breeze while they arrive. Each is drawn home by a soft spring. Between them a magnet
 * pulls, gently all the time and now and then a little harder, so they drift together, nudge
 * each other and float apart again. Arriving, they drift in from outside the tile on a curve,
 * turning slowly, and the magnet bends their paths towards each other.
 *
 * Units are the marks' own (the shader's): y up, homes around the origin.
 */
export interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Turn about the vertical axis (radians) and its speed; settles on a whole turn. */
  spin: number;
  w: number;
  /** Tilt into the motion, from the velocity. */
  roll: number;
  /** Seconds to wait (out of sight) before taking off. */
  hold: number;
  readonly home: readonly [number, number];
}

/** Spring to home: soft, with plenty of air drag (ζ ≈ 0.6: one gentle overshoot). */
const K = 2.6;
const C = 1.9;
/** Balloons never rush: the fastest they ever go (units/s). */
const TOP_SPEED = 3;
/** The breeze while arriving: its strength, and how fast it dies down (s). */
const WIND = 0.9;
const WIND_S = 3.5;
/** Spin back to upright, slowly. */
const KS = 5;
const CS = 1.9;
/** Magnet: always a little, more during a pull. */
const MAGNET = 0.12;
const PULL = 1.3;
const PULL_S = 2.6;
/**
 * Their shapes, for knocks: upright capsules (a bar from y0 to y1 around the centre, with a
 * radius), the question wide for its hook, the exclamation slim. How much speed survives a knock.
 */
const SHAPE = { q: { y0: -0.52, y1: 0.6, r: 0.33 }, b: { y0: -0.52, y1: 0.7, r: 0.15 } };
const BOUNCE = 0.3;

export class Magnets {
  readonly q: Body = body([-0.42, 0]);
  readonly b: Body = body([0.46, 0]);
  private time = 0;
  /** When the next strong pull starts, and when the current one began. */
  private nextPull = Infinity;
  private pullAt = -Infinity;

  constructor(private readonly calm: boolean) {}

  /**
   * Drift in from outside the tile (given in units around the resting middle): the question
   * from above on the left, the exclamation a beat later from below on the right.
   */
  arrive(tile: { left: number; right: number; top: number; bottom: number }) {
    this.time = 0;
    this.pullAt = -Infinity;
    if (this.calm) {
      for (const m of [this.q, this.b]) Object.assign(m, { x: m.home[0], y: m.home[1], vx: 0, vy: 0, spin: 0, w: 0, hold: 0 });
      return;
    }
    launch(this.q, tile.left - 1.1, tile.top + 0.5, 0, 3.5, 1);
    launch(this.b, tile.right + 1.1, Math.min(tile.bottom - 0.4, -1.6), 0.3, -3, -0.8);
    this.nextPull = 6 + 3 * Math.random();
  }

  /** Advance by `dt` seconds (in small fixed steps, so it is stable at any frame rate). */
  step(dt: number) {
    while (dt > 0) {
      const h = Math.min(dt, 1 / 240);
      this.tick(h);
      dt -= h;
    }
  }

  private tick(h: number) {
    this.time += h;
    const { q, b } = this;
    // A strong pull now and then (never with reduced motion).
    if (!this.calm && this.time >= this.nextPull) {
      this.pullAt = this.time;
      this.nextPull = this.time + PULL_S + 6 + 5 * Math.random();
    }
    const age = (this.time - this.pullAt) / PULL_S;
    const pull = age >= 0 && age < 1 ? PULL * Math.sin(Math.PI * age) ** 2 : 0;

    const dx = b.x - q.x, dy = b.y - q.y;
    const r = Math.hypot(dx, dy) || 1e-6;
    const nx = dx / r, ny = dy / r;
    const magnet = this.calm ? 0 : (MAGNET + pull) / (r * r + 0.25);

    // The breeze: a slow sway, its own for each, dying down once they are in.
    const breeze = this.calm ? 0 : WIND * Math.exp(-this.time / WIND_S);
    for (const [m, sign, phase] of [[q, 1, 0], [b, -1, 2.1]] as const) {
      if (m.hold > 0) {
        m.hold -= h;
        continue;
      }
      const wx = breeze * Math.sin(1.3 * this.time + phase);
      const wy = breeze * 0.7 * Math.cos(1.05 * this.time + phase * 1.7);
      const ax = -K * (m.x - m.home[0]) - C * m.vx + sign * magnet * nx + wx;
      const ay = -K * (m.y - m.home[1]) - C * m.vy + sign * magnet * ny + wy;
      m.vx += ax * h;
      m.vy += ay * h;
      const speed = Math.hypot(m.vx, m.vy);
      if (speed > TOP_SPEED) {
        m.vx *= TOP_SPEED / speed;
        m.vy *= TOP_SPEED / speed;
      }
      m.x += m.vx * h;
      m.y += m.vy * h;
      // Spin settles on the nearest whole turn, so a tumbling arrival ends upright.
      const upright = Math.round(m.spin / (2 * Math.PI)) * 2 * Math.PI;
      m.w += (-KS * (m.spin - upright) - CS * m.w) * h;
      m.spin += m.w * h;
      m.roll = Math.max(-0.5, Math.min(0.5, -0.05 * m.vx + 0.03 * m.vy));
    }

    // A knock: their capsules touch. They bounce off each other, and it sets them turning.
    // Closest points of two upright bars: sideways apart by dx, and by the vertical gap
    // between their spans (0 where the spans overlap).
    if (q.hold <= 0 && b.hold <= 0) {
      const qa = q.y + SHAPE.q.y0, qb = q.y + SHAPE.q.y1;
      const ba = b.y + SHAPE.b.y0, bb = b.y + SHAPE.b.y1;
      const gap = ba > qb ? ba - qb : qa > bb ? -(qa - bb) : 0;
      const dist = Math.hypot(dx, gap) || 1e-6;
      const touch = SHAPE.q.r + SHAPE.b.r;
      if (dist < touch) {
        const cx = dx / dist, cy = gap / dist; // from the question towards the exclamation
        const vn = (b.vx - q.vx) * cx + (b.vy - q.vy) * cy;
        if (vn < 0) {
          const j = (-(1 + BOUNCE) * vn) / 2;
          q.vx -= j * cx; q.vy -= j * cy;
          b.vx += j * cx; b.vy += j * cy;
          q.w -= 1.5 * j;
          b.w += 1.5 * j;
        }
        const push = (touch - dist) / 2;
        q.x -= cx * push; q.y -= cy * push;
        b.x += cx * push; b.y += cy * push;
      }
    }
  }
}

function body(home: [number, number]): Body {
  return { x: home[0], y: home[1], vx: 0, vy: 0, spin: 0, w: 0, roll: 0, hold: 0, home };
}

/** Out of sight at (x, y), waiting `hold` s; it will curve in (a sideways start), spinning at `w`. */
function launch(m: Body, x: number, y: number, hold: number, w: number, curve: number) {
  const dx = m.home[0] - x, dy = m.home[1] - y;
  const len = Math.hypot(dx, dy) || 1;
  Object.assign(m, { x, y, hold, spin: 0, w, vx: (-dy / len) * curve, vy: (dx / len) * curve });
}
