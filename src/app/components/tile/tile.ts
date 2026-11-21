import { Component, DestroyRef, ElementRef, afterNextRender, afterRenderEffect, computed, inject, input, output, signal } from '@angular/core';
import { TileState, Viewport } from '../../layout';
import { canScroll } from '../../scroll';

export type { TileState };

/** Clicks on these never toggle the tile; they do their own thing. */
export const INTERACTIVE = 'a, button, input, select, textarea, label, [data-no-toggle]';

@Component({
  selector: 'app-tile',
  templateUrl: './tile.html',
  styleUrl: './tile.css',
  host: {
    '[attr.data-state]': 'state()',
    '[style.flex-grow]': 'grow()',
    '[attr.inert]': "state() === 'hidden' ? '' : null",
    '[attr.data-pinned]': "pinned() ? '' : null",
    '(pointerdown)': 'onPointerDown($event)',
    '(touchstart)': 'onTouchStart($event)',
    '(touchend)': 'onTouchEnd($event)',
    '(click)': 'onClick($event)',
    '(mouseenter)': 'hovered.emit(true)',
    '(mouseleave)': 'hovered.emit(false)',
  },
})
export class Tile {
  readonly state = input.required<TileState>();
  readonly tileTitle = input.required<string>();
  readonly tileSubtitle = input('');
  /** This tile's part of the deck once the current transition has finished (0…1). */
  readonly share = input(1);
  /** flex-grow, decided by the deck (layout.ts). */
  readonly grow = input(1);
  /** How this tile's open view splits into columns (desktop). */
  readonly spread = computed(() => this.viewport.spread());

  readonly activate = output<void>();
  readonly dismiss = output<void>();
  readonly hovered = output<boolean>();
  /** Phones: a vertical swipe on an open tile asks for the next (+1) or previous (-1) one. */
  readonly step = output<1 | -1>();

  private readonly viewport = inject(Viewport);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly destroyRef = inject(DestroyRef);
  private down: { x: number; y: number } | null = null;
  private swipe: { x: number; y: number; t: number; from: Element } | null = null;

  readonly open = computed(() => this.state() === 'peek' || this.state() === 'active');

  /** The number of every page in this tile's pager (its data-num), for the dial. Set by the pager. */
  readonly nums = signal<string[]>([]);

  /**
   * Phones: the menu opening over an open tile takes half the screen. The tile still gives it
   * the room, but its content keeps the height it had (--body-h): nothing reflows or shrinks,
   * the menu simply covers the lower half until it closes again.
   */
  readonly pinned = computed(() => this.state() === 'active' && !this.viewport.desktop() && this.viewport.navOpen());

  /** The tile's final width: rows always span the screen, columns get their share of the deck. */
  readonly targetWidth = computed(() =>
    this.viewport.desktop() ? this.viewport.deckWidth() * this.share() : this.viewport.width(),
  );

  /** Width the content will have when the tile settles, known before it animates there. */
  contentWidth(): number {
    return this.targetWidth() - this.frame();
  }

  constructor() {
    // Tell the deck how much room a tile spends around its content, so columns come out exact.
    afterRenderEffect(() => {
      this.viewport.width();
      this.viewport.desktop();
      const frame = this.frame();
      if (frame > 0 && Math.abs(frame - this.viewport.frame()) > 0.5) this.viewport.frame.set(frame);
    });

    // The body's height while nothing covers it, for pinning (see `pinned`).
    afterNextRender(() => {
      const body = this.host.querySelector<HTMLElement>(':scope > .body');
      if (!body || typeof ResizeObserver === 'undefined') return;
      const ro = new ResizeObserver(() => {
        if (!this.pinned()) this.host.style.setProperty('--body-h', `${body.offsetHeight}px`);
      });
      ro.observe(body);
      this.destroyRef.onDestroy(() => ro.disconnect());
    });
  }

  /** Everything around the content: the title column (desktop) and the body padding. */
  private frame(): number {
    const head = this.host.querySelector<HTMLElement>('.head');
    const body = this.host.querySelector<HTMLElement>('.body');
    if (!head || !body) return 0;
    const style = getComputedStyle(body);
    return (
      (this.viewport.desktop() ? head.offsetWidth : 0) +
      (parseFloat(style.paddingLeft) || 0) +
      (parseFloat(style.paddingRight) || 0)
    );
  }

  /**
   * Where the pager is, as a continuous page index (1.5 = halfway from the second page to the
   * third), every frame while it moves. Written straight to CSS (--progress), so the dial and the
   * progress rule follow the finger without a change detection run per frame.
   */
  setProgress(progress: number, pages: number) {
    this.host.style.setProperty('--progress', progress.toFixed(4));
    this.host.style.setProperty('--pages', String(Math.max(1, pages)));
  }

  toggle() {
    this.state() === 'active' ? this.dismiss.emit() : this.activate.emit();
  }

  onPointerDown(event: PointerEvent) {
    this.down = { x: event.clientX, y: event.clientY };
  }

  onTouchStart(event: TouchEvent) {
    const t = event.touches[0];
    this.swipe = this.state() === 'active' && !this.viewport.desktop() && event.touches.length === 1
      ? { x: t.clientX, y: t.clientY, t: event.timeStamp, from: event.target as Element }
      : null;
  }

  /**
   * A quick vertical flick on an open tile (phones) moves to the next or previous one. It only
   * counts when it is clearly vertical and the page under the finger has nothing left to scroll
   * that way, so reading and horizontal paging are never in its way.
   */
  onTouchEnd(event: TouchEvent) {
    const s = this.swipe;
    this.swipe = null;
    if (!s || this.state() !== 'active') return;
    const t = event.changedTouches[0];
    const dx = t.clientX - s.x, dy = t.clientY - s.y;
    if (Math.abs(dy) < 70 || Math.abs(dx) > Math.abs(dy) * 0.55 || event.timeStamp - s.t > 650) return;
    const dir = dy < 0 ? 1 : -1; // finger up: the page below, like any feed
    if (canScroll(s.from, this.host, dir)) return;
    this.step.emit(dir);
  }

  /**
   * A click anywhere opens a closed tile. An open one closes from its title bar, and on desktop
   * also from any spot that isn't a control, unless the click was a drag or a text selection.
   */
  onClick(event: MouseEvent) {
    const target = event.target as Element;
    if (target.closest(INTERACTIVE)) return;
    if (this.state() !== 'active') return this.activate.emit();
    if (target.closest('.head')) return this.dismiss.emit();
    // Phones: only the header line closes. A tap on a page is reading, or poking a sketch.
    if (!this.viewport.desktop()) return;

    const moved = this.down && Math.hypot(event.clientX - this.down.x, event.clientY - this.down.y) > 6;
    const selecting = !!getSelection?.()?.toString();
    if (!moved && !selecting) this.dismiss.emit();
  }
}
