import { Component, signal } from '@angular/core';
import { Nav } from "./components/nav/nav";
import { Tile } from './components/tile/tile';
import { Home } from "./components/home/home";

@Component({
  selector: 'app-root',
  templateUrl: './app.html',
  styleUrl: './app.css',
  imports: [Nav, Tile, Home],
})
export class App {
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
    const result = (active === null) ? 'idle' : active === index ? 'active' : 'hidden';
    console.log(index + " " + result);
    return result;
  }
}
