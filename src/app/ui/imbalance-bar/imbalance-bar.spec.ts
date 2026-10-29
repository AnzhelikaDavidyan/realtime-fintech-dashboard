import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { ImbalanceBar } from './imbalance-bar';

@Component({
  imports: [ImbalanceBar],
  template: `<app-imbalance-bar [value]="value()" />`,
})
class Host {
  readonly value = signal<number | null>(0.2);
}

function render(value: number | null) {
  const fixture = TestBed.createComponent(Host);
  fixture.componentInstance.value.set(value);
  fixture.detectChanges();
  const host = fixture.nativeElement.querySelector('app-imbalance-bar') as HTMLElement;
  const fill = host.querySelector('.fill') as HTMLElement | null;
  return { host, fill };
}

describe('ImbalanceBar', () => {
  it('grows right in green for buying pressure (design: +0.20 → 9px of 90px from the centre)', () => {
    const { fill } = render(0.2);
    expect(fill?.classList).toContain('fill--buy');
    // Half the bar is 50%: it starts at the centre and 0.2 × 50% = 10% wide.
    expect(fill?.style.left).toBe('50%');
    expect(fill?.style.width).toBe('10%');
  });

  it('grows left in red for selling pressure', () => {
    const { fill } = render(-0.4);
    expect(fill?.classList).toContain('fill--sell');
    expect(fill?.style.left).toBe('30%');
    expect(fill?.style.width).toBe('20%');
  });

  it('reaches the edge at ±1 and never beyond', () => {
    expect(render(1).fill?.style.width).toBe('50%');
    // -3 is clamped to -1: the whole left half.
    expect(render(-3).fill?.style.left).toBe('0%');
  });

  it('shows no fill for zero or no data', () => {
    expect(render(0).fill).toBeNull();
    expect(render(null).fill).toBeNull();
  });

  it('is hidden from screen readers (the number beside it is read instead)', () => {
    expect(render(0.2).host.getAttribute('aria-hidden')).toBe('true');
  });
});
