import { TestBed } from '@angular/core/testing';

import { DEFAULT_PRODUCER_SETTINGS, PRODUCER_SETTINGS_LIMITS } from '../../core/producer-settings';
import { ProducerService } from '../../state/producer.service';
import {
  FakeProducerWorker,
  provideFakeProducerWorker,
} from '../../state/testing/fake-producer-worker';
import { Notifications } from '../../ui/toast/notifications';
import { Settings } from './settings';
import { MIN_APPLYING_MS } from './settings-apply';
import { EDITABLE_KEYS } from './settings-form';

const RANGE_MESSAGES = {
  instrumentCount: 'Must be between 1 and 50.',
  updatesPerBatch: 'Must be between 1 and 1,000.',
  batchIntervalMs: 'Must be between 50 and 2,000.',
};

/** Every kind of invalid value, for every field, with the message it should show. */
const INVALID_VALUES = EDITABLE_KEYS.flatMap((key) => {
  const { min, max } = PRODUCER_SETTINGS_LIMITS[key];
  return [
    { key, kind: 'empty', value: '', message: 'Required.' },
    // min + 0.5 is inside the range, so only the whole-number rule fails.
    { key, kind: 'decimal', value: `${min + 0.5}`, message: 'Must be a whole number.' },
    { key, kind: 'below the minimum', value: `${min - 1}`, message: RANGE_MESSAGES[key] },
    { key, kind: 'above the maximum', value: `${max + 1}`, message: RANGE_MESSAGES[key] },
  ];
});

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
  /** Apply stays focusable for its tooltip, so "disabled" is `aria-disabled`. */
  const applyDisabled = () => apply().getAttribute('aria-disabled') === 'true';

  /** Types a value as a person would: input, then leave the field. */
  async function type(key: string, value: string) {
    const field = input(key);
    field.value = value;
    field.dispatchEvent(new Event('input'));
    field.dispatchEvent(new Event('blur'));
    await fixture.whenStable();
  }
  const worker = () => workers.at(-1)!;
  /** Commands sent after the default run started (init + start). */
  const sent = () => worker().sent.slice(2);
  return {
    fixture,
    el,
    producer,
    text,
    input,
    wrapper,
    error,
    apply,
    applyDisabled,
    reset,
    type,
    worker,
    workers,
    sent,
  };
}

describe('Settings page', () => {
  describe('default state', () => {
    it('shows the active settings with their allowed ranges', () => {
      const { input, text, el } = setup();
      expect(input('instrumentCount').value).toBe('5');
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
      const { el, text, applyDisabled } = setup();
      expect(applyDisabled()).toBe(true);
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
      const { type, wrapper, el, text, applyDisabled } = setup();
      await type('instrumentCount', '20');
      await type('updatesPerBatch', '1000');
      await type('batchIntervalMs', '50');

      expect(wrapper('instrumentCount').classList).toContain('input--changed');
      expect(text(el.querySelector('.rate'))).toContain('20,000 updates / second');
      expect(text(el.querySelector('.rate'))).toContain('(1000 × 1000 / 50)');
      expect(applyDisabled()).toBe(false);
      expect(text(el.querySelector('.actions__note'))).toBe(
        'Apply resets all totals and starts a new run (it also resumes if paused).',
      );
    });

    it('goes back to "nothing to apply" when the original value is typed again', async () => {
      const { type, wrapper, applyDisabled } = setup();
      await type('instrumentCount', '6');
      await type('instrumentCount', '5');
      expect(applyDisabled()).toBe(true);
      expect(wrapper('instrumentCount').classList).not.toContain('input--changed');
    });
  });

  describe('validation', () => {
    it('highlights the field and links the message to the input', async () => {
      const { type, input, wrapper } = setup();
      await type('instrumentCount', '0');

      expect(wrapper('instrumentCount').classList).toContain('input--invalid');
      expect(input('instrumentCount').getAttribute('aria-describedby')).toContain(
        'setting-instrumentCount-error',
      );
    });

    it('disables Apply, hides the rate and explains why', async () => {
      const { type, el, text, applyDisabled } = setup();
      await type('instrumentCount', '0');
      expect(applyDisabled()).toBe(true);
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
    it('shows the form as matching the new run afterwards', async () => {
      const { type, apply, el, text, fixture, wrapper, applyDisabled } = setup();
      await type('instrumentCount', '20');
      apply().click();
      await fixture.whenStable();

      expect(applyDisabled()).toBe(true);
      expect(wrapper('instrumentCount').classList).not.toContain('input--changed');
      expect(text(el.querySelector('.help__item p'))).toBe(
        'Run #2 · 20 instruments · 100 updates every 500 ms',
      );
    });

    it('does nothing while the form is invalid, even if submitted', async () => {
      const { type, producer, el, fixture } = setup();
      await type('instrumentCount', '0');
      // Submitting the form directly skips the button, so the form itself must refuse.
      el.querySelector('form')!.dispatchEvent(new Event('submit'));
      await fixture.whenStable();
      expect(producer.runId()).toBe(1);
    });
  });

  describe('reset to defaults', () => {
    it('restores the default values without applying them', async () => {
      const { producer } = setup();
      producer.apply({ instrumentCount: 30, updatesPerBatch: 7, batchIntervalMs: 900 });

      // A page opened while a run with non-default settings is active.
      const page = TestBed.createComponent(Settings);
      page.detectChanges();
      const el = page.nativeElement as HTMLElement;
      const field = (key: string) => el.querySelector(`#setting-${key}`) as HTMLInputElement;
      expect(field('instrumentCount').value).toBe('30');

      (el.querySelector('button[type="button"]') as HTMLButtonElement).click();
      await page.whenStable();

      expect(field('instrumentCount').value).toBe('5');
      expect(field('updatesPerBatch').value).toBe('100');
      expect(field('batchIntervalMs').value).toBe('500');
      // Still run 2 (the apply above): Reset only fills the form. Apply is now available, as the defaults differ from the run.
      expect(producer.runId()).toBe(2);
      expect(
        (el.querySelector('button[type="submit"]') as HTMLButtonElement).getAttribute(
          'aria-disabled',
        ),
      ).toBe('false');
    });

    it('clears validation errors', async () => {
      const { type, reset, error, fixture } = setup();
      await type('instrumentCount', '0');
      reset().click();
      await fixture.whenStable();
      expect(error('instrumentCount')).toBe('');
    });
  });

  describe('invalid values', () => {
    it.each(INVALID_VALUES)(
      '$key: $kind ("$value") shows "$message" and disables Apply',
      async ({ key, value, message }) => {
        const { type, error, input, applyDisabled } = setup();
        await type(key, value);

        expect(error(key)).toBe(message);
        expect(input(key).getAttribute('aria-invalid')).toBe('true');
        expect(applyDisabled()).toBe(true);
      },
    );

    it.each(EDITABLE_KEYS)('%s: both ends of the range are valid', async (key) => {
      const { type, error, applyDisabled } = setup();
      const { min, max } = PRODUCER_SETTINGS_LIMITS[key];
      for (const value of [min, max]) {
        await type(key, `${value}`);
        expect(error(key)).toBe('');
        expect(applyDisabled()).toBe(false);
      }
    });

    it('keeps Apply disabled while any one field is invalid', async () => {
      const { type, applyDisabled } = setup();
      await type('instrumentCount', '20');
      await type('batchIntervalMs', '49');
      expect(applyDisabled()).toBe(true);
      await type('batchIntervalMs', '50');
      expect(applyDisabled()).toBe(false);
    });
  });

  describe('editing does not affect the producer', () => {
    it.each([
      ['valid', { instrumentCount: '20', updatesPerBatch: '1000', batchIntervalMs: '50' }],
      ['invalid', { instrumentCount: '', updatesPerBatch: '12.5', batchIntervalMs: '2001' }],
    ])('%s edits send nothing and keep the active run', async (_, values) => {
      const { type, producer, worker, sent } = setup();
      worker().emit({ type: 'status', status: 'running' });
      for (const [key, value] of Object.entries(values)) {
        await type(key, value);
      }

      expect(sent()).toEqual([]);
      expect(producer.runId()).toBe(1);
      expect(producer.activeSettings()).toEqual(DEFAULT_PRODUCER_SETTINGS);
      expect(producer.status()).toBe('running');
    });

    it('Reset to defaults sends nothing either', async () => {
      const { type, reset, sent, fixture } = setup();
      await type('instrumentCount', '20');
      reset().click();
      await fixture.whenStable();
      expect(sent()).toEqual([]);
    });
  });

  describe('Apply sends the new settings', () => {
    const edited = { instrumentCount: 20, updatesPerBatch: 1000, batchIntervalMs: 50 };

    async function editAll(type: (key: string, value: string) => Promise<void>) {
      for (const [key, value] of Object.entries(edited)) {
        await type(key, `${value}`);
      }
    }

    it('sends init with every edited field and the kept seed, then starts the next run', async () => {
      const { type, apply, producer, sent, fixture } = setup();
      producer.apply({ ...DEFAULT_PRODUCER_SETTINGS, seed: 7 });
      const before = producer.runId();
      await editAll(type);
      const sentBefore = sent().length;

      apply().click();
      await fixture.whenStable();

      const expected = { seed: 7, ...edited };
      expect(sent().slice(sentBefore)).toEqual([
        { type: 'init', settings: expected },
        { type: 'start', runId: before + 1 },
      ]);
      expect(producer.runId()).toBe(before + 1);
      expect(producer.activeSettings()).toEqual(expected);
    });

    it('also works by submitting the form (Enter key)', async () => {
      const { type, el, sent, fixture } = setup();
      await editAll(type);
      el.querySelector('form')!.dispatchEvent(new Event('submit'));
      await fixture.whenStable();
      expect(sent()).toEqual([
        { type: 'init', settings: { ...DEFAULT_PRODUCER_SETTINGS, ...edited } },
        { type: 'start', runId: 2 },
      ]);
    });

    it('starts a new run while paused', async () => {
      const { type, apply, worker, producer, sent, fixture } = setup();
      worker().emit({ type: 'status', status: 'paused' });
      await editAll(type);
      apply().click();
      await fixture.whenStable();
      expect(sent().map((command) => command.type)).toEqual(['init', 'start']);
      expect(producer.runId()).toBe(2);
    });

    it('sends nothing when clicked again with no further edits', async () => {
      const { type, apply, sent, fixture } = setup();
      await editAll(type);
      apply().click();
      await fixture.whenStable();
      apply().click();
      await fixture.whenStable();
      // One init + one start: the second click found nothing to apply.
      expect(sent()).toHaveLength(2);
    });
  });

  describe('Apply button', () => {
    const tooltip = (el: HTMLElement) => el.querySelector('#apply-tooltip')?.textContent?.trim();

    it('is labelled Apply and described by its tooltip', () => {
      const { apply } = setup();
      expect(apply().textContent?.trim()).toBe('Apply');
      expect(apply().getAttribute('aria-describedby')).toBe('apply-tooltip');
    });

    it('explains that there is nothing to apply yet', () => {
      const { el } = setup();
      expect(tooltip(el)).toBe('Nothing to apply yet. Change a value to enable Apply.');
    });

    it('asks to fix the fields while one is invalid', async () => {
      const { el, type } = setup();
      await type('instrumentCount', '0');
      expect(tooltip(el)).toBe('Fix the highlighted fields to apply.');
    });

    it('says what Apply will do once there is something to apply', async () => {
      const { el, type } = setup();
      await type('instrumentCount', '20');
      expect(tooltip(el)).toBe(
        'Restarts the producer with these settings. All totals reset to zero.',
      );
    });

    it('stays focusable while unavailable, so the tooltip can be reached by keyboard', () => {
      const { apply } = setup();
      expect(apply().disabled).toBe(false);
      expect(apply().getAttribute('aria-disabled')).toBe('true');
    });
  });

  describe('while applying', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    /** Fake timers hold back `whenStable`, so render directly. */
    function startApplying() {
      const page = setup();
      const field = page.input('instrumentCount');
      field.value = '20';
      field.dispatchEvent(new Event('input'));
      page.fixture.detectChanges();
      page.apply().click();
      page.fixture.detectChanges();
      return page;
    }

    const render = (fixture: { detectChanges(): void }, ms = 0) => {
      TestBed.tick();
      vi.advanceTimersByTime(ms);
      fixture.detectChanges();
    };

    it('shows progress, locks the form and explains what is happening', () => {
      const { el, apply, text } = startApplying();
      const form = el.querySelector('form')!;

      expect(el.querySelector('[role="progressbar"]')?.getAttribute('aria-label')).toBe(
        'Applying settings',
      );
      expect(form.getAttribute('aria-busy')).toBe('true');
      expect(el.querySelector('fieldset')!.disabled).toBe(true);
      expect(text(apply())).toBe('Applying…');
      expect(apply().getAttribute('aria-disabled')).toBe('true');
      expect(text(el.querySelector('.actions__note'))).toBe(
        'Applying settings: starting a new run…',
      );
      expect(text(el.querySelector('#apply-tooltip'))).toBe('Starting the new run…');
    });

    it('keeps keyboard focus on Apply and locks Reset', () => {
      const page = setup();
      const field = page.input('instrumentCount');
      field.value = '20';
      field.dispatchEvent(new Event('input'));
      page.fixture.detectChanges();
      page.apply().focus();
      page.apply().click();
      page.fixture.detectChanges();

      // `:disabled` also covers a disabled parent fieldset, unlike the `disabled` property.
      expect(page.apply().matches(':disabled')).toBe(false);
      expect(document.activeElement).toBe(page.apply());
      expect(page.reset().matches(':disabled')).toBe(true);
    });

    it('stays until the worker confirms the new run', () => {
      const { el, fixture } = startApplying();
      render(fixture, 5_000);
      expect(el.querySelector('[role="progressbar"]')).not.toBeNull();
    });

    it('ends with a toast and a highlighted active run', () => {
      const { el, fixture, worker, apply, text } = startApplying();
      worker().emit({ type: 'status', status: 'running' });
      render(fixture, MIN_APPLYING_MS);

      expect(el.querySelector('[role="progressbar"]')).toBeNull();
      expect(el.querySelector('fieldset')!.disabled).toBe(false);
      expect(text(apply())).toBe('Apply');
      expect(el.querySelector('.help__item')!.classList).toContain('help__item--fresh');
      expect(
        TestBed.inject(Notifications)
          .toasts()
          .map((t) => t.title),
      ).toEqual(['Settings applied']);
    });
  });
});
