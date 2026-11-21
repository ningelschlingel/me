import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Viewport } from '../../layout';
import { Tile } from './tile';

describe('Tile', () => {
  let fixture: ComponentFixture<Tile>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Tile] }).compileComponents();
    fixture = TestBed.createComponent(Tile);
    fixture.componentRef.setInput('tileTitle', 'ME.');
    fixture.componentRef.setInput('state', 'rest');
    await fixture.whenStable();
  });

  it('activates on click while closed, but not from interactive children', () => {
    let activated = 0;
    fixture.componentInstance.activate.subscribe(() => activated++);
    const host = fixture.nativeElement as HTMLElement;
    host.querySelector<HTMLElement>('.title')!.click();
    expect(activated).toBe(1);
    host.querySelector<HTMLElement>('.toggle')!.click(); // the toggle emits once itself
    expect(activated).toBe(2);
  });

  it('desktop: closes again from the toggle, the title bar or any open spot, not from controls', async () => {
    TestBed.inject(Viewport).desktop.set(true);
    fixture.componentRef.setInput('state', 'active');
    await fixture.whenStable();
    let dismissed = 0;
    fixture.componentInstance.dismiss.subscribe(() => dismissed++);
    const host = fixture.nativeElement as HTMLElement;
    host.querySelector<HTMLElement>('.toggle')!.click();
    host.querySelector<HTMLElement>('.title')!.click();
    host.querySelector<HTMLElement>('.body')!.click();
    expect(dismissed).toBe(3);
    const button = document.createElement('button');
    host.querySelector('.body')!.append(button);
    button.click();
    expect(dismissed).toBe(3); // controls do their own thing
  });

  describe('phones', () => {
    /** A finger on `el`: down, (moved `dx` px,) up, and the click the browser makes of it. */
    const tap = (el: HTMLElement, dx = 0) => {
      const touch = (type: string, x: number) =>
        Object.assign(new Event(type, { bubbles: true }), {
          touches: type === 'touchend' ? [] : [{ clientX: x, clientY: 10 }],
          changedTouches: [{ clientX: x, clientY: 10 }],
        });
      el.dispatchEvent(touch('touchstart', 10));
      el.dispatchEvent(touch('touchend', 10 + dx));
      el.click();
    };
    let dismissed: number;
    let host: HTMLElement;

    beforeEach(async () => {
      TestBed.inject(Viewport).desktop.set(false);
      fixture.componentRef.setInput('state', 'active');
      await fixture.whenStable();
      dismissed = 0;
      fixture.componentInstance.dismiss.subscribe(() => dismissed++);
      host = fixture.nativeElement as HTMLElement;
    });
    afterEach(() => vi.restoreAllMocks());

    it('a tap anywhere closes an open tile, and so do the header line and the ×', () => {
      vi.spyOn(performance, 'now').mockReturnValue(performance.now() + 1000);
      tap(host.querySelector<HTMLElement>('.body')!);
      expect(dismissed).toBe(1);
      host.querySelector<HTMLElement>('.line')!.click();
      host.querySelector<HTMLElement>('.toggle')!.click();
      expect(dismissed).toBe(3);
    });

    it('a drag, a control, or the tap that just opened it is not a way out', () => {
      const body = host.querySelector<HTMLElement>('.body')!;
      tap(body); // straight after opening: the second half of a double tap
      expect(dismissed).toBe(0);
      vi.spyOn(performance, 'now').mockReturnValue(performance.now() + 1000);
      tap(body, 30);
      const button = document.createElement('button');
      body.append(button);
      tap(button);
      expect(dismissed).toBe(0);
    });

    it('with the menu open, the first tap only closes the menu', () => {
      vi.spyOn(performance, 'now').mockReturnValue(performance.now() + 1000);
      const viewport = TestBed.inject(Viewport);
      viewport.menu.set(true);
      tap(host.querySelector<HTMLElement>('.body')!);
      expect(viewport.menu()).toBe(false);
      expect(dismissed).toBe(0);
    });
  });

  it('keeps hidden content inert', async () => {
    const body = (fixture.nativeElement as HTMLElement).querySelector('.body')!;
    expect(body.hasAttribute('inert')).toBe(true);
    fixture.componentRef.setInput('state', 'active');
    await fixture.whenStable();
    expect(body.hasAttribute('inert')).toBe(false);
  });
});
