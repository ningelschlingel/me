import { TestBed } from '@angular/core/testing';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [App] }).compileComponents();
  });

  it('renders the four tiles and the contact rail', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const titles = Array.from(el.querySelectorAll('app-tile .title')).map((t) => t.textContent?.trim());
    expect(titles).toEqual(['ME.', 'YOU.', 'INDEX.', 'OURS.']);
    expect(el.querySelector('app-nav')).toBeTruthy();
  });
});
