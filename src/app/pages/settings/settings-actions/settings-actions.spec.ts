import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { ApplyState } from '../settings-form';
import { SettingsActions } from './settings-actions';

@Component({
  imports: [SettingsActions],
  template: `<form (submit)="$event.preventDefault(); submits = submits + 1">
    <app-settings-actions [state]="state()" (restoreDefaults)="resets = resets + 1" />
  </form>`,
})
class Host {
  readonly state = signal<ApplyState>('unchanged');
  resets = 0;
  submits = 0;
}

async function setup(state: ApplyState) {
  const fixture = TestBed.createComponent(Host);
  fixture.componentInstance.state.set(state);
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  const text = (selector: string) =>
    el.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const apply = () => el.querySelector('button[type="submit"]') as HTMLButtonElement;
  const reset = () => el.querySelector('button[type="button"]') as HTMLButtonElement;
  return { fixture, host: fixture.componentInstance, text, apply, reset };
}

describe('SettingsActions', () => {
  it('offers Apply only when there is something valid to apply', async () => {
    for (const [state, disabled] of [
      ['ready', 'false'],
      ['unchanged', 'true'],
      ['invalid', 'true'],
      ['applying', 'true'],
    ] as const) {
      const { apply } = await setup(state);
      expect(apply().getAttribute('aria-disabled')).toBe(disabled);
    }
  });

  it('explains each state in the note and the tooltip', async () => {
    const { text } = await setup('invalid');
    expect(text('.actions__note')).toBe(
      'Apply is disabled until every field is valid. The running producer is not affected.',
    );
    expect(text('#apply-tooltip')).toBe('Fix the highlighted fields to apply.');
  });

  it('shows progress on Apply and locks Reset while applying', async () => {
    const { apply, reset } = await setup('applying');
    expect(apply().textContent?.trim()).toBe('Applying…');
    expect(apply().querySelector('.spinner')).not.toBeNull();
    expect(apply().classList).toContain('button--busy');
    expect(reset().disabled).toBe(true);
  });

  it('reports Reset to the parent', async () => {
    const { host, reset } = await setup('ready');
    reset().click();
    expect(host.resets).toBe(1);
  });

  // Apply has no click handler of its own: the enclosing form submits it.
  it('submits the enclosing form from Apply', async () => {
    const { host, apply } = await setup('ready');
    apply().click();
    expect(host.submits).toBe(1);
  });
});
