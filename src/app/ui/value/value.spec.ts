import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { PricePipe } from '../format/format.pipes';
import { Value } from './value';

@Component({
  imports: [Value, PricePipe],
  template: `<td><app-value [text]="bid() | price" [missingLabel]="label()" /></td>`,
})
class Host {
  readonly bid = signal<number | null>(10_200);
  readonly label = signal('not available');
}

function render() {
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  const cell = fixture.nativeElement.querySelector('td') as HTMLElement;
  return { fixture, cell };
}

/** Text a screen reader would read: everything except aria-hidden parts. */
function accessibleText(element: HTMLElement): string {
  const clone = element.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('[aria-hidden="true"]').forEach((node) => node.remove());
  return clone.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

describe('Value', () => {
  it('shows a formatted value as plain text', () => {
    const { cell } = render();
    expect(cell.textContent?.trim()).toBe('$102.00');
    expect(cell.querySelector('[aria-hidden]')).toBeNull();
  });

  it('shows a dash visually but announces "not available"', async () => {
    const { fixture, cell } = render();
    fixture.componentInstance.bid.set(null);
    await fixture.whenStable();

    const dash = cell.querySelector('[aria-hidden="true"]');
    expect(dash?.textContent).toBe('—');
    expect(cell.querySelector('.visually-hidden')?.textContent).toBe('not available');
    expect(accessibleText(cell)).toBe('not available');
  });

  it('uses a custom label for screen readers', async () => {
    const { fixture, cell } = render();
    fixture.componentInstance.bid.set(null);
    fixture.componentInstance.label.set('no trades yet');
    await fixture.whenStable();
    expect(accessibleText(cell)).toBe('no trades yet');
  });

  it('switches back to the value when it arrives', async () => {
    const { fixture, cell } = render();
    fixture.componentInstance.bid.set(null);
    await fixture.whenStable();
    fixture.componentInstance.bid.set(10_150);
    await fixture.whenStable();
    expect(accessibleText(cell)).toBe('$101.50');
  });
});
