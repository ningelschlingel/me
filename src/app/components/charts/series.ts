/**
 * An endless, made-up price line (as a log price: 0 = where it started, +0.1 ≈ 10.5 % up).
 *
 * It climbs over time, but not in a straight line. The market has a mood: mostly rising,
 * now and then falling for a while, then rising again. On top, every tick has its noise, and
 * now and then something "happens": the price runs up or down over three ticks, keeps part
 * of the move and gives most of it back over the following ticks, unevenly, as on a real
 * chart. Spikes go both ways, a little more often up.
 *
 * Seeded: the same history on every load.
 */
export interface Temper {
  /** Noise per tick. */
  vol: number;
  /** Drift per tick while rising, and while falling. */
  up: number;
  down: number;
  /** Chance per tick that the mood turns: from rising to falling, and back. */
  toBear: number;
  toBull: number;
  /** Chance of a spike per tick, and its typical size. */
  spikes: number;
  jump: number;
}

/** History kept: more than any screen needs. */
const KEEP = 900;

export class Series {
  readonly values: number[] = [];
  private level = 0;
  private shock = 0;
  private bull = true;
  /** A spike's run, still to come: added over the next ticks. */
  private pending: number[] = [];
  private readonly rand: () => number;

  constructor(
    seed: number,
    private readonly temper: Temper,
    history = 500,
  ) {
    this.rand = mulberry(seed);
    for (let i = 0; i < history; i++) this.next();
  }

  /** One tick further. */
  next() {
    const { vol, up, down, toBear, toBull, spikes, jump } = this.temper;
    const r = this.rand;
    if (r() < (this.bull ? toBear : toBull)) this.bull = !this.bull;
    this.level += (this.bull ? up : -down) + vol * gauss(r);
    // The retrace: most of a spike given back over ~10 ticks, never quite smoothly.
    this.shock *= 0.86 + 0.06 * (r() - 0.5);
    if (!this.pending.length && r() < spikes) {
      const size = (r() < 0.58 ? 1 : -1) * jump * (0.6 + 0.8 * r());
      this.pending = [0.5, 0.32, 0.18].map((f) => f * size);
    }
    const kick = this.pending.shift() ?? 0;
    this.level += 0.35 * kick;
    this.shock += 0.65 * kick;
    this.values.push(this.level + this.shock);
    if (this.values.length > KEEP + 100) this.values.splice(0, 100);
  }
}

/** Normal noise (Box–Muller). */
function gauss(r: () => number) {
  return Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
}

function mulberry(seed: number) {
  let a = seed * 0x9e3779b9;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
