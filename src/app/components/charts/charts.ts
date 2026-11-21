import { Component, ElementRef, inject, viewChild } from '@angular/core';
import { Viewport } from '../../layout';
import { live, stageRoom } from '../sketch/live';
import { background, parse, titleCeiling } from '../sketch/stage';
import { ChartsPainter } from './painter';

/** Two stock charts, running forever behind the card's text (see painter.ts). */
@Component({
  selector: 'app-charts',
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
export class Charts {
  private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly screen = inject(Viewport);
  private painter?: ChartsPainter;

  constructor() {
    live(this.host, {
      init: () => {
        const ctx = this.canvasRef().nativeElement.getContext('2d');
        const grid = document.createElement('canvas').getContext('2d');
        const mask = document.createElement('canvas').getContext('2d');
        if (!ctx || !grid || !mask) return false;
        this.painter = new ChartsPainter(ctx, grid, mask);
        return true;
      },
      resize: () => {
        const width = this.host.clientWidth;
        const height = this.host.clientHeight;
        const card = this.host.parentElement!;
        const root = getComputedStyle(document.documentElement);
        this.painter?.resize(
          width,
          height,
          stageRoom(card, height, this.screen.desktop(), titleCeiling(card)),
          {
            ink: parse(getComputedStyle(this.host).color).join(', '),
            paper: parse(background(card)).join(', '),
            font: root.getPropertyValue('--mono').trim() || 'ui-monospace, monospace',
          },
          Math.min(2, window.devicePixelRatio || 1),
        );
      },
      draw: (_now, elapsed) => this.painter?.draw(elapsed),
      restart: () => this.painter?.restart(),
    });
  }
}
