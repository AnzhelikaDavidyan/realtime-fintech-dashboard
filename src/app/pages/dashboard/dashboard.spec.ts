import { TestBed } from '@angular/core/testing';

import { InstrumentMetrics } from '../../core/instrument-metrics';
import { encodeMetrics } from '../../core/metrics-codec';
import { WorkerEvent } from '../../core/worker-protocol';
import { ProducerService } from '../../state/producer.service';
import {
  FakeProducerWorker,
  provideFakeProducerWorker,
} from '../../state/testing/fake-producer-worker';
import { Dashboard } from './dashboard';

const metrics = (instrument: number, over: Partial<InstrumentMetrics> = {}): InstrumentMetrics => ({
  instrument,
  bid: 10_196,
  ask: 10_200,
  bidQty: 60,
  askQty: 40,
  spread: 4,
  imbalance: 0.2,
  lastPrice: 10_200,
  volume: 12_480,
  vwap: 10_187,
  ...over,
});

function setup() {
  const workers: FakeProducerWorker[] = [];
  TestBed.configureTestingModule({ providers: [provideFakeProducerWorker(workers)] });
  const fixture = TestBed.createComponent(Dashboard);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const producer = TestBed.inject(ProducerService);
  const worker = () => workers.at(-1)!;

  async function emit(...events: WorkerEvent[]) {
    for (const event of events) worker().emit(event);
    await fixture.whenStable();
  }
  const snapshot = (rows: InstrumentMetrics[], totalUpdates = 56_000): WorkerEvent => ({
    type: 'snapshot',
    runId: producer.runId(),
    metrics: encodeMetrics(rows),
    totalUpdates,
    timestamp: 0,
  });
  /** Text as a screen reader announces it: aria-hidden parts (icons, dashes, avatars) are skipped. */
  const text = (node: Element | null) => {
    if (!node) return '';
    const clone = node.cloneNode(true) as Element;
    clone.querySelectorAll('[aria-hidden="true"]').forEach((hidden) => hidden.remove());
    return clone.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  };
  const banner = () => el.querySelector('.banner');
  const retryButton = () => el.querySelector<HTMLButtonElement>('.banner__action');
  const stat = (label: string) =>
    text(
      [...el.querySelectorAll('.stat')]
        .find((s) => text(s.querySelector('.stat__label')) === label)
        ?.querySelector('.stat__value') ?? null,
    );
  const bodyRows = () => [...el.querySelectorAll('tbody tr')];
  const cells = (row: Element) => [...row.querySelectorAll('th, td')].map(text);
  return {
    fixture,
    el,
    producer,
    workers,
    emit,
    snapshot,
    banner,
    retryButton,
    stat,
    bodyRows,
    cells,
    text,
  };
}

describe('Dashboard', () => {
  describe('before the first data (loading)', () => {
    it('shows the loading banner and a placeholder row per instrument', () => {
      const { banner, bodyRows, cells, text } = setup();
      expect(text(banner())).toContain('Loading the Wasm generator in the worker');
      expect(banner()?.getAttribute('role')).toBe('status');

      const rows = bodyRows();
      expect(rows).toHaveLength(5);
      // Prices show a dash (announced as "not available"), volume shows 0.
      expect(cells(rows[0])).toEqual([
        'ALFA',
        'not available',
        'not available',
        '0',
        'not available',
        'not available',
      ]);
    });

    it('stays in loading while running until the first snapshot arrives', async () => {
      const { emit, banner, text } = setup();
      await emit({ type: 'status', status: 'running' });
      expect(text(banner())).toContain('Loading the Wasm generator');
    });

    it('shows run information', () => {
      const { stat } = setup();
      expect(stat('Run')).toBe('#1');
      expect(stat('Instruments')).toBe('5');
      expect(stat('Nominal rate')).toBe('200 upd/s');
      expect(stat('Trades this run')).toBe('0');
    });
  });

  describe('running', () => {
    it('fills the table with formatted values and hides the banner', async () => {
      const { producer, emit, snapshot, banner, bodyRows, cells, stat } = setup();
      producer.apply({ instrumentCount: 2 });
      await emit(
        { type: 'status', status: 'running' },
        snapshot([metrics(0), metrics(1, { imbalance: -0.35, lastPrice: 4_831 })]),
      );

      expect(banner()).toBeNull();
      expect(cells(bodyRows()[0])).toEqual([
        'ALFA',
        '$102.00',
        '$0.04',
        '12,480',
        '$101.87',
        '+0.20',
      ]);
      expect(cells(bodyRows()[1])[5]).toBe('\u22120.35');
      expect(stat('Trades this run')).toBe('56,000');
    });

    it('colours imbalance and draws its bar', async () => {
      const { producer, emit, snapshot, el } = setup();
      producer.apply({ instrumentCount: 2 });
      await emit(
        { type: 'status', status: 'running' },
        snapshot([metrics(0, { imbalance: 0.2 }), metrics(1, { imbalance: -0.35 })]),
      );
      const values = el.querySelectorAll('.imbalance__value');
      expect(values[0].classList).toContain('up');
      expect(values[1].classList).toContain('down');
      expect(el.querySelectorAll('app-imbalance-bar')).toHaveLength(2);
    });

    it('shows ▲ when a price rises and ▼ when it falls', async () => {
      const { producer, emit, snapshot, el } = setup();
      producer.apply({ instrumentCount: 2 });
      await emit(
        { type: 'status', status: 'running' },
        snapshot([metrics(0, { lastPrice: 100 }), metrics(1, { lastPrice: 100 })]),
      );
      expect(el.querySelector('.trend')).toBeNull();

      await emit(snapshot([metrics(0, { lastPrice: 101 }), metrics(1, { lastPrice: 99 })]));
      const trends = [...el.querySelectorAll('.trend')].map((t) => t.className);
      expect(trends).toEqual(['trend trend--up', 'trend trend--down']);
      expect(el.querySelectorAll('.visually-hidden')[1]?.textContent).toBe('rising');
    });

    it('reuses the arrow element when a price changes direction', async () => {
      const { producer, emit, snapshot, el } = setup();
      producer.apply({ instrumentCount: 1 });
      await emit({ type: 'status', status: 'running' }, snapshot([metrics(0, { lastPrice: 100 })]));
      await emit(snapshot([metrics(0, { lastPrice: 101 })]));
      const arrow = el.querySelector('.trend');

      await emit(snapshot([metrics(0, { lastPrice: 99 })]));
      expect(el.querySelector('.trend')).toBe(arrow);
      expect(arrow?.className).toBe('trend trend--down');
      expect(arrow?.textContent).toBe('▼');
      expect(el.querySelectorAll('.visually-hidden')[1]?.textContent).toBe('falling');
    });

    it('keeps each symbol in the same row element while values update', async () => {
      const { producer, emit, snapshot, bodyRows } = setup();
      producer.apply({ instrumentCount: 2 });
      await emit({ type: 'status', status: 'running' }, snapshot([metrics(0), metrics(1)]));
      const before = bodyRows();
      await emit(snapshot([metrics(0, { volume: 1 }), metrics(1, { volume: 2 })]));
      expect(bodyRows()).toEqual(before);
    });
  });

  describe('paused', () => {
    it('shows the paused banner and keeps the values', async () => {
      const { producer, emit, snapshot, banner, bodyRows, cells, text } = setup();
      producer.apply({ instrumentCount: 1 });
      await emit({ type: 'status', status: 'running' }, snapshot([metrics(0)]));
      await emit({ type: 'status', status: 'paused' });

      expect(banner()?.classList).toContain('banner--paused');
      expect(text(banner())).toContain('Generation paused.');
      expect(cells(bodyRows()[0])[1]).toBe('$102.00');
    });
  });

  describe('error', () => {
    it('shows the real error from the worker and dashes for run and rate', async () => {
      const { emit, banner, stat, text } = setup();
      await emit({
        type: 'error',
        message: 'Could not download the market engine (/wasm/x.wasm): server answered 404',
      });

      expect(text(banner()?.querySelector('[role="alert"]') ?? null)).toBe(
        'Producer failed to start. Could not download the market engine (/wasm/x.wasm): ' +
          'server answered 404. Retry starts a fresh market engine with the same settings.',
      );
      expect(stat('Run')).toBe('—');
      expect(stat('Nominal rate')).toBe('—');
      expect(stat('Instruments')).toBe('5');
    });

    it('does not add a second full stop', async () => {
      const { emit, banner, text } = setup();
      await emit({ type: 'error', message: 'Worker crashed.' });
      expect(text(banner())).toContain('Worker crashed. Retry starts');
    });

    it('shows why the run could not start instead of loading forever', async () => {
      const { emit, banner, text } = setup();
      await emit({ type: 'error', message: 'Generator rejected the seed', command: 'start' });
      expect(text(banner())).toContain('Producer failed to start. Generator rejected the seed.');
    });

    it('retries with a new worker and moves focus to the heading', async () => {
      const { fixture, emit, workers, banner, retryButton, text } = setup();
      await emit({ type: 'error', message: 'Could not download the market engine' });
      expect(text(retryButton())).toBe('Retry');

      retryButton()!.focus();
      retryButton()!.click();
      await fixture.whenStable();

      expect(workers).toHaveLength(2);
      expect(workers[0].terminated).toBe(true);
      expect(text(banner())).toContain('Loading the Wasm generator');
      expect(document.activeElement?.tagName).toBe('H1');
    });

    it('shows the error again when the retry fails too', async () => {
      const { fixture, emit, banner, retryButton, text } = setup();
      await emit({ type: 'error', message: 'Could not download the market engine' });
      retryButton()!.click();
      await fixture.whenStable();

      await emit({ type: 'error', message: 'Still offline' });

      expect(text(banner())).toContain('Producer failed to start. Still offline.');
      expect(retryButton()).not.toBeNull();
    });

    it('says the producer stopped when a run ends with an error', async () => {
      const { emit, banner, text } = setup();
      await emit(
        { type: 'error', message: 'wasm trapped' },
        { type: 'status', status: 'finished' },
      );
      expect(text(banner())).toContain('Producer stopped. wasm trapped');
    });
  });

  it('shows one row per instrument of the active settings, named by symbol', async () => {
    const { producer, fixture, bodyRows, text } = setup();
    producer.apply({ instrumentCount: 3 });
    await fixture.whenStable();
    expect(bodyRows().map((r) => text(r.querySelector('th')))).toEqual(['ALFA', 'BETA', 'GAMA']);
  });
});
