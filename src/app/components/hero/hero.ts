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
import { INTRO, Persona, ROLES, RoleId, roleById } from '../../content';
import { Viewport } from '../../layout';
import { RoleState } from '../../role-state';
import { Flap } from '../flap/flap';
import { Kick } from '../kick/kick';
import { Morph } from '../morph/morph';
import { Tile } from '../tile/tile';

const CYCLE: Persona[] = ['jan', 'architect', 'embedded', 'designer'];
const CYCLE_MS = 4600;

/** "I can adapt": the portrait cycles through personas until a visitor picks one. */
@Component({
  selector: 'app-hero',
  imports: [Morph, Flap, Kick],
  templateUrl: './hero.html',
  styleUrl: './hero.css',
  host: { '[class.resting]': 'resting()' },
})
export class Hero {
  readonly roles = ROLES;
  readonly selected = inject(RoleState).selected;
  private readonly roleState = inject(RoleState);
  private readonly tile = inject(Tile, { optional: true });
  private readonly screen = inject(Viewport);
  private readonly polaroid = viewChild.required<ElementRef<HTMLElement>>('polaroid');

  private readonly cycled = signal<Persona>('jan');
  readonly persona = computed<Persona>(() => this.selected() ?? this.cycled());
  /** The polaroid already says who; the board asks what for. */
  readonly line = computed(() => {
    const p = this.persona();
    return p === 'jan' ? INTRO : roleById(p);
  });

  /**
   * Desktop, tile expanded: the next pages are what you came for, so the hero steps back.
   * It stops changing (whatever is mid-transition finishes first) and settles into a quiet,
   * greyed state until you touch it again or pick a role.
   */
  readonly frozen = computed(() => this.screen.desktop() && this.tile?.state() === 'active');
  readonly resting = computed(() => this.frozen() && !this.selected());

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
        if (!visible || this.frozen() || this.selected()) return;
        this.cycled.update((p) => CYCLE[(CYCLE.indexOf(p) + 1) % CYCLE.length]);
      }, CYCLE_MS);
      destroyRef.onDestroy(() => clearInterval(timer));
    });
  }

  pick(id: RoleId) {
    this.roleState.toggle(id);
  }

  shake() {
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
