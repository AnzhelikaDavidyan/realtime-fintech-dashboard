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
  it('grows right in green for buying pressure (design: +0.20 → 9px from the centre)', () => {
    const { fill } = render(0.2);
    expect(fill?.classList).toContain('fill--buy');
    // Half the bar is 45px: it starts at the centre (45px) and 0.2 × 45 = 9px wide.
    expect(fill?.style.left).toBe('45px');
    expect(fill?.style.width).toBe('9px');
  });

  it('grows left in red for selling pressure', () => {
    const { fill } = render(-0.4);
    expect(fill?.classList).toContain('fill--sell');
    expect(fill?.style.left).toBe('27px');
    expect(fill?.style.width).toBe('18px');
  });

  it('reaches the edge at ±1 and never beyond', () => {
    expect(render(1).fill?.style.width).toBe('45px');
    // -3 is clamped to -1: the whole left half.
    expect(render(-3).fill?.style.left).toBe('0px');
  });

  it('shows no fill for zero or no data', () => {
    expect(render(0).fill).toBeNull();
    expect(render(null).fill).toBeNull();
  });

  it('is hidden from screen readers (the number beside it is read instead)', () => {
    expect(render(0.2).host.getAttribute('aria-hidden')).toBe('true');
  });
});
