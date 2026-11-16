import { TestBed } from '@angular/core/testing';
import { Home } from './components/home/home';
import { DECK_GROW, HIDDEN_GROW, NAV_GROW, NAV_OPEN_GROW, Viewport, tileGrow } from './layout';

describe('layout', () => {
  it('opens the menu to exactly half the screen', () => {
    expect(NAV_OPEN_GROW).toBe(DECK_GROW);
    expect(NAV_GROW).toBeLessThan(DECK_GROW);
  });

  it('collapses other tiles to (almost) nothing, never to exactly 0 (WebKit would not animate)', () => {
    expect(tileGrow('hidden', 4)).toBe(HIDDEN_GROW);
    expect(HIDDEN_GROW).toBeGreaterThan(0);
    expect(HIDDEN_GROW).toBeLessThan(0.001);
    // Active keeps the peek ratio: opening only shrinks the others.
    expect(tileGrow('active', 4)).toBe(tileGrow('peek', 4));
  });

  it('sizes a peeking tile so its content is exactly one column of the open spread', () => {
    const screen = TestBed.inject(Viewport);
    for (const width of [1024, 1280, 1440, 1920, 2560]) {
      screen.desktop.set(true);
      screen.width.set(width);
      screen.frame.set(190);
      const open = screen.openGrow(4);
      const peekContent = screen.deckWidth() * (open / (open + 3)) - 190;
      expect(peekContent).toBeCloseTo(screen.spread().col, 6);
      expect(screen.spread().cols).toBeGreaterThanOrEqual(2);
      expect(open).toBeGreaterThan(1); // a peek is always wider than a resting tile
    }
  });

  it('gives the active tile the whole deck and never half-opens without hover', () => {
    TestBed.configureTestingModule({ imports: [Home] });
    const home = TestBed.createComponent(Home).componentInstance;
    // jsdom has no hover: nothing peeks.
    expect(home.states()).toEqual(['rest', 'rest', 'rest', 'rest']);
    home.open(2);
    expect(home.states()).toEqual(['hidden', 'hidden', 'active', 'hidden']);
    expect(home.shares()[2]).toBeCloseTo(1, 3);
    home.close();
    expect(home.shares().reduce((a, b) => a + b, 0)).toBeCloseTo(1);
  });
});
