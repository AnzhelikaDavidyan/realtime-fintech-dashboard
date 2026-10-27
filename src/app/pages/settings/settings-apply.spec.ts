import { TestBed } from '@angular/core/testing';

import { DEFAULT_PRODUCER_SETTINGS } from '../../core/producer-settings';
import { ProducerService } from '../../state/producer.service';
import {
  FakeProducerWorker,
  provideFakeProducerWorker,
} from '../../state/testing/fake-producer-worker';
import { Notifications } from '../../ui/toast/notifications';
import { JUST_APPLIED_MS, MIN_APPLYING_MS, SettingsApply } from './settings-apply';

const edited = { ...DEFAULT_PRODUCER_SETTINGS, instrumentCount: 20, updatesPerBatch: 1000 };

function setup() {
  const workers: FakeProducerWorker[] = [];
  TestBed.configureTestingModule({ providers: [provideFakeProducerWorker(workers)] });
  const service = TestBed.inject(SettingsApply);
  const producer = TestBed.inject(ProducerService);
  const notifications = TestBed.inject(Notifications);
  const worker = () => workers.at(-1)!;
  /** Lets effects see the latest worker events, then moves the clock on. */
  const wait = (ms: number) => {
    TestBed.tick();
    vi.advanceTimersByTime(ms);
  };
  const toasts = () =>
    notifications.toasts().map(({ kind, title, message }) => ({ kind, title, message }));
  return { service, producer, notifications, workers, worker, wait, toasts };
}

describe('SettingsApply', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('is applying until the new run has started and the minimum time has passed', () => {
    const { service, worker, wait } = setup();
    service.apply(edited);
    expect(service.applying()).toBe(true);

    worker().emit({ type: 'status', status: 'running' });
    wait(MIN_APPLYING_MS - 1);
    expect(service.applying()).toBe(true);
    wait(1);
    expect(service.applying()).toBe(false);
  });

  it('does not wait any longer when the run takes longer than the minimum to start', () => {
    const { service, worker, wait } = setup();
    service.apply(edited);
    wait(MIN_APPLYING_MS * 3);
    expect(service.applying()).toBe(true);

    worker().emit({ type: 'status', status: 'running' });
    wait(0);
    expect(service.applying()).toBe(false);
  });

  it('stays applying while the worker has not answered', () => {
    const { service, wait } = setup();
    service.apply(edited);
    wait(60_000);
    expect(service.applying()).toBe(true);
  });

  it('announces the started run and highlights it briefly', () => {
    const { service, worker, wait, toasts, notifications } = setup();
    service.apply(edited);
    worker().emit({ type: 'status', status: 'running' });
    wait(MIN_APPLYING_MS);

    expect(toasts()).toEqual([
      {
        kind: 'success',
        title: 'Settings applied',
        message: 'Run #2 · 20 instruments · 1,000 updates every 500 ms started.',
      },
    ]);
    expect(notifications.toasts()[0].link).toEqual({
      label: 'View dashboard',
      path: '/dashboard',
    });
    expect(service.justApplied()).toBe(true);
    wait(JUST_APPLIED_MS);
    expect(service.justApplied()).toBe(false);
  });

  it('shows nothing before the run has started', () => {
    const { service, wait, toasts } = setup();
    service.apply(edited);
    wait(MIN_APPLYING_MS);
    expect(toasts()).toEqual([]);
    expect(service.justApplied()).toBe(false);
  });

  it('explains why the run could not start', () => {
    const { service, worker, wait, toasts } = setup();
    service.apply(edited);
    worker().emit({ type: 'error', message: 'Generator rejected the settings', command: 'start' });
    wait(MIN_APPLYING_MS);

    expect(service.applying()).toBe(false);
    expect(toasts()).toEqual([
      {
        kind: 'error',
        title: 'Couldn’t apply settings',
        message: 'Generator rejected the settings.',
      },
    ]);
  });

  it('reports a crashed worker without adding a second full stop', () => {
    const { service, worker, wait, toasts } = setup();
    service.apply(edited);
    worker().crash('The worker stopped.');
    wait(MIN_APPLYING_MS);
    expect(toasts()[0].message).toBe('The worker stopped.');
  });

  it('retries from the error toast with a fresh worker, then replaces the toast', () => {
    const { service, producer, workers, worker, wait, toasts, notifications } = setup();
    service.apply(edited);
    worker().crash('Script error');
    wait(MIN_APPLYING_MS);

    notifications.toasts()[0].action!.run();
    expect(workers).toHaveLength(2);
    expect(worker().sent).toEqual([
      { type: 'init', settings: edited },
      { type: 'start', runId: 3 },
    ]);
    expect(service.applying()).toBe(true);

    worker().emit({ type: 'status', status: 'running' });
    wait(MIN_APPLYING_MS);
    expect(producer.runId()).toBe(3);
    expect(toasts().map((t) => t.kind)).toEqual(['success']);
  });

  it('applies on a fresh worker after the producer failed, instead of waiting forever', () => {
    const { service, workers, worker, wait, toasts } = setup();
    workers[0].crash('Script error');

    service.apply(edited);
    expect(workers).toHaveLength(2);
    worker().emit({ type: 'status', status: 'running' });
    wait(MIN_APPLYING_MS);

    expect(service.applying()).toBe(false);
    expect(toasts().map((t) => t.title)).toEqual(['Settings applied']);
  });

  it('ignores Apply while a run is still starting', () => {
    const { service, worker } = setup();
    service.apply(edited);
    service.apply({ ...edited, instrumentCount: 7 });
    expect(worker().sent.slice(2)).toEqual([
      { type: 'init', settings: edited },
      { type: 'start', runId: 2 },
    ]);
  });

  it('reports nothing when another run replaced the one it was waiting for', () => {
    const { service, producer, worker, wait, toasts } = setup();
    service.apply(edited);
    producer.retry(); // e.g. the Retry button in the header
    worker().emit({ type: 'status', status: 'running' });
    wait(MIN_APPLYING_MS);

    expect(service.applying()).toBe(false);
    expect(toasts()).toEqual([]);
  });
});
