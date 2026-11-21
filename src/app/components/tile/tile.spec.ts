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

  it('phones: closes from the header line only; a tap on a page is not a way out', async () => {
    TestBed.inject(Viewport).desktop.set(false);
    fixture.componentRef.setInput('state', 'active');
    await fixture.whenStable();
    let dismissed = 0;
    fixture.componentInstance.dismiss.subscribe(() => dismissed++);
    const host = fixture.nativeElement as HTMLElement;
    host.querySelector<HTMLElement>('.body')!.click();
    expect(dismissed).toBe(0);
    host.querySelector<HTMLElement>('.line')!.click();
    host.querySelector<HTMLElement>('.toggle')!.click();
    expect(dismissed).toBe(2);
  });

  it('keeps hidden content inert', async () => {
    const body = (fixture.nativeElement as HTMLElement).querySelector('.body')!;
    expect(body.hasAttribute('inert')).toBe(true);
    fixture.componentRef.setInput('state', 'active');
    await fixture.whenStable();
    expect(body.hasAttribute('inert')).toBe(false);
  });
});
