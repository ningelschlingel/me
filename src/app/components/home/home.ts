import { Component, afterNextRender, computed, effect, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { CHAPTERS, LINKEDIN, MAIL, PROJECTS, Project, ROLES, RoleId, STRAVA, roleById } from '../../content';
import { DECK_GROW, Viewport, tileGrow } from '../../layout';
import { RoleState } from '../../role-state';
import { Hero } from '../hero/hero';
import { Charts } from '../charts/charts';
import { Inks } from '../inks/inks';
import { Pico } from '../pico/pico';
import { Pager } from '../pager/pager';
import { Kick } from '../kick/kick';
import { Marks } from '../marks/marks';
import { Sketch } from '../sketch/sketch';
import { Tile, TileState } from '../tile/tile';

/** Tile order; the id doubles as the URL hash for deep links (/#index). */
const TILES = ['me', 'you', 'index', 'ours'] as const;
const FEATURED = 0;
/** Hover intent: a cursor passing through a column doesn't resize the deck. */
const HOVER_IN_MS = 90;
const HOVER_OUT_MS = 220;
const INDEX = TILES.indexOf('index');

@Component({
  selector: 'app-home',
  imports: [Tile, Pager, Hero, Kick, Sketch, Inks, Pico, Charts, Marks, NgTemplateOutlet],
  templateUrl: './home.html',
  styleUrl: './home.css',
  host: {
    '[style.flex-grow]': 'deckGrow',
    '(document:keydown.escape)': 'close()',
    '(window:popstate)': 'readHash()',
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
  readonly desktop = this.viewport.desktop;
  private hoverTimer?: ReturnType<typeof setTimeout>;
  /** The next change of `active` comes from history itself: don't write it back. */
  private popping = false;

  readonly states = computed<TileState[]>(() => {
    const active = this.active();
    if (active !== null) return TILES.map((_, i) => (active === i ? 'active' : 'hidden'));
    // The menu has the stage, or there is no hover (touch): nothing half-opens, all share equally.
    if (this.viewport.navOpen() || !this.viewport.fine) return TILES.map(() => 'rest');
    const peek = this.hovered() ?? FEATURED;
    return TILES.map((_, i) => (peek === i ? 'peek' : 'rest'));
  });
  /** Every tile previews at the same width: one column of its open view. */
  readonly grows = computed(() => {
    const open = this.viewport.openGrow(TILES.length);
    return this.states().map((s) => tileGrow(s, open));
  });
  /** Each tile's final part of the deck, so its pages can be laid out before it gets there. */
  readonly shares = computed(() => {
    const grows = this.grows();
    const total = grows.reduce((a, b) => a + b, 0) || 1;
    return grows.map((g) => g / total);
  });

  constructor() {
    // The first frame is measured and corrected (tile frame, column widths) right after rendering.
    // Transitions stay off until that has settled, so the page appears in place instead of wobbling in.
    afterNextRender(() =>
      requestAnimationFrame(() =>
        requestAnimationFrame(() => (document.documentElement.dataset['ready'] = '')),
      ),
    );

    // The address follows the open tile. Opening one is a step in history, so the back button
    // (Android's, iOS's edge swipe) closes it instead of leaving the site; moving between open
    // tiles replaces that step, and closing one with the header takes the step back.
    let shown = this.active();
    effect(() => {
      const i = this.active();
      const prev = shown;
      shown = i;
      if (this.popping) return void (this.popping = false);
      const base = location.pathname + location.search;
      if (i === null) {
        if (history.state?.tile) history.back();
        else history.replaceState(null, '', base);
      } else if (prev === null && i !== null) {
        history.pushState({ tile: true }, '', `#${TILES[i]}`);
      } else {
        history.replaceState(history.state, '', `#${TILES[i]}`);
      }
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

  /** Back/forward (or an edited hash): the history entry decides what is open. */
  readHash() {
    const next = fromHash();
    if (next === this.active()) return;
    this.popping = true;
    this.active.set(next);
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

  /** A project's number is its place in the whole index: filtering never renumbers. */
  num(project: Project) {
    return String(PROJECTS.indexOf(project) + 1).padStart(2, '0');
  }

  roleLabels(project: Project) {
    return project.roles.map((r) => roleById(r).label).join(' · ');
  }

  roleLabel(role: RoleId) {
    return roleById(role).label;
  }

  pad(n: number) {
    return String(n).padStart(2, '0');
  }

}

function fromHash(): number | null {
  const i = TILES.indexOf(location.hash.slice(1) as (typeof TILES)[number]);
  return i === -1 ? null : i;
}
