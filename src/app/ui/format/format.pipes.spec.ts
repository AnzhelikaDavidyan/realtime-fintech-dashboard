import { Component, DEFAULT_CURRENCY_CODE, LOCALE_ID, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { ImbalancePipe, PricePipe, VolumePipe } from './format.pipes';

@Component({
  imports: [PricePipe, VolumePipe, ImbalancePipe],
  template: `
    <span id="price">{{ price() | price }}</span>
    <span id="volume">{{ volume() | volume }}</span>
    <span id="imbalance">{{ imbalance() | imbalance }}</span>
  `,
})
class Host {
  readonly price = signal<number | null>(10_200);
  readonly volume = signal<number | null>(1_234_567);
  readonly imbalance = signal<number | null>(-0.35);
}

describe('format pipes in a template', () => {
  function render() {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const text = (id: string) =>
      (fixture.nativeElement as HTMLElement).querySelector(`#${id}`)?.textContent;
    return { fixture, text };
  }

  it('formats price, volume and imbalance', () => {
    const { text } = render();
    expect(text('price')).toBe('$102.00');
    expect(text('volume')).toBe('1,234,567');
    expect(text('imbalance')).toBe('\u22120.35');
  });

  it('shows dashes for values that are not available yet', async () => {
    const { fixture, text } = render();
    fixture.componentInstance.price.set(null);
    fixture.componentInstance.volume.set(null);
    fixture.componentInstance.imbalance.set(null);
    await fixture.whenStable();
    expect([text('price'), text('volume'), text('imbalance')]).toEqual(['—', '—', '—']);
  });

  it('follows the app locale and currency', () => {
    TestBed.configureTestingModule({
      providers: [
        { provide: LOCALE_ID, useValue: 'de-DE' },
        { provide: DEFAULT_CURRENCY_CODE, useValue: 'EUR' },
      ],
    });
    const { text } = render();
    expect(text('price')).toBe('102,00\u00a0€');
    expect(text('volume')).toBe('1.234.567');
    expect(text('imbalance')).toBe('\u22120,35');
  });
});
