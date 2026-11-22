import { Component, ElementRef, inject, input, viewChild } from '@angular/core';
import { Viewport } from '../../layout';
import { Tone, V3, newell, rotX, rotY } from './math';
import { SCENES, SketchKind } from './registry';
import { live, stageRoom } from './live';
import { CameraRig } from './rig';
import { background, fit, parse, titleCeiling } from './stage';

const DISTANCE = 4.2;
/** Depth levels: each gets one width and one colour mix. */
const LEVELS = 10;

type Layer = 'back' | 'front';

/** One thing to paint: a line piece or a filled polygon, at a depth. */
interface Item {
  layer: Layer;
  depth: number;
  poly: boolean;
  xy: number[];
  tone: Tone;
  level: number;
  width: number;
}

/**
 * A 3D line sketch living inside its card. Two canvases share the card with the content:
 * the back one sits below the text, the front one above it. Every piece is projected and
 * goes to the back or the front by its depth, so far-away parts pass behind the title and
 * close ones in front of it. Both canvases cover exactly the card, so nothing leaves it.
 *
 * Plain canvas 2D and a few lines of projection math: no 3D engine needed for strokes.
 */
@Component({
  selector: 'app-sketch',
  template: `
    <canvas #back class="back"></canvas>
    <canvas #front class="front"></canvas>
  `,
  styleUrl: './sketch.css',
  host: { 'aria-hidden': 'true' },
})
export class Sketch {
  readonly kind = input.required<SketchKind>();

  private readonly backRef = viewChild.required<ElementRef<HTMLCanvasElement>>('back');
  private readonly frontRef = viewChild.required<ElementRef<HTMLCanvasElement>>('front');
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly rig = inject(CameraRig);
  private readonly screen = inject(Viewport);

  private width = 0;
  private height = 0;
  private dpr = 1;
  /** Projection centre and scale (CSS px), placed in the card's free space. 0 = no room: draw nothing. */
  private cx = 0;
  private cy = 0;
  private unit = 0;
  private colors = {} as Record<Tone, string[]>;
  private wash = '';

  private ctx!: Record<Layer, CanvasRenderingContext2D>;
  private elapsed = 0;

  constructor() {
    live(this.host, {
      init: () => {
        const back = this.backRef().nativeElement.getContext('2d');
        const front = this.frontRef().nativeElement.getContext('2d');
        if (!back || !front) return false;
        this.ctx = { back, front };
        return true;
      },
      resize: () => this.resize(),
      draw: (now, elapsed, calm) => {
        this.elapsed = elapsed;
        this.draw(this.ctx, now, calm);
      },
    });
  }

  /** Canvas size, colours and where in the card the scene sits. */
  private resize() {
    const host = this.host;
    this.width = host.clientWidth;
    this.height = host.clientHeight;
    // Lines stay crisp at 1.5×; phones save a lot of pixels to clear and composite every frame.
    this.dpr = Math.min(this.screen.fine ? 2 : 1.5, window.devicePixelRatio || 1);
    for (const c of [this.backRef().nativeElement, this.frontRef().nativeElement]) fit(c, this.width, this.height, this.dpr);

    // The stage: a real element in the card that holds the free space (see .stage in styles.css).
    // The model may reach beyond it, up to the title: the box it fills is bigger than the room
    // it takes in the layout. It may overlap the title by a third of a letter at most.
    const card = host.parentElement!;
    const desktop = this.screen.desktop();
    const { top, room } = stageRoom(card, this.height, desktop, titleCeiling(card));

    // Every scene has its own spot (left, centre, right) so the slides don't all look alike.
    // Phones keep every model on the right half, clear of the left-aligned type.
    const { place } = SCENES[this.kind()];
    const side = place?.x ?? 0;
    const span = (desktop ? 0.82 : 0.8) * (place?.size ?? 1); // share of the width it may use
    const shift = desktop ? side * this.width * 0.13 : this.width * (0.2 + 0.03 * side);
    const box = extent(this.kind());
    this.unit =
      room < 60
        ? 0
        : Math.min((this.width * span) / (box.maxX - box.minX), (room * 0.98) / (box.maxY - box.minY), this.width * 0.5);
    this.cx = this.width / 2 + shift - ((box.minX + box.maxX) / 2) * this.unit;
    // Keep it inside the card on the right.
    this.cx = Math.min(this.cx, this.width - box.maxX * this.unit - 4);
    // A touch below the middle of its space: the title above gets air, the text below less.
    this.cy = top + room * (desktop ? 0.5 : 0.54) - ((box.minY + box.maxY) / 2) * this.unit;

    // The card's colours never change: read once.
    if (this.wash) return;
    const style = getComputedStyle(host);
    const root = getComputedStyle(document.documentElement);
    const token = (name: string, fallback: string) => parse(root.getPropertyValue(name).trim() || fallback);
    const bg = parse(background(host));
    const source: Record<Tone, number[]> = {
      ink: parse(style.color),
      accent: token('--color-signal', '#ff5b3a'),
      cobalt: token('--color-cobalt', '#2b44d8'),
      mango: token('--color-mango', '#ffa630'),
    };
    const mix = (c: number[], a: number) => `rgb(${c.map((v, i) => Math.round(bg[i] + (v - bg[i]) * a)).join(',')})`;
    const levels = Array.from({ length: LEVELS }, (_, l) => 0.3 + (0.7 * l) / (LEVELS - 1));
    for (const tone of Object.keys(source) as Tone[]) this.colors[tone] = levels.map((a) => mix(source[tone], a));
    this.wash = mix(source.mango, 0.14);
  }

  private draw(ctx: Record<Layer, CanvasRenderingContext2D>, now: number, calm: boolean) {
    if (!this.width || !this.height) return;
    for (const c of Object.values(ctx)) {
      // The whole canvas: it may reach past the card (see fit), and a card may grow into that.
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.clearRect(0, 0, c.canvas.width, c.canvas.height);
      c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    }
    if (!this.unit) return;

    const { scene, period, yaw, pitch, focus, spin } = SCENES[this.kind()];
    const lean = this.rig.offset(now, calm);
    const t = (this.elapsed % period) / period;
    const view = { yaw: yaw + lean.yaw + (spin ? spin(t) : 0), pitch: pitch + lean.pitch };
    const base = this.unit * 0.016;

    const items: Item[] = [];
    const lenses: number[][] = [];
    const tinted: Item[] = [];

    const phase = t;
    this.setCamera(view, focus ? focus(phase) : 0);
    for (const stroke of scene(phase)) {
      const tone: Tone = stroke.tone ?? (stroke.accent ? 'accent' : 'ink');
      const weight = stroke.weight ?? 1;
      const ink = stroke.ink ?? 1;
      if (ink <= 0.02) continue; // fully faded: gone, not a ghost
      // Printed on a surface that faces away: hidden.
      if (stroke.normal && this.view(stroke.normal)[2] <= 0.03) continue;
      const vpts = stroke.pts.map((p) => this.view(p));
      // Faces turned away are dropped before any further work (about half of a solid model).
      let level0 = -1;
      if (stroke.lit && stroke.fill) {
        const n = newell(vpts);
        const len = Math.hypot(n[0], n[1], n[2]) || 1;
        if (n[2] / len <= 0.02) continue;
        const light = Math.max(0, (n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]) / len);
        level0 = lvl(stroke.lit[1] + (stroke.lit[0] - stroke.lit[1]) * light);
      }
      const pts = vpts.map((v) => this.projectView(v));

      if (pts.some((p) => p.behind) && (stroke.fill || stroke.lens)) continue;
      if (stroke.fill || stroke.lens) {
        const xy: number[] = [];
        let depth = 0, near = 0;
        for (const p of pts) { xy.push(p.x, p.y); depth += p.z; near += p.near; }
        depth = stroke.under ? -Infinity : depth / pts.length + (stroke.lift ?? 0);
        near /= pts.length;
        const level = level0 >= 0 ? level0 : lvl(near * ink);
        if (stroke.lens) lenses.push(xy);
        if (stroke.fill)
          items.push({ layer: depth > 0 ? 'front' : 'back', depth, poly: true, xy, tone: stroke.fill, level, width: 0 });
        if (stroke.bare) continue;
      }

      for (let i = 1; i < pts.length; i++) {
        if (pts[i - 1].behind || pts[i].behind) continue;
        for (const [p, q] of split(pts[i - 1], pts[i])) {
          const near = (p.near + q.near) / 2;
          const item: Item = {
            layer: !stroke.under && p.z + q.z > 0 ? 'front' : 'back',
            // Lines sit a hair in front of faces at the same depth, so outlines stay visible.
            depth: stroke.under ? -Infinity : (p.z + q.z) / 2 + (stroke.lit ? 0.03 : 0.002) + (stroke.lift ?? 0),
            poly: false,
            xy: [p.x, p.y, q.x, q.y],
            tone,
            level: lvl(near * ink),
            width: Math.max(0.75, base * weight * (0.55 + 0.8 * near)),
          };
          items.push(item);
          // Through a lens the world is vivid: full colour, a little bolder.
          if (stroke.tint) tinted.push({ ...item, tone: stroke.tint, level: LEVELS - 1, width: item.width * 1.4 });
        }
      }
    }

    // Painter's order: far first, so near lines and faces always cover far ones.
    items.sort((a, b) => (a.depth === b.depth ? 0 : a.depth < b.depth ? -1 : 1));
    for (const layer of ['back', 'front'] as Layer[]) {
      const c = ctx[layer];
      c.lineCap = 'round';
      c.lineJoin = 'round';
      this.paint(c, items.filter((it) => it.layer === layer));

      // Seen through the lenses: a soft glass wash and the world in colour.
      if (lenses.length && tinted.length) {
        c.save();
        c.beginPath();
        for (const xy of lenses) {
          c.moveTo(xy[0], xy[1]);
          for (let i = 2; i < xy.length; i += 2) c.lineTo(xy[i], xy[i + 1]);
          c.closePath();
        }
        c.clip();
        if (layer === 'back') {
          c.fillStyle = this.wash;
          c.fillRect(0, 0, this.width, this.height);
        }
        this.paint(c, tinted.filter((it) => it.layer === layer));
        c.restore();
      }
    }
  }

  /** Draws items in order, merging runs of identical line style into one path. */
  private paint(c: CanvasRenderingContext2D, items: Item[]) {
    let key = '';
    let open = false;
    const flush = () => {
      if (open) c.stroke();
      open = false;
    };
    for (const it of items) {
      const colour = this.colors[it.tone][it.level];
      if (it.poly) {
        flush();
        key = '';
        c.fillStyle = colour;
        c.beginPath();
        c.moveTo(it.xy[0], it.xy[1]);
        for (let i = 2; i < it.xy.length; i += 2) c.lineTo(it.xy[i], it.xy[i + 1]);
        c.closePath();
        c.fill();
        continue;
      }
      const k = `${colour}|${it.width.toFixed(1)}`;
      if (k !== key) {
        flush();
        key = k;
        c.strokeStyle = colour;
        c.lineWidth = it.width;
        c.beginPath();
        open = true;
      }
      c.moveTo(it.xy[0], it.xy[1]);
      c.lineTo(it.xy[2], it.xy[3]);
    }
    flush();
  }

  /** Per-frame camera: sines and cosines once, not per point. */
  private cam = { cy: 1, sy: 0, cp: 1, sp: 0, focus: 0 };

  private setCamera(view: { yaw: number; pitch: number }, focus: number) {
    const c = this.cam;
    c.cy = Math.cos(view.yaw); c.sy = Math.sin(view.yaw);
    c.cp = Math.cos(view.pitch); c.sp = Math.sin(view.pitch);
    c.focus = focus;
  }

  /** World → view space (turn, then tilt): the same as rotX(rotY(p)), without the temporary arrays. */
  private view(p: V3, _view?: unknown): V3 {
    const { cy, sy, cp, sp } = this.cam;
    const x = p[0] * cy + p[2] * sy;
    const z = -p[0] * sy + p[2] * cy;
    return [x, p[1] * cp - z * sp, p[1] * sp + z * cp];
  }

  private projectView(v: V3): Projected {
    const gap = DISTANCE - v[2];
    const s = DISTANCE / Math.max(gap, 0.05);
    return {
      behind: gap < 0.35, // at or behind the lens: not drawn
      x: this.cx + v[0] * s * this.unit,
      y: this.cy - v[1] * s * this.unit,
      z: v[2],
      // 0 far … 1 near (z of about ±1.2 around the camera's focus covers every scene)
      near: Math.max(0, Math.min(1, (v[2] - this.cam.focus + 1.2) / 2.4)),
    };
  }
}

interface Projected {
  behind: boolean;
  x: number;
  y: number;
  z: number;
  near: number;
}

/** Light from the upper left, a little in front (view space). */
const LIGHT = (() => {
  const v = [-0.55, 0.7, 0.45];
  const l = Math.hypot(...v);
  return v.map((x) => x / l);
})();

const lvl = (a: number) => Math.max(0, Math.min(LEVELS - 1, Math.round(a * (LEVELS - 1))));

/** A segment, split exactly where it passes through the card plane (z = 0). */
function split(a: Projected, b: Projected): [Projected, Projected][] {
  if (a.z > 0 === b.z > 0) return [[a, b]];
  const k = a.z / (a.z - b.z);
  const m = { behind: false, x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, near: a.near + (b.near - a.near) * k };
  return [
    [a, { ...m, z: a.z > 0 ? 1e-6 : -1e-6 }],
    [{ ...m, z: b.z > 0 ? 1e-6 : -1e-6 }, b],
  ];
}

/** Projected bounding box of a scene over its whole loop, at unit scale (screen y grows downwards). */
const extents = new Map<SketchKind, { minX: number; maxX: number; minY: number; maxY: number }>();
function extent(kind: SketchKind) {
  let box = extents.get(kind);
  if (box) return box;
  const { scene, yaw, pitch, frame, spin } = SCENES[kind];
  if (frame) return frame;
  box = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
  for (let i = 0; i < 120; i++)
    for (const stroke of scene(i / 120)) {
      if (stroke.loose || (stroke.ink ?? 1) <= 0.02) continue;
      for (const p of stroke.pts) {
        const [x, y, z] = rotX(rotY(p, yaw + (spin ? spin(i / 120) : 0)), pitch);
        const s = DISTANCE / (DISTANCE - z);
        box.minX = Math.min(box.minX, x * s);
        box.maxX = Math.max(box.maxX, x * s);
        box.minY = Math.min(box.minY, -y * s);
        box.maxY = Math.max(box.maxY, -y * s);
      }
    }
  extents.set(kind, box);
  return box;
}
