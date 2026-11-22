import { Component, computed, effect, inject, signal } from '@angular/core';
import { CONTACTS } from '../../content';
import { NAV_GROW, NAV_GROW_MOBILE, NAV_OPEN_GROW, Viewport } from '../../layout';
import { ms } from '../../tempo';

/** The menu's open/close transition (nav.css) plus a frame. At tempo 1, ms. */
const COVER_MS = 720;

/**
 * Always-reachable contact rail: right column on desktop (opens on hover), bottom bar on phones.
 * Open, it takes exactly half the screen (see layout.ts).
 */
@Component({
  selector: 'app-nav',
  templateUrl: './nav.html',
  styleUrl: './nav.css',
  host: {
    '[class.open]': 'expanded()',
    '[style.flex-grow]': 'expanded() ? openGrow : viewport.desktop() ? grow : growMobile',
    '(mouseenter)': 'hover(true)',
    '(mouseleave)': 'hover(false)',
  },
})
export class Nav {
  readonly contacts = CONTACTS;
  readonly year = new Date().getFullYear();
  private readonly hovered = signal(false);
  readonly expanded = computed(() => this.isOpen() || this.hovered());

  protected readonly grow = NAV_GROW;
  protected readonly growMobile = NAV_GROW_MOBILE;
  protected readonly openGrow = NAV_OPEN_GROW;
  protected readonly viewport = inject(Viewport);
  readonly isOpen = this.viewport.menu;

  private coverTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    effect(() => {
      const open = this.expanded();
      this.viewport.navOpen.set(open);
      // Covering starts at once and ends only when the menu has slid back (nav.css).
      clearTimeout(this.coverTimer);
      if (open) this.viewport.navCovering.set(true);
      else this.coverTimer = setTimeout(() => this.viewport.navCovering.set(false), ms(COVER_MS));
    });
  }

  toggle() {
    this.isOpen.update((v) => !v);
  }

  hover(on: boolean) {
    if (this.viewport.fine && this.viewport.desktop()) this.hovered.set(on);
  }
}
