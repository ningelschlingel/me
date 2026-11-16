import { Component, DestroyRef, ElementRef, afterNextRender, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { Viewport } from '../../layout';
import { CameraRig } from '../sketch/rig';
import { titleCeiling } from '../sketch/stage';
import { Tile } from '../tile/tile';

/**
 * "?!" as two polished, round 3D objects, ray-marched in a tiny fragment shader:
 * signed distance fields (a torus arc, capsules and spheres) blended smoothly,
 * lit with a soft key light, a rim and a glossy specular, in the palette's mango.
 * The background stays transparent, so the card shows through.
 *
 * Seamless: every motion is a sine of the loop phase. Runs only while visible.
 */
const VERT = `
attribute vec2 p;
void main() { gl_Position = vec4(p, 0.0, 1.0); }
`;

const FRAG = (steps: number) => `
precision highp float;
#define STEPS ${steps}
uniform vec2 res;
uniform float t;      // loop phase 0..1
uniform vec2 lean;    // camera lean from the rig (yaw, pitch)
uniform vec3 base;    // mango
uniform vec3 bg;      // card colour, for the environment

const float TAU = 6.28318530718;
const float FOV = 1.22; // the marks just fill the shorter side of the canvas

mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

float sphere(vec3 p, float r) { return length(p) - r; }

// Capsule from a to b with radius ra at a and rb at b (a softly tapered stroke).
float stroke(vec3 p, vec3 a, vec3 b, float ra, float rb) {
  vec3 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h) - mix(ra, rb, h);
}

// Part of a torus in the xy plane, from angle a0 to a1 (radians, counter-clockwise).
float arc(vec3 p, float R, float r, float a0, float a1) {
  float a = atan(p.y, p.x);
  float mid = 0.5 * (a0 + a1), half_ = 0.5 * (a1 - a0);
  float d = mod(a - mid + 3.14159265, TAU) - 3.14159265;
  if (abs(d) <= half_) return length(vec2(length(p.xy) - R, p.z)) - r;
  float e = mid + sign(d) * half_;
  return length(p - vec3(R * cos(e), R * sin(e), 0.0)) - r;
}

float question(vec3 p) {
  // hook: an arc over the top, then a stem curling down into the middle
  float hook = arc(p - vec3(0.0, 0.42, 0.0), 0.3, 0.115, -1.2, 3.35);
  vec3 end = vec3(0.3 * cos(-1.2), 0.42 + 0.3 * sin(-1.2), 0.0);
  float stem = stroke(p, end, vec3(0.0, -0.12, 0.0), 0.115, 0.105);
  float dot_ = sphere(p - vec3(0.0, -0.52, 0.0), 0.135);
  return min(smin(hook, stem, 0.06), dot_);
}

float bang(vec3 p) {
  float bar = stroke(p, vec3(0.0, 0.7, 0.0), vec3(0.0, -0.14, 0.0), 0.135, 0.085);
  float dot_ = sphere(p - vec3(0.0, -0.52, 0.0), 0.135);
  return min(bar, dot_);
}

// Both marks, each bobbing and turning on its own, seamlessly.
float scene(vec3 p) {
  vec3 q = p - vec3(-0.42, 0.04 * sin(TAU * t), 0.0);
  q.xz *= rot(0.35 * sin(TAU * t));
  q.xy *= rot(0.08 * sin(TAU * t + 1.0));
  vec3 b = p - vec3(0.46, 0.04 * sin(TAU * t + 2.1), 0.0);
  b.xz *= rot(0.35 * sin(TAU * t + 1.7));
  b.xy *= rot(-0.12 + 0.08 * sin(TAU * t + 2.5));
  return min(question(q), bang(b));
}

vec3 normal(vec3 p) {
  vec2 e = vec2(0.0015, 0.0);
  return normalize(vec3(
    scene(p + e.xyy) - scene(p - e.xyy),
    scene(p + e.yxy) - scene(p - e.yxy),
    scene(p + e.yyx) - scene(p - e.yyx)));
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * res) / min(res.x, res.y);
  // Centred on the marks (they are not symmetric around the origin).
  uv += vec2(-0.045, 0.035);
  vec3 ro = vec3(0.0, 0.0, 3.2);
  vec3 rd = normalize(vec3(uv * FOV, -2.2));
  // camera lean: orbit the marks a little
  mat2 yaw = rot(-0.6 * lean.x), pitch = rot(-0.6 * lean.y);
  ro.xz *= yaw; rd.xz *= yaw;
  ro.yz *= pitch; rd.yz *= pitch;

  // March; remember the closest approach for a soft, anti-aliased silhouette.
  float d = 0.0, h = 1.0, mh = 1e9, md = 0.0;
  for (int i = 0; i < STEPS; i++) {
    h = scene(ro + rd * d);
    if (h < mh) { mh = h; md = d; }
    if (h < 0.0008 || d > 6.0) break;
    d += h * 0.9;
  }
  bool hit = h < 0.0008;
  float px = 1.6 * md * FOV / (2.2 * min(res.x, res.y)); // one pixel, in scene units
  float alpha = hit ? 1.0 : 1.0 - smoothstep(0.0, px, mh);
  if (alpha <= 0.001) { gl_FragColor = vec4(0.0); return; }

  vec3 p = ro + rd * (hit ? d : md);
  vec3 n = normal(p);
  vec3 v = -rd;
  vec3 key = normalize(vec3(-0.5, 0.8, 0.6));
  vec3 fill = normalize(vec3(0.7, -0.2, 0.5));

  float diff = max(dot(n, key), 0.0);
  float soft = 0.5 + 0.5 * dot(n, fill);
  float spec = pow(max(dot(reflect(-key, n), v), 0.0), 90.0);
  float sheen = pow(max(dot(reflect(-fill, n), v), 0.0), 24.0);
  float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);

  // Polished: a deep body colour, a soft wrap, the card reflected at grazing angles, crisp highlights.
  vec3 deep = base * vec3(0.72, 0.5, 0.32);
  vec3 col = mix(deep, base, 0.25 + 0.75 * diff);
  col += base * 0.18 * soft;
  col = mix(col, bg * 1.15 + 0.08, fres * 0.55);
  col += vec3(1.0, 0.97, 0.9) * (spec * 1.1 + sheen * 0.25);
  gl_FragColor = vec4(col, alpha);
}
`;

@Component({
  selector: 'app-marks',
  template: `
    <canvas #canvas [class.on]="ready()"></canvas>
    @if (!ready()) { <span class="fallback">?!</span> }
  `,
  styleUrl: './marks.css',
  host: { 'aria-hidden': 'true' },
})
export class Marks {
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly rig = inject(CameraRig);
  private readonly screen = inject(Viewport);
  private readonly tile = inject(Tile, { optional: true });
  readonly ready = signal(false);
  private settling = false;
  private settleTimer?: ReturnType<typeof setTimeout>;
  private relayout = () => {};
  private restart = () => {};

  constructor() {
    const destroyRef = inject(DestroyRef);

    // While the tile moves, its layout changes every frame: rest, then lay out once and fade in.
    effect(() => {
      const state = this.tile?.state();
      untracked(() => {
        if (state === undefined) return;
        this.settling = true;
        this.host.classList.add('settling');
        clearTimeout(this.settleTimer);
        this.settleTimer = setTimeout(() => {
          this.settling = false;
          this.relayout();
          this.restart();
          this.host.classList.remove('settling');
        }, 780);
      });
    });

    afterNextRender(() => {
      if (typeof IntersectionObserver === 'undefined' || typeof ResizeObserver === 'undefined') return;
      const canvas = this.canvas().nativeElement;
      const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false, antialias: true });
      if (!gl) return;
      const phone = !this.screen.fine;
      const program = link(gl, phone ? 52 : 72);
      if (!program) return;

      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(program, 'p');
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      const u = (name: string) => gl.getUniformLocation(program, name);
      const uRes = u('res'), uT = u('t'), uLean = u('lean'), uBase = u('base'), uBg = u('bg');

      const style = getComputedStyle(document.documentElement);
      gl.uniform3fv(uBase, rgb(style.getPropertyValue('--color-mango').trim() || '#ffa630'));
      gl.uniform3fv(uBg, rgb(getComputedStyle(this.host.closest('app-tile') ?? this.host).backgroundColor));

      const calm = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
      const PERIOD = 7000;
      let elapsed = 0, last = 0, frame = 0, visible = false;

      const draw = (now: number) => {
        const lean = this.rig.offset(now, calm);
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.uniform2f(uRes, canvas.width, canvas.height);
        gl.uniform1f(uT, (elapsed % PERIOD) / PERIOD);
        gl.uniform2f(uLean, lean.yaw, lean.pitch);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      };
      // Only what can be seen: in view, in an open tile, not while the tile is moving.
      const live = () => visible && !this.settling && (this.tile?.open() ?? true);
      const loop = (now: number) => {
        elapsed += Math.min(50, Math.max(0, now - last)) * (calm ? 0.35 : 1);
        last = now;
        draw(now);
        frame = live() ? requestAnimationFrame(loop) : 0;
      };
      const start = () => {
        if (frame || !live()) return;
        last = performance.now();
        frame = requestAnimationFrame(loop);
      };
      this.restart = start;

      const layout = () => {
        // The canvas is bigger than the box the marks take in the layout: it reaches up to the
        // title, overlapping it by a third of a letter at most (see titleCeiling).
        const card = this.host.parentElement!;
        const ceiling = titleCeiling(card);
        const up = ceiling === null ? 0 : Math.max(0, this.host.offsetTop - ceiling);
        canvas.style.top = `${-up}px`;
        canvas.style.height = `${this.host.offsetHeight + up}px`;
        // Ray marching is per pixel: a pixel budget keeps phones smooth however big the canvas gets.
        const w = canvas.clientWidth, h = this.host.offsetHeight + up;
        const budget = phone ? 260_000 : 700_000;
        const dpr = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(budget / Math.max(1, w * h)));
        canvas.width = Math.max(1, Math.round(w * dpr));
        canvas.height = Math.max(1, Math.round(h * dpr));
        draw(performance.now());
      };
      this.relayout = layout;
      const ro = new ResizeObserver(() => {
        if (!this.settling) layout();
      });
      ro.observe(this.host);
      const io = new IntersectionObserver(([e]) => {
        visible = e.isIntersecting && !document.hidden;
        start();
      });
      io.observe(this.host);
      this.ready.set(true);

      destroyRef.onDestroy(() => {
        clearTimeout(this.settleTimer);
        cancelAnimationFrame(frame);
        ro.disconnect();
        io.disconnect();
      });
    });
  }
}

function link(gl: WebGLRenderingContext, steps: number) {
  const compile = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
  };
  const vs = compile(gl.VERTEX_SHADER, VERT);
  const fs = compile(gl.FRAGMENT_SHADER, FRAG(steps));
  if (!vs || !fs) return null;
  const p = gl.createProgram()!;
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) return null;
  gl.useProgram(p);
  return p;
}

/** CSS colour → [r, g, b] in 0..1. */
function rgb(color: string): number[] {
  const c = document.createElement('canvas').getContext('2d');
  if (!c) return [1, 0.65, 0.2];
  c.fillStyle = color;
  const v = c.fillStyle as string;
  const parts = v.startsWith('#') ? [1, 3, 5].map((i) => parseInt(v.slice(i, i + 2), 16)) : (v.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
  return parts.map((x) => x / 255);
}
