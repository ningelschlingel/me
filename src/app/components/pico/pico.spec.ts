import { CYCLE_S, poseAt } from './pico';

describe('pico loop', () => {
  it('starts and ends assembled without the side view, so it loops without a seam', () => {
    expect(poseAt(0)).toEqual({ explode: 0, side: 0 });
    const end = poseAt(CYCLE_S - 1e-6);
    expect(end.explode).toBeCloseTo(0, 5);
    expect(end.side).toBeCloseTo(0, 5);
  });

  it('moves calmly: no jumps, never more than 1/100 of a change per frame at 120 fps', () => {
    const FPS = 120;
    let prev = poseAt(0);
    let worst = 0;
    for (let f = 1; f <= FPS * CYCLE_S * 2; f++) {
      const p = poseAt(f / FPS);
      worst = Math.max(worst, Math.abs(p.explode - prev.explode), Math.abs(p.side - prev.side));
      prev = p;
    }
    expect(worst).toBeLessThan(1 / 100);
  });

  it('takes the board apart and shows the side view, never both at once', () => {
    let apart = false, side = false;
    for (let t = 0; t < CYCLE_S; t += 0.05) {
      const p = poseAt(t);
      apart ||= p.explode === 1;
      side ||= p.side === 1;
      expect(p.explode > 0 && p.side > 0).toBe(false);
    }
    expect(apart).toBe(true);
    expect(side).toBe(true);
  });
});
