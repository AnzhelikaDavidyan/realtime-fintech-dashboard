import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { Tooltip } from './tooltip';

@Component({
  imports: [Tooltip],
  template: `<app-tooltip tooltipId="tip" text="Explains the button">
    <button type="button" aria-describedby="tip">Go</button>
  </app-tooltip>`,
})
class Host {}

async function setup() {
  const fixture = TestBed.createComponent(Host);
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  const host = el.querySelector('app-tooltip')!;
  const tip = () => el.querySelector('[role="tooltip"]')!;
  return { fixture, el, host, tip };
}

describe('Tooltip', () => {
  it('renders the text with the id the control refers to', async () => {
    const { el, tip } = await setup();
    expect(tip().textContent?.trim()).toBe('Explains the button');
    expect(tip().id).toBe('tip');
    expect(el.querySelector('button')!.getAttribute('aria-describedby')).toBe('tip');
  });

  it('is hidden with Escape until the pointer leaves', async () => {
    const { fixture, host, tip } = await setup();
    host
      .querySelector('button')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await fixture.whenStable();
    expect(tip().classList).toContain('tooltip--dismissed');

    host.dispatchEvent(new Event('mouseleave'));
    await fixture.whenStable();
    expect(tip().classList).not.toContain('tooltip--dismissed');
  });

  it('comes back once focus leaves', async () => {
    const { fixture, host, tip } = await setup();
    host.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await fixture.whenStable();
    host.dispatchEvent(new FocusEvent('focusout'));
    await fixture.whenStable();
    expect(tip().classList).not.toContain('tooltip--dismissed');
  });
});
