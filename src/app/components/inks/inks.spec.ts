import { blurAt } from './inks';

describe('inks pulse', () => {
  const FPS = 120;
  const SECONDS = 120;

  for (const i of [0, 1, 2]) {
    it(`ink ${i} stays between sharp and soft, reaches both, and never jumps`, () => {
      let min = 1, max = 0, worst = 0;
      let prev = blurAt(0, i);
      for (let f = 1; f < FPS * SECONDS; f++) {
        const b = blurAt(f / FPS, i);
        expect(b).toBeGreaterThanOrEqual(0);
        expect(b).toBeLessThanOrEqual(1);
        min = Math.min(min, b);
        max = Math.max(max, b);
        worst = Math.max(worst, Math.abs(b - prev));
        prev = b;
      }
      expect(min).toBeLessThan(0.001);
      expect(max).toBeGreaterThan(0.999);
      // Slow: even the fastest moment changes by well under 1% per frame.
      expect(worst).toBeLessThan(0.008);
    });
  }

  it('keeps the three inks out of step', () => {
    // Over two minutes, the inks never move in lockstep: their blurs differ most of the time.
    let apart = 0;
    for (let f = 0; f < SECONDS * 10; f++) {
      const s = f / 10;
      const [a, b, c] = [0, 1, 2].map((i) => blurAt(s, i));
      if (Math.max(a, b, c) - Math.min(a, b, c) > 0.2) apart++;
    }
    expect(apart / (SECONDS * 10)).toBeGreaterThan(0.6);
  });
});
