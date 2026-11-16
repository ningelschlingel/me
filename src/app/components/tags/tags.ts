import { Component, DestroyRef, ElementRef, afterNextRender, computed, inject, input, signal, viewChild } from '@angular/core';
import { Viewport } from '../../layout';

const CYCLE_MS = 3200;
const FADE_MS = 220;

/**
 * Tags. Desktop: all of them, wrapping. Phones: only as many as fit on one line, fading out to the
 * right with a small "+n" chip behind them, and the rest follow, page by page, until all have been shown.
 */
@Component({
  selector: 'app-tags',
  template: `
    @if (compact()) {
      <div class="measure" #measure aria-hidden="true">
        @for (t of tags(); track t) { <span class="chip">{{ t }}</span> }
      </div>
      <div class="wrap">
        <div class="row" #row [class.faded]="more() > 0">
          @for (t of page(); track t) { <span class="chip">{{ t }}</span> }
        </div>
        @if (more() > 0) { <span class="chip more" aria-hidden="true">+{{ more() }}</span> }
      </div>
      <span class="sr-only">{{ tags().join(', ') }}</span>
    } @else {
      <div class="all">
        @for (t of tags(); track t) { <span class="chip">{{ t }}</span> }
      </div>
    }
  `,
  styleUrl: './tags.css',
})
export class Tags {
  readonly tags = input.required<string[]>();

  private readonly screen = inject(Viewport);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly measureRef = viewChild<ElementRef<HTMLElement>>('measure');
  private readonly rowRef = viewChild<ElementRef<HTMLElement>>('row');

  readonly compact = computed(() => !this.screen.desktop());
  /** [start, end) of the tags shown right now. */
  private readonly range = signal<[number, number]>([0, 0]);
  private widths: number[] = [];
  private width = 0;
  private timer?: ReturnType<typeof setInterval>;
  private visible = false;

  readonly page = computed(() => {
    const [a, b] = this.range();
    return b > a ? this.tags().slice(a, b) : this.tags().slice(0, 1);
  });
  /** How many tags are not on screen right now. */
  readonly more = computed(() => {
    const [a, b] = this.range();
    return b > a ? this.tags().length - (b - a) : 0;
  });

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      if (typeof ResizeObserver === 'undefined' || typeof IntersectionObserver === 'undefined') {
        this.range.set([0, this.tags().length]);
        return;
      }
      const ro = new ResizeObserver(() => this.measure());
      ro.observe(this.host);
      // Only cycle while it can be seen (saves work and keeps pages in step with the viewer).
      const io = new IntersectionObserver(([e]) => {
        this.visible = e.isIntersecting;
      });
      io.observe(this.host);
      this.timer = setInterval(() => this.visible && this.advance(), CYCLE_MS);
      destroyRef.onDestroy(() => {
        ro.disconnect();
        io.disconnect();
        clearInterval(this.timer);
      });
    });
  }

  /** Measures every chip once per width, then shows the first page. */
  private measure() {
    const m = this.measureRef()?.nativeElement;
    if (!m) return;
    this.width = this.host.clientWidth;
    this.widths = Array.from(m.children).map((c) => (c as HTMLElement).offsetWidth);
    this.range.set(this.fit(0));
  }

  /** The greedy page from `start`: as many whole chips as fit, leaving room for the "+n" chip. */
  private fit(start: number): [number, number] {
    const gap = 6;
    const indicator = 44;
    const n = this.widths.length;
    const used = (end: number) => this.widths.slice(start, end).reduce((a, w) => a + w + gap, 0);
    if (used(n) <= this.width) return [start, n]; // the rest all fit: no indicator needed
    let end = start;
    while (end < n && used(end + 1) + indicator <= this.width) end++;
    return [start, Math.max(end, start + 1)];
  }

  private advance() {
    const [, end] = this.range();
    const n = this.tags().length;
    // Everything fits at once: nothing to cycle.
    const first = this.fit(0);
    if (first[1] >= n) return;
    const next = this.fit(end >= n ? 0 : end);
    const row = this.rowRef()?.nativeElement;
    const reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!row || !row.animate || reduced) return void this.range.set(next);
    // A quick crossfade: out, swap, in. Opacity only, so it costs almost nothing.
    row.animate([{ opacity: 1 }, { opacity: 0 }], { duration: FADE_MS, fill: 'forwards' }).finished.then(() => {
      this.range.set(next);
      requestAnimationFrame(() => row.animate([{ opacity: 0 }, { opacity: 1 }], { duration: FADE_MS, fill: 'both' }));
    }, () => {});
  }
}
