import { TestBed } from '@angular/core/testing';

import { WorkerEvent } from '../../core/worker-protocol';
import {
  FakeProducerWorker,
  provideFakeProducerWorker,
} from '../../state/testing/fake-producer-worker';
import { ProducerControls } from './producer-controls';

function setup() {
  const workers: FakeProducerWorker[] = [];
  TestBed.configureTestingModule({ providers: [provideFakeProducerWorker(workers)] });
  const fixture = TestBed.createComponent(ProducerControls);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const worker = () => workers.at(-1)!;

  async function emit(event: WorkerEvent) {
    worker().emit(event);
    await fixture.whenStable();
  }
  const status = () => el.querySelector('[role="status"]') as HTMLElement;
  const button = () => el.querySelector('button') as HTMLButtonElement;
  const text = (node: HTMLElement) => node.textContent?.replace(/\s+/g, ' ').trim();
  /** Commands sent after the default run started (init + start). */
  const sent = () => worker().sent.slice(2);
  return { fixture, workers, worker, emit, status, button, text, sent };
}

describe('ProducerControls', () => {
  it('shows "Starting producer…" with a Pause button while the worker loads', () => {
    const { status, button, text } = setup();
    expect(text(status())).toBe('Starting producer…');
    expect(status().className).toContain('status--starting');
    expect(text(button())).toBe('❚❚ Pause');
  });

  it('shows the nominal rate while running and pauses on click', async () => {
    const { emit, status, button, text, sent } = setup();
    await emit({ type: 'status', status: 'running' });
    expect(text(status())).toBe('Running · 200 upd/s');
    expect(status().querySelector('img')?.getAttribute('src')).toBe('icons/status-running.svg');

    button().click();
    expect(sent()).toEqual([{ type: 'pause' }]);
  });

  it('offers Resume while paused', async () => {
    const { emit, status, button, text, sent } = setup();
    await emit({ type: 'status', status: 'paused' });
    expect(text(status())).toBe('Paused');
    expect(text(button())).toBe('▶ Resume');
    expect(button().className).toContain('action--resume');

    button().click();
    expect(sent()).toEqual([{ type: 'resume' }]);
  });

  it('offers Retry after an error, which replaces the worker', async () => {
    const { emit, status, button, text, workers } = setup();
    await emit({ type: 'error', message: 'Could not download the market engine' });
    expect(text(status())).toBe('Error');
    expect(text(button())).toBe('↻ Retry');

    button().click();
    expect(workers).toHaveLength(2);
    expect(workers[0].terminated).toBe(true);
  });

  it('treats a run that ended as an error with Retry', async () => {
    const { emit, status, button, text } = setup();
    // Runs only finish on their own after a failure (e.g. Wasm trapped), so it shows as an error.
    await emit({ type: 'status', status: 'finished' });
    expect(text(status())).toBe('Error');
    expect(text(button())).toBe('↻ Retry');
  });

  it('gives the button a clean accessible name (the glyph is hidden)', async () => {
    const { button } = setup();
    expect(button().querySelector('[aria-hidden="true"]')?.textContent).toBe('❚❚');
  });
});
