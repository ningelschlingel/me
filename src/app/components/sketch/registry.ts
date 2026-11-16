import { Scene, TAU } from './math';
import { architect, designer, embedded } from './scenes';
import { aesthetics, analog, heart, logic, metal, strategy } from './scenes-me';
import { camera, ride, train } from './scenes-ours';

/**
 * Every sketch on the site. One family per column:
 *  YOU – white on cobalt, seen almost head-on, things that assemble.
 *  ME  – ink on paper, seen from above-left, small objects with a personality.
 *  OURS – ink on orange, precise machines in motion.
 */
export type SketchKind =
  | 'architect' | 'embedded' | 'designer'
  | 'heart' | 'logic' | 'metal' | 'aesthetics' | 'strategy' | 'analog'
  | 'train' | 'ride';

interface Entry {
  scene: Scene;
  /** Loop length, ms. */
  period: number;
  /** Camera, radians: turn around y (positive = from the left) and tilt (positive = from above). */
  yaw: number;
  pitch: number;
  /**
   * Framing (projected, unit scale) when the auto-fit over the whole loop is not what we want,
   * e.g. a train that runs out of frame on purpose.
   */
  frame?: { minX: number; maxX: number; minY: number; maxY: number };
  /** A camera turn over the loop (radians, added to the yaw): the cheap way to orbit a model that is otherwise static. */
  spin?: (t: number) => number;
  /** Where the camera's focus lies in depth over the loop (a moving camera): depth shading is relative to it. */
  focus?: (t: number) => number;
  /** Where it sits in its card: x from -1 (left) to 1 (right), size as a factor. */
  place?: { x?: number; size?: number };
}

const YOU = { yaw: 0, pitch: 0.36 };
const ME = { yaw: 0.55, pitch: 0.5 };

export const SCENES: Record<SketchKind, Entry> = {
  // One family: the same stage, the same size, a slight offset so the three do not stack up.
  architect: { scene: architect, period: 16000, ...YOU, place: { x: 0.35, size: 1.05 } },
  embedded: { scene: embedded, period: 13000, ...YOU, place: { x: 0.35, size: 1.05 } },
  designer: { scene: designer, period: 15000, ...YOU, place: { x: 0.35, size: 1.05 } },

  // Each ME object has its own spot and its own angle, so the slides don't repeat each other.
  heart: { scene: heart, period: 9600, yaw: 0.28, pitch: 0.3, place: { x: 0.1 } },
  logic: { scene: logic, period: 12000, ...ME, place: { x: 0.85, size: 0.82 } },
  metal: { scene: metal, period: 9000, yaw: 0.35, pitch: 0.3, place: { x: -0.55 } },
  aesthetics: { scene: aesthetics, period: 10000, yaw: 0.5, pitch: 0.3, place: { x: 0.45 } },
  // Nearly head-on, so both faces of the coin can be read.
  strategy: { scene: strategy, period: 7000, yaw: 0.15, pitch: 0.18, place: { x: 0.8, size: 0.8 } },
  analog: { scene: analog, period: 9000, yaw: 0.3, pitch: 0.22, place: { x: -0.35 } },

  // Low, along the track: the train comes at you, the camera swings round and watches it go.
  train: { scene: train, period: 15000, yaw: 0, pitch: 0, frame: { minX: -1.55, maxX: 1.55, minY: -1.5, maxY: 1.45 }, place: { x: 0.3 }, focus: (t) => 4.2 - camera(t).dist },
  ride: { scene: ride, period: 9000, yaw: 0, pitch: 0.18, place: { x: -0.2 }, spin: (t) => -0.62 + 0.62 * Math.sin(TAU * t) },
};
