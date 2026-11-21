import { Component, ElementRef, inject, input, viewChild } from '@angular/core';
import { Viewport } from '../../layout';
import { smooth } from '../drafting/drafting';
import { live, stageRoom } from '../sketch/live';
import { CameraRig } from '../sketch/rig';
import { background, parse, titleCeiling } from '../sketch/stage';
import { BB, EXTENT, Pen, drawBike } from './drawing';

const TAU = Math.PI * 2;

/** The drawing draws itself in over this long (seconds), the first time it is seen in a visit. */
const BUILD_S = 5;
/** Each group of measures stays this long (seconds), then hands over to the next in `FADE_S`. */
const HOLD_S = 5.5;
const FADE_S = 0.9;
/** After the build the wheels and cranks spin up (time constant, seconds) to an easy cadence. */
const SPIN_UP_S = 2;
const CADENCE = TAU * 0.16; // rad/s at the cranks: slow, steady
const GEAR = 52 / 17;

/** How much each group of measures shows at loop time `t` (seconds): fit, handling, drive. */
export function groupsAt(t: number): [number, number, number] {
  const cycle = 3 * (HOLD_S + FADE_S);
  const at = ((t % cycle) + cycle) % cycle;
  const i = Math.floor(at / (HOLD_S + FADE_S));
  const into = at - i * (HOLD_S + FADE_S);
  const out: [number, number, number] = [0, 0, 0];
  if (into < HOLD_S) out[i] = 1;
  else {
    const k = smooth((into - HOLD_S) / FADE_S);
    out[i] = 1 - k;
    out[(i + 1) % 3] = k;
  }
  return out;
}

/**
 * "Off screen": my road bike, an Orbea Orca Aero, as a technical drawing (see drawing.ts), in
 * the same hand as the Pico and the modules. Guides shoot in, the wheels sweep round, the frame
 * grows along its tubes, and then the geometry is measured, a group at a time: fit (stack,
 * reach), handling (head angle, trail, wheelbase), drive (seat angle, chainstays, BB drop).
 * Meanwhile it rolls: wheels and cranks turning at an easy cadence. With a mouse it shifts a
 * hair towards the pointer.
 */
@Component({
  selector: 'app-bike',
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
export class Bike {
  /** Where it sits in its card: x from -1 (left) to 1 (right), size as a factor. */
  readonly place = input<{ x?: number; size?: number }>({ x: 0.1 });

  private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly screen = inject(Viewport);
  private readonly rig = inject(CameraRig);

  private ctx!: CanvasRenderingContext2D;
  private pen!: Pen;
  private dpr = 1;
  /** CSS px per mm (0 = no room, draw nothing), and where the BB sits. */
  private k = 0;
  private compact = false;
  private x = 0;
  private y = 0;

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

    // The same stage as every sketch; the drawing's extent fits into it, plus some px for text.
    const card = this.host.parentElement!;
    const desktop = this.screen.desktop();
    const { top, room } = stageRoom(card, height, desktop, titleCeiling(card));
    const { x: side = 0, size = 1 } = this.place();
    this.compact = width < 560;
    const pad = 16;
    const span = (desktop ? 0.92 : 0.98) * size;
    const w = EXTENT.x1 - EXTENT.x0, h = EXTENT.y1 - EXTENT.y0;
    const k = Math.min((width * span - 2 * pad) / w, (room - 2 * pad) / h);
    this.k = room < 100 || k < 0.12 ? 0 : k;
    const shift = desktop ? side * width * 0.13 : 0;
    const half = (w / 2) * this.k + pad;
    const mid = Math.max(half, Math.min(width - half, width / 2 + shift));
    this.x = mid - ((EXTENT.x0 + EXTENT.x1) / 2 - BB[0]) * this.k;
    this.y = top + room / 2 - ((EXTENT.y0 + EXTENT.y1) / 2 - BB[1]) * this.k;

    const root = getComputedStyle(document.documentElement);
    const token = (name: string, fallback: string) => parse(root.getPropertyValue(name).trim() || fallback).join(', ');
    this.pen = {
      ink: parse(getComputedStyle(this.host).color).join(', '),
      paper: parse(background(card)).join(', '),
      signal: token('--color-signal-deep', '#d43f1f'),
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
    // Spinning up from standstill: the turn is the integral of a speed that eases in.
    const rolled = calm ? loop : loop - SPIN_UP_S * (1 - Math.exp(-loop / SPIN_UP_S));
    const crank = CADENCE * rolled;
    // With a mouse, the drawing shifts a hair towards the pointer.
    const lean = this.rig.offset(now, calm);

    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    drawBike(
      c,
      {
        k: this.k,
        x: this.x + lean.yaw * 14,
        y: this.y - lean.pitch * 8,
        reveal,
        wheel: crank * GEAR,
        crank: crank - Math.PI / 3,
        groups: groupsAt(loop),
        compact: this.compact,
      },
      this.pen,
    );
  }
}
