import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { SettingsHelp } from './settings-help';

@Component({
  imports: [SettingsHelp],
  template: `<app-settings-help [activeRun]="activeRun()" [justApplied]="justApplied()" />`,
})
class Host {
  readonly activeRun = signal('Run #3 · 5 instruments · 100 updates every 500 ms');
  readonly justApplied = signal(false);
}

async function setup() {
  const fixture = TestBed.createComponent(Host);
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  const items = () => [...el.querySelectorAll('.help__item')];
  const text = (node: Element) => node.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  return { fixture, el, items, text };
}

describe('SettingsHelp', () => {
  it('is a labelled complementary region', async () => {
    const { el } = await setup();
    expect(el.querySelector('aside')?.getAttribute('aria-label')).toBe('About these settings');
  });

  it('shows the active run and the allowed values', async () => {
    const { items, text } = await setup();
    expect(text(items()[0].querySelector('p')!)).toBe(
      'Run #3 · 5 instruments · 100 updates every 500 ms',
    );
    expect(text(items()[2].querySelector('p')!)).toBe(
      'Whole numbers only. Instruments 1–50 · Updates 1–1,000 · Interval 50–2,000 ms',
    );
  });

  it('highlights only the active run after an apply', async () => {
    const { fixture, items } = await setup();
    expect(items()[0].classList).not.toContain('help__item--fresh');

    fixture.componentInstance.justApplied.set(true);
    await fixture.whenStable();
    expect(items().map((item) => item.classList.contains('help__item--fresh'))).toEqual([
      true,
      false,
      false,
    ]);
  });
});
