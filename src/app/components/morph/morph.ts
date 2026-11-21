import {
  Component,
  ElementRef,
  afterNextRender,
  effect,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { Persona } from '../../content';
import { renderPortraits } from './portrait';

const PHOTO = 'me.jpg';
const SLICES = 10;
const BURST_COLORS = ['#fbbf24', '#4f46e5', '#ec4899', '#5eead4', '#1e40af', '#fafaf9'];

/**
 * The portrait that "apparates" between personas: the current one twists away
 * in slices, a blocky burst cracks, and the next one twists in.
 */
@Component({
  selector: 'app-morph',
  templateUrl: './morph.html',
  styleUrl: './morph.css',
})
export class Morph {
  readonly persona = input.required<Persona>();
  /** Fires at the moment of the "crack", so a parent can react (shake, sound, …). */
  readonly crack = output<void>();

  readonly slices = Array.from({ length: SLICES }, (_, i) => ({
    top: `${(i * 100) / SLICES}%`,
    pos: `0 ${(i / (SLICES - 1)) * 100}%`,
  }));
  readonly burst = Array.from({ length: 16 }, (_, i) => BURST_COLORS[i % BURST_COLORS.length]);

  private readonly img = viewChild.required<ElementRef<HTMLImageElement>>('img');
  private readonly stage = viewChild.required<ElementRef<HTMLElement>>('stage');
  private readonly sparks = viewChild.required<ElementRef<HTMLElement>>('sparks');
  private readonly flash = viewChild.required<ElementRef<HTMLElement>>('flash');

  private readonly srcs = signal<Partial<Record<Persona, string>>>({});
  private shown: Persona = 'jan';
  private pending: Persona = 'jan';
  private running = false;

  constructor() {
    afterNextRender(() => {
      renderPortraits(PHOTO)
        .then((srcs) => this.srcs.set(srcs))
        .catch(() => {}); // no canvas → every persona stays the photo
    });

    effect(() => {
      const target = this.persona();
      this.srcs(); // re-run once the styles exist
      untracked(() => this.run(target));
    });
  }

  private src(p: Persona) {
    return this.srcs()[p] ?? PHOTO;
  }

  /** Plays transitions until the displayed persona matches the latest request. */
  private async run(target: Persona) {
    this.pending = target;
    if (this.running) return;
    this.running = true;
    try {
      while (this.pending !== this.shown) {
        const next = this.pending;
        await this.apparate(this.shown, next).catch(() => {
          this.img().nativeElement.style.visibility = '';
          this.stage().nativeElement.style.visibility = '';
        });
        this.shown = next;
      }
      // Styles may have finished rendering after the last switch: show the real one.
      const img = this.img().nativeElement;
      if (img.getAttribute('src') !== this.src(this.shown)) img.src = this.src(this.shown);
    } finally {
      this.running = false;
    }
  }

  private async apparate(from: Persona, to: Persona) {
    const img = this.img().nativeElement;
    const stage = this.stage().nativeElement;
    const slices = Array.from(stage.children) as HTMLElement[];

    if (!canAnimate()) {
      img.src = this.src(to);
      return;
    }

    const paint = (p: Persona) => slices.forEach((s) => (s.style.backgroundImage = `url("${this.src(p)}")`));
    const twist = (i: number, sign: number) =>
      `perspective(700px) rotateY(${sign * (i % 2 ? 1 : -1) * (90 + i * 14)}deg) scaleX(0.08)`;
    const warped = 'rotate(-14deg) scale(0.82, 1.18)';
    const glare = 'brightness(1.9) contrast(1.4)';

    paint(from);
    stage.style.visibility = 'visible';
    img.style.visibility = 'hidden';
    img.src = this.src(to);

    // 1 – twist away
    const out = slices.map((s, i) =>
      s.animate([{ transform: 'none' }, { transform: twist(i, 1) }], {
        duration: 360,
        delay: i * 22,
        easing: 'cubic-bezier(.7,0,.84,0)',
        fill: 'forwards',
      }),
    );
    await stage.animate([{ transform: 'none', filter: 'none' }, { transform: warped, filter: glare }], {
      duration: 360 + SLICES * 22,
      easing: 'cubic-bezier(.7,0,.84,0)',
      fill: 'forwards',
    }).finished;

    // 2 – crack
    this.pop(stage.clientWidth);
    paint(to);

    // 3 – twist in
    const inn = slices.map((s, i) =>
      s.animate([{ transform: twist(SLICES - i, -1) }, { transform: 'none' }], {
        duration: 640,
        delay: Math.abs(i - (SLICES - 1) / 2) * 30,
        easing: 'cubic-bezier(.16,1,.3,1)',
        fill: 'forwards',
      }),
    );
    out.forEach((a) => a.cancel());
    const settle = stage.animate(
      [{ transform: warped.replace('-14', '14'), filter: glare }, { transform: 'none', filter: 'none' }],
      { duration: 640 + SLICES * 15, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'forwards' },
    );
    await Promise.all([settle.finished, ...inn.map((a) => a.finished)]);
    await img.decode().catch(() => {});

    img.style.visibility = '';
    stage.style.visibility = '';
    [settle, ...inn].forEach((a) => a.cancel());
  }

  /** Blocky particles + flash: the "crack" of apparating. */
  private pop(size: number) {
    this.crack.emit();
    this.flash().nativeElement.animate([{ opacity: 0.9 }, { opacity: 0 }], { duration: 380, easing: 'ease-out' });
    const sparks = Array.from(this.sparks().nativeElement.children) as HTMLElement[];
    sparks.forEach((el, i) => {
      const angle = (i / sparks.length) * Math.PI * 2 + Math.random() * 0.4;
      const dist = size * (0.35 + Math.random() * 0.3);
      const px = 6 + Math.random() * 12;
      el.style.width = el.style.height = `${px}px`;
      el.animate(
        [
          { transform: 'translate(-50%,-50%) rotate(0) scale(1)', opacity: 1 },
          {
            transform: `translate(calc(-50% + ${Math.cos(angle) * dist}px), calc(-50% + ${Math.sin(angle) * dist}px)) rotate(${Math.random() * 360}deg) scale(0)`,
            opacity: 1,
          },
        ],
        { duration: 600 + Math.random() * 250, easing: 'cubic-bezier(.16,1,.3,1)' },
      );
    });
  }
}

const canAnimate = () =>
  typeof Element.prototype.animate === 'function' &&
  !(typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches);
