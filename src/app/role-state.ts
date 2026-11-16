import { Injectable, signal } from '@angular/core';
import { RoleId } from './content';

/**
 * The one piece of state that connects the sections:
 * pick a role anywhere → the hero transforms and the index filters.
 * `null` means "show me everything" and lets the hero cycle on its own.
 */
@Injectable({ providedIn: 'root' })
export class RoleState {
  readonly selected = signal<RoleId | null>(null);

  toggle(id: RoleId) {
    this.selected.update((current) => (current === id ? null : id));
  }
}
