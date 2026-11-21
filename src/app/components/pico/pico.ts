import { Component, ElementRef, inject, input, viewChild } from '@angular/core';
import { Viewport } from '../../layout';
import { live, stageRoom } from '../sketch/live';
import { CameraRig } from '../sketch/rig';
import { background, parse, titleCeiling } from '../sketch/stage';
import { BOARD, EXTENT, Pen, drawPico, smooth } from './drawing';

const TAU = Math.PI * 2;

/** The drawing draws itself in over this long (seconds), the first time it is seen. */
const BUILD_S = 4.2;
/** The sheet's turn: the board stands at an angle, rising to the right. */
const ANGLE = -0.36;

/**
 * The loop after the build, as steps: rest where it is for `hold` seconds, then move to the
 * step's state over `move` seconds. Slow moves, long rests: something to look at, not to
 * watch. It ends where it starts (assembled, no side view), so it loops without a seam.
 */
const STEPS = [
  { hold: 4.5, move: 2.4, explode: 1, side: 0 }, // take it apart
  { hold: 3.8, move: 2.4, explode: 0, side: 0 }, // put it back together
  { hold: 2.5, move: 2.6, explode: 0, side: 1 }, // project the side view out
  { hold: 4.5, move: 1.8, explode: 0, side: 0 }, // and take it back in
];
export const CYCLE_S = STEPS.reduce((sum, s) => sum + s.hold + s.move, 0);

/** The state at loop time `t` (seconds), eased. */
export function poseAt(t: number) {
  let at = ((t % CYCLE_S) + CYCLE_S) % CYCLE_S;
  let from = STEPS[STEPS.length - 1];
  for (const to of STEPS) {
    if (at < to.hold) return { explode: from.explode, side: from.side };
    at -= to.hold;
    if (at < to.move) {
      const k = smooth(at / to.move);
      return { explode: from.explode + (to.explode - from.explode) * k, side: from.side + (to.side - from.side) * k };
    }
    at -= to.move;
    from = to;
  }
  return { explode: from.explode, side: from.side };
}

/**
 * The Raspberry Pi Pico as a technical drawing (see drawing.ts), a plan view on a sheet
 * turned at an angle: its guides shoot in, the rest draws itself in place, then it slowly
 * comes apart, goes back together and projects its side view. Its LED breathes, the hello
 * world of every microcontroller. With a mouse the sheet turns a hair towards the pointer.
 */
@Component({
  selector: 'app-pico',
  template: `<canvas #canvas></canvas>`,
  styles: `
    :host {
      position: absolute;
      inset: 0;
      pointer-events: none;
      overflow: hidden;
    }
    canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
  `,
  host: { 'aria-hidden': 'true' },
})
export class Pico {
  /** Where it sits in its card: x from -1 (left) to 1 (right), size as a factor. */
  readonly place = input<{ x?: number; size?: number }>({ x: -0.3 });

  private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly screen = inject(Viewport);
  private readonly rig = inject(CameraRig);

  private ctx!: CanvasRenderingContext2D;
  private pen!: Pen;
  private dpr = 1;
  /** CSS px per mm (0 = no room, draw nothing), and where the board's middle sits. */
  private k = 0;
  /** Small screens: no side view, no fine dimensions. */
  private compact = false;
  private cx = 0;
  private cy = 0;

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

    // The same stage as every sketch. Fit what the drawing may cover (its extent, turned
    // with the sheet) into it, plus some px for the notes' text.
    const card = this.host.parentElement!;
    const desktop = this.screen.desktop();
    const { top, room } = stageRoom(card, height, desktop, titleCeiling(card));
    const { x: side = 0, size = 1 } = this.place();
    this.compact = width < 560;
    const ext = this.compact ? EXTENT.compact : EXTENT.full;
    const ox = BOARD.l / 2, oy = BOARD.w / 2;
    const cos = Math.cos(ANGLE), sin = Math.sin(ANGLE);
    const turned = [[ext.x0, ext.y0], [ext.x1, ext.y0], [ext.x0, ext.y1], [ext.x1, ext.y1]].map(([x, y]) => [
      (x - ox) * cos - (y - oy) * sin,
      (x - ox) * sin + (y - oy) * cos,
    ]);
    const xs = turned.map((p) => p[0]), ys = turned.map((p) => p[1]);
    const box = { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
    const pad = 18;
    const span = (desktop ? 0.86 : 0.96) * size;
    const k = Math.min((width * span - 2 * pad) / (box.x1 - box.x0), (room - 2 * pad) / (box.y1 - box.y0));
    this.k = room < 100 || k < 2.5 ? 0 : k;
    // The board's middle, placed so the turned extent sits centred in the stage.
    const shift = desktop ? side * width * 0.13 : 0;
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
    const pose = poseAt(calm ? s : Math.max(0, s - BUILD_S));
    // With a mouse, the sheet turns a hair towards the pointer.
    const lean = this.rig.offset(now, calm);
    // The LED breathes once every 2.6 s: on softly, off softly.
    const led = reveal < 1 ? 0 : (0.5 - 0.5 * Math.cos((TAU * s) / 2.6)) ** 1.6;

    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    drawPico(
      c,
      {
        k: this.k,
        cx: this.cx,
        cy: this.cy,
        angle: ANGLE + lean.yaw * 0.06,
        reveal,
        explode: pose.explode,
        side: this.compact ? 0 : pose.side,
        led,
        compact: this.compact,
      },
      this.pen,
    );
  }
}
