import { SCENES } from './registry';

/** Largest distance any point moves between two phases. */
type Scene = (t: number) => { pts: number[][]; ink?: number; loose?: boolean }[];

/**
 * Points of a frame. Invisible strokes (faded to nothing) may reset anywhere, and loose
 * surroundings (a symmetric track after a half turn) may swap places with an identical twin:
 * neither counts.
 */
const points = (scene: Scene, t: number) =>
  scene(t).flatMap((s) => s.pts.map((p) => ((s.ink ?? 1) <= 0.02 || s.loose ? null : p)));

function step(a: number, b: number, scene: Scene) {
  const p = points(scene, a);
  const q = points(scene, b);
  expect(q.length).toBe(p.length); // a stable set of lines: nothing pops in or out
  let worst = 0;
  p.forEach((v, i) => {
    const w = q[i];
    if (v && w) worst = Math.max(worst, Math.hypot(v[0] - w[0], v[1] - w[1], v[2] - w[2]));
  });
  return worst;
}

describe('sketch scenes', () => {
  for (const [name, { scene, period }] of Object.entries(SCENES)) {
    it(`${name} loops seamlessly and never jumps`, () => {
      const frames = Math.round(period / (1000 / 60));
      let worst = 0;
      for (let f = 0; f < frames; f++) worst = Math.max(worst, step(f / frames, ((f + 1) / frames) % 1, scene));
      // The step across the seam (t → 0) is no bigger than an ordinary frame …
      expect(step((frames - 1) / frames, 0, scene)).toBeLessThan(0.06);
      // … and no frame anywhere moves a point further than fast motion would.
      expect(worst).toBeLessThan(0.2);
    });
  }
});
