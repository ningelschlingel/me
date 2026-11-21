import { Component, DestroyRef, ElementRef, afterNextRender, inject, signal } from '@angular/core';
import { Viewport } from '../../layout';
import { edge } from '../pager/pager';
import { INTERACTIVE } from '../tile/tile';

/** Time constant of the follow curve: higher feels heavier. */
const LAG_MS = 85;
/** A badge that sits still for this long gets out of the way while you read. */
const IDLE_MS = 1400;
const OFFSET = 18;

/**
 * Mouse only: a small round badge trails the pointer and says what a click does here. It is the
 * one pointer control on desktop: "+" over a closed column, "×" over the open one, and in
 * the open one's page-turning edges it stretches into a pill with an arrow ("←" / "→"),
 * like the current page's dot. "↗" over a project that opens; it steps aside over every
 * other control.
 */
@Component({
  selector: 'app-cursor',
  template: `
    <!-- All three glyphs are always there; the state morphs between them (cursor.css). -->
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="square">
      <path class="cross" d="M4 12h16M12 4v16" />
      <path class="turn" d="M4 12h15M13 6l6 6-6 6" />
      <path class="out" d="M7 17 17 7M9 7h8v8" />
    </svg>
  `,
  styleUrl: './cursor.css',
  host: {
    'aria-hidden': 'true',
    '[class.on]': 'on()',
    '[class.close]': 'closing() && !linking()',
    '[class.turn]': '!!turn() && !linking()',
    '[class.back]': 'turn() < 0',
    '[class.link]': 'linking()',
    '[class.down]': 'down()',
  },
})
export class Cursor {
  readonly on = signal(false);
  readonly closing = signal(false);
  readonly linking = signal(false);
  /** In a page-turning edge of the open tile: which way a click turns (-1, 1), else 0. */
  readonly turn = signal<-1 | 0 | 1>(0);
  readonly down = signal(false);

  constructor() {
    if (!inject(Viewport).fine) return;
    const el = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    const destroyRef = inject(DestroyRef);

    afterNextRender(() => {
      let x = 0, y = 0, tx = 0, ty = 0, px = 0, last = 0, frame = 0;
      let target: Element | null = null;
      let idle: ReturnType<typeof setTimeout> | undefined;

      // Frame-rate independent exponential smoothing.
      const loop = (now: number) => {
        const k = 1 - Math.exp(-Math.min(64, now - last) / LAG_MS);
        last = now;
        x += (tx - x) * k;
        y += (ty - y) * k;
        el.style.translate = `${x}px ${y}px`;
        frame = Math.abs(tx - x) + Math.abs(ty - y) > 0.3 ? requestAnimationFrame(loop) : 0;
      };

      const update = () => {
        const tile = target?.closest<HTMLElement>('app-tile');
        const link = !!target?.closest('[data-cursor="link"]');
        const show = !!tile && (link || !target!.closest(INTERACTIVE)) && tile.dataset['state'] !== 'hidden';
        this.linking.set(link);
        this.turn.set(show && tile!.dataset['state'] === 'active' ? turnAt(target!, px) : 0);
        if (show) {
          const style = getComputedStyle(tile);
          el.style.setProperty('--fg', style.color);
          el.style.setProperty('--bg', style.backgroundColor);
          this.closing.set(tile.dataset['state'] === 'active');
          if (!this.on()) { x = tx; y = ty; el.style.translate = `${x}px ${y}px`; } // appear in place, don't fly in
        }
        this.on.set(show);
      };

      const move = (event: PointerEvent) => {
        if (event.pointerType !== 'mouse') return;
        px = event.clientX;
        tx = event.clientX + OFFSET;
        ty = event.clientY + OFFSET;
        target = event.target as Element;
        update();
        clearTimeout(idle);
        idle = setTimeout(() => this.on.set(false), IDLE_MS);
        if (!frame) { last = performance.now(); frame = requestAnimationFrame(loop); }
      };
      const press = (on: boolean) => () => this.down.set(on);
      // A click flips the tile's state; show the new meaning right away.
      const click = () => setTimeout(update, 0);
      const leave = () => this.on.set(false);

      document.addEventListener('pointermove', move, { passive: true });
      document.addEventListener('pointerdown', press(true));
      document.addEventListener('pointerup', press(false));
      document.addEventListener('click', click);
      document.addEventListener('keydown', click); // Esc closes a tile: show the new meaning
      document.documentElement.addEventListener('mouseleave', leave);
      destroyRef.onDestroy(() => {
        cancelAnimationFrame(frame);
        clearTimeout(idle);
        document.removeEventListener('pointermove', move);
        document.removeEventListener('click', click);
        document.removeEventListener('keydown', click);
        document.documentElement.removeEventListener('mouseleave', leave);
      });
    });
  }
}

/** The way a click at x turns the pages under `target` (same strips as the pager), or 0. */
function turnAt(target: Element, x: number): -1 | 0 | 1 {
  const vp = target.closest<HTMLElement>('.pager-viewport');
  if (!vp) return 0;
  const dir = edge(vp.getBoundingClientRect(), x);
  return (dir < 0 && vp.hasAttribute('data-prev')) || (dir > 0 && vp.hasAttribute('data-next')) ? dir : 0;
}
