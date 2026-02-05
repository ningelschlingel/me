import { Component, input, output } from '@angular/core';

@Component({
  selector: 'app-tile',
  imports: [],
  templateUrl: './tile.html',
  styleUrl: './tile.css',
  host: {
  '[attr.data-status]': 'status()',
  'class': `
    min-w-0 grow basis-0 overflow-hidden transition-all duration-700
    data-[status=active]:grow-12
    data-[status=hidden]:grow-0
    data-[status=hidden]:basis-0
    data-[status=idle]:hover:lg:grow-5
    transition-all duration-700
    ease-[cubic-bezier(0.23,1,0.32,1)] 
  `
}
})
export class Tile {
  status = input.required<'active' | 'idle' | 'hidden'>();
  tileTitle = input.required<string>();
  tileSubtitle = input.required<string>();
  bgColor = input<string>('#18181b');

  select = output<void>();
}