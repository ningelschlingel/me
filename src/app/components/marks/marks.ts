import { Component, DestroyRef, ElementRef, afterNextRender, effect, inject, signal, untracked } from '@angular/core';
import { Viewport } from '../../layout';
import { CameraRig } from '../sketch/rig';
import { titleCeiling } from '../sketch/stage';
import { Tile } from '../tile/tile';
import { Magnets } from './magnets';

/**
 * "?!" as two polished, round 3D objects, ray-marched in a tiny fragment shader: signed
 * distance fields (a torus arc, capsules and spheres) blended smoothly, lit with a soft key
 * light, a rim and a glossy specular, in the palette's mango. Transparent around them.
 *
 * The canvas covers the whole tile they live in (and the tile clips it), so the marks can
 * drift in from outside it, across the title and the text, before they land in their spot.
 * It hangs on the tile itself, outside the pages, so no page edge cuts them off; their spot
 * is measured every frame, so they still travel with their page when it is swiped. Where
 * they are comes from a little physics model (magnets.ts); the shader draws them there.
 */
const VERT = `
attribute vec2 p;
void main() { gl_Position = vec4(p, 0.0, 1.0); }
`;

const FRAG = (steps: number) => `
precision highp float;
#define STEPS ${steps}
uniform vec2 res;
uniform vec3 rest;    // the marks' resting box: centre (px, from the bottom left) and px per unit
uniform vec4 q;       // the question mark: x, y (units), turn about y, roll
uniform vec4 b;       // the exclamation mark, likewise
uniform float t;      // idle loop phase 0..1
uniform vec2 lean;    // camera lean from the rig (yaw, pitch)
uniform vec3 base;    // mango
uniform vec3 bg;      // card colour, for the environment

const float TAU = 6.28318530718;
/** How far either mark reaches from its centre (units), and a margin for the lean. */
const float REACH = 1.0;

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

// Both marks where the physics put them, each with its own gentle idle bob and turn on top.
float scene(vec3 p) {
  vec3 qq = p - vec3(q.xy + vec2(0.0, 0.04 * sin(TAU * t)), 0.0);
  qq.xz *= rot(q.z + 0.35 * sin(TAU * t));
  qq.xy *= rot(q.w + 0.08 * sin(TAU * t + 1.0));
  vec3 bb = p - vec3(b.xy + vec2(0.0, 0.04 * sin(TAU * t + 2.1)), 0.0);
  bb.xz *= rot(b.z + 0.35 * sin(TAU * t + 1.7));
  bb.xy *= rot(b.w - 0.12 + 0.08 * sin(TAU * t + 2.5));
  return min(question(qq), bang(bb));
}

vec3 normal(vec3 p) {
  vec2 e = vec2(0.0015, 0.0);
  return normalize(vec3(
    scene(p + e.xyy) - scene(p - e.xyy),
    scene(p + e.yxy) - scene(p - e.yxy),
    scene(p + e.yyx) - scene(p - e.yyx)));
}

void main() {
  // Orthographic: a pixel is a point in the marks' plane (units), seen straight on.
  vec2 xy = (gl_FragCoord.xy - rest.xy) / rest.z + vec2(-0.08, 0.062);
  float px = 1.0 / rest.z; // one pixel, in units
  // Far from both marks: nothing to march (most of the tile, most of the time).
  vec2 cq = q.xy + vec2(0.0, 0.09), cb = b.xy + vec2(0.0, 0.08);
  if (min(length(xy - cq), length(xy - cb)) > REACH + 4.0 * px) { gl_FragColor = vec4(0.0); return; }

  vec3 ro = vec3(xy, 3.0);
  vec3 rd = vec3(0.0, 0.0, -1.0);
  // camera lean: orbit the marks a little (about their resting middle)
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
  float alpha = hit ? 1.0 : 1.0 - smoothstep(0.0, 1.6 * px, mh);
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

/** Units across the shorter side of the resting box: the marks just fill it. */
const UNITS = 1.775;
/** Out of sight for at least this long counts as gone: the next arrival flies in again. */
const GONE_MS = 150;

@Component({
  selector: 'app-marks',
  template: `@if (!ready()) { <span class="fallback">?!</span> }`,
  styleUrl: './marks.css',
  host: { 'aria-hidden': 'true' },
})
export class Marks {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly rig = inject(CameraRig);
  private readonly screen = inject(Viewport);
  private readonly tile = inject(Tile, { optional: true });
  readonly ready = signal(false);
  /** Re-checks whether the marks can be seen (the tile opened or closed). */
  private check = () => {};

  constructor() {
    const destroyRef = inject(DestroyRef);

    // The tile opening or closing can show or hide the marks. Moving between open states
    // (peek ↔ active) leaves them in view: they just carry on, nothing restarts.
    effect(() => {
      this.tile?.open();
      untracked(() => this.check());
    });

    afterNextRender(() => {
      if (typeof IntersectionObserver === 'undefined' || typeof ResizeObserver === 'undefined') return;
      // The layer: on the tile, above its content (below the tile's own button), never in the way.
      const frameEl = this.host.closest<HTMLElement>('app-tile') ?? this.host.parentElement!;
      const canvas = document.createElement('canvas');
      canvas.setAttribute('aria-hidden', 'true');
      Object.assign(canvas.style, {
        position: 'absolute', left: '0', top: '0', zIndex: '1', pointerEvents: 'none',
        opacity: '0', transition: 'opacity 0.6s',
      });
      const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false, antialias: false });
      if (!gl) return;
      frameEl.appendChild(canvas);
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
      const uRes = u('res'), uRest = u('rest'), uQ = u('q'), uB = u('b'), uT = u('t'), uLean = u('lean');

      const style = getComputedStyle(document.documentElement);
      gl.uniform3fv(u('base'), rgb(style.getPropertyValue('--color-mango').trim() || '#ffa630'));
      gl.uniform3fv(u('bg'), rgb(getComputedStyle(frameEl).backgroundColor));

      const calm = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
      const magnets = new Magnets(calm);
      const PERIOD = 7000;
      let elapsed = 0, last = 0, frame = 0, visible = false, shown = false, goneAt = -Infinity;
      /** The tile in units, relative to the marks' resting middle: where "outside" begins. */
      let bounds = { left: -3, right: 3, top: 3, bottom: -3 };
      let dpr = 1, rest = { x: 0, y: 0, unit: 100 };
      /** The tile's size (CSS px), which the canvas covers. */
      let size = { w: 1, h: 1 };
      const rem = parseFloat(style.fontSize) || 16;

      /**
       * Where they rest, in the tile: the marks' own box, reaching up to the title (a third of
       * a letter into it at most, see titleCeiling), on desktop at most 26rem wide. Measured
       * every frame: the page may be sliding.
       */
      const place = () => {
        const f = frameEl.getBoundingClientRect();
        const h = this.host.getBoundingClientRect();
        const ceiling = titleCeiling(this.host.parentElement!);
        const up = ceiling === null ? 0 : Math.max(0, this.host.offsetTop - ceiling);
        const boxW = this.screen.desktop() ? Math.min(h.width, 26 * rem) : h.width;
        const boxH = h.height + up;
        rest = { x: h.left - f.left + boxW / 2, y: h.top - f.top - up + boxH / 2, unit: Math.min(boxW, boxH) / UNITS };
        bounds = {
          left: -rest.x / rest.unit,
          right: (size.w - rest.x) / rest.unit,
          top: rest.y / rest.unit,
          bottom: -(size.h - rest.y) / rest.unit,
        };
      };

      const clear = () => {
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
      };
      const draw = (now: number) => {
        place();
        const lean = this.rig.offset(now, calm);
        const { q, b } = magnets;
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.uniform2f(uRes, canvas.width, canvas.height);
        gl.uniform3f(uRest, rest.x * dpr, (canvas.height / dpr - rest.y) * dpr, rest.unit * dpr);
        gl.uniform4f(uQ, q.x, q.y, q.spin, q.roll);
        gl.uniform4f(uB, b.x, b.y, b.spin, b.roll);
        gl.uniform1f(uT, (elapsed % PERIOD) / PERIOD);
        gl.uniform2f(uLean, lean.yaw, lean.pitch);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      };
      const loop = (now: number) => {
        const dt = Math.min(50, Math.max(0, now - last));
        last = now;
        elapsed += dt * (calm ? 0.35 : 1);
        magnets.step(dt / 1000);
        draw(now);
        frame = shown ? requestAnimationFrame(loop) : 0;
      };

      // In sight = in view and in an open tile. Out of sight long enough = gone: the next
      // arrival flies in again. Only then; a tile resizing around them changes nothing.
      this.check = () => {
        const now = performance.now();
        const next = visible && (this.tile?.open() ?? true) && !document.hidden;
        if (next === shown) return;
        shown = next;
        if (!next) {
          goneAt = now;
          // Out of sight: leave nothing behind on the tile.
          cancelAnimationFrame(frame);
          frame = 0;
          clear();
          return;
        }
        if (now - goneAt > GONE_MS) {
          place();
          magnets.arrive(bounds);
        }
        if (!frame) {
          last = now;
          frame = requestAnimationFrame(loop);
        }
      };

      const layout = () => {
        size = { w: frameEl.clientWidth, h: frameEl.clientHeight };
        canvas.style.width = `${size.w}px`;
        canvas.style.height = `${size.h}px`;
        // Ray marching is per pixel, but only near the marks: a generous budget stays smooth.
        const budget = phone ? 900_000 : 2_200_000;
        dpr = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(budget / Math.max(1, size.w * size.h)));
        canvas.width = Math.max(1, Math.round(size.w * dpr));
        canvas.height = Math.max(1, Math.round(size.h * dpr));
        if (shown) draw(performance.now());
        else clear();
      };
      const ro = new ResizeObserver(layout);
      ro.observe(frameEl);
      const io = new IntersectionObserver(([e]) => {
        visible = e.isIntersecting;
        this.check();
      });
      io.observe(this.host);
      const onVisibility = () => this.check();
      document.addEventListener('visibilitychange', onVisibility);
      this.ready.set(true);
      canvas.style.opacity = '1';

      destroyRef.onDestroy(() => {
        cancelAnimationFrame(frame);
        canvas.remove();
        ro.disconnect();
        io.disconnect();
        document.removeEventListener('visibilitychange', onVisibility);
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
