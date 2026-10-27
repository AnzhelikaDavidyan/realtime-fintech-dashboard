import {
  DestroyRef,
  effect,
  inject,
  Injectable,
  LOCALE_ID,
  signal,
  untracked,
} from '@angular/core';

import { ProducerSettings } from '../../core/producer-settings';
import { ProducerService, RunOutcome } from '../../state/producer.service';
import { Notifications } from '../../ui/toast/notifications';
import { describeRun } from './settings-form';

/** Progress stays up at least this long, so a fast apply doesn't just flicker. */
export const MIN_APPLYING_MS = 400;

/** How long the "Active run" card stays highlighted after a successful apply. */
export const JUST_APPLIED_MS = 2_000;

const TOAST_GROUP = 'apply';

/**
 * Applies settings and tells the person how it went: `applying` while the new
 * run starts, then a toast saying it started (or why it didn't).
 *
 * Provided in root rather than by the Settings page, so the toast still
 * appears if the person leaves the page while the run is starting.
 */
@Injectable({ providedIn: 'root' })
export class SettingsApply {
  private readonly producer = inject(ProducerService);
  private readonly notifications = inject(Notifications);
  private readonly locale = inject(LOCALE_ID);

  /** The run being waited for, and when the wait began. */
  private readonly pending = signal<{ runId: number; startedAt: number } | null>(null);
  private settleTimer: ReturnType<typeof setTimeout> | undefined;
  private highlightTimer: ReturnType<typeof setTimeout> | undefined;

  private readonly _applying = signal(false);
  private readonly _justApplied = signal(false);

  /** True from Apply until the new run has started or failed. */
  readonly applying = this._applying.asReadonly();
  /** True briefly after a run started from Apply, to highlight what changed. */
  readonly justApplied = this._justApplied.asReadonly();

  constructor() {
    // Reacting to the worker's answer only shows a toast and runs timers;
    // no other signal is derived from it here.
    effect(() => {
      const pending = this.pending();
      const outcome = this.producer.runOutcome();
      const runId = this.producer.runId();
      if (!pending || outcome === 'pending') return;
      untracked(() => this.settle(pending, runId === pending.runId ? outcome : 'superseded'));
    });
    inject(DestroyRef).onDestroy(() => {
      clearTimeout(this.settleTimer);
      clearTimeout(this.highlightTimer);
    });
  }

  /** Starts a new run with these settings. Ignored while one is already starting. */
  apply(settings: ProducerSettings): void {
    if (this._applying()) return;
    this.producer.apply(settings);
    this.track();
  }

  /** Restarts the worker and tries the same settings again. */
  retry(): void {
    if (this._applying()) return;
    this.producer.retry();
    this.track();
  }

  private track(): void {
    clearTimeout(this.highlightTimer);
    this._justApplied.set(false);
    this._applying.set(true);
    this.pending.set({ runId: this.producer.runId(), startedAt: Date.now() });
  }

  private settle(
    pending: { runId: number; startedAt: number },
    outcome: Exclude<RunOutcome, 'pending'> | 'superseded',
  ): void {
    this.pending.set(null);
    const wait = Math.max(0, pending.startedAt + MIN_APPLYING_MS - Date.now());
    this.settleTimer = setTimeout(() => {
      this._applying.set(false);
      if (outcome === 'started') {
        this.succeeded(pending.runId);
      } else if (outcome === 'failed') {
        this.failed();
      }
      // `superseded`: another run (e.g. the header's Retry) replaced this one,
      // so there is nothing to report about it.
    }, wait);
  }

  private succeeded(runId: number): void {
    this.notifications.show({
      kind: 'success',
      group: TOAST_GROUP,
      title: 'Settings applied',
      message: `${describeRun(runId, this.producer.activeSettings(), this.locale)} started.`,
      link: { label: 'View dashboard', path: '/dashboard' },
    });
    this._justApplied.set(true);
    this.highlightTimer = setTimeout(() => this._justApplied.set(false), JUST_APPLIED_MS);
  }

  private failed(): void {
    const reason = this.producer.error() ?? 'The market engine did not start the new run.';
    this.notifications.show({
      kind: 'error',
      group: TOAST_GROUP,
      title: 'Couldn’t apply settings',
      message: /[.!?]$/.test(reason) ? reason : `${reason}.`,
      action: { label: 'Retry', run: () => this.retry() },
    });
  }
}
