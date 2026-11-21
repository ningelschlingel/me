import { Component, ElementRef, inject, input, viewChild } from '@angular/core';
import { Viewport } from '../../layout';
import { live, stageRoom } from '../sketch/live';
import { CameraRig } from '../sketch/rig';
import { background, parse, titleCeiling } from '../sketch/stage';
import { Pen, Plan, drawConstruction } from './construction';

const TAU = Math.PI * 2;

/** Process inks: cyan, magenta, yellow (0…1). Over each other they mix to blue-violet, red and green. */
const INKS = [
  [0.0, 0.64, 0.9],
  [0.93, 0.1, 0.56],
  [1.0, 0.87, 0.12],
];
/** Where each disc rests on the triangle (screen angles: cyan on top, magenta right, yellow left). */
const ANGLES = [-Math.PI / 2, Math.PI / 6, (5 * Math.PI) / 6];
/** Distance of each disc from the middle, in radii. */
const SPREAD = 0.57;
/** How much the group drifts together and apart, and how far each disc wanders on its own (shares). */
const GATHER = 0.14;
const WANDER = 0.14;
/** One slow turn of the whole group, seconds. */
const TURN_S = 140;
/** Parallax: how far each disc follows the pointer (radii per radian of the shared camera lean). Unequal, so they shift against each other. */
const DEPTH = [0.32, -0.2, 0.14];
/** Handheld shake per disc: how far it may sway (radii) and how much it may zoom (share). Small: felt more than seen. */
const SHAKE = 0.03;
const SHAKE_ZOOM = 0.012;
/** Where a disc's grain fully stops, in radii: its box must hold this much. */
const FADE_END = 1.2;
/** At its softest a disc's edge spreads this far inwards and outwards, in radii: a gentle blur, never a smear. */
const BLUR = 0.15;
/** Half the drawing's size over all its motion, in radii. */
const REACH = (FADE_END + BLUR) * 1.06 + SPREAD * (1 + GATHER) * (1 + WANDER) + SHAKE * 1.5 + 0.12;

/**
 * Each ink has its own pulse: it comes into focus, at its most intense, and softens again.
 * A single smooth wave per ink (no segments, so no kinks or jumps), slightly lopsided: it
 * sharpens a little quicker than it softens (skew), and lingers at both ends.
 *
 * The periods (seconds) share no common rhythm, and each phase also drifts slowly on its own,
 * so the three never fall into step and no cycle exactly repeats the one before.
 */
const PULSES = [
  { period: 11.3, skew: 0.26, offset: 0 },
  { period: 13.9, skew: 0.18, offset: 0.41 },
  { period: 16.7, skew: 0.3, offset: 0.73 },
];
/** How far (in cycles) each phase may drift ahead or behind, and how slowly. */
const DRIFT = 0.14;
const DRIFT_RATE = 0.025;
/** The construction drawing draws itself in over this long (seconds) when first seen. */
const REVEAL_S = 2.6;
/** With reduced motion there is no pulse: they stay a little soft. */
const CALM_BLUR = 0.35;

/** How blurred ink `i` is (0 sharp … 1 at its softest) at local time `s`. */
export function blurAt(s: number, i: number): number {
  const { period, skew, offset } = PULSES[i];
  const phase = s / period + offset + DRIFT * noise(s * DRIFT_RATE, 40 + i);
  const t = phase - Math.floor(phase);
  // Warped time: runs a little faster in the first half, slower in the second, smooth throughout.
  const w = t + (skew * (1 - Math.cos(TAU * t))) / TAU;
  // A cosine wave, softly flattened at the ends (smootherstep), so it rests a moment there.
  const x = 0.5 + 0.5 * Math.cos(TAU * w);
  return Math.min(1, x * x * x * (x * (x * 6 - 15) + 10));
}

/**
 * Three soft, grainy colour discs on a triangle, mixing where they overlap.
 *
 * Drawn by one small fragment shader (WebGL, no library), because the look depends on
 * per-pixel work canvas 2D cannot do every frame:
 *  - the grain is fixed to the screen, like film, while the colour moves beneath it;
 *  - it is added to each disc's opacity, so the soft edge breaks up into specks (dithering
 *    instead of a blurred fade), and it hides the banding of a smooth gradient;
 *  - the inks mix subtractively per pixel: paper × each ink, as in print.
 *
 * Motion is slow gradient noise, not sines: no visible loop, no wobble. The group turns
 * very slowly, drifts together and apart, each disc wanders a little, breathes and has its own
 * slight handheld shake, and with a mouse they lean towards the pointer like every sketch on
 * the site, each at its own depth.
 *
 * Over the colour, still behind the text, a crisp 2D canvas carries the construction
 * drawing (see construction.ts).
 */
@Component({
  selector: 'app-inks',
  template: `<canvas #canvas class="ink"></canvas><canvas #lines class="lines"></canvas>`,
  styles: `
    :host {
      position: absolute;
      inset: 0;
      pointer-events: none;
      overflow: hidden;
      transition: opacity 0.3s;
    }
    :host(.settling) { opacity: 0; transition: none; }
    canvas { position: absolute; left: 0; top: 0; }
    .lines { width: 100%; height: 100%; }
  `,
  host: { 'aria-hidden': 'true' },
})
export class Inks {
  /** Where it sits in its card: x from -1 (left) to 1 (right), size as a factor. */
  readonly place = input<{ x?: number; size?: number }>({ x: 0.45 });

  private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly linesRef = viewChild.required<ElementRef<HTMLCanvasElement>>('lines');
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly screen = inject(Viewport);
  private readonly rig = inject(CameraRig);

  private gl!: WebGLRenderingContext;
  private u!: Record<'res' | 'disc' | 'ink' | 'paper' | 'time', WebGLUniformLocation | null>;
  private lines: CanvasRenderingContext2D | null = null;
  private pen!: Pen;
  /** Disc radius (CSS px; 0 = no room, draw nothing), the group's centre and the colour canvas's corner, in the card. */
  private r = 0;
  private cx = 0;
  private cy = 0;
  private ox = 0;
  private oy = 0;
  /** Device pixels per CSS pixel for the line drawing. */
  private dpr = 1;
  /** Canvas pixels per CSS pixel. */
  private scale = 1;
  /** Per disc: centre x, y, radius (canvas px) and blur. */
  private readonly discs = new Float32Array(12);

  constructor() {
    live(this.host, {
      init: () => this.init(),
      resize: () => this.resize(),
      draw: (now, elapsed, calm) => this.draw(now, elapsed / 1000, calm),
    });
  }

  private init(): boolean {
    const canvas = this.canvasRef().nativeElement;
    const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false });
    if (!gl) return false;
    const program = link(gl, VERTEX, FRAGMENT);
    if (!program) return false;
    gl.useProgram(program);
    // One triangle that covers the whole canvas.
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const at = gl.getAttribLocation(program, 'aPos');
    gl.enableVertexAttribArray(at);
    gl.vertexAttribPointer(at, 2, gl.FLOAT, false, 0, 0);
    const loc = (name: string) => gl.getUniformLocation(program, name);
    this.u = { res: loc('uRes'), disc: loc('uDisc'), ink: loc('uInk'), paper: loc('uPaper'), time: loc('uTime') };
    gl.uniform3fv(this.u.ink, INKS.flat());
    gl.clearColor(0, 0, 0, 0);
    this.gl = gl;
    this.lines = this.linesRef().nativeElement.getContext('2d');
    return true;
  }

  /** Size and place the canvas: only the box the discs can reach, not the whole card. */
  private resize() {
    const width = this.host.clientWidth;
    const height = this.host.clientHeight;
    const card = this.host.parentElement!;
    const desktop = this.screen.desktop();
    const { top, room } = stageRoom(card, height, desktop, titleCeiling(card));
    const { x: side = 0, size = 1 } = this.place();
    const span = (desktop ? 0.82 : 0.8) * size;
    // Sized by the sharp discs: the blurred halo and the grain's last specks may reach past
    // the stage (behind the text, where they are faint), which lets the discs be big.
    const solid = REACH - (FADE_END + BLUR) * 1.06 + 0.92;
    this.r = room < 60 ? 0 : Math.min((width * span) / (2 * solid), (room * 1.04) / (2 * solid), width * 0.28);
    const shift = desktop ? side * width * 0.13 : width * (0.2 + 0.03 * side);
    const cx = (this.cx = Math.min(width / 2 + shift, width - solid * this.r - 4));
    const cy = (this.cy = top + room * (desktop ? 0.5 : 0.54));

    // About one grain per CSS pixel. On dense screens it is drawn at that size and scaled up
    // softly, which reads as film grain rather than digital noise, and costs far less.
    this.scale = Math.min(1.25, window.devicePixelRatio || 1);
    const box = Math.ceil(2 * REACH * this.r);
    const canvas = this.canvasRef().nativeElement;
    canvas.width = canvas.height = Math.max(1, Math.round(box * this.scale));
    this.ox = Math.round(cx - box / 2);
    this.oy = Math.round(cy - box / 2);
    Object.assign(canvas.style, { width: `${box}px`, height: `${box}px`, transform: `translate(${this.ox}px, ${this.oy}px)` });

    // Hairlines must be crisp: the line canvas covers the card at full density.
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    const lines = this.linesRef().nativeElement;
    lines.width = Math.round(width * this.dpr);
    lines.height = Math.round(height * this.dpr);

    const paper = parse(background(card));
    this.gl?.uniform3fv(this.u.paper, paper.map((v) => v / 255));
    const root = getComputedStyle(document.documentElement);
    this.pen = {
      ink: parse(getComputedStyle(this.host).color).join(', '),
      paper: paper.join(', '),
      font: root.getPropertyValue('--mono').trim() || 'ui-monospace, monospace',
    };
  }

  /** `s`: the local clock in seconds. */
  private draw(now: number, s: number, calm: boolean) {
    const gl = this.gl;
    if (!gl || gl.isContextLost()) return;
    const px = gl.canvas.width;
    gl.viewport(0, 0, px, px);
    gl.clear(gl.COLOR_BUFFER_BIT);
    const lines = this.lines;
    lines?.setTransform(1, 0, 0, 1, 0, 0);
    lines?.clearRect(0, 0, lines.canvas.width, lines.canvas.height);
    if (!this.r) return;

    // Geometry in CSS px (card coordinates); the colour canvas gets it shifted and scaled.
    const { r, scale, ox, oy } = this;
    const plan: Plan = { cx: this.cx, cy: this.cy, discs: [] };
    const lean = this.rig.offset(now, calm);
    const turn = (TAU * s) / TURN_S;
    const gather = 1 + GATHER * noise(s * 0.045, 11);
    for (let i = 0; i < 3; i++) {
      const k = i * 7 + 1;
      const a = ANGLES[i] + turn + 0.35 * noise(s * 0.05, k);
      const d = r * SPREAD * gather * (1 + WANDER * noise(s * 0.06, k + 1));
      const blur = calm ? CALM_BLUR : blurAt(s, i);
      // The ideal disc: what the construction drawing shows.
      const x = this.cx + Math.cos(a) * d;
      const y = this.cy + Math.sin(a) * d;
      const size = r * (1 + 0.05 * noise(s * 0.04, k + 2));
      plan.discs.push({ x, y, r: size });
      // Coming into focus, a disc swells a touch, like a held breath.
      const swell = 1 + 0.03 * (1 - blur);
      // Its own handheld camera: off with reduced motion.
      const hand = calm ? 0 : SHAKE * r;
      // The ink: off its drawing by the lean, the hand, and the swell.
      this.discs.set(
        [
          (x + lean.yaw * DEPTH[i] * r + hand * shake(s, k + 3) - ox) * scale,
          (y + lean.pitch * DEPTH[i] * r + hand * shake(s, k + 4) - oy) * scale,
          size * swell * (1 + (calm ? 0 : SHAKE_ZOOM) * shake(s, k + 5)) * scale,
          blur,
        ],
        i * 4,
      );
    }
    if (lines) {
      lines.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      drawConstruction(lines, plan, this.pen, calm ? 1 : Math.min(1, s / REVEAL_S));
    }
    gl.uniform2f(this.u.res, px, px);
    gl.uniform4fv(this.u.disc, this.discs);
    gl.uniform1f(this.u.time, s);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}

const VERTEX = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const FRAGMENT = `
precision highp float;
uniform vec2 uRes;
uniform vec4 uDisc[3]; // centre x, y (canvas px, y down), radius px, blur (0 sharp … 1 softest)
uniform vec3 uInk[3];
uniform vec3 uPaper;
uniform float uTime;

const float BODY = 0.7;   // opacity of a disc's middle when soft …
const float BODY_SHARP = 0.95; // … and when in focus: the inks at full strength
const float CORE = 0.38;  // where its fade starts, in radii
const float GRAIN = 0.34; // grain strength in the fade
const float WARP = 0.035; // how much the edge drifts off a true circle
const float FADE_END = ${FADE_END.toFixed(2)};
const float BLUR = ${BLUR.toFixed(2)};

// Hash without sine (Dave Hoskins): even, pattern-free white noise.
float hash(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

void main() {
  vec2 p = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  // Film grain, fixed to the screen. Two samples summed: most grains are mild, few are harsh.
  float g = hash(floor(p)) + hash(floor(p) + 71.7) - 1.0;
  vec3 through = vec3(1.0); // what the inks let through, per channel
  float clear = 1.0;        // what no ink covers
  for (int i = 0; i < 3; i++) {
    vec4 d = uDisc[i];
    vec2 q = (p - d.xy) / d.z;
    // The edge drifts slowly a hair off the circle: ink, not geometry.
    float w = vnoise(q * 1.4 + vec2(float(i) * 5.3, uTime * 0.07)) - 0.5;
    float r = length(q) * (1.0 + WARP * w);
    // Blur, exactly as a lens would for a disc: the edge spreads inwards and outwards, and the
    // ink thins out a little as it spreads. Only the colour blurs; the grain stays on top, sharp.
    float spread = BLUR * d.w;
    float fade = smoothstep(max(0.06, CORE - spread * 0.75), 1.0 + spread, r);
    // In focus the ink is at its densest; the grain still shows as paper specks through it.
    float a = mix(BODY_SHARP, BODY, d.w) * (1.0 - fade);
    // Mild texture inside, full grain in the fade, none past its end: specks, not a hard ring.
    a += GRAIN * g * mix(0.4, 1.0, fade) * (1.0 - smoothstep(0.85 + spread, FADE_END + spread, r));
    a = clamp(a, 0.0, 1.0);
    through *= mix(vec3(1.0), uInk[i], a);
    clear *= 1.0 - a;
  }
  // Over the paper the result is paper × through. Written premultiplied, with what the inks
  // cover as alpha, so the canvas stays clear around the discs.
  gl_FragColor = vec4(uPaper * (through - clear), 1.0 - clear);
}
`;

function link(gl: WebGLRenderingContext, vs: string, fs: string): WebGLProgram | null {
  const program = gl.createProgram();
  for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]] as const) {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.warn(gl.getShaderInfoLog(shader));
      return null;
    }
    gl.attachShader(program, shader);
  }
  gl.linkProgram(program);
  return gl.getProgramParameter(program, gl.LINK_STATUS) ? program : null;
}

/**
 * A hand holding a camera, about −1…1: a slow sway, a breathing drift, and a faint tremor,
 * each a layer of noise at its own speed (wobbles per second), weighted towards the slow ones. Every
 * seed is a different hand.
 */
function shake(s: number, seed: number) {
  return 0.6 * noise(s * 0.23, seed) + 0.3 * noise(s * 0.61, seed + 100) + 0.1 * noise(s * 1.7, seed + 200);
}

/** Smooth 1D gradient noise, about −1…1: slow wandering with no visible period. */
function noise(x: number, seed: number) {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * f * (f * (f * 6 - 15) + 10);
  const a = grad(i, seed) * f;
  const b = grad(i + 1, seed) * (f - 1);
  return 2 * (a + (b - a) * u);
}

function grad(i: number, seed: number) {
  let h = Math.imul(i ^ Math.imul(seed, 0x27d4eb2d), 0x9e3779b1);
  h ^= h >>> 15;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  return ((h >>> 0) / 4294967296) * 2 - 1;
}
