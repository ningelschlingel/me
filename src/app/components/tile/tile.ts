import { Component, DestroyRef, ElementRef, afterNextRender, afterRenderEffect, computed, effect, inject, input, linkedSignal, output, signal } from '@angular/core';
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
    '[attr.data-from]': 'from()',
    '[style.flex-grow]': 'grow()',
    '[attr.inert]': "state() === 'hidden' ? '' : null",
    '[attr.data-pinned]': "pinned() ? '' : null",
    '(pointerdown)': 'onPointerDown($event)',
    '(click)': 'onClick($event)',
    '(mouseenter)': 'hovered.emit(true)',
    '(mouseleave)': 'hovered.emit(false)',
  },
})
export class Tile {
  readonly state = input.required<TileState>();
  /**
   * The state this tile came from. Phones: stepping from one open tile to the next (active to
   * hidden, hidden to active) swaps the headers without lifting the title; tile.css.
   */
  readonly from = linkedSignal<TileState, TileState | null>({
    source: this.state,
    computation: (_state, prev) => prev?.source ?? null,
  });
  readonly tileTitle = input.required<string>();
  readonly tileSubtitle = input('');
  /** This tile's part of the deck once the current transition has finished (0…1). */
  readonly share = input(1);
  /** flex-grow, decided by the deck (layout.ts). */
  readonly grow = input(1);
  /**
   * Counts the times this tile was entered from another one (see Home.visits). Visuals play
   * their entrance once per visit: paging around or opening the peeking tile never replays it.
   */
  readonly visit = input(0);
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
  /** The last touch, to tell a tap from a drag, a hold or a pinch. */
  private touch: { x: number; y: number; t: number; fingers: number } | null = null;
  private tapped = false;
  private touchedAt = -Infinity;
  /** When a page in this tile last scrolled (scroll events don't bubble: see the capture listener). */
  scrolled = -Infinity;
  /** When this tile last opened. */
  private openedAt = -Infinity;

  readonly open = computed(() => this.state() === 'peek' || this.state() === 'active');

  /** The number of every page in this tile's pager (its data-num), for the dial. Set by the pager. */
  readonly nums = signal<string[]>([]);

  /**
   * Phones: the menu opening over an open tile takes half the screen. The tile still gives it
   * the room, but its content keeps the height it had (--body-h): nothing reflows or shrinks,
   * the menu simply covers the lower half until it closes again. It stays pinned until the menu
   * has slid all the way back, so nothing snaps small and grows again on the way out.
   */
  readonly pinned = computed(() => this.state() === 'active' && !this.viewport.desktop() && this.viewport.navCovering());

  /** The tile's final width: rows always span the screen, columns get their share of the deck. */
  readonly targetWidth = computed(() =>
    this.viewport.desktop() ? this.viewport.deckWidth() * this.share() : this.viewport.width(),
  );

  /** Width the content will have when the tile settles, known before it animates there. */
  contentWidth(): number {
    return this.targetWidth() - this.frame();
  }

  constructor() {
    // Touches are only watched, never cancelled: passive, so the browser never waits for this
    // script before it scrolls a page.
    const touchStart = (e: TouchEvent) => this.onTouchStart(e);
    const touchEnd = (e: TouchEvent) => this.onTouchEnd(e);
    this.host.addEventListener('touchstart', touchStart, { passive: true });
    this.host.addEventListener('touchend', touchEnd, { passive: true });
    this.destroyRef.onDestroy(() => {
      this.host.removeEventListener('touchstart', touchStart);
      this.host.removeEventListener('touchend', touchEnd);
    });

    // Tell the deck how much room a tile spends around its content, so columns come out exact.
    afterRenderEffect(() => {
      this.viewport.width();
      this.viewport.desktop();
      const frame = this.frame();
      if (frame > 0 && Math.abs(frame - this.viewport.frame()) > 0.5) this.viewport.frame.set(frame);
    });

    effect(() => {
      if (this.state() === 'active') this.openedAt = performance.now();
    });

    // The body's height while nothing covers it, for pinning (see `pinned`).
    afterNextRender(() => {
      // Pages scroll inside the tile; scroll events don't bubble, so listen on the way down.
      const onScroll = (e: Event) => (this.scrolled = e.timeStamp);
      this.host.addEventListener('scroll', onScroll, { capture: true, passive: true });
      this.destroyRef.onDestroy(() => this.host.removeEventListener('scroll', onScroll, { capture: true }));

      const body = this.host.querySelector<HTMLElement>(':scope > .body');
      if (!body || typeof ResizeObserver === 'undefined') return;
      // Set on the body itself and registered as not inherited (styles.css): a change every frame
      // while the tile moves then restyles the body alone, not everything inside it.
      let bodyH = '';
      const ro = new ResizeObserver(() => {
        if (this.pinned()) return;
        const h = `${body.offsetHeight}px`;
        if (h !== bodyH) body.style.setProperty('--body-h', (bodyH = h));
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
   * progress rule follow the finger without a change detection run per frame. Set on the header
   * (where both live), not the tile: an inherited property changed on the tile would restyle every
   * page in it, every frame.
   */
  setProgress(progress: number, pages: number) {
    const value = progress.toFixed(4);
    const count = String(Math.max(1, pages));
    if (value === this.progress.value && count === this.progress.pages) return;
    this.progress = { value, pages: count };
    this.head ??= this.host.querySelector<HTMLElement>(':scope > .head');
    this.head?.style.setProperty('--progress', value);
    this.head?.style.setProperty('--pages', count);
  }
  private progress = { value: '', pages: '' };
  private head: HTMLElement | null = null;

  toggle() {
    this.state() === 'active' ? this.dismiss.emit() : this.activate.emit();
  }

  onPointerDown(event: PointerEvent) {
    this.down = { x: event.clientX, y: event.clientY };
  }

  onTouchStart(event: TouchEvent) {
    const t = event.touches[0];
    // A touch that stops a page's momentum scroll is a catch, not a tap.
    this.touch = event.timeStamp - this.scrolled < 150 ? null : { x: t.clientX, y: t.clientY, t: event.timeStamp, fingers: event.touches.length };
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
    const touch = this.touch;
    const end = event.changedTouches[0];
    this.tapped =
      !!touch && touch.fingers === 1 && event.timeStamp - touch.t < 500 && Math.hypot(end.clientX - touch.x, end.clientY - touch.y) < 10;
    this.touch = null;
    this.touchedAt = performance.now();
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
   * A click anywhere opens a closed tile, and anywhere that isn't a control closes an open one,
   * unless it was really a drag, a text selection, or (phones) not a clean tap. On phones the
   * first tap only removes the top layer: with the menu open, it closes the menu.
   */
  onClick(event: MouseEvent) {
    const target = event.target as Element;
    if (target.closest(INTERACTIVE)) return;
    const phone = !this.viewport.desktop();
    if (phone && this.viewport.menu()) return this.viewport.menu.set(false);
    if (this.state() !== 'active') return this.activate.emit();
    if (target.closest('.head')) return this.dismiss.emit();
    if (getSelection?.()?.toString()) return;

    if (phone && performance.now() - this.touchedAt < 800) {
      // Taps only (no drag, hold or pinch), and not the second half of the tap that opened it.
      const tapped = this.tapped;
      this.tapped = false;
      if (tapped && performance.now() - this.openedAt > 600) this.dismiss.emit();
      return;
    }
    const moved = this.down && Math.hypot(event.clientX - this.down.x, event.clientY - this.down.y) > 6;
    if (!moved) this.dismiss.emit();
  }
}
