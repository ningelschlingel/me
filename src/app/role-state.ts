import { Injectable, signal } from '@angular/core';
import { RoleId } from './content';

/**
 * The one piece of state that connects the sections: a role picked in YOU filters the index.
 * `null` means "show me everything".
 */
@Injectable({ providedIn: 'root' })
export class RoleState {
  readonly selected = signal<RoleId | null>(null);

  toggle(id: RoleId) {
    this.selected.update((current) => (current === id ? null : id));
  }
}
