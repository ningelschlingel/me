import { Component, ElementRef, inject, input, viewChild } from '@angular/core';
import { Viewport } from '../../layout';
import { Pen, smooth } from '../drafting/drafting';
import { live, stageRoom } from '../sketch/live';
import { CameraRig } from '../sketch/rig';
import { background, parse, titleCeiling } from '../sketch/stage';
import { ISO, drawModules, extent, offsetAt } from './drawing';

/** The drawing draws itself in over this long (seconds), the first time it is seen. */
const BUILD_S = 4;

/**
 * The loop after the build, as steps: rest for `hold` seconds, then move to the step's state
 * over `move`. One module lifts out and goes back, then the cluster takes four quarter turns,
 * resting in true isometric after each so the notes can be read. It ends where it starts.
 */
const STEPS = [
  { hold: 1.0, move: 1.4, turn: 0, lift: 1 }, // a module lifts out of its seat …
  { hold: 2.2, move: 1.2, turn: 0, lift: 0 }, // … and goes back
  { hold: 0.8, move: 1.8, turn: 1, lift: 0 },
  { hold: 3.2, move: 1.8, turn: 2, lift: 0 },
  { hold: 3.2, move: 1.8, turn: 3, lift: 0 },
  { hold: 3.2, move: 1.8, turn: 4, lift: 0 },
];
export const CYCLE_S = STEPS.reduce((sum, s) => sum + s.hold + s.move, 0);

/** The state at loop time `t` (seconds), eased; `turning` is 0 at rest … 1 mid-turn. */
export function poseAt(t: number) {
  let at = ((t % CYCLE_S) + CYCLE_S) % CYCLE_S;
  let from = { turn: 0, lift: 0 };
  for (const to of STEPS) {
    if (at < to.hold) return { turn: from.turn, lift: from.lift, turning: 0 };
    at -= to.hold;
    if (at < to.move) {
      const k = smooth(at / to.move);
      const turning = to.turn !== from.turn ? Math.sin(Math.PI * Math.min(1, at / to.move)) : 0;
      return { turn: from.turn + (to.turn - from.turn) * k, lift: from.lift + (to.lift - from.lift) * k, turning };
    }
    at -= to.move;
    from = to;
  }
  return { turn: 0, lift: 0, turning: 0 };
}

/**
 * "Systems that stay clean": eight modules as a technical drawing (see drawing.ts), in the
 * same hand as the Pico next to it. Guides shoot in, the cluster draws itself back to front,
 * then it lives: the gaps breathe and are measured as they do, a module lifts out and back,
 * and it turns a quarter at a time. With a mouse it leans a hair towards the pointer.
 */
@Component({
  selector: 'app-modules',
  template: `<canvas #canvas></canvas>`,
  styles: `
    :host {
      position: absolute;
      inset: 0;
      pointer-events: none;
      overflow: hidden;
      transition: opacity 0.3s;
    }
    :host(.settling) { opacity: 0; transition: none; }
    canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
  `,
  host: { 'aria-hidden': 'true' },
})
export class Modules {
  /** Where it sits in its card: x from -1 (left) to 1 (right), size as a factor. */
  readonly place = input<{ x?: number; size?: number }>({ x: 0.25 });

  private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly screen = inject(Viewport);
  private readonly rig = inject(CameraRig);

  private ctx!: CanvasRenderingContext2D;
  private pen!: Pen;
  private dpr = 1;
  /** px per mm (0 = no room, draw nothing), and where the cluster's centre sits. */
  private k = 0;
  private cx = 0;
  private cy = 0;
  private compact = false;

  constructor() {
    live(this.host, {
      init: () => {
        const ctx = this.canvasRef().nativeElement.getContext('2d');
        if (!ctx) return false;
        this.ctx = ctx;
        return true;
      },
      resize: () => this.resize(),
      draw: (now, elapsed, calm) => this.draw(now, elapsed / 1000, calm),
    });
  }

  private resize() {
    const width = this.host.clientWidth;
    const height = this.host.clientHeight;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    const canvas = this.canvasRef().nativeElement;
    canvas.width = Math.round(width * this.dpr);
    canvas.height = Math.round(height * this.dpr);

    // The same stage as every sketch; fit the drawing at its widest (mid-turn, module out),
    // plus some px for the notes.
    const card = this.host.parentElement!;
    const desktop = this.screen.desktop();
    const { top, room } = stageRoom(card, height, desktop, titleCeiling(card));
    const { x: side = 0, size = 1 } = this.place();
    this.compact = width < 460;
    const box = extent(this.compact);
    const pad = this.compact ? 22 : 34;
    const span = (desktop ? 0.8 : 0.9) * size;
    const k = Math.min((width * span - 2 * pad) / (box.x1 - box.x0), (room - 2 * pad) / (box.y1 - box.y0));
    this.k = room < 100 || k < 1.5 ? 0 : k;
    const shift = desktop ? side * width * 0.13 : width * 0.06;
    const half = ((box.x1 - box.x0) / 2) * this.k + pad;
    const mid = Math.max(half, Math.min(width - half, width / 2 + shift));
    this.cx = mid - ((box.x0 + box.x1) / 2) * this.k;
    this.cy = top + room / 2 - ((box.y0 + box.y1) / 2) * this.k;

    const root = getComputedStyle(document.documentElement);
    const token = (name: string, fallback: string) => parse(root.getPropertyValue(name).trim() || fallback).join(', ');
    this.pen = {
      ink: parse(getComputedStyle(this.host).color).join(', '),
      paper: parse(background(card)).join(', '),
      signal: token('--color-signal', '#ff5b3a'),
      font: root.getPropertyValue('--mono').trim() || 'ui-monospace, monospace',
    };
  }

  /** `s`: the local clock in seconds. */
  private draw(now: number, s: number, calm: boolean) {
    const c = this.ctx;
    if (!c) return;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, c.canvas.width, c.canvas.height);
    if (!this.k) return;

    const reveal = calm ? 1 : Math.min(1, s / BUILD_S);
    const loop = calm ? s : Math.max(0, s - BUILD_S);
    const pose = poseAt(loop);
    const lean = this.rig.offset(now, calm);

    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    drawModules(
      c,
      {
        k: this.k,
        cx: this.cx,
        cy: this.cy,
        yaw: ISO.yaw + (Math.PI / 2) * pose.turn + lean.yaw * 0.25,
        pitch: ISO.pitch + lean.pitch * 0.25,
        offset: offsetAt(loop, CYCLE_S),
        lift: pose.lift,
        reveal,
        // The notes step aside while it turns, and come back once it rests.
        notes: 1 - Math.min(1, pose.turning * 2.5),
        compact: this.compact,
      },
      this.pen,
    );
  }
}
