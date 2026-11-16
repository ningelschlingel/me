import { Component, computed, input } from '@angular/core';

/**
 * The split-flap board, toned down to its motion: plain, readable type whose letters
 * flip in one after another whenever the text changes. A nod, not a second focal point.
 */
@Component({
  selector: 'app-flap',
  template: `
    <span class="sr-only">{{ text() }}</span>
    <span aria-hidden="true">
      @for (w of words(); track w.key) {
        <span class="word">
          @for (c of w.chars; track $index) {
            <span class="ch" [style.--d]="w.start + $index">{{ c }}</span>
          }
        </span>
        {{ ' ' }}
      }
    </span>
  `,
  styleUrl: './flap.css',
})
export class Flap {
  readonly text = input.required<string>();

  /** Keyed by the whole text, so every change re-creates the letters and replays the flip. */
  readonly words = computed(() => {
    const text = this.text();
    let start = 0;
    return text.split(' ').map((word, i) => {
      const w = { key: `${text}|${i}`, chars: Array.from(word), start };
      start += word.length + 1;
      return w;
    });
  });
}
