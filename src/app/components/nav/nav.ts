import { Component, computed, effect, inject, signal } from '@angular/core';
import { CONTACTS } from '../../content';
import { NAV_GROW, NAV_GROW_MOBILE, NAV_OPEN_GROW, Viewport } from '../../layout';

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
  readonly isOpen = signal(false);
  private readonly hovered = signal(false);
  readonly expanded = computed(() => this.isOpen() || this.hovered());

  protected readonly grow = NAV_GROW;
  protected readonly growMobile = NAV_GROW_MOBILE;
  protected readonly openGrow = NAV_OPEN_GROW;
  protected readonly viewport = inject(Viewport);

  constructor() {
    effect(() => this.viewport.navOpen.set(this.expanded()));
  }

  toggle() {
    this.isOpen.update((v) => !v);
  }

  hover(on: boolean) {
    if (this.viewport.fine && this.viewport.desktop()) this.hovered.set(on);
  }
}
