import { TestBed } from '@angular/core/testing';

import { DEFAULT_PRODUCER_SETTINGS } from '../../core/producer-settings';
import { ProducerService } from '../../state/producer.service';
import {
  FakeProducerWorker,
  provideFakeProducerWorker,
} from '../../state/testing/fake-producer-worker';
import { Settings } from './settings';

function setup() {
  const workers: FakeProducerWorker[] = [];
  TestBed.configureTestingModule({ providers: [provideFakeProducerWorker(workers)] });
  const fixture = TestBed.createComponent(Settings);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const producer = TestBed.inject(ProducerService);

  const text = (node: Element | null) => node?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const input = (key: string) => el.querySelector(`#setting-${key}`) as HTMLInputElement;
  const wrapper = (key: string) => input(key).closest('.input') as HTMLElement;
  const error = (key: string) => text(el.querySelector(`#setting-${key}-error`));
  const apply = () => el.querySelector('button[type="submit"]') as HTMLButtonElement;
  const reset = () => el.querySelector('button[type="button"]') as HTMLButtonElement;

  /** Types a value as a person would: input, then leave the field. */
  async function type(key: string, value: string) {
    const field = input(key);
    field.value = value;
    field.dispatchEvent(new Event('input'));
    field.dispatchEvent(new Event('blur'));
    await fixture.whenStable();
  }
  /** Commands sent after the default run started (init + start). */
  const sent = () => workers.at(-1)!.sent.slice(2);
  return { fixture, el, producer, text, input, wrapper, error, apply, reset, type, sent };
}

describe('Settings page', () => {
  describe('default state', () => {
    it('shows the active settings with their allowed ranges', () => {
      const { input, text, el } = setup();
      expect(input('instruments').value).toBe('5');
      expect(input('updatesPerBatch').value).toBe('100');
      expect(input('batchIntervalMs').value).toBe('500');
      expect([...el.querySelectorAll('.input__range')].map(text)).toEqual([
        '1–50',
        '1–1,000',
        'ms · 50–2,000',
      ]);
    });

    it('shows the nominal rate hint', () => {
      const { el, text } = setup();
      expect(text(el.querySelector('.rate'))).toBe(
        'Nominal rate: 200 updates / second across all instruments (100 × 1000 / 500)',
      );
    });

    it('disables Apply while the form matches the active run', () => {
      const { apply, el, text } = setup();
      expect(apply().disabled).toBe(true);
      expect(text(el.querySelector('.actions__note'))).toBe(
        'Form matches the active run — nothing to apply yet.',
      );
    });

    it('describes the active run', () => {
      const { el, text } = setup();
      expect(text(el.querySelector('.help__item p'))).toBe(
        'Run #1 · 5 instruments · 100 updates every 500 ms',
      );
    });
  });

  describe('editing', () => {
    it('marks changed fields, updates the rate and enables Apply', async () => {
      const { type, wrapper, apply, el, text } = setup();
      await type('instruments', '20');
      await type('updatesPerBatch', '1000');
      await type('batchIntervalMs', '50');

      expect(wrapper('instruments').classList).toContain('input--changed');
      expect(text(el.querySelector('.rate'))).toContain('20,000 updates / second');
      expect(text(el.querySelector('.rate'))).toContain('(1000 × 1000 / 50)');
      expect(apply().disabled).toBe(false);
      expect(text(el.querySelector('.actions__note'))).toBe(
        'Apply resets all totals and starts a new run (it also resumes if paused).',
      );
    });

    it('goes back to "nothing to apply" when the original value is typed again', async () => {
      const { type, apply, wrapper } = setup();
      await type('instruments', '6');
      await type('instruments', '5');
      expect(apply().disabled).toBe(true);
      expect(wrapper('instruments').classList).not.toContain('input--changed');
    });
  });

  describe('validation', () => {
    it('shows the design’s messages and links them to the inputs', async () => {
      const { type, error, input, wrapper } = setup();
      await type('instruments', '0');
      await type('updatesPerBatch', '12.5');
      await type('batchIntervalMs', '');

      expect(error('instruments')).toBe('Must be between 1 and 50.');
      expect(error('updatesPerBatch')).toBe('Must be a whole number.');
      expect(error('batchIntervalMs')).toBe('Required.');
      expect(wrapper('instruments').classList).toContain('input--invalid');
      expect(input('instruments').getAttribute('aria-invalid')).toBe('true');
      expect(input('instruments').getAttribute('aria-describedby')).toContain(
        'setting-instruments-error',
      );
    });

    it('disables Apply, hides the rate and explains why', async () => {
      const { type, apply, el, text } = setup();
      await type('instruments', '0');
      expect(apply().disabled).toBe(true);
      expect(text(el.querySelector('.rate'))).toBe(
        'Nominal rate: — (fix the errors to see the rate)',
      );
      expect(text(el.querySelector('.actions__note'))).toBe(
        'Apply is disabled until every field is valid. The running producer is not affected.',
      );
    });

    it('shows no errors for the starting values (the active run is always valid)', () => {
      const { el } = setup();
      expect(el.querySelectorAll('.field__error')).toHaveLength(0);
    });
  });

  describe('apply', () => {
    it('starts a new run with the form values, keeping the seed', async () => {
      const { type, apply, producer, sent, fixture } = setup();
      await type('instruments', '20');
      apply().click();
      await fixture.whenStable();

      expect(producer.runId()).toBe(2);
      expect(producer.activeSettings()).toEqual({ ...DEFAULT_PRODUCER_SETTINGS, instruments: 20 });
      expect(sent()).toEqual([
        { type: 'init', settings: { ...DEFAULT_PRODUCER_SETTINGS, instruments: 20 } },
        { type: 'start', runId: 2 },
      ]);
    });

    it('then shows the form as matching the new run', async () => {
      const { type, apply, el, text, fixture, wrapper } = setup();
      await type('instruments', '20');
      apply().click();
      await fixture.whenStable();

      expect(apply().disabled).toBe(true);
      expect(wrapper('instruments').classList).not.toContain('input--changed');
      expect(text(el.querySelector('.help__item p'))).toBe(
        'Run #2 · 20 instruments · 100 updates every 500 ms',
      );
    });

    it('does nothing while the form is invalid, even if submitted', async () => {
      const { type, producer, el, fixture } = setup();
      await type('instruments', '0');
      el.querySelector('form')!.dispatchEvent(new Event('submit'));
      await fixture.whenStable();
      expect(producer.runId()).toBe(1);
    });
  });

  describe('reset to defaults', () => {
    it('restores the default values without applying them', async () => {
      const { producer } = setup();
      producer.apply({ instruments: 30, updatesPerBatch: 7, batchIntervalMs: 900 });

      // A page opened while a run with non-default settings is active.
      const page = TestBed.createComponent(Settings);
      page.detectChanges();
      const el = page.nativeElement as HTMLElement;
      const field = (key: string) => el.querySelector(`#setting-${key}`) as HTMLInputElement;
      expect(field('instruments').value).toBe('30');

      (el.querySelector('button[type="button"]') as HTMLButtonElement).click();
      await page.whenStable();

      expect(field('instruments').value).toBe('5');
      expect(field('updatesPerBatch').value).toBe('100');
      expect(field('batchIntervalMs').value).toBe('500');
      expect(producer.runId()).toBe(2);
      expect((el.querySelector('button[type="submit"]') as HTMLButtonElement).disabled).toBe(false);
    });

    it('clears validation errors', async () => {
      const { type, reset, error, fixture } = setup();
      await type('instruments', '0');
      reset().click();
      await fixture.whenStable();
      expect(error('instruments')).toBe('');
    });
  });
});
