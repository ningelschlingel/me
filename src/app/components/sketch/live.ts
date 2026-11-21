import { DestroyRef, afterNextRender, effect, inject, untracked } from '@angular/core';
import { Tile } from '../tile/tile';

/** With reduced motion, visuals keep living, just slowly. */
const CALM_SPEED = 0.35;
/** A tile's open/close transition (tile.css) plus a breath. */
const SETTLE_MS = 780;

/** What a canvas visual in a card provides; `live` runs it. */
export interface Painter {
  /** Once the view exists. Return false to stay inert (e.g. no 2D context). */
  init(): boolean;
  /** The card changed size: size the canvases and lay the visual out again. */
  resize(): void;
  /** One frame. `elapsed` is a local clock (ms) that only runs while the visual is live. */
  draw(now: number, elapsed: number, calm: boolean): void;
}

/**
 * Runs a canvas visual inside its card, the way every visual on the site behaves:
 * it draws only while in view, in an open tile and not hidden; it rests (faded out) while
 * its tile moves, then lays itself out once and fades back in; and it honours reduced motion.
 * The host gets the class `settling` while it rests (see sketch.css).
 *
 * Call from a constructor (it needs an injection context).
 */
export function live(host: HTMLElement, painter: Painter) {
  const destroyRef = inject(DestroyRef);
  const tile = inject(Tile, { optional: true });

  let visible = false;
  let settling = false;
  let settleTimer: ReturnType<typeof setTimeout> | undefined;
  let restart = () => {};
  let relayout = () => {};
  let elapsed = 0;
  let last = 0;
  let frame = 0;

  // A tile that opens or closes changes its pages' size for 0.7 s. Drawing into a canvas that
  // is being resized every frame is wasted work (and would stretch), so the visual rests until
  // the tile has landed, then lays itself out once and fades in.
  effect(() => {
    const state = tile?.state();
    untracked(() => {
      if (state === undefined) return;
      settling = true;
      host.classList.add('settling');
      clearTimeout(settleTimer);
      settleTimer = setTimeout(() => {
        settling = false;
        relayout();
        restart();
        host.classList.remove('settling');
      }, SETTLE_MS);
    });
  });

  afterNextRender(() => {
    if (typeof IntersectionObserver === 'undefined' || typeof ResizeObserver === 'undefined') return;
    if (!painter.init()) return;
    const calm = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const paint = (now: number) => painter.draw(now, elapsed, calm);

    /** Draw only what can be seen: in view, in an open tile, and not while the tile is still moving. */
    const isLive = () => visible && !settling && (tile?.open() ?? true);
    const loop = (now: number) => {
      // Local clock that only runs while live; capped steps keep it smooth after stalls.
      elapsed += Math.min(50, Math.max(0, now - last)) * (calm ? CALM_SPEED : 1);
      last = now;
      paint(now);
      frame = isLive() ? requestAnimationFrame(loop) : 0;
    };
    const start = () => {
      if (frame || !isLive()) return;
      last = performance.now();
      frame = requestAnimationFrame(loop);
    };
    restart = start;

    const ro = new ResizeObserver(() => {
      if (settling) return; // redone when the tile has landed
      painter.resize();
      paint(performance.now());
    });
    ro.observe(host);

    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting && !document.hidden;
      start();
    });
    io.observe(host);
    const onVisibility = () => {
      if (document.hidden) visible = false;
      else {
        const rect = host.getBoundingClientRect();
        visible = rect.width > 0 && rect.right > 0 && rect.left < innerWidth;
        start();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    relayout = () => {
      painter.resize();
      paint(performance.now());
      start();
    };

    destroyRef.onDestroy(() => {
      clearTimeout(settleTimer);
      cancelAnimationFrame(frame);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
    });
  });
}

/**
 * The room a visual has in its card (CSS px, card coordinates): the stage (see .stage in
 * styles.css), reaching up towards the title (all the way on phones, halfway on desktop).
 */
export function stageRoom(card: HTMLElement, height: number, desktop: boolean, ceiling: number | null) {
  const stage = card.querySelector<HTMLElement>(':scope > .stage');
  const stageTop = stage ? stage.offsetTop : height * 0.3;
  const reach = desktop ? 0.5 : 1; // phones use every bit of it
  const top = Math.min(stageTop, stageTop - (stageTop - (ceiling ?? stageTop)) * reach);
  const bottom = stage ? stage.offsetTop + stage.offsetHeight - 4 : height * 0.75;
  return { top, bottom, room: bottom - top };
}
