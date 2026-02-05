import { Component, signal } from '@angular/core';

@Component({
  selector: 'app-nav',
  imports: [],
  templateUrl: './nav.html',
  styleUrl: './nav.css',
})
export class Nav {
  readonly isOpen = signal(false);
  wasTriggered = signal(false);

  toggle() {
    this.wasTriggered.set(true);
    this.isOpen.update(v => !v);
  }
}
