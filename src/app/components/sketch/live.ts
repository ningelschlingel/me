import { DestroyRef, afterNextRender, effect, inject, untracked } from '@angular/core';
import { ms } from '../../tempo';
import { Tile } from '../tile/tile';

/** With reduced motion, visuals keep living, just slowly. */
const CALM_SPEED = 0.35;
/** A tile's open/close transition (tile.css) plus a breath: then the layout is checked once more. At tempo 1, ms. */
const SETTLE_MS = 780;
/** An unseen card that stopped changing size for this long is laid out again (in the background). */
const QUIET_MS = 120;
/** Background catch-up work per frame, ms (at least one visual per frame). */
const CATCH_UP_BUDGET_MS = 4;

/**
 * Visuals nobody can see right now, waiting to be laid out and drawn again at their card's new
 * size. Worked off a few per frame, so a tile that settles never pays for all of its pages at once.
 */
const behind = new Set<() => void>();
let catchingUp = 0;
function catchUpLater(fn: () => void) {
  behind.add(fn);
  if (!catchingUp) catchingUp = requestAnimationFrame(catchUp);
}
function catchUp() {
  catchingUp = 0;
  const start = performance.now();
  for (const fn of behind) {
    behind.delete(fn);
    fn();
    if (performance.now() - start > CATCH_UP_BUDGET_MS) break;
  }
  if (behind.size) catchingUp = requestAnimationFrame(catchUp);
}

/** What a canvas visual in a card provides; `live` runs it. */
export interface Painter {
  /** Once the view exists. Return false to stay inert (e.g. no 2D context). */
  init(): boolean;
  /** The card changed size: size the canvases and lay the visual out again. */
  resize(): void;
  /** One frame. `elapsed` is a local clock (ms) that only runs while the visual is live. */
  draw(now: number, elapsed: number, calm: boolean): void;
  /** The clock went back to zero (a new visit): forget anything kept from the last one. */
  restart?(): void;
}

/**
 * Runs a canvas visual inside its card, the way every visual on the site behaves:
 * it draws only while in view, in an open tile and not hidden; it stays on screen and keeps
 * drawing while its tile opens or closes, laid out again whenever its card changes size; and
 * it honours reduced motion.
 *
 * Every visual is always in place: drawn at its card's size, even on a page that is not in
 * view, so swiping there shows it ready (in its first frame until its clock runs). Only what
 * can be seen follows its card's size frame by frame; a visual out of view catches up once its
 * card stops changing, in the background, and at the latest the moment it comes into view.
 *
 * Its clock starts at zero once per visit of its tile (Tile.visit): within a visit it only
 * pauses (out of view, tile moving) and carries on, so an entrance plays once. Coming back
 * from another tile starts it over.
 *
 * Call from a constructor (it needs an injection context).
 */
export function live(host: HTMLElement, painter: Painter) {
  const destroyRef = inject(DestroyRef);
  const tile = inject(Tile, { optional: true });

  let visible = false;
  /** A tile that just closed is still on screen, shrinking, until then (performance.now()). */
  let closingUntil = -Infinity;
  let settleTimer: ReturnType<typeof setTimeout> | undefined;
  let restart = () => {};
  let relayout = () => {};
  let repaint = () => {};
  let elapsed = 0;
  let last = 0;
  let frame = 0;

  // A new visit: start over, and show it at once (no frame from the last visit lingers).
  let visit = untracked(() => tile?.visit());
  effect(() => {
    const next = tile?.visit();
    untracked(() => {
      if (next === visit) return;
      visit = next;
      elapsed = 0;
      painter.restart?.();
      repaint();
    });
  });

  // A tile that opens or closes: the visual never leaves the screen. It keeps drawing right
  // through the move (any size change of its card is followed frame by frame, see the
  // ResizeObserver), starts at once if the tile just opened, and once the tile has landed its
  // layout is checked one more time, in case only the stage moved inside an unchanged card.
  let wasOpen: boolean | undefined;
  effect(() => {
    const state = tile?.state();
    untracked(() => {
      if (state === undefined) return;
      const open = tile?.open() ?? true;
      if (wasOpen === true && !open) closingUntil = performance.now() + ms(SETTLE_MS);
      wasOpen = open;
      restart();
      clearTimeout(settleTimer);
      settleTimer = setTimeout(() => relayout(), ms(SETTLE_MS));
    });
  });

  afterNextRender(() => {
    if (typeof IntersectionObserver === 'undefined' || typeof ResizeObserver === 'undefined') return;
    if (!painter.init()) return;
    const calm = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const paint = (now: number) => painter.draw(now, elapsed, calm);

    const open = () => tile?.open() ?? true;
    /** Draw only what can be seen: in view and in an open tile. */
    const isLive = () => visible && open();
    /** On screen: in view, in an open tile or one still closing. Its size changes show at once. */
    const seen = () => visible && (open() || performance.now() < closingUntil);

    /** The card's size is not what the visual was last laid out for. */
    let stale = false;
    let quietTimer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      stale = false;
      clearTimeout(quietTimer);
      behind.delete(catchUp);
      painter.resize();
      paint(performance.now());
    };
    const catchUp = () => stale && refresh();
    /**
     * Out of sight: only note it. In an open tile it may be swiped to any moment, so it is
     * laid out again once its card has stopped changing (in the background); in a closed tile
     * it waits until the tile opens.
     */
    const later = (now = false) => {
      stale = true;
      clearTimeout(quietTimer);
      if (!open()) return;
      if (now) catchUpLater(catchUp);
      else quietTimer = setTimeout(() => catchUpLater(catchUp), QUIET_MS);
    };

    const loop = (now: number) => {
      // Local clock that only runs while live; capped steps keep it smooth after stalls.
      elapsed += Math.min(50, Math.max(0, now - last)) * (calm ? CALM_SPEED : 1);
      last = now;
      paint(now);
      frame = isLive() ? requestAnimationFrame(loop) : 0;
    };
    const start = () => {
      if (frame || !isLive()) return;
      if (stale) refresh(); // coming into view: in place before its first frame
      last = performance.now();
      frame = requestAnimationFrame(loop);
    };
    restart = () => {
      // A tile that opens: its visuals out of view catch up in the background.
      if (stale && !visible && open()) later();
      start();
    };

    // The first observation (page load) lays every visual out at once, so all are in place.
    let first = true;
    const ro = new ResizeObserver(() => {
      if (first || seen()) refresh();
      else later();
      first = false;
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

    repaint = () => paint(performance.now());
    relayout = () => {
      if (seen()) refresh();
      else later(true);
      start();
    };

    destroyRef.onDestroy(() => {
      clearTimeout(settleTimer);
      clearTimeout(quietTimer);
      behind.delete(catchUp);
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
