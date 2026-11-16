import {
  Component,
  DestroyRef,
  ElementRef,
  ViewEncapsulation,
  afterNextRender,
  afterRenderEffect,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { Viewport } from '../../layout';
import { canScroll } from '../../scroll';
import { Tile } from '../tile/tile';

/**
 * Horizontal, swipeable pages with their own gesture engine.
 *
 * Layout: every direct child is a page. The track always shows a whole number of
 * pages (--cols), each at least --page-w wide, laid out in px for the width the
 * tile is *going to* have (Tile.contentWidth), so pages never reflow mid-animation.
 * `data-span="2"` lets a page take two columns where there are two.
 *
 * Motion: one transform, driven by a spring. Fingers, mouse drags and trackpad
 * swipes move the track 1:1; letting go hands the gesture's velocity to the spring,
 * which settles on a page. No native scroll-snap, so nothing snaps late or fights back.
 * Pages still scroll vertically on their own, natively.
 */
@Component({
  selector: 'app-pager',
  templateUrl: './pager.html',
  styleUrl: './pager.css',
  encapsulation: ViewEncapsulation.None,
})
export class Pager {
  private readonly viewportRef = viewChild.required<ElementRef<HTMLElement>>('viewport');
  private readonly trackRef = viewChild.required<ElementRef<HTMLElement>>('track');
  private readonly tile = inject(Tile, { optional: true });
  private readonly screen = inject(Viewport);

  /** Offsets the track can rest at (pages that start past the end collapse into the last one). */
  readonly stops = signal<number[]>([0]);
  /** The page we are at or heading to. */
  readonly index = signal(0);
  readonly dragging = signal(false);
  /** The swipe hint is showing. */
  readonly hinting = signal(false);

  /** Width the pages were laid out for. */
  private view = 0;
  private wasOpen = false;

  // Motion state: offset x (px, grows to the right), velocity v (px/s), spring target.
  private x = 0;
  private v = 0;
  private target = 0;
  private frame = 0;
  private last = 0;

  private gesture: Gesture | null = null;
  private wheel = new WheelState();
  private suppressClick = 0;
  private nudgeTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    const destroyRef = inject(DestroyRef);

    afterNextRender(() => {
      const vp = this.viewportRef().nativeElement;
      if (typeof ResizeObserver !== 'undefined') {
        // Safety net (fonts, late content). Layout is predicted, so this rarely changes anything.
        const ro = new ResizeObserver(() => this.measure());
        ro.observe(vp);
        destroyRef.onDestroy(() => ro.disconnect());
      }
      if (typeof MutationObserver !== 'undefined') {
        // Content swapped (e.g. a filter changed): start over at page one.
        const mo = new MutationObserver(() => this.reset());
        mo.observe(this.trackRef().nativeElement, { childList: true });
        destroyRef.onDestroy(() => mo.disconnect());
      }
      // A click that ends a drag is not a click.
      const swallow = (e: MouseEvent) => {
        if (performance.now() - this.suppressClick < 80) {
          e.stopPropagation();
          e.preventDefault();
        }
      };
      vp.addEventListener('click', swallow, true);

      // Touch gets real touch events: once a swipe is clearly sideways we preventDefault, so iOS can
      // no longer claim it for vertical scrolling halfway through (pointer events can't do that).
      const touch = (e: TouchEvent) => this.onTouch(e);
      vp.addEventListener('touchstart', touch, { passive: true });
      vp.addEventListener('touchmove', touch, { passive: false });
      vp.addEventListener('touchend', touch);
      vp.addEventListener('touchcancel', touch);

      destroyRef.onDestroy(() => {
        vp.removeEventListener('click', swallow, true);
        for (const type of ['touchstart', 'touchmove', 'touchend', 'touchcancel'] as const) vp.removeEventListener(type, touch);
        cancelAnimationFrame(this.frame);
        clearTimeout(this.nudgeTimer);
      });
    });

    // Lay out for the tile's destination as soon as it changes: state, share or screen size.
    afterRenderEffect(() => {
      const open = this.tile?.open() ?? true;
      this.tile?.targetWidth();
      untracked(() => {
        this.layout(this.wasOpen && open);
        this.wasOpen = open;
      });
    });

    // Once per visit: if nobody has paged yet, the first open pager wiggles to say "swipe me".
    effect(() => {
      const open = this.tile ? this.tile.state() === 'active' || this.tile.state() === 'peek' : true;
      const pages = this.stops().length;
      untracked(() => {
        clearTimeout(this.nudgeTimer);
        if (open && pages > 1 && !nudged) this.nudgeTimer = setTimeout(() => this.nudge(), NUDGE_AFTER_MS);
      });
    });

    // A tile that closes forgets where it was.
    const closed = () => ['rest', 'hidden'].includes(this.tile?.state() ?? '');
    effect(() => {
      if (closed()) untracked(() => setTimeout(() => closed() && this.reset(), 700));
    });
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  go(i: number, velocity = this.v) {
    interacted();
    const stops = this.stops();
    const index = clamp(i, 0, stops.length - 1);
    this.index.set(index);
    this.settle(stops[index], velocity);
  }

  reset() {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.x = this.v = this.target = 0;
    this.index.set(0);
    this.paint();
    for (const page of this.pages()) page.scrollTop = 0;
    this.measure();
  }

  // ── Input ──────────────────────────────────────────────────────────────────

  onKey(event: KeyboardEvent) {
    const dir = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
    if (!dir || (event.target as Element).closest('input, textarea, select')) return;
    event.preventDefault();
    this.go(this.index() + dir, 0);
  }

  onPointerDown(event: PointerEvent) {
    if (event.pointerType === 'touch' || event.button !== 0 || this.stops().length < 2) return;
    if ((event.target as Element).closest('input, textarea, select, .pager-nav')) return;
    this.gesture = {
      id: event.pointerId,
      x0: event.clientX,
      y0: event.clientY,
      from: this.x,
      start: this.index(),
      live: false,
      samples: [{ t: event.timeStamp, x: event.clientX }],
    };
  }

  onPointerMove(event: PointerEvent) {
    const g = this.gesture;
    if (!g || g.id !== event.pointerId) return;
    if (this.dragMove(event.clientX, event.clientY, event.timeStamp) === 'started')
      this.viewportRef().nativeElement.setPointerCapture?.(event.pointerId);
  }

  onPointerUp(event: PointerEvent) {
    const g = this.gesture;
    if (!g || g.id !== event.pointerId) return;
    this.dragEnd(event.timeStamp);
  }

  private onTouch(event: TouchEvent) {
    const t = event.changedTouches[0];
    if (event.type === 'touchstart') {
      if (event.touches.length !== 1 || this.stops().length < 2) return void (this.gesture = null);
      if ((event.target as Element).closest('input, textarea, select, .pager-nav')) return;
      this.gesture = { id: -1, x0: t.clientX, y0: t.clientY, from: this.x, start: this.index(), live: false, samples: [{ t: event.timeStamp, x: t.clientX }] };
      return;
    }
    const g = this.gesture;
    if (!g || g.id !== -1) return;
    if (event.type === 'touchmove') {
      if (event.touches.length !== 1) return this.dragEnd(event.timeStamp);
      this.dragMove(t.clientX, t.clientY, event.timeStamp);
      if (g.live && event.cancelable) event.preventDefault(); // ours now: no vertical scroll, no back-swipe
      return;
    }
    this.dragEnd(event.timeStamp);
  }

  /** Shared by mouse and touch. Returns 'started' on the move that turns a press into a drag. */
  private dragMove(cx: number, cy: number, time: number): 'started' | void {
    const g = this.gesture!;
    const dx = cx - g.x0;
    const dy = cy - g.y0;
    let started = false;

    if (!g.live) {
      // Decide the axis once. Vertical belongs to the page (native scroll), horizontal to us.
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) return void (this.gesture = null);
      if (Math.abs(dx) < 6 || Math.abs(dx) < Math.abs(dy) * 1.1) return;
      g.live = started = true;
      g.x0 = cx; // no jump from the dead zone
      g.from = this.x;
      this.dragging.set(true);
      interacted();
      getSelection?.()?.removeAllRanges();
      cancelAnimationFrame(this.frame);
      this.frame = 0;
    }

    g.samples.push({ t: time, x: cx });
    if (g.samples.length > 8) g.samples.shift();
    this.x = this.rubber(g.from - (cx - g.x0));
    this.index.set(this.nearest(this.x));
    this.paint();
    return started ? 'started' : undefined;
  }

  private dragEnd(time: number) {
    const g = this.gesture;
    this.gesture = null;
    if (!g?.live) return;
    this.dragging.set(false);
    this.suppressClick = performance.now();

    // Offset velocity (px/s, positive = towards later pages) from the last ~80 ms.
    const recent = g.samples.filter((s) => time - s.t < 80);
    const first = recent[0] ?? g.samples[0];
    const last = g.samples[g.samples.length - 1];
    const dt = Math.max(8, last.t - first.t) / 1000;
    const v = recent.length > 1 ? -(last.x - first.x) / dt : 0;

    this.release(g.start, this.x - g.from, v);
  }

  /**
   * The once-per-visit hint: nothing moves, a soft glow with a chevron pulses twice at the
   * right edge ("there is more this way"). Compositor-only (opacity), so it is smooth everywhere.
   */
  private nudge() {
    if (nudged || this.gesture || this.index() !== 0) return;
    nudged = true;
    this.hinting.set(true);
    this.nudgeTimer = setTimeout(() => this.hinting.set(false), HINT_MS);
  }

  /**
   * Trackpads: follow sideways swipes 1:1, then commit to the next page once the swipe means
   * it and let the momentum tail run out silently. Mouse wheels (vertical): flip a page once
   * the page itself has nothing left to scroll.
   */
  onWheel(event: WheelEvent) {
    if (this.stops().length < 2 || event.ctrlKey) return; // ctrl = pinch zoom
    const w = this.wheel;
    const now = event.timeStamp;
    const scale = event.deltaMode === 1 ? 32 : event.deltaMode === 2 ? this.view : 1;
    const dx = event.deltaX * scale;
    const dy = event.deltaY * scale;

    if (w.ended(now)) w.begin(now, Math.abs(dx) * 2 >= Math.abs(dy) ? 'x' : 'y', this.x, this.index());
    const fresh = w.feed(now, w.axis === 'x' ? dx : dy);

    if (w.axis === 'y') {
      if (w.spent && !fresh) return;
      if (Math.abs(dy) < 4) return;
      w.spent = true;
      const dir = Math.sign(dy);
      if (canScroll(event.target as Element, this.viewportRef().nativeElement, dir)) return;
      this.go(this.index() + dir, 0);
      return;
    }

    event.preventDefault();
    interacted();
    if (fresh) w.begin(now, 'x', this.x, this.index()); // a new swipe inside the momentum tail
    if (w.spent) return; // committed: let the tail run out

    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.x = this.rubber(this.x + dx);
    this.index.set(this.nearest(this.x));
    this.paint();

    const moved = this.x - w.from;
    if (Math.abs(moved) > Math.min(90, this.pageWidth() * 0.18)) {
      w.spent = true;
      this.go(w.start + Math.sign(moved), w.velocity());
    } else {
      // Swipe ended short of the threshold: settle wherever is nearest.
      w.onIdle(() => this.go(this.nearest(this.x), 0));
    }
  }

  /** The browser may scroll the clipped viewport itself (e.g. to reveal a focused link); undo and page there. */
  onNativeScroll() {
    const vp = this.viewportRef().nativeElement;
    if (vp.scrollLeft) vp.scrollLeft = 0;
  }

  onFocusIn(event: FocusEvent) {
    const page = this.pages().find((p) => p.contains(event.target as Node));
    if (!page) return;
    const visible = page.offsetLeft >= this.target - 1 && page.offsetLeft + page.offsetWidth <= this.target + this.view + 1;
    if (!visible) this.go(this.nearest(Math.min(page.offsetLeft, this.max())), 0);
  }

  // ── Motion ─────────────────────────────────────────────────────────────────

  /** Pick the page a released drag/swipe was aiming for: distance or speed decide, never more than one page. */
  private release(start: number, moved: number, velocity: number) {
    const intent = Math.abs(velocity) > 350 ? Math.sign(velocity) : Math.abs(moved) > this.pageWidth() * 0.25 ? Math.sign(moved) : 0;
    this.go(start + intent, velocity);
  }

  private settle(to: number, velocity: number) {
    this.target = to;
    this.v = reducedMotion() ? 0 : velocity; // reduced motion: a calm glide, no fling
    if (!this.frame) {
      this.last = performance.now();
      this.frame = requestAnimationFrame(this.step);
    }
  }

  /** A slightly underdamped spring (ζ ≈ 0.9): quick, soft landing, no visible wobble. */
  private readonly step = (now: number) => {
    let dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const k = 190;
    const c = 2 * Math.sqrt(k) * (reducedMotion() ? 1.15 : 0.9);
    // Fixed sub-steps keep the integration stable on any frame rate.
    while (dt > 0) {
      const h = Math.min(dt, 1 / 240);
      this.v += (-k * (this.x - this.target) - c * this.v) * h;
      this.x += this.v * h;
      dt -= h;
    }
    if (Math.abs(this.x - this.target) < 0.25 && Math.abs(this.v) < 8) {
      this.x = this.target;
      this.v = 0;
      this.frame = 0;
    } else {
      this.frame = requestAnimationFrame(this.step);
    }
    this.paint();
  };

  private paint() {
    this.trackRef().nativeElement.style.transform = `translate3d(${-this.x}px, 0, 0)`;
  }

  /** Past either end, the track follows with growing resistance. */
  private rubber(x: number) {
    const max = this.max();
    const over = x < 0 ? x : x > max ? x - max : 0;
    if (!over) return x;
    const eased = (over * 0.5) / (1 + Math.abs(over) / 400);
    return (x < 0 ? 0 : max) + eased;
  }

  // ── Layout ─────────────────────────────────────────────────────────────────

  private pages() {
    return Array.from(this.trackRef().nativeElement.children) as HTMLElement[];
  }

  private max() {
    const pages = this.pages();
    const last = pages[pages.length - 1];
    const end = last ? last.offsetLeft + last.offsetWidth : 0;
    return Math.max(0, end - (this.view || this.viewportRef().nativeElement.clientWidth));
  }

  private pageWidth() {
    return this.pages()[1]?.offsetWidth || this.view || 1;
  }

  private nearest(x: number) {
    const stops = this.stops();
    let best = 0;
    stops.forEach((s, i) => Math.abs(s - x) < Math.abs(stops[best] - x) && (best = i));
    return best;
  }

  /**
   * Column count and page width for the destination width. Desktop uses the deck's spread
   * column (layout.ts), so a peeking tile and the open one share the exact same page width.
   */
  private layout(animate: boolean) {
    const track = this.trackRef().nativeElement;
    const open = this.tile?.open() ?? true;
    const gap = this.screen.gap();
    track.style.setProperty('--page-gap', `${gap}px`);

    // Closed tiles keep their last layout; it is invisible and avoids a reflow on reopening.
    if (open || !this.view) {
      const width = Math.floor(this.tile ? this.tile.contentWidth() : this.viewportRef().nativeElement.clientWidth);
      if (width > 0 && width !== this.view) {
        let cols: number;
        let col: number;
        if (this.tile && this.screen.desktop()) {
          // As many of the tile's own columns as the destination holds, stretched to fill it exactly.
          // (Reading tiles: identical in peek and open. INDEX: one big card in peek, three when open.)
          const target = this.tile.spread().col;
          cols = Math.max(1, Math.round((width + gap) / (target + gap)));
          col = (width - gap * (cols - 1)) / cols;
        } else {
          const min = toPx(getComputedStyle(track).getPropertyValue('--page-w'), DEFAULT_PAGE_W);
          cols = Math.max(1, Math.floor((width + gap) / (min + gap)));
          col = (width - gap * (cols - 1)) / cols;
        }
        const px = `${col.toFixed(2)}px`;
        const resized = track.style.getPropertyValue('--col') !== px;
        track.style.setProperty('--cols', String(cols));
        track.style.setProperty('--col', px);
        this.view = width;
        // Only content that really re-flows while visible fades; a revealed column just appears.
        if (animate && resized) track.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: 450, easing: 'ease-out' });
      }
    }
    this.measure();
  }

  private measure() {
    const max = this.max();
    const stops: number[] = [0];
    for (const page of this.pages()) {
      const stop = Math.min(page.offsetLeft, max);
      if (stop - stops[stops.length - 1] > 2) stops.push(stop);
    }
    for (const page of this.pages()) page.classList.toggle('can-scroll', page.scrollHeight - page.clientHeight > 2);
    this.stops.set(stops);
    const index = Math.min(this.index(), stops.length - 1);
    this.index.set(index);
    // Stay on the current page through any resize (but never yank a gesture in progress).
    const steering = this.gesture?.live || !this.wheel.ended(performance.now());
    if (!steering && this.target !== stops[index]) {
      this.target = stops[index];
      if (!this.frame) {
        this.x = this.target;
        this.paint();
      }
    }
  }
}

interface Gesture {
  id: number;
  x0: number;
  y0: number;
  from: number;
  start: number;
  live: boolean;
  samples: { t: number; x: number }[];
}

/**
 * One trackpad gesture, including its momentum tail. A gesture ends after a short pause;
 * a new swipe inside a tail is recognised by its deltas rising again.
 */
class WheelState {
  axis: 'x' | 'y' = 'y';
  from = 0;
  start = 0;
  spent = false;
  private at = -Infinity;
  private began = 0;
  private recent: { t: number; d: number }[] = [];
  private idle?: ReturnType<typeof setTimeout>;

  ended(now: number) {
    return now - this.at > 160;
  }

  begin(now: number, axis: 'x' | 'y', from: number, start: number) {
    this.axis = axis;
    this.from = from;
    this.start = start;
    this.spent = false;
    this.began = now;
    this.recent = [];
  }

  /** Records a delta; true when it starts a fresh swipe inside an ongoing tail. */
  feed(now: number, d: number): boolean {
    const prev = this.recent;
    this.recent = [...prev.filter((r) => now - r.t < 100), { t: now, d }];
    this.at = now;
    clearTimeout(this.idle);
    if (!this.spent || now - this.began < 250 || prev.length < 3) return false;
    const before = Math.min(...prev.slice(-3).map((r) => Math.abs(r.d)));
    return Math.abs(d) > 14 && Math.abs(d) > before * 2.2;
  }

  /** Velocity of the swipe (px/s), for a seamless hand-over to the spring. */
  velocity() {
    const r = this.recent;
    if (r.length < 2) return 0;
    const span = Math.max(16, r[r.length - 1].t - r[0].t) / 1000;
    return clamp(r.reduce((a, b) => a + b.d, 0) / span, -4000, 4000);
  }

  onIdle(fn: () => void) {
    clearTimeout(this.idle);
    this.idle = setTimeout(() => !this.spent && fn(), 140);
  }
}

/** The swipe hint runs once per visit, and never after the visitor has paged by themselves. */
let nudged = false;
const interacted = () => (nudged = true);
const NUDGE_AFTER_MS = 2600;
const HINT_MS = 2800;

/** Minimum page width when a pager doesn't set --page-w. */
const DEFAULT_PAGE_W = '22rem';

function toPx(value: string, fallback: string): number {
  const v = value.trim() || fallback;
  const n = parseFloat(v);
  if (v.endsWith('rem')) return n * parseFloat(getComputedStyle(document.documentElement).fontSize);
  return n > 0 ? n : toPx(fallback, '22rem');
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

const reducedMotion = () =>
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
