import {
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  afterRenderEffect,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { Persona } from '../../content';
import { Viewport } from '../../layout';
import { Morph } from '../morph/morph';
import { Tile } from '../tile/tile';

const CYCLE: Persona[] = ['jan', 'architect', 'embedded', 'designer'];
const CYCLE_MS = 4600;

/** "I adapt": the portrait keeps cycling through personas, and the word answers every change. */
@Component({
  selector: 'app-hero',
  imports: [Morph],
  templateUrl: './hero.html',
  styleUrl: './hero.css',
  host: { '[class.resting]': 'resting()' },
})
export class Hero {
  private readonly tile = inject(Tile, { optional: true });
  private readonly screen = inject(Viewport);
  private readonly polaroid = viewChild.required<ElementRef<HTMLElement>>('polaroid');
  private readonly adapt = viewChild.required<ElementRef<HTMLElement>>('adapt');

  readonly persona = signal<Persona>('jan');

  /**
   * Desktop, tile expanded: the next pages are what you came for, so the hero steps back.
   * It stops changing (whatever is mid-transition finishes first) and settles into a quiet,
   * greyed state until you touch it again.
   */
  readonly frozen = computed(() => this.screen.desktop() && this.tile?.state() === 'active');
  readonly resting = this.frozen;

  constructor() {
    const destroyRef = inject(DestroyRef);
    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

    // The portrait is sized once per screen, for one spread column (= what a peeking tile shows),
    // so opening the tile neither moves nor scales it.
    afterRenderEffect(() => {
      if (this.screen.desktop()) host.style.setProperty('--peek-w', `${Math.floor(this.screen.spread().col)}px`);
    });

    afterNextRender(() => {
      const timer = setInterval(() => {
        const visible = !document.hidden && (this.tile?.open() ?? true);
        if (!visible || this.frozen()) return;
        this.persona.update((p) => CYCLE[(CYCLE.indexOf(p) + 1) % CYCLE.length]);
      }, CYCLE_MS);
      destroyRef.onDestroy(() => clearInterval(timer));
    });
  }

  /** The moment a persona apparates: the polaroid shakes and "adapt." is cut sharp, then softens. */
  crack() {
    this.shake();
    if (typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    this.adapt().nativeElement.animate?.(
      [{ fontVariationSettings: "'SHRP' 0" }, { fontVariationSettings: "'SHRP' 100", offset: 0.35 }, { fontVariationSettings: "'SHRP' 0" }],
      { duration: 900, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' },
    );
  }

  private shake() {
    this.polaroid().nativeElement.animate?.(
      [
        { translate: '0 0' },
        { translate: '-6px 3px' },
        { translate: '5px -4px' },
        { translate: '-3px 2px' },
        { translate: '0 0' },
      ],
      { duration: 280, easing: 'ease-out' },
    );
  }
}
