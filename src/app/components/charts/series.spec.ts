import { Series } from './series';

const TEMPER = { vol: 0.0032, up: 0.0009, down: 0.0017, toBear: 0.012, toBull: 0.06, spikes: 0.02, jump: 0.035 };

/** A long run, one value per tick, from a fresh start. */
function run(seed: number, ticks: number) {
  const s = new Series(seed, TEMPER, 0);
  const all: number[] = [];
  for (let i = 0; i < ticks; i++) {
    s.next();
    all.push(s.values[s.values.length - 1]);
  }
  return all;
}

describe('price series', () => {
  it('is the same on every load', () => {
    expect(new Series(7, TEMPER).values).toEqual(new Series(7, TEMPER).values);
  });

  it('keeps a bounded history', () => {
    const s = new Series(7, TEMPER);
    for (let i = 0; i < 20000; i++) s.next();
    expect(s.values.length).toBeLessThanOrEqual(1000);
  });

  for (const seed of [7, 21, 99]) {
    it(`climbs over time, with real setbacks on the way (seed ${seed})`, () => {
      const v = run(seed, 3000);
      // Up overall …
      expect(v[v.length - 1]).toBeGreaterThan(v[0] + 0.3);
      // … and most stretches of 200 ticks end higher than they began …
      let up = 0, windows = 0;
      for (let i = 0; i + 200 < v.length; i += 50, windows++) if (v[i + 200] > v[i]) up++;
      expect(up / windows).toBeGreaterThan(0.6);
      // … but not all: there are losses, and at least one drop of 5 % or more from a high.
      expect(up).toBeLessThan(windows);
      let peak = -Infinity, drawdown = 0;
      for (const x of v) {
        peak = Math.max(peak, x);
        drawdown = Math.max(drawdown, peak - x);
      }
      expect(drawdown).toBeGreaterThan(0.05);
    });
  }

  it('spikes both ways', () => {
    const v = run(7, 5000);
    const steps = v.slice(1).map((x, i) => x - v[i]);
    expect(steps.filter((d) => d > 0.012).length).toBeGreaterThan(10);
    expect(steps.filter((d) => d < -0.012).length).toBeGreaterThan(5);
  });
});
