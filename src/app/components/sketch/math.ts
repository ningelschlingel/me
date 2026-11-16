/** Tiny 3D toolkit for the sketch scenes. Units: the scene lives roughly in [-1, 1]³, y up. */

export type V3 = [number, number, number];

/** Named colours the renderer resolves from the page (CSS tokens), always mixed with the card's background by depth. */
export type Tone = 'ink' | 'accent' | 'cobalt' | 'mango';

export interface Stroke {
  pts: V3[];
  /** Line colour (default: the card's text colour). */
  tone?: Tone;
  /** @deprecated use tone: 'accent' */
  accent?: boolean;
  /** Line weight multiplier. */
  weight?: number;
  /** 0…1, fades toward the background (e.g. shadows, a world seen without glasses). */
  ink?: number;
  /** Fill the closed polygon in this tone (drawn in depth order with everything else). */
  fill?: Tone;
  /** No outline, only the fill. */
  bare?: boolean;
  /** A lens: a closed outline. Everything with a `tint` is drawn again inside it, in colour. */
  lens?: boolean;
  /** Colour this stroke takes when seen through a lens. */
  tint?: Tone;
  /**
   * A solid face (with `fill`): shaded by a light from the upper left, hidden when it faces
   * away. [bright, dark] is how much colour the most and the least lit side gets.
   * Faces must wind counter-clockwise seen from outside (see `outward`).
   */
  lit?: [number, number];
  /** Lies on the ground: always painted first (in the order given), always behind the text. */
  under?: boolean;
  /** Sits on a surface (a label, an LED): painted this much nearer than its depth says. */
  lift?: number;
  /** Surroundings (track, road, steam): drawn, but not used to size the scene. */
  loose?: boolean;
  /**
   * For lines printed on a solid's surface (a symbol on a coin): the surface normal, in the
   * scene's space. The line disappears when that surface faces away.
   */
  normal?: V3;
}

/** Newell normal of a polygon (unnormalised). */
export function newell(pts: V3[]): V3 {
  const n: V3 = [0, 0, 0];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    n[0] += (a[1] - b[1]) * (a[2] + b[2]);
    n[1] += (a[2] - b[2]) * (a[0] + b[0]);
    n[2] += (a[0] - b[0]) * (a[1] + b[1]);
  }
  return n;
}

/** Winds a face so its normal points along `out` (outwards from the solid). */
export const outward = (pts: V3[], out: V3): V3[] => (dot(newell(pts), out) < 0 ? [...pts].reverse() : pts);

/** A scene is a pure function of the loop phase t ∈ [0, 1). t = 0 and t = 1 must look identical. */
export type Scene = (t: number) => Stroke[];

export const TAU = Math.PI * 2;

export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
export const lerp3 = (a: V3, b: V3, k: number): V3 => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
export const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
export const norm = (a: V3): V3 => scale(a, 1 / (len(a) || 1));
export const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export const rotY = ([x, y, z]: V3, a: number): V3 => {
  const c = Math.cos(a), s = Math.sin(a);
  return [x * c + z * s, y, -x * s + z * c];
};
export const rotX = ([x, y, z]: V3, a: number): V3 => {
  const c = Math.cos(a), s = Math.sin(a);
  return [x, y * c - z * s, y * s + z * c];
};
export const rotZ = ([x, y, z]: V3, a: number): V3 => {
  const c = Math.cos(a), s = Math.sin(a);
  return [x * c - y * s, x * s + y * c, z];
};

/** Rodrigues: rotate v around unit axis k by angle a. */
export function rotAxis(v: V3, k: V3, a: number): V3 {
  const c = Math.cos(a), s = Math.sin(a);
  const cross: V3 = [k[1] * v[2] - k[2] * v[1], k[2] * v[0] - k[0] * v[2], k[0] * v[1] - k[1] * v[0]];
  return add(add(scale(v, c), scale(cross, s)), scale(k, dot(k, v) * (1 - c)));
}

/** 0 before a, 1 after b, linear in between. */
export const span = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));

export const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);
export const easeIn = (x: number) => x * x * x;
export const easeOut = (x: number) => 1 - (1 - x) ** 3;
/** Overshoots a little, then lands: things "click" into place. */
export const easeOutBack = (x: number) => {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2;
};
/** A few decaying bounces. Exactly 0 at 0 and exactly 1 at 1 (the (1 - x) factor), so loops stay seamless. */
export const easeOutElastic = (x: number) =>
  x <= 0 ? 0 : x >= 1 ? 1 : 1 - Math.cos(3.5 * Math.PI * x) * Math.exp(-4 * x) * (1 - x);

/** Deterministic pseudo-random in [0, 1) per index, so scenes are stable between frames. */
export const rand = (i: number, salt = 0) => {
  const s = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

/** A smooth loop around a periodic phase: integer frequencies only, so t = 0 and t = 1 match. */
export const wave = (t: number, freq: number, phase = 0) => Math.sin(TAU * (t * freq + phase));
