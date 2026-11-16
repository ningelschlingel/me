import { Component, afterRenderEffect, computed, effect, inject, signal } from '@angular/core';
import { CHAPTERS, LINKEDIN, MAIL, PROJECTS, Project, ROLES, RoleId, STRAVA, roleById } from '../../content';
import { CARDS, Columns, DECK_GROW, Viewport, WIDE, tileGrow } from '../../layout';
import { RoleState } from '../../role-state';
import { Hero } from '../hero/hero';
import { Pager } from '../pager/pager';
import { Kick } from '../kick/kick';
import { Marks } from '../marks/marks';
import { Sketch } from '../sketch/sketch';
import { Tags } from '../tags/tags';
import { Tile, TileState } from '../tile/tile';

/** Tile order; the id doubles as the URL hash for deep links (/#index). */
const TILES = ['me', 'you', 'index', 'ours'] as const;
const FEATURED = 0;
/** Hover intent: a cursor passing through a column doesn't resize the deck. */
const HOVER_IN_MS = 90;
const HOVER_OUT_MS = 220;
const INDEX = TILES.indexOf('index');
/** Reading pages get wide columns, the project index gets cards. */
const COLUMNS: Columns[] = TILES.map((id) => (id === 'index' ? CARDS : WIDE));

@Component({
  selector: 'app-home',
  imports: [Tile, Pager, Hero, Kick, Sketch, Marks, Tags],
  templateUrl: './home.html',
  styleUrl: './home.css',
  host: {
    '[style.flex-grow]': 'deckGrow',
    '(document:keydown.escape)': 'close()',
    '(window:hashchange)': 'readHash()',
  },
})
export class Home {
  readonly roles = ROLES;
  readonly mail = MAIL;
  readonly linkedin = LINKEDIN;
  readonly strava = STRAVA;
  protected readonly deckGrow = DECK_GROW;
  readonly chapters = CHAPTERS;

  readonly selected = inject(RoleState).selected;
  readonly projects = computed(() => {
    const role = this.selected();
    return role ? PROJECTS.filter((p) => p.roles.includes(role)) : PROJECTS;
  });

  readonly active = signal<number | null>(fromHash());
  private readonly hovered = signal<number | null>(null);
  private readonly viewport = inject(Viewport);
  private hoverTimer?: ReturnType<typeof setTimeout>;

  readonly states = computed<TileState[]>(() => {
    const active = this.active();
    if (active !== null) return TILES.map((_, i) => (active === i ? 'active' : 'hidden'));
    // The menu has the stage, or there is no hover (touch): nothing half-opens, all share equally.
    if (this.viewport.navOpen() || !this.viewport.fine) return TILES.map(() => 'rest');
    const peek = this.hovered() ?? FEATURED;
    return TILES.map((_, i) => (peek === i ? 'peek' : 'rest'));
  });
  /** Every tile previews at the same width (one reading column), whatever its open view holds. */
  readonly grows = computed(() => {
    const open = this.viewport.openGrow(TILES.length, WIDE);
    return this.states().map((s) => tileGrow(s, open));
  });
  /** Each tile's final part of the deck, so its pages can be laid out before it gets there. */
  readonly shares = computed(() => {
    const grows = this.grows();
    const total = grows.reduce((a, b) => a + b, 0) || 1;
    return grows.map((g) => g / total);
  });

  constructor() {
    // The colour behind the browser's top bar follows the tile at the top of the screen.
    afterRenderEffect(() => {
      const open = this.active();
      const tiles = document.querySelectorAll('app-tile');
      const top = tiles[open ?? 0];
      if (top) document.documentElement.style.setProperty('--top', getComputedStyle(top).backgroundColor);
    });

    effect(() => {
      const i = this.active();
      const url = i === null ? location.pathname + location.search : `#${TILES[i]}`;
      history.replaceState(history.state, '', url);
    });
  }

  state(i: number): TileState {
    return this.states()[i];
  }

  share(i: number) {
    return this.shares()[i];
  }

  grow(i: number) {
    return this.grows()[i];
  }

  columns(i: number) {
    return COLUMNS[i];
  }

  open(i: number) {
    this.active.set(i);
  }

  /** Phones: step to the neighbouring tile from an open one. */
  step(i: number, dir: 1 | -1) {
    const next = i + dir;
    if (next >= 0 && next < TILES.length) this.open(next);
  }

  close() {
    this.active.set(null);
  }

  readHash() {
    this.active.set(fromHash());
  }

  hover(i: number, on: boolean) {
    if (!this.viewport.fine) return;
    clearTimeout(this.hoverTimer);
    this.hoverTimer = setTimeout(
      () => this.hovered.update((h) => (on ? i : h === i ? null : h)),
      on ? HOVER_IN_MS : HOVER_OUT_MS,
    );
  }

  /** Jump from a claim to the projects that back it up. */
  proof(role: RoleId) {
    this.selected.set(role);
    this.open(INDEX);
  }

  projectsFor(role: RoleId) {
    return PROJECTS.filter((p) => p.roles.includes(role));
  }

  num(i: number) {
    return String(i + 1).padStart(2, '0');
  }

  roleLabels(project: Project) {
    return project.roles.map((r) => roleById(r).label).join(' · ');
  }

}

function fromHash(): number | null {
  const i = TILES.indexOf(location.hash.slice(1) as (typeof TILES)[number]);
  return i === -1 ? null : i;
}
