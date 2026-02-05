import { Component, signal } from '@angular/core';
import { Tile } from '../tile/tile';

@Component({
  selector: 'app-home',
  imports: [Tile],
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class Home {
  protected readonly title = signal('ningelschlingel');
  activeIndex = signal<number | null>(null);

  toggleTile(index: number) {
    this.activeIndex.update(current => current === index ? null : index);
  }

  close() {
    this.activeIndex.set(null);
  }

  getTileStatus(index: number) {
    const active = this.activeIndex();
    if (active === null) return 'idle';
    return active === index ? 'active' : 'hidden';
  }

}
