import { DestroyRef, Directive, ElementRef, afterNextRender, effect, inject, input, untracked } from '@angular/core';
import { Tile } from '../tile/tile';

/**
 * Quick, bouncy zoom: overshoot, settle. Short enough to feel like a wink, not a show.
 * Every keyframe after the first states its opacity: a keyframe without one would animate
 * back to the element's own opacity, which is 0 while it waits to come in (it would appear,
 * fade away again and pop back at the end).
 */
const KEYFRAMES: Keyframe[] = [
  { transform: 'scale(0.4) rotate(-6deg)', opacity: 0 },
  { transform: 'scale(1.14) rotate(2deg)', opacity: 1, offset: 0.55 },
  { transform: 'scale(0.96) rotate(-1deg)', opacity: 1, offset: 0.78 },
  { transform: 'none', opacity: 1 },
];
// The delay lets the question (or the page) arrive first; 'backwards' keeps it hidden until then.
const TIMING: KeyframeAnimationOptions = { duration: 560, delay: 300, fill: 'backwards', easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)' };

/**
 * The attention kicker for answers ("I can do that."). Plays when its value changes and the
 * first time it comes into view in a visit of its tile (Tile.visit). Swiping away and back,
 * or opening the peeking tile, leaves it standing; entering the tile from another one again
 * plays it again.
 */
@Directive({
  selector: '[appKick]',
  // Hidden until it is in view and ready to animate in: no flash of the finished badge first.
  host: { style: 'display: inline-block; transform-origin: 30% 60%; opacity: 0' },
})
export class Kick {
  readonly appKick = input<unknown>();
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly tile = inject(Tile, { optional: true });
  private visible = false;
  private anim?: Animation;
  /** The visit it last played in; undefined: still to play. */
  private played?: number;

  constructor() {
    effect(() => {
      this.appKick();
      untracked(() => this.visible && this.play());
    });
    // A new visit: hidden again, to play the next time it is in view (now, if it already is).
    effect(() => {
      const visit = this.tile?.visit() ?? 0;
      untracked(() => {
        if (this.played === undefined || this.played === visit) return;
        this.played = undefined;
        this.hide();
        if (this.visible) this.play();
      });
    });

    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      if (typeof IntersectionObserver === 'undefined') return void (this.el.style.opacity = '1');
      const io = new IntersectionObserver(
        ([entry]) => {
          const now = entry.intersectionRatio >= 0.6;
          if (now && !this.visible && this.played === undefined) this.play();
          this.visible = now;
        },
        { threshold: [0, 0.05, 0.6] },
      );
      io.observe(this.el);
      destroyRef.onDestroy(() => io.disconnect());
    });
  }

  private hide() {
    this.anim?.cancel();
    this.el.style.opacity = '0';
  }

  private play() {
    this.played = this.tile?.visit() ?? 0;
    this.anim?.cancel();
    this.el.style.opacity = '0';
    if (typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.el.style.opacity = '1';
      return;
    }
    const anim = this.el.animate?.(KEYFRAMES, { ...TIMING, fill: 'both' });
    if (!anim) {
      this.el.style.opacity = '1';
      return;
    }
    this.anim = anim;
    // Once it has landed, the element itself is the finished state.
    anim.finished.then(() => {
      this.el.style.opacity = '1';
      anim.cancel();
    }, () => {});
  }
}
