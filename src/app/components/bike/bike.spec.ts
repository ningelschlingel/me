import { describe, expect, it } from 'vitest';
import { groupsAt } from './bike';
import { TRAIL, WHEELBASE } from './drawing';

describe('bike drawing', () => {
  it('derives the chart numbers from stack, reach, angles and rake', () => {
    // Orbea's size-53 chart: wheelbase 974–976, trail 60.2.
    expect(WHEELBASE).toBeGreaterThan(970);
    expect(WHEELBASE).toBeLessThan(982);
    expect(TRAIL).toBeCloseTo(60, 0);
  });

  it('always shows exactly one group of measures, crossfading between them', () => {
    for (let t = 0; t < 40; t += 0.13) {
      const g = groupsAt(t);
      expect(g.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
    }
    expect(groupsAt(0)).toEqual([1, 0, 0]);
  });
});
