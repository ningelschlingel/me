import { Injectable, computed, signal } from '@angular/core';

/**
 * Every flex ratio and column on the page is decided here. Components bind these values
 * inline and CSS only transitions them, so everything knows where it will end up before
 * it gets there.
 *
 * Screen: the deck (all tiles) and the menu share it DECK : NAV. The tiles split the deck
 * among themselves, so the menu never notices what they do. An open menu grows to DECK as
 * well: exactly half the screen, whether a tile is open or not.
 *
 * Columns (desktop): an open tile shows a spread of 2 columns (3 on very wide screens).
 * A peeking tile is sized so its content is exactly ONE of those columns. Opening a tile
 * therefore never resizes what you already saw; the next column is simply revealed.
 */
export const DECK_GROW = 10;
export const NAV_GROW = 1;
export const NAV_OPEN_GROW = DECK_GROW;
/** Phones: the menu is a slim bar (its min-height decides), still exactly half the screen when open. */
export const NAV_GROW_MOBILE = 0.2;

/** WebKit does not animate flex-grow to or from exactly 0, so collapsed tiles keep a sliver. */
export const HIDDEN_GROW = 0.00001;
/** Phones: an open row (any value works, the others collapse). */
const MOBILE_OPEN_GROW = 6;

/** Gap between pages, rem. */
const GAP_REM = { desktop: 3, mobile: 1.5 };

/** How an open tile splits into columns (desktop): another column once each can be `min` rem wide. */
export interface Columns {
  min: number;
  cols: [number, number];
}
/** Reading pages: two generous columns, three on very wide screens. */
export const WIDE: Columns = { min: 36, cols: [2, 3] };
/** Project cards: as many as fit at a comfortable card width. */
export const CARDS: Columns = { min: 19, cols: [2, 4] };

/**
 * rest   – browsing, title only
 * peek   – browsing, one column visible (desktop only: featured tile or hovered)
 * active – full screen: it takes the whole deck
 * hidden – another tile is active; collapsed to (almost) nothing
 */
export type TileState = 'rest' | 'peek' | 'active' | 'hidden';

/** Active keeps the peek ratio, so opening only collapses the others: one smooth motion. */
export function tileGrow(state: TileState, open: number): number {
  return { rest: 1, peek: open, active: open, hidden: HIDDEN_GROW }[state];
}

export const DESKTOP = '(width >= 64rem)';
const FINE_POINTER = '(hover: hover) and (pointer: fine)';

const matches = (query: string) => typeof matchMedia !== 'undefined' && matchMedia(query).matches;

@Injectable({ providedIn: 'root' })
export class Viewport {
  readonly width = signal(typeof window === 'undefined' ? 1024 : window.innerWidth);
  readonly desktop = signal(matches(DESKTOP));
  /** Mouse or trackpad: hover previews, the cursor badge and click-anywhere-to-close. */
  readonly fine = matches(FINE_POINTER);
  /** The menu is open or hovered. Browsing tiles then step back and share the rest equally. */
  readonly navOpen = signal(false);
  /** Space a tile spends around its content (title column + padding), px. Reported by the tiles. */
  readonly frame = signal(0);

  private readonly rem =
    typeof document === 'undefined' ? 16 : parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;

  constructor() {
    if (typeof window === 'undefined') return;
    window.addEventListener('resize', () => {
      this.width.set(window.innerWidth);
      this.desktop.set(matches(DESKTOP));
    });
  }

  /** The deck's width with the menu closed. Columns are laid out for this, never for a passing hover. */
  deckWidth() {
    return this.desktop() ? (this.width() * DECK_GROW) / (DECK_GROW + NAV_GROW) : this.width();
  }

  /** Gap between pages, px. */
  readonly gap = computed(() => this.rem * (this.desktop() ? GAP_REM.desktop : GAP_REM.mobile));

  /** Desktop: the columns of an open tile. */
  spread(columns: Columns = WIDE) {
    const gap = this.gap();
    const content = Math.max(1, this.deckWidth() - this.frame());
    const fit = Math.floor((content + gap) / (columns.min * this.rem + gap));
    const cols = Math.max(columns.cols[0], Math.min(columns.cols[1], fit));
    return { cols, col: (content - gap * (cols - 1)) / cols };
  }

  /** Grow of an open tile. Desktop: chosen so a peeking tile's content is exactly one of its columns. */
  openGrow(tiles: number, columns: Columns = WIDE) {
    if (!this.desktop()) return MOBILE_OPEN_GROW;
    const share = (this.spread(columns).col + this.frame()) / this.deckWidth();
    return ((tiles - 1) * share) / Math.max(0.05, 1 - share);
  }
}
