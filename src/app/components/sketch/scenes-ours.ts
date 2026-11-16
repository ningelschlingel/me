import { Scene, Stroke, TAU, V3, add, clamp01, easeInOut, lerp, lerp3, rotX, rotY, scale, span, sub } from './math';
import { Skin, pipe, sweep, torus } from './solids';

/*
 * The OURS column: ink on signal orange, cobalt for the one bright detail.
 * Precision first: every line that meets another meets it at a shared point.
 */

const poly = (pts: V3[], s: Partial<Stroke> = {}): Stroke => ({ pts, ...s });
/** A circle in the plane spanned by u and v around c. */
const loop = (c: V3, r: number, u: V3, v: V3, n = 16, start = 0): V3[] =>
  Array.from({ length: n + 1 }, (_, i) => {
    const a = start + (TAU * i) / n;
    return add(c, add(scale(u, r * Math.cos(a)), scale(v, r * Math.sin(a))));
  });
const X: V3 = [1, 0, 0], Y: V3 = [0, 1, 0], Z: V3 = [0, 0, 1];

// ── 01 Work · "Start the engine": a steam locomotive, straight at you ──────────────────────

const RAIL = 0.27; // half gauge = wheel x
const DRIVER = 0.2;
const DRIVERS = [-0.35, 0.05, 0.45];
const PONY = { r: 0.1, z: 0.86 };
const BOILER = { y: 0.62, r: 0.27, z0: -0.05, z1: 1.05 };

/** The locomotive and tender at rest, local coordinates (z forward, rail top at y = 0). */
function engine(wheel: number): Stroke[] {
  const out: Stroke[] = [];
  const line = (...pts: V3[]) => out.push(poly(pts));

  // Frame
  for (const x of [-RAIL, RAIL]) line([x, 0.3, -0.55], [x, 0.3, 1.15]);
  line([-RAIL, 0.3, 1.15], [RAIL, 0.3, 1.15]);
  line([-RAIL, 0.3, -0.55], [RAIL, 0.3, -0.55]);

  // Boiler: three rings and six lines along it
  for (const z of [BOILER.z0, 0.5, BOILER.z1]) out.push(poly(loop([0, BOILER.y, z], BOILER.r, X, Y, 18), { weight: z === BOILER.z1 ? 1.2 : 0.9 }));
  for (let k = 0; k < 6; k++) {
    const a = (TAU * k) / 6 + Math.PI / 6;
    const p = (z: number): V3 => [BOILER.r * Math.cos(a), BOILER.y + BOILER.r * Math.sin(a), z];
    line(p(BOILER.z0), p(BOILER.z1));
  }
  // Smokebox door and its hinge
  out.push(poly(loop([0, BOILER.y, BOILER.z1 + 0.01], 0.17, X, Y, 16)));
  out.push(poly(loop([0, BOILER.y, BOILER.z1 + 0.012], 0.03, X, Y, 8)));
  // Chimney: a flared stack on top of the smokebox
  const top = BOILER.y + BOILER.r;
  const stackBase = loop([0, top, 0.88], 0.07, X, Z, 12);
  const stackTop = loop([0, top + 0.24, 0.88], 0.1, X, Z, 12);
  out.push(poly(stackBase), poly(stackTop));
  for (let k = 0; k < 12; k += 3) line(stackBase[k], stackTop[k]);
  // Steam dome
  const domeBase = loop([0, top, 0.4], 0.09, X, Z, 12);
  const domeTop = loop([0, top + 0.1, 0.4], 0.055, X, Z, 12);
  out.push(poly(domeBase), poly(domeTop));
  for (let k = 0; k < 12; k += 3) line(domeBase[k], domeTop[k]);
  // Headlamp: the one bright thing
  out.push(poly(loop([0, top + 0.06, BOILER.z1 + 0.02], 0.045, X, Y, 10), { fill: 'cobalt', tone: 'cobalt', weight: 1.1 }));

  // Cab
  const cab = { x: 0.31, y0: 0.3, y1: 1.05, z0: -0.55, z1: -0.05 };
  for (const x of [-cab.x, cab.x]) for (const z of [cab.z0, cab.z1]) line([x, cab.y0, z], [x, cab.y1, z]);
  line([-cab.x, cab.y1, cab.z0], [cab.x, cab.y1, cab.z0], [cab.x, cab.y1, cab.z1], [-cab.x, cab.y1, cab.z1], [-cab.x, cab.y1, cab.z0]);
  const roof: V3[] = [[-0.36, 1.1, -0.62], [0.36, 1.1, -0.62], [0.36, 1.1, 0.02], [-0.36, 1.1, 0.02], [-0.36, 1.1, -0.62]];
  out.push(poly(roof, { weight: 1.1 }));
  for (const [x, z] of [[-1, -0.62], [1, -0.62], [1, 0.02], [-1, 0.02]] as const) line([x * 0.36, 1.1, z], [x * cab.x, cab.y1, z === -0.62 ? cab.z0 : cab.z1]);
  for (const x of [-cab.x, cab.x])
    line([x, 0.72, -0.45], [x, 0.95, -0.45], [x, 0.95, -0.17], [x, 0.72, -0.17], [x, 0.72, -0.45]);
  for (const s of [-1, 1])
    line([s * 0.17, 0.84, cab.z1], [s * 0.28, 0.84, cab.z1], [s * 0.28, 0.99, cab.z1], [s * 0.17, 0.99, cab.z1], [s * 0.17, 0.84, cab.z1]);

  // Cylinders and the pilot (cow-catcher)
  for (const s of [-1, 1]) {
    const x = s * 0.31;
    line([x, 0.22, 0.66], [x, 0.38, 0.66], [x, 0.38, 0.86], [x, 0.22, 0.86], [x, 0.22, 0.66]);
  }
  const tip: V3 = [0, 0.04, 1.4];
  for (const s of [-1, 1]) {
    line([s * RAIL, 0.3, 1.15], [s * RAIL, 0.05, 1.18], tip);
    line([s * RAIL, 0.3, 1.15], [0, 0.3, 1.22]);
  }
  line([0, 0.3, 1.22], tip);
  for (const k of [0.33, 0.66]) line(lerp3([-RAIL, 0.3, 1.15], [0, 0.3, 1.22], k), lerp3([-RAIL, 0.05, 1.18], tip, k));
  for (const k of [0.33, 0.66]) line(lerp3([RAIL, 0.3, 1.15], [0, 0.3, 1.22], k), lerp3([RAIL, 0.05, 1.18], tip, k));

  // Wheels: drivers, pony truck; spokes turn with the distance travelled
  const wheelAt = (x: number, z: number, r: number) => {
    const c: V3 = [x, r, z];
    out.push(poly(loop(c, r, Z, Y, 16), { weight: 1.1 }));
    for (let k = 0; k < 3; k++) {
      const a = wheel * (DRIVER / r) + (Math.PI * k) / 3;
      line(add(c, [0, r * 0.9 * Math.sin(a), r * 0.9 * Math.cos(a)]), add(c, [0, -r * 0.9 * Math.sin(a), -r * 0.9 * Math.cos(a)]));
    }
  };
  for (const x of [-RAIL, RAIL]) {
    for (const z of DRIVERS) wheelAt(x, z, DRIVER);
    wheelAt(x, PONY.z, PONY.r);
    // Coupling rod: through the crank pins of all three drivers (same angle, so it stays level).
    const rodX = Math.sign(x) * 0.31; // the rods run in the cylinders' plane
    const pin = (z: number, px = rodX): V3 => [px, DRIVER + 0.1 * Math.sin(wheel), z + 0.1 * Math.cos(wheel)];
    out.push(poly(DRIVERS.map((z) => pin(z)), { weight: 1.3 }));
    for (const z of DRIVERS) line(pin(z, x), pin(z)); // crank pins: wheel face to rod
    // Main rod: from the crosshead (it slides in the cylinder's line) to the middle pin.
    const cross: V3 = [rodX, 0.3, 0.66 - 0.1 + 0.1 * Math.cos(wheel)];
    line(cross, pin(DRIVERS[1]));
    line(cross, [rodX, 0.3, 0.66]);
  }

  // Tender
  const t = { x: 0.3, y0: 0.24, y1: 0.82, z0: -1.55, z1: -0.68 };
  for (const x of [-t.x, t.x]) for (const z of [t.z0, t.z1]) line([x, t.y0, z], [x, t.y1, z]);
  for (const y of [t.y0, t.y1]) line([-t.x, y, t.z0], [t.x, y, t.z0], [t.x, y, t.z1], [-t.x, y, t.z1], [-t.x, y, t.z0]);
  line([-t.x, t.y1, -1.4], [-0.12, t.y1 + 0.12, -1.3], [0.12, t.y1 + 0.12, -1.3], [t.x, t.y1, -1.4]); // coal
  line([-t.x, t.y1, -0.85], [-0.12, t.y1 + 0.1, -0.95], [0.12, t.y1 + 0.1, -0.95], [t.x, t.y1, -0.85]);
  line([-0.12, t.y1 + 0.12, -1.3], [-0.12, t.y1 + 0.1, -0.95]);
  line([0.12, t.y1 + 0.12, -1.3], [0.12, t.y1 + 0.1, -0.95]);
  for (const x of [-RAIL, RAIL]) for (const z of [-1.35, -0.88]) wheelAt(x, z, 0.15);
  line([0, 0.3, t.z1], [0, 0.3, cab.z0]); // drawbar
  return out;
}

/** One loop: 15 turns of the driving wheels (30 of the pony wheels, 20 of the tender's): everything repeats. */
const TRAVEL = TAU * 15 * DRIVER;
const SLEEPERS = 48; // per loop: the sleeper pattern repeats exactly too
const SLEEPER = TRAVEL / SLEEPERS;
/** The point the camera looks at: the middle of engine and tender. */
const FOCUS: V3 = [0, 0.5, -0.08];

/** Camera path around the train (relative to it): azimuth, distance and tilt over the loop. */
export function camera(t: number) {
  const ease = easeInOut;
  // A  approach: the train rolls straight at the lens
  // B  swing: the camera slips round to the side
  // C  tracking shot: side view, keeping pace
  // D  pull back and round to the front, ready for the next approach
  const swing = ease(span(t, 0.2, 0.36));
  const back = ease(span(t, 0.66, 0.9));
  const azimuth = -(Math.PI / 2) * swing * (1 - back) + 0.1 * Math.sin(TAU * span(t, 0.36, 0.66)) * swing * (1 - back);
  const near = lerp(6.6, 3.9, ease(span(t, 0, 0.22)));
  const dist = t < 0.22 ? near : lerp(lerp(3.9, 4.4, swing), 6.6, back) + 0.2 * Math.sin(Math.PI * span(t, 0.36, 0.66));
  const tilt = lerp(0.05, 0.2, swing) * (1 - back) + 0.05 * back + 0.06 * Math.sin(Math.PI * back);
  return { azimuth, dist, tilt };
}

export const train: Scene = (t) => {
  const cam = camera(t);
  const here = (p: V3): V3 => {
    // world (train frame) → camera space; the camera sits `dist` away on the azimuth circle
    const q = rotY(sub(p, FOCUS), cam.azimuth);
    const v = rotX(q, cam.tilt);
    return add(v, [0, 0, 4.2 - cam.dist]);
  };
  const out: Stroke[] = [];
  const seen = 1;

  // Track: rails and sleepers fade out in every direction, by their distance from the train.
  const fade = (z: number) => {
    // Ahead of the nose it fades sooner (towards the lens it would run over the text below).
    const d = (z - FOCUS[2]) / (z > FOCUS[2] ? 2.7 : 4.2);
    const a = Math.abs(d);
    return a >= 1 ? 0 : (1 - a) ** 1.6;
  };
  const shift = ((SLEEPERS * t) % 1) * SLEEPER; // sleepers stream backwards past the train
  for (let k = -16; k <= 16; k++) {
    const z0 = k * SLEEPER;
    for (const x of [-RAIL, RAIL]) {
      const rail: V3[] = [[x, 0, z0], [x, 0, z0 + SLEEPER]];
      out.push({ pts: rail.map(here), loose: true, weight: 0.8, ink: 0.55 * fade(z0 + SLEEPER / 2) });
    }
    const zs = z0 - shift;
    const sleeper: V3[] = [[-0.42, 0, zs], [0.42, 0, zs]];
    out.push({ pts: sleeper.map(here), loose: true, weight: 0.7, ink: 0.5 * fade(zs) });
  }

  // The engine: wheels turn with the distance covered; steam drifts back from the chimney.
  const wheel = -(TRAVEL * t) / DRIVER;
  for (const s of engine(wheel)) out.push({ ...s, pts: s.pts.map(here) });
  for (let k = 0; k < 4; k++) {
    const f = (t * 8 + k / 4) % 1;
    const c: V3 = [0.03 * Math.sin(k * 2.3), BOILER.y + BOILER.r + 0.28 + 0.5 * f, 0.88 - 1.1 * f];
    out.push({ pts: loop(c, 0.06 + 0.16 * f, X, Y, 12).map(here), loose: true, weight: 0.8, ink: 0.6 * Math.sin(Math.PI * f) * seen });
  }
  return out;
};

// ── 02 Ride · "Let's ride": an Orbea Orca Aero, built from solid parts ──────────────────────

/*
 * Geometry in metres (x forward, y up, rear axle → front axle), size-53 road frame: wheelbase
 * 0.99, BB drop 7 cm, stack 55 cm, reach 38.5 cm, seat 73.5°, head 73°, 700c wheels with 50 mm
 * rims. Every member is a swept body between shared joints: round, aero (deep and thin) or
 * flat, as on the real bike.
 */
const R: V3 = [-0.495, 0, 0];
const F: V3 = [0.495, 0, 0];
const BB: V3 = [-0.08, -0.07, 0];
const deg = Math.PI / 180;
const SEAT_DIR: V3 = [-Math.cos(73.5 * deg), Math.sin(73.5 * deg), 0];
const HEAD_TOP: V3 = [BB[0] + 0.385, BB[1] + 0.55, 0];
const HEAD_DIR: V3 = [Math.cos(73 * deg), -Math.sin(73 * deg), 0];
const HEAD_LOW = add(HEAD_TOP, scale(HEAD_DIR, 0.15));
const TYRE = { R: 0.318, rx: 0.022, rz: 0.0135 };
const RIM = { R: 0.282, rx: 0.026, rz: 0.011 };
const SEAT_LEN = 0.52;

const CARBON: Skin = { tone: 'ink', lit: [0.42, 0.98], weight: 0.3, ink: 0.5 };
const RUBBER: Skin = { tone: 'ink', lit: [0.7, 1], bare: true };
const ALLOY: Skin = { tone: 'ink', lit: [0.3, 0.85], bare: true };
const RUBBER_HOOD: Skin = { tone: 'ink', lit: [0.55, 0.95], weight: 0.3, ink: 0.5 };
const BLUE: Skin = { tone: 'cobalt', lit: [0.75, 1], weight: 0.25, ink: 0.5 };

/** The seat tube, bowed to hug the rear tyre (ends: BB and the top). */
const SEAT_TUBE: V3[] = Array.from({ length: 9 }, (_, i) => {
  const k = i / 8;
  return add(add(BB, scale(SEAT_DIR, SEAT_LEN * k)), [0.032 * Math.sin(Math.PI * Math.min(1, k * 1.5)), 0, 0]);
});
const onSeatTube = (d: number): V3 => {
  const f = (d / SEAT_LEN) * 8;
  const i = Math.min(7, Math.floor(f));
  return lerp3(SEAT_TUBE[i], SEAT_TUBE[i + 1], f - i);
};
const SEAT_TOP = SEAT_TUBE[8];
const TOP_JOIN = onSeatTube(0.5);
const STAY_JOIN = onSeatTube(0.38);
const side = (p: V3, z: number): V3 => [p[0], p[1], z];
const STEM_END: V3 = add(HEAD_TOP, [0.1, 0.03, 0]);

/** The parts that never move relative to the frame. */
const BIKE_STATIC: Stroke[] = (() => {
  const out: Stroke[] = [];
  const Zs = [-1, 1];

  // Frame: head tube, aero top tube, deep and narrow down tube, bowed seat tube
  out.push(...pipe(HEAD_TOP, HEAD_LOW, [0.023, 0.023], [0.023, 0.023], 10, CARBON));
  out.push(...pipe(TOP_JOIN, HEAD_TOP, [0.013, 0.017], [0.016, 0.02], 8, CARBON));
  out.push(...pipe(BB, add(HEAD_LOW, [0.012, -0.02, 0]), [0.027, 0.02], [0.03, 0.022], 8, CARBON)); // down tube: deep, thin
  out.push(...sweep(SEAT_TUBE, () => [0.011, 0.0185], 8, CARBON));
  out.push(...pipe(add(BB, [0, 0, -0.03]), add(BB, [0, 0, 0.03]), [0.026, 0.026], [0.026, 0.026], 10, CARBON)); // BB shell
  for (const z of Zs) {
    out.push(...pipe(side(BB, z * 0.03), side(R, z * 0.052), [0.009, 0.0125], [0.007, 0.009], 8, CARBON)); // chainstays
    out.push(...pipe(side(STAY_JOIN, z * 0.016), side(R, z * 0.05), [0.007, 0.007], [0.006, 0.006], 8, CARBON)); // dropped seatstays
  }
  // Fork: crown, two aero blades, dropouts
  const crown = add(HEAD_LOW, scale(HEAD_DIR, 0.01));
  out.push(...pipe(side(crown, -0.045), side(crown, 0.045), [0.014, 0.014], [0.014, 0.014], 8, CARBON));
  for (const z of Zs) out.push(...pipe(side(crown, z * 0.045), side(F, z * 0.052), [0.017, 0.011], [0.008, 0.008], 8, CARBON));

  // Aero seatpost, clamp and a lofted saddle (wide at the back, narrow nose, a dip along the top)
  const post = add(SEAT_TOP, scale(SEAT_DIR, 0.14));
  out.push(...pipe(SEAT_TOP, post, [0.012, 0.017], [0.012, 0.017], 8, CARBON));
  const rails = add(post, [0, 0.025, 0]);
  const saddle = Array.from({ length: 9 }, (_, i) => {
    const k = i / 8;
    const x = lerp(-0.125, 0.145, k);
    const dip = 0.012 * Math.sin(Math.PI * k) - 0.005 * k;
    return { c: add(rails, [x, dip, 0]), w: lerp(0.068, 0.017, k ** 0.8), h: lerp(0.019, 0.011, k) };
  });
  out.push(...sweep(saddle.map((p) => p.c), (i) => [saddle[i].h, saddle[i].w], 10, { tone: 'ink', lit: [0.55, 1], weight: 0.3, ink: 0.5 }, [0, 1, 0]));
  out.push(...pipe(add(rails, [-0.09, -0.02, 0]), add(rails, [0.08, -0.02, 0]), [0.004, 0.004], [0.004, 0.004], 6, ALLOY, [0, 0, 1]));

  // Handlebar: a one-piece aero bar. Flat wing on top, swept drops, hoods with a lever.
  const stem = [HEAD_TOP, add(HEAD_TOP, [0.05, 0.014, 0]), STEM_END];
  out.push(...sweep(stem, () => [0.014, 0.019], 8, CARBON, [0, 0, 1]));
  const wing: V3[] = Array.from({ length: 9 }, (_, i) => [STEM_END[0], STEM_END[1], lerp(-0.2, 0.2, i / 8)] as V3);
  out.push(...sweep(wing, (i) => (Math.abs(i - 4) < 1 ? [0.015, 0.011] : [0.012, 0.0085]), 8, CARBON, [0, 1, 0]));
  for (const z of Zs) {
    const q = (dx: number, dy: number): V3 => [STEM_END[0] + dx, STEM_END[1] + dy, z * 0.2];
    // the bend forward, down and back: a smooth curve through shared joints
    const drop: V3[] = [q(0, 0), q(0.03, 0.002), q(0.063, -0.008), q(0.088, -0.034), q(0.098, -0.07), q(0.087, -0.108), q(0.052, -0.132), q(0.012, -0.132)];
    out.push(...sweep(drop, () => [0.0108, 0.0108], 8, CARBON, [0, 0, 1]));
    // hood: a smooth rubber shell, rising forward from the bend, with the lever below it
    const hood = [q(0.03, 0.002), q(0.062, 0.016), q(0.086, 0.034), q(0.098, 0.036)];
    out.push(...sweep(hood, (i) => [[0.016, 0.016], [0.021, 0.02], [0.021, 0.02], [0.013, 0.014]][i] as [number, number], 8, RUBBER_HOOD, [0, 0, 1]));
    out.push(...pipe(q(0.082, 0.026), q(0.108, -0.058), [0.004, 0.0075], [0.003, 0.006], 6, ALLOY, [0, 0, 1]));
  }

  // Hubs and discs: a ring in the brake colour, one on each wheel
  for (const hub of [R, F]) {
    out.push(...pipe(side(hub, -0.05), side(hub, 0.05), [0.016, 0.016], [0.016, 0.016], 8, ALLOY));
    out.push(...torus(side(hub, -0.033), 0.075, [0.004, 0.0015], 18, 4, BLUE));
  }
  // Drivetrain: chainring (cobalt: where the watts go), cassette, chain, derailleur
  out.push(...torus(side(BB, 0.062), 0.098, [0.01, 0.004], 22, 4, BLUE));
  out.push(...torus(side(R, 0.058), 0.045, [0.016, 0.006], 14, 4, ALLOY));
  const chain = (pts: V3[]): Stroke => ({ pts, weight: 0.8, ink: 0.8 });
  out.push(chain([add(BB, [0, 0.106, 0.062]), add(R, [0, 0.059, 0.058])]));
  out.push(chain([add(BB, [0, -0.106, 0.062]), add(R, [0.03, -0.085, 0.058]), add(R, [-0.02, -0.12, 0.058]), add(R, [-0.03, -0.062, 0.058])]));
  out.push(...pipe(add(R, [0.0, -0.015, 0.058]), add(R, [0.03, -0.085, 0.058]), [0.007, 0.012], [0.007, 0.012], 6, ALLOY, [0, 1, 0]));
  out.push(...pipe(add(R, [0.03, -0.085, 0.058]), add(R, [-0.02, -0.12, 0.058]), [0.006, 0.012], [0.006, 0.012], 6, ALLOY, [0, 1, 0]));
  return out;
})();

/** Wheels as solids: tyre and deep rim are tori, so they look the same however they turn. */
const WHEELS: Stroke[] = [R, F].flatMap((hub) => [
  ...torus(hub, TYRE.R, [TYRE.rx, TYRE.rz], 26, 7, RUBBER),
  ...torus(hub, RIM.R, [RIM.rx, RIM.rz], 26, 4, { tone: 'ink', lit: [0.35, 0.8], weight: 0.3, ink: 0.4 }),
]);

/** The static parts, lowered a touch so the bike sits in the middle of its frame. Built once. */
const LOWER = (p: V3): V3 => [p[0], p[1] + 0.06, p[2]];
const BIKE_SOLID: Stroke[] = [...BIKE_STATIC, ...WHEELS].map((s) => ({ ...s, pts: s.pts.map(LOWER) }));

export const ride: Scene = (t) => {
  const roll = -TAU * 3 * t; // the wheels: three turns per loop
  const crank = -TAU * 2 * t;
  // The camera drifts round the bike (registry: `spin`); the thousand faces of the bike itself are
  // never rebuilt. Only what moves is: spokes, cranks, pedals and the road.
  const place = LOWER;
  const out: Stroke[] = [...BIKE_SOLID];
  const put = (strokes: Stroke[]) => strokes.forEach((s) => out.push({ ...s, pts: s.pts.map(place) }));

  // Spokes: bladed, straight-pull; twelve per wheel, turning with the wheel
  for (const hub of [R, F])
    for (let i = 0; i < 12; i++) {
      const a = roll + (TAU * i) / 12;
      const p = add(hub, [0.02 * Math.cos(a), 0.02 * Math.sin(a), 0]);
      const q = add(hub, [RIM.R * 0.97 * Math.cos(a + 0.1), RIM.R * 0.97 * Math.sin(a + 0.1), 0]);
      out.push({ pts: [p, q].map(place), weight: 0.45, ink: 0.55 });
    }
  // Cranks and pedals turn with the legs we cannot see
  for (const [z, off] of [[0.098, 0], [-0.098, Math.PI]] as const) {
    const end = add(BB, [0.1725 * Math.cos(crank + off), 0.1725 * Math.sin(crank + off), z]);
    put(pipe(add(BB, [0, 0, z]), end, [0.014, 0.0045], [0.009, 0.0045], 6, BLUE, [0, 0, 1]));
    put(pipe(add(end, [-0.05, 0, z * 0.2]), add(end, [0.05, 0, z * 0.2]), [0.007, 0.018], [0.007, 0.018], 6, ALLOY, [0, 0, 1]));
  }
  // A soft shadow on the ground, and the road streaming past underneath (two passes per loop)
  const ground = -(TYRE.R + TYRE.rx) - 0.04;
  const shadow: V3[] = Array.from({ length: 21 }, (_, i) => [0.1 + 0.78 * Math.cos((TAU * i) / 20), ground, 0.2 * Math.sin((TAU * i) / 20)] as V3);
  out.push({ pts: shadow.map(place), fill: 'ink', bare: true, under: true, ink: 0.14, loose: true });
  for (let i = 0; i < 7; i++) {
    const x = (((i / 7 - 2 * t) % 1) + 1) % 1;
    const u = lerp(-1.25, 1.25, x);
    const dash: V3[] = [[u, ground, 0.17], [u + 0.2, ground, 0.17]];
    out.push({ pts: dash.map(place), ink: 0.4 * Math.sin(Math.PI * x), weight: 0.9, loose: true });
  }
  return out;
};
